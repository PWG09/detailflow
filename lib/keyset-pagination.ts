export type PageCursor = { value: string; id: string };

export function encodeCursor(cursor: PageCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string | null): PageCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof parsed?.value !== 'string' || typeof parsed?.id !== 'string') return null;
    return { value: parsed.value, id: parsed.id };
  } catch {
    return null;
  }
}

export function pageSize(request: Request, fallback = 50, maximum = 50) {
  const raw = Number(new URL(request.url).searchParams.get('limit') || fallback);
  return Math.min(maximum, Math.max(1, Number.isFinite(raw) ? raw : fallback));
}
