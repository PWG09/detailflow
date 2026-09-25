import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import Stripe from 'stripe';
export const runtime='nodejs';
export async function POST(request:Request){
 const signature=request.headers.get('stripe-signature');const webhookSecret=process.env.STRIPE_WEBHOOK_SECRET;if(!signature||!webhookSecret)return NextResponse.json({error:'Stripe webhook is not configured.'},{status:400});
 let event:Stripe.Event;try{event=getStripe().webhooks.constructEvent(await request.text(),signature,webhookSecret);}catch{return NextResponse.json({error:'Invalid Stripe signature.'},{status:400});}
 const supabase=createSupabaseAdminClient();const {data:existingEvent}=await supabase.from('stripe_events').select('stripe_event_id').eq('stripe_event_id',event.id).maybeSingle();if(existingEvent)return NextResponse.json({received:true,duplicate:true});
 try{
  if(event.type==='checkout.session.completed'||event.type==='checkout.session.async_payment_succeeded'){
   const session=event.data.object as Stripe.Checkout.Session;const quoteId=session.metadata?.quoteId;
   if(quoteId&&session.payment_status==='paid')await supabase.from('quotes').update({payment_status:'paid',stripe_checkout_session_id:session.id,stripe_payment_intent_id:typeof session.payment_intent==='string'?session.payment_intent:null,updated_at:new Date().toISOString()}).eq('id',quoteId);
   const businessId=session.metadata?.businessId;const plan=session.metadata?.plan as 'pro'|'business'|undefined;
   if(session.mode==='subscription'&&businessId&&plan){const customerId=typeof session.customer==='string'?session.customer:null;const subscriptionId=typeof session.subscription==='string'?session.subscription:null;await supabase.from('businesses').update({plan,stripe_customer_id:customerId,stripe_subscription_id:subscriptionId,subscription_status:'active',updated_at:new Date().toISOString()}).eq('id',businessId);}
  }
  if(event.type==='customer.subscription.created'||event.type==='customer.subscription.updated'||event.type==='customer.subscription.deleted'){
   const subscription=event.data.object as Stripe.Subscription;const businessId=subscription.metadata?.businessId;if(businessId){const status=subscription.status;const plan=(subscription.metadata?.plan==='business'?'business':'pro');const free=event.type==='customer.subscription.deleted'||status==='canceled'||status==='unpaid'||status==='incomplete_expired';const effectivePlan=free?'free':plan;const customerId=typeof subscription.customer==='string'?subscription.customer:null;const subscriptionItem=subscription.items.data[0];const currentPeriodStart=subscriptionItem?.current_period_start??null;const currentPeriodEnd=subscriptionItem?.current_period_end??null;await supabase.from('businesses').update({plan:effectivePlan,stripe_customer_id:customerId,stripe_subscription_id:subscription.id,subscription_status:status,updated_at:new Date().toISOString()}).eq('id',businessId);await supabase.from('subscriptions').upsert({business_id:businessId,stripe_customer_id:customerId,stripe_subscription_id:subscription.id,stripe_price_id:subscriptionItem?.price.id??null,plan,status,current_period_start:currentPeriodStart?new Date(currentPeriodStart*1000).toISOString():null,current_period_end:currentPeriodEnd?new Date(currentPeriodEnd*1000).toISOString():null,cancel_at_period_end:subscription.cancel_at_period_end,updated_at:new Date().toISOString()},{onConflict:'business_id'});}
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
   if(subscriptionId){const status=event.type==='invoice.paid'?'active':'past_due';await supabase.from('subscriptions').update({status,updated_at:new Date().toISOString()}).eq('stripe_subscription_id',subscriptionId);await supabase.from('businesses').update({subscription_status:status,updated_at:new Date().toISOString()}).eq('stripe_subscription_id',subscriptionId);}
  }
  if(event.type==='checkout.session.expired'){const session=event.data.object as Stripe.Checkout.Session;const quoteId=session.metadata?.quoteId;if(quoteId)await supabase.from('quotes').update({payment_status:'failed',updated_at:new Date().toISOString()}).eq('id',quoteId).eq('payment_status','pending');}
  if(event.type==='checkout.session.async_payment_failed'){const session=event.data.object as Stripe.Checkout.Session;const quoteId=session.metadata?.quoteId;if(quoteId)await supabase.from('quotes').update({payment_status:'failed',updated_at:new Date().toISOString()}).eq('id',quoteId);}
  if(event.type==='charge.dispute.created'){const dispute=event.data.object as Stripe.Dispute;const paymentIntent=typeof dispute.payment_intent==='string'?dispute.payment_intent:null;if(paymentIntent)await supabase.from('quotes').update({payment_status:'disputed',updated_at:new Date().toISOString()}).eq('stripe_payment_intent_id',paymentIntent);}
  if(event.type==='charge.refunded'){const charge=event.data.object as Stripe.Charge;const quoteId=charge.metadata?.quoteId;if(quoteId)await supabase.from('quotes').update({payment_status:'refunded',updated_at:new Date().toISOString()}).eq('id',quoteId);else if(typeof charge.payment_intent==='string')await supabase.from('quotes').update({payment_status:'refunded',updated_at:new Date().toISOString()}).eq('stripe_payment_intent_id',charge.payment_intent);}
  if(event.type==='account.updated'){const account=event.data.object as Stripe.Account;const businessId=account.metadata?.businessId;if(businessId)await supabase.from('businesses').update({stripe_connect_status:account.charges_enabled&&account.payouts_enabled?'connected':'incomplete',stripe_charges_enabled:account.charges_enabled===true,stripe_payouts_enabled:account.payouts_enabled===true,stripe_details_submitted:account.details_submitted===true,updated_at:new Date().toISOString()}).eq('id',businessId);}
 const {error:eventInsertError}=await supabase.from('stripe_events').insert({stripe_event_id:event.id,event_type:event.type});if(eventInsertError && eventInsertError.code!=='23505')throw eventInsertError;
 }catch(error){console.error('Stripe webhook processing failed:',event.type,error instanceof Error?error.message:'unknown');return NextResponse.json({error:'Webhook processing failed.'},{status:500});}
 return NextResponse.json({received:true});
}
