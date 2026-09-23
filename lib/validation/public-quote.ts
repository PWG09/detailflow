import { z } from 'zod';

export const publicQuoteSchema = z.object({
  businessSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  serviceName: z.string().min(2).max(120),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(7).max(30),
  year: z.coerce.number().int().min(1886).max(new Date().getFullYear() + 2),
  makeModel: z.string().trim().min(2).max(120),
  vehicleType: z.enum(['Sedan', 'SUV', 'Truck', 'Coupe', 'Van', 'Motorcycle', 'Other']),
  condition: z.string().trim().max(2000).default(''),
});

export type PublicQuoteInput = z.infer<typeof publicQuoteSchema>;
