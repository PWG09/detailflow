'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState(''); const [slug, setSlug] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); const response = await fetch('/api/onboarding/business', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, slug }) }); const result = await response.json(); if (!response.ok) setError(result.error || 'Unable to create your business.'); else router.push('/dashboard'); setBusy(false); }
  return <main className="auth-page"><div className="auth-panel"><a className="brand" href="/"><span className="brand-mark">DF</span> detailflow</a><div className="kicker"><span /> one quick setup</div><h1>Tell us about your shop.</h1><p className="auth-copy">This becomes the name and public link your customers see.</p><form onSubmit={submit}><div className="field"><label htmlFor="businessName">Business name</label><input id="businessName" value={name} onChange={(event) => setName(event.target.value)} placeholder="Northline Detailing" required minLength={2} /></div><div className="field"><label htmlFor="slug">Public link name</label><input id="slug" value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="northline-detailing" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /><small className="field-help">detailflow-two.vercel.app/quote/{slug || 'your-shop'}</small></div>{error && <p role="alert" className="auth-message">{error}</p>}<button className="button-primary" type="submit" disabled={busy}>{busy ? 'Creating...' : 'Create my workspace'}</button></form></div></main>;
}
