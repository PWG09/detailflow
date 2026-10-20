import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveOwnerWorkspace, resolveWorkspace } from '@/lib/workspace';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { effectivePlan, PLAN_LIMITS } from '@/lib/entitlements';
import { getAppUrl } from '@/lib/stripe';
import { writeAudit } from '@/lib/audit';

const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), role: z.literal('staff').default('staff') });

export async function GET() {
  const resolved = await resolveWorkspace();
  if (!resolved.ok) return resolved.response;
  const { supabase, membership } = resolved.workspace;
  const { data: members, error } = await supabase.rpc('get_team_members', { p_business_id: membership.business_id });
  if (error) {
    console.error('Team listing failed:', error.code, error.message);
    return NextResponse.json({ error: 'Unable to load team members.' }, { status: 500 });
  }
  return NextResponse.json({ members: members ?? [], currentRole: membership.role }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  const resolved = await resolveOwnerWorkspace('Only the owner can manage the team.');
  if (!resolved.ok) return resolved.response;
  const { supabase, user, membership } = resolved.workspace;

  const parsed = inviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 });
  if (parsed.data.email === user.email?.toLowerCase()) return NextResponse.json({ error: 'You are already a member of this workspace.' }, { status: 400 });

  const { data: business } = await supabase.from('businesses').select('plan,trial_status,trial_ends_at').eq('id', membership.business_id).single();
  const plan = effectivePlan({ plan: business?.plan, trialStatus: business?.trial_status, trialEndsAt: business?.trial_ends_at });
  const seatLimit = PLAN_LIMITS[plan].teamMembers;
  const admin = createSupabaseAdminClient();
  const { count, error: countError } = await admin.from('business_members').select('user_id', { count: 'exact', head: true }).eq('business_id', membership.business_id);
  if (countError) return NextResponse.json({ error: 'Unable to check team size.' }, { status: 500 });
  if (Number.isFinite(seatLimit) && (count ?? 0) >= seatLimit) {
    return NextResponse.json({ error: `Your plan includes ${seatLimit} team member${seatLimit === 1 ? '' : 's'}. Upgrade to add more.` }, { status: 402 });
  }

  const { data: invite, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, { redirectTo: `${getAppUrl()}/update-password` });
  if (error || !invite.user) {
    const alreadyRegistered = /already|registered|exists/i.test(error?.message ?? '');
    return NextResponse.json({
      error: alreadyRegistered
        ? 'This email already has a DetailFlow account. Accounts can belong to one workspace at a time; ask them to use a different email.'
        : 'Unable to send the invitation. Please try again.',
    }, { status: alreadyRegistered ? 409 : 502 });
  }

  const { error: memberError } = await admin.from('business_members').upsert(
    { business_id: membership.business_id, user_id: invite.user.id, role: 'staff' },
    { onConflict: 'business_id,user_id', ignoreDuplicates: true },
  );
  if (memberError) {
    console.error('Team membership save failed:', memberError.code, memberError.message);
    return NextResponse.json({ error: 'The invitation was sent, but the membership could not be saved. Please try again.' }, { status: 500 });
  }
  await writeAudit(membership.business_id, user.id, 'team.invited', 'member', invite.user.id, {});
  return NextResponse.json({ ok: true, email: parsed.data.email }, { status: 201 });
}
