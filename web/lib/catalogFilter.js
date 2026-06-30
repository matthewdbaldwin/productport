// web/lib/catalogFilter.js — pure catalog filter / facet logic (Viewer surface).
//
// The whole (small) catalog loads once and all search/filter/detail happens in
// memory, so this is the only logic between a user's query and what they see.
// Kept framework-free + plain JS so it's unit-testable under the repo's node
// jest (tests/catalogFilter.test.js) and importable from the TS page via the
// companion catalogFilter.d.ts. The React page owns only the state + render.
'use strict';

// Therapeutic-area display order (mirrors the standalone catalog's AREAS list).
const AREA_ORDER = [
  'Coronary', 'Structural Heart', 'Electrophysiology', 'Cardiac Rhythm Management',
  'Neurovascular', 'Aortic & Peripheral', 'Extracorporeal Life Support',
  'Surgical Robotics', 'Orthopedics', 'Endoscopy & Urology', 'Tumor Ablation',
  'Endocrinology', 'Infusion & Vascular Access', 'Assisted Reproduction',
];

// "Present in a market" = a live clearance state, not absent/rejected.
const PRESENT_STATUSES = ['APPROVED', 'IN_PROGRESS', 'SUBMITTED'];

function statusOf(product, region) {
  const c = (product.clearances || []).find((x) => x.region === region);
  return c ? c.status : 'NONE';
}

// Curated areas first (in catalog order), then any remaining areas alphabetically.
function orderedAreas(products) {
  const present = new Set((products || []).map((p) => p.therapeuticArea));
  const ordered = AREA_ORDER.filter((a) => present.has(a));
  for (const a of [...present].sort()) if (!ordered.includes(a)) ordered.push(a);
  return ordered;
}

// AND across the active filters; search spans name/tagline/indication/category/
// type/subsidiary. A blank/whitespace query is a no-op.
function filterProducts(products, filters = {}) {
  const { area, subsidiary, category, market, query } = filters;
  const term = (query || '').trim().toLowerCase();
  return (products || []).filter((p) => {
    if (area && p.therapeuticArea !== area) return false;
    if (subsidiary && p.subsidiary !== subsidiary) return false;
    if (category && p.category !== category) return false;
    if (market && !PRESENT_STATUSES.includes(statusOf(p, market))) return false;
    if (term) {
      const hay = `${p.name} ${p.tagline} ${p.indication} ${p.category} ${p.type} ${p.subsidiary}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });
}

module.exports = { statusOf, orderedAreas, filterProducts, AREA_ORDER, PRESENT_STATUSES };
