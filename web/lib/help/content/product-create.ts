// web/lib/help/content/product-create.ts
// Facts verified 2026-09-04 against web/app/ProductEditModal.tsx,
// web/app/ImportCsvButton.tsx, web/app/page.tsx and src/lib/* (see the
// wave-1 UI facts sheet). UI labels are quoted verbatim from the components,
// which are hardcoded English in every locale.
import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';

const productCreate: HelpArticleContent = {
  slug: 'product-create',
  title: 'Adding a product',
  intro: 'Add product in the top bar opens a blank product form. Nothing is checked in the browser: the server validates the save and points at any field it rejects. Images and regulatory clearances are added afterwards, from edit mode.',
  lastUpdated: '2026-09-04',
  sections: [
    {
      id: 'open-the-form', heading: 'Opening the form',
      blocks: [
        { kind: 'paragraph', text: 'Click Add product in the top bar (administrators only). The form is titled Add product and focus lands on Name. Closing it with Cancel, the × button, Esc or a click on the backdrop after you have typed anything first asks Discard your unsaved changes?', labels: ['Add product', 'Name', 'Cancel'] },
      ],
    },
    {
      id: 'fields', heading: 'The fields, in order',
      blocks: [
        { kind: 'paragraph', text: 'The grid at the top holds the short fields; the full-width fields under it hold the longer text. Required fields carry a red asterisk. Blank optional fields are stored empty.' },
        { kind: 'list', items: [
          'Name, Slug (url key), Subsidiary and Therapeutic area are required. Subsidiary is free text; Therapeutic area is a dropdown of the ten canonical areas.',
          'Slug (url key) must be lowercase letters, digits and hyphens. It becomes the product’s link (/?product=<slug>) and its id column in CSV, and a slug that is already in use is refused, so choose something short and stable.',
        ], labels: ['Name', 'Slug (url key)', 'Subsidiary', 'Therapeutic area'] },
        { kind: 'list', items: [
          'Business segment, Category and Type are free text. Image filename is a legacy field for image files shipped with the app; uploading images is only possible in edit mode.',
          'Tier, Classification and Status are fixed lists (see the next section). Development status is free text.',
          'Tagline, Overview, Indication, Patient population and Regulatory notes are plain text.',
          'Features, Specifications, Model numbers and Applicable departments are pipe-separated lists: a|b|c for Features, key: value pairs for Specifications. Model numbers typed one per line are accepted and stored pipe-separated.',
        ], labels: ['Business segment', 'Category', 'Image filename', 'Features', 'Specifications'] },
      ],
    },
    {
      id: 'tier-classification-status', heading: 'Tier, Classification and Status',
      blocks: [
        { kind: 'list', items: [
          'Tier (Tier 1, Tier 2, Tier 3 or none) shows as a badge on the catalog card and in the detail view. It does not filter or hide anything.',
          'Classification (CORE, HIPO or FLAGSHIP) is not displayed anywhere in the app. It is stored and only round-trips through CSV export and import.',
          'Status defaults to ACTIVE. DISCONTINUED is not shown to viewers anywhere and does not hide the product.',
        ], labels: ['Tier', 'Classification', 'Status'] },
        { kind: 'paragraph', text: 'Do not choose DRAFT unless you mean to hide the product from everyone, including administrators. A DRAFT product vanishes from the grid, cannot be opened or edited in the app, and the only way back is Export CSV, change that row’s status cell, then Import CSV.', labels: ['Status', 'Export CSV', 'Import CSV'] },
      ],
    },
    {
      id: 'saving', heading: 'Saving and what the server checks',
      blocks: [
        { kind: 'paragraph', text: 'The form submits whatever you typed; there is no check in the browser. Click Create (it reads Saving… while the request is in flight). If the server rejects the save, the offending field gets a red outline and a message under it, and the same message appears in a banner at the top of the form and in a toast. Fix the field and click Create again.', labels: ['Create', 'Cancel'] },
        { kind: 'list', items: [
          'A missing Name, Slug (url key), Subsidiary or Therapeutic area.',
          'A slug containing uppercase letters, spaces or other characters, or a slug that already exists (the message says already exists).',
          'Text longer than the field’s limit, for example 255 characters for Name or 500 for Tagline.',
        ], labels: ['Name', 'Slug (url key)', 'Tagline'] },
      ],
    },
    {
      id: 'after-create', heading: 'After you create',
      blocks: [
        { kind: 'paragraph', text: 'On success the form closes, a Product created. toast appears, and the catalog reloads with the new card in name order. The new product does not open automatically.', labels: ['Create', 'Product created.'] },
        { kind: 'steps', steps: [
          'Find the new card in the grid (use the search box if the catalog is long) and click it.',
          'Click Edit in the detail view.',
          'Use Product images and Regulatory clearances. Both sections exist only in edit mode.',
        ], labels: ['Edit', 'Product images', 'Regulatory clearances'] },
        { kind: 'paragraph', text: 'A new product has no clearance rows yet: its card reads Status: see detail and the detail view shows a dash for all five regions until you fill in Regulatory clearances.', labels: ['Status: see detail', 'Regulatory clearances'] },
      ],
    },
    {
      id: 'faq', heading: 'Common questions',
      blocks: [
        { kind: 'faq', items: [
          { q: 'Can I add images or clearances while creating a product?', a: 'No. Create the product first, then open its card and click Edit. Both sections appear only in edit mode.' },
          { q: 'Why did nothing stop me before I clicked Create?', a: 'The form has no browser-side validation. The server checks the save and highlights any field it rejects; fix it and click Create again.' },
          { q: 'I chose DRAFT and now I can’t find the product.', a: 'DRAFT hides the product from everyone, including you. Export CSV, change that row’s status cell to ACTIVE, then Import CSV to bring it back.' },
          { q: 'Does Tier or Classification change who can see the product?', a: 'No. Tier is a badge on the card and in the detail view; Classification is never displayed. Neither one filters the catalog.' },
        ] },
      ],
    },
  ],
  related: ['product-edit', 'csv-import', 'catalog-browse'],
};

export default productCreate;
