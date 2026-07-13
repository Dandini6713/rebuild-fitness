// The amber activity-substitution offer (roadmap 15, docs/06 §6.2). It appears in the
// amber branch of the readiness result: after an amber result the sensible choice is a
// gentler option, so this offers flat walking, easy cycling, the cross-trainer or rest,
// with the docs/06 §6.2 framing (a gentler option; the running week does not progress).
//
// Pure in its props (it takes the resolved substitution state and callbacks, not the
// hook) so every state — idle, submitting, substituted, offline, error — can be tested
// without Supabase or auth, mirroring the other readiness views. The actual swap is a
// server-side linked replacement (substitute_session); offline fails honestly rather
// than pretending it swapped. Nothing here diagnoses or assesses the injury (docs/07).

import { View } from 'react-native';

import {
  AppText,
  Card,
  ErrorState,
  OfflineState,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from '@/components/common';
import {
  SUBSTITUTION_OPTIONS,
  type SubstitutionActivity,
} from '@/domain/training/activitySubstitution';
import { useAppTheme } from '@/theme/useAppTheme';

import type { SessionSubstitutionState } from './useSessionSubstitution';

const INTRO =
  'A gentler option is the sensible choice today. Swap this session for a lower-impact one, or take a rest day. Your running week does not progress — that is fine, and expected.';

const OFFLINE_DESCRIPTION =
  'We could not swap the session because you appear to be offline. Nothing has changed. Please try again when you are back online.';

export type SubstitutionOptionsViewProps = {
  state: SessionSubstitutionState;
  onSelect: (activity: SubstitutionActivity) => void;
  onReset: () => void;
  onDone: () => void;
};

export function SubstitutionOptionsView({
  onDone,
  onReset,
  onSelect,
  state,
}: SubstitutionOptionsViewProps) {
  const { spacing } = useAppTheme();

  if (state.status === 'substituted') {
    return (
      <Card accessibilityLabel="Your session has been swapped for a gentler option.">
        <View style={{ gap: spacing.sm }}>
          <StatusBadge label="Session swapped" tone="success" />
          <AppText variant="heading">That is sorted</AppText>
          <AppText accessibilityLiveRegion="polite">
            We have swapped today&apos;s session for your gentler option and
            kept the original in your plan as replaced. We have also noted that
            a next-morning check is a good idea.
          </AppText>
          <PrimaryButton label="Done" onPress={onDone} />
        </View>
      </Card>
    );
  }

  if (state.status === 'offline') {
    return (
      <View style={{ gap: spacing.md }}>
        <OfflineState
          description={OFFLINE_DESCRIPTION}
          title="We could not swap the session"
        />
        <SecondaryButton label="Try again" onPress={onReset} />
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={{ gap: spacing.md }}>
        <ErrorState description={state.message} title="We could not swap it" />
        <SecondaryButton label="Try again" onPress={onReset} />
      </View>
    );
  }

  const submitting = state.status === 'submitting';

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <StatusBadge label="Swap for a gentler option" tone="caution" />
        <AppText>{INTRO}</AppText>
        <View style={{ gap: spacing.sm }}>
          {SUBSTITUTION_OPTIONS.map((option) => (
            <View key={option.activity} style={{ gap: spacing.xs }}>
              <PrimaryButton
                accessibilityHint={option.description}
                accessibilityLabel={`Swap to ${option.label}. ${option.description}`}
                label={option.label}
                loading={submitting}
                onPress={() => onSelect(option.activity)}
              />
              <AppText tone="secondary" variant="caption">
                {option.description}
              </AppText>
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
}
