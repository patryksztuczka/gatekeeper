import { z } from 'zod';

export const signInFormSchema = z.object({
  email: z.email('Enter a valid email.'),
  password: z.string().min(1, 'Password is required.'),
});

export const signUpFormSchema = z.object({
  name: z.string().min(1, 'Full name is required.'),
  email: z.email('Enter a valid email.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

export const forgotPasswordFormSchema = z.object({
  email: z.email('Enter a valid email.'),
});

export const resetPasswordFormSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters.'),
});

export const verifyEmailFormSchema = z.object({
  email: z.email('Enter a valid email.'),
});

export type SignInFormValues = z.infer<typeof signInFormSchema>;
export type SignUpFormValues = z.infer<typeof signUpFormSchema>;
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordFormSchema>;
export type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>;
export type VerifyEmailFormValues = z.infer<typeof verifyEmailFormSchema>;
