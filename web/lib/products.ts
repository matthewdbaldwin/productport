// web/lib/products.ts — admin catalog mutations (product_admin / superuser).
// The read path stays in page.tsx; these are the editor's create/update/delete.
import { api } from './api';

export type ProductTier = 'TIER1' | 'TIER2' | 'TIER3';
export type ProductClassification = 'CORE' | 'HIPO' | 'FLAGSHIP';
export type ProductStatus = 'ACTIVE' | 'DISCONTINUED' | 'DRAFT';

// The catalog's canonical 10 therapeutic areas. MIRROR of
// src/lib/therapeuticAreas.js (server source of truth) — keep the two in sync.
// The edit form renders this as a dropdown; the catalog filter orders by it.
export const THERAPEUTIC_AREAS = [
  'Coronary and Structural Heart',
  'Heart Failure and Electrophysiology',
  'Aortic and Peripheral Vasculature',
  'Robotic Surgery, AI, and Telesurgery',
  'Neurovascular and Brain-Computer Interfaces',
  'Orthopedic Joint, Spine, and Trauma',
  'Urology, Oncology, and Gastroenterology',
  'Emergency and Critical Care',
  'Endocrinology and Reproductive Health',
  'Regenerative Medicine and Medical Aesthetics',
] as const;

// The editable field set — mirrors src/lib/productWrite.js. All optional except
// on create, where slug/name/subsidiary/therapeuticArea are required (server-enforced).
export interface ProductInput {
  slug?: string;
  name?: string;
  subsidiary?: string;
  therapeuticArea?: string;
  category?: string | null;
  type?: string | null;
  tagline?: string | null;
  overview?: string | null;
  features?: string | null;
  indication?: string | null;
  patientPopulation?: string | null;
  specs?: string | null;
  regNotes?: string | null;
  image?: string | null;
  businessSegment?: string | null;
  applicableDepartments?: string | null;
  modelNumbers?: string | null;
  developmentStatus?: string | null;
  tier?: ProductTier | null;
  classification?: ProductClassification | null;
  status?: ProductStatus;
}

export const createProduct = (input: ProductInput) =>
  api<{ product: unknown }>('products', { method: 'POST', body: JSON.stringify(input) });

export const updateProduct = (slug: string, input: ProductInput) =>
  api<{ product: unknown }>(`products/${encodeURIComponent(slug)}`, { method: 'PATCH', body: JSON.stringify(input) });

export const deleteProduct = (slug: string) =>
  api<{ ok: true }>(`products/${encodeURIComponent(slug)}`, { method: 'DELETE' });

// Upload a product image (multipart). Uses raw fetch, not the api() wrapper,
// because the wrapper forces Content-Type: application/json — for FormData the
// browser must set the multipart boundary itself. Keeps the CSRF header + cookie.
export async function uploadProductImage(slug: string, file: File): Promise<{ product: unknown }> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`/api/products/${encodeURIComponent(slug)}/image`, {
    method: 'POST',
    headers: { 'X-Requested-With': 'productport-web' },
    body: fd,
    credentials: 'include',
  });
  const text = await res.text();
  const body = text ? (() => { try { return JSON.parse(text); } catch { return { error: text }; } })() : null;
  if (!res.ok) throw new Error((body && (body.error || body.message)) || `Upload failed (${res.status})`);
  return body as { product: unknown };
}

// The <img src> for a product image: uploaded (s3:) images resolve through the
// API's presigned-redirect endpoint; legacy filenames stay on the static path.
export const productImageSrc = (slug: string, image?: string | null): string | null => {
  if (!image) return null;
  return image.startsWith('s3:') ? `/api/products/${encodeURIComponent(slug)}/image` : `/products/${image}`;
};

export interface ImportResult {
  total: number;
  created: number;
  updated: number;
  errors: { row: number; slug: string; error: string }[];
}

// Bulk upsert-on-slug from a CSV. POSTs the raw file text (no multipart); the
// server parses + reconciles. 2xx even with per-row errors (in `errors`).
export const importProductsCsv = (csvText: string) =>
  api<ImportResult>('products/import', {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: csvText,
  });
