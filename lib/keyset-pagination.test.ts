import { describe, expect, it } from 'vitest';
import { cursorFilter, decodeCursor, encodeCursor, sanitizeSearchTerm } from './keyset-pagination';

const id = '3f8b0c3e-1d2a-4b5c-9e7f-0a1b2c3d4e5f';

describe('cursor encoding', () => {
  it('round-trips a valid timestamp and uuid', () => {
    const cursor = { value: '2026-10-20T14:13:04.988+00:00', id };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('rejects cursors that could inject PostgREST filter syntax', () => {
    const evil = Buffer.from(JSON.stringify({ value: '2026-01-01),business_id.neq.x,(', id })).toString('base64url');
    expect(decodeCursor(evil)).toBeNull();
    const badId = Buffer.from(JSON.stringify({ value: '2026-10-20T14:13:04Z', id: 'x),or(' })).toString('base64url');
    expect(decodeCursor(badId)).toBeNull();
    expect(decodeCursor('not base64 json')).toBeNull();
    expect(decodeCursor(null)).toBeNull();
  });

  it('quotes timestamp values in the filter', () => {
    expect(cursorFilter('created_at', { value: '2026-10-20T14:13:04Z', id })).toBe(
      `created_at.lt."2026-10-20T14:13:04Z",and(created_at.eq."2026-10-20T14:13:04Z",id.lt.${id})`,
    );
  });
});

describe('sanitizeSearchTerm', () => {
  it('strips characters that delimit PostgREST or() expressions', () => {
    expect(sanitizeSearchTerm('jo,email.eq.x)')).toBe('jo email.eq.x');
    expect(sanitizeSearchTerm('  O\'Brien  ')).toBe("O'Brien");
    expect(sanitizeSearchTerm('a'.repeat(200)).length).toBe(80);
    expect(sanitizeSearchTerm(null)).toBe('');
  });
});
