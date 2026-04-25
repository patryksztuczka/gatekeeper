export const getAuthErrorMessage = (result: unknown, fallback: string): string | null => {
  if (!result || typeof result !== 'object' || !('error' in result)) {
    return null;
  }

  const error = result.error;

  if (typeof error === 'string') {
    return error;
  }

  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return fallback;
};

export const getAuthErrorCode = (result: unknown): string | null => {
  if (!result || typeof result !== 'object') {
    return null;
  }

  if ('code' in result && typeof result.code === 'string') {
    return result.code;
  }

  if (!('error' in result)) {
    return null;
  }

  const error = result.error;

  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }

  return null;
};

const FRIENDLY_ERRORS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'The email or password you entered is incorrect.',
  USER_NOT_FOUND: 'We couldn’t find an account for that email.',
  EMAIL_NOT_VERIFIED: 'Verify your email before signing in.',
  USER_ALREADY_EXISTS: 'An account with this email already exists.',
  TOO_MANY_REQUESTS: 'Too many attempts. Please wait a moment and try again.',
  INVALID_TOKEN: 'This link has expired or is no longer valid.',
  PASSWORD_TOO_SHORT: 'Your password must be at least 8 characters.',
};

const NETWORK_ERROR_MESSAGE =
  'We couldn’t reach the server. Check your connection and try again.';

const isNetworkError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('failed to fetch') ||
    normalized.includes('network request failed') ||
    normalized.includes('networkerror') ||
    normalized.includes('load failed')
  );
};

export const humanizeAuthError = (
  code: string | null,
  message: string | null,
  fallback: string,
): string => {
  if (code && FRIENDLY_ERRORS[code]) {
    return FRIENDLY_ERRORS[code];
  }

  if (message && isNetworkError(message)) {
    return NETWORK_ERROR_MESSAGE;
  }

  return message ?? fallback;
};
