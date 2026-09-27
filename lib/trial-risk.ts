import crypto from 'node:crypto';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export type TrialRiskLevel = 'low' | 'review' | 'high';
export type TrialRiskResult = {
  score: number;
  level: TrialRiskLevel;
  signals: Record<string, { matched: boolean; weight: number; detail: string }>;
  hashes: { email: string; ip: string; device: string; phone: string };
};

function secret() {
  return process.env.TRIAL_RISK_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'detailflow-trial-risk-dev-secret';
}
export function hashRiskValue(value: string) {
  return crypto.createHmac('sha256', secret()).update(value.trim().toLowerCase()).digest('hex');
}
export function getClientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}
function normalizePhone(phone: string) { return phone.replace(/\D/g, ''); }
function levelFor(score: number): TrialRiskLevel {
  if (score >= 70) return 'high';
  if (score >= 40) return 'review';
  return 'low';
}
const disposableDomains = new Set([
  'mailinator.com','guerrillamail.com','guerrillamail.net','10minutemail.com',
  'temp-mail.org','tempmail.com','yopmail.com','sharklasers.com','getnada.com',
  'emailondeck.com','discard.email','fakeinbox.com'
]);

export async function evaluateTrialRisk(input: { email: string; phone?: string | null; deviceFingerprint?: string | null; ip: string }) {
  const admin = createSupabaseAdminClient();
  const emailHash = hashRiskValue(input.email);
  const ipHash = hashRiskValue(input.ip || 'unknown');
  const deviceHash = hashRiskValue(input.deviceFingerprint || 'missing-device');
  const phoneHash = hashRiskValue(normalizePhone(input.phone || '') || 'missing-phone');

  const [emailMatch, ipMatch, deviceMatch, phoneMatch] = await Promise.all([
    admin.from('trial_claims').select('id').eq('email_hash', emailHash).limit(1).maybeSingle(),
    admin.from('trial_claims').select('id').eq('ip_hash', ipHash).limit(1).maybeSingle(),
    admin.from('trial_claims').select('id').eq('device_hash', deviceHash).limit(1).maybeSingle(),
    input.phone ? admin.from('trial_claims').select('id').eq('phone_hash', phoneHash).limit(1).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);

  const domain = input.email.trim().toLowerCase().split('@')[1] || '';
  const signals = {
    email_reused: { matched: Boolean(emailMatch.data), weight: 50, detail: 'This email has previously claimed a DetailFlow trial.' },
    ip_reused: { matched: Boolean(ipMatch.data), weight: 25, detail: 'This network IP has previously claimed a DetailFlow trial.' },
    device_reused: { matched: Boolean(deviceMatch.data), weight: 35, detail: 'This browser/device signal has previously claimed a DetailFlow trial.' },
    phone_reused: { matched: Boolean(phoneMatch.data), weight: 25, detail: 'This phone number has previously claimed a DetailFlow trial.' },
    disposable_email: { matched: disposableDomains.has(domain), weight: 20, detail: 'The email domain is associated with temporary email services.' },
  } as const;

  const score = Math.min(100, Object.values(signals).reduce((sum, signal) => sum + (signal.matched ? signal.weight : 0), 0));
  return {
    score, level: levelFor(score), signals,
    hashes: { email: emailHash, ip: ipHash, device: deviceHash, phone: phoneHash },
  } satisfies TrialRiskResult;
}

export async function recordTrialClaim(input: {
  userId: string; businessId: string; risk: TrialRiskResult;
  trialStartedAt: string; trialEndsAt: string;
}) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('trial_claims').insert({
    user_id: input.userId, business_id: input.businessId,
    email_hash: input.risk.hashes.email, ip_hash: input.risk.hashes.ip,
    device_hash: input.risk.hashes.device, phone_hash: input.risk.hashes.phone,
    risk_score: input.risk.score, risk_level: input.risk.level,
    risk_signals: input.risk.signals,
    trial_started_at: input.trialStartedAt, trial_ends_at: input.trialEndsAt,
  });
  if (error) throw error;
}
