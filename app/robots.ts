import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://detailflow-two.vercel.app';
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/dashboard', '/api/', '/login', '/onboarding', '/reset-password', '/update-password', '/q/'] },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
