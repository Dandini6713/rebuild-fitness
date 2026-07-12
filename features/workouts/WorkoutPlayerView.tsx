// Presentational rendering of the strength workout player (S-012). Pure in its
// props — it takes the resolved state and callbacks, not the hook — so every state
// can be tested without Supabase, auth or timers, mirroring TodayView and the
// planner views. All copy is British English; status and the discomfort action are
// conveyed by text and icon, never colour alone; every control is a 44pt target
// with an accessible label. Nothing here diagnoses or assesses injury (docs/07).

import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import {
  AppText,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from '@/components/common';
import { ScaleSelector } from '@/components/workout/ScaleSelector';
import { Stepper } from '@/components/workout/Stepper';
import type { LoggedSet } from '@/domain/training/workoutPlayer';
import {
  describeDuration,
  formatDuration,
} from '@/domain/training/workoutTimer';
import { useAppTheme } from '@/theme/useAppTheme';

import type {
  PlayerExerciseView,
  PlayerReadModel,
} from './workoutPlayerRepository';
import type {
  PlayerReady,
  PlayerViewState,
  SetInputs,
} from './useWorkoutPlayer';

const WEIGHT_STEP = 2.5;

export type WorkoutPlayerCallbacks = {
  onAdjustWeight: (delta: number) => void;
  onAdjustReps: (delta: number) => void;
  onSetEffort: (value: number) => void;
  onSetDiscomfort: (value: number) => void;
  onLogSet: () => void;
  onPreviousExercise: () => void;
  onNextExercise: () => void;
  onSkipRest: () => void;
  onEnd: () => void;
  onOpenGuide: (slug: string) => void;
  onExit: () => void;
};

function formatWeight(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function targetText(exercise: PlayerExerciseView): string {
  const sets = `${exercise.targetSets} ${exercise.targetSets === 1 ? 'set' : 'sets'}`;
  if (exercise.repMin === null && exercise.repMax === null) {
    return `${sets} · steady hold`;
  }
  if (exercise.repMin !== null && exercise.repMax !== null) {
    const reps =
      exercise.repMin === exercise.repMax
        ? `${exercise.repMin}`
        : `${exercise.repMin}–${exercise.repMax}`;
    return `${sets} × ${reps} reps`;
  }
  const single = exercise.repMax ?? exercise.repMin;
  return `${sets} × ${single} reps`;
}

function previousText(exercise: PlayerExerciseView): string {
  const previous = exercise.previous;
  if (!previous) {
    return 'No previous result yet — this looks like your first time logging this exercise.';
  }
  const weight =
    previous.weightKg === null ? null : `${formatWeight(previous.weightKg)} kg`;
  const reps =
    previous.repetitions === null ? null : `${previous.repetitions} reps`;
  const parts = [weight, reps].filter((part): part is string => part !== null);
  return parts.length > 0
    ? `Last time: ${parts.join(' × ')}`
    : 'No previous result yet.';
}

export function WorkoutPlayerView({
  callbacks,
  state,
}: {
  callbacks: WorkoutPlayerCallbacks;
  state: PlayerViewState;
}) {
  if (state.status === 'loading') {
    return (
      <LoadingState
        description="Loading your session…"
        label="Loading session"
      />
    );
  }
  if (state.status === 'unavailable') {
    return (
      <EmptyState
        description="The session player can't be shown until the app is fully configured. Please try again later."
        title="Session unavailable"
      />
    );
  }
  if (state.status === 'empty') {
    return (
      <EmptyState
        description="We couldn't find that scheduled session. Head back to Today and start again."
        title="No session found"
      />
    );
  }
  if (state.status === 'not-strength') {
    return (
      <EmptyState
        description="This player is for strength sessions. Cardio and other sessions get their own player in a later update."
        title="Not a strength session"
      />
    );
  }
  if (state.status === 'error') {
    return (
      <ErrorState description={state.message} title="Can't load session" />
    );
  }

  return <ReadyPlayer callbacks={callbacks} state={state} />;
}

function ReadyPlayer({
  callbacks,
  state,
}: {
  callbacks: WorkoutPlayerCallbacks;
  state: PlayerReady;
}) {
  const { spacing } = useAppTheme();
  return (
    <ScrollView
      contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.xxl }}
    >
      <PlayerHeader
        completedCount={state.completedCount}
        elapsedSeconds={state.elapsedSeconds}
        exerciseCount={state.exerciseCount}
        exerciseNumber={state.exerciseNumber}
        onEnd={callbacks.onEnd}
        onExit={callbacks.onExit}
        workoutName={state.workoutName}
      />

      {state.isComplete ? (
        <FinishCard ending={state.ending} onEnd={callbacks.onEnd} />
      ) : null}

      <ExerciseCard callbacks={callbacks} state={state} />

      {state.endError ? (
        <ErrorState description={state.endError} title="Couldn't finish" />
      ) : null}
    </ScrollView>
  );
}

function PlayerHeader({
  completedCount,
  elapsedSeconds,
  exerciseCount,
  exerciseNumber,
  onEnd,
  onExit,
  workoutName,
}: {
  completedCount: number;
  elapsedSeconds: number;
  exerciseCount: number;
  exerciseNumber: number;
  onEnd: () => void;
  onExit: () => void;
  workoutName: string;
}) {
  const { spacing } = useAppTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const elapsed = formatDuration(elapsedSeconds);

  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={{
          alignItems: 'flex-start',
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <AppText accessibilityRole="header" variant="heading">
            {workoutName}
          </AppText>
          <AppText
            accessibilityLabel={`Exercise ${exerciseNumber} of ${exerciseCount}. Elapsed time ${describeDuration(
              elapsedSeconds,
            )}.`}
            tone="secondary"
          >
            Exercise {exerciseNumber} of {exerciseCount} · {elapsed} elapsed
          </AppText>
        </View>
        <Pressable
          accessibilityLabel="End workout menu"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => setMenuOpen((open) => !open)}
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 44,
            minWidth: 44,
          }}
        >
          <AppText variant="heading">⋯</AppText>
        </Pressable>
      </View>

      {completedCount > 0 ? (
        <StatusBadge
          label={`${completedCount} of ${exerciseCount} exercises done`}
          tone="success"
        />
      ) : null}

      {menuOpen ? (
        <Card accessibilityLabel="Workout menu">
          <PrimaryButton
            accessibilityLabel="Finish and save this session"
            label="Finish session"
            onPress={onEnd}
          />
          <SecondaryButton
            accessibilityHint="Leaves the player; your session stays in progress and your sets are saved."
            accessibilityLabel="Leave the player without finishing"
            label="Leave for now"
            onPress={onExit}
          />
          <AppText tone="tertiary" variant="caption">
            Your completed sets are saved on this device as you go, so leaving
            never loses them.
          </AppText>
        </Card>
      ) : null}
    </View>
  );
}

function ExerciseCard({
  callbacks,
  state,
}: {
  callbacks: WorkoutPlayerCallbacks;
  state: PlayerReady;
}) {
  const { spacing } = useAppTheme();
  const { exercise, inputs } = state;

  return (
    <Card accessibilityLabel={`Current exercise: ${exercise.name}.`}>
      <View style={{ gap: spacing.xxs }}>
        <AppText accessibilityRole="header" variant="heading">
          {exercise.name}
        </AppText>
        <AppText tone="secondary">{targetText(exercise)}</AppText>
      </View>

      <MediaPlaceholder />

      <Pressable
        accessibilityHint="Opens the full how-to guide for this exercise."
        accessibilityLabel={`How to do ${exercise.name}`}
        accessibilityRole="button"
        onPress={() => callbacks.onOpenGuide(exercise.slug)}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <AppText style={{ textDecorationLine: 'underline' }} variant="label">
          How to do this exercise
        </AppText>
      </Pressable>

      <PreviousResult text={previousText(exercise)} />

      <SetProgress
        setsDone={state.setsDone}
        setsForExercise={state.setsForExercise}
        setsTarget={state.setsTarget}
      />

      <SetInputsPanel callbacks={callbacks} inputs={inputs} />

      <DiscomfortAction callbacks={callbacks} />

      <PrimaryButton
        accessibilityLabel={`Log set ${state.setsDone + 1} for ${exercise.name}`}
        label={state.logging ? 'Saving set' : 'Log set'}
        loading={state.logging}
        onPress={callbacks.onLogSet}
      />
      {state.lastSetSynced === false ? (
        <View accessibilityLiveRegion="polite">
          <AppText tone="secondary" variant="caption">
            Saved on your device. It will sync when you are back online.
          </AppText>
        </View>
      ) : null}

      {state.rest.active ? (
        <RestTimerPanel
          onSkip={callbacks.onSkipRest}
          remainingSeconds={state.rest.remainingSeconds}
        />
      ) : null}

      <ReplaceExerciseAction
        exerciseName={exercise.name}
        onOpenGuide={() => callbacks.onOpenGuide(exercise.slug)}
      />

      <ExerciseNav
        exerciseNumber={state.exerciseNumber}
        exerciseCount={state.exerciseCount}
        onNext={callbacks.onNextExercise}
        onPrevious={callbacks.onPreviousExercise}
      />
    </Card>
  );
}

function MediaPlaceholder() {
  const { colours, radii, spacing } = useAppTheme();
  return (
    <View
      accessibilityLabel="Exercise illustration placeholder. Illustrations and video are added in a later update."
      accessibilityRole="image"
      style={{
        alignItems: 'center',
        backgroundColor: colours.surfaceMuted,
        borderColor: colours.borderSubtle,
        borderRadius: radii.medium,
        borderWidth: 1,
        gap: spacing.xxs,
        justifyContent: 'center',
        paddingVertical: spacing.xl,
      }}
    >
      <AppText variant="heading">▦</AppText>
      <AppText tone="tertiary" variant="caption">
        Illustration and video arrive in a later update
      </AppText>
    </View>
  );
}

function PreviousResult({ text }: { text: string }) {
  return (
    <View accessibilityLabel={text}>
      <StatusBadge label="Previous result" tone="neutral" />
      <AppText tone="secondary">{text}</AppText>
    </View>
  );
}

function SetProgress({
  setsDone,
  setsForExercise,
  setsTarget,
}: {
  setsDone: number;
  setsForExercise: LoggedSet[];
  setsTarget: number;
}) {
  const { spacing } = useAppTheme();
  return (
    <View style={{ gap: spacing.xxs }}>
      <AppText variant="label">
        Sets: {setsDone} of {setsTarget} recorded
      </AppText>
      {setsForExercise.map((set) => (
        <AppText key={set.setNumber} tone="secondary" variant="caption">
          {`Set ${set.setNumber}: ${
            set.weightKg === null
              ? 'bodyweight'
              : `${formatWeight(set.weightKg)} kg`
          }${set.repetitions === null ? '' : ` × ${set.repetitions} reps`}${
            set.effortScore === null ? '' : ` · effort ${set.effortScore}/10`
          }${
            set.discomfortScore && set.discomfortScore > 0
              ? ` · discomfort ${set.discomfortScore}/10`
              : ''
          }`}
        </AppText>
      ))}
    </View>
  );
}

function SetInputsPanel({
  callbacks,
  inputs,
}: {
  callbacks: WorkoutPlayerCallbacks;
  inputs: SetInputs;
}) {
  const { spacing } = useAppTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <Stepper
        decrementLabel={`Decrease weight by ${WEIGHT_STEP} kilograms`}
        displayValue={formatWeight(inputs.weightKg)}
        incrementLabel={`Increase weight by ${WEIGHT_STEP} kilograms`}
        label="Weight"
        onDecrement={() => callbacks.onAdjustWeight(-WEIGHT_STEP)}
        onIncrement={() => callbacks.onAdjustWeight(WEIGHT_STEP)}
        unit="kg"
        value={inputs.weightKg}
      />
      <Stepper
        decrementLabel="Decrease repetitions by one"
        displayValue={`${inputs.repetitions}`}
        incrementLabel="Increase repetitions by one"
        label="Repetitions"
        onDecrement={() => callbacks.onAdjustReps(-1)}
        onIncrement={() => callbacks.onAdjustReps(1)}
        value={inputs.repetitions}
      />
      <ScaleSelector
        highCaption="Maximum"
        label="Effort"
        lowCaption="Very easy"
        max={10}
        min={1}
        onSelect={callbacks.onSetEffort}
        optionAccessibilityLabel={(value) => `Effort ${value} out of 10`}
        value={inputs.effortScore}
      />
      <ScaleSelector
        highCaption="Most"
        label="Discomfort"
        lowCaption="None"
        max={10}
        min={0}
        onSelect={callbacks.onSetDiscomfort}
        optionAccessibilityLabel={(value) => `Discomfort ${value} out of 10`}
        value={inputs.discomfortScore}
      />
    </View>
  );
}

function DiscomfortAction({
  callbacks,
}: {
  callbacks: WorkoutPlayerCallbacks;
}) {
  const { spacing } = useAppTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: spacing.xs }}>
      <SecondaryButton
        accessibilityHint="Shows gentle, conservative options if something feels uncomfortable."
        accessibilityLabel="Something feels uncomfortable"
        icon={<AppText variant="label">!</AppText>}
        label="Something feels uncomfortable"
        onPress={() => setOpen((value) => !value)}
      />
      {open ? (
        <Card accessibilityLabel="Conservative options if you feel discomfort">
          <StatusBadge label="Take it gently" tone="caution" />
          <AppText tone="secondary">
            You can note how it feels using the discomfort scale above. This
            only records what you tell us — it does not assess or diagnose your
            tendon or any injury. If something feels wrong, the gentlest choice
            is usually the right one, and if you are concerned, stop and seek
            advice from a qualified professional.
          </AppText>
          <SecondaryButton
            accessibilityLabel={`Reduce the weight by ${WEIGHT_STEP} kilograms`}
            label="Reduce the weight"
            onPress={() => {
              callbacks.onAdjustWeight(-WEIGHT_STEP);
              setOpen(false);
            }}
          />
          <SecondaryButton
            accessibilityLabel="Move on to the next exercise"
            label="Move on to the next exercise"
            onPress={() => {
              callbacks.onNextExercise();
              setOpen(false);
            }}
          />
          <SecondaryButton
            accessibilityLabel="End the session now"
            label="End the session now"
            onPress={() => {
              callbacks.onEnd();
              setOpen(false);
            }}
          />
        </Card>
      ) : null}
    </View>
  );
}

function RestTimerPanel({
  onSkip,
  remainingSeconds,
}: {
  onSkip: () => void;
  remainingSeconds: number;
}) {
  const { spacing } = useAppTheme();
  return (
    <Card
      accessibilityLabel={`Rest timer: ${describeDuration(remainingSeconds)} remaining.`}
    >
      <View accessibilityLiveRegion="polite" style={{ gap: spacing.xxs }}>
        <StatusBadge label="Resting" tone="info" />
        <AppText variant="heading">{formatDuration(remainingSeconds)}</AppText>
        <AppText tone="secondary" variant="caption">
          Take your rest, then start your next set when you are ready.
        </AppText>
      </View>
      <SecondaryButton
        accessibilityLabel="Skip the rest timer"
        label="Skip rest"
        onPress={onSkip}
      />
    </Card>
  );
}

function ReplaceExerciseAction({
  exerciseName,
  onOpenGuide,
}: {
  exerciseName: string;
  onOpenGuide: () => void;
}) {
  const { spacing } = useAppTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: spacing.xs }}>
      <SecondaryButton
        accessibilityHint="Explains how to swap this exercise."
        accessibilityLabel={`Replace ${exerciseName}`}
        label="Replace exercise"
        onPress={() => setOpen((value) => !value)}
      />
      {open ? (
        <Card accessibilityLabel="Replacing an exercise">
          <AppText tone="secondary">
            Swapping an exercise for an equipment-aware alternative arrives with
            the activity substitution update. For now, the exercise guide lists
            approved alternatives you can use in its place.
          </AppText>
          <SecondaryButton
            accessibilityLabel={`View approved alternatives for ${exerciseName}`}
            label="View approved alternatives"
            onPress={() => {
              onOpenGuide();
              setOpen(false);
            }}
          />
        </Card>
      ) : null}
    </View>
  );
}

function ExerciseNav({
  exerciseCount,
  exerciseNumber,
  onNext,
  onPrevious,
}: {
  exerciseCount: number;
  exerciseNumber: number;
  onNext: () => void;
  onPrevious: () => void;
}) {
  const { spacing } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      <View style={{ flex: 1 }}>
        <SecondaryButton
          accessibilityLabel="Go to the previous exercise"
          disabled={exerciseNumber <= 1}
          label="Previous"
          onPress={onPrevious}
        />
      </View>
      <View style={{ flex: 1 }}>
        <SecondaryButton
          accessibilityLabel="Go to the next exercise"
          disabled={exerciseNumber >= exerciseCount}
          label="Next"
          onPress={onNext}
        />
      </View>
    </View>
  );
}

function FinishCard({ ending, onEnd }: { ending: boolean; onEnd: () => void }) {
  const { spacing } = useAppTheme();
  return (
    <Card accessibilityLabel="Every exercise is done.">
      <StatusBadge label="All sets recorded" tone="success" />
      <View style={{ gap: spacing.xxs }}>
        <AppText variant="heading">Nicely done</AppText>
        <AppText tone="secondary">
          You have recorded every set for this session. Finish to save it, or
          keep going if you would like to add more.
        </AppText>
      </View>
      <PrimaryButton
        accessibilityLabel="Finish and save this session"
        label="Finish session"
        loading={ending}
        onPress={onEnd}
      />
    </Card>
  );
}

// Exported for a focused resume test: the read model shape the view consumes.
export type { PlayerReadModel };
