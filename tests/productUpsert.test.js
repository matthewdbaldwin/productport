// upsertProductRow — the DB-write step shared by the admin CSV import endpoint
// and the one-off bulk loaders. Behaviour over a mocked db (no real Prisma):
// create vs update on slug, clearance-matrix replacement, and the soft-delete
// guard (a slug matching a soft-deleted product must NOT be silently overwritten
// — feedback_import_revive_softdeleted_pattern).
'use strict';
const { upsertProductRow } = require('../src/lib/productUpsert');

function mockDb(existing) {
  return {
    product: {
      findFirst: jest.fn(async () => existing),
      upsert: jest.fn(async () => ({ id: existing?.id ?? 'new-id' })),
    },
    regulatoryClearance: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      createMany: jest.fn(async () => ({ count: 0 })),
    },
  };
}
const row = (o = {}) => ({ slug: 'firehawk', data: { name: 'Firehawk' }, clearances: [], ...o });

describe('upsertProductRow', () => {
  test('no existing row → creates', async () => {
    const db = mockDb(null);
    expect(await upsertProductRow(db, row())).toBe('created');
    expect(db.product.upsert).toHaveBeenCalledTimes(1);
  });

  test('live existing row → updates', async () => {
    const db = mockDb({ id: 'p1', deletedAt: null });
    expect(await upsertProductRow(db, row())).toBe('updated');
    expect(db.product.upsert).toHaveBeenCalledTimes(1);
  });

  test('slug matches a SOFT-DELETED product → throws, does not write', async () => {
    const db = mockDb({ id: 'p1', deletedAt: new Date('2026-01-01') });
    await expect(upsertProductRow(db, row())).rejects.toThrow(/deleted product/i);
    expect(db.product.upsert).not.toHaveBeenCalled();
    expect(db.regulatoryClearance.deleteMany).not.toHaveBeenCalled();
  });

  test('replaces the clearance matrix for the upserted product', async () => {
    const db = mockDb({ id: 'p1', deletedAt: null });
    await upsertProductRow(db, row({ clearances: [{ region: 'FDA', status: 'APPROVED' }] }));
    expect(db.regulatoryClearance.deleteMany).toHaveBeenCalledWith({ where: { productId: 'p1' } });
    expect(db.regulatoryClearance.createMany).toHaveBeenCalledWith({
      data: [{ region: 'FDA', status: 'APPROVED', productId: 'p1' }],
    });
  });
});
