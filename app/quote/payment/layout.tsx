import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Payment status | DetailFlow', robots: { index: false, follow: false } };
export default function PaymentLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
