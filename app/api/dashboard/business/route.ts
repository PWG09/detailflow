import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveOwnerWorkspace, resolveWorkspace } from '@/lib/workspace';
import { isReservedBusinessSlug, normalizeBusinessSlug } from '@/lib/slug';
import { SUPPORTED_CURRENCIES } from '@/lib/quote-math';
import { writeAudit } from '@/lib/audit';

const businessSchema = z.object({
  name: z.string().trim().min(2, 'Business name must be at least 2 characters.').max(120),
  slug: z.string().trim().min(1).max(60),
  email: z.string().trim().email('Enter a valid business email.').max(254),
  phone: z.string().trim().min(7, 'Enter a valid phone number.').max(40),
  description: z.string().trim().min(10, 'Description must be at least 10 characters.').max(500),
  currency: z.string().trim().transform((value) => value.toUpperCase())
    .refine((value) => SUPPORTED_CURRENCIES.has(value.toLowerCase()), 'Choose a supported currency.').optional(),
  tax_rate: z.coerce.number().min(0, 'Tax rate cannot be negative.').max(100, 'Tax rate cannot exceed 100%.').optional(),
});

const SELECT = 'id,name,slug,email,phone,description,currency,tax_rate';

function leadUrl(slug: string) {
  return `${(process.env.NEXT_PUBLIC_APP_URL || 'https://detailflow-two.vercel.app').replace(/\/+$/, '')}/${slug}/lead`;
}

export async function GET() {
  const resolved = await resolveWorkspace();
  if (!resolved.ok) return resolved.response;
  const { supabase, membership } = resolved.workspace;
  const { data, error } = await supabase.from('businesses').select(SELECT).eq('id', membership.business_id).single();
  if (error || !data) return NextResponse.json({ error: 'Unable to load business profile.' }, { status: 500 });
  return NextResponse.json({ ...data, leadUrl: leadUrl(data.slug), role: membership.role }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(request: Request) {
  const resolved = await resolveOwnerWorkspace('Only the business owner can edit the business profile.');
  if (!resolved.ok) return resolved.response;
  const { supabase, user, membership } = resolved.workspace;

  const parsed = businessSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid business profile.' }, { status: 400 });
  const slug = normalizeBusinessSlug(parsed.data.slug);
  if (!slug || isReservedBusinessSlug(slug)) return NextResponse.json({ error: 'Choose another public link name.' }, { status: 400 });

  const update: Record<string, unknown> = {
    name: parsed.data.name,
    slug,
    email: parsed.data.email,
    phone: parsed.data.phone,
    description: parsed.data.description,
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.currency !== undefined) update.currency = parsed.data.currency;
  if (parsed.data.tax_rate !== undefined) update.tax_rate = Math.round(parsed.data.tax_rate * 100) / 100;

  const { data, error } = await supabase.from('businesses').update(update).eq('id', membership.business_id).select(SELECT).single();
  if (error?.code === '23505') return NextResponse.json({ error: 'That public link is already taken.' }, { status: 409 });
  if (error || !data) {
    console.error('Business profile update failed:', error?.code, error?.message);
    return NextResponse.json({ error: 'Unable to save business profile.' }, { status: 500 });
  }
  await writeAudit(membership.business_id, user.id, 'business.updated', 'business', membership.business_id, { slug });
  return NextResponse.json({ ...data, leadUrl: leadUrl(data.slug), role: membership.role });
}
