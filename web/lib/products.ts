// web/lib/products.ts — admin catalog mutations (product_admin / superuser).
// The read path stays in page.tsx; these are the editor's create/update/delete.
import { api } from './api';

export type ProductTier = 'TIER1' | 'TIER2' | 'TIER3';
export type ProductClassification = 'CORE' | 'HIPO' | 'FLAGSHIP';
export type ProductStatus = 'ACTIVE' | 'DISCONTINUED' | 'DRAFT';

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
