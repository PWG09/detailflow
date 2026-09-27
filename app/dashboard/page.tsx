import Link from 'next/link';
import { ArrowRight, BarChart3, ClipboardList, DollarSign, Plus, Users } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function Dashboard() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const fullName = user?.user_metadata?.full_name?.trim() || user?.email?.split('@')[0] || 'Business owner';
  const firstName = fullName.split(/\s+/)[0];

  const { data: membership } = user ? await supabase.from('business_members').select('business_id').eq('user_id', user.id).maybeSingle() : { data: null };
  const { data: business } = membership ? await supabase.from('businesses').select('id,name,slug,trial_status,trial_ends_at,plan').eq('id', membership.business_id).maybeSingle() : { data: null };

  const [{ count: leadCount }, { count: quoteCount }, { count: customerCount }] = await Promise.all([
    business ? supabase.from('leads').select('id', { count: 'exact', head: true }).eq('business_id', business.id) : Promise.resolve({ count: 0 }),
    business ? supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('business_id', business.id) : Promise.resolve({ count: 0 }),
    business ? supabase.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', business.id) : Promise.resolve({ count: 0 }),
  ]);

  const trialActive = business?.trial_status === 'active' && business.trial_ends_at && new Date(business.trial_ends_at).getTime() > Date.now();
  const daysLeft = trialActive ? Math.max(1, Math.ceil((new Date(business.trial_ends_at).getTime() - Date.now()) / 86400000)) : 0;

  return <section className="dashboard-main dashboard-overview">
    <div className="dash-header">
      <div><span className="mono eyebrow">Workspace overview</span><h1>Good morning, {firstName}.</h1><p>{business ? `Here is the latest activity from ${business.name}.` : 'Complete your workspace setup to start collecting leads.'}</p></div>
      <div className="header-actions">
        {business?.slug && <Link href={`/${business.slug}/lead`} target="_blank" className="button-secondary">Preview lead flow <ArrowRight size={15}/></Link>}
        <Link href={business?.slug ? '/dashboard/leads' : '/onboarding'} className="button-primary">{business ? 'View leads' : 'Set up workspace'} <ArrowRight size={15}/></Link>
      </div>
    </div>

    {trialActive && <div className="trial-card"><div><span className="mono eyebrow">Pro trial</span><h2>{daysLeft} days left in your trial.</h2><p>Everything is unlocked while you set up your customer intake. Upgrade before the trial ends to keep your Pro workflow active.</p></div><Link className="button-primary" href="/dashboard/settings">Choose a plan <ArrowRight size={15}/></Link></div>}

    <div className="dashboard-metrics dashboard-metrics-four">
      <div><span>Leads</span><strong>{leadCount ?? 0}</strong><small>Customer requests received</small></div>
      <div><span>Quotes</span><strong>{quoteCount ?? 0}</strong><small>Quotes created</small></div>
      <div><span>Customers</span><strong>{customerCount ?? 0}</strong><small>Customer records</small></div>
      <div><span>Plan</span><strong className="metric-plan">{business?.plan === 'pro' ? 'Pro' : business?.plan === 'business' ? 'Business' : 'Free'}</strong><small>{trialActive ? 'Trial active' : 'Current access'}</small></div>
    </div>

    <div className="overview-grid">
      <div className="overview-card overview-primary">
        <div className="card-heading"><div><span className="mono eyebrow">Lead pipeline</span><h2>Turn requests into booked work.</h2></div><ClipboardList size={22}/></div>
        <p>Share your business link anywhere customers already reach you. Every submission lands in this workspace and stays tied to your business.</p>
        <div className="overview-actions"><Link href="/dashboard/leads" className="button-primary">Open lead inbox <ArrowRight size={15}/></Link>{business?.slug && <Link href={`/${business.slug}/lead`} target="_blank" className="button-secondary">Open public form</Link>}</div>
      </div>
      <div className="overview-card">
        <span className="mono eyebrow">Quick actions</span>
        <div className="quick-actions">
          <Link href="/dashboard/quotes"><DollarSign size={18}/><span><strong>Create a quote</strong><small>Turn a lead into an offer.</small></span><ArrowRight size={15}/></Link>
          <Link href="/dashboard/customers"><Users size={18}/><span><strong>View customers</strong><small>Review your customer records.</small></span><ArrowRight size={15}/></Link>
          <Link href="/dashboard/analytics"><BarChart3 size={18}/><span><strong>Review analytics</strong><small>See conversion activity.</small></span><ArrowRight size={15}/></Link>
        </div>
      </div>
    </div>

    {!business && <div className="empty-state"><div className="empty-icon"><Plus size={22}/></div><h2>Your workspace is not configured yet.</h2><p>Set up your business profile and first service before sharing DetailFlow with customers.</p><Link className="button-primary" href="/onboarding">Complete setup <ArrowRight size={15}/></Link></div>}
  </section>;
}