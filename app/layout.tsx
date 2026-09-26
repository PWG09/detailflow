import CookieBanner from '@/app/components/CookieBanner';
import type { Metadata, Viewport } from 'next';
import './globals.css';

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://detailflow-two.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: 'DetailFlow | Detailing quote and payment workflow', template: '%s | DetailFlow' },
  description: 'Turn detailing inquiries into organized leads, quotes, and paid work with DetailFlow.',
  applicationName: 'DetailFlow',
  openGraph: { title: 'DetailFlow | Detailing quote and payment workflow', description: 'Leads, quotes, AI-assisted vehicle assessment, and payments for detailing businesses.', type: 'website', siteName: 'DetailFlow', images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'DetailFlow' }] },
  twitter: { card: 'summary_large_image', title: 'DetailFlow', description: 'Turn detailing inquiries into organized leads, quotes, and paid work.', images: ['/opengraph-image'] },
  icons: { icon: '/icon.svg', shortcut: '/icon.svg' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#15231e' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><CookieBanner />{children}</body></html>;
}
