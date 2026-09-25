import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const inviteSchema = z.object({ email: z.string().email(), role: z.literal('staff').default('staff') });
async function membership() { const supabase = await createSupabaseServerClient(); const { data:{user} } = await supabase.auth.getUser(); if(!user) return null; const {data:m}=await supabase.from('business_members').select('business_id,role').eq('user_id',user.id).limit(1).maybeSingle(); return m ? {supabase,user,m} : null; }
export async function GET(){ const ctx=await membership(); if(!ctx) return NextResponse.json({error:'Not authenticated.'},{status:401}); const {data:members,error}=await ctx.supabase.from('business_members').select('user_id,role,created_at').eq('business_id',ctx.m.business_id).order('created_at'); if(error)return NextResponse.json({error:error.message},{status:500}); return NextResponse.json({members, currentRole:ctx.m.role}); }
export async function POST(request:Request){
  const ctx=await membership(); if(!ctx)return NextResponse.json({error:'Not authenticated.'},{status:401});
  if(ctx.m.role!=='owner')return NextResponse.json({error:'Only the owner can manage the team.'},{status:403});
  const parsed=inviteSchema.safeParse(await request.json().catch(()=>null)); if(!parsed.success)return NextResponse.json({error:'Enter a valid email.'},{status:400});
  const admin=createSupabaseAdminClient();
  const {data:invite,error}=await admin.auth.admin.inviteUserByEmail(parsed.data.email);
  if(error)return NextResponse.json({error:error.message},{status:400});
  const {error:memberError}=await admin.from('business_members').upsert({business_id:ctx.m.business_id,user_id:invite.user.id,role:'staff'},{onConflict:'business_id,user_id'});
  if(memberError)return NextResponse.json({error:'Invite was created, but membership could not be saved.'},{status:500});
  return NextResponse.json({ok:true,email:parsed.data.email}, {status:201});
}
