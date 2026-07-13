-- Roadmap 20: alcohol tracking (docs/03 S-033, docs/05 §5.7, docs/06 §6.9, docs/07 §7.4).
--
-- alcohol_logs already exists with the right shape and RLS (20260711090300 / 090500,
-- indexed and updated_at-triggered in 090400) and is NOT touched here. This migration
-- adds the two genuinely-missing pieces:
--
--   1. drink_favourites — a reusable drink definition, the `foods` parallel for alcohol.
--      A one-tap favourite → alcohol_logs insert (units computed by the pure domain
--      function at log time, so units are never stored on the favourite — they are
--      derivable from volume × ABV and would only drift). Owner-scoped, RLS matching the
--      existing per-table policies, with the composite (id, user_id) FK convention of the
--      workout/cardio/meal tables even though it currently parents no child table — the
--      convention keeps it consistent and ready for one.
--
--   2. profiles.weekly_alcohol_unit_limit — a per-user personal weekly unit limit, NULLABLE
--      with NO default. Alcohol has no safe number to invent for someone, so the
--      responsible default is to store nothing until the user sets one; the
--      "percentage of personal limit" summary metric (docs/06 §6.9) is simply omitted
--      while it is null, rather than showing a fabricated limit. This is a neutral tracker
--      figure, never a cap or a warning (docs/07 §7.4).
--
-- No trusted RPC: a drink log is data the user owns with no safety rule to violate
-- (unlike readiness's classifier or the red session-start block), so a plain owner-scoped
-- INSERT under RLS is exactly right. Zod validation in the feature layer is the boundary.

-- 1. drink_favourites -----------------------------------------------------------

create table if not exists public.drink_favourites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Mirrors alcohol_logs column names so a favourite maps straight onto a log insert.
  drink_name text not null check (char_length(drink_name) between 1 and 120),
  drink_type text check (drink_type is null or char_length(drink_type) <= 60),
  volume_ml numeric(8, 2) not null check (volume_ml > 0),
  abv_percent numeric(5, 2) not null check (abv_percent between 0 and 100),
  -- User-supplied calories per drink (docs/06 §6.9 invents no calories-from-ABV formula).
  calories integer not null check (calories >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

-- 2. profiles personal weekly unit limit ----------------------------------------

alter table public.profiles
  add column if not exists weekly_alcohol_unit_limit numeric(6, 2)
    check (weekly_alcohol_unit_limit is null or weekly_alcohol_unit_limit >= 0);

-- 3. Index (consistent with 20260711090400: (user_id, <time> desc)) --------------

create index if not exists drink_favourites_user_created_idx
  on public.drink_favourites (user_id, created_at desc);

-- Keep updated_at current, reusing the shared trigger function (20260711090400).
drop trigger if exists set_updated_at on public.drink_favourites;
create trigger set_updated_at before update on public.drink_favourites
  for each row execute function public.set_updated_at();

-- 4. Row-level security (following 20260711090500) -------------------------------

alter table public.drink_favourites enable row level security;
revoke all on table public.drink_favourites from public, anon;

grant select, insert, update, delete on table public.drink_favourites to authenticated;

drop policy if exists "drink favourites owner access" on public.drink_favourites;
create policy "drink favourites owner access" on public.drink_favourites for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
