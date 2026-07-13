// Presentational rendering of the cardio interval player (S-014). Pure in its props
// — it takes the resolved state and callbacks, not the hook — so every state can be
// tested without Supabase, auth, audio or timers, mirroring WorkoutPlayerView and
// TodayView. All copy is British English; the current interval, its countdown and
// status are conveyed by text and icon, never colour alone; every control is a 44pt
// target with an accessible label. Nothing here diagnoses or assesses anything
// (docs/07): the timer paces a walk or run-walk, it is never a safety gate.

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
import { ScaleSelector } from '@/components/workout/ScaleSelector';
import {
  describeDuration,
  formatDuration,
} from '@/domain/training/workoutTimer';
import { useAppTheme } from '@/theme/useAppTheme';

import type { CardioReady, CardioViewState } from './useCardioPlayer';

export type CardioPlayerCallbacks = {
  onPause: () => void;
  onResume: () => void;
  onSetEffort: (value: number) => void;
  onEnd: () => void;
  onExit: () => void;
};

// A plain-English label and tone for an interval activity. Run is the working
// interval (accent/info); walk and warm-up/cool-down are the easy ones (success);
// rest is neutral. Never relies on colour alone — the StatusBadge always pairs an
// icon and text.
const ACTIVITY_LABELS: Record<string, string> = {
  bike: 'Cycle',
  cooldown: 'Cool down',
  cross_trainer: 'Cross-trainer',
  rest: 'Rest',
  run: 'Run',
  walk: 'Walk',
  warmup: 'Warm up',
};

function activityLabel(activityType: string | null): string {
  if (!activityType) {
    return 'Interval';
  }
  return ACTIVITY_LABELS[activityType] ?? 'Interval';
}

function activityTone(activityType: string | null): StatusTone {
  switch (activityType) {
    case 'run':
      return 'info';
    case 'walk':
    case 'warmup':
    case 'cooldown':
      return 'success';
    default:
      return 'neutral';
  }
}

type CardioPlayerViewProps = {
  state: CardioViewState;
  callbacks: CardioPlayerCallbacks;
};

export function CardioPlayerView({ callbacks, state }: CardioPlayerViewProps) {
  if (state.status === 'loading') {
    return (
      <LoadingState
        description="Loading your cardio session…"
        label="Loading cardio session"
      />
    );
  }

  if (state.status === 'unavailable') {
    return (
      <EmptyState
        description="The cardio player can't be shown until the app is fully configured. Please try again later."
        title="Cardio player unavailable"
      />
    );
  }

  if (state.status === 'not-cardio') {
    return (
      <EmptyState
        description="This session isn't a cardio session, so the cardio player doesn't apply here."
        title="Not a cardio session"
      />
    );
  }

  if (state.status === 'empty') {
    return (
      <EmptyState
        description="We couldn't find this session. It may have been moved or replaced."
        title="Session not found"
      />
    );
  }

  if (state.status === 'no-programme') {
    return (
      <EmptyState
        description="Your cardio programme isn't ready yet. It will appear here once your plan is set up."
        title="No cardio programme yet"
      />
    );
  }

  if (state.status === 'error') {
    return (
      <ErrorState
        description={state.message}
        title="Can't load cardio session"
      />
    );
  }

  return <CardioActiveView callbacks={callbacks} state={state} />;
}

function CardioActiveView({
  callbacks,
  state,
}: {
  callbacks: CardioPlayerCallbacks;
  state: CardioReady;
}) {
  const { spacing } = useAppTheme();
  const stageLabel =
    state.stageNumber === null ? state.templateName : `${state.templateName}`;
  const totalPercent =
    state.totalSeconds === 0
      ? 0
      : Math.round((state.totalElapsedSeconds / state.totalSeconds) * 100);

  return (
    <View style={{ gap: spacing.lg }}>
      <Header
        elapsed={state.totalElapsedSeconds}
        remaining={state.totalRemainingSeconds}
        stageLabel={stageLabel}
        totalPercent={totalPercent}
      />

      {state.isComplete ? (
        <CompleteSection callbacks={callbacks} state={state} />
      ) : (
        <>
          <CurrentSegment state={state} />
          <NextSegment state={state} />
          <Controls callbacks={callbacks} state={state} />
        </>
      )}
    </View>
  );
}

function Header({
  elapsed,
  remaining,
  stageLabel,
  totalPercent,
}: {
  elapsed: number;
  remaining: number;
  stageLabel: string;
  totalPercent: number;
}) {
  const { spacing } = useAppTheme();
  return (
    <View accessibilityRole="header" style={{ gap: spacing.xs }}>
      <AppText variant="heading">{stageLabel}</AppText>
      <AppText
        accessibilityLabel={`Total elapsed ${describeDuration(elapsed)}, ${describeDuration(remaining)} remaining.`}
        tone="secondary"
      >
        {formatDuration(elapsed)} elapsed · {formatDuration(remaining)} left
      </AppText>
      <ProgressBar
        accessibilityLabel={`Session ${totalPercent}% complete.`}
        value={totalPercent}
      />
    </View>
  );
}

function CurrentSegment({ state }: { state: CardioReady }) {
  const { spacing } = useAppTheme();
  const label = activityLabel(state.currentActivity);
  const position = `Interval ${Math.min(state.segmentIndex + 1, state.segmentCount)} of ${state.segmentCount}`;
  return (
    <Card
      accessibilityLabel={`Now: ${label}. ${describeDuration(state.segmentRemainingSeconds)} left in this interval.`}
    >
      <StatusBadge label={label} tone={activityTone(state.currentActivity)} />
      <View style={{ gap: spacing.xxs }}>
        <AppText variant="label">{position}</AppText>
        {state.currentCue ? (
          <AppText tone="secondary">{state.currentCue}</AppText>
        ) : null}
      </View>
      <View accessibilityLiveRegion="polite" style={{ gap: spacing.xxs }}>
        <AppText variant="display">
          {formatDuration(state.segmentRemainingSeconds)}
        </AppText>
        <AppText tone="tertiary" variant="caption">
          left in this interval
        </AppText>
      </View>
      {state.paused ? (
        <View accessibilityLiveRegion="assertive">
          <StatusBadge label="Paused" tone="caution" />
        </View>
      ) : null}
    </Card>
  );
}

function NextSegment({ state }: { state: CardioReady }) {
  if (state.nextActivity === null) {
    return (
      <Card accessibilityLabel="This is the final interval.">
        <AppText variant="label">Up next</AppText>
        <AppText tone="secondary">
          This is the final interval — you&apos;re nearly there.
        </AppText>
      </Card>
    );
  }
  const label = activityLabel(state.nextActivity);
  const line = state.nextCue ? `${label} — ${state.nextCue}` : label;
  return (
    <Card accessibilityLabel={`Up next: ${label}.`}>
      <AppText variant="label">Up next</AppText>
      <AppText tone="secondary">{line}</AppText>
    </Card>
  );
}

function Controls({
  callbacks,
  state,
}: {
  callbacks: CardioPlayerCallbacks;
  state: CardioReady;
}) {
  const { spacing } = useAppTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {state.paused ? (
        <PrimaryButton
          accessibilityLabel="Resume the session"
          label="Resume"
          onPress={callbacks.onResume}
        />
      ) : (
        <PrimaryButton
          accessibilityLabel="Pause the session"
          label="Pause"
          onPress={callbacks.onPause}
        />
      )}
      <SecondaryButton
        accessibilityLabel="End the session now"
        label="End session"
        onPress={callbacks.onEnd}
      />
      {state.completeError ? (
        <ErrorState description={state.completeError} title="Couldn't finish" />
      ) : null}
    </View>
  );
}

function CompleteSection({
  callbacks,
  state,
}: {
  callbacks: CardioPlayerCallbacks;
  state: CardioReady;
}) {
  const { spacing } = useAppTheme();
  return (
    <Card accessibilityLabel="Cardio session complete.">
      <StatusBadge label="Session complete" tone="success" />
      <View style={{ gap: spacing.xxs }}>
        <AppText variant="heading">Nicely done</AppText>
        <AppText tone="secondary">
          You&apos;ve finished this cardio session. Before you close it, let us
          know how hard it felt.
        </AppText>
      </View>
      <ScaleSelector
        highCaption="Very hard"
        label="How hard did that feel?"
        lowCaption="Very easy"
        max={10}
        min={1}
        onSelect={callbacks.onSetEffort}
        optionAccessibilityLabel={(value) =>
          `Effort ${value} out of 10${value === state.sessionEffort ? ', selected' : ''}`
        }
        value={state.sessionEffort}
      />
      <PrimaryButton
        accessibilityLabel="Finish and save the session"
        label="Finish session"
        loading={state.completing}
        onPress={callbacks.onEnd}
      />
      {state.completeError ? (
        <ErrorState description={state.completeError} title="Couldn't finish" />
      ) : null}
    </Card>
  );
}
