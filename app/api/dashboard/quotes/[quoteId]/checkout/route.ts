import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAppUrl, getStripe } from '@/lib/stripe';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import Stripe from 'stripe';
const paramsSchema=z.object({quoteId:z.string().uuid()});
export const runtime='nodejs';
export async function POST(_request:Request,{params}:{params:Promise<{quoteId:string}>}){
 const parsed=paramsSchema.safeParse(await params);if(!parsed.success)return NextResponse.json({error:'Invalid quote.'},{status:400});
 const supabase=await createSupabaseServerClient();const {data:userData}=await supabase.auth.getUser();if(!userData.user)return NextResponse.json({error:'Not authenticated.'},{status:401});
 const {data:membership}=await supabase.from('business_members').select('business_id').eq('user_id',userData.user.id).maybeSingle();if(!membership)return NextResponse.json({error:'Workspace not found.'},{status:404});
 const {data:quote,error:quoteError}=await supabase.from('quotes').select('id,quote_number,total,status,payment_status,stripe_checkout_session_id,customer_id,business_id').eq('id',parsed.data.quoteId).eq('business_id',membership.business_id).maybeSingle();
 if(quoteError){console.error('Quote lookup failed:',quoteError.message);return NextResponse.json({error:'Unable to load this quote.'},{status:500});}
 if(!quote)return NextResponse.json({error:'Quote not found.'},{status:404});
 if(quote.status!=='accepted')return NextResponse.json({error:'Only accepted quotes can be paid.'},{status:400});if(quote.payment_status==='paid')return NextResponse.json({error:'This quote is already paid.'},{status:409});
 const {data:business,error:businessError}=await supabase.from('businesses').select('id,name,currency,stripe_connected_account_id,stripe_connect_status,stripe_charges_enabled,stripe_payouts_enabled,platform_fee_percent').eq('id',membership.business_id).single();
 if(businessError){console.error('Business payment configuration lookup failed:',businessError.message);return NextResponse.json({error:'Unable to load the business payment configuration.'},{status:500});}
 const {data:customer}=quote.customer_id?await supabase.from('customers').select('email,first_name,last_name').eq('id',quote.customer_id).eq('business_id',membership.business_id).maybeSingle():{data:null};
 if(quote.stripe_checkout_session_id){try{const s=(await getStripe().checkout.sessions.retrieve(quote.stripe_checkout_session_id)) as unknown as Stripe.Checkout.Session;if(s.url)return NextResponse.json({url:s.url});}catch{}}
 const amount=Math.round(Number(quote.total)*100);if(!Number.isInteger(amount)||amount<=0)return NextResponse.json({error:'The quote must have a valid total.'},{status:400});
 const currency=(business?.currency||'USD').toLowerCase();
 if(!process.env.STRIPE_SECRET_KEY)return NextResponse.json({error:'Stripe payments are not configured.'},{status:503});
 const allowedCurrencies=new Set(['usd','cad','eur','gbp','aud','nzd']);if(!allowedCurrencies.has(currency))return NextResponse.json({error:`Unsupported payment currency: ${currency.toUpperCase()}.`},{status:400});
 if(!business?.stripe_connected_account_id||!business.stripe_charges_enabled||!business.stripe_payouts_enabled)return NextResponse.json({error:'This business has not finished connecting Stripe. The business owner must connect and verify Stripe before customers can pay.'},{status:409});
 const feePercent=Math.min(100,Math.max(0,Number(business.platform_fee_percent??process.env.STRIPE_APPLICATION_FEE_PERCENT??2.5)));const fee=Math.min(amount,Math.round(amount*feePercent/100));
 try{
  const stripe=getStripe();
  const sessionParams: Stripe.Checkout.SessionCreateParams={mode:'payment',customer_email:customer?.email||undefined,line_items:[{price_data:{currency,product_data:{name:`Quote ${quote.quote_number}`},unit_amount:amount},quantity:1}],metadata:{quoteId:quote.id,businessId:membership.business_id,connectedAccountId:business.stripe_connected_account_id,platformFeeAmount:String(fee)},payment_intent_data:{application_fee_amount:fee,transfer_data:{destination:business.stripe_connected_account_id},metadata:{quoteId:quote.id,businessId:membership.business_id}},success_url:`${getAppUrl()}/quote/payment/success?session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${getAppUrl()}/quote/payment/cancelled`};
  const session=(await stripe.checkout.sessions.create(sessionParams,{idempotencyKey:`quote-payment:${quote.id}`})) as unknown as Stripe.Checkout.Session;
  if(!session.url)return NextResponse.json({error:'Stripe did not return a checkout URL.'},{status:502});
  const {error:updateError}=await supabase.from('quotes').update({payment_status:'pending',stripe_checkout_session_id:session.id,updated_at:new Date().toISOString()}).eq('id',quote.id).eq('business_id',membership.business_id);if(updateError)return NextResponse.json({error:'Stripe checkout was created, but the quote could not be updated. Please do not create another payment yet.'},{status:500});
  return NextResponse.json({url:session.url,platformFeePercent:feePercent});
 }catch(error){console.error('Stripe Connect quote checkout failed:',error instanceof Error?error.message:'unknown');return NextResponse.json({error:'Stripe could not start the payment. Check the live connected account and platform configuration.'},{status:502});}
}
