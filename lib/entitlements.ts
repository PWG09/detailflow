export type Plan = 'free' | 'pro' | 'business';

export const PLAN_LIMITS = {
  free: { leadsPerMonth: 5, aiPerMonth: 0, teamMembers: 1 },
  pro: { leadsPerMonth: 100, aiPerMonth: 100, teamMembers: 5 },
  business: { leadsPerMonth: Infinity, aiPerMonth: Infinity, teamMembers: Infinity },
} as const;

export function normalizePlan(plan?: string | null): Plan {
  return plan === 'business' || plan === 'pro' ? plan : 'free';
}

export function isPro(plan?: string | null) {
  return normalizePlan(plan) !== 'free';
}

export function hasAiAccess(plan?: string | null) {
  return normalizePlan(plan) !== 'free';
}

export function monthlyLeadLimit(plan?: string | null) {
  return PLAN_LIMITS[normalizePlan(plan)].leadsPerMonth;
}
