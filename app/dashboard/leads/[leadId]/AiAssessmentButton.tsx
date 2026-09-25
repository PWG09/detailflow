'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';

export default function AiAssessmentButton({ leadId, hasAssessment }: { leadId: string; hasAssessment: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function runAssessment() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/dashboard/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(body.error || 'AI assessment unavailable.');
        return;
      }
      window.location.reload();
    } catch {
      setMessage('Unable to reach the AI assessment service.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <button className="button-secondary" type="button" onClick={() => void runAssessment()} disabled={busy}>
        <Sparkles size={15} /> {busy ? 'Analyzing...' : hasAssessment ? 'Run AI again' : 'Run AI assessment'}
      </button>
      {message ? <p className="auth-message" role="alert">{message}</p> : null}
    </div>
  );
}
