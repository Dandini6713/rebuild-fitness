import { useState } from 'react';

import {
  AppScreen,
  AppText,
  Card,
  PrimaryButton,
  StatusBadge,
} from '@/components/common';
import { TextField } from '@/components/forms';
import { useAppTheme } from '@/theme/useAppTheme';

import { useAuth } from './AuthProvider';
import { validateSignIn } from './authValidation';

type FieldErrors = { email?: string; password?: string };

export function SignInScreen() {
  const { colours } = useAppTheme();
  const { signIn, status } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isConfigured = status !== 'configuration_error';

  async function handleSubmit() {
    setMessage(null);
    const validation = validateSignIn({ email, password });
    if (!validation.success) {
      setFieldErrors(validation.fieldErrors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    const result = await signIn(
      validation.data.email,
      validation.data.password,
    );
    if (!result.success) {
      setMessage(result.message);
    }
    setIsSubmitting(false);
  }

  return (
    <AppScreen eyebrow="Private beta" title="Sign in to Rebuild">
      <Card>
        <StatusBadge
          label={isConfigured ? 'Private access' : 'Setup required'}
          tone={isConfigured ? 'info' : 'caution'}
        />
        <AppText variant="heading">Your plan stays private</AppText>
        <AppText tone="secondary">
          Sign in with the account created for this private beta. Public
          registration is not available.
        </AppText>
      </Card>
      <Card>
        <TextField
          autoCapitalize="none"
          autoComplete="email"
          editable={!isSubmitting && isConfigured}
          error={fieldErrors.email}
          keyboardType="email-address"
          label="Email address"
          onChangeText={setEmail}
          textContentType="emailAddress"
          value={email}
        />
        <TextField
          autoCapitalize="none"
          autoComplete="current-password"
          editable={!isSubmitting && isConfigured}
          error={fieldErrors.password}
          label="Password"
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          value={password}
        />
        {message ? (
          <AppText
            accessibilityLiveRegion="assertive"
            style={{ color: colours.dangerText }}
          >
            {message}
          </AppText>
        ) : null}
        {!isConfigured ? (
          <AppText tone="secondary">
            Add the public Supabase variables described in README.md, then
            restart the app.
          </AppText>
        ) : null}
        <PrimaryButton
          disabled={!isConfigured}
          label="Sign in"
          loading={isSubmitting}
          onPress={handleSubmit}
        />
      </Card>
      <AppText tone="tertiary" variant="caption">
        Rebuild is a general fitness and wellness app. It does not replace
        professional healthcare advice.
      </AppText>
    </AppScreen>
  );
}
