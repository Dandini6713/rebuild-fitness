// Presentational rendering of the running progression surface (roadmap 17, docs/06
// §6.3). Pure in its props — it takes the resolved state and callbacks, not the hook
// — so every state can be tested without Supabase or auth, mirroring TodayView,
// WorkoutPlayerView and CardioPlayerView. All copy is British English; the decision
// is conveyed by text and an icon, never colour alone; controls are 44pt targets with
// accessible labels. Nothing here diagnoses or assesses anything (docs/07): a proposal
// is a training suggestion the user confirms or sets aside.

import { View } from 'react-native';

import {
  AppText,
  Card,
  ErrorState,
  LoadingState,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  type StatusTone,
} from '@/components/common';
import type { RunningDecisionCode } from '@/domain/training/runningProgression';

import type { RunningProgressionState } from './useRunningProgression';

export type RunningProgressionCallbacks = {
  onAccept: () => void;
  onDismiss: () => void;
  onDone: () => void;
};

// A plain-English label and tone per decision. Advance is a positive step (success);
// repeat and pause are calm, steady holds (info/neutral); regress is a caution — a
// conservative easing back, never framed as failure or as a safety alarm (docs/07).
const DECISION_LABELS: Record<RunningDecisionCode, string> = {
  advance: 'Ready to progress',
  pause: 'Paused',
  regress: 'Ease back a stage',
  repeat: 'Repeat this stage',
};

function decisionTone(decision: RunningDecisionCode): StatusTone {
  switch (decision) {
    case 'advance':
      return 'success';
    case 'regress':
      return 'caution';
    case 'pause':
      return 'neutral';
    case 'repeat':
    default:
      return 'info';
  }
}

export function RunningProgressionView({
  state,
  callbacks,
}: {
  state: RunningProgressionState;
  callbacks: RunningProgressionCallbacks;
}) {
  if (state.status === 'loading') {
    return (
      <LoadingState
        description="Checking your running progression."
        label="Checking your running progression"
      />
    );
  }
  if (state.status === 'unavailable') {
    return (
      <ErrorState description="Running progression is unavailable right now. Please try again later." />
    );
  }
  if (state.status === 'error') {
    return <ErrorState description={state.message} />;
  }
  if (state.status === 'no-programme') {
    return (
      <Card>
        <AppText variant="body">
          You do not have a run-walk programme yet. Once your plan is set up,
          your running stages will appear here.
        </AppText>
      </Card>
    );
  }

  const { proposal, deciding, decided, decideError } = state;
  const canConfirmAdvance = proposal.decision === 'advance';

  if (decided) {
    return (
      <Card>
        <StatusBadge
          label={
            decided === 'accepted'
              ? canConfirmAdvance
                ? 'Progression confirmed'
                : 'Noted'
              : 'Set aside for now'
          }
          tone={decided === 'accepted' ? 'success' : 'neutral'}
        />
        <AppText variant="body">
          {decided === 'accepted'
            ? canConfirmAdvance
              ? 'You have confirmed you are ready to progress. Your next runs will build towards the new stage.'
              : 'Thanks — that is recorded.'
            : 'No problem. You can check your running progression again whenever you like.'}
        </AppText>
        <PrimaryButton label="Done" onPress={callbacks.onDone} />
      </Card>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <Card>
        <StatusBadge
          label={DECISION_LABELS[proposal.decision]}
          tone={decisionTone(proposal.decision)}
        />
        <AppText variant="body">{proposal.recommendation}</AppText>
        <View style={{ gap: 8 }}>
          {proposal.reasons.map((reason) => (
            <AppText key={reason.code} variant="body">
              {reason.message}
            </AppText>
          ))}
        </View>
        {proposal.volumeWarning ? (
          <View style={{ gap: 8 }}>
            <StatusBadge label="A note on this week" tone="caution" />
            <AppText variant="body">{proposal.volumeWarning}</AppText>
          </View>
        ) : null}
        <AppText variant="caption">{proposal.nextAction}</AppText>
      </Card>

      {decideError ? <ErrorState description={decideError} /> : null}

      {canConfirmAdvance ? (
        <PrimaryButton
          disabled={deciding}
          label={`Confirm and advance to stage ${proposal.toStageNumber}`}
          onPress={callbacks.onAccept}
        />
      ) : null}
      <SecondaryButton
        disabled={deciding}
        label={canConfirmAdvance ? 'Not now' : 'Dismiss'}
        onPress={callbacks.onDismiss}
      />
    </View>
  );
}
