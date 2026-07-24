import { describe, it, expect, beforeEach, vi } from 'vitest';

// The disable/enable admin kill-switch API calls. They POST to the dedicated
// endpoints and return the updated product so the caller can patch state in place.
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('./api', () => ({ api: apiMock, ApiError: class {} }));

import { disableProduct, enableProduct } from './products';

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockResolvedValue({ product: { id: 'latent-perit', disabledAt: '2026-07-24T12:00:00.000Z' } });
});

describe('disableProduct / enableProduct', () => {
  it('disableProduct POSTs to products/:slug/disable and returns the product', async () => {
    const out = await disableProduct('latent-perit');
    expect(apiMock).toHaveBeenCalledWith('products/latent-perit/disable', { method: 'POST' });
    expect(out).toEqual({ product: { id: 'latent-perit', disabledAt: '2026-07-24T12:00:00.000Z' } });
  });

  it('enableProduct POSTs to products/:slug/enable', async () => {
    await enableProduct('latent-perit');
    expect(apiMock).toHaveBeenCalledWith('products/latent-perit/enable', { method: 'POST' });
  });

  it('URL-encodes the slug', async () => {
    await disableProduct('a/b');
    expect(apiMock).toHaveBeenCalledWith('products/a%2Fb/disable', { method: 'POST' });
  });
});
