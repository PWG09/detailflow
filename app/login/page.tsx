'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { isMembershipForUser } from '@/lib/business-membership';

type AccountMode = 'owner' | 'customer';

export default function LoginPage() {
  const router = useRouter();
  const [accountMode, setAccountMode] = useState<AccountMode>('owner');
  const [registering, setRegistering] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (accountMode !== 'owner') {
      router.push('/quote');
      return;
    }

    if (registering && !fullName.trim()) {
      setMessage('Enter your name to create the account.');
      return;
    }

    setBusy(true); setMessage('');
    const supabase = createSupabaseBrowserClient();
    const result = registering
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/onboarding`, data: { full_name: fullName.trim() } } })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setMessage(result.error.message);
    else if (registering && !result.data.session) setMessage('Check your email to verify your account, then return here to continue.');
    else if (registering) router.push('/onboarding');
    else {
      const userId = result.data.user?.id ?? (await createSupabaseBrowserClient().auth.getUser()).data.user?.id;
      const { data: membership, error: businessError } = await createSupabaseBrowserClient().from('business_members').select('business_id, user_id').eq('user_id', userId ?? '').maybeSingle();
      if (businessError) {
        const nextMessage = businessError.code === '42P01'
          ? 'Your Supabase database is not initialized yet. Run the DetailFlow migration in SQL Editor.'
          : businessError.code === '42501'
            ? 'Your Supabase permissions are not ready. Check the Row Level Security policies.'
            : `Signed in, but we could not load your workspace (${businessError.code || 'database error'}).`;
        setMessage(nextMessage);
      }
      else {
        const isOwnerMember = isMembershipForUser(membership, userId ?? null);
        router.push(isOwnerMember ? '/dashboard' : '/onboarding');
      }
    }
    setBusy(false);
  }

  return <main className="auth-page"><div className="auth-panel"><a className="brand" href="/"><span className="brand-mark">DF</span> detailflow</a><div className="kicker"><span /> account type</div><div className="auth-mode-toggle" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
      <button type="button" className={accountMode === 'owner' ? 'button-primary' : 'button-secondary'} onClick={() => { setAccountMode('owner'); setMessage(''); }}>Tengo mi negocio</button>
      <button type="button" className={accountMode === 'customer' ? 'button-primary' : 'button-secondary'} onClick={() => { setAccountMode('customer'); setMessage(''); }}>Quiero una cotización</button>
      {accountMode === 'owner' && registering && <div className="field"><label htmlFor="fullName">Your name</label><input id="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your full name" required minLength={2} /></div>}
    </div>{accountMode === 'owner' ? <><h1>{registering ? 'Create your account.' : 'Welcome back.'}</h1><p className="auth-copy">{registering ? 'Start with a clean intake process for your detailing business.' : 'Sign in to manage your leads, services, and quote flow.'}</p><form onSubmit={submit}><div className="field"><label htmlFor="email">Email</label><input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div><div className="field"><label htmlFor="password">Password</label><input id="password" type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>{message && <p role="alert" className="auth-message">{message}</p>}<button className="button-primary" type="submit" disabled={busy}>{busy ? 'Working...' : registering ? 'Create account' : 'Sign in'}</button></form><button className="auth-switch" type="button" onClick={() => { setRegistering(!registering); setMessage(''); }}>{registering ? 'Already have an account? Sign in' : 'New to DetailFlow? Create an account'}</button></> : <><h1>Request a quote.</h1><p className="auth-copy">This flow is for customers. No dashboard or business account is required.</p><div style={{ display: 'grid', gap: 12 }}><button type="button" className="button-primary" onClick={() => router.push('/quote')}>Go to quote flow</button><button type="button" className="button-secondary" onClick={() => setAccountMode('owner')}>Back to business access</button></div></>}</div></main>;
}
