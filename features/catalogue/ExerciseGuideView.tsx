// Presentational rendering of the S-013 Exercise guide (roadmap 10). Pure in its
// props (the resolved guide state, not the hook), so every state is testable
// without Supabase or auth, mirroring TodayView and WeeklyPlanView.
//
// The seven sections come pre-ordered and pre-filtered from buildGuideSections, so
// an exercise with no content for a section shows no heading for it rather than an
// empty one. Language assumes no prior gym knowledge and is British English
// throughout. The stop-criteria section is presented as plain safety guidance,
// conveyed by icon and text (never colour alone) with a StatusBadge; it explicitly
// does not diagnose, treat or assess injury (docs/07). Every section carries an
// accessible label.

import { View } from 'react-native';

import {
  AppText,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusBadge,
} from '@/components/common';
import type { GuideSection } from '@/domain/training/exerciseCatalogue';
import { useAppTheme } from '@/theme/useAppTheme';

import type { GuideViewState } from './useExerciseGuide';

// A calm, honest boundary line for the safety section: the app helps you train
// sensibly, it does not judge whether anything is wrong with you (docs/07).
const STOP_CRITERIA_NOTE =
  'This is general guidance to help you train safely. It is not medical advice, and the app does not assess or treat injury. If something hurts or worries you, stop and speak to a suitably qualified professional.';

export function ExerciseGuideView({ state }: { state: GuideViewState }) {
  const { spacing } = useAppTheme();

  if (state.status === 'loading') {
    return (
      <LoadingState
        description="Loading this exercise…"
        label="Loading this exercise"
      />
    );
  }

  if (state.status === 'unavailable') {
    return (
      <EmptyState
        description="This guide can't be shown until the app is fully configured. Please try again later."
        title="Guide unavailable"
      />
    );
  }

  if (state.status === 'error') {
    return (
      <ErrorState
        description={state.message}
        title="Can't load this exercise"
      />
    );
  }

  if (state.status === 'not-found') {
    return (
      <EmptyState
        description="We don't have a guide for that exercise. It may have been renamed or removed."
        title="Exercise not found"
      />
    );
  }

  return (
    <View style={{ gap: spacing.lg }}>
      <AppText accessibilityRole="header" variant="heading">
        {state.name}
      </AppText>
      {state.sections.length === 0 ? (
        <EmptyState
          description="A plain-English guide for this exercise is on its way."
          title="Guide coming soon"
        />
      ) : (
        state.sections.map((section) =>
          section.key === 'stop-criteria' ? (
            <StopCriteriaSection key={section.key} section={section} />
          ) : (
            <GuideSectionCard key={section.key} section={section} />
          ),
        )
      )}
    </View>
  );
}

function GuideSectionCard({ section }: { section: GuideSection }) {
  const { spacing } = useAppTheme();
  return (
    <Card accessibilityLabel={`${section.title}. ${section.body}`}>
      <View style={{ gap: spacing.xs }}>
        <AppText accessibilityRole="header" variant="label">
          {section.title}
        </AppText>
        <AppText tone="secondary">{section.body}</AppText>
      </View>
    </Card>
  );
}

// Stop criteria: the safety section. Marked with a caution StatusBadge (icon and
// text, so it never relies on colour alone) and paired with the non-diagnostic
// note. Announced politely — it is important guidance, not an active alarm.
function StopCriteriaSection({ section }: { section: GuideSection }) {
  const { spacing } = useAppTheme();
  return (
    <Card
      accessibilityLabel={`${section.title}. ${section.body}. ${STOP_CRITERIA_NOTE}`}
    >
      <StatusBadge label="When to stop" tone="caution" />
      <View accessibilityLiveRegion="polite" style={{ gap: spacing.xs }}>
        <AppText accessibilityRole="header" variant="label">
          {section.title}
        </AppText>
        <AppText tone="secondary">{section.body}</AppText>
        <AppText tone="tertiary" variant="caption">
          {STOP_CRITERIA_NOTE}
        </AppText>
      </View>
    </Card>
  );
}
