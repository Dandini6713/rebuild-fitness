import { useState } from 'react';

import {
  AppText,
  Card,
  SecondaryButton,
  StatusBadge,
} from '@/components/common';
import { checkSupabaseConnection, SupabaseHealth } from '@/lib/supabase';
import { supabaseEnvironment } from '@/lib/validation/environment';

const initialHealth: SupabaseHealth =
  supabaseEnvironment.status === 'configured'
    ? {
        message: 'Configuration loaded. Run a connection check when needed.',
        status: 'unavailable',
      }
    : {
        message:
          'Add the public Supabase variables in .env to enable database connectivity.',
        status: 'setup_required',
      };

export function SupabaseConnectionStatus() {
  const [health, setHealth] = useState(initialHealth);
  const [isChecking, setIsChecking] = useState(false);
  const isConfigured = supabaseEnvironment.status === 'configured';

  async function handleCheck() {
    setIsChecking(true);
    setHealth(await checkSupabaseConnection(supabaseEnvironment));
    setIsChecking(false);
  }

  return (
    <Card accessibilityLabel={`Database connection. ${health.message}`}>
      <StatusBadge
        label={
          health.status === 'healthy'
            ? 'Connected'
            : isConfigured
              ? 'Not checked'
              : 'Setup required'
        }
        tone={
          health.status === 'healthy'
            ? 'success'
            : health.status === 'setup_required'
              ? 'caution'
              : 'neutral'
        }
      />
      <AppText variant="heading">Database connection</AppText>
      <AppText tone="secondary">{health.message}</AppText>
      <SecondaryButton
        disabled={!isConfigured}
        label="Check connection"
        loading={isChecking}
        onPress={handleCheck}
      />
    </Card>
  );
}
