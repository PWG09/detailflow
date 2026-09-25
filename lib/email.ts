export type EmailMessage = { to: string; subject: string; html: string; text?: string };

export async function sendEmail(message: EmailMessage) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { sent: false, skipped: true } as const;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, ...message }),
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
  return { sent: true } as const;
}

export function emailShell(title: string, body: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:32px;color:#111827"><h1 style="font-size:24px">${title}</h1>${body}<p style="color:#6b7280;font-size:12px;margin-top:32px">Sent by DetailFlow.</p></div>`;
}
