import { z } from 'zod';

export const VEHICLE_TYPES = ['Sedan', 'SUV', 'Truck', 'Coupe', 'Van', 'Motorcycle', 'Other'] as const;

const phonePattern = /^[+()\d\s.-]{7,30}$/;

export const publicQuoteSchema = z.object({
  businessSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'This business link is not valid.'),
  serviceName: z.string({ required_error: 'Select a service.' }).trim().min(2, 'Select a service.').max(120),
  firstName: z.string({ required_error: 'Enter your first name.' }).trim().min(1, 'Enter your first name.').max(80, 'First name is too long.'),
  lastName: z.string({ required_error: 'Enter your last name.' }).trim().min(1, 'Enter your last name.').max(80, 'Last name is too long.'),
  email: z.string({ required_error: 'Enter your email.' }).trim().email('Enter a valid email address.').max(254),
  phone: z.string({ required_error: 'Enter your phone number.' }).trim()
    .regex(phonePattern, 'Enter a valid phone number.')
    .refine((value) => value.replace(/\D/g, '').length >= 7, 'Enter a valid phone number.'),
  year: z.coerce.number({ invalid_type_error: 'Enter the vehicle year.' }).int('Enter the vehicle year.')
    .min(1900, 'Enter a valid vehicle year.')
    .max(new Date().getFullYear() + 2, 'Enter a valid vehicle year.'),
  makeModel: z.string({ required_error: 'Enter the make and model.' }).trim().min(2, 'Enter the make and model.').max(120),
  vehicleType: z.enum(VEHICLE_TYPES, { errorMap: () => ({ message: 'Select a vehicle type.' }) }),
  condition: z.string().trim().max(2000, 'Notes must be 2000 characters or fewer.').default(''),
  consent: z.literal('true', { errorMap: () => ({ message: 'Please accept the privacy and terms notice.' }) }),
});

export type PublicQuoteInput = z.infer<typeof publicQuoteSchema>;
