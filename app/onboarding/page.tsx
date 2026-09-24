'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { normalizeBusinessSlug } from '@/lib/slug';

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState(''); const [slug, setSlug] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState(''); const [description, setDescription] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError('');
    const normalizedSlug = normalizeBusinessSlug(slug);
    if (!normalizedSlug) {
      setError('Please enter a valid public link name.');
      setBusy(false);
      return;
    }

    const response = await fetch('/api/onboarding/business', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, slug: normalizedSlug, email, phone, description }) });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || 'Unable to create your business.');
      setBusy(false);
      return;
    }

    router.push('/dashboard');
    setBusy(false);
  }

  return <main className="auth-page"><div className="auth-panel"><a className="brand" href="/"><span className="brand-mark">DF</span> detailflow</a><div className="kicker"><span /> workspace setup</div><h1>Tell us about your business.</h1><p className="auth-copy">These details will appear in your workspace and public quote flow.</p><form onSubmit={submit}><div className="field"><label htmlFor="businessName">Business name</label><input id="businessName" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your detailing business" required minLength={2} /></div><div className="field"><label htmlFor="slug">Public link name</label><input id="slug" value={slug} onChange={(event) => setSlug(normalizeBusinessSlug(event.target.value))} placeholder="your-business" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /><small className="field-help">detailflow-two.vercel.app/quote/{slug || 'your-business'}</small></div><div className="field"><label htmlFor="businessEmail">Business email</label><input id="businessEmail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="hello@yourbusiness.com" required /></div><div className="field"><label htmlFor="businessPhone">Business phone</label><input id="businessPhone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Your contact number" required /></div><div className="field"><label htmlFor="description">About your business</label><textarea id="description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What services do you offer and what should customers know?" rows={4} required minLength={10} /></div>{error && <p role="alert" className="auth-message">{error}</p>}<button className="button-primary" type="submit" disabled={busy}>{busy ? 'Creating...' : 'Create my workspace'}</button></form></div></main>;
}
