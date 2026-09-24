'use client';

import { useState } from 'react';

export default function LeadActions({ leadId, initialStatus, initialNotes }: { leadId: string; initialStatus: string; initialNotes: string }) {
  const [status, setStatus] = useState(initialStatus); const [notes, setNotes] = useState(initialNotes); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function save() { setBusy(true); setMessage(''); const response = await fetch(`/api/dashboard/leads/${leadId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, notes }) }); setMessage(response.ok ? 'Lead updated.' : 'Unable to update lead.'); setBusy(false); }
  return <div className="empty-state"><h2>Manage lead</h2><div className="field"><label htmlFor="leadStatus">Status</label><select id="leadStatus" value={status} onChange={(event) => setStatus(event.target.value)}><option value="new">New</option><option value="contacted">Contacted</option><option value="quoted">Quoted</option><option value="won">Won</option><option value="lost">Lost</option><option value="archived">Archived</option></select></div><div className="field"><label htmlFor="leadNotes">Internal notes</label><textarea id="leadNotes" rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} /></div>{message && <p role="status" className="auth-message">{message}</p>}<button className="button-primary" type="button" onClick={() => void save()} disabled={busy}>{busy ? 'Saving...' : 'Save lead'}</button></div>;
}
