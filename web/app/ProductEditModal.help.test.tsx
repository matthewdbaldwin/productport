// web/app/ProductEditModal.help.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Same stub set ProductEditModal.test.tsx uses for the main microport-ui
// index: keep the echarts/canvas ESM bundle out of jsdom. The `/help` subpath
// (where HelpButton comes from) is a separate, light module and stays real —
// this test is about the real button rendering.
vi.mock('@matthewdbaldwin/microport-ui', () => ({
  useModalEsc: () => {},
  useFocusTrap: () => ({ current: null }),
  optimizeImageForUpload: async (f: File) => f,
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({ toast: vi.fn() }),
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/lib/products', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/products')>();
  return { ...actual, galleryImageSrc: () => '/x.jpg' };
});

import { ProductEditModal } from './ProductEditModal';
import { GALLERY_POPOVER, CLEARANCE_POPOVER, POPOVER_TITLES } from '@/lib/help/popovers';

const initial = { slug: 'p1', name: 'P1', subsidiary: 'S', therapeuticArea: 'A', images: [], clearances: [] };

describe('ProductEditModal help popovers (edit mode only)', () => {
  it('shows a HelpButton next to Product images and Regulatory clearances in edit mode', () => {
    render(
      <ProductEditModal mode="edit" initial={initial} onClose={() => {}} onSaved={() => {}} onGalleryChanged={() => {}} />,
    );
    expect(screen.getByText('Product images')).toBeTruthy();
    expect(screen.getByText('Regulatory clearances')).toBeTruthy();
    // Two HelpButton triggers render as icon buttons with the lib's accessible name.
    expect(screen.getAllByRole('button', { name: /page help/i }).length).toBeGreaterThanOrEqual(2);
  });

  it('opens the localized popover content for each section (English without a signed-in user)', () => {
    render(
      <ProductEditModal mode="edit" initial={initial} onClose={() => {}} onSaved={() => {}} onGalleryChanged={() => {}} />,
    );
    const [galleryTrigger, clearanceTrigger] = screen.getAllByRole('button', { name: /page help/i });

    fireEvent.click(galleryTrigger);
    expect(screen.getByText(POPOVER_TITLES.gallery)).toBeTruthy();
    expect(screen.getByText(GALLERY_POPOVER.summary)).toBeTruthy();

    fireEvent.click(clearanceTrigger);
    expect(screen.getByText(POPOVER_TITLES.clearance)).toBeTruthy();
    expect(screen.getByText(CLEARANCE_POPOVER.summary)).toBeTruthy();
  });

  it('does not render either popover trigger in create mode (the sections themselves are edit-only)', () => {
    render(
      <ProductEditModal mode="create" onClose={() => {}} onSaved={() => {}} onGalleryChanged={() => {}} />,
    );
    expect(screen.queryByText('Product images')).toBeNull();
    expect(screen.queryByText('Regulatory clearances')).toBeNull();
    expect(screen.queryAllByRole('button', { name: /page help/i })).toHaveLength(0);
  });
});
