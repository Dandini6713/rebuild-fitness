import { useColorScheme } from 'react-native';

import {
  darkColours,
  lightColours,
  radii,
  shadows,
  spacing,
  touchTargets,
  typography,
} from './tokens';

export function useAppTheme() {
  const isDark = useColorScheme() === 'dark';

  return {
    colours: isDark ? darkColours : lightColours,
    isDark,
    radii,
    shadows,
    spacing,
    touchTargets,
    typography,
  };
}

export type AppTheme = ReturnType<typeof useAppTheme>;
