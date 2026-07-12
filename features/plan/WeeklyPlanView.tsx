// Presentational rendering of the weekly planner (S-020): seven days as
// vertically stacked cards, each showing its session, duration and state, with a
// tap target that opens the session detail sheet. Pure in its props (it takes the
// resolved planner value, not the hook) so every state can be tested without
// Supabase or auth, mirroring TodayView.
//
// All copy is British English; status is conveyed by text and icon, never colour
// alone (docs/09 §9.2); every card and control carries an accessible label and a
// 44pt touch target.

import { Pressable, View } from 'react-native';

import {
  AppText,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
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

import type { PlannerDay, PlannerSession } from './planRepository';
import { SessionDetailSheet } from './SessionDetailSheet';
import type { UseWeeklyPlanValue } from './useWeeklyPlan';

const SESSION_TONES: Record<PlanSessionType, StatusTone> = {
  achilles: 'caution',
  cardio: 'success',
  rest: 'neutral',
  strength: 'info',
};

const STATUS_LABELS: Record<string, { label: string; tone: StatusTone }> = {
  cancelled: { label: 'Cancelled', tone: 'caution' },
  completed: { label: 'Completed', tone: 'success' },
  in_progress: { label: 'In progress', tone: 'info' },
  planned: { label: 'Planned', tone: 'neutral' },
  replaced: { label: 'Replaced', tone: 'neutral' },
  skipped: { label: 'Skipped', tone: 'caution' },
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

export function WeeklyPlanView({ planner }: { planner: UseWeeklyPlanValue }) {
  const { spacing } = useAppTheme();
  const { state } = planner;

  if (state.status === 'loading') {
    return (
      <LoadingState
        description="Loading your week…"
        label="Loading your week"
      />
    );
  }

  if (state.status === 'unavailable') {
    return (
      <EmptyState
        description="Your planner can't be shown until the app is fully configured. Please try again later."
        title="Planner unavailable"
      />
    );
  }

  if (state.status === 'error') {
    return (
      <ErrorState description={state.message} title="Can't load your week" />
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

  const { week } = state;
  const selected =
    planner.selectedSessionId === null
      ? null
      : (week.days
          .flatMap((day) => day.sessions)
          .find((session) => session.id === planner.selectedSessionId) ?? null);

  return (
    <View style={{ gap: spacing.lg }}>
      <SectionHeader
        description="Your seven days at a glance. Tap a day to move, replace or skip its session."
        title={planner.weekLabel}
      />
      {week.days.map((day) => (
        <DayCard day={day} key={day.isoDate} onOpen={planner.openDetails} />
      ))}

      {selected ? (
        <SessionDetailSheet
          action={planner.action}
          actionError={planner.actionError}
          onClose={planner.closeDetails}
          onConfirm={planner.confirmChange}
          onDismissConflict={planner.dismissConflict}
          onRequestChange={planner.requestChange}
          session={selected}
          templates={week.templates}
          weekDates={week.weekDates}
        />
      ) : null}
    </View>
  );
}

function DayCard({
  day,
  onOpen,
}: {
  day: PlannerDay;
  onOpen: (sessionId: string) => void;
}) {
  const { spacing } = useAppTheme();
  const date = formatPlanDate(day.isoDate);

  if (day.sessions.length === 0) {
    return (
      <Card accessibilityLabel={`${date}. Nothing scheduled.`}>
        <AppText variant="label">{date}</AppText>
        <AppText tone="secondary">Nothing scheduled.</AppText>
      </Card>
    );
  }

  return (
    <Card>
      <AppText accessibilityRole="header" variant="label">
        {date}
      </AppText>
      <View style={{ gap: spacing.sm }}>
        {day.sessions.map((session) => (
          <SessionRow
            date={date}
            key={session.id}
            onOpen={onOpen}
            session={session}
          />
        ))}
      </View>
    </Card>
  );
}

function SessionRow({
  date,
  onOpen,
  session,
}: {
  date: string;
  onOpen: (sessionId: string) => void;
  session: PlannerSession;
}) {
  const { colours, radii, spacing } = useAppTheme();
  const label = labelFor(session);
  const status = STATUS_LABELS[session.status] ?? {
    label: session.status,
    tone: 'neutral' as StatusTone,
  };
  const duration =
    session.durationMinutes === null ? null : `${session.durationMinutes} min`;

  return (
    <Pressable
      accessibilityHint="Opens the session's move, replace and skip actions."
      accessibilityLabel={`View details for ${label} on ${date}. ${status.label}.`}
      accessibilityRole="button"
      onPress={() => onOpen(session.id)}
      style={{
        borderColor: colours.borderSubtle,
        borderRadius: radii.medium,
        borderWidth: 1,
        gap: spacing.xs,
        minHeight: 44,
        padding: spacing.md,
      }}
    >
      <View
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.xs,
          justifyContent: 'space-between',
        }}
      >
        <StatusBadge label={label} tone={toneFor(session.sessionType)} />
        <StatusBadge label={status.label} tone={status.tone} />
      </View>
      <AppText tone="secondary" variant="caption">
        {describeSessionType(session.sessionType)}
        {duration ? ` · ${duration}` : ''} · Tap to view details
      </AppText>
    </Pressable>
  );
}
