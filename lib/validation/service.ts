import { z } from 'zod';

const price = z.coerce.number({ invalid_type_error: 'Enter a price.' })
  .finite()
  .min(0, 'Prices cannot be negative.')
  .max(1_000_000, 'Price is too large.')
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, 'Use at most two decimal places.');

const base = z.object({
  name: z.string().trim().min(2, 'Service name must be at least 2 characters.').max(120),
  description: z.string().trim().max(500).optional().default(''),
  pricingType: z.enum(['fixed', 'range', 'starting_at', 'custom']),
  minimumPrice: price,
  maximumPrice: price,
  requiresPhotos: z.boolean().default(false),
  active: z.boolean().default(true),
});

const rangeRule = (value: { minimumPrice: number; maximumPrice: number }) => value.maximumPrice >= value.minimumPrice;
const rangeMessage = { message: 'Maximum price must be greater than or equal to minimum price.', path: ['maximumPrice'] };

export const serviceSchema = base.refine(rangeRule, rangeMessage);
export type ServiceInput = z.infer<typeof serviceSchema>;

export function serviceRow(input: ServiceInput) {
  // A fixed price has no range.
  const maximum = input.pricingType === 'fixed' ? input.minimumPrice : input.maximumPrice;
  return {
    name: input.name,
    description: input.description,
    pricing_type: input.pricingType,
    minimum_price: input.minimumPrice,
    maximum_price: maximum,
    requires_photos: input.requiresPhotos,
    active: input.active,
  };
}
