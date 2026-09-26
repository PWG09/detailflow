import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://detailflow-two.vercel.app';
  return [
    '', '/features', '/pricing', '/faq', '/contact', '/quote', '/privacy', '/terms', '/refunds', '/cookies'
  ].map((path) => ({ url: `${base}${path}` }));
}
