-- Initial, forward-only migration. Immutable after deployment.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'session_status' and typnamespace = 'public'::regnamespace) then
    create type public.session_status as enum ('planned', 'in_progress', 'completed', 'skipped', 'replaced', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'readiness_classification' and typnamespace = 'public'::regnamespace) then
    create type public.readiness_classification as enum ('green', 'amber', 'red');
  end if;

  if not exists (select 1 from pg_type where typname = 'checkin_type' and typnamespace = 'public'::regnamespace) then
    create type public.checkin_type as enum ('pre_session', 'post_session', 'next_morning');
  end if;

  if not exists (select 1 from pg_type where typname = 'measurement_type' and typnamespace = 'public'::regnamespace) then
    create type public.measurement_type as enum ('weight', 'waist');
  end if;
end
$$;
