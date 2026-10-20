import Link from 'next/link';
import { getStripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

type State = 'paid' | 'processing' | 'unknown';

async function sessionState(sessionId: string | undefined): Promise<State> {
  // Display only. The quote is marked paid exclusively by the verified webhook.
  if (!sessionId || !/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(sessionId)) return 'unknown';
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    if (session.mode !== 'payment' || !session.metadata?.quoteId) return 'unknown';
    if (session.payment_status === 'paid') return 'paid';
    if (session.status === 'complete') return 'processing';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

const COPY: Record<State, { title: string; body: string }> = {
  paid: { title: 'Payment received.', body: 'Your payment went through. The business will confirm the next steps with you.' },
  processing: { title: 'Payment processing.', body: 'Your payment was submitted and is still being confirmed. You will hear from the business once it clears.' },
  unknown: { title: 'Checking your payment.', body: 'We could not confirm this payment from this page. If you completed checkout, your receipt from Stripe is the confirmation; the business sees the final status.' },
};

export default async function PaymentSuccessPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id: sessionId } = await searchParams;
  const state = await sessionState(sessionId);
  const copy = COPY[state];
  return (
    <main className="quote-page">
      <div className="shell" style={{ maxWidth: 720, paddingTop: 140, textAlign: 'center' }} role="status">
        <div className="brand-mark" style={{ margin: '0 auto', transform: 'none' }}>DF</div>
        <h1 style={{ fontSize: 'clamp(36px, 8vw, 55px)', margin: '25px auto 18px' }}>{copy.title}</h1>
        <p className="form-intro" style={{ maxWidth: 460, margin: 'auto' }}>{copy.body}</p>
        <Link href="/" className="button-primary" style={{ marginTop: 30 }}>Back to DetailFlow</Link>
      </div>
    </main>
  );
}
