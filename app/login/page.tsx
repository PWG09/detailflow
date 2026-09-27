'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { isMembershipForUser } from '@/lib/business-membership';

type Mode = 'login' | 'register' | 'verify';

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationState, setVerificationState] = useState<'waiting' | 'verified' | 'expired'>('waiting');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function finishVerifiedSignup() {
    setVerificationState('verified');
    if (pollRef.current) clearInterval(pollRef.current);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage('Your email is verified. Sign in once to continue.');
      return;
    }
    window.location.assign('/onboarding');
  }

  function startPolling(token: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    const poll = async () => {
      try {
        const response = await fetch('/api/auth/verification-status?token=' + encodeURIComponent(token), { cache: 'no-store' });
        if (response.status === 410) {
          setVerificationState('expired');
          if (pollRef.current) clearInterval(pollRef.current);
          return;
        }
        const result = await response.json().catch(() => null);
        if (result?.verified) await finishVerifiedSignup();
      } catch {
        // Temporary network failures are retried on the next interval.
      }
    };
    void poll();
    pollRef.current = setInterval(() => void poll(), 2500);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === 'register' && !fullName.trim()) {
      setMessage('Enter your name to create the account.');
      return;
    }

    setBusy(true);
    setMessage('');
    const supabase = createSupabaseBrowserClient();

    if (mode === 'register') {
      const intentResponse = await fetch('/api/auth/verification-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const intent = await intentResponse.json().catch(() => null);
      if (!intentResponse.ok || !intent?.token) {
        setMessage(intent?.error || 'Unable to start email verification. Please try again.');
        setBusy(false);
        return;
      }

      const result = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login?verify=${encodeURIComponent(intent.token)}`,
          data: { full_name: fullName.trim() },
        },
      });

      if (result.error) {
        setMessage(result.error.message);
        setBusy(false);
        return;
      }

      if (result.data.session) {
        window.location.assign('/onboarding');
        return;
      }

      if (!result.data.user) {
        setMessage('We could not start your account verification. Please try again.');
        setBusy(false);
        return;
      }

      const attachResponse = await fetch('/api/auth/verification-intent/attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: intent.token, userId: result.data.user.id, email }),
      });
      const attachResult = await attachResponse.json().catch(() => null);
      if (!attachResponse.ok) {
        setMessage(attachResult?.error || 'We could not prepare your verification session.');
        setBusy(false);
        return;
      }

      setVerificationState('waiting');
      setMode('verify');
      startPolling(intent.token);
      setBusy(false);
      return;
    }

    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) {
      setMessage(result.error.message);
    } else {
      const userId = result.data.user?.id ?? (await supabase.auth.getUser()).data.user?.id;
      const { data: membership, error: businessError } = await supabase
        .from('business_members')
        .select('business_id, user_id')
        .eq('user_id', userId ?? '')
        .maybeSingle();

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

  if (mode === 'verify') {
    return <main className="auth-page">
      <div className="auth-panel auth-panel-verification">
        <a className="brand" href="/"><span className="brand-mark">DF</span> detailflow</a>
        <div className="verification-icon"><Mail size={23}/></div>
        <div className="kicker"><span /> email verification</div>
        <h1>Check your inbox.</h1>
        <p className="auth-copy">We sent a verification link to <strong>{email}</strong>. You can open it on your phone, another browser, or any device. This page will detect the verification automatically and continue here.</p>
        <div className="verification-status" role="status" aria-live="polite">
          {verificationState === 'waiting' ? <><Loader2 className="spin" size={18}/><div><strong>Waiting for verification</strong><span>This window is still connected to your signup.</span></div></> : <><CheckCircle2 size={18}/><div><strong>Email verified</strong><span>Signing you in and opening your workspace…</span></div></>}
        </div>
        <div className="verification-note"><ShieldCheck size={16}/><span>For security, the verification session expires after 30 minutes.</span></div>
        {verificationState === 'expired' && <button className="button-primary" type="button" onClick={() => { setMode('register'); setMessage('Start a new signup to receive another verification link.'); }}>Start again <ArrowRight size={15}/></button>}
        <button className="auth-switch" type="button" onClick={() => { if (pollRef.current) clearInterval(pollRef.current); setMode('login'); setMessage(''); }}>Back to sign in</button>
      </div>
    </main>;
  }

  return <main className="auth-page">
    <div className="auth-panel">
      <a className="brand" href="/"><span className="brand-mark">DF</span> detailflow</a>
      <div className="kicker"><span /> business access</div>
      {mode === 'register' && <div className="field"><label htmlFor="fullName">Your name</label><input id="fullName" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your full name" required minLength={2} /></div>}
      <h1>{mode === 'register' ? <>Create your<br/>workspace.</> : 'Welcome back.'}</h1>
      <p className="auth-copy">{mode === 'register' ? 'Create your account, verify your email, and set up your detailing business.' : 'Sign in to manage leads, quotes, customers, and payments.'}</p>
      <form onSubmit={submit}>
        <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
        <div className="field"><label htmlFor="password">Password</label><input id="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
        {message && <p role="alert" className="auth-message">{message}</p>}
        <button className="button-primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'register' ? <>Create account <ArrowRight size={15}/></> : <>Sign in <ArrowRight size={15}/></>}</button>
      </form>
      <button className="auth-switch" type="button" onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setMessage(''); }}>{mode === 'register' ? <><ArrowLeft size={13}/> Already have an account? Sign in</> : 'New to DetailFlow? Create an account'}</button>
      {mode === 'register' && <p className="field-help" style={{marginTop:20}}>Customers use your unique business link to send requests. They never choose a business inside DetailFlow.</p>}
    </div>
  </main>;
}