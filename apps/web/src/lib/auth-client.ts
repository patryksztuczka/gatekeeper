import { createAuthClient } from 'better-auth/react';

export const AUTH_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8787';

export const { signIn, signOut, signUp, useSession } = createAuthClient({
  baseURL: AUTH_BASE_URL,
});
