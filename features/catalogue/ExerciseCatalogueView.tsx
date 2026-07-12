// Presentational list for the exercise catalogue (roadmap 10). Pure in its props
// (it takes the resolved catalogue state and an open callback, not the hook), so
// every state can be tested without Supabase or auth, mirroring WeeklyPlanView.
//
// A minimal browser by design: exercises grouped into their two strength sessions,
// each a tap target that opens its S-013 guide. No search or filtering — the guide
// itself is the deliverable for this step, and the workout player that will link
// each exercise to its guide in context arrives in roadmap 11. All copy is British
// English; every row carries an accessible label and a 44pt touch target.

import { Pressable, View } from 'react-native';

import {
  AppText,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  SectionHeader,
} from '@/components/common';
import type { CatalogueExercise } from '@/domain/training/exerciseCatalogue';
import { useAppTheme } from '@/theme/useAppTheme';

import type { CatalogueViewState } from './useExerciseCatalogue';

export function ExerciseCatalogueView({
  onOpen,
  state,
}: {
  state: CatalogueViewState;
  onOpen: (slug: string) => void;
}) {
  const { spacing } = useAppTheme();

  if (state.status === 'loading') {
    return (
      <LoadingState
        description="Loading the exercise guide…"
        label="Loading the exercise guide"
      />
    );
  }

  if (state.status === 'unavailable') {
    return (
      <EmptyState
        description="The exercise guide can't be shown until the app is fully configured. Please try again later."
        title="Guide unavailable"
      />
    );
  }

  if (state.status === 'error') {
    return (
      <ErrorState description={state.message} title="Can't load the guide" />
    );
  }

  if (state.status === 'empty') {
    return (
      <EmptyState
        description="Exercises will appear here once the catalogue is set up."
        title="No exercises yet"
      />
    );
  }

  return (
    <View style={{ gap: spacing.lg }}>
      <SectionHeader
        description="Plain-English guides to every exercise in your strength sessions. Tap one to read how to set up, move and stay safe."
        title="Exercise guide"
      />
      {state.groups.map((group) => (
        <View key={group.key} style={{ gap: spacing.sm }}>
          <AppText accessibilityRole="header" variant="label">
            {group.title}
          </AppText>
          <Card>
            <View style={{ gap: spacing.sm }}>
              {group.exercises.map((exercise) => (
                <ExerciseRow
                  exercise={exercise}
                  key={exercise.slug}
                  onOpen={onOpen}
                />
              ))}
            </View>
          </Card>
        </View>
      ))}
    </View>
  );
}

function ExerciseRow({
  exercise,
  onOpen,
}: {
  exercise: CatalogueExercise;
  onOpen: (slug: string) => void;
}) {
  const { colours, radii, spacing } = useAppTheme();

  return (
    <Pressable
      accessibilityHint="Opens the plain-English guide for this exercise."
      accessibilityLabel={`Read the guide for ${exercise.name}`}
      accessibilityRole="button"
      onPress={() => onOpen(exercise.slug)}
      style={{
        alignItems: 'center',
        borderColor: colours.borderSubtle,
        borderRadius: radii.medium,
        borderWidth: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        minHeight: 44,
        padding: spacing.md,
      }}
    >
      <AppText variant="label">{exercise.name}</AppText>
      <AppText accessibilityElementsHidden tone="tertiary" variant="heading">
        ›
      </AppText>
    </Pressable>
  );
}
