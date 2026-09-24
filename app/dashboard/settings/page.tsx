'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';

type Business = { name: string; slug: string; email: string; phone: string; description: string };
export default function SettingsPage() {
  const [business, setBusiness] = useState<Business>({ name: '', slug: '', email: '', phone: '', description: '' });
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { void fetch('/api/dashboard/business').then((response) => response.ok ? response.json() : null).then((data) => { if (data) setBusiness(data); }); }, []);
  function update(key: keyof Business, value: string) { setBusiness((current) => ({ ...current, [key]: value })); }
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setMessage(''); const response = await fetch('/api/dashboard/business', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(business) }); const result = await response.json().catch(() => null); setMessage(response.ok ? 'Business profile saved.' : result?.error ?? 'Unable to save profile.'); setBusy(false); }
  return <section className="dashboard-main"><Link href="/dashboard" className="button-secondary"><ArrowLeft size={15} /> Back to overview</Link><div className="dash-header" style={{ marginTop: 34 }}><div><span className="mono eyebrow">Workspace</span><h1>Business settings</h1><p>Keep your public profile and contact information current.</p></div></div><form className="empty-state" onSubmit={submit}><div className="field"><label htmlFor="name">Business name</label><input id="name" value={business.name} onChange={(event) => update('name', event.target.value)} required /></div><div className="field"><label htmlFor="slug">Public link slug</label><input id="slug" value={business.slug} onChange={(event) => update('slug', event.target.value.toLowerCase())} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></div><div className="form-grid"><div className="field"><label htmlFor="email">Business email</label><input id="email" type="email" value={business.email} onChange={(event) => update('email', event.target.value)} required /></div><div className="field"><label htmlFor="phone">Business phone</label><input id="phone" value={business.phone} onChange={(event) => update('phone', event.target.value)} required /></div></div><div className="field"><label htmlFor="description">Description</label><textarea id="description" rows={5} value={business.description} onChange={(event) => update('description', event.target.value)} required minLength={10} /></div>{message && <p role="status" className="auth-message">{message}</p>}<button className="button-primary" type="submit" disabled={busy}><Save size={15} /> {busy ? 'Saving...' : 'Save profile'}</button></form></section>;
}
