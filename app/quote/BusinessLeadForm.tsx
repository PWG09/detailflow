'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Upload } from 'lucide-react';
import Turnstile from '@/app/components/Turnstile';

type Service = { name: string; minimum_price: number; maximum_price: number; requires_photos: boolean };
const vehicles = ['Sedan','SUV','Truck','Coupe','Van','Motorcycle','Other'] as const;

export default function BusinessLeadForm() {
  const params = useParams<{ businessSlug:string }>();
  const [businessName,setBusinessName]=useState(params.businessSlug);
  const [services,setServices]=useState<Service[]>([]);
  const [businessFound,setBusinessFound]=useState<boolean|null>(null);
  const [step,setStep]=useState(1);
  const [service,setService]=useState('');
  const [vehicleType,setVehicleType]=useState<(typeof vehicles)[number]>('SUV');
  const [submitted,setSubmitted]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState('');
  const [photoNames,setPhotoNames]=useState<string[]>([]);
  const [photoFiles,setPhotoFiles]=useState<File[]>([]);
  const [year,setYear]=useState('');
  const [makeModel,setMakeModel]=useState('');
  const [condition,setCondition]=useState('');
  const [firstName,setFirstName]=useState('');
  const [lastName,setLastName]=useState('');
  const [email,setEmail]=useState('');
  const [phone,setPhone]=useState('');
  const [consent,setConsent]=useState(false);
  const [captchaToken,setCaptchaToken]=useState('');
  const [leadId,setLeadId]=useState('');

  const selectedService=useMemo(()=>services.find(item=>item.name===service)??null,[services,service]);
  const photosRequired=selectedService?.requires_photos??false;

  useEffect(()=>{
    let cancelled=false;
    void fetch(`/api/public/resolve-business?slug=${encodeURIComponent(params.businessSlug)}`,{cache:'no-store'})
      .then(async response=>{const result=await response.json().catch(()=>null);if(!response.ok||!result?.name)throw new Error(result?.error||'This business link is not available.');return result as {name:string;services:Service[]}})
      .then(result=>{if(cancelled)return;setBusinessFound(true);setBusinessName(result.name);setServices(result.services??[]);if(result.services?.[0])setService(result.services[0].name)})
      .catch(cause=>{if(cancelled)return;setBusinessFound(false);setError(cause instanceof Error?cause.message:'This business link is not available.')});
    return()=>{cancelled=true};
  },[params.businessSlug]);

  function handlePhotoChange(event:React.ChangeEvent<HTMLInputElement>){
    const files=Array.from(event.target.files??[]);
    const selected=files.slice(0,8);
    setPhotoFiles(selected);setPhotoNames(selected.map(file=>file.name));
    if(files.length>8)setError('Please select no more than 8 photos.');
    else if(photosRequired&&selected.length===0)setError('Please upload at least one vehicle photo for this service.');
    else setError('');
  }

  function next(){
    setError('');
    if(step===1&&(!year.trim()||!makeModel.trim())){setError('Add your vehicle year and make/model.');return}
    if(step===2&&!service){setError('Select the service you need.');return}
    if(step===3&&photosRequired&&photoFiles.length===0){setError('Please upload at least one vehicle photo for this service.');return}
    if(step===4&&(!firstName.trim()||!lastName.trim()||!email.trim()||!phone.trim())){setError('Complete your contact details.');return}
    setStep(value=>Math.min(5,value+1));
  }

  async function submitLead(form:HTMLFormElement){
    setSubmitting(true);setError('');
    const formData=new FormData(form);
    formData.set('businessSlug',params.businessSlug);formData.set('serviceName',service);formData.set('vehicleType',vehicleType);
    formData.set('year',year);formData.set('makeModel',makeModel);formData.set('condition',condition);
    formData.set('firstName',firstName);formData.set('lastName',lastName);formData.set('email',email);formData.set('phone',phone);
    formData.set('consent',consent?'true':'false');formData.set('captchaToken',captchaToken);formData.delete('photos');
    for(const file of photoFiles)formData.append('photos',file,file.name);
    if(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY&&!captchaToken){setError('Please complete the security verification.');setSubmitting(false);return}
    try{
      const response=await fetch('/api/public/quote',{method:'POST',body:formData});
      const result=await response.json().catch(()=>null);
      if(!response.ok){setError(result?.error||'We could not submit your request.');return}
      setLeadId(result?.leadId||'');setSubmitted(true);
    }catch{setError('We could not reach the business. Please check your connection and try again.')}finally{setSubmitting(false)}
  }

  if(businessFound===false)return <main className="quote-page"><div className="shell" style={{maxWidth:720,paddingTop:110}}><span className="mono eyebrow">Lead link</span><h1 style={{fontSize:52}}>Business not found.</h1><p className="form-intro">{error}</p><a href="/" className="button-primary" style={{marginTop:24}}>Go to DetailFlow</a></div></main>;

  if(submitted)return <main className="quote-page"><div className="shell quote-header"><a className="brand" href="/"><span className="brand-mark">DF</span> {businessName}</a></div><div className="shell" style={{maxWidth:720,paddingTop:110,textAlign:'center'}}><div className="brand-mark" style={{margin:'0 auto',transform:'none'}}><Check size={18}/></div><h1 style={{fontSize:55,margin:'25px auto 18px'}}>Request received.</h1><p className="form-intro" style={{maxWidth:460,margin:'auto'}}>Thanks. {businessName} received your request and will review your vehicle details before contacting you.</p>{leadId&&<p className="mono" style={{marginTop:18,color:'var(--muted)'}}>Request ID: {leadId.slice(0,8).toUpperCase()}</p>}<a href={`/${params.businessSlug}/lead`} className="button-secondary" style={{marginTop:30}}>Submit another request <ArrowRight size={15}/></a></div></main>;

  return <main className="quote-page">
    <a className="button-primary mobile-sticky-cta" href="#quote-form">Request an estimate <ArrowRight size={15}/></a>
    <div className="shell quote-header"><a className="brand" href="/"><span className="brand-mark">DF</span> {businessName}</a></div>
    <div className="shell quote-layout">
      <aside className="quote-aside"><div className="kicker"><span/> secure lead request</div><h1>Get a clear next step for your vehicle.</h1><p>Five quick questions give {businessName} the information needed to review your request and follow up.</p><div className="quote-aside-foot">Your request is sent securely<br/><strong style={{color:'var(--ink)'}}>only to {businessName}</strong></div></aside>
      <section id="quote-form" className="quote-form-wrap">
        <div className="progress" aria-label={`Question ${step} of 5`}>{[1,2,3,4,5].map(item=><i className={item<=step?'active':''} key={item}/>)}</div>
        {error&&<p role="alert" style={{color:'var(--orange)',fontSize:13}}>{error}</p>}
        {businessFound===null?<div className="empty-state"><p>Loading this business…</p></div>:services.length===0?<div className="empty-state"><h2>No services available.</h2><p>This business has not published a service yet. Please contact them directly.</p></div>:<form onSubmit={event=>{event.preventDefault();if(step<5)next();else if(consent)void submitLead(event.currentTarget);else setError('Please accept the privacy and terms notice before sending your request.')}}>
          {step===1&&<><span className="mono eyebrow">Question 1 of 5</span><h2>What vehicle are you bringing?</h2><p className="form-intro">Tell us the year, make, model, and vehicle type.</p><div className="form-grid"><div className="field"><label htmlFor="year">Year</label><input id="year" inputMode="numeric" value={year} onChange={e=>setYear(e.target.value)} placeholder="2021" required/></div><div className="field"><label htmlFor="makeModel">Make and model</label><input id="makeModel" value={makeModel} onChange={e=>setMakeModel(e.target.value)} placeholder="Porsche Macan" required/></div><div className="field full"><label>Vehicle type</label><div className="service-options">{vehicles.map(item=><button type="button" className={'service-option '+(vehicleType===item?'selected':'')} onClick={()=>setVehicleType(item)} key={item}><strong>{item}</strong></button>)}</div></div></div><div className="form-actions"><span className="mono" style={{fontSize:11,color:'var(--muted)'}}>1 / 5</span><button className="button-primary" type="submit">Continue <ArrowRight size={15}/></button></div></>}
          {step===2&&<><span className="mono eyebrow">Question 2 of 5</span><h2>What service do you need?</h2><p className="form-intro">Choose the service you want to request.</p><div className="service-options">{services.map(item=><button type="button" className={'service-option '+(service===item.name?'selected':'')} onClick={()=>setService(item.name)} key={item.name}><strong>{item.name}</strong><small>{item.minimum_price===item.maximum_price?`$${item.minimum_price}`:`$${item.minimum_price}-${item.maximum_price}`}</small></button>)}</div><div className="form-actions"><button className="back-button" type="button" onClick={()=>setStep(1)}><ArrowLeft size={14}/> Back</button><button className="button-primary" type="submit">Continue <ArrowRight size={15}/></button></div></>}
          {step===3&&<><span className="mono eyebrow">Question 3 of 5</span><h2>What should we know about the vehicle?</h2><p className="form-intro">Mention stains, pet hair, paint concerns, or anything else. {photosRequired?'Photos are required for this service.':'Photos are optional and can help the shop review the job faster.'}</p><div className="field"><label htmlFor="condition">Vehicle condition or special notes</label><textarea id="condition" rows={5} value={condition} onChange={e=>setCondition(e.target.value)} placeholder="Pet hair, stains, paint concerns, or anything else…"/></div><div className="field"><label className="service-option" style={{display:'flex',alignItems:'center',gap:12}}><Upload size={20} color="var(--orange)"/><span><strong>Vehicle photos {photosRequired?'(required)':'(optional)'}</strong><small>Up to 8 JPG or PNG images</small></span><input type="file" multiple accept="image/png,image/jpeg" onChange={handlePhotoChange} style={{display:'none'}}/></label>{photoNames.length>0&&<div className="photo-list" aria-live="polite">{photoNames.map(name=><span key={name}>{name}</span>)}</div>}</div><div className="form-actions"><button className="back-button" type="button" onClick={()=>setStep(2)}><ArrowLeft size={14}/> Back</button><button className="button-primary" type="submit">Continue <ArrowRight size={15}/></button></div></>}
          {step===4&&<><span className="mono eyebrow">Question 4 of 5</span><h2>Who should we contact?</h2><p className="form-intro">Give the shop a name and the best way to reach you.</p><div className="form-grid"><div className="field"><label htmlFor="firstName">First name</label><input id="firstName" autoComplete="given-name" value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="Jordan" required/></div><div className="field"><label htmlFor="lastName">Last name</label><input id="lastName" autoComplete="family-name" value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="Lee" required/></div><div className="field"><label htmlFor="email">Email</label><input id="email" autoComplete="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="jordan@email.com" required/></div><div className="field"><label htmlFor="phone">Phone</label><input id="phone" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="(555) 014-8820" required/></div></div><div className="form-actions"><button className="back-button" type="button" onClick={()=>setStep(3)}><ArrowLeft size={14}/> Back</button><button className="button-primary" type="submit">Review request <ArrowRight size={15}/></button></div></>}
          {step===5&&<><span className="mono eyebrow">Question 5 of 5</span><h2>Ready to send your request?</h2><p className="form-intro">Review your details and confirm that {businessName} can use them to respond to your request.</p><div className="review-card"><div><span>Vehicle</span><strong>{year} {makeModel} · {vehicleType}</strong></div><div><span>Service</span><strong>{service}</strong></div><div><span>Contact</span><strong>{firstName} {lastName} · {email}</strong></div><div><span>Photos</span><strong>{photoFiles.length ? `${photoFiles.length} uploaded` : 'None'}</strong></div></div><label className="consent-row"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/><span>I agree to the <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a> and <a href="/terms" target="_blank" rel="noreferrer">Terms</a>, and consent to DetailFlow processing the information and photos submitted for this request.</span></label><Turnstile onToken={setCaptchaToken}/><div className="estimate"><small>estimated range</small><strong>{selectedService?(selectedService.minimum_price===selectedService.maximum_price?`$${selectedService.minimum_price}`:`$${selectedService.minimum_price}-${selectedService.maximum_price}`):'—'}</strong><p>Final pricing is confirmed by {businessName} after review.</p></div><div className="form-actions"><button className="back-button" type="button" onClick={()=>setStep(4)}><ArrowLeft size={14}/> Back</button><button className="button-primary" type="submit" disabled={submitting}>{submitting?'Sending…':'Send request'} <ArrowRight size={15}/></button></div></>}
        </form>}
      </section>
    </div>
  </main>;
}