import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';

const productDetail: HelpArticleContent = {
  slug:  'product-detail',
  title: 'The product detail view',
  intro: 'Clicking a catalog card opens a product’s detail view: its images, description, indication and specifications, and its regulatory status in each of the five markets. Every signed-in employee can open it; product administrators also get Edit and Disable here.',
  lastUpdated: '2026-09-04',
  sections: [
    {
      id: 'opening', heading: 'Opening and closing a product',
      blocks: [
        { kind: 'list', items: [
          'Click any card in the catalog grid.',
          'Or open a direct link of the form /?product=<slug>; the catalog loads with that product already open.',
          'While a product is open the address bar shows ?product=<slug>; closing it removes that again. The Copy link button gives you the same address without touching the address bar.',
          'Close with the × button in the top corner (Close), the Esc key, or by clicking outside the panel.',
        ], labels: ['Close', 'Copy link'] },
        { kind: 'paragraph', text: 'Copy link copies the product’s shareable address to your clipboard and the button briefly reads ✓ Link copied. If your browser blocks clipboard access, a small Copy this product link prompt shows the address so you can copy it by hand. Anyone with the link must be signed in to ProductPort to open it.', labels: ['Copy link', '✓ Link copied', 'Copy this product link'] },
        { kind: 'paragraph', text: 'A link only opens products you are allowed to see: a viewer following a link to a disabled product gets the plain catalog with nothing open, and a product in DRAFT status opens for nobody.' },
      ],
    },
    {
      id: 'header', heading: 'The header',
      blocks: [
        { kind: 'list', items: [
          'Hero image: the product’s primary image. When a product has more than one gallery image, a row of small thumbnails appears under it; click one to view it (each is labelled View image, and the primary one says so).',
          'Therapeutic area · category, with a Tier 1, Tier 2 or Tier 3 badge when the product is tiered.',
          'Product name, then its tagline and subsidiary · type.',
          'Market chips, using the same rule as the catalog cards: a bare code such as FDA means cleared, a code followed by a dot means in progress or submitted, and Status: see detail means no market is live. The regulatory table further down always gives the full picture.',
        ], labels: ['View image', 'Tier 1', 'Status: see detail'] },
      ],
    },
    {
      id: 'body', heading: 'Description, indication and specifications',
      blocks: [
        { kind: 'list', items: [
          'Overview: the product description, followed by its feature list as bullets. The section is omitted when both are empty.',
          'Indication: the regulatory-approved condition this device treats.',
          'Patient population: who the approved indication applies to.',
          'Specifications: model sizes and key specs as filed with regulators, shown as key: value chips.',
          'Each of these appears only when the product has that information recorded, so some products show fewer headings than others.',
        ], labels: ['Overview', 'Indication', 'Patient population', 'Specifications'] },
      ],
    },
    {
      id: 'regulatory', heading: 'Regulatory status by market',
      blocks: [
        { kind: 'paragraph', text: 'The Regulatory status by market table is always shown. It lists the five markets in a fixed order, CE (European Union), FDA (United States), NMPA (China), PMDA (Japan) and TGA (Australia); hover a code to see the full name. Each row carries one status:', labels: ['Regulatory status by market', 'Cleared', 'In progress'] },
        { kind: 'list', items: [
          'Cleared: the product holds clearance in that market.',
          'In progress or Submitted: a clearance is underway in that market but not yet granted.',
          'Not cleared: the product is recorded as not cleared there.',
          'A dash (—): nothing has been recorded for that market.',
        ], labels: ['Cleared', 'In progress', 'Submitted', 'Not cleared'] },
        { kind: 'paragraph', text: 'Any regulatory notes recorded for the product appear directly under the table. The table shows status only: certificate numbers, clearance qualifiers and per-market notes are kept in the product record but are not displayed in this view.' },
      ],
    },
    {
      id: 'evidence', heading: 'Key clinical evidence',
      blocks: [
        { kind: 'paragraph', text: 'When clinical trials are recorded for a product, a Key clinical evidence table lists them with the columns Trial, Identifier, N, Design and Result. Most products have no trials recorded, and then the section is simply absent. Trials come from the catalog’s seed data; there is no way to add or edit them in ProductPort, by form or by CSV.', labels: ['Key clinical evidence', 'Trial', 'Identifier', 'Design', 'Result'] },
      ],
    },
    {
      id: 'admin-actions', heading: 'For product administrators',
      blocks: [
        { kind: 'roleBlock', roles: ['product_admin', 'superuser'], blocks: [
          { kind: 'list', items: [
            'Edit opens the product editor pre-filled with this product, including its image gallery and the regulatory clearance matrix (see Edit a product).',
            'Disable hides the product from viewers without deleting anything. It keeps its ACTIVE or DISCONTINUED status and all of its data; administrators still see it in the catalog and in this view, marked Disabled — hidden from the catalog.',
            'Enable puts a disabled product back in the catalog exactly as it was.',
            'While a Disable or Enable request is running the button reads Disabling… or Enabling…, and the view cannot be closed until it finishes; a toast confirms the result.',
            'Deleting a product is not done here; the Delete button lives at the bottom of the editor.',
          ], labels: ['Edit', 'Disable', 'Enable', 'Disabled — hidden from the catalog'] },
          { kind: 'faq', items: [
            { q: 'Should I disable or delete a product that is no longer sold?', a: 'Disable it if it may come back or you want it to stay in Export CSV and the editor; it disappears for viewers only and Enable restores it. Delete, in the editor, removes it from the catalog for everyone, and there is no button to bring it back. Note that setting its Status to DISCONTINUED in the editor does not hide it: viewers still see DISCONTINUED products.' },
            { q: 'I disabled a product but I can still see it.', a: 'That is expected. Administrators always see disabled products, faded in the grid with a DISABLED tag and with the Disabled — hidden from the catalog badge here. Viewers do not see them at all.' },
          ], labels: ['Disable', 'Enable', 'DISABLED', 'Export CSV'] },
        ] },
      ],
    },
    {
      id: 'faq', heading: 'Common questions',
      blocks: [
        { kind: 'faq', items: [
          { q: 'Can I link someone directly to a product?', a: 'Yes. Click Copy link in the detail view, or copy the address bar while the product is open; both give /?product=<slug>. The person must be signed in to ProductPort, and the product must be visible to them.' },
          { q: 'The link I was sent opens the catalog but no product.', a: 'Either the product is disabled (only product administrators can see disabled products), it is in DRAFT status (nobody can open it), or the link’s slug is wrong. If you were redirected to sign in first, open the link again after signing in.' },
          { q: 'Where are the model numbers, certificate numbers or business segment?', a: 'The detail view does not display them. Model numbers, applicable departments, business segment, development status, classification, lifecycle status (ACTIVE or DISCONTINUED) and the per-market certificate numbers, qualifiers and notes are stored in the product record and included in the CSV export, but only the fields described above appear on screen.' },
          { q: 'Why does one product show a clinical-evidence table and another not?', a: 'Key clinical evidence appears only when trials are recorded for that product, and trials cannot be added through ProductPort.' },
          { q: 'The header shows fewer markets than the table. Why?', a: 'The header chips only show markets with a live status (cleared, in progress or submitted). The Regulatory status by market table always lists all five, including Not cleared and unrecorded ones.' },
        ], labels: ['Copy link', 'Regulatory status by market', 'Not cleared', 'Key clinical evidence'] },
      ],
    },
  ],
  related: ['catalog-browse', 'product-edit', 'login'],
};

export default productDetail;
