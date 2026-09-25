'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Upload } from 'lucide-react';

type Service = readonly [string, string];
const vehicles = ['Sedan', 'SUV', 'Truck', 'Coupe', 'Van', 'Motorcycle'] as const;

export default function QuotePage() {
  const params = useParams<{ businessSlug: string }>();
  const [businessName, setBusinessName] = useState(params.businessSlug);
  const [services, setServices] = useState<Service[]>([]);
  const [step, setStep] = useState(1);
  const [service, setService] = useState('Full detail');
  const [vehicleType, setVehicleType] = useState('SUV');
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

  useEffect(() => {
    void fetch(`/api/public/resolve-business?slug=${encodeURIComponent(params.businessSlug)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        if (result?.name) setBusinessName(result.name);
        if (result?.services) {
          const loadedServices = result.services.map((item: { name: string; minimum_price: number; maximum_price: number }) => [item.name, `$${item.minimum_price}-${item.maximum_price}`] as const);
          setServices(loadedServices);
          if (loadedServices[0]) setService(loadedServices[0][0]);
        }
      });
  }, [params.businessSlug]);

  function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const selected = files.slice(0, 8);
    setPhotoFiles(selected);
    setPhotoNames(selected.map((file) => file.name));
    if (files.length > 8) setError('Please select no more than 8 photos.');
    else if (selected.length === 0) setError('Please select at least one vehicle photo.');
    else setError('');
  }

  async function submitQuote(form: HTMLFormElement) {
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
    // The file input is conditionally rendered in this multi-step form.
    // Append the selected File objects explicitly so they are always sent to
    // the server even if the input has been remounted between steps.
    formData.delete('photos');
    for (const file of photoFiles) formData.append('photos', file, file.name);
    if (photoFiles.length === 0) {
      setError('Please upload at least one vehicle photo.');
      setSubmitting(false);
      return;
    }
    const response = await fetch('/api/public/quote', { method: 'POST', body: formData });
    if (response.ok) setSubmitted(true);
    else {
      const result = await response.json().catch(() => null);
      setError(result?.error || 'We could not submit your request.');
    }
    setSubmitting(false);
  }

  if (submitted) return <main className="quote-page"><div className="shell quote-header"><a className="brand" href="/"><span className="brand-mark">DF</span> {businessName}</a></div><div className="shell" style={{ maxWidth: 720, paddingTop: 110, textAlign: 'center' }}><div className="brand-mark" style={{ margin: '0 auto', transform: 'none' }}><Check size={18} /></div><h1 style={{ fontSize: 55, margin: '25px auto 18px' }}>Request received.</h1><p className="form-intro" style={{ maxWidth: 410, margin: 'auto' }}>Thanks. {businessName} will review your vehicle details and get back to you shortly.</p><a href="/" className="button-primary" style={{ marginTop: 30 }}>Back to DetailFlow <ArrowRight size={15} /></a></div></main>;

  return <main className="quote-page">
    <div className="shell quote-header"><a className="brand" href="/"><span className="brand-mark">DF</span> {businessName}</a></div>
    <div className="shell quote-layout">
      <aside className="quote-aside"><div className="kicker"><span /> free estimate</div><h1>What does your vehicle need?</h1><p>Tell us a little about the vehicle and we will put together a clear starting range. No pressure, no guesswork.</p><div className="quote-aside-foot">Typical response time<br /><strong style={{ color: 'var(--ink)' }}>under 2 hours</strong></div></aside>
      <section className="quote-form-wrap">
        <div className="progress">{[1, 2, 3].map((item) => <i className={item <= step ? 'active' : ''} key={item} />)}</div>
        {error && <p role="alert" style={{ color: 'var(--orange)', fontSize: 13 }}>{error}</p>}
        <form onSubmit={(event) => { event.preventDefault(); if (step < 3) setStep(step + 1); else void submitQuote(event.currentTarget); }}>
          {step === 1 && <><h2>Start with the basics.</h2><p className="form-intro">First, tell us what you are bringing in.</p><div className="form-grid"><div className="field"><label htmlFor="year">Year</label><input id="year" name="year" value={year} onChange={(event) => setYear(event.target.value)} placeholder="2021" required /></div><div className="field"><label htmlFor="makeModel">Make and model</label><input id="makeModel" name="makeModel" value={makeModel} onChange={(event) => setMakeModel(event.target.value)} placeholder="Porsche Macan" required /></div><div className="field full"><label>Vehicle type</label><div className="service-options">{vehicles.map((item) => <button type="button" className={'service-option ' + (vehicleType === item ? 'selected' : '')} onClick={() => setVehicleType(item)} key={item}><strong>{item}</strong></button>)}</div></div></div><div className="form-actions"><span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>1 of 3</span><button className="button-primary" type="submit">Continue <ArrowRight size={15} /></button></div></>}
          {step === 2 && <><h2>Choose a service.</h2><p className="form-intro">Select what you are looking to have done.</p><div className="service-options">{services.map(([name, price]) => <button type="button" className={'service-option ' + (service === name ? 'selected' : '')} onClick={() => setService(name)} key={name}><strong>{name}</strong><small>{price}</small></button>)}</div><div className="field"><label htmlFor="condition">Anything we should know?</label><textarea id="condition" name="condition" value={condition} onChange={(event) => setCondition(event.target.value)} rows={4} placeholder="Pet hair, stains, paint concerns, or anything else..." /></div><div className="form-actions"><button className="back-button" type="button" onClick={() => setStep(1)}><ArrowLeft size={14} /> Back</button><button className="button-primary" type="submit">Add your details <ArrowRight size={15} /></button></div></>}
          {step === 3 && <><h2>Where should we send your estimate?</h2><p className="form-intro">Your photos help us understand the job. They are only shared with Northline Detailing.</p><div className="field"><label className="service-option" style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Upload size={20} color="var(--orange)" /><span><strong>Upload vehicle photos</strong><small>Up to 8 JPG or PNG images</small></span><input type="file" name="photos" multiple accept="image/png,image/jpeg" onChange={handlePhotoChange} style={{ display: 'none' }} /></label>{photoNames.length > 0 && <div className="photo-list" aria-live="polite">{photoNames.map((name) => <span key={name}>{name}</span>)}</div>}</div><div className="form-grid"><div className="field"><label htmlFor="firstName">First name</label><input id="firstName" name="firstName" value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="Jordan" required /></div><div className="field"><label htmlFor="lastName">Last name</label><input id="lastName" name="lastName" value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Lee" required /></div><div className="field"><label htmlFor="email">Email</label><input id="email" name="email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="jordan@email.com" required /></div><div className="field"><label htmlFor="phone">Phone</label><input id="phone" name="phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(555) 014-8820" required /></div></div><label style={{display:'flex',gap:10,alignItems:'flex-start',fontSize:12,lineHeight:1.5,marginTop:18}}><input type="checkbox" checked={consent} onChange={(event)=>setConsent(event.target.checked)} required style={{marginTop:3}}/><span>I agree to the <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a> and <a href="/terms" target="_blank" rel="noreferrer">Terms</a>, and consent to DetailFlow processing the information and vehicle photos submitted for this quote request.</span></label><div className="estimate"><small>your current estimate</small><strong>{service === 'Ceramic coating' ? '$800+' : service === 'Full detail' ? '$250-350' : '$150-220'}</strong><p>Based on a {service.toLowerCase()} for a {vehicleType}. Final pricing is confirmed after review.</p></div><div className="form-actions"><button className="back-button" type="button" onClick={() => setStep(2)}><ArrowLeft size={14} /> Back</button><button className="button-primary" type="submit" disabled={submitting}>{submitting ? 'Submitting...' : 'Request my estimate'} <ArrowRight size={15} /></button></div></>}
        </form>
      </section>
    </div>
  </main>;
}
