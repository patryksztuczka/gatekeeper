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
