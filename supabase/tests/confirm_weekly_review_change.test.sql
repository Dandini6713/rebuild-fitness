begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

-- Two users, so owner isolation can be checked.
insert into auth.users (id, email)
values
  ('77777777-7777-4777-8777-777777777777', 'review-user@example.invalid'),
  ('88888888-8888-4888-8888-888888888888', 'other-user@example.invalid');

-- A prior calorie target for the first user, so an accepted change carries protein from it
-- (150 g) and the new row is a NEW effective-dated row rather than an edit.
insert into public.nutrition_targets (user_id, effective_from, calories, protein_g, source)
values ('77777777-7777-4777-8777-777777777777', current_date - 30, 2000, 150, 'user');

-- Two running proposals for the first user (light FKs vs strength). One will be accepted,
-- one dismissed, through the review confirm path.
insert into public.running_progression_proposals
  (id, user_id, from_stage_number, to_stage_number, decision, rule_version, status)
values
  ('e0000000-0000-4000-8000-0000000000e1', '77777777-7777-4777-8777-777777777777',
   3, 4, 'advance', 'running-progression/v1', 'proposed'),
  ('e0000000-0000-4000-8000-0000000000e2', '77777777-7777-4777-8777-777777777777',
   3, 4, 'advance', 'running-progression/v1', 'proposed');

-- A stored weekly review for the first user with three recommendations: an actionable
-- calorie proposal (carrying its concrete change), and the two running proposals.
insert into public.weekly_reviews
  (id, user_id, period_start, period_end, metrics, recommendations, rule_version)
values (
  'd0000000-0000-4000-8000-0000000000d1',
  '77777777-7777-4777-8777-777777777777',
  current_date - 6,
  current_date,
  '{}'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'source', 'calorie', 'decision', 'propose-reduction', 'actionable', true,
      'status', 'proposed', 'summary', 'Suggested reduction.',
      'reasons', jsonb_build_array(),
      'evidence', jsonb_build_object('adherencePercent', 90),
      'ruleVersion', 'calorie-adjustment/v1',
      'change', jsonb_build_object(
        'proposedTargetCalories', 1900, 'deltaKcal', -100,
        'professionalReviewRequired', false)
    ),
    jsonb_build_object(
      'source', 'running', 'decision', 'advance', 'actionable', true,
      'status', 'proposed', 'summary', 'Move up to stage 4.',
      'reasons', jsonb_build_array(),
      'evidence', jsonb_build_object('fromStage', 3),
      'ruleVersion', 'running-progression/v1',
      'proposalId', 'e0000000-0000-4000-8000-0000000000e1'
    ),
    jsonb_build_object(
      'source', 'running', 'decision', 'advance', 'actionable', true,
      'status', 'proposed', 'summary', 'Move up to stage 4.',
      'reasons', jsonb_build_array(),
      'evidence', jsonb_build_object('fromStage', 3),
      'ruleVersion', 'running-progression/v1',
      'proposalId', 'e0000000-0000-4000-8000-0000000000e2'
    )
  ),
  'weekly-review/v1'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777777', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- === Accept the calorie change ==============================================
create temporary table cal_result as
select public.confirm_weekly_review_change(
  'd0000000-0000-4000-8000-0000000000d1', 'calorie', 'accepted', current_date, null
) as payload;

select isnt(
  (select payload->>'appliedTargetId' from cal_result),
  null,
  'accepting a calorie change returns the new target id'
);

-- Exactly one NEW effective-dated target row is inserted (source weekly-review), the old
-- one untouched (insert-not-overwrite).
select is(
  (select count(*)::integer from public.nutrition_targets
   where user_id = '77777777-7777-4777-8777-777777777777' and source = 'weekly-review'),
  1,
  'accepting inserts exactly one new effective-dated target row'
);
select is(
  (select calories from public.nutrition_targets
   where user_id = '77777777-7777-4777-8777-777777777777' and source = 'weekly-review'),
  1900,
  'the new target uses the proposed calories from the stored review'
);
select is(
  (select protein_g from public.nutrition_targets
   where user_id = '77777777-7777-4777-8777-777777777777' and source = 'weekly-review'),
  150::numeric,
  'the new target carries protein from the current target'
);

-- One audit event recording the acceptance, with the rule version stored (docs/06 §6.10).
select is(
  (select count(*)::integer from public.audit_events
   where user_id = '77777777-7777-4777-8777-777777777777'
     and event_type = 'weekly_review_change_accepted'),
  1,
  'accepting writes exactly one audit event'
);
select is(
  (select details->>'ruleVersion' from public.audit_events
   where user_id = '77777777-7777-4777-8777-777777777777'
     and event_type = 'weekly_review_change_accepted'
     and entity_type = 'nutrition_target'),
  'calorie-adjustment/v1',
  'the audit event stores the decision rule version'
);

-- The review is marked reviewed and the calorie recommendation is now accepted.
select isnt(
  (select reviewed_at from public.weekly_reviews where id = 'd0000000-0000-4000-8000-0000000000d1'),
  null,
  'the review is stamped reviewed'
);
select is(
  (select rec->>'status'
     from public.weekly_reviews, jsonb_array_elements(recommendations) rec
    where id = 'd0000000-0000-4000-8000-0000000000d1' and rec->>'source' = 'calorie'),
  'accepted',
  'the calorie recommendation status becomes accepted'
);
select is(
  (select jsonb_array_length(accepted_changes) from public.weekly_reviews
    where id = 'd0000000-0000-4000-8000-0000000000d1'),
  1,
  'one accepted-changes entry is recorded'
);

-- === Accept a running proposal ==============================================
select public.confirm_weekly_review_change(
  'd0000000-0000-4000-8000-0000000000d1', 'running', 'accepted', null,
  'e0000000-0000-4000-8000-0000000000e1'
);
select is(
  (select status from public.running_progression_proposals
    where id = 'e0000000-0000-4000-8000-0000000000e1'),
  'accepted',
  'accepting a running recommendation marks its proposal accepted'
);
select is(
  (select rec->>'status'
     from public.weekly_reviews, jsonb_array_elements(recommendations) rec
    where id = 'd0000000-0000-4000-8000-0000000000d1'
      and rec->>'proposalId' = 'e0000000-0000-4000-8000-0000000000e1'),
  'accepted',
  'the running recommendation status becomes accepted'
);

-- === Atomicity: re-confirming an already-decided recommendation fails and writes nothing =
select throws_like(
  $$ select public.confirm_weekly_review_change(
       'd0000000-0000-4000-8000-0000000000d1', 'calorie', 'accepted', current_date, null) $$,
  '%already been decided%',
  're-confirming a decided recommendation fails cleanly'
);
select is(
  (select count(*)::integer from public.nutrition_targets
   where user_id = '77777777-7777-4777-8777-777777777777' and source = 'weekly-review'),
  1,
  'a failed re-confirmation leaves no partial state (no second target row)'
);

-- === Dismiss the second running proposal ====================================
select public.confirm_weekly_review_change(
  'd0000000-0000-4000-8000-0000000000d1', 'running', 'dismissed', null,
  'e0000000-0000-4000-8000-0000000000e2'
);
select is(
  (select status from public.running_progression_proposals
    where id = 'e0000000-0000-4000-8000-0000000000e2'),
  'dismissed',
  'dismissing a running recommendation sets its proposal aside'
);
select is(
  (select count(*)::integer from public.audit_events
   where user_id = '77777777-7777-4777-8777-777777777777'
     and event_type = 'weekly_review_change_dismissed'),
  1,
  'a dismissal writes an audit event too'
);

-- === Owner isolation ========================================================
select set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-888888888888', true);
select throws_like(
  $$ select public.confirm_weekly_review_change(
       'd0000000-0000-4000-8000-0000000000d1', 'calorie', 'accepted', current_date, null) $$,
  '%weekly review not found%',
  'a user cannot confirm another user''s review'
);

-- === Anonymous cannot execute ===============================================
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$ select public.confirm_weekly_review_change(
       'd0000000-0000-4000-8000-0000000000d1', 'calorie', 'accepted', current_date, null) $$,
  '42501',
  'permission denied for function confirm_weekly_review_change',
  'anonymous users cannot confirm a review change'
);

select * from finish();
rollback;
