import { z } from 'zod';

const signInSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email address.')
    .max(254),
  password: z
    .string()
    .min(1, 'Enter your password.')
    .max(128, 'The password is too long.'),
});

type SignInData = z.infer<typeof signInSchema>;
type SignInValidation =
  | { data: SignInData; success: true }
  | { fieldErrors: Partial<Record<keyof SignInData, string>>; success: false };

export function validateSignIn(input: SignInData): SignInValidation {
  const result = signInSchema.safeParse(input);

  if (result.success) {
    return { data: result.data, success: true };
  }

  const fieldErrors: Partial<Record<keyof SignInData, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if ((field === 'email' || field === 'password') && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }

  return { fieldErrors, success: false };
}
