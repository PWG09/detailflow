'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export type FAQItem = {
  question: string;
  answer: string;
};

export const faqItems: FAQItem[] = [
  {
    question: 'Can I use my own services and prices?',
    answer: 'Yes. You control the services shown to customers, including service names, pricing ranges, descriptions, and whether photos are required.',
  },
  {
    question: 'Can customers pay through Stripe?',
    answer: 'Yes. Customers can pay approved quotes securely through Stripe Checkout. Businesses connect their Stripe account so eligible payments can be routed to them.',
  },
  {
    question: 'Where do submitted requests appear?',
    answer: 'Every request submitted through your business lead link is saved to your business workspace as a lead. Your team can review the customer, vehicle details, photos, requested service, estimate, and status from the Leads section.',
  },
  {
    question: 'How does my customer get to my business?',
    answer: 'Each business gets its own public lead link, such as detailflow-two.vercel.app/your-business/lead. Share that link on your website, social profiles, messages, or anywhere customers contact you.',
  },
  {
    question: 'Does DetailFlow store my customers’ card numbers?',
    answer: 'No. Card information is entered and processed by Stripe Checkout. DetailFlow only keeps the payment information needed to connect the payment to the quote and business workflow.',
  },
];

export default function FaqAccordion({ items = faqItems }: { items?: FAQItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="faq-accordion" role="list">
      {items.map((item, index) => {
        const open = openIndex === index;
        const panelId = `faq-answer-${index}`;

        return (
          <div className={`faq-accordion-item${open ? ' is-open' : ''}`} key={item.question} role="listitem">
            <button
              type="button"
              className="faq-question"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpenIndex(open ? null : index)}
            >
              <span>{item.question}</span>
              <span className="faq-chevron" aria-hidden="true">
                <ChevronDown size={18} strokeWidth={1.8} />
              </span>
            </button>
            <div
              id={panelId}
              className="faq-answer"
              aria-hidden={!open}
              style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
            >
              <div className="faq-answer-inner">
                <p>{item.answer}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
