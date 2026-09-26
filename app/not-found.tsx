import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="auth-page">
      <div className="auth-panel" style={{ textAlign: 'center' }}>
        <span className="mono eyebrow">404</span>
        <h1>That page does not exist.</h1>
        <p className="auth-copy">The link may be outdated, or the page may have moved.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link className="button-primary" href="/">Back home</Link>
          <Link className="button-secondary" href="/login">Sign in</Link>
        </div>
      </div>
    </main>
  );
}
