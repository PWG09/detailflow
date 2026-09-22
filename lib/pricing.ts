export type PricingType = 'fixed' | 'range' | 'starting_at' | 'custom';
export type PricingAdjustment = { label: string; minimum: number; maximum: number };
export function calculateEstimate(baseMinimum: number, baseMaximum: number, adjustments: PricingAdjustment[]) {
  const adjustmentMinimum = adjustments.reduce((sum, item) => sum + item.minimum, 0);
  const adjustmentMaximum = adjustments.reduce((sum, item) => sum + item.maximum, 0);
  return { baseMinimum, baseMaximum, adjustments, finalMinimum: baseMinimum + adjustmentMinimum, finalMaximum: baseMaximum + adjustmentMaximum };
}
