import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';

const catalogBrowse: HelpArticleContent = {
  slug:  'catalog-browse',
  title: 'Browsing and filtering the catalog',
  intro: 'The catalog page loads the whole product catalog once; searching and filtering then happen instantly in your browser. Every signed-in employee can browse it, and product administrators also get the catalog-management buttons in the top bar.',
  lastUpdated: '2026-09-04',
  sections: [
    {
      id: 'page-layout', heading: 'The catalog page at a glance',
      blocks: [
        { kind: 'list', items: [
          'Top bar: the search box, a green pill showing how many products loaded (it reads Loading… until then), the app switcher and the Profile button.',
          'Filter rail: Therapeutic area, Subsidiary, Regulatory and Category, in that order.',
          'Count line under the rail: N shown · M in catalog. M is the whole catalog; N is what your search and filters currently match.',
          'Product grid: one card per product, sorted by name. There is no paging and no sort control; the whole catalog sits on one page.',
        ], labels: ['Loading…', 'in catalog'] },
        { kind: 'paragraph', text: 'The page reads Loading catalog… while the list is fetched. If it shows Could not load the catalog. Please refresh., the product list did not arrive; reload the page. If you are not signed in, the page sends you to the sign-in flow instead.', labels: ['Loading catalog…', 'Could not load the catalog'] },
      ],
    },
    {
      id: 'search', heading: 'Search',
      blocks: [
        { kind: 'paragraph', text: 'Type in the search box to filter as you go; there is no search button and no need to press Enter. Matching is case-insensitive and looks for your text anywhere in a product’s name, tagline, indication, category, type or subsidiary. Clear filters empties the box along with any active filters.', labels: ['Search products, indications, types…', 'Clear filters'] },
        { kind: 'list', items: [
          'Search does not look inside the overview or feature list.',
          'It does not look inside specifications or the patient population.',
          'It does not match model numbers, certificate numbers or regulatory notes.',
        ] },
      ],
    },
    {
      id: 'filters', heading: 'Filters',
      blocks: [
        { kind: 'list', items: [
          'Therapeutic area: one pill per area present in the catalog, each with a count. Click a pill to select it; click the active pill again to clear it.',
          'Subsidiary: a collapsed panel whose header reads All subsidiaries until you choose one. Open it to pick a single subsidiary from the pills inside; click the active pill again to clear it.',
          'Regulatory: five pills, CE, FDA, NMPA, PMDA and TGA. One can be active at a time.',
          'Category: a dropdown that starts at All categories and lists every category with its product count.',
        ], labels: ['Therapeutic area', 'Subsidiary', 'Regulatory', 'Category', 'All subsidiaries'] },
        { kind: 'paragraph', text: 'Selecting a market under Regulatory keeps the products that are cleared, in progress or submitted in that market; it is a “present in this market” filter, not a “cleared only” filter. The legend beside the pills shows the three chip colours: Cleared, In progress and Submitted.', labels: ['Cleared', 'In progress', 'Submitted'] },
        { kind: 'paragraph', text: 'Filters and the search box all apply together: a product must match every active one. The counts on the pills and dropdown options are whole-catalog counts and do not shrink as you add other filters; the line under the rail is the one that reflects your current combination. Clear filters appears only once something is active and resets everything, including the search box. Filters are not stored in the address bar, so a refresh or a shared link starts from the full catalog. When nothing matches, the grid is simply empty and the count line reads 0 shown · M in catalog; there is no separate “no results” message.', labels: ['Clear filters', 'All categories', 'in catalog'] },
      ],
    },
    {
      id: 'cards', heading: 'Reading a product card',
      blocks: [
        { kind: 'list', items: [
          'Thumbnail: the product’s primary image, or a MicroPort placeholder carrying the product name when it has none.',
          'Therapeutic area, plus a Tier 1, Tier 2 or Tier 3 badge when the product has a tier.',
          'Product name and tagline.',
          'Subsidiary · category.',
          'Market chips, one per market with a live status. A bare code such as FDA means the product is cleared there; a code followed by a dot means the clearance is in progress or submitted. Status: see detail appears instead when no market is cleared, in progress or submitted.',
        ], labels: ['Tier 1', 'Tier 2', 'Tier 3', 'Status: see detail'] },
        { kind: 'paragraph', text: 'Click a card to open the product’s detail view. The address bar gains ?product=<slug> while it is open, so the page can be bookmarked or shared; see Product detail for what the view contains and how to copy a link.' },
      ],
    },
    {
      id: 'admin-actions', heading: 'For product administrators',
      blocks: [
        { kind: 'roleBlock', roles: ['product_admin', 'superuser'], blocks: [
          { kind: 'list', items: [
            'Add product opens a blank product form (see Add a product).',
            'Verify (dry run) checks a CSV file against the catalog and reports what an import would create, update or reject, without writing anything.',
            'Import CSV runs the import for real and reloads the catalog afterwards.',
            'Export CSV downloads the whole catalog as a CSV file, including disabled and DRAFT products (see CSV import & export).',
          ], labels: ['Add product', 'Verify (dry run)', 'Import CSV', 'Export CSV'] },
          { kind: 'paragraph', text: 'Administrators also see disabled products in the grid, drawn faded with a red DISABLED tag; viewers never see them, and the product count in the top bar therefore differs between the two. Products whose status is DRAFT are hidden from everyone, administrators included, and cannot be opened from the catalog; Export CSV is the only place in ProductPort where they still appear.', labels: ['DISABLED', 'Export CSV'] },
        ] },
      ],
    },
    {
      id: 'faq', heading: 'Common questions',
      blocks: [
        { kind: 'faq', items: [
          { q: 'Search isn’t finding a product I know exists. Why?', a: 'Search only matches the product’s name, tagline, indication, category, type and subsidiary, not its overview, specifications, model numbers or certificate numbers. An active Therapeutic area, Subsidiary, Regulatory or Category filter can also hide a product even when its name matches; press Clear filters and search again.' },
          { q: 'Why don’t the counts on the filter pills change when I add another filter?', a: 'Those counts always describe the whole catalog, so you can see how large each group is. The line under the rail (N shown · M in catalog) is the count for your current combination of search and filters.' },
          { q: 'I refreshed the page and my filters disappeared.', a: 'Filters and search are not saved in the address bar or in your browser, so a refresh starts from the full catalog. Only a product link (?product=…) survives a refresh.' },
          { q: 'A colleague sent me a link and the catalog opens with nothing selected.', a: 'The product may be disabled (only product administrators can see disabled products) or in DRAFT status (nobody can open it). If you were sent to the sign-in page first, sign in and then open the link again.' },
          { q: 'How do I share a product with someone?', a: 'Open it and click Copy link in the detail view, or copy the address bar while the product is open; both give the same ?product= link. The recipient must be signed in to ProductPort to see it.' },
          { q: 'What does Status: see detail on a card mean?', a: 'None of the five markets is currently cleared, in progress or submitted for that product. Open the product for the full Regulatory status by market table, which also shows Not cleared and unrecorded markets.' },
        ], labels: ['Clear filters', 'Copy link', 'Status: see detail', 'Regulatory status by market'] },
      ],
    },
  ],
  related: ['product-detail', 'login', 'csv-import'],
};

export default catalogBrowse;
