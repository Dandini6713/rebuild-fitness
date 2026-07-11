# 4. Technical Architecture

## 4.1 Proposed stack

### Client

- React Native with Expo
- TypeScript, strict mode
- Expo Router
- React Hook Form with Zod validation
- TanStack Query for server state
- Zustand or a similarly small store for active-session state
- SQLite or Expo-compatible local persistence for offline workout state
- Native notification APIs through Expo

### Backend

- Supabase PostgreSQL
- Supabase Auth
- Supabase Storage for optional progress photographs and exercise media
- Supabase Edge Functions for trusted calculations, exports and future AI tool execution
- Row-level security on every user-owned table

### Testing

- Vitest or Jest for domain and component tests
- React Native Testing Library
- Maestro or Detox for critical end-to-end flows
- SQL migration tests where practical

## 4.2 Architectural principles

### Domain logic is independent of the interface

Create pure modules for:

- Readiness classification
- Strength progression
- Running progression
- Schedule conflict checking
- Weight trend calculation
- Calorie adjustment eligibility
- Alcohol units
- Weekly adherence

React components call these modules but do not contain the rule logic.

### Local-first active sessions

A workout or cardio session in progress must be written locally after every meaningful action. Network synchronisation is secondary. This prevents loss when the app is backgrounded, the phone locks or connectivity fails.

### Server authority for sensitive actions

The mobile client may display and propose changes, but the server validates:

- Account export and deletion
- AI tool actions
- Calorie-target changes
- Training-plan progression
- File access

### Audit trail

Every automatic or accepted plan adjustment records:

- User
- Timestamp
- Rule version
- Input summary
- Previous value
- Proposed value
- Accepted value
- Whether AI generated the explanation

## 4.3 Suggested repository structure

```text
app/
  (auth)/
  (onboarding)/
  (tabs)/
    today/
    plan/
    log/
    progress/
    more/
components/
  common/
  forms/
  workout/
  charts/
domain/
  readiness/
  training/
  nutrition/
  alcohol/
  measurements/
  scheduling/
features/
  auth/
  onboarding/
  today/
  workouts/
  cardio/
  nutrition/
  progress/
lib/
  supabase/
  persistence/
  notifications/
  validation/
supabase/
  migrations/
  functions/
tests/
  unit/
  integration/
  e2e/
docs/
```

## 4.4 Data flow examples

### Starting a strength workout

1. Today queries the scheduled session and latest readiness data.
2. The user completes the readiness check.
3. The client passes the input to the pure readiness classifier.
4. The result is stored with the rule version.
5. If permitted, an active workout is created locally and remotely.
6. Every completed set writes to local storage immediately.
7. A background process synchronises sets to Supabase.
8. Completion triggers progression evaluation.
9. A proposed progression is stored but applied only according to the rules.

### Weekly calorie review

1. Retrieve the last fourteen or twenty-one days of weight and nutrition logs.
2. Calculate logging completeness.
3. Calculate a robust weight trend.
4. Determine whether sufficient data exists.
5. Compare actual trend with the target range.
6. Create no change or a small proposed adjustment.
7. Explain the evidence.
8. Require user confirmation.
9. Store an audit event.

## 4.5 Offline strategy

Offline support is required for:

- Viewing today's downloaded plan
- Completing an active workout
- Recording readiness and post-session check-ins
- Logging weight, waist, food and lager
- Viewing recently cached progress

Conflicts should use server timestamps and deterministic merge rules. User-entered log records are append-first. Editing the same record on multiple devices is a low-priority private-MVP case and can use last-write-wins with an audit record.

## 4.6 Security architecture

- Use the Supabase anonymous key in the client, never the service-role key.
- Protect every user-owned row with `auth.uid() = user_id` policies.
- Use signed URLs for private images.
- Keep AI provider keys in Edge Function secrets.
- Validate tool inputs server-side.
- Rate-limit AI functions and account export.
- Avoid logging raw health notes or AI prompts in third-party analytics.
- Use privacy-conscious crash reporting or disable sensitive breadcrumbs.

## 4.7 Observability

Private beta diagnostics should include:

- App version
- Migration version
- Rule-engine version
- Last successful sync
- Failed sync count
- Notification permission state
- Database connection health

Do not expose secrets or detailed health data in logs.

## 4.8 Future integrations

### Apple Health

Add after the manual workflow is stable. Potential reads include steps, workouts, weight and selected heart-rate information. Every category requires explicit permission and a clear purpose.

### Food databases

The MVP uses personal foods and manual entries. Add barcode or external search through a server-side adapter so providers can be replaced without redesigning the app.

### AI provider

Use an adapter interface with structured outputs. The application should not be tightly coupled to one model provider.
