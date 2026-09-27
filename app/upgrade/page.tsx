import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

export default function UpgradePage() {
  return <main className="auth-page">
    <div className="auth-panel">
      <a className="brand" href="/"><span className="brand-mark">DF</span> detailflow</a>
      <div className="kicker"><span /> trial ended</div>
      <h1>Your 14-day trial has ended.</h1>
      <p className="auth-copy">Your workspace and data are still here. Upgrade your plan to restore access to your DetailFlow dashboard and continue using your customer lead flow.</p>
      <div className="field-help" style={{lineHeight:1.8,marginBottom:24}}>
        <div><CheckCircle2 size={14} style={{verticalAlign:'-2px'}}/> Your leads and quotes remain saved.</div>
        <div><CheckCircle2 size={14} style={{verticalAlign:'-2px'}}/> Your business link remains associated with your workspace.</div>
        <div><CheckCircle2 size={14} style={{verticalAlign:'-2px'}}/> Billing is handled securely through Stripe.</div>
      </div>
      <Link className="button-primary" href="/dashboard/settings">Upgrade your plan <ArrowRight size={15}/></Link>
    </div>
  </main>;
}