import { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/common';
import { useAppTheme } from '@/theme/useAppTheme';

export type Option<T extends string> = { label: string; value: T };

type OptionRowProps = {
  checked: boolean;
  label: string;
  multiple: boolean;
  onPress(): void;
};

function OptionRow({ checked, label, multiple, onPress }: OptionRowProps) {
  const { colours, radii, spacing, touchTargets } = useAppTheme();

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityState={{ checked, selected: checked }}
      onPress={onPress}
      style={{
        alignItems: 'center',
        backgroundColor: checked ? colours.accentSoft : colours.surface,
        borderColor: checked ? colours.accent : colours.border,
        borderRadius: radii.medium,
        borderWidth: 1,
        flexDirection: 'row',
        gap: spacing.sm,
        minHeight: touchTargets.comfortable,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <View
        accessibilityElementsHidden
        style={{
          alignItems: 'center',
          borderColor: checked ? colours.accent : colours.border,
          borderRadius: multiple ? radii.small : radii.pill,
          borderWidth: 2,
          height: 22,
          justifyContent: 'center',
          width: 22,
        }}
      >
        {checked ? (
          <View
            style={{
              backgroundColor: colours.accent,
              borderRadius: multiple ? 2 : radii.pill,
              height: 12,
              width: 12,
            }}
          />
        ) : null}
      </View>
      <AppText style={{ flex: 1 }}>{label}</AppText>
    </Pressable>
  );
}

type FieldFrameProps = {
  children: ReactNode;
  description?: string | undefined;
  error?: string | undefined;
  label: string;
};

function FieldFrame({ children, description, error, label }: FieldFrameProps) {
  const { colours, spacing } = useAppTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label">{label}</AppText>
      {description ? (
        <AppText tone="secondary" variant="caption">
          {description}
        </AppText>
      ) : null}
      <View style={{ gap: spacing.xs }}>{children}</View>
      {error ? (
        <AppText
          accessibilityLiveRegion="polite"
          style={{ color: colours.dangerText }}
          variant="caption"
        >
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

type OptionGroupProps<T extends string> = {
  description?: string;
  error?: string | undefined;
  label: string;
  onChange(value: T): void;
  options: readonly Option<T>[];
  value: '' | T;
};

export function OptionGroup<T extends string>({
  description,
  error,
  label,
  onChange,
  options,
  value,
}: OptionGroupProps<T>) {
  return (
    <FieldFrame description={description} error={error} label={label}>
      {options.map((option) => (
        <OptionRow
          checked={option.value === value}
          key={option.value}
          label={option.label}
          multiple={false}
          onPress={() => onChange(option.value)}
        />
      ))}
    </FieldFrame>
  );
}

type CheckboxFieldProps = {
  checked: boolean;
  description?: string;
  error?: string | undefined;
  label: string;
  onChange(checked: boolean): void;
};

export function CheckboxField({
  checked,
  description,
  error,
  label,
  onChange,
}: CheckboxFieldProps) {
  const { colours, spacing } = useAppTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      <OptionRow
        checked={checked}
        label={label}
        multiple
        onPress={() => onChange(!checked)}
      />
      {description ? (
        <AppText tone="secondary" variant="caption">
          {description}
        </AppText>
      ) : null}
      {error ? (
        <AppText
          accessibilityLiveRegion="polite"
          style={{ color: colours.dangerText }}
          variant="caption"
        >
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

type MultiOptionGroupProps<T extends string> = {
  description?: string;
  error?: string | undefined;
  label: string;
  onChange(values: T[]): void;
  options: readonly Option<T>[];
  values: readonly T[];
};

export function MultiOptionGroup<T extends string>({
  description,
  error,
  label,
  onChange,
  options,
  values,
}: MultiOptionGroupProps<T>) {
  function toggle(value: T) {
    onChange(
      values.includes(value)
        ? values.filter((entry) => entry !== value)
        : [...values, value],
    );
  }

  return (
    <FieldFrame description={description} error={error} label={label}>
      {options.map((option) => (
        <OptionRow
          checked={values.includes(option.value)}
          key={option.value}
          label={option.label}
          multiple
          onPress={() => toggle(option.value)}
        />
      ))}
    </FieldFrame>
  );
}
