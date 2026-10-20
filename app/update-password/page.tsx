'use client';

import { FormEvent, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Password-reset links arrive as ?code= (PKCE, handled by the client on
    // load). Team invitations are generated server-side and arrive with the
    // session in the URL hash, so establish that session explicitly.
    const supabase = createSupabaseBrowserClient();
    void (async () => {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        window.history.replaceState(null, '', window.location.pathname);
      }
      const { data } = await supabase.auth.getSession();
      setReady(Boolean(data.session));
    })();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { error } = await createSupabaseBrowserClient().auth.updateUser({ password });
    setMessage(error?.message ?? 'Password saved.');
    setDone(!error);
    setBusy(false);
  }

  return <main className="auth-page"><div className="auth-panel"><a className="brand" href="/"><span className="brand-mark">DF</span> detailflow</a><div className="kicker"><span /> account access</div><h1>Choose a new password.</h1>
    {ready === false && <p role="alert" className="auth-message">This link is invalid or has expired. Request a new password reset link or ask your business owner to resend the invitation.</p>}
    {done ? <><p role="status" className="auth-message">{message}</p><a className="button-primary" href="/dashboard">Open DetailFlow</a></> : <form onSubmit={submit}><div className="field"><label htmlFor="password">New password</label><input id="password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>{message && <p role="status" className="auth-message">{message}</p>}<button className="button-primary" type="submit" disabled={busy || ready !== true}>{busy ? 'Saving...' : 'Save password'}</button></form>}
    <a className="auth-switch" href="/login">Back to login</a></div></main>;
}
