import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';

import { ExerciseGuideView } from '@/features/catalogue/ExerciseGuideView';
import type { GuideViewState } from '@/features/catalogue/useExerciseGuide';

const ready: GuideViewState = {
  name: 'Leg press',
  sections: [
    { body: 'Set the seat.', key: 'equipment-setup', title: 'Equipment setup' },
    { body: 'Sit tall.', key: 'starting-position', title: 'Starting position' },
    { body: 'Press away.', key: 'movement', title: 'Movement' },
    {
      body: 'Stop for sharp pain or a sudden Achilles change.',
      key: 'stop-criteria',
      title: 'Stop criteria',
    },
  ],
  status: 'ready',
};

describe('ExerciseGuideView', () => {
  it('renders the exercise name and each populated section in order', async () => {
    const { getByText, queryByText } = await render(
      <ExerciseGuideView state={ready} />,
    );
    expect(getByText('Leg press')).toBeTruthy();
    expect(getByText('Equipment setup')).toBeTruthy();
    expect(getByText('Starting position')).toBeTruthy();
    expect(getByText('Movement')).toBeTruthy();
    // Breathing was not supplied, so it shows no heading.
    expect(queryByText('Breathing')).toBeNull();
  });

  it('presents stop criteria as safety guidance without implying diagnosis', async () => {
    const { getByText } = await render(<ExerciseGuideView state={ready} />);
    expect(getByText('Stop criteria')).toBeTruthy();
    // Icon-and-text status badge, not colour alone.
    expect(getByText('! When to stop')).toBeTruthy();
    // The non-diagnostic boundary line (docs/07).
    expect(getByText(/does not assess or treat injury/i)).toBeTruthy();
  });

  it('shows a friendly not-found state for an unknown exercise', async () => {
    const { getByText } = await render(
      <ExerciseGuideView state={{ status: 'not-found' }} />,
    );
    expect(getByText('Exercise not found')).toBeTruthy();
  });

  it('shows the error state when the read fails', async () => {
    const { getByText } = await render(
      <ExerciseGuideView state={{ message: 'Boom', status: 'error' }} />,
    );
    expect(getByText("Can't load this exercise")).toBeTruthy();
  });

  it('degrades gracefully when an exercise has no populated sections', async () => {
    const { getByText } = await render(
      <ExerciseGuideView
        state={{ name: 'Bare', sections: [], status: 'ready' }}
      />,
    );
    expect(getByText('Bare')).toBeTruthy();
    expect(getByText('Guide coming soon')).toBeTruthy();
  });
});
