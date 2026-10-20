export type PageCursor = { value: string; id: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Timestamps as PostgREST returns them, e.g. 2026-10-20T14:13:04.988+00:00 or ...Z
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function encodeCursor(cursor: PageCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/**
 * Cursor values are interpolated into PostgREST filter strings, so only a
 * strict timestamp + uuid pair is accepted. Anything else is treated as "no
 * cursor" rather than being passed to the database.
 */
export function decodeCursor(raw: string | null): PageCursor | null {
  if (!raw || raw.length > 256) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof parsed?.value !== 'string' || !isUuid(parsed?.id)) return null;
    if (!TIMESTAMP_PATTERN.test(parsed.value) || Number.isNaN(Date.parse(parsed.value))) return null;
    return { value: parsed.value, id: parsed.id };
  } catch {
    return null;
  }
}

export function pageSize(request: Request, fallback = 50, maximum = 50) {
  const raw = Number(new URL(request.url).searchParams.get('limit') || fallback);
  return Math.min(maximum, Math.max(1, Number.isFinite(raw) ? Math.floor(raw) : fallback));
}

export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, '\\$&');
}

/**
 * Search text that is placed inside a PostgREST `or=(...)` expression must not
 * contain the characters that delimit that grammar. Keep letters, digits,
 * spaces and a few harmless punctuation marks.
 */
export function sanitizeSearchTerm(value: string | null | undefined, maxLength = 80) {
  return (value ?? '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} @.\-'+]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** Quote a timestamp for use inside a PostgREST filter value. */
export function cursorFilter(column: string, cursor: PageCursor) {
  return `${column}.lt."${cursor.value}",and(${column}.eq."${cursor.value}",id.lt.${cursor.id})`;
}
