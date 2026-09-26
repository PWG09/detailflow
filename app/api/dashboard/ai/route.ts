import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { assessVehicle } from '@/lib/ai';
import { persistentRateLimit } from '@/lib/security';

const schema = z.object({ leadId: z.string().uuid() });
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid lead.' }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const { data: membership } = await supabase
    .from('business_members')
    .select('business_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

  const { data: business } = await supabase
    .from('businesses')
    .select('plan')
    .eq('id', membership.business_id)
    .single();
  if (business?.plan !== 'pro') {
    return NextResponse.json({ error: 'AI photo assessment is available on Pro.' }, { status: 402 });
  }

  const throttle = await persistentRateLimit(`dashboard-ai:${membership.business_id}:${user.id}`, 10, 60);
  if (!throttle.allowed) return NextResponse.json({ error: 'AI requests are temporarily throttled. Please try again shortly.' }, { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(throttle.retryAfter / 1000))) } });

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', membership.business_id)
    .gte('ai_assessed_at', monthStart.toISOString());
  const aiMonthlyLimit = business?.plan === 'business' ? Number(process.env.BUSINESS_AI_MONTHLY_HARD_CAP || 5000) : 100;
  if ((count ?? 0) >= aiMonthlyLimit) {
    return NextResponse.json({ error: 'Monthly AI assessment limit reached.' }, { status: 429 });
  }

  const admin = createSupabaseAdminClient();
  const { data: lead, error: leadError } = await admin
    .from('leads')
    .select('id,business_id,photo_paths')
    .eq('id', parsed.data.leadId)
    .eq('business_id', membership.business_id)
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
  }

  // Recover older leads where the photos were successfully uploaded to
  // Storage but photo_paths was not persisted on the lead.
  let photoPaths = Array.isArray(lead.photo_paths) ? lead.photo_paths.filter(Boolean) : [];
  if (photoPaths.length === 0) {
    const storageFolder = `${membership.business_id}/leads/${lead.id}`;
    const { data: storedFiles, error: listError } = await admin.storage
      .from('vehicle-photos')
      .list(storageFolder, { limit: 8, sortBy: { column: 'name', order: 'asc' } });

    if (!listError && storedFiles?.length) {
      photoPaths = storedFiles
        .filter((file) => file.name && !file.name.endsWith('/'))
        .map((file) => `${storageFolder}/${file.name}`);

      const { error: repairError } = await admin
        .from('leads')
        .update({ photo_paths: photoPaths, updated_at: new Date().toISOString() })
        .eq('id', lead.id)
        .eq('business_id', membership.business_id);

      if (repairError) {
        console.error('Unable to repair lead photo paths', {
          leadId: lead.id,
          code: repairError.code,
          message: repairError.message,
        });
      }
    }
  }

  if (photoPaths.length === 0) {
    return NextResponse.json({
      error: 'No vehicle photos found. Submit a new quote with at least one JPG or PNG photo.',
    }, { status: 404 });
  }

  const files = [];
  for (const photoPath of photoPaths.slice(0, 4)) {
    const { data: file, error: downloadError } = await admin.storage
      .from('vehicle-photos')
      .download(photoPath);
    if (downloadError || !file) {
      console.error('Vehicle photo download failed', {
        leadId: lead.id,
        path: photoPath,
        message: downloadError?.message,
      });
      continue;
    }
    files.push(new Uint8Array(await file.arrayBuffer()));
  }

  if (!files.length) {
    return NextResponse.json({ error: 'The vehicle photo exists in Storage but could not be read.' }, { status: 500 });
  }

  try {
    const assessment = await assessVehicle(files);
    const { error: assessmentError } = await admin
      .from('leads')
      .update({ ai_assessment: assessment, ai_assessed_at: new Date().toISOString() })
      .eq('id', lead.id)
      .eq('business_id', membership.business_id);

    if (assessmentError) {
      console.error('AI assessment save failed', {
        leadId: lead.id,
        code: assessmentError.code,
        message: assessmentError.message,
      });
      return NextResponse.json({ error: 'The AI result was generated but could not be saved.' }, { status: 500 });
    }

    return NextResponse.json({ assessment });
  } catch (error) {
    console.error('AI assessment failed', {
      leadId: lead.id,
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return NextResponse.json({ error: 'The AI assessment service failed. Check the AI configuration in Vercel.' }, { status: 502 });
  }
}
