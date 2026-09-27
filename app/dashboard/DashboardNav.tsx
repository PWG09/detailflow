'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, CarFront, ClipboardList, Gauge, Settings, Users, Wrench } from 'lucide-react';

const nav = [
  ['Overview', Gauge, '/dashboard'],
  ['Leads', ClipboardList, '/dashboard/leads'],
  ['Customers', Users, '/dashboard/customers'],
  ['Quotes', CarFront, '/dashboard/quotes'],
  ['Services', Wrench, '/dashboard/services'],
  ['Analytics', BarChart3, '/dashboard/analytics'],
  ['Team', Users, '/dashboard/team'],
  ['Settings', Settings, '/dashboard/settings'],
] as const;

export default function DashboardNav() {
  const pathname = usePathname();
  return <nav className="dashboard-nav" aria-label="Workspace navigation">
    {nav.map(([label, Icon, href]) => {
      const active = href === '/dashboard' ? pathname === href : pathname.startsWith(href);
      return <Link className={active ? 'active' : ''} href={href} key={label} aria-current={active ? 'page' : undefined}><Icon size={16} /> <span>{label}</span></Link>;
    })}
  </nav>;
}