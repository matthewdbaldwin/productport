// web/app/page.help.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

// The catalog top bar's HelpLauncher sits at z-index 20 and DetailModal's
// overlay at z-index 50, so while a product is open the modal's own HelpButton
// is the only help affordance the user can reach. This pins that it renders
// inside the open detail modal and opens the product-detail article popover.

const { product } = vi.hoisted(() => ({
  product: {
    id: 'p1', name: 'Test Stent', subsidiary: 'MicroPort', therapeuticArea: 'Cardiovascular',
    category: '', type: '', tagline: 'A stent', overview: '', features: '', indication: '',
    patientPopulation: '', specs: '', regNotes: '', image: null, status: 'ACTIVE', disabledAt: null,
    tier: null, classification: null, businessSegment: null, applicableDepartments: null,
    modelNumbers: null, developmentStatus: null, clearances: [], trials: [], images: [],
  },
}));

// Same stub set the ProductEditModal tests use for the main microport-ui index
// (keeps the echarts/canvas ESM bundle out of jsdom). The `/help` subpath, where
// HelpButton comes from, is a separate light module and stays real.
vi.mock('@matthewdbaldwin/microport-ui', () => ({
  useModalEsc: () => {},
  useFocusTrap: () => ({ current: null }),
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'viewer', locale: 'en-US' }, loading: false, logout: async () => {} }),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  api: vi.fn(async () => ({ products: [product] })),
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
// Top-bar chrome and the sibling modals are out of scope here.
vi.mock('@/components/help/HelpLauncher', () => ({ HelpLauncher: () => null }));
vi.mock('@/components/layout/AppSwitcher', () => ({ AppSwitcher: () => null }));
vi.mock('@/components/layout/ProfileModal', () => ({ ProfileModal: () => null }));
vi.mock('./ImportCsvButton', () => ({ ImportCsvButton: () => null }));
vi.mock('./ProductEditModal', () => ({ ProductEditModal: () => null }));

import CatalogPage from './page';
import { getHelpContent } from '@/lib/help/content';
import { testId } from '@/lib/i18nIds';

describe('CatalogPage detail modal help', () => {
  it('renders a HelpButton in the open detail modal that opens the product-detail article popover', async () => {
    window.history.replaceState(null, '', '/?product=p1'); // canonical deep-link IN
    render(<CatalogPage />);

    // findBy* waits for the mocked product load to settle and the modal to mount.
    const dialog = await screen.findByRole('dialog', { name: 'Test Stent' });
    const help = within(dialog).getByTestId(testId('catalog', 'detailHelp')['data-testid']);
    const trigger = within(help).getByRole('button', { name: /page help/i });

    fireEvent.click(trigger);
    const article = getHelpContent('product-detail', 'en-US')!;
    expect(screen.getByText(article.title)).toBeTruthy();
    expect(screen.getByText(article.intro)).toBeTruthy();
    expect(screen.getByRole('link', { name: /help library/i }).getAttribute('href')).toBe('/help/product-detail');
  });
});
