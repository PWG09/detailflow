'use client';

import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, UserPlus, ShieldCheck } from 'lucide-react';

type Member={user_id:string;role:string;created_at:string;email:string;name:string|null};

export default function TeamPage(){
  const [members,setMembers]=useState<Member[]>([]);
  const [email,setEmail]=useState('');
  const [message,setMessage]=useState('');
  const [role,setRole]=useState('');
  const [busy,setBusy]=useState(false);

  async function load(){const r=await fetch('/api/dashboard/team',{cache:'no-store'});const x=await r.json().catch(()=>null);if(r.ok){setMembers(x.members||[]);setRole(x.currentRole||'')}else setMessage(x?.error||'Unable to load your team.');}
  useEffect(()=>{void load()},[]);

  async function submit(e:FormEvent){e.preventDefault();setBusy(true);setMessage('');const r=await fetch('/api/dashboard/team',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});const x=await r.json().catch(()=>null);setMessage(r.ok?'Invitation sent.':x?.error||'Unable to invite this person.');if(r.ok){setEmail('');void load()}setBusy(false)}

  return <section className="dashboard-main">
    <Link href="/dashboard/settings" className="button-secondary"><ArrowLeft size={15}/> Back to settings</Link>
    <div className="dash-header" style={{marginTop:34}}><div><span className="mono eyebrow">Workspace</span><h1>Team</h1><p>Give trusted staff access to the work without handing over billing or ownership controls.</p></div></div>
    <div className="settings-grid">
      <form className="premium-card" onSubmit={submit}>
        <div className="card-heading"><div><span className="mono eyebrow">Invite staff</span><h2>Add a teammate.</h2></div><UserPlus size={21}/></div>
        <p className="form-intro">They will receive a Supabase invitation and join this workspace as staff.</p>
        <div className="field"><label htmlFor="team-email">Email address</label><input id="team-email" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="team@yourbusiness.com" required /></div>
        {role!=='owner'&&<p className="auth-message">Only the workspace owner can invite staff.</p>}
        {message&&<p role="status" className="auth-message">{message}</p>}
        <button className="button-primary" disabled={busy||role!=='owner'}><Mail size={15}/>{busy?'Sending…':'Send invitation'}</button>
      </form>
      <div className="premium-card">
        <div className="card-heading"><div><span className="mono eyebrow">Workspace members</span><h2>{members.length} {members.length===1?'member':'members'}</h2></div><ShieldCheck size={21}/></div>
        <div className="member-list">{members.map(member=><div className="member-row" key={member.user_id}><div className="avatar">{(member.name||member.email||'M').slice(0,1).toUpperCase()}</div><div><strong>{member.name||member.email}</strong><small>{member.email}</small></div><span className="member-role">{member.role}</span></div>)}</div>
      </div>
    </div>
  </section>
}