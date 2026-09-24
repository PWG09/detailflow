import { describe, expect, it } from 'vitest';
import { normalizeBusinessSlug } from './slug';

describe('normalizeBusinessSlug', () => {
  it('normalizes names and spaces into a valid public slug', () => {
    expect(normalizeBusinessSlug(' Northline Detailing! ')).toBe('northline-detailing');
    expect(normalizeBusinessSlug('NORTHLINE_DETAILING')).toBe('northline-detailing');
    expect(normalizeBusinessSlug('northline-detailing')).toBe('northline-detailing');
  });
});
