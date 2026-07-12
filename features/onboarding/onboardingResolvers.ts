// Bridges the pure step validators (onboardingSchema.ts) to react-hook-form.
// The validators stay framework-free and unit tested; this adapter only shapes
// their output into RHF's resolver contract, keeping validation logic out of
// the components.

import type { FieldErrors, FieldValues, Resolver } from 'react-hook-form';

import type { StepValidation } from './onboardingSchema';

export function createStepResolver<
  Form extends FieldValues,
  Data,
  Field extends string,
>(
  validate: (values: Form) => StepValidation<Data, Field>,
): Resolver<Form, unknown, Data> {
  return (values) => {
    const result = validate(values as Form);
    if (result.success) {
      return { errors: {}, values: result.data };
    }

    const errors: Record<string, { message: string; type: string }> = {};
    for (const [key, message] of Object.entries(result.fieldErrors)) {
      if (typeof message === 'string') {
        errors[key] = { message, type: 'validation' };
      }
    }
    return { errors: errors as FieldErrors<Form>, values: {} };
  };
}
