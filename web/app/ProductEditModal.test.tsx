import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api';

// A large edit modal that scrolls: any save-failure feedback rendered at the top
// is off-screen from the Save button at the bottom, so failures read as "nothing
// happened". These tests pin that the modal ALWAYS surfaces the outcome via a
// viewport-fixed toast — on both failure (with the real error) and success.

const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));

// Mock microport-ui so the test doesn't pull the full ESM bundle (echarts/canvas)
// into jsdom. useToast returns a spy so we can assert the modal fires a toast.
vi.mock('@matthewdbaldwin/microport-ui', () => ({
  useModalEsc: () => {},
  useFocusTrap: () => ({ current: null }),
  optimizeImageForUpload: async (f: File) => f,
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({ toast: toastSpy }),
}));

// Keep the real vocab constants (rendered by the form) but stub the network calls.
vi.mock('@/lib/products', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/products')>()),
  updateProduct: vi.fn(),
  createProduct: vi.fn(),
  deleteProduct: vi.fn(),
  updateClearances: vi.fn(),
}));

import { ProductEditModal } from './ProductEditModal';
import { updateProduct, deleteProduct, updateClearances } from '@/lib/products';

const initial = {
  slug: 'dnfinity115',
  name: 'Dnfinity115',
  subsidiary: 'MicroPort',
  therapeuticArea: 'Emergency and Critical Care',
};

const renderModal = (onSaved = vi.fn()) =>
  render(<ProductEditModal mode="edit" initial={initial} onClose={vi.fn()} onSaved={onSaved} />);

beforeEach(() => {
  toastSpy.mockClear();
  vi.mocked(updateProduct).mockReset();
  vi.mocked(deleteProduct).mockReset();
  vi.mocked(updateClearances).mockReset();
});

describe('ProductEditModal save feedback', () => {
  it('fires an error toast with the server message when the save fails', async () => {
    vi.mocked(updateProduct).mockRejectedValue(new ApiError(400, 'missing therapeuticArea'));

    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith('missing therapeuticArea', 'error'));
  });

  it('fires a success toast when the save succeeds', async () => {
    vi.mocked(updateProduct).mockResolvedValue({ product: {} });

    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith('Changes saved.', 'ok'));
  });
});

describe('ProductEditModal delete feedback', () => {
  // Delete lives in the same bottom footer as Save, so its failure feedback has
  // the identical off-screen problem — it must toast too.
  const confirmDelete = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
  };

  it('fires an error toast when the delete fails', async () => {
    vi.mocked(deleteProduct).mockRejectedValue(new ApiError(409, 'Product is referenced elsewhere'));

    renderModal();
    confirmDelete();

    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith('Product is referenced elsewhere', 'error'));
  });

  it('fires a success toast when the delete succeeds', async () => {
    vi.mocked(deleteProduct).mockResolvedValue({ ok: true });

    renderModal();
    confirmDelete();

    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith('Product deleted.', 'ok'));
  });
});

describe('ProductEditModal unified clearance save', () => {
  // Bug #6 ("CE Approved change cannot be saved"): the clearance matrix used to
  // have its OWN low-emphasis "Save clearances" button, so editing a region and
  // clicking the prominent "Save changes" button persisted the product fields but
  // silently DROPPED the clearance edit. The primary Save must persist both.

  it('persists a clearance edit through the primary "Save changes" button', async () => {
    vi.mocked(updateProduct).mockResolvedValue({ product: {} });
    vi.mocked(updateClearances).mockResolvedValue({ product: {} });

    renderModal();
    fireEvent.change(screen.getByLabelText('CE clearance status'), { target: { value: 'APPROVED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(updateClearances).toHaveBeenCalledWith(
        'dnfinity115',
        expect.arrayContaining([expect.objectContaining({ region: 'CE', status: 'APPROVED' })]),
      ),
    );
    expect(updateClearances).toHaveBeenCalledTimes(1);
  });

  it('does NOT write clearances when the matrix was not touched', async () => {
    vi.mocked(updateProduct).mockResolvedValue({ product: {} });
    vi.mocked(updateClearances).mockResolvedValue({ product: {} });

    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith('Changes saved.', 'ok'));
    expect(updateClearances).not.toHaveBeenCalled();
  });

  it('surfaces an error toast (not "Changes saved.") when the clearance write fails', async () => {
    vi.mocked(updateProduct).mockResolvedValue({ product: {} });
    vi.mocked(updateClearances).mockRejectedValue(new ApiError(400, 'invalid qualifier "x"'));

    renderModal();
    fireEvent.change(screen.getByLabelText('CE clearance status'), { target: { value: 'APPROVED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith('invalid qualifier "x"', 'error'));
    expect(toastSpy).not.toHaveBeenCalledWith('Changes saved.', 'ok');
  });

  it('no longer renders a standalone "Save clearances" button', () => {
    renderModal();
    expect(screen.queryByRole('button', { name: 'Save clearances' })).toBeNull();
  });
});
