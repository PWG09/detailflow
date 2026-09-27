type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function sanitize(value: unknown): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(source)) {
      if (/password|secret|token|authorization|cookie|api[_-]?key|service[_-]?role|stripe[_-]?key/i.test(key)) {
        output[key] = '[REDACTED]';
      } else {
        output[key] = sanitize(item);
      }
    }
    return output;
  }
  return value;
}

export function createRequestId() {
  return crypto.randomUUID();
}

export function logEvent(level: LogLevel, event: string, data: Record<string, unknown> = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitize(data) as Record<string, unknown>,
  };
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else if (level === 'debug') console.debug(line);
  else console.info(line);
}

export function logRequest(data: {
  requestId: string;
  method: string;
  pathname: string;
  status?: number;
  durationMs?: number;
  ip?: string;
  userId?: string;
}) {
  logEvent('info', 'http.request', data);
}
