import { permanentRedirect } from 'next/navigation';
import { normalizeBusinessSlug } from '@/lib/slug';

// Legacy intake URL. The canonical public lead link is /{businessSlug}/lead;
// redirect so previously shared links keep working without a second form.
export default async function LegacyQuotePage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const slug = normalizeBusinessSlug(businessSlug);
  permanentRedirect(slug ? `/${slug}/lead` : '/');
}
