'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const STATUSES = [
  ['new', 'New'], ['contacted', 'Contacted'], ['quoted', 'Quoted'], ['won', 'Won'], ['lost', 'Lost'], ['archived', 'Archived'],
] as const;

export default function LeadActions({ leadId, initialStatus, initialNotes }: { leadId: string; initialStatus: string; initialNotes: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [notes, setNotes] = useState(initialNotes);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      const response = await fetch(`/api/dashboard/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setFailed(true);
        setMessage(result?.error ?? 'Unable to update lead.');
        return;
      }
      setMessage('Lead updated.');
      router.refresh();
    } catch {
      setFailed(true);
      setMessage('Network error. Your changes were not saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="empty-state">
      <h2>Manage lead</h2>
      <div className="field">
        <label htmlFor="leadStatus">Status</label>
        <select id="leadStatus" value={status} onChange={(event) => setStatus(event.target.value)}>
          {STATUSES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="leadNotes">Internal notes</label>
        <textarea id="leadNotes" rows={4} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </div>
      {message && <p role={failed ? 'alert' : 'status'} className="auth-message">{message}</p>}
      <button className="button-primary" type="button" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save lead'}</button>
    </div>
  );
}
