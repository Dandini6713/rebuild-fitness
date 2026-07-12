// The S-011 readiness result screen (roadmap 14, building on the roadmap-13
// acknowledgement). It shows the result of a submitted check: the classification
// conveyed by icon, heading AND text (never colour alone — docs/03 S-011 / docs/09
// §9.2), a plain explanation, the allowed action, the structured reasons, and — for a
// red result — the docs/07 §7.2 professional-care wording. It always states plainly
// that the app does not diagnose or assess the injury (docs/07).
//
// This screen presents a result; it does not itself start or gate a session. The
// server-enforced block — a red pre-session result refusing to start a running or
// demanding-lower-body session — lives in the start_scheduled_session RPC and is
// surfaced by ReadinessBlockCard on Today and in the workout player (roadmap 14). The
// label/tone/heading copy is shared with that card via readinessCopy so wording has
// one source.

import { View } from 'react-native';

import {
  AppText,
  Card,
  ErrorState,
  LoadingState,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from '@/components/common';
import {
  type ReadinessClassification,
  type ReadinessReason,
  presentClassification,
} from '@/domain/training/readinessClassification';
import { useAppTheme } from '@/theme/useAppTheme';

import {
  CLASSIFICATION_HEADING,
  CLASSIFICATION_LABEL,
  CLASSIFICATION_TONE,
  NON_DIAGNOSIS_NOTE,
} from './readinessCopy';
import type { ReadinessResultState } from './useReadiness';

function ReasonList({ reasons }: { reasons: ReadinessReason[] }) {
  const { spacing } = useAppTheme();
  if (reasons.length === 0) {
    return null;
  }
  return (
    <View style={{ gap: spacing.xs }}>
      {reasons.map((reason) => (
        <AppText key={reason.code} tone="secondary">
          • {reason.message}
        </AppText>
      ))}
    </View>
  );
}

// Shared body for a real classification (from the server) or a provisional one (the
// offline hold). `provisional` adds the not-yet-submitted framing.
function ClassificationCard({
  classification,
  reasons,
  provisional,
}: {
  classification: ReadinessClassification;
  reasons: ReadinessReason[];
  provisional: boolean;
}) {
  const { spacing } = useAppTheme();
  const copy = presentClassification(classification);
  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <StatusBadge
          label={CLASSIFICATION_LABEL[classification]}
          tone={CLASSIFICATION_TONE[classification]}
        />
        <AppText variant="heading">
          {CLASSIFICATION_HEADING[classification]}
        </AppText>
        {provisional ? (
          <StatusBadge
            label="Saved on this device — not yet submitted"
            tone="info"
          />
        ) : null}
        <AppText
          accessibilityLiveRegion={
            classification === 'red' ? 'assertive' : 'polite'
          }
        >
          {copy.recommendation}
        </AppText>
        <AppText tone="secondary" variant="label">
          {copy.allowedAction}
        </AppText>
        <ReasonList reasons={reasons} />
        <AppText tone="secondary" variant="caption">
          {NON_DIAGNOSIS_NOTE}
        </AppText>
      </View>
    </Card>
  );
}

export type ReadinessResultViewProps = {
  state: ReadinessResultState;
  onReset: () => void;
  onDone: () => void;
};

export function ReadinessResultView({
  onDone,
  onReset,
  state,
}: ReadinessResultViewProps) {
  const { spacing } = useAppTheme();

  if (state.status === 'submitting') {
    return (
      <LoadingState
        description="Submitting your readiness check…"
        label="Submitting your readiness check"
      />
    );
  }

  if (state.status === 'error') {
    return (
      <View style={{ gap: spacing.md }}>
        <ErrorState description={state.message} />
        <SecondaryButton label="Try again" onPress={onReset} />
      </View>
    );
  }

  if (state.status === 'held') {
    // Offline: the answers are safe on the device and will be submitted on
    // reconnect. Show the provisional (same-rules) result so nothing important is
    // hidden, clearly marked as not yet submitted.
    const provisional = state.provisional;
    return (
      <View style={{ gap: spacing.md }}>
        {provisional.classifiable && provisional.classification ? (
          <ClassificationCard
            classification={provisional.classification}
            provisional
            reasons={provisional.reasons}
          />
        ) : (
          <ErrorState description={provisional.recommendation} />
        )}
        <AppText tone="secondary">
          You appear to be offline. Your answers are saved on this device and
          will be submitted automatically once you are back online.
        </AppText>
        <PrimaryButton label="Done" onPress={onDone} />
      </View>
    );
  }

  if (state.status === 'classified') {
    // This screen presents the stored server classification. It does not start or gate
    // a session: the red block is enforced server-side by start_scheduled_session when
    // the user next tries to start the affected session, and shown there by
    // ReadinessBlockCard (roadmap 14). Recording a red result here does not, on its
    // own, open or close anything.
    return (
      <View style={{ gap: spacing.md }}>
        <ClassificationCard
          classification={state.result.classification}
          provisional={false}
          reasons={state.result.reasons}
        />
        {state.scheduleNextMorning ? (
          <AppText tone="secondary" variant="caption">
            We have noted that you would like a next-morning check. A reminder
            will be added in a later update.
          </AppText>
        ) : null}
        <PrimaryButton label="Done" onPress={onDone} />
        <SecondaryButton label="Redo check" onPress={onReset} />
      </View>
    );
  }

  return null;
}
