'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="auth-page">
      <div className="auth-panel" style={{ textAlign: 'center' }}>
        <span className="mono eyebrow">Something went wrong</span>
        <h1>We hit an unexpected error.</h1>
        <p className="auth-copy">Your data was not intentionally changed. Try again or return to the home page.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="button-primary" type="button" onClick={() => reset()}>Try again</button>
          <Link className="button-secondary" href="/">Back home</Link>
        </div>
      </div>
    </main>
  );
}
