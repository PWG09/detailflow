import { z } from 'zod';

export const vehicleAssessmentSchema = z.object({
  severity: z.enum(['low', 'medium', 'high', 'unknown']),
  notes: z.string().max(1000),
  recommendedChecks: z.array(z.string().max(120)).max(10),
});
export type VehicleAssessment = z.infer<typeof vehicleAssessmentSchema>;

export async function assessVehicle(_imageBytes: Uint8Array, signal?: AbortSignal): Promise<VehicleAssessment> {
  if (signal?.aborted) throw new Error('AI assessment timed out.');
  return { severity: 'unknown', notes: 'No automated assessment is configured. Review the submitted photos manually.', recommendedChecks: ['Inspect paint condition', 'Inspect interior condition', 'Confirm requested service'] };
}
