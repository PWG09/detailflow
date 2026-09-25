import CookieBanner from '@/app/components/CookieBanner';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DetailFlow | Turn detailing inquiries into booked work',
  description: 'The quote funnel built for modern detailing businesses.',
  openGraph: { title: 'DetailFlow', description: 'Structured leads from every vehicle inquiry.', type: 'website' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><CookieBanner />{children}</body></html>;
}
