import type { Metadata } from 'next';
import './dashboard.css';

export const metadata: Metadata = { title: { default: 'Dashboard | DetailFlow', template: '%s | DetailFlow' }, robots: { index: false, follow: false } };
export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
