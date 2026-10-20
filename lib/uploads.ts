export const MAX_LEAD_PHOTOS = 8;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_PHOTO_BYTES = 30 * 1024 * 1024;

export type ImageKind = 'jpeg' | 'png';

/** Identify JPEG/PNG by magic bytes. The browser-supplied MIME type is ignored. */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'png';
  return null;
}

/**
 * Storage paths for lead photos always live under `<businessId>/leads/<leadId>/`.
 * Anything else (another tenant, traversal, odd characters) is rejected before
 * it reaches the service-role Storage client.
 */
export function isLeadPhotoPath(path: unknown, businessId: string, leadId: string): path is string {
  if (typeof path !== 'string') return false;
  const prefix = `${businessId}/leads/${leadId}/`;
  if (!path.startsWith(prefix)) return false;
  const file = path.slice(prefix.length);
  return /^[A-Za-z0-9-]{1,64}\.(jpg|png)$/.test(file);
}
