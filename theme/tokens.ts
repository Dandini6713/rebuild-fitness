import { TextStyle, ViewStyle } from 'react-native';

const colourPrimitives = {
  evergreen900: '#16342f',
  evergreen800: '#1f4a42',
  evergreen700: '#285e54',
  evergreen300: '#92c9b4',
  evergreen200: '#b8dccd',
  paper50: '#fbf9f4',
  paper100: '#f4f0e8',
  paper200: '#e9e3d8',
  slate950: '#13201e',
  slate900: '#1b2927',
  slate800: '#293835',
  slate700: '#42514e',
  slate500: '#697672',
  slate400: '#8d9894',
  slate200: '#cad1ce',
  slate100: '#e2e7e4',
  white: '#ffffff',
  amber900: '#5d4300',
  amber300: '#f0cb68',
  amber100: '#fff1c2',
  clay800: '#7a2d2d',
  clay300: '#e49a93',
  clay100: '#fbe1dd',
  blue800: '#24536b',
  blue300: '#91bed1',
  blue100: '#deeff5',
} as const;

export const lightColours = {
  background: colourPrimitives.paper50,
  surface: colourPrimitives.white,
  surfaceRaised: colourPrimitives.white,
  surfaceMuted: colourPrimitives.paper100,
  textPrimary: colourPrimitives.slate950,
  textSecondary: colourPrimitives.slate700,
  textTertiary: colourPrimitives.slate500,
  textDisabled: colourPrimitives.slate400,
  border: colourPrimitives.slate200,
  borderSubtle: colourPrimitives.slate100,
  accent: colourPrimitives.evergreen700,
  accentPressed: colourPrimitives.evergreen800,
  accentSoft: colourPrimitives.evergreen200,
  onAccent: colourPrimitives.white,
  successBackground: '#deeee7',
  successText: colourPrimitives.evergreen800,
  cautionBackground: colourPrimitives.amber100,
  cautionText: colourPrimitives.amber900,
  dangerBackground: colourPrimitives.clay100,
  dangerText: colourPrimitives.clay800,
  infoBackground: colourPrimitives.blue100,
  infoText: colourPrimitives.blue800,
  track: colourPrimitives.paper200,
  shadow: colourPrimitives.slate950,
} as const;

export const darkColours: ColourTokens = {
  background: colourPrimitives.slate950,
  surface: colourPrimitives.slate900,
  surfaceRaised: colourPrimitives.slate800,
  surfaceMuted: '#22312e',
  textPrimary: colourPrimitives.paper50,
  textSecondary: colourPrimitives.slate200,
  textTertiary: colourPrimitives.slate400,
  textDisabled: colourPrimitives.slate500,
  border: '#42514e',
  borderSubtle: '#31413e',
  accent: colourPrimitives.evergreen300,
  accentPressed: colourPrimitives.evergreen200,
  accentSoft: colourPrimitives.evergreen900,
  onAccent: colourPrimitives.slate950,
  successBackground: colourPrimitives.evergreen900,
  successText: colourPrimitives.evergreen300,
  cautionBackground: '#3e3214',
  cautionText: colourPrimitives.amber300,
  dangerBackground: '#482626',
  dangerText: colourPrimitives.clay300,
  infoBackground: '#203b48',
  infoText: colourPrimitives.blue300,
  track: '#34433f',
  shadow: '#000000',
};

export type ColourTokens = { [Key in keyof typeof lightColours]: string };

export const spacing = {
  none: 0,
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  small: 8,
  medium: 12,
  large: 18,
  pill: 999,
} as const;

export const touchTargets = {
  minimum: 44,
  comfortable: 52,
} as const;

export const typography = {
  display: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -0.7,
    lineHeight: 43,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.35,
    lineHeight: 34,
  },
  heading: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.1,
    lineHeight: 26,
  },
  body: { fontSize: 17, fontWeight: '400', lineHeight: 25 },
  label: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.1,
    lineHeight: 20,
  },
  caption: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.15,
    lineHeight: 18,
  },
} satisfies Record<string, TextStyle>;

export const shadows = {
  none: {} as ViewStyle,
  card: {
    elevation: 2,
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  } satisfies ViewStyle,
} as const;

export const tokens = {
  colours: { dark: darkColours, light: lightColours },
  radii,
  shadows,
  spacing,
  touchTargets,
  typography,
} as const;
