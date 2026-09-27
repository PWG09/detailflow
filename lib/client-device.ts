const STORAGE_KEY = 'detailflow_device_id_v1';

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getDeviceFingerprint() {
  let stableId = '';
  try {
    stableId = localStorage.getItem(STORAGE_KEY) || '';
    if (!stableId) { stableId = crypto.randomUUID(); localStorage.setItem(STORAGE_KEY, stableId); }
  } catch { stableId = crypto.randomUUID(); }

  const screenInfo = [screen.width, screen.height, screen.colorDepth, window.devicePixelRatio].join('x');
  return sha256([
    stableId, navigator.userAgent, navigator.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.platform,
    navigator.hardwareConcurrency || '', (navigator as Navigator & { deviceMemory?: number }).deviceMemory || '',
    navigator.maxTouchPoints || '', screenInfo,
  ].join('|'));
}
