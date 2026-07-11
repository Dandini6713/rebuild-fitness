import { AppScreen, EmptyState, SectionHeader } from '@/components/common';

export default function PlanScreen() {
  return (
    <AppScreen eyebrow="Plan ahead" title="Weekly Planner">
      <SectionHeader
        description="Your seven-day plan will be shown as clear, movable session cards."
        title="This week"
      />
      <EmptyState
        description="Your sessions will appear here after the planning features are connected."
        title="No plan yet"
      />
    </AppScreen>
  );
}
