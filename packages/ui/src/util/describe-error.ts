// Flattens the varied reject shapes from plugin/demo fetchers into a
// diagnostic message (String(err) would give "[object Object]").
export function describeFetchError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err !== 'object' || err === null) return String(err);
  const e = err as Record<string, unknown>;
  const status = typeof e.status === 'number' ? e.status : null;
  const statusText = typeof e.statusText === 'string' ? e.statusText : null;
  const data = e.data as { message?: unknown; error?: unknown } | undefined;
  const dataMsg =
    data && typeof data === 'object'
      ? typeof data.message === 'string'
        ? data.message
        : typeof data.error === 'string'
          ? data.error
          : null
      : null;
  const topMsg = typeof e.message === 'string' ? e.message : null;
  const parts = [
    status !== null ? `HTTP ${status}` : null,
    statusText,
    dataMsg ?? topMsg,
  ].filter((p): p is string => p !== null && p !== '');
  if (parts.length > 0) return parts.join(' · ');
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}
