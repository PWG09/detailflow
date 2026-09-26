import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'DetailFlow — turn detailing inquiries into booked work';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 72, background: '#f4f0e8', color: '#15231e', fontFamily: 'Arial' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 34, fontWeight: 700 }}><div style={{ width: 64, height: 64, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#15231e', color: '#f4f0e8' }}>DF</div> detailflow</div>
      <div style={{ display: 'flex', marginTop: 55, fontSize: 68, lineHeight: 1.04, fontWeight: 800, maxWidth: 900 }}>Turn every inquiry into a clear next step.</div>
      <div style={{ display: 'flex', marginTop: 28, fontSize: 28, color: '#5e665f' }}>Quotes, leads, AI-assisted vehicle assessment, and payments for detailing businesses.</div>
    </div>,
    size,
  );
}
