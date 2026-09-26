const RESERVED_BUSINESS_SLUGS = new Set([
  'api', '_next', 'dashboard', 'login', 'onboarding', 'quote', 'q', 'features',
  'pricing', 'faq', 'contact', 'privacy', 'terms', 'refunds', 'cookies',
  'reset-password', 'update-password', 'auth', 'favicon', 'robots', 'sitemap',
]);

export function normalizeBusinessSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

export function isReservedBusinessSlug(value: string) {
  return RESERVED_BUSINESS_SLUGS.has(normalizeBusinessSlug(value));
}
