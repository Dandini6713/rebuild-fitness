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

import type { SubstitutionActivity } from '@/domain/training/activitySubstitution';

import {
  CLASSIFICATION_HEADING,
  CLASSIFICATION_LABEL,
  CLASSIFICATION_TONE,
  NON_DIAGNOSIS_NOTE,
} from './readinessCopy';
import { SubstitutionOptionsView } from './SubstitutionOptionsView';
import type { ReadinessResultState } from './useReadiness';
import type { SessionSubstitutionState } from './useSessionSubstitution';

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

// The amber activity-substitution offer, supplied by the screen when there is a gated
// session to swap (docs/06 §6.2). Optional: without it — e.g. a standalone readiness
// check with no session attached — the amber result renders without the offer.
export type SubstitutionOffer = {
  state: SessionSubstitutionState;
  onSelect: (activity: SubstitutionActivity) => void;
  onReset: () => void;
};

export type ReadinessResultViewProps = {
  state: ReadinessResultState;
  onReset: () => void;
  onDone: () => void;
  substitution?: SubstitutionOffer;
};

export function ReadinessResultView({
  onDone,
  onReset,
  state,
  substitution,
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
    // An amber result with a session to swap offers the activity substitution
    // (docs/06 §6.2): the gentler-option choices replace the demanding session with a
    // linked replacement. The offer records that a next-morning check is expected, so
    // the separate "we noted a next-morning check" caption is not repeated here.
    const showSubstitution =
      state.result.classification === 'amber' && substitution !== undefined;

    return (
      <View style={{ gap: spacing.md }}>
        <ClassificationCard
          classification={state.result.classification}
          provisional={false}
          reasons={state.result.reasons}
        />
        {showSubstitution && substitution ? (
          <>
            <SubstitutionOptionsView
              onDone={onDone}
              onReset={substitution.onReset}
              onSelect={substitution.onSelect}
              state={substitution.state}
            />
            {substitution.state.status === 'idle' ? (
              <>
                <SecondaryButton label="Not now" onPress={onDone} />
                <SecondaryButton label="Redo check" onPress={onReset} />
              </>
            ) : null}
          </>
        ) : (
          <>
            {state.scheduleNextMorning ? (
              <AppText tone="secondary" variant="caption">
                We have noted that you would like a next-morning check. If you
                have next-morning reminders turned on in Notifications, we will
                remind you in the morning.
              </AppText>
            ) : null}
            <PrimaryButton label="Done" onPress={onDone} />
            <SecondaryButton label="Redo check" onPress={onReset} />
          </>
        )}
      </View>
    );
  }

  return null;
}
