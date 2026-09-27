import { createClient } from '@supabase/supabase-js';

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secretKey) throw new Error('Missing Supabase server environment variables.');
  if (!process.env.SUPABASE_SECRET_KEY) {
    try {
      const payload = JSON.parse(Buffer.from(secretKey.split('.')[1], 'base64url').toString('utf8')) as { role?: string };
      if (payload.role !== 'service_role') throw new Error('SUPABASE_SERVICE_ROLE_KEY is not a service_role key');
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Invalid SUPABASE_SERVICE_ROLE_KEY');
    }
  }
  return createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
