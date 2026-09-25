import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAppUrl, getStripe } from '@/lib/stripe';
import Stripe from 'stripe';
export const runtime = 'nodejs';
async function auth(){const supabase=await createSupabaseServerClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return null;const {data:m}=await supabase.from('business_members').select('business_id,role').eq('user_id',user.id).maybeSingle();return m?{supabase,user,m}:null;}
export async function GET(){const c=await auth();if(!c)return NextResponse.json({error:'Not authenticated.'},{status:401});if(c.m.role!=='owner')return NextResponse.json({error:'Only the owner can manage Stripe payouts.'},{status:403});const {data:b,error}=await c.supabase.from('businesses').select('stripe_connected_account_id,stripe_connect_status,stripe_charges_enabled,stripe_payouts_enabled,stripe_details_submitted').eq('id',c.m.business_id).single();if(error)return NextResponse.json({error:'Unable to read Stripe connection.'},{status:500});if(!b?.stripe_connected_account_id)return NextResponse.json({connected:false,status:'not_connected',chargesEnabled:false,payoutsEnabled:false});try{const account=(await getStripe().accounts.retrieve(b.stripe_connected_account_id)) as unknown as Stripe.Account;const chargesEnabled=account.charges_enabled===true;const payoutsEnabled=account.payouts_enabled===true;const detailsSubmitted=account.details_submitted===true;const status=chargesEnabled&&payoutsEnabled?'connected':'incomplete';await c.supabase.from('businesses').update({stripe_connect_status:status,stripe_charges_enabled:chargesEnabled,stripe_payouts_enabled:payoutsEnabled,stripe_details_submitted:detailsSubmitted,updated_at:new Date().toISOString()}).eq('id',c.m.business_id);return NextResponse.json({connected:status==='connected',status,chargesEnabled,payoutsEnabled,detailsSubmitted});}catch{return NextResponse.json({connected:false,status:'error',chargesEnabled:false,payoutsEnabled:false});}}
export async function POST(){const c=await auth();if(!c)return NextResponse.json({error:'Not authenticated.'},{status:401});if(c.m.role!=='owner')return NextResponse.json({error:'Only the owner can connect Stripe.'},{status:403});const {data:b}=await c.supabase.from('businesses').select('id,name,email,stripe_connected_account_id').eq('id',c.m.business_id).single();if(!b)return NextResponse.json({error:'Workspace not found.'},{status:404});try{
  const stripe=getStripe();
  let accountId=b.stripe_connected_account_id;
  if(accountId){
    try{
      await stripe.accounts.retrieve(accountId);
    }catch(error){
      console.error('Stored Stripe connected account could not be retrieved:',error instanceof Error?error.message:'unknown');
      return NextResponse.json({error:'The saved Stripe connected account is no longer available. Contact support before reconnecting.'},{status:502});
    }
  }
  if(!accountId){
    const email=(b.email||c.user.email||'').trim() || undefined;
    const businessName=String(b.name||'DetailFlow business').trim().slice(0,100);
    const account=(await stripe.accounts.create({
      type:'express',
      ...(email ? {email} : {}),
      metadata:{businessId:b.id},
      business_profile:{name:businessName},
      capabilities:{card_payments:{requested:true},transfers:{requested:true}},
    })) as unknown as Stripe.Account;
    accountId=account.id;
    const {error:updateError}=await c.supabase.from('businesses').update({stripe_connected_account_id:accountId,stripe_connect_status:'incomplete',stripe_charges_enabled:false,stripe_payouts_enabled:false,stripe_details_submitted:false,updated_at:new Date().toISOString()}).eq('id',b.id);
    if(updateError){
      console.error('Failed to save Stripe connected account:',updateError.message);
      try{await stripe.accounts.del(accountId);}catch{}
      return NextResponse.json({error:'Stripe connected successfully, but DetailFlow could not save the connection.'},{status:500});
    }
  }
  const link=(await stripe.accountLinks.create({
    account:accountId,
    refresh_url:`${getAppUrl()}/dashboard/settings?stripe=refresh`,
    return_url:`${getAppUrl()}/dashboard/settings?stripe=return`,
    type:'account_onboarding',
  })) as unknown as Stripe.AccountLink;
  return NextResponse.json({url:link.url});
}catch(error){
  const message=error instanceof Error?error.message:'Unknown Stripe error';
  console.error('Stripe Connect onboarding failed:',message);
  return NextResponse.json({error:`Unable to start Stripe onboarding: ${message}`},{status:502});
}}
