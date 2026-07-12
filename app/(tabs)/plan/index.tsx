import { AppScreen } from '@/components/common';
import { PlanPreviewView } from '@/features/plan/PlanPreviewView';
import { usePlanPreview } from '@/features/plan/usePlanPreview';

export default function PlanScreen() {
  const state = usePlanPreview();

  return (
    <AppScreen eyebrow="Plan ahead" title="Weekly Planner">
      <PlanPreviewView state={state} />
    </AppScreen>
  );
}
