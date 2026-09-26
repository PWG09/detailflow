'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Upload } from 'lucide-react';
import Turnstile from '@/app/components/Turnstile';

type Service = { name: string; minimum_price: number; maximum_price: number; requires_photos: boolean };
const vehicles = ['Sedan', 'SUV', 'Truck', 'Coupe', 'Van', 'Motorcycle', 'Other'] as const;

export default function BusinessLeadForm() {
  const params = useParams<{ businessSlug: string }>();
  const [businessName, setBusinessName] = useState(params.businessSlug);
  const [services, setServices] = useState<Service[]>([]);
  const [businessFound, setBusinessFound] = useState<boolean | null>(null);
  const [step, setStep] = useState(1);
  const [service, setService] = useState('');
  const [vehicleType, setVehicleType] = useState<(typeof vehicles)[number]>('SUV');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [photoNames, setPhotoNames] = useState<string[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [year, setYear] = useState('');
  const [makeModel, setMakeModel] = useState('');
  const [condition, setCondition] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [leadId, setLeadId] = useState('');

  const selectedService = useMemo(() => services.find((item) => item.name === service) ?? null, [services, service]);
  const photosRequired = selectedService?.requires_photos ?? false;

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/public/resolve-business?slug=${encodeURIComponent(params.businessSlug)}`, { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.name) throw new Error(result?.error || 'This business link is not available.');
        return result as { name: string; services: Service[] };
      })
      .then((result) => {
        if (cancelled) return;
        setBusinessFound(true);
        setBusinessName(result.name);
        setServices(result.services ?? []);
        if (result.services?.[0]) setService(result.services[0].name);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setBusinessFound(false);
        setError(cause instanceof Error ? cause.message : 'This business link is not available.');
      });
    return () => { cancelled = true; };
  }, [params.businessSlug]);

  function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const selected = files.slice(0, 8);
    setPhotoFiles(selected);
    setPhotoNames(selected.map((file) => file.name));
    if (files.length > 8) setError('Please select no more than 8 photos.');
    else if (photosRequired && selected.length === 0) setError('Please upload at least one vehicle photo for this service.');
    else setError('');
  }

  async function submitLead(form: HTMLFormElement) {
    setSubmitting(true);
    setError('');
    const formData = new FormData(form);
    formData.set('businessSlug', params.businessSlug);
    formData.set('serviceName', service);
    formData.set('vehicleType', vehicleType);
    formData.set('year', year);
    formData.set('makeModel', makeModel);
    formData.set('condition', condition);
    formData.set('firstName', firstName);
    formData.set('lastName', lastName);
    formData.set('email', email);
    formData.set('phone', phone);
    formData.set('consent', consent ? 'true' : 'false');
    formData.set('captchaToken', captchaToken);
    formData.delete('photos');
    for (const file of photoFiles) formData.append('photos', file, file.name);

    if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !captchaToken) {
      setError('Please complete the security verification.');
      setSubmitting(false);
      return;
    }
    if (photosRequired && photoFiles.length === 0) {
      setError('Please upload at least one vehicle photo.');
      setSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/public/quote', { method: 'POST', body: formData });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setError(result?.error || 'We could not submit your request.');
        return;
      }
      setLeadId(result?.leadId || '');
      setSubmitted(true);
    } catch {
      setError('We could not reach the business. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (businessFound === false) return <main className="quote-page"><div className="shell" style={{ maxWidth: 720, paddingTop: 110 }}><span className="mono eyebrow">Lead link</span><h1 style={{ fontSize: 52 }}>Business not found.</h1><p className="form-intro">This public lead link is invalid, expired, or no longer available.</p><a href="/" className="button-primary" style={{ marginTop: 24 }}>Go to DetailFlow</a></div></main>;

  if (submitted) return <main className="quote-page"><div className="shell quote-header"><a className="brand" href="/"><span className="brand-mark">DF</span> {businessName}</a></div><div className="shell" style={{ maxWidth: 720, paddingTop: 110, textAlign: 'center' }}><div className="brand-mark" style={{ margin: '0 auto', transform: 'none' }}><Check size={18} /></div><h1 style={{ fontSize: 55, margin: '25px auto 18px' }}>Request received.</h1><p className="form-intro" style={{ maxWidth: 460, margin: 'auto' }}>Thanks. {businessName} received your request and will review your vehicle details before contacting you.</p>{leadId && <p className="mono" style={{ marginTop: 18, color: 'var(--muted)' }}>Request ID: {leadId.slice(0, 8).toUpperCase()}</p>}<a href={`/${params.businessSlug}/lead`} className="button-secondary" style={{ marginTop: 30 }}>Submit another request <ArrowRight size={15} /></a></div></main>;

  return <main className="quote-page">
    <a className="button-primary mobile-sticky-cta" href="#quote-form">Request an estimate <ArrowRight size={15} /></a>
    <div className="shell quote-header"><a className="brand" href="/"><span className="brand-mark">DF</span> {businessName}</a></div>
    <div className="shell quote-layout">
      <aside className="quote-aside"><div className="kicker"><span /> secure lead request</div><h1>Tell {businessName} what your vehicle needs.</h1><p>Give the business the details they need to understand your vehicle and follow up with you. Your request is saved only to this business.</p><div className="quote-aside-foot">Your information is sent securely<br /><strong style={{ color: 'var(--ink)' }}>only to {businessName}</strong></div></aside>
      <section id="quote-form" className="quote-form-wrap">
        <div className="progress">{[1, 2, 3].map((item) => <i className={item <= step ? 'active' : ''} key={item} />)}</div>
        {error && <p role="alert" style={{ color: 'var(--orange)', fontSize: 13 }}>{error}</p>}
        {businessFound === null ? <div className="empty-state"><p>Loading this business…</p></div> : services.length === 0 ? <div className="empty-state"><h2>No services available.</h2><p>This business has not published a service yet. Please contact them directly.</p></div> : <form onSubmit={(event) => { event.preventDefault(); if (step < 3) setStep(step + 1); else void submitLead(event.currentTarget); }}>
          {step === 1 && <><h2>Start with the basics.</h2><p className="form-intro">First, tell us what you are bringing in.</p><div className="form-grid"><div className="field"><label htmlFor="year">Year</label><input id="year" name="year" inputMode="numeric" value={year} onChange={(event) => setYear(event.target.value)} placeholder="2021" required /></div><div className="field"><label htmlFor="makeModel">Make and model</label><input id="makeModel" name="makeModel" value={makeModel} onChange={(event) => setMakeModel(event.target.value)} placeholder="Porsche Macan" required /></div><div className="field full"><label>Vehicle type</label><div className="service-options">{vehicles.map((item) => <button type="button" className={'service-option ' + (vehicleType === item ? 'selected' : '')} onClick={() => setVehicleType(item)} key={item}><strong>{item}</strong></button>)}</div></div></div><div className="form-actions"><span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>1 of 3</span><button className="button-primary" type="submit">Continue <ArrowRight size={15} /></button></div></>}
          {step === 2 && <><h2>Choose a service.</h2><p className="form-intro">Select what you are looking to have done.</p><div className="service-options">{services.map((item) => <button type="button" className={'service-option ' + (service === item.name ? 'selected' : '')} onClick={() => setService(item.name)} key={item.name}><strong>{item.name}</strong><small>{item.minimum_price === item.maximum_price ? `$${item.minimum_price}` : `$${item.minimum_price}-${item.maximum_price}`}</small></button>)}</div><div className="field"><label htmlFor="condition">Anything we should know?</label><textarea id="condition" name="condition" value={condition} onChange={(event) => setCondition(event.target.value)} rows={4} placeholder="Pet hair, stains, paint concerns, or anything else..." /></div><div className="form-actions"><button className="back-button" type="button" onClick={() => setStep(1)}><ArrowLeft size={14} /> Back</button><button className="button-primary" type="submit">Add your details <ArrowRight size={15} /></button></div></>}
          {step === 3 && <><h2>How can {businessName} reach you?</h2><p className="form-intro">{photosRequired ? 'Photos are required for this service.' : 'Photos are optional, but they can help the business understand the job faster.'} Your request will be saved only to {businessName}.</p><div className="field"><label className="service-option" style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Upload size={20} color="var(--orange)" /><span><strong>Upload vehicle photos {photosRequired ? '(required)' : '(optional)'}</strong><small>Up to 8 JPG or PNG images</small></span><input type="file" name="photos" multiple accept="image/png,image/jpeg" onChange={handlePhotoChange} style={{ display: 'none' }} /></label>{photoNames.length > 0 && <div className="photo-list" aria-live="polite">{photoNames.map((name) => <span key={name}>{name}</span>)}</div>}</div><div className="form-grid"><div className="field"><label htmlFor="firstName">First name</label><input id="firstName" name="firstName" autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="Jordan" required /></div><div className="field"><label htmlFor="lastName">Last name</label><input id="lastName" name="lastName" autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Lee" required /></div><div className="field"><label htmlFor="email">Email</label><input id="email" name="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="jordan@email.com" required /></div><div className="field"><label htmlFor="phone">Phone</label><input id="phone" name="phone" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(555) 014-8820" required /></div></div><label style={{display:'flex',gap:10,alignItems:'flex-start',fontSize:12,lineHeight:1.5,marginTop:18}}><input type="checkbox" checked={consent} onChange={(event)=>setConsent(event.target.checked)} required style={{marginTop:3}}/><span>I agree to the <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a> and <a href="/terms" target="_blank" rel="noreferrer">Terms</a>, and consent to DetailFlow processing the information and vehicle photos submitted for this lead request.</span></label><Turnstile onToken={setCaptchaToken} /><div className="estimate"><small>starting range</small><strong>{selectedService ? (selectedService.minimum_price === selectedService.maximum_price ? `$${selectedService.minimum_price}` : `$${selectedService.minimum_price}-${selectedService.maximum_price}`) : '—'}</strong><p>Based on the service selected. Final pricing is confirmed by {businessName} after review.</p></div><div className="form-actions"><button className="back-button" type="button" onClick={() => setStep(2)}><ArrowLeft size={14} /> Back</button><button className="button-primary" type="submit" disabled={submitting}>{submitting ? 'Sending…' : 'Send request'} <ArrowRight size={15} /></button></div></>}
        </form>}
      </section>
    </div>
  </main>;
}
