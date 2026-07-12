-- Roadmap 13: the trusted write path for Achilles readiness check-ins (docs/06 §6.2).
--
-- This is the repository's first SECURITY DEFINER function, and the choice is
-- deliberate. readiness_checkins is granted only SELECT and DELETE to the
-- authenticated role (see 20260711090500) — never INSERT. That gap is intentional:
-- docs/06 §6.1 requires that the classification (green / amber / red) be produced by
-- the versioned rules, and the backend must never trust a classification chosen on
-- the client. If the client could insert directly it could write any classification
-- it liked — for example downgrading a red result so a session it should not start
-- becomes startable.
--
-- So the client never inserts a readiness row. It calls this function with the raw
-- answers ONLY. The function captures auth.uid() itself, RE-COMPUTES the
-- classification from those raw answers inside the database (a faithful SQL port of
-- domain/training/readinessClassification.ts — same thresholds, same red-over-amber-
-- over-green precedence), and inserts the row with that server-computed
-- classification, rule_version and trigger_reasons. There is no classification
-- parameter, so a caller has no way to supply or override one. Running as SECURITY
-- DEFINER lets the insert proceed despite the missing INSERT grant, while the
-- explicit auth.uid() check and the user_id = auth.uid() write keep every row
-- owner-scoped exactly as row-level security would.
--
-- Hardening, following seed_private_plan: set search_path = '' and schema-qualify
-- every reference so the definer privileges cannot be redirected through a mutable
-- search_path, and the function is granted to authenticated only, never anon.
--
-- One schema addition: a nullable session_effort column for the S-015 post-session
-- check (docs/03). The pre-session (S-011) and next-morning checks do not set it.
-- Reconciling this with the still-unused workout_logs.session_effort (the roadmap 11
-- seam) is left for a later step; here the post-session self-report is recorded on
-- the check-in itself.
--
-- Note on the unclassifiable case: readiness_checkins.classification is a NOT NULL
-- enum of green / amber / red only, so an "unclassifiable" result is never stored.
-- The pure classifier returns unclassifiable for missing answers so the form can
-- block submission and roadmap 14 can render it; the RPC instead REJECTS invalid or
-- missing raw answers with an exception. A row is only ever written for a real,
-- server-computed classification.

alter table public.readiness_checkins
  add column if not exists session_effort integer
    check (session_effort is null or session_effort between 1 and 10);

comment on column public.readiness_checkins.session_effort is
  'Self-reported session effort (1-10) for a post-session (S-015) check. Null for pre-session and next-morning checks. Reconciliation with workout_logs.session_effort (roadmap 11 seam) is deferred.';

create or replace function public.submit_readiness_checkin(
  p_checkin_type public.checkin_type,
  p_pain_score integer,
  p_stiffness_change text,
  p_swelling_level text,
  p_walking_status text,
  p_sudden_change boolean,
  p_confidence_score integer,
  p_scheduled_session_id uuid default null,
  p_session_effort integer default null,
  p_notes text default null,
  -- Optional context inputs (docs/06 §6.2 seams). Default false = "unknown", which
  -- can never change the classification on its own — mirroring the TS classifier.
  p_previous_next_morning_increase boolean default false,
  p_cannot_bear_weight boolean default false
)
returns table (
  id uuid,
  classification public.readiness_classification,
  rule_version text,
  trigger_reasons jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_rule_version text := 'readiness/v1';
  v_classification public.readiness_classification;
  v_reasons jsonb := '[]'::jsonb;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'submit_readiness_checkin requires an authenticated user'
      using errcode = '28000';
  end if;

  -- Validate the raw answers. Missing or out-of-range values are rejected rather
  -- than stored: an unclassifiable result is never persisted (see the header note).
  if p_pain_score is null or p_pain_score < 0 or p_pain_score > 10 then
    raise exception 'pain score must be between 0 and 10' using errcode = '22003';
  end if;
  if p_stiffness_change is null
     or p_stiffness_change not in ('better', 'same', 'worse') then
    raise exception 'stiffness change must be better, same or worse'
      using errcode = '22023';
  end if;
  if p_swelling_level is null
     or p_swelling_level not in ('none', 'mild', 'significant') then
    raise exception 'swelling level must be none, mild or significant'
      using errcode = '22023';
  end if;
  if p_walking_status is null
     or p_walking_status not in ('normal', 'altered') then
    raise exception 'walking status must be normal or altered'
      using errcode = '22023';
  end if;
  if p_sudden_change is null then
    raise exception 'sudden change must be answered' using errcode = '22004';
  end if;
  if p_confidence_score is null
     or p_confidence_score < 1 or p_confidence_score > 5 then
    raise exception 'confidence score must be between 1 and 5'
      using errcode = '22003';
  end if;
  if p_session_effort is not null
     and (p_session_effort < 1 or p_session_effort > 10) then
    raise exception 'session effort must be between 1 and 10'
      using errcode = '22003';
  end if;

  -- Compute the classification and reasons. This is a faithful port of
  -- domain/training/readinessClassification.ts: red first (any trigger), then amber
  -- (any trigger), else green. Precedence is red over amber over green (docs/06 §6.2).

  -- Red triggers.
  if coalesce(p_sudden_change, false) then
    v_reasons := v_reasons || jsonb_build_object(
      'code', 'sudden-change',
      'message', 'You reported a sudden new change, such as pulling, popping or a sharp increase. This needs attention before any session.');
  end if;
  if p_walking_status = 'altered' and p_pain_score >= 4 then
    v_reasons := v_reasons || jsonb_build_object(
      'code', 'altered-walking-with-pain',
      'message', 'Your walking feels altered and your pain is at a level where it is best not to load the leg today.');
  end if;
  if p_swelling_level = 'significant' then
    v_reasons := v_reasons || jsonb_build_object(
      'code', 'significant-swelling',
      'message', 'You reported significant new swelling, so it is best not to start this session.');
  end if;
  if p_pain_score >= 6 then
    v_reasons := v_reasons || jsonb_build_object(
      'code', 'high-pain',
      'message', 'Your pain is high enough that it is best not to start this session today.');
  end if;
  if coalesce(p_cannot_bear_weight, false) then
    v_reasons := v_reasons || jsonb_build_object(
      'code', 'cannot-bear-weight',
      'message', 'You said you cannot load the leg normally, so this session should not go ahead today.');
  end if;

  if jsonb_array_length(v_reasons) > 0 then
    v_classification := 'red';
  else
    -- Amber triggers (only when no red trigger fired).
    if p_pain_score >= 3 and p_pain_score <= 5 then
      v_reasons := v_reasons || jsonb_build_object(
        'code', 'moderate-pain',
        'message', 'Your pain is in a moderate range, so a gentler option is the sensible choice today.');
    end if;
    if p_stiffness_change = 'worse' then
      v_reasons := v_reasons || jsonb_build_object(
        'code', 'worse-stiffness',
        'message', 'Your morning stiffness is worse than usual, so ease off rather than pushing today.');
    end if;
    if p_swelling_level = 'mild' then
      v_reasons := v_reasons || jsonb_build_object(
        'code', 'mild-swelling',
        'message', 'You reported mild new swelling, so a lighter, lower-impact option is wise today.');
    end if;
    if p_walking_status = 'altered' then
      v_reasons := v_reasons || jsonb_build_object(
        'code', 'altered-walking',
        'message', 'Your walking feels a little off, so choose a gentler option rather than a demanding session today.');
    end if;
    if p_confidence_score <= 2 then
      v_reasons := v_reasons || jsonb_build_object(
        'code', 'low-confidence',
        'message', 'You are not feeling very confident today, so a gentler option is the sensible choice.');
    end if;
    if coalesce(p_previous_next_morning_increase, false) then
      v_reasons := v_reasons || jsonb_build_object(
        'code', 'previous-next-morning-increase',
        'message', 'Your last run left the tendon more sore the next morning, so hold the running week and keep things gentle.');
    end if;

    if jsonb_array_length(v_reasons) > 0 then
      v_classification := 'amber';
    else
      v_classification := 'green';
      v_reasons := v_reasons || jsonb_build_object(
        'code', 'all-clear',
        'message', 'Your pain is low, your walking is normal and there is no sudden change or significant swelling, so you can go ahead.');
    end if;
  end if;

  insert into public.readiness_checkins (
    user_id,
    scheduled_session_id,
    checkin_type,
    pain_score,
    stiffness_change,
    swelling_level,
    walking_status,
    sudden_change,
    confidence_score,
    classification,
    rule_version,
    trigger_reasons,
    session_effort,
    notes
  ) values (
    v_user_id,
    p_scheduled_session_id,
    p_checkin_type,
    p_pain_score,
    p_stiffness_change,
    p_swelling_level,
    p_walking_status,
    p_sudden_change,
    p_confidence_score,
    v_classification,
    v_rule_version,
    v_reasons,
    p_session_effort,
    p_notes
  )
  returning readiness_checkins.id into v_id;

  return query
    select v_id, v_classification, v_rule_version, v_reasons;
end;
$$;

-- Only signed-in users may submit a check-in, and never the anonymous role. The
-- table itself still has no INSERT grant; this definer function is the sole writer.
revoke all on function public.submit_readiness_checkin(
  public.checkin_type, integer, text, text, text, boolean, integer, uuid, integer, text, boolean, boolean
) from public, anon;
grant execute on function public.submit_readiness_checkin(
  public.checkin_type, integer, text, text, text, boolean, integer, uuid, integer, text, boolean, boolean
) to authenticated;
