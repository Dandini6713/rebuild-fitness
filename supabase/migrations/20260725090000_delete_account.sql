-- Roadmap 25: the trusted, server-enforced path for permanent account deletion
-- (docs/04 §4.2 "server authority for account export and deletion", docs/05 §5.11,
-- docs/07 §7.7/§7.8, docs/03 S-053, docs/10 §10.3 "account deletion removes database
-- rows and storage files").
--
-- Deletion is IRREVERSIBLE and removes every user-owned row. The primitive that makes it
-- both complete and safe is already in the schema: all 27 user-owned tables declare
--   user_id uuid ... references auth.users(id) on delete cascade
-- so deleting the caller's auth.users row cascades every one of their rows across every
-- table IN ONE TRANSACTION — nutrition, alcohol, measurements, reviews, proposals, cardio,
-- workouts, readiness, plans and the audit_events themselves (docs/05 §5.11 requires audit
-- records with personal health data to be deleted too, and the cascade satisfies that).
-- There is no per-table delete list to keep in sync and therefore no risk of a table being
-- forgotten and left holding orphaned personal data — the single auth.users delete is the
-- whole deletion.
--
-- Why a SECURITY DEFINER function (not a client delete, not an Edge Function). The
-- authenticated role has no delete grant on auth.users, and it must not — that would let a
-- client delete arbitrary users. So, exactly as start_scheduled_session and
-- submit_readiness_checkin do for their trusted writes, the privileged step lives in a
-- definer function that captures auth.uid() itself and deletes ONLY that row. The client
-- can name no other user. No Edge Function is introduced (none exist in this repo); the
-- definer RPC is consistent with every other trusted server-authority path here.
--
-- STORAGE OBJECTS (docs/05 §5.11, docs/07 §7.9 "remove storage objects when database records
-- are deleted"). Removing a user's files is deliberately NOT done here, and this is the
-- documented choice the roadmap-25 brief asked to record:
--   * Deleting a row from storage.objects via SQL does not remove the underlying object from
--     the storage backend — only the Storage API does. A SQL-only cascade would orphan the
--     actual files while looking complete.
--   * So storage removal is performed in the CLIENT deletion flow (features/account), using
--     the AUTHENTICATED Storage API scoped to the caller's own prefix, BEFORE this RPC is
--     called (after which the session is gone and storage is unreachable). See
--     accountRepository.clearOwnStorage.
--   * Progress photographs (docs/05 §5.8) were specced but NEVER BUILT — there is no
--     progress_photos table and no storage bucket in the schema after 24 roadmaps. So the
--     storage clear is a correct NO-OP today and becomes real the moment a private
--     progress-photos bucket lands, with no change needed to this function. This is a
--     declared roadmap gap, recorded in CLAUDE.md, not a silently ignored requirement.
--
-- RATE LIMITING (docs/07 §7.8 "rate-limit ... export"). There is no server function to
-- enforce an export/deletion rate limit on yet; when one is added it belongs at this trusted
-- boundary (a definer guard here, or an Edge Function / gateway rule). Flagged as a seam.
--
-- Hardening, following start_scheduled_session / submit_readiness_checkin: set search_path
-- = '' and schema-qualify every reference, and grant execute to authenticated only, never
-- anon or public. The client flow additionally requires a FRESH re-authentication
-- immediately before calling this (docs/07 §7.8 "require recent authentication before
-- account deletion"); that recent-auth gate lives in the client flow, since the RPC has no
-- session freshness of its own to check.

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'delete_account requires an authenticated user'
      using errcode = '28000';
  end if;

  -- The single, complete deletion: removing the caller's auth.users row cascades every
  -- user-owned table (all reference auth.users(id) on delete cascade). Only the caller's
  -- own row is ever named, so no other user's data can be reached.
  delete from auth.users where id = v_user_id;
end;
$$;

-- Only signed-in users may delete their own account, and never the anonymous or public role.
revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
