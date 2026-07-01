// src/lib/shapeProduct.js — Prisma product row → client catalog contract.
//
// The catalog read API (src/routes/products.js) returns exactly this shape, and
// the web `Product` interface is pinned to it. Keeping the transform in one
// tested module means a contract drift (a dropped field, an unsorted relation,
// a null leaking through to the UI) becomes a RED test instead of silent data
// loss. Pure; tested in tests/shapeProduct.test.js.
'use strict';

// Camel-case + flatten a Prisma product (with `clearances` + `trials`
// relations included) into the catalog contract: clearances sorted by region,
// trials by displayOrder, null text coerced to '' (the UI reads them as
// strings), image left null when absent.
function shapeProduct(p) {
  return {
    id: p.slug, // stable, human-readable key the UI routes on
    name: p.name,
    subsidiary: p.subsidiary,
    therapeuticArea: p.therapeuticArea,
    category: p.category || '',
    type: p.type || '',
    tagline: p.tagline || '',
    overview: p.overview || '',
    features: p.features || '',
    indication: p.indication || '',
    patientPopulation: p.patientPopulation || '',
    specs: p.specs || '',
    regNotes: p.regNotes || '',
    image: p.image || null,
    status: p.status,
    tier: p.tier || null, // strategic tier enum; null = untiered
    classification: p.classification || null, // Core/Hi-po/Flagship; manual, separate from tier
    businessSegment: p.businessSegment || null,
    applicableDepartments: p.applicableDepartments || null, // pipe-delimited
    modelNumbers: p.modelNumbers || null,                   // pipe-delimited
    developmentStatus: p.developmentStatus || null,
    clearances: (p.clearances || [])
      .slice()
      .sort((a, b) => a.region.localeCompare(b.region))
      .map((c) => ({ region: c.region, status: c.status, notes: c.notes || null })),
    trials: (p.trials || [])
      .slice()
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((t) => ({
        trial: t.trial,
        identifier: t.identifier || '',
        n: t.n || '',
        design: t.design || '',
        result: t.result || '',
      })),
  };
}

module.exports = { shapeProduct };
