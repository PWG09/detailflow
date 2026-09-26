'use client';

import { FormEvent, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { isMembershipForUser } from '@/lib/business-membership';

export default function LoginPage() {
  const [registering, setRegistering] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    else if (registering) window.location.assign('/onboarding');
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
      } else {
        window.location.assign(isMembershipForUser(membership, userId ?? null) ? '/dashboard' : '/onboarding');
      }
    }
    setBusy(false);
  }

  return <main className="auth-page"><div className="auth-panel"><a className="brand" href="/"><span className="brand-mark">DF</span> detailflow</a><div className="kicker"><span /> business access</div>{registering && <div className="field"><label htmlFor="fullName">Your name</label><input id="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your full name" required minLength={2} /></div>}<h1>{registering ? 'Create your account.' : 'Welcome back.'}</h1><p className="auth-copy">{registering ? 'Start with a clean intake process for your detailing business.' : 'Sign in to manage your leads, services, and customer link.'}</p><form onSubmit={submit}><div className="field"><label htmlFor="email">Email</label><input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div><div className="field"><label htmlFor="password">Password</label><input id="password" type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>{message && <p role="alert" className="auth-message">{message}</p>}<button className="button-primary" type="submit" disabled={busy}>{busy ? 'Working...' : registering ? 'Create account' : 'Sign in'}</button></form><button className="auth-switch" type="button" onClick={() => { setRegistering(!registering); setMessage(''); }}>{registering ? 'Already have an account? Sign in' : 'New to DetailFlow? Create an account'}</button><p className="field-help" style={{marginTop:20}}>Customer requests are submitted through the unique link shared by each business owner. Customers do not choose a business inside DetailFlow.</p></div></main>;
}
