import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveWorkspace } from '@/lib/workspace';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { assessVehicle } from '@/lib/ai';
import { persistentRateLimit } from '@/lib/security';
import { effectivePlan, PLAN_LIMITS } from '@/lib/entitlements';
import { isLeadPhotoPath } from '@/lib/uploads';

const schema = z.object({ leadId: z.string().uuid() });
export const runtime = 'nodejs';
export const maxDuration = 60;

function monthStartIso() {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString();
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid lead.' }, { status: 400 });

  const resolved = await resolveWorkspace();
  if (!resolved.ok) return resolved.response;
  const { supabase, user, membership } = resolved.workspace;
  const businessId = membership.business_id;

  const { data: business } = await supabase.from('businesses').select('plan,trial_status,trial_ends_at').eq('id', businessId).single();
  const plan = effectivePlan({ plan: business?.plan, trialStatus: business?.trial_status, trialEndsAt: business?.trial_ends_at });
  const planLimit = PLAN_LIMITS[plan].aiPerMonth;
  if (planLimit <= 0) return NextResponse.json({ error: 'AI photo assessment is available on Pro and Business plans.' }, { status: 402 });
  const monthlyLimit = Number.isFinite(planLimit) ? planLimit : Number(process.env.BUSINESS_AI_MONTHLY_HARD_CAP || 5000);

  const throttle = await persistentRateLimit(`dashboard-ai:${businessId}:${user.id}`, 10, 60);
  if (!throttle.allowed) return NextResponse.json({ error: 'AI requests are temporarily throttled. Please try again shortly.' }, { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(throttle.retryAfter / 1000))) } });

  const admin = createSupabaseAdminClient();
  const { data: lead, error: leadError } = await admin
    .from('leads')
    .select('id,business_id,photo_paths,ai_assessment,ai_assessed_at')
    .eq('id', parsed.data.leadId)
    .eq('business_id', businessId)
    .maybeSingle();
  if (leadError) return NextResponse.json({ error: 'Unable to load this lead.' }, { status: 500 });
  if (!lead) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });

  // A stored assessment is reused; provider tokens are never spent twice on a lead.
  if (lead.ai_assessed_at && lead.ai_assessment) return NextResponse.json({ assessment: lead.ai_assessment, cached: true });

  const { count } = await admin.from('leads').select('id', { count: 'exact', head: true }).eq('business_id', businessId).gte('ai_assessed_at', monthStartIso());
  if ((count ?? 0) >= monthlyLimit) return NextResponse.json({ error: 'Monthly AI assessment limit reached.' }, { status: 429 });

  // Serialize attempts per lead so two tabs cannot send the same photos twice.
  const leadThrottle = await persistentRateLimit(`dashboard-ai-lead:${businessId}:${lead.id}`, 1, 2 * 60);
  if (!leadThrottle.allowed) {
    return NextResponse.json({ error: 'This lead is already being assessed. Please wait a moment.' }, { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(leadThrottle.retryAfter / 1000))) } });
  }

  let photoPaths = (Array.isArray(lead.photo_paths) ? lead.photo_paths : []).filter((path) => isLeadPhotoPath(path, businessId, lead.id));
  if (photoPaths.length === 0) {
    // Older leads may have photos in Storage without photo_paths saved. The
    // folder is scoped to this business and lead, so it cannot reach another tenant.
    const folder = `${businessId}/leads/${lead.id}`;
    const { data: stored, error: listError } = await admin.storage.from('vehicle-photos').list(folder, { limit: 8, sortBy: { column: 'name', order: 'asc' } });
    if (!listError && stored?.length) {
      photoPaths = stored.map((file) => `${folder}/${file.name}`).filter((path) => isLeadPhotoPath(path, businessId, lead.id));
      if (photoPaths.length) {
        const { error: repairError } = await admin.from('leads').update({ photo_paths: photoPaths, updated_at: new Date().toISOString() }).eq('id', lead.id).eq('business_id', businessId);
        if (repairError) console.error('Unable to repair lead photo paths', { leadId: lead.id, code: repairError.code });
      }
    }
  }
  if (photoPaths.length === 0) return NextResponse.json({ error: 'This lead has no vehicle photos to assess.' }, { status: 404 });

  const files: Uint8Array[] = [];
  for (const photoPath of photoPaths.slice(0, 4)) {
    const { data: file, error: downloadError } = await admin.storage.from('vehicle-photos').download(photoPath);
    if (downloadError || !file) {
      console.error('Vehicle photo download failed', { leadId: lead.id, message: downloadError?.message });
      continue;
    }
    files.push(new Uint8Array(await file.arrayBuffer()));
  }
  if (!files.length) return NextResponse.json({ error: 'The vehicle photos could not be read.' }, { status: 500 });

  try {
    const assessment = await assessVehicle(files);
    const { error: saveError } = await admin.from('leads')
      .update({ ai_assessment: assessment, ai_assessed_at: new Date().toISOString() })
      .eq('id', lead.id).eq('business_id', businessId);
    if (saveError) {
      console.error('AI assessment save failed', { leadId: lead.id, code: saveError.code });
      return NextResponse.json({ error: 'The assessment was generated but could not be saved. Please try again.' }, { status: 500 });
    }
    return NextResponse.json({ assessment });
  } catch (error) {
    console.error('AI assessment failed', { leadId: lead.id, message: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ error: 'The AI assessment service is unavailable right now. Please try again later.' }, { status: 502 });
  }
}
