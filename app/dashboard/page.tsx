import Link from 'next/link';
import { BarChart3, CarFront, ChevronRight, ClipboardList, Gauge, Settings, Users, Wrench } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const nav = [['Overview', Gauge, '/dashboard'], ['Leads', ClipboardList, '/dashboard/leads'], ['Customers', Users, '/dashboard/customers'], ['Quotes', CarFront, '/dashboard/quotes'], ['Services', Wrench, '/dashboard/services'], ['Analytics', BarChart3, '/dashboard/analytics'], ['Settings', Settings, '/dashboard/settings']] as const;

export default async function Dashboard() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  const fullName = user?.user_metadata?.full_name?.trim() || user?.email?.split('@')[0] || 'Business owner';
  const firstName = fullName.split(/\s+/)[0];
  const initials = fullName.split(/\s+/).slice(0, 2).map((part: string) => part[0]).join('').toUpperCase();
  const { data: membership } = user ? await supabase.from('business_members').select('business_id').eq('user_id', user.id).maybeSingle() : { data: null };
  const { data: business } = membership ? await supabase.from('businesses').select('id, name, slug').eq('id', membership.business_id).maybeSingle() : { data: null };
  const { count: leadCount } = business ? await supabase.from('leads').select('id', { count: 'exact', head: true }).eq('business_id', business.id) : { count: 0 };
  const { count: quoteCount } = business ? await supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('business_id', business.id) : { count: 0 };
  const dateLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
  return <main className="dashboard-page"><aside className="dashboard-sidebar"><Link className="brand" href="/"><span className="brand-mark">DF</span> detailflow</Link><div className="dashboard-nav">{nav.map(([label, Icon, href], index) => <Link className={index === 0 ? 'active' : ''} href={href} key={label}><Icon size={16} />{label}</Link>)}</div><div className="dashboard-user"><div className="avatar">{initials || 'U'}</div><div><strong>{fullName}</strong><small>{business?.name || 'Workspace setup required'}</small></div></div></aside><section className="dashboard-main"><div className="dash-header"><div><span className="mono eyebrow">{dateLabel}</span><h1>Good morning, {firstName}.</h1><p>{business ? `Here is what is happening with ${business.name}.` : 'Complete your workspace setup to start collecting leads.'}</p></div><Link href="/quote" className="button-primary">Create public quote <ChevronRight size={15} /></Link></div><div className="dashboard-metrics"><div><span>Leads</span><strong>{leadCount ?? 0}</strong><small>{leadCount ? 'Requests received' : 'Your first lead is one link away.'}</small></div><div><span>Quotes sent</span><strong>{quoteCount ?? 0}</strong><small>{quoteCount ? 'Quotes created' : 'Create your first quote.'}</small></div><div><span>Conversion rate</span><strong>—</strong><small>Calculated after leads are processed.</small></div></div><div className="empty-state"><div className="empty-icon"><ClipboardList size={22} /></div><h2>{leadCount ? 'Your lead inbox is active.' : 'Your lead inbox is ready.'}</h2><p>{business ? `Share ${business.slug ? `/quote/${business.slug}` : 'your public quote link'} to start collecting vehicle details, photos, and qualified requests.` : 'Your workspace needs a business profile before customers can send requests.'}</p><Link className="button-primary" href="/quote">Open public quote <ChevronRight size={15} /></Link></div></section></main>;
}
