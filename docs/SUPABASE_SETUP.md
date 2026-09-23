# Supabase foundation setup

This document covers the external steps required to close the Foundation section of DetailFlow.

## 1. Apply the database migration

1. Open the Supabase project dashboard.
2. Open **SQL Editor** and create a new query.
3. Copy the complete contents of `supabase/migrations/20260922000000_initial_detailflow.sql`.
4. Run the query once.
5. In **Table Editor**, confirm these tables exist: `businesses`, `business_members`, `services`, `customers`, `leads`, and `quotes`.
6. In **Authentication > Users**, create a test user or register at `/login`.
7. Create a business through `/onboarding`. Confirm that the user appears in `business_members` with role `owner`.

The migration also creates the private `vehicle-photos` bucket and Storage policies. If the SQL editor reports that the bucket or a policy already exists, keep the existing bucket private and remove only the duplicate statement before rerunning the migration.

## 2. Verify RLS

Use two test users and two businesses. A member of Business A must be able to read Business A but must receive no rows for Business B. A staff member must not be able to change owner-only membership records. Never disable RLS to make a query work.

## 3. Configure Auth URLs

In **Authentication > URL Configuration**:

- Site URL: `https://detailflow-two.vercel.app`
- Redirect URLs: `https://detailflow-two.vercel.app/**`
- Local redirect URL: `http://localhost:3000/**`

Enable the Email provider. Decide whether email confirmation is required. If it is enabled, configure the SMTP provider before testing registration in production.

## 4. Configure Vercel variables

In Vercel **Project Settings > Environment Variables**, add these variables for Preview and Production:

```text
NEXT_PUBLIC_APP_URL=https://detailflow-two.vercel.app
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` must be server-only. Never add it to a `NEXT_PUBLIC_*` variable, client component, browser bundle, Git commit, screenshot, or support message.

After saving variables, redeploy the project. Vercel does not apply changed environment variables to an already-built deployment.

## 5. Foundation smoke test

1. Open `/login` and register a test account.
2. Confirm the email if Supabase requires confirmation.
3. Open `/onboarding` and create a business with a valid slug.
4. Confirm the dashboard opens.
5. Open `/quote/<slug>` and confirm the public URL loads.
6. Submit a quote only after a matching active service exists.
7. Confirm a customer and lead row appear in Supabase.
8. Open Storage and confirm `vehicle-photos` is private.
9. Test the second account cannot read the first business.

If login shows a permissions error, run `supabase/migrations/20260922000001_fix_rls_membership_lookup.sql` in SQL Editor after the initial migration. This repairs owner memberships created before the trigger and replaces the recursive membership lookup policies.
