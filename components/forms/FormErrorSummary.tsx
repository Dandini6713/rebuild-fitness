// A shared, accessible error SUMMARY for forms (docs/09 §9.8: "Forms show errors next to
// the field AND in an accessible summary"). The per-field inline messages already satisfy
// the "next to the field" half; this component is the "accessible summary" half — one
// consolidated panel that a screen reader announces when validation fails, so a user who
// has just pressed submit hears every problem at once rather than having to hunt field by
// field.
//
// It conveys its status by icon + text (a caution StatusBadge), never colour alone
// (docs/09 §9.2), and is an assertive live region + accessibilityRole="alert" so it is
// announced the moment it appears. It renders nothing when there are no errors, so it is
// safe to place unconditionally in a form. Pass the same field-error messages the inline
// fields use; undefined/empty entries are ignored.

import { View } from 'react-native';

import { useAppTheme } from '@/theme/useAppTheme';

import { AppText } from '../common/AppText';
import { StatusBadge } from '../common/StatusBadge';

type FormErrorSummaryProps = {
  // The field error messages, in field order. Undefined/empty entries are skipped, so the
  // caller can pass an errors record's values directly.
  errors: readonly (string | undefined)[];
  // The lead line. Defaults to a neutral British-English prompt.
  title?: string;
};

export function FormErrorSummary({
  errors,
  title = 'Please check the following before continuing:',
}: FormErrorSummaryProps) {
  const { colours, radii, spacing } = useAppTheme();
  const messages = errors.filter(
    (message): message is string =>
      typeof message === 'string' && message.length > 0,
  );

  if (messages.length === 0) {
    return null;
  }

  return (
    <View
      accessibilityLabel={`${title} ${messages.join('. ')}`}
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      style={{
        backgroundColor: colours.cautionBackground,
        borderRadius: radii.medium,
        gap: spacing.xs,
        padding: spacing.md,
      }}
    >
      <StatusBadge label="Check your answers" tone="caution" />
      {/* The individual lines are hidden from the reader because the container label above
          already reads the whole summary in one announcement; showing them again would
          double-read. They remain visible for sighted users. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <AppText style={{ color: colours.cautionText }} variant="label">
          {title}
        </AppText>
        {messages.map((message, index) => (
          <AppText
            key={`${index}-${message}`}
            style={{ color: colours.cautionText }}
            variant="caption"
          >
            {`• ${message}`}
          </AppText>
        ))}
      </View>
    </View>
  );
}
