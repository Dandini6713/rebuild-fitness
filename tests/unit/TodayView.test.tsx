import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import { TodayView } from '@/features/today/TodayView';
import type { TodayReadModel } from '@/features/today/todayRepository';
import type { TodayViewState } from '@/features/today/useToday';

const noop: (scheduledSessionId: string) => void = () => undefined;

const baseModel = (
  overrides: Partial<TodayReadModel> = {},
): TodayReadModel => ({
  adherence: { completed: 0, percent: null, planned: 0 },
  nutrition: { kind: 'no-target' },
  session: { kind: 'none' },
  ...overrides,
});

function renderView(
  state: TodayViewState,
  onStart: (scheduledSessionId: string) => void = noop,
  onOpenPlayer: (scheduledSessionId: string) => void = noop,
) {
  return render(
    <TodayView
      greeting="Good afternoon"
      onOpenPlayer={onOpenPlayer}
      onStart={onStart}
      startError={null}
      starting={false}
      state={state}
      todayIso="2026-07-15"
    />,
  );
}

const activeSession = {
  id: 's-wed',
  scheduledDate: '2026-07-15',
  sessionType: 'strength',
  status: 'planned',
  templateName: 'Strength A',
} as const;

describe('TodayView — shell states', () => {
  it('shows a loading indicator while today loads', async () => {
    const view = await renderView({ status: 'loading' });
    expect(view.getByLabelText('Loading today')).toBeOnTheScreen();
  });

  it('shows the error state on a query failure', async () => {
    const view = await renderView({
      message: 'Check your connection and try again.',
      status: 'error',
    });
    expect(
      view.getByText('Check your connection and try again.'),
    ).toBeOnTheScreen();
  });

  it('shows an unavailable state when the repository is not configured', async () => {
    const view = await renderView({ status: 'unavailable' });
    expect(view.getByText('Today unavailable')).toBeOnTheScreen();
  });
});

describe('TodayView — session states', () => {
  it('shows the greeting and the real date', async () => {
    const view = await renderView({ data: baseModel(), status: 'ready' });
    expect(view.getByText('Good afternoon')).toBeOnTheScreen();
    expect(view.getByText('Wednesday 15 July')).toBeOnTheScreen();
  });

  it('offers an easy walk or mobility when nothing is planned, without requiring it', async () => {
    const view = await renderView({ data: baseModel(), status: 'ready' });
    expect(view.getByText('Nothing planned today')).toBeOnTheScreen();
    expect(
      view.getByText(/easy walk or some gentle mobility/),
    ).toBeOnTheScreen();
  });

  it('reads a rest day as a calm, positive state', async () => {
    const view = await renderView({
      data: baseModel({
        session: {
          kind: 'rest',
          session: {
            id: 's-sun',
            scheduledDate: '2026-07-19',
            sessionType: 'rest',
            status: 'planned',
            templateName: null,
          },
        },
      }),
      status: 'ready',
    });
    expect(view.getByText('A planned rest day')).toBeOnTheScreen();
    expect(view.getByText('• Rest day')).toBeOnTheScreen();
  });

  it('shows a completed session with a success status', async () => {
    const view = await renderView({
      data: baseModel({
        session: { kind: 'completed', session: { ...activeSession } },
      }),
      status: 'ready',
    });
    expect(view.getByText('✓ Completed')).toBeOnTheScreen();
    expect(view.getByText('Strength A done')).toBeOnTheScreen();
  });

  it('shows the dominant start action for a training session and fires it', async () => {
    const onStart = jest.fn<(scheduledSessionId: string) => void>();
    const view = await renderView(
      {
        data: baseModel({
          session: {
            inProgress: false,
            kind: 'active',
            session: activeSession,
          },
        }),
        status: 'ready',
      },
      onStart,
    );
    fireEvent.press(view.getByLabelText("Start today's session"));
    expect(onStart).toHaveBeenCalledWith('s-wed');
    // Reschedule and recovery are present but clearly marked as later stubs.
    expect(view.getByText('Reschedule')).toBeOnTheScreen();
    expect(view.getByText('Swap for a recovery option')).toBeOnTheScreen();
  });

  it('shows the honest red result instead of a start button when the start is blocked', async () => {
    // A red pre-session readiness result blocked the start (docs/06 §6.5, docs/07
    // §7.4). Today must show the red result and NOT offer a way to start anyway.
    const onStart = jest.fn<(scheduledSessionId: string) => void>();
    const view = await render(
      <TodayView
        greeting="Good afternoon"
        onOpenPlayer={noop}
        onStart={onStart}
        startBlocked
        startError={null}
        starting={false}
        state={{
          data: baseModel({
            session: {
              inProgress: false,
              kind: 'active',
              session: activeSession,
            },
          }),
          status: 'ready',
        }}
        todayIso="2026-07-15"
      />,
    );
    expect(view.getByText('Do not start this session')).toBeOnTheScreen();
    expect(
      view.getByText(
        /your most recent readiness check for this session was red/i,
      ),
    ).toBeOnTheScreen();
    // No overridable start control is offered.
    expect(view.queryByLabelText("Start today's session")).toBeNull();
  });

  it('offers to continue an in-progress session and opens the player', async () => {
    const onOpenPlayer = jest.fn<(scheduledSessionId: string) => void>();
    const view = await renderView(
      {
        data: baseModel({
          session: { inProgress: true, kind: 'active', session: activeSession },
        }),
        status: 'ready',
      },
      noop,
      onOpenPlayer,
    );
    expect(view.getByText('i In progress')).toBeOnTheScreen();
    expect(view.queryByLabelText("Start today's session")).toBeNull();
    fireEvent.press(view.getByLabelText("Continue today's session"));
    expect(onOpenPlayer).toHaveBeenCalledWith('s-wed');
  });

  it('shows an Achilles note only on an Achilles day, with no medical claim', async () => {
    const view = await renderView({
      data: baseModel({
        session: {
          inProgress: false,
          kind: 'active',
          session: {
            ...activeSession,
            sessionType: 'achilles',
            templateName: null,
          },
        },
      }),
      status: 'ready',
    });
    expect(view.getByText('Achilles strength and mobility')).toBeOnTheScreen();
    expect(
      view.getByText(/does not assess whether the tendon is healed/),
    ).toBeOnTheScreen();
  });
});

describe('TodayView — nutrition and adherence', () => {
  it('says no target is set rather than showing a zero', async () => {
    const view = await renderView({ data: baseModel(), status: 'ready' });
    expect(
      view.getByText(/No calorie or protein target is set yet/),
    ).toBeOnTheScreen();
  });

  it('shows the target alone when there is no intake source yet', async () => {
    const view = await renderView({
      data: baseModel({
        nutrition: {
          calories: 2100,
          caloriesProgress: null,
          effectiveFrom: '2026-07-01',
          kind: 'target',
          proteinG: 145,
          proteinProgress: null,
        },
      }),
      status: 'ready',
    });
    expect(view.getByText('Target 2,100 kcal')).toBeOnTheScreen();
    expect(view.getByText('Target 145 g')).toBeOnTheScreen();
    expect(
      view.getByText(/Food logging arrives in a later update/),
    ).toBeOnTheScreen();
  });

  it('shows progress against the target when intake is available', async () => {
    const view = await renderView({
      data: baseModel({
        nutrition: {
          calories: 2100,
          caloriesProgress: {
            consumed: 1400,
            percent: 67,
            remaining: 700,
            target: 2100,
          },
          effectiveFrom: '2026-07-01',
          kind: 'target',
          proteinG: 145,
          proteinProgress: {
            consumed: 90,
            percent: 62,
            remaining: 55,
            target: 145,
          },
        },
      }),
      status: 'ready',
    });
    expect(
      view.getByText('1,400 kcal of 2,100 kcal · 700 kcal remaining'),
    ).toBeOnTheScreen();
  });

  it('shows a weekly adherence summary', async () => {
    const view = await renderView({
      data: baseModel({ adherence: { completed: 2, percent: 50, planned: 4 } }),
      status: 'ready',
    });
    expect(view.getByText('2 of 4 sessions completed')).toBeOnTheScreen();
  });

  it('says the week has not started when nothing is planned', async () => {
    const view = await renderView({ data: baseModel(), status: 'ready' });
    expect(
      view.getByText(/No training sessions are scheduled this week yet/),
    ).toBeOnTheScreen();
  });
});
