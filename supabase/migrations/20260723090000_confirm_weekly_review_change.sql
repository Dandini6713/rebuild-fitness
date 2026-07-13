-- Roadmap 23: the atomic confirm path for the weekly review (docs/03 S-041, docs/06
-- §6.7/§6.10, docs/10 §10.2 "No change applies without confirmation"; §10.3 "Rule version
-- is stored with classifications and adjustments").
--
-- The weekly review PROPOSES calorie, strength and running changes (roadmap 22). Roadmap 23
-- is the interface that lets the user ACCEPT or DISMISS one, and — the careful part — an
-- accepted change must both (a) apply and (b) record an audit_event, with NEITHER happening
-- before the user's explicit confirm, and never half-succeeding. Confirming one
-- recommendation spans up to three tables:
--
--   * a calorie ACCEPT inserts a NEW effective-dated nutrition_targets row (history is kept,
--     the old row is never edited — the roadmap-19 insert-not-overwrite path);
--   * a strength / running ACCEPT marks the corresponding progression_proposals /
--     running_progression_proposals row 'accepted' (the existing accept path — this roadmap
--     SURFACES and confirms it, it does not re-run the engine; applying a running stage
--     advance to the schedule remains the roadmap-17 seam);
--   * every confirmation stamps the recommendation's per-status onto the weekly_reviews row
--     (recommendations jsonb + accepted_changes) and writes one audit_event.
--
-- Because that spans tables, ATOMICITY needs a single transaction. This is a SECURITY
-- INVOKER function (like substitute_session, NOT a definer like the readiness gates): the
-- user OWNS every row involved, so ordinary row-level security is exactly the right guard
-- and no privilege escalation is needed. The safety-critical decision was already made by
-- the pure calorie engine when the review was assembled; nothing the client passes here can
-- smuggle in an ineligible change, because the applied calorie target is READ FROM THE
-- STORED REVIEW (recommendations -> change -> proposedTargetCalories), not from a client
-- parameter. The client chooses only WHICH recommendation to confirm and the effective date.
--
-- Hardening follows substitute_session / the readiness functions: set search_path = '',
-- schema-qualify every reference, granted to authenticated only, never anon.

create or replace function public.confirm_weekly_review_change(
  p_review_id uuid,
  p_source text,
  p_action text,
  -- The local calendar date a newly-applied calorie target takes effect (client passes its
  -- device-local today, matching every other effective_from write). Required for a calorie
  -- accept; ignored otherwise.
  p_effective_from date default null,
  -- The progression proposal row a strength / running decision applies to. Required for a
  -- strength / running accept; ignored for calorie.
  p_proposal_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_review public.weekly_reviews;
  v_rec jsonb;
  v_rule_version text;
  v_decision text;
  v_evidence jsonb;
  v_new_recs jsonb;
  v_accepted jsonb;
  v_new_target_id uuid;
  v_calories integer;
  v_protein numeric(6, 2);
  v_entity_type text;
  v_entity_id uuid;
  v_event_type text;
begin
  if v_user_id is null then
    raise exception 'confirm_weekly_review_change requires an authenticated user'
      using errcode = '28000';
  end if;
  if p_action is null or p_action not in ('accepted', 'dismissed') then
    raise exception 'action must be accepted or dismissed' using errcode = '22023';
  end if;
  if p_source is null or p_source not in ('calorie', 'strength', 'running') then
    raise exception 'source must be calorie, strength or running' using errcode = '22023';
  end if;

  -- Load and LOCK the caller's own review. As SECURITY INVOKER the select only sees rows
  -- RLS permits, so another user's review is simply not found. FOR UPDATE serialises
  -- concurrent confirmations of the same review.
  select * into v_review
    from public.weekly_reviews
   where id = p_review_id
     and user_id = v_user_id
   for update;
  if not found then
    raise exception 'weekly review not found for this user' using errcode = 'P0002';
  end if;

  -- Find the recommendation this confirmation targets. Calorie is unique by source; a
  -- strength / running recommendation is identified by its proposalId.
  select rec into v_rec
    from jsonb_array_elements(v_review.recommendations) as rec
   where rec->>'source' = p_source
     and (p_source = 'calorie' or rec->>'proposalId' = p_proposal_id::text)
   limit 1;
  if v_rec is null then
    raise exception 'no matching recommendation to confirm' using errcode = 'P0002';
  end if;
  -- Only a still-'proposed' recommendation can be decided; a decided one never re-applies.
  if coalesce(v_rec->>'status', 'none') <> 'proposed' then
    raise exception 'recommendation has already been decided' using errcode = 'P0001';
  end if;

  v_rule_version := v_rec->>'ruleVersion';
  v_decision := v_rec->>'decision';
  v_evidence := coalesce(v_rec->'evidence', '{}'::jsonb);

  if p_action = 'accepted' then
    if p_source = 'calorie' then
      if coalesce((v_rec->>'actionable')::boolean, false) is not true then
        raise exception 'this calorie recommendation is not actionable' using errcode = 'P0001';
      end if;
      if p_effective_from is null then
        raise exception 'a calorie change needs an effective date' using errcode = '22004';
      end if;
      -- The applied target is READ FROM THE STORED REVIEW, never a client parameter.
      v_calories := (v_rec->'change'->>'proposedTargetCalories')::integer;
      if v_calories is null then
        raise exception 'no proposed calorie target to apply' using errcode = '22004';
      end if;
      -- Protein carries from the current effective target (the change is calories only);
      -- fall back to the §6.8 default when the user has no target yet.
      select nutrition_targets.protein_g into v_protein
        from public.nutrition_targets
       where nutrition_targets.user_id = v_user_id
         and nutrition_targets.effective_from <= p_effective_from
       order by nutrition_targets.effective_from desc
       limit 1;
      if v_protein is null then
        v_protein := 140;
      end if;
      insert into public.nutrition_targets (
        user_id, effective_from, calories, protein_g, source
      ) values (
        v_user_id, p_effective_from, v_calories, v_protein, 'weekly-review'
      )
      returning nutrition_targets.id into v_new_target_id;
      v_entity_type := 'nutrition_target';
      v_entity_id := v_new_target_id;
    else
      if p_proposal_id is null then
        raise exception 'a % change needs a proposal id', p_source using errcode = '22004';
      end if;
      if p_source = 'strength' then
        update public.progression_proposals
           set status = 'accepted', decided_at = now()
         where id = p_proposal_id
           and user_id = v_user_id
           and status = 'proposed';
      else
        update public.running_progression_proposals
           set status = 'accepted', decided_at = now()
         where id = p_proposal_id
           and user_id = v_user_id
           and status = 'proposed';
      end if;
      if not found then
        raise exception 'proposal not found or already decided' using errcode = 'P0002';
      end if;
      v_entity_type := p_source || '_proposal';
      v_entity_id := p_proposal_id;
    end if;
  else
    -- Dismissed. For strength / running also set the underlying proposal aside, so a
    -- dismissed review item does not leave a still-'proposed' proposal lingering elsewhere.
    if p_source = 'strength' and p_proposal_id is not null then
      update public.progression_proposals
         set status = 'dismissed', decided_at = now()
       where id = p_proposal_id and user_id = v_user_id and status = 'proposed';
    elsif p_source = 'running' and p_proposal_id is not null then
      update public.running_progression_proposals
         set status = 'dismissed', decided_at = now()
       where id = p_proposal_id and user_id = v_user_id and status = 'proposed';
    end if;
    v_entity_type := case p_source
      when 'calorie' then 'nutrition_target'
      else p_source || '_proposal'
    end;
    v_entity_id := p_proposal_id;
  end if;

  -- Rebuild recommendations with the matched item's status flipped to the decision.
  select coalesce(
           jsonb_agg(
             case
               when rec->>'source' = p_source
                 and (p_source = 'calorie' or rec->>'proposalId' = p_proposal_id::text)
               then jsonb_set(rec, '{status}', to_jsonb(p_action))
               else rec
             end
           ),
           '[]'::jsonb
         )
    into v_new_recs
    from jsonb_array_elements(v_review.recommendations) as rec;

  v_accepted := coalesce(v_review.accepted_changes, '[]'::jsonb)
    || jsonb_build_object(
         'source', p_source,
         'action', p_action,
         'decision', v_decision,
         'ruleVersion', v_rule_version,
         'entityType', v_entity_type,
         'entityId', v_entity_id,
         'appliedTargetId', v_new_target_id,
         'proposalId', p_proposal_id,
         'decidedAt', now()
       );

  update public.weekly_reviews
     set recommendations = v_new_recs,
         accepted_changes = v_accepted,
         reviewed_at = now()
   where id = p_review_id
     and user_id = v_user_id;

  -- The audit event: the decision and its rule version are stored with the evidence
  -- (docs/06 §6.10). One event per confirmation, queryable by (event_type, entity).
  v_event_type := case p_action
    when 'accepted' then 'weekly_review_change_accepted'
    else 'weekly_review_change_dismissed'
  end;
  insert into public.audit_events (
    user_id, event_type, entity_type, entity_id, details
  ) values (
    v_user_id,
    v_event_type,
    v_entity_type,
    v_entity_id,
    jsonb_build_object(
      'reviewId', p_review_id,
      'source', p_source,
      'action', p_action,
      'decision', v_decision,
      'ruleVersion', v_rule_version,
      'evidence', v_evidence,
      'appliedTargetId', v_new_target_id,
      'proposalId', p_proposal_id
    )
  );

  return jsonb_build_object(
    'reviewId', p_review_id,
    'source', p_source,
    'action', p_action,
    'appliedTargetId', v_new_target_id
  );
end;
$$;

-- Only signed-in users may confirm a review change, and never the anonymous role.
revoke all on function public.confirm_weekly_review_change(uuid, text, text, date, uuid)
  from public, anon;
grant execute on function public.confirm_weekly_review_change(uuid, text, text, date, uuid)
  to authenticated;
