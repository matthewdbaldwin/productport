// Types for the plain-JS catalogFilter module so the TS catalog page keeps
// full type-checking on the filter/facet helpers it imports.
export type ClearanceStatus = 'APPROVED' | 'IN_PROGRESS' | 'SUBMITTED' | 'NOT_APPROVED' | 'NONE';

export interface FilterableClearance {
  region: string;
  status: ClearanceStatus;
}

export interface FilterableProduct {
  therapeuticArea: string;
  subsidiary: string;
  category: string;
  type: string;
  name: string;
  tagline: string;
  indication: string;
  clearances: FilterableClearance[];
}

export interface CatalogFilters {
  area?: string | null;
  subsidiary?: string | null;
  category?: string | null;
  market?: string | null;
  query?: string | null;
}

export function statusOf(product: FilterableProduct, region: string): ClearanceStatus;
export function orderedAreas<T extends { therapeuticArea: string }>(products: T[]): string[];
export function filterProducts<T extends FilterableProduct>(products: T[], filters?: CatalogFilters): T[];
export const AREA_ORDER: string[];
export const PRESENT_STATUSES: ClearanceStatus[];
