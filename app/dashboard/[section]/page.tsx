import Link from 'next/link';
import { ArrowLeft, BarChart3, CarFront, ClipboardList, Settings, Users, Wrench } from 'lucide-react';

const sections = {
  customers: { title: 'Customers', description: 'Customer profiles will appear here as quote requests arrive.', Icon: Users },
  quotes: { title: 'Quotes', description: 'Create and send professional quotes from qualified leads.', Icon: CarFront },
  services: { title: 'Services', description: 'Define your service menu and pricing ranges for the public quote flow.', Icon: Wrench },
  analytics: { title: 'Analytics', description: 'Your conversion and revenue insights will appear here once leads are flowing.', Icon: BarChart3 },
  settings: { title: 'Settings', description: 'Manage account preferences, notifications, and team access.', Icon: Settings },
} as const;

type SectionName = keyof typeof sections;

export default async function DashboardSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const content = sections[section as SectionName] ?? { title: 'Dashboard section', description: 'This dashboard section is not available.', Icon: ClipboardList };
  const Icon = content.Icon;
  return <section className="dashboard-main"><div className="dash-header"><div><span className="mono eyebrow">Workspace</span><h1>{content.title}</h1><p>{content.description}</p></div><Link href="/dashboard" className="button-secondary"><ArrowLeft size={15} /> Back to overview</Link></div><div className="empty-state"><div className="empty-icon"><Icon size={22} /></div><h2>{content.title} is ready.</h2><p>Connect your Supabase data and continue setting up this workspace from the overview.</p><Link href="/dashboard" className="button-primary">Return to dashboard</Link></div></section>;
}
