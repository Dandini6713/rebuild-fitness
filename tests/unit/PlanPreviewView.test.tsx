import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';

import { PlanPreviewView } from '@/features/plan/PlanPreviewView';
import type { PlanPreview } from '@/features/plan/planRepository';

const preview: PlanPreview = {
  name: 'Rebuild base plan',
  planId: 'plan-1',
  startsOn: '2026-08-03',
  weeks: [
    {
      sessions: [
        {
          id: 's-mon',
          scheduledDate: '2026-08-03',
          sessionType: 'strength',
          templateName: 'Strength A',
        },
        {
          id: 's-sun',
          scheduledDate: '2026-08-09',
          sessionType: 'rest',
          templateName: null,
        },
      ],
      startsOn: '2026-08-03',
      weekNumber: 1,
    },
  ],
};

describe('PlanPreviewView', () => {
  it('shows a loading indicator while the plan is loading', async () => {
    const view = await render(
      <PlanPreviewView state={{ status: 'loading' }} />,
    );
    expect(view.getByLabelText('Loading your plan')).toBeOnTheScreen();
  });

  it('shows an empty state when there is no plan yet', async () => {
    const view = await render(<PlanPreviewView state={{ status: 'empty' }} />);
    expect(view.getByText('No plan yet')).toBeOnTheScreen();
  });

  it('shows the error message when loading fails', async () => {
    const view = await render(
      <PlanPreviewView
        state={{
          message: 'Check your connection and try again.',
          status: 'error',
        }}
      />,
    );
    expect(
      view.getByText('Check your connection and try again.'),
    ).toBeOnTheScreen();
  });

  it('renders the seeded weeks with template names and rest days', async () => {
    const view = await render(
      <PlanPreviewView state={{ preview, status: 'ready' }} />,
    );
    expect(view.getByText('Your first four weeks')).toBeOnTheScreen();
    expect(view.getByText('Week 1')).toBeOnTheScreen();
    // Strength badges use the 'info' tone (symbol 'i'); rest uses 'neutral' ('•').
    expect(view.getByText('i Strength A')).toBeOnTheScreen();
    expect(view.getByText('• Rest day')).toBeOnTheScreen();
  });
});
