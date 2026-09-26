import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Secure quote | DetailFlow', description: 'View a secure DetailFlow quote.', robots: { index: false, follow: false } };
export default function PublicQuoteLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
