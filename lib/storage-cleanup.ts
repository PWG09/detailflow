import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Recursively collect every object under a Storage prefix. Folders are returned
 * by Supabase with `id === null`. Paging is bounded to avoid unbounded loops.
 */
export async function listAllObjects(client: SupabaseClient, bucket: string, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 6) return [];
  const paths: string[] = [];
  const storage = client.storage.from(bucket);
  const pageSize = 1000;
  for (let offset = 0; offset < 100_000; offset += pageSize) {
    const { data, error } = await storage.list(prefix, { limit: pageSize, offset });
    if (error) throw new Error(`Storage list failed for ${prefix}: ${error.message}`);
    for (const item of data ?? []) {
      const full = `${prefix}/${item.name}`;
      if (item.id === null) paths.push(...await listAllObjects(client, bucket, full, depth + 1));
      else paths.push(full);
    }
    if (!data || data.length < pageSize) break;
  }
  return paths;
}

export async function removeAllObjects(client: SupabaseClient, bucket: string, prefix: string) {
  const paths = await listAllObjects(client, bucket, prefix);
  for (let index = 0; index < paths.length; index += 500) {
    const { error } = await client.storage.from(bucket).remove(paths.slice(index, index + 500));
    if (error) throw new Error(`Storage remove failed: ${error.message}`);
  }
  return paths.length;
}
