// Presentational rendering of the Today read model. Pure in its props (it takes
// the resolved state and callbacks, not the hook) so every state can be tested
// without Supabase or auth, mirroring features/plan/PlanPreviewView.tsx.
//
// Section order follows docs/03 S-010: date and greeting, the planned session,
// the primary action, calories and protein, steps (hidden — no source yet),
// Achilles where relevant, then weekly adherence. Each section degrades on its own
// so one missing piece never blanks the screen. All copy is British English; no
// section implies medical fitness (docs/07).

import { View } from 'react-native';

import {
  AppText,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
  ProgressBar,
  SecondaryButton,
  StatusBadge,
  type StatusTone,
} from '@/components/common';
import {
  describeSessionType,
  formatPlanDate,
  type PlanSessionType,
} from '@/domain/training/planSchedule';
import type { TodaySessionState } from '@/domain/training/todaySession';
import { useAppTheme } from '@/theme/useAppTheme';

import type { TodayNutrition } from './todayRepository';
import type { TodayViewState } from './useToday';

const SESSION_TONES: Record<PlanSessionType, StatusTone> = {
  achilles: 'caution',
  cardio: 'success',
  rest: 'neutral',
  strength: 'info',
};

function toneFor(sessionType: string): StatusTone {
  return SESSION_TONES[sessionType as PlanSessionType] ?? 'neutral';
}

function labelFor(session: {
  sessionType: string;
  templateName: string | null;
}): string {
  return session.templateName ?? describeSessionType(session.sessionType);
}

const integer = new Intl.NumberFormat('en-GB');

type TodayViewProps = {
  greeting: string;
  onStart: (scheduledSessionId: string) => void;
  startError: string | null;
  starting: boolean;
  state: TodayViewState;
  todayIso: string;
};

export function TodayView({
  greeting,
  onStart,
  startError,
  starting,
  state,
  todayIso,
}: TodayViewProps) {
  const { spacing } = useAppTheme();

  if (state.status === 'loading') {
    return (
      <LoadingState description="Loading your day…" label="Loading today" />
    );
  }

  if (state.status === 'unavailable') {
    return (
      <EmptyState
        description="Today can't be shown until the app is fully configured. Please try again later."
        title="Today unavailable"
      />
    );
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} title="Can't load today" />;
  }

  const { adherence, nutrition, session } = state.data;

  return (
    <View style={{ gap: spacing.lg }}>
      <GreetingHeader greeting={greeting} todayIso={todayIso} />
      <SessionSection
        onStart={onStart}
        session={session}
        startError={startError}
        starting={starting}
      />
      <AchillesSection session={session} />
      <NutritionSection nutrition={nutrition} />
      <AdherenceSection
        adherence={adherence.percent === null ? null : adherence}
      />
    </View>
  );
}

function GreetingHeader({
  greeting,
  todayIso,
}: {
  greeting: string;
  todayIso: string;
}) {
  const { spacing } = useAppTheme();
  const date = formatPlanDate(todayIso);
  return (
    <View
      accessibilityLabel={`${greeting}. Today is ${date}.`}
      accessibilityRole="header"
      style={{ gap: spacing.xxs }}
    >
      <AppText variant="heading">{greeting}</AppText>
      <AppText tone="secondary">{date}</AppText>
    </View>
  );
}

function SessionSection({
  onStart,
  session,
  startError,
  starting,
}: {
  onStart: (scheduledSessionId: string) => void;
  session: TodaySessionState;
  startError: string | null;
  starting: boolean;
}) {
  const { spacing } = useAppTheme();

  if (session.kind === 'none') {
    return (
      <EmptyState
        description="Nothing is scheduled today. If you feel like moving, an easy walk or some gentle mobility is a good option — but today can just as happily be a rest day."
        title="Nothing planned today"
      />
    );
  }

  if (session.kind === 'rest') {
    return (
      <Card accessibilityLabel="Rest day. Today is a planned rest day.">
        <StatusBadge label="Rest day" tone="neutral" />
        <View style={{ gap: spacing.xxs }}>
          <AppText variant="heading">A planned rest day</AppText>
          <AppText tone="secondary">
            Recovery is part of the plan. Take it gently today; your next
            session will be here soon.
          </AppText>
        </View>
      </Card>
    );
  }

  if (session.kind === 'completed') {
    return (
      <Card accessibilityLabel="Today's session is complete.">
        <StatusBadge label="Completed" tone="success" />
        <View style={{ gap: spacing.xxs }}>
          <AppText variant="heading">{labelFor(session.session)} done</AppText>
          <AppText tone="secondary">
            {"You've finished today's session. Well done for showing up."}
          </AppText>
        </View>
      </Card>
    );
  }

  // Active: a training session to start (or one already under way).
  const label = labelFor(session.session);
  return (
    <Card accessibilityLabel={`Today's session: ${label}.`}>
      <StatusBadge label={label} tone={toneFor(session.session.sessionType)} />
      <View style={{ gap: spacing.xxs }}>
        <AppText variant="heading">{"Today's session"}</AppText>
        <AppText tone="secondary">
          {describeSessionType(session.session.sessionType)}, scheduled for{' '}
          {formatPlanDate(session.session.scheduledDate)}.
        </AppText>
      </View>

      {session.inProgress ? (
        <View accessibilityLiveRegion="polite" style={{ gap: spacing.xs }}>
          <StatusBadge label="In progress" tone="info" />
          <AppText tone="secondary">
            {
              "You've started today's session. The guided session player arrives in a later update, so there's nothing more to do here yet."
            }
          </AppText>
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {/* The primary action, visually dominant per docs/03: the filled
              accent button. It records that the session has begun; the guided
              player (S-012) is a later roadmap item. */}
          <PrimaryButton
            accessibilityLabel="Start today's session"
            label="Start session"
            loading={starting}
            onPress={() => onStart(session.session.id)}
          />
          {startError ? (
            <ErrorState description={startError} title="Couldn't start" />
          ) : null}
          {/* Reschedule and recovery swaps are later roadmap items. They are shown
              as disabled, clearly-marked stubs rather than faked as working. */}
          <View style={{ gap: spacing.xs }}>
            <SecondaryButton
              accessibilityHint="This will be available in a later update."
              disabled
              label="Reschedule"
              onPress={() => undefined}
            />
            <SecondaryButton
              accessibilityHint="This will be available in a later update."
              disabled
              label="Swap for a recovery option"
              onPress={() => undefined}
            />
            <AppText tone="tertiary" variant="caption">
              Rescheduling and recovery swaps arrive in a later update.
            </AppText>
          </View>
        </View>
      )}
    </Card>
  );
}

function AchillesSection({ session }: { session: TodaySessionState }) {
  const { spacing } = useAppTheme();
  const relevant =
    (session.kind === 'active' || session.kind === 'rest') &&
    session.session.sessionType === 'achilles';
  if (!relevant) {
    return null;
  }
  return (
    <Card accessibilityLabel="Achilles strength and mobility day.">
      <StatusBadge label="Achilles day" tone="caution" />
      <View style={{ gap: spacing.xxs }}>
        <AppText variant="heading">Achilles strength and mobility</AppText>
        <AppText tone="secondary">
          Today includes gentle calf and mobility work. A short readiness check
          to help you choose a comfortable option will be added before these
          sessions in a later update. This does not assess whether the tendon is
          healed.
        </AppText>
      </View>
    </Card>
  );
}

function NutritionSection({ nutrition }: { nutrition: TodayNutrition }) {
  if (nutrition.kind === 'no-target') {
    return (
      <Card accessibilityLabel="Calories and protein. No target is set yet.">
        <AppText variant="heading">Calories and protein</AppText>
        <AppText tone="secondary">
          {
            "No calorie or protein target is set yet. Your daily targets will appear here once they're in place."
          }
        </AppText>
      </Card>
    );
  }

  const calories = `${integer.format(nutrition.calories)} kcal`;
  const protein = `${integer.format(nutrition.proteinG)} g`;

  return (
    <Card
      accessibilityLabel={`Calories and protein. Daily target ${calories} and ${protein} of protein.`}
    >
      <AppText variant="heading">Calories and protein</AppText>
      <NutrientRow
        label="Calories"
        progress={nutrition.caloriesProgress}
        targetText={calories}
        unit="kcal"
      />
      <NutrientRow
        label="Protein"
        progress={nutrition.proteinProgress}
        targetText={protein}
        unit="g"
      />
      {nutrition.caloriesProgress === null ? (
        <AppText tone="tertiary" variant="caption">
          Food logging arrives in a later update, so nothing is recorded against
          these targets yet.
        </AppText>
      ) : null}
    </Card>
  );
}

function NutrientRow({
  label,
  progress,
  targetText,
  unit,
}: {
  label: string;
  progress: { consumed: number; percent: number; remaining: number } | null;
  targetText: string;
  unit: string;
}) {
  const { spacing } = useAppTheme();
  if (!progress) {
    // No intake source yet: show the target on its own, never a fabricated zero.
    return (
      <View style={{ gap: spacing.xxs }}>
        <AppText variant="label">{label}</AppText>
        <AppText tone="secondary">Target {targetText}</AppText>
      </View>
    );
  }
  const consumed = `${integer.format(progress.consumed)} ${unit}`;
  const remaining = `${integer.format(progress.remaining)} ${unit}`;
  return (
    <View style={{ gap: spacing.xxs }}>
      <AppText variant="label">{label}</AppText>
      <ProgressBar
        accessibilityLabel={`${label}: ${consumed} of ${targetText}, ${remaining} remaining.`}
        value={progress.percent}
      />
      <AppText tone="secondary" variant="caption">
        {consumed} of {targetText} · {remaining} remaining
      </AppText>
    </View>
  );
}

function AdherenceSection({
  adherence,
}: {
  adherence: { completed: number; planned: number } | null;
}) {
  const { spacing } = useAppTheme();
  if (!adherence) {
    return (
      <Card accessibilityLabel="This week. No training sessions are scheduled yet.">
        <AppText variant="heading">This week</AppText>
        <AppText tone="secondary">
          No training sessions are scheduled this week yet. Your weekly summary
          will appear here once your plan is under way.
        </AppText>
      </Card>
    );
  }
  const summary = `${adherence.completed} of ${adherence.planned} sessions completed`;
  const percent =
    adherence.planned === 0
      ? 0
      : Math.round((adherence.completed / adherence.planned) * 100);
  return (
    <Card accessibilityLabel={`This week: ${summary}.`}>
      <View style={{ gap: spacing.xxs }}>
        <AppText variant="heading">This week</AppText>
        <AppText tone="secondary">{summary}</AppText>
      </View>
      <ProgressBar
        accessibilityLabel={`Weekly sessions: ${summary}.`}
        value={percent}
      />
    </Card>
  );
}
