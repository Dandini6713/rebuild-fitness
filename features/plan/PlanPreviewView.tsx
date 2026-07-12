// Presentational rendering of the seeded plan preview. Pure in its props (it
// takes the resolved state, not the hook) so every state can be tested without
// Supabase or auth. It renders the read-only first weeks of the plan; starting
// sessions and the richer planner are later roadmap steps.

import { ActivityIndicator, View } from 'react-native';

import {
  AppText,
  Card,
  EmptyState,
  SectionHeader,
  StatusBadge,
  type StatusTone,
} from '@/components/common';
import {
  describeSessionType,
  formatPlanDate,
  type PlanSessionType,
} from '@/domain/training/planSchedule';
import { useAppTheme } from '@/theme/useAppTheme';

import type { PlanPreviewSession, PlanPreviewWeek } from './planRepository';
import type { PlanPreviewState } from './usePlanPreview';

const SESSION_TONES: Record<PlanSessionType, StatusTone> = {
  achilles: 'caution',
  cardio: 'success',
  rest: 'neutral',
  strength: 'info',
};

function toneFor(sessionType: string): StatusTone {
  return SESSION_TONES[sessionType as PlanSessionType] ?? 'neutral';
}

function SessionRow({ session }: { session: PlanPreviewSession }) {
  const { spacing } = useAppTheme();
  return (
    <View style={{ gap: spacing.xxs }}>
      <StatusBadge
        label={session.templateName ?? describeSessionType(session.sessionType)}
        tone={toneFor(session.sessionType)}
      />
      <AppText tone="secondary" variant="caption">
        {formatPlanDate(session.scheduledDate)}
      </AppText>
    </View>
  );
}

function WeekCard({ week }: { week: PlanPreviewWeek }) {
  const { spacing } = useAppTheme();
  return (
    <Card>
      <SectionHeader
        description={`Week beginning ${formatPlanDate(week.startsOn)}`}
        title={`Week ${week.weekNumber}`}
      />
      <View style={{ gap: spacing.md }}>
        {week.sessions.map((session) => (
          <SessionRow key={session.id} session={session} />
        ))}
      </View>
    </Card>
  );
}

export function PlanPreviewView({ state }: { state: PlanPreviewState }) {
  const { colours, spacing } = useAppTheme();

  if (state.status === 'loading') {
    return (
      <View
        accessibilityLabel="Loading your plan"
        accessibilityRole="progressbar"
        style={{ gap: spacing.md, paddingVertical: spacing.xl }}
      >
        <ActivityIndicator color={colours.accent} size="large" />
        <AppText tone="secondary">Loading your plan…</AppText>
      </View>
    );
  }

  if (state.status === 'unavailable') {
    return (
      <EmptyState
        description="Your plan can't be shown until the app is fully configured. Please try again later."
        title="Plan unavailable"
      />
    );
  }

  if (state.status === 'error') {
    return (
      <EmptyState description={state.message} title="Can't load your plan" />
    );
  }

  if (state.status === 'empty') {
    return (
      <EmptyState
        description="Your twelve-week plan will appear here once you finish setting up."
        title="No plan yet"
      />
    );
  }

  return (
    <View style={{ gap: spacing.lg }}>
      <SectionHeader
        description="A read-only look at how your first four weeks are laid out."
        title="Your first four weeks"
      />
      {state.preview.weeks.map((week) => (
        <WeekCard key={week.weekNumber} week={week} />
      ))}
    </View>
  );
}
