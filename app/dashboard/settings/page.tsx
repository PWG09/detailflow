'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, CreditCard, Users, Landmark, CheckCircle2, ExternalLink, AlertTriangle, Trash2, XCircle } from 'lucide-react';
import { isReservedBusinessSlug, normalizeBusinessSlug } from '@/lib/slug';

type Business={name:string;slug:string;email:string;phone:string;description:string;leadUrl?:string};
type Billing={plan:string;subscription_status?:string|null;stripe_customer_id?:string|null;stripe_subscription_id?:string|null;stripe_connected_account_id?:string|null;stripe_connect_status?:string|null;stripe_charges_enabled?:boolean;stripe_payouts_enabled?:boolean;stripe_details_submitted?:boolean;prices?:{pro:number|null;business:number|null}};

const defaultPlans=[
  {id:'free',name:'Free',fallbackPrice:0,copy:'For getting started',features:['5 quote requests / month','Core quote workflow','Secure public quote links']},
  {id:'pro',name:'Pro',fallbackPrice:20,copy:'For growing detailers',features:['100 quote requests / month','AI vehicle assessment','Stripe customer payments','5 team members']},
  {id:'business',name:'Business',fallbackPrice:79,copy:'For established teams',features:['Unlimited quote requests','Higher AI allowance','Stripe customer payments','Unlimited team members']},
];

export default function SettingsPage(){
  const [business,setBusiness]=useState<Business>({name:'',slug:'',email:'',phone:'',description:''});
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [billing,setBilling]=useState<Billing>({plan:'free'});
  const [connectBusy,setConnectBusy]=useState(false);
  const [cancelBusy,setCancelBusy]=useState(false);
  const [deleteBusy,setDeleteBusy]=useState(false);
  const [deleteConfirmation,setDeleteConfirmation]=useState('');

  useEffect(()=>{void fetch('/api/dashboard/business').then(r=>r.ok?r.json():null).then(d=>{if(d)setBusiness(d)});void refreshBilling();},[]);
  async function refreshBilling(){const r=await fetch('/api/dashboard/billing');if(r.ok)setBilling(await r.json());}
  function update(key:keyof Business,value:string){setBusiness(c=>({...c,[key]:value}));}
  async function submit(event:FormEvent){event.preventDefault();const normalizedSlug=normalizeBusinessSlug(business.slug);if(!normalizedSlug||isReservedBusinessSlug(normalizedSlug)){setMessage('Choose another public link name.');return;}setBusiness(c=>({...c,slug:normalizedSlug}));setBusy(true);setMessage('');const response=await fetch('/api/dashboard/business',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...business,slug:normalizedSlug})});const result=await response.json().catch(()=>null);setMessage(response.ok?'Business profile saved.':result?.error??'Unable to save profile.');setBusy(false);}
  async function choosePlan(plan:string){if(plan==='free'||plan===billing.plan)return;setMessage('Opening secure Stripe membership checkout…');const r=await fetch('/api/dashboard/billing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan})});const x=await r.json();if(r.ok&&x.url)location.assign(x.url);else setMessage(x.error||'Unable to start membership checkout.');}
  async function portal(){const r=await fetch('/api/dashboard/billing',{method:'PATCH'});const x=await r.json();if(r.ok&&x.url)location.assign(x.url);else setMessage(x.error||'Unable to open billing portal.');}
  async function cancelSubscription(){if(!window.confirm('Cancel this membership at the end of the current billing period? You will keep access until then.'))return;setCancelBusy(true);const r=await fetch('/api/dashboard/billing/cancel',{method:'POST'});const x=await r.json().catch(()=>null);setMessage(r.ok?`Cancellation scheduled. Access remains active until ${x?.currentPeriodEnd?new Date(x.currentPeriodEnd).toLocaleDateString(): 'the end of the current period'}.`:x?.error||'Unable to cancel subscription.');setCancelBusy(false);await refreshBilling();}
  async function connectStripe(){setConnectBusy(true);setMessage('Opening Stripe onboarding…');const r=await fetch('/api/dashboard/billing/connect',{method:'POST'});const x=await r.json();if(r.ok&&x.url)location.assign(x.url);else{setMessage(x.error||'Unable to connect Stripe.');setConnectBusy(false);}}

  async function copyLeadLink(){
    const url=business.leadUrl || `${window.location.origin}/${business.slug}/lead`;
    try { await navigator.clipboard.writeText(url); setMessage('Lead link copied.'); }
    catch { setMessage(url); }
  }
  async function shareLeadLink(){
    const url=business.leadUrl || `${window.location.origin}/${business.slug}/lead`;
    if (navigator.share) { try { await navigator.share({title:`Send a lead to ${business.name}`,text:`Request a service from ${business.name}.`,url}); } catch {} }
    else await copyLeadLink();
  }

  async function deleteAccount(){if(deleteConfirmation!=='DELETE'){setMessage('Type DELETE to confirm account deletion.');return;}if(!window.confirm('This permanently deletes your DetailFlow workspace, quotes, leads, services, customers, and account. This cannot be undone. Continue?'))return;setDeleteBusy(true);setMessage('Deleting your account…');const r=await fetch('/api/dashboard/account/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation:'DELETE'})});const x=await r.json().catch(()=>null);if(r.ok){location.assign('/');return;}setMessage(x?.error||'Account deletion failed.');setDeleteBusy(false);}

  return <section className="dashboard-main">
    <Link href="/dashboard" className="button-secondary"><ArrowLeft size={15}/> Back to overview</Link>
    <div className="dash-header" style={{marginTop:34}}><div><span className="mono eyebrow">Workspace</span><h1>Business settings</h1><p>Manage your business profile, membership, and customer payments.</p></div></div>
    <form className="empty-state" onSubmit={submit}><div className="field"><label htmlFor="name">Business name</label><input id="name" value={business.name} onChange={e=>update('name',e.target.value)} required/></div><div className="field"><label htmlFor="slug">Public link slug</label><input id="slug" value={business.slug} onChange={e=>update('slug',e.target.value.toLowerCase())} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*"/></div><div className="form-grid"><div className="field"><label htmlFor="email">Business email</label><input id="email" type="email" value={business.email} onChange={e=>update('email',e.target.value)} required/></div><div className="field"><label htmlFor="phone">Business phone</label><input id="phone" value={business.phone} onChange={e=>update('phone',e.target.value)} required/></div></div><div className="field"><label htmlFor="description">Description</label><textarea id="description" rows={5} value={business.description} onChange={e=>update('description',e.target.value)} required minLength={10}/></div>{message&&<p role="status" className="auth-message">{message}</p>}<button className="button-primary" type="submit" disabled={busy}><Save size={15}/>{busy?'Saving…':'Save profile'}</button></form>

    <section className="section" style={{padding:'55px 0 0',borderTop:0}}><div className="section-head"><div><span className="mono eyebrow">Membership</span><h2 style={{fontSize:38}}>Choose the workspace plan that fits your business.</h2></div><p className="section-intro">Stripe is authoritative for subscription status. This screen never upgrades a plan by itself.</p></div><div className="pricing">{defaultPlans.map(plan=>{const livePrice=plan.id==='pro'?billing.prices?.pro:plan.id==='business'?billing.prices?.business:null;const price=livePrice??plan.fallbackPrice;return <div className={`price-card ${plan.id===billing.plan?'featured':''}`} key={plan.id}><h3>{plan.name}</h3><div className="price">${price} <small>{plan.id==='free'?'':' / month'}</small></div><p>{plan.copy}</p><ul style={{paddingLeft:18,lineHeight:1.9,fontSize:13,color:'var(--muted)'}}>{plan.features.map(f=><li key={f}>{f}</li>)}</ul><button className={plan.id===billing.plan?'button-secondary':'button-primary'} type="button" onClick={()=>void choosePlan(plan.id)} disabled={plan.id==='free'||plan.id===billing.plan}>{plan.id===billing.plan?<><CheckCircle2 size={15}/>Current plan</>:<>Upgrade to {plan.name}</>}</button></div>})}</div>{billing.plan!=='free'&&<div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:14}}><button className="button-secondary" type="button" onClick={()=>void portal()}><CreditCard size={15}/> Manage subscription in Stripe</button><button className="button-secondary" type="button" onClick={()=>void cancelSubscription()} disabled={cancelBusy||!!billing.subscription_status&&billing.subscription_status==='canceled'}><XCircle size={15}/>{cancelBusy?'Cancelling…':'Cancel at period end'}</button></div>}</section>


    <section className="section" style={{padding:'55px 0 0',borderTop:0}}><div className="empty-state"><div><span className="mono eyebrow">Customer lead link</span><h2 style={{fontSize:32,margin:'10px 0'}}>Give customers one simple link.</h2><p className="form-intro" style={{maxWidth:720}}>Every request sent through this URL is assigned to this business on the server. Customers do not choose a business after opening the link.</p></div><div className="field" style={{marginTop:18}}><label htmlFor="lead-link">Your public lead URL</label><input id="lead-link" readOnly value={business.leadUrl || (business.slug ? `${typeof window !== 'undefined' ? window.location.origin : 'https://detailflow-two.vercel.app'}/${business.slug}/lead` : '')}/></div><div style={{display:'flex',gap:10,flexWrap:'wrap'}}><button type="button" className="button-primary" onClick={()=>void copyLeadLink()}><ExternalLink size={15}/> Copy lead link</button><button type="button" className="button-secondary" onClick={()=>void shareLeadLink()}>Share link</button><Link href={business.slug ? `/${business.slug}/lead` : '/login'} target="_blank" className="button-secondary">Open customer form</Link></div></div></section>
    <section className="section" style={{padding:'55px 0 0',borderTop:0}}><div className="empty-state"><div style={{display:'flex',justifyContent:'space-between',gap:20,alignItems:'center',flexWrap:'wrap'}}><div><span className="mono eyebrow">Customer payments</span><h2 style={{fontSize:32,margin:'10px 0'}}>Connect Stripe to receive money from your customers.</h2><p className="form-intro" style={{maxWidth:700}}>When a customer pays a quote, Stripe sends the payment to your connected Stripe account and DetailFlow keeps the configured platform fee automatically. Stripe controls the payout to your bank.</p></div><Landmark size={34}/></div><p className="mono" style={{marginTop:18}}>Status: {billing.stripe_connect_status==='connected'?'CONNECTED':'NOT READY'} {billing.stripe_charges_enabled&&billing.stripe_payouts_enabled?'· payments and payouts enabled':''}</p>{billing.stripe_connect_status==='connected'?<button className="button-secondary" type="button" onClick={()=>void connectStripe()} disabled={connectBusy}><ExternalLink size={15}/> Update Stripe account</button>:<button className="button-primary" type="button" onClick={()=>void connectStripe()} disabled={connectBusy}><Landmark size={15}/>{connectBusy?'Opening Stripe…':'Connect Stripe'}</button>}</div></section>

    <div className="form-grid" style={{marginTop:20}}><div className="empty-state"><h3>Team</h3><p>Invite staff and keep ownership separate from day-to-day work.</p><Link href="/dashboard/team" className="button-secondary"><Users size={15}/> Manage team</Link></div></div>

    <section className="section" style={{padding:'55px 0 0',borderTop:0}}><div className="empty-state" style={{borderColor:'#e9b8ad'}}><div style={{display:'flex',gap:12,alignItems:'center'}}><AlertTriangle size={22}/><div><span className="mono eyebrow">Danger zone</span><h2 style={{fontSize:30,margin:'8px 0'}}>Cancel or delete your account</h2></div></div><p className="form-intro">Cancellation stops future subscription renewals. Account deletion permanently removes this workspace and its DetailFlow data. Customer payments are handled by Stripe and any open customer-service issues should be resolved before deletion.</p><div className="field" style={{maxWidth:360}}><label htmlFor="delete-confirmation">To permanently delete, type DELETE</label><input id="delete-confirmation" value={deleteConfirmation} onChange={e=>setDeleteConfirmation(e.target.value)} autoComplete="off" /></div><button className="button-secondary" type="button" onClick={()=>void deleteAccount()} disabled={deleteBusy||deleteConfirmation!=='DELETE'}><Trash2 size={15}/>{deleteBusy?'Deleting…':'Delete account permanently'}</button></div></section>

    <p className="field-help" style={{marginTop:20}}>Transactional emails are required for account security and quote/payment workflows. DetailFlow does not currently send optional marketing campaigns. See <Link href="/privacy">Privacy</Link>, <Link href="/terms">Terms</Link>, <Link href="/refunds">Refunds & cancellation</Link>, and <Link href="/cookies">Cookies</Link>.</p>
  </section>;
}
