'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const STORAGE_KEY = 'detailflow-cookie-consent';

// DetailFlow only sets essential (auth/security) cookies, so this is a notice,
// not a consent gate. It is never shown inside task flows where a fixed bar
// would cover the form's action buttons on mobile (the historical "overlay
// blocks Continue" bug on the lead form).
function isTaskFlow(pathname: string) {
  return /^\/[^/]+\/lead\/?$/.test(pathname)
    || pathname.startsWith('/q/')
    || pathname.startsWith('/quote')
    || pathname.startsWith('/dashboard')
    || pathname.startsWith('/onboarding')
    || pathname.startsWith('/login')
    || pathname.startsWith('/reset-password')
    || pathname.startsWith('/update-password')
    || pathname.startsWith('/upgrade');
}

export default function CookieBanner() {
  const pathname = usePathname() ?? '/';
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      setShow(localStorage.getItem(STORAGE_KEY) !== 'accepted');
    } catch {
      setShow(false);
    }
  }, []);

  if (!show || isTaskFlow(pathname)) return null;

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, 'accepted'); } catch { /* storage unavailable */ }
    setShow(false);
  }

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="cookie-notice"
    >
      <div className="cookie-notice-text">
        DetailFlow uses only essential cookies for sign-in and security. <a href="/cookies">Learn more</a>
      </div>
      <button className="button-primary" type="button" onClick={dismiss} style={{ minHeight: 40 }}>Got it</button>
    </div>
  );
}
