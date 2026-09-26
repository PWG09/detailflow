import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Sign in | DetailFlow', description: 'Sign in to your DetailFlow workspace.', robots: { index: false, follow: false } };
export default function LoginLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
