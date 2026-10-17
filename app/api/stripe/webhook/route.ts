import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import Stripe from 'stripe';
import { hashRiskValue } from '@/lib/trial-risk';
export const runtime='nodejs';

// Platform events (payments, subscriptions) and Connect events (account.updated
// from connected accounts) are delivered by two separate Stripe webhook
// endpoints, each with its own signing secret. Both may point at this route.
function webhookSecrets(){
 return [process.env.STRIPE_WEBHOOK_SECRET,process.env.STRIPE_CONNECT_WEBHOOK_SECRET]
  .flatMap(value=>(value||'').split(','))
  .map(value=>value.trim())
  .filter(Boolean);
}

// Supabase returns errors instead of throwing. Throw so the event is released
// and Stripe retries it instead of being recorded as processed.
function must(result:{error:{message:string}|null},step:string){
 if(result.error)throw new Error(`${step}: ${result.error.message}`);
}

export async function POST(request:Request){
 const signature=request.headers.get('stripe-signature');const secrets=webhookSecrets();if(!signature||!secrets.length)return NextResponse.json({error:'Stripe webhook is not configured.'},{status:400});
 const payload=await request.text();
 let event:Stripe.Event|null=null;
 for(const secret of secrets){try{event=getStripe().webhooks.constructEvent(payload,signature,secret);break;}catch{}}
 if(!event)return NextResponse.json({error:'Invalid Stripe signature.'},{status:400});
 const supabase=createSupabaseAdminClient();
 const {error:claimError}=await supabase.from('stripe_events').insert({stripe_event_id:event.id,event_type:event.type});
 if(claimError){
  if(claimError.code==='23505') return NextResponse.json({received:true,duplicate:true});
  console.error('Unable to claim Stripe event:',claimError.message);
  return NextResponse.json({error:'Webhook processing unavailable.'},{status:500});
 }
 try{
  const now=()=>new Date().toISOString();
  if(event.type==='checkout.session.completed'||event.type==='checkout.session.async_payment_succeeded'){
   const session=event.data.object as Stripe.Checkout.Session;const quoteId=session.metadata?.quoteId;
   if(quoteId&&session.payment_status==='paid')must(await supabase.from('quotes').update({payment_status:'paid',stripe_checkout_session_id:session.id,stripe_payment_intent_id:typeof session.payment_intent==='string'?session.payment_intent:null,updated_at:now()}).eq('id',quoteId),'quote paid');
   const businessId=session.metadata?.businessId;const plan=session.metadata?.plan as 'pro'|'business'|undefined;
   if(session.mode==='subscription'&&businessId&&plan){const customerId=typeof session.customer==='string'?session.customer:null;const subscriptionId=typeof session.subscription==='string'?session.subscription:null;must(await supabase.from('businesses').update({plan,stripe_customer_id:customerId,stripe_subscription_id:subscriptionId,subscription_status:'active',trial_status:'none',updated_at:now()}).eq('id',businessId),'subscription checkout');}
  }
  if(event.type==='customer.subscription.created'||event.type==='customer.subscription.updated'||event.type==='customer.subscription.deleted'){
   const subscription=event.data.object as Stripe.Subscription;const businessId=subscription.metadata?.businessId;
   if(businessId){
    const status=subscription.status;const plan=(subscription.metadata?.plan==='business'?'business':'pro');
    const free=event.type==='customer.subscription.deleted'||status==='canceled'||status==='unpaid'||status==='incomplete_expired';
    const effectivePlan=free?'free':plan;const customerId=typeof subscription.customer==='string'?subscription.customer:null;const subscriptionItem=subscription.items.data[0];
    let paymentFingerprintHash:string|null=null;
    try {
     const defaultPaymentMethod=typeof subscription.default_payment_method==='string'?subscription.default_payment_method:null;
     if(defaultPaymentMethod){
      const pm=await getStripe().paymentMethods.retrieve(defaultPaymentMethod);
      const rawFingerprint=pm.card?.fingerprint || pm.us_bank_account?.fingerprint || null;
      if(rawFingerprint) paymentFingerprintHash=hashRiskValue(rawFingerprint);
     }
    }catch(paymentError){ console.error('Unable to resolve subscription payment fingerprint:',paymentError instanceof Error?paymentError.message:'unknown'); }
    const currentPeriodStart=subscriptionItem?.current_period_start??null;const currentPeriodEnd=subscriptionItem?.current_period_end??null;
    must(await supabase.from('businesses').update({plan:effectivePlan,stripe_customer_id:customerId,stripe_subscription_id:subscription.id,subscription_status:status,trial_status:'none',updated_at:now()}).eq('id',businessId),'subscription business sync');
    if(paymentFingerprintHash){ must(await supabase.from('trial_claims').update({payment_fingerprint_hash:paymentFingerprintHash}).eq('business_id',businessId),'payment fingerprint'); }
    must(await supabase.from('subscriptions').upsert({business_id:businessId,stripe_customer_id:customerId,stripe_subscription_id:subscription.id,stripe_price_id:subscriptionItem?.price.id??null,plan,status,current_period_start:currentPeriodStart?new Date(currentPeriodStart*1000).toISOString():null,current_period_end:currentPeriodEnd?new Date(currentPeriodEnd*1000).toISOString():null,cancel_at_period_end:subscription.cancel_at_period_end,updated_at:now()},{onConflict:'business_id'}),'subscription record');
   }
  }
  if(event.type==='invoice.paid'||event.type==='invoice.payment_failed'){
   const invoice=event.data.object as Stripe.Invoice;
   // Stripe's newer invoice shape may expose the originating subscription
   // through parent.subscription_details instead of the legacy top-level field.
   const invoiceShape=invoice as unknown as {
    subscription?: string|null;
    parent?: {subscription_details?: {subscription?: string|null}|null}|null;
   };
   const legacySubscriptionId=typeof invoiceShape.subscription==='string'?invoiceShape.subscription:null;
   const parentSubscriptionId=typeof invoiceShape.parent?.subscription_details?.subscription==='string'
    ? invoiceShape.parent.subscription_details.subscription
    : null;
   const subscriptionId=legacySubscriptionId||parentSubscriptionId;
   if(subscriptionId){const status=event.type==='invoice.paid'?'active':'past_due';must(await supabase.from('subscriptions').update({status,updated_at:now()}).eq('stripe_subscription_id',subscriptionId),'invoice subscription');must(await supabase.from('businesses').update({subscription_status:status,updated_at:now()}).eq('stripe_subscription_id',subscriptionId),'invoice business');}
  }
  if(event.type==='checkout.session.expired'){const session=event.data.object as Stripe.Checkout.Session;const quoteId=session.metadata?.quoteId;if(quoteId)must(await supabase.from('quotes').update({payment_status:'failed',stripe_checkout_session_id:null,updated_at:now()}).eq('id',quoteId).eq('payment_status','pending'),'checkout expired');}
  if(event.type==='checkout.session.async_payment_failed'){const session=event.data.object as Stripe.Checkout.Session;const quoteId=session.metadata?.quoteId;if(quoteId)must(await supabase.from('quotes').update({payment_status:'failed',stripe_checkout_session_id:null,updated_at:now()}).eq('id',quoteId),'async payment failed');}
  if(event.type==='charge.dispute.created'){const dispute=event.data.object as Stripe.Dispute;const paymentIntent=typeof dispute.payment_intent==='string'?dispute.payment_intent:null;if(paymentIntent)must(await supabase.from('quotes').update({payment_status:'disputed',updated_at:now()}).eq('stripe_payment_intent_id',paymentIntent),'dispute');}
  if(event.type==='charge.refunded'){const charge=event.data.object as Stripe.Charge;const quoteId=charge.metadata?.quoteId;if(quoteId)must(await supabase.from('quotes').update({payment_status:'refunded',updated_at:now()}).eq('id',quoteId),'refund');else if(typeof charge.payment_intent==='string')must(await supabase.from('quotes').update({payment_status:'refunded',updated_at:now()}).eq('stripe_payment_intent_id',charge.payment_intent),'refund');}
  if(event.type==='account.updated'){const account=event.data.object as Stripe.Account;const businessId=account.metadata?.businessId;if(businessId)must(await supabase.from('businesses').update({stripe_connect_status:account.charges_enabled&&account.payouts_enabled?'connected':'incomplete',stripe_charges_enabled:account.charges_enabled===true,stripe_payouts_enabled:account.payouts_enabled===true,stripe_details_submitted:account.details_submitted===true,updated_at:now()}).eq('id',businessId).eq('stripe_connected_account_id',account.id),'connect account');}
 }catch(error){
  console.error('Stripe webhook processing failed:',event.type,error instanceof Error?error.message:'unknown');
  await supabase.from('stripe_events').delete().eq('stripe_event_id',event.id);
  return NextResponse.json({error:'Webhook processing failed.'},{status:500});
 }
 return NextResponse.json({received:true});
}
