import type { Metadata } from 'next';
import Link from 'next/link';
import { getDashboardContext } from '@/lib/dashboard-context';
import DashboardNav from './DashboardNav';
import './dashboard.css';

export const metadata: Metadata = {
  title: { default: 'Dashboard | DetailFlow', template: '%s | DetailFlow' },
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { user, business } = await getDashboardContext();
  const fullName = user?.user_metadata?.full_name?.trim() || user?.email?.split('@')[0] || 'Business owner';
  const initials = fullName.split(/\s+/).slice(0, 2).map((part: string) => part[0]).join('').toUpperCase() || 'U';
  const trialEndsAt = business?.trial_ends_at ? new Date(business.trial_ends_at) : null;
  const trialActive = business?.trial_status === 'active' && !!trialEndsAt && trialEndsAt.getTime() > Date.now();

  return <main className="dashboard-page">
    <aside className="dashboard-sidebar">
      <Link className="brand" href="/"><span className="brand-mark">DF</span><span>detailflow</span></Link>
      <DashboardNav />
      <div className="dashboard-user">
        <div className="avatar">{initials}</div>
        <div><strong>{fullName}</strong><small>{business?.name || 'Workspace setup required'}</small></div>
      </div>
    </aside>
    <section className="dashboard-workspace">
      {trialActive && <div className="trial-banner"><span><strong>14-day trial</strong> · {Math.max(1, Math.ceil((trialEndsAt!.getTime() - Date.now()) / 86400000))} days remaining</span><Link href="/dashboard/settings">View plan <span aria-hidden="true">→</span></Link></div>}
      {children}
    </section>
  </main>;
}