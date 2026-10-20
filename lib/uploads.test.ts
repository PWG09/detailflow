import { describe, expect, it } from 'vitest';
import { isLeadPhotoPath, sniffImage } from './uploads';

const biz = '11111111-1111-4111-8111-111111111111';
const lead = '22222222-2222-4222-8222-222222222222';

describe('sniffImage', () => {
  it('identifies JPEG and PNG by magic bytes', () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
  });
  it('rejects other content even if named like an image', () => {
    expect(sniffImage(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(sniffImage(new Uint8Array([]))).toBeNull();
  });
});

describe('isLeadPhotoPath', () => {
  it('accepts paths inside the lead folder of the same business', () => {
    expect(isLeadPhotoPath(`${biz}/leads/${lead}/3f8b0c3e-1d2a-4b5c-9e7f-0a1b2c3d4e5f.jpg`, biz, lead)).toBe(true);
  });
  it('rejects other tenants, other leads and traversal', () => {
    const other = '33333333-3333-4333-8333-333333333333';
    expect(isLeadPhotoPath(`${other}/leads/${lead}/a.jpg`, biz, lead)).toBe(false);
    expect(isLeadPhotoPath(`${biz}/leads/${other}/a.jpg`, biz, lead)).toBe(false);
    expect(isLeadPhotoPath(`${biz}/leads/${lead}/../../${other}/x.jpg`, biz, lead)).toBe(false);
    expect(isLeadPhotoPath(`${biz}/leads/${lead}/a.svg`, biz, lead)).toBe(false);
    expect(isLeadPhotoPath(42, biz, lead)).toBe(false);
  });
});
