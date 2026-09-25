export type Plan = 'free' | 'pro';
export const FREE_LEAD_LIMIT = 5;
export const PRO_AI_LIMIT = 100;
export function isPro(plan?: string | null) { return plan === 'pro'; }
