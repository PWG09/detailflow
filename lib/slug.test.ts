import { describe, expect, it } from 'vitest';
import { isReservedBusinessSlug, normalizeBusinessSlug } from './slug';

describe('normalizeBusinessSlug', () => {
  it('normalizes names and spaces into a valid public slug', () => {
    expect(normalizeBusinessSlug(' Northline Detailing! ')).toBe('northline-detailing');
    expect(normalizeBusinessSlug('NORTHLINE_DETAILING')).toBe('northline-detailing');
    expect(normalizeBusinessSlug('northline-detailing')).toBe('northline-detailing');
  });

  it('protects application routes from being used as business slugs', () => {
    expect(isReservedBusinessSlug('dashboard')).toBe(true);
    expect(isReservedBusinessSlug('API')).toBe(true);
    expect(isReservedBusinessSlug('quote')).toBe(true);
    expect(isReservedBusinessSlug('northline-detailing')).toBe(false);
  });
});
