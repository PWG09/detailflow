import type { Metadata } from 'next';
import Link from 'next/link';
import FaqAccordion from '@/app/components/FaqAccordion';

export const metadata: Metadata = {
  title: 'FAQ | DetailFlow',
  description: 'Answers about DetailFlow quotes, payments, leads, AI, and business workspaces.',
};

export default function FAQ() {
  return (
    <main className="shell section">
      <Link href="/" className="brand">
        <span className="brand-mark">DF</span> detailflow
      </Link>

      <div className="kicker" style={{ marginTop: 60 }}><span /> faq</div>
      <h1>Questions, answered.</h1>

      <div style={{ maxWidth: 820, marginTop: 35 }}>
        <FaqAccordion />
      </div>
    </main>
  );
}
