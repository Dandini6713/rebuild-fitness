import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import { WeeklyPlanView } from '@/features/plan/WeeklyPlanView';
import type { PlannerWeek, WeekResult } from '@/features/plan/planRepository';
import type {
  PlannerActionState,
  UseWeeklyPlanValue,
} from '@/features/plan/useWeeklyPlan';

const week: PlannerWeek = {
  days: [
    {
      isoDate: '2026-08-03',
      sessions: [
        {
          durationMinutes: 45,
          id: 's-mon',
          scheduledDate: '2026-08-03',
          sessionType: 'strength',
          status: 'planned',
          templateId: 't-a',
          templateName: 'Strength A',
        },
      ],
    },
    { isoDate: '2026-08-04', sessions: [] },
    {
      isoDate: '2026-08-09',
      sessions: [
        {
          durationMinutes: null,
          id: 's-sun',
          scheduledDate: '2026-08-09',
          sessionType: 'rest',
          status: 'planned',
          templateId: null,
          templateName: null,
        },
      ],
    },
  ],
  planName: 'Rebuild base plan',
  templates: [{ id: 't-a', name: 'Strength A' }],
  weekDates: [
    '2026-08-03',
    '2026-08-04',
    '2026-08-05',
    '2026-08-06',
    '2026-08-07',
    '2026-08-08',
    '2026-08-09',
  ],
  weekEnd: '2026-08-09',
  weekStart: '2026-08-03',
};

function planner(
  overrides: Partial<UseWeeklyPlanValue> = {},
): UseWeeklyPlanValue {
  return {
    action: { kind: 'idle' } as PlannerActionState,
    actionError: null,
    closeDetails: jest.fn(),
    confirmChange: jest.fn(),
    dismissConflict: jest.fn(),
    openDetails: jest.fn(),
    requestChange: jest.fn(),
    selectedSessionId: null,
    state: { status: 'ready', week } satisfies WeekResult,
    weekLabel: 'Week of Monday 3 August',
    ...overrides,
  };
}

describe('WeeklyPlanView — states', () => {
  it('shows a loading indicator while the week loads', async () => {
    const view = await render(
      <WeeklyPlanView planner={planner({ state: { status: 'loading' } })} />,
    );
    expect(view.getByLabelText('Loading your week')).toBeOnTheScreen();
  });

  it('shows the unavailable state when the app is not configured', async () => {
    const view = await render(
      <WeeklyPlanView
        planner={planner({ state: { status: 'unavailable' } })}
      />,
    );
    expect(view.getByText('Planner unavailable')).toBeOnTheScreen();
  });

  it('shows the empty state when there is no plan yet', async () => {
    const view = await render(
      <WeeklyPlanView planner={planner({ state: { status: 'empty' } })} />,
    );
    expect(view.getByText('No plan yet')).toBeOnTheScreen();
  });

  it('shows the error state on a query failure', async () => {
    const view = await render(
      <WeeklyPlanView
        planner={planner({
          state: { message: 'Check your connection.', status: 'error' },
        })}
      />,
    );
    expect(view.getByText('Check your connection.')).toBeOnTheScreen();
  });
});

describe('WeeklyPlanView — seven day cards', () => {
  it('renders the week label and a card per day', async () => {
    const view = await render(<WeeklyPlanView planner={planner()} />);
    expect(view.getByText('Week of Monday 3 August')).toBeOnTheScreen();
    expect(view.getByText('Monday 3 August')).toBeOnTheScreen();
    expect(view.getByText('Sunday 9 August')).toBeOnTheScreen();
    // The strength session shows its template name and duration.
    expect(view.getByText('i Strength A')).toBeOnTheScreen();
  });

  it('shows a plain message on a day with nothing scheduled', async () => {
    const view = await render(<WeeklyPlanView planner={planner()} />);
    expect(view.getByText('Nothing scheduled.')).toBeOnTheScreen();
  });

  it('opens the detail sheet for a session when its card is pressed', async () => {
    const openDetails = jest.fn();
    const view = await render(
      <WeeklyPlanView planner={planner({ openDetails })} />,
    );
    fireEvent.press(
      view.getByLabelText(
        'View details for Strength A on Monday 3 August. Planned.',
      ),
    );
    expect(openDetails).toHaveBeenCalledWith('s-mon');
  });
});

describe('WeeklyPlanView — session detail sheet', () => {
  const selected = () =>
    planner({
      selectedSessionId: 's-mon',
    });

  it('shows the session and its move, replace and skip actions', async () => {
    const view = await render(<WeeklyPlanView planner={selected()} />);
    expect(
      view.getByLabelText('Move this session to another day'),
    ).toBeOnTheScreen();
    expect(view.getByLabelText('Replace this session')).toBeOnTheScreen();
    expect(view.getByLabelText('Skip this session')).toBeOnTheScreen();
  });

  it('requests a skip through the repository-backed callback', async () => {
    const requestChange = jest.fn();
    const view = await render(
      <WeeklyPlanView
        planner={planner({ requestChange, selectedSessionId: 's-mon' })}
      />,
    );
    fireEvent.press(view.getByLabelText('Skip this session'));
    expect(requestChange).toHaveBeenCalledWith({
      kind: 'skip',
      sessionId: 's-mon',
    });
  });

  it('blocks a hard conflict with its explanation and no way to proceed', async () => {
    const view = await render(
      <WeeklyPlanView
        planner={planner({
          action: {
            conflicts: [
              {
                code: 'two-demanding-lower-body-same-day',
                message:
                  'This would schedule two demanding lower-body sessions on the same day. Please move one of them to a different day.',
                severity: 'hard',
              },
            ],
            kind: 'blocked',
          },
          selectedSessionId: 's-mon',
        })}
      />,
    );
    // The heading sits in a caution StatusBadge, which prefixes its "!" symbol.
    expect(view.getByText("! This change can't be saved")).toBeOnTheScreen();
    expect(
      view.getByText(/two demanding lower-body sessions on the same day/),
    ).toBeOnTheScreen();
    // A hard block never offers a "save anyway" affordance.
    expect(view.queryByLabelText('Save this change anyway')).toBeNull();
  });

  it('lets a soft warning be acknowledged before saving', async () => {
    const confirmChange = jest.fn();
    const view = await render(
      <WeeklyPlanView
        planner={planner({
          action: {
            action: { kind: 'skip', sessionId: 's-mon' },
            conflicts: [
              {
                code: 'lower-body-before-run',
                message:
                  'This places a demanding lower-body session the day before a run. Your legs may still be tired, so you might prefer to leave a day between them.',
                severity: 'soft',
              },
            ],
            kind: 'confirm',
          },
          confirmChange,
          selectedSessionId: 's-mon',
        })}
      />,
    );
    expect(view.getByText('! Check this before saving')).toBeOnTheScreen();
    fireEvent.press(view.getByLabelText('Save this change anyway'));
    expect(confirmChange).toHaveBeenCalled();
  });
});
