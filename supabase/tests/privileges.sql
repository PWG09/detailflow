insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','owner@x.com','{"full_name":"Owner One"}'),
 ('22222222-2222-2222-2222-222222222222','other@x.com','{}'),
 ('33333333-3333-3333-3333-333333333333','staff@x.com','{}');
create table public.zz_results(name text, outcome text);
grant all on public.zz_results to authenticated, service_role, anon;
create or replace function public.zz_t(name text, q text, expect_ok boolean) returns void language plpgsql as $f$
begin
  begin execute q;
    insert into public.zz_results values (name, case when expect_ok then 'PASS' else 'FAIL (should be denied)' end);
  exception when others then
    insert into public.zz_results values (name, case when expect_ok then 'FAIL: '||sqlerrm else 'PASS (denied: '||left(sqlerrm,60)||')' end);
  end;
end $f$;
grant execute on function public.zz_t(text,text,boolean) to authenticated, service_role, anon;
-- @@ (checks below are executed one by one by scripts/test-db.mjs)
-- @@
set role service_role;
insert into public.businesses(id,owner_id,name,slug,email,plan,trial_status,trial_started_at,trial_ends_at)
 values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Shine Co','shine-co','o@x.com','pro','active',now(),now()+interval '14 days');
insert into public.services(id,business_id,name,minimum_price,maximum_price) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Full detail',100,300);
insert into public.customers(id,business_id,first_name,last_name,email,normalized_email) values ('cccccccc-cccc-cccc-cccc-cccccccccccc','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Ann','Lee','a@x.com','a@x.com');
insert into public.leads(id,business_id,customer_id,service_id,vehicle) values ('dddddddd-dddd-dddd-dddd-dddddddddddd','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','cccccccc-cccc-cccc-cccc-cccccccccccc','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','{"year":2020,"makeModel":"Honda Civic","type":"Sedan"}');
insert into public.business_members(business_id,user_id,role) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333','staff');
insert into public.trial_claims(user_id,business_id,email_hash,ip_hash,device_hash,risk_level,trial_started_at,trial_ends_at) values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','e','i','d','low',now(),now());
insert into public.auth_verification_intents(email_hash,token_hash,expires_at) values ('e','t',now()+interval '30 minutes');
select public.zz_t('service: rate limit rpc', $q$select * from public.consume_rate_limit('k',2,60)$q$, true);
select public.zz_t('service: cleanup rpc', $q$select * from public.cleanup_security_state()$q$, true);
select public.zz_t('service: webhook-style quote paid update', $q$update public.quotes set payment_status='paid' where false$q$, true);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.zz_t('owner: read own business', $q$do $x$ begin if (select count(*) from public.businesses)<>1 then raise exception 'count'; end if; end $x$$q$, true);
select public.zz_t('owner: read own membership (login check)', $q$do $x$ begin if (select count(*) from public.business_members where user_id='11111111-1111-1111-1111-111111111111')<>1 then raise exception 'm'; end if; end $x$$q$, true);
select public.zz_t('owner: edit profile', $q$update public.businesses set name='Shine Co 2', slug='shine-co-2', updated_at=now() where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$q$, true);
select public.zz_t('owner: self-upgrade plan', $q$update public.businesses set plan='business' where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$q$, false);
select public.zz_t('owner: extend trial', $q$update public.businesses set trial_ends_at=now()+interval '1 year' where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$q$, false);
select public.zz_t('owner: fake stripe connect', $q$update public.businesses set stripe_charges_enabled=true where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$q$, false);
select public.zz_t('owner: lower platform fee', $q$update public.businesses set platform_fee_percent=0 where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$q$, false);
select public.zz_t('owner: create business directly', $q$insert into public.businesses(owner_id,name,slug,plan) values ('11111111-1111-1111-1111-111111111111','Free Biz','free-biz','business')$q$, false);
select public.zz_t('owner: add member directly', $q$insert into public.business_members(business_id,user_id,role) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','staff')$q$, false);
select public.zz_t('owner: create service', $q$insert into public.services(business_id,name,minimum_price,maximum_price) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Wash',20,40)$q$, true);
select public.zz_t('owner: create customer (metrics trigger)', $q$insert into public.customers(business_id,first_name,last_name,email,normalized_email) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Bo','Ra','b@x.com','b@x.com')$q$, true);
select public.zz_t('owner: create quote (metrics trigger)', $q$insert into public.quotes(business_id,lead_id,customer_id,quote_number,services,subtotal,total,status,notes) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','dddddddd-dddd-dddd-dddd-dddddddddddd','cccccccc-cccc-cccc-cccc-cccccccccccc','Q-1','[]',150,150,'draft','')$q$, true);
select public.zz_t('owner: insert quote already paid', $q$insert into public.quotes(business_id,quote_number,total,payment_status) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Q-2',10,'paid')$q$, false);
select public.zz_t('owner: update quote status', $q$update public.quotes set status='accepted', notes='ok', updated_at=now() where quote_number='Q-1'$q$, true);
select public.zz_t('owner: mark quote paid', $q$update public.quotes set payment_status='paid' where quote_number='Q-1'$q$, false);
select public.zz_t('owner: update lead status (triggers)', $q$update public.leads set status='won', notes='n', closed_at=now(), updated_at=now() where id='dddddddd-dddd-dddd-dddd-dddddddddddd'$q$, true);
select public.zz_t('owner: reset AI usage', $q$update public.leads set ai_assessed_at=null where id='dddddddd-dddd-dddd-dddd-dddddddddddd'$q$, false);
select public.zz_t('owner: search leads', $q$do $x$ begin if (select count(*) from public.leads where search_text ilike '%civic%' and search_text ilike '%won%')<>1 then raise exception 'search'; end if; end $x$$q$, true);
select public.zz_t('owner: metrics correct', $q$do $x$ declare m record; begin select * into m from public.business_metrics where business_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; if m.leads_count<>1 or m.quotes_count<>1 or m.customers_count<>2 or m.won_leads_count<>1 then raise exception 'metrics %', row_to_json(m); end if; end $x$$q$, true);
select public.zz_t('owner: team members rpc', $q$do $x$ begin if (select count(*) from public.get_team_members('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'))<>2 then raise exception 'team'; end if; end $x$$q$, true);
select public.zz_t('owner: write subscription', $q$insert into public.subscriptions(business_id,plan,status) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','business','active')$q$, false);
select public.zz_t('owner: call rate limit rpc', $q$select * from public.consume_rate_limit('k',2,60)$q$, false);
select public.zz_t('owner: call cleanup rpc', $q$select * from public.cleanup_security_state()$q$, false);
select public.zz_t('owner: call ensure_business_metrics', $q$select public.ensure_business_metrics('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$q$, false);
select public.zz_t('owner: read trial claims', $q$select * from public.trial_claims$q$, false);
select public.zz_t('owner: read verification intents', $q$select * from public.auth_verification_intents$q$, false);

select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
select public.zz_t('staff: cannot edit business profile', $q$do $x$ declare n int; begin update public.businesses set name='Staff edit' where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; get diagnostics n=row_count; if n<>0 then raise exception 'updated'; end if; end $x$$q$, true);
select public.zz_t('staff: reads leads', $q$do $x$ begin if (select count(*) from public.leads)<>1 then raise exception 'l'; end if; end $x$$q$, true);

select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select public.zz_t('outsider: sees nothing', $q$do $x$ begin if (select count(*) from public.businesses)+(select count(*) from public.leads)+(select count(*) from public.business_metrics)+(select count(*) from public.get_team_members('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'))<>0 then raise exception 'leak'; end if; end $x$$q$, true);
select public.zz_t('outsider: update other business is no-op', $q$do $x$ declare n int; begin update public.businesses set name='Hacked' where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; get diagnostics n=row_count; if n<>0 then raise exception 'updated'; end if; end $x$$q$, true);
reset role;

set role anon;
select public.zz_t('anon: read businesses', $q$select * from public.businesses$q$, false);
reset role;

set role service_role;
delete from public.businesses where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
reset role;
delete from auth.users where id='11111111-1111-1111-1111-111111111111';
select public.zz_t('deletion keeps trial claim', $q$do $x$ begin if (select count(*) from public.trial_claims where email_hash='e')<>1 then raise exception 'gone'; end if; end $x$$q$, true);
select public.zz_t('storage bucket limits', $q$do $x$ begin if (select file_size_limit from storage.buckets where id='vehicle-photos')<>10485760 then raise exception 'limit'; end if; end $x$$q$, true);

