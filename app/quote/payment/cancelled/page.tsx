import Link from 'next/link';

export default function PaymentCancelledPage() {
  return <main className="quote-page"><div className="shell" style={{ maxWidth: 720, paddingTop: 140, textAlign: 'center' }}><div className="brand-mark" style={{ margin: '0 auto', transform: 'none' }}>DF</div><h1 style={{ fontSize: 55, margin: '25px auto 18px' }}>Payment cancelled.</h1><p className="form-intro" style={{ maxWidth: 440, margin: 'auto' }}>No charge was made. Return to the business to choose another time to pay.</p><Link href="/" className="button-primary" style={{ marginTop: 30 }}>Back to DetailFlow</Link></div></main>;
}
