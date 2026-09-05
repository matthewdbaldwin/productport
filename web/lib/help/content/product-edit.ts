// web/lib/help/content/product-edit.ts
// Facts verified 2026-09-04 against web/app/ProductEditModal.tsx,
// web/app/ImportCsvButton.tsx, web/app/page.tsx and src/lib/* (see the
// wave-1 UI facts sheet). UI labels are quoted verbatim from the components,
// which are hardcoded English in every locale.
import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';

const productEdit: HelpArticleContent = {
  slug: 'product-edit',
  title: 'Editing a product',
  intro: 'Open a product from the catalog and click Edit. It is the same form as Add product, prefilled, plus two sections that exist only here: Product images and Regulatory clearances. Image changes save the moment you make them; everything else saves with Save changes.',
  lastUpdated: '2026-09-04',
  sections: [
    {
      id: 'open-the-editor', heading: 'Opening the editor',
      blocks: [
        { kind: 'paragraph', text: 'Click a card to open the detail view, then click Edit (administrators only). The form is titled Edit followed by the product name, and every field is prefilled. Slug (url key) can be renamed, but the new slug must not be in use by another product; renaming changes the product’s link and its id column in CSV.', labels: ['Edit', 'Slug (url key)'] },
      ],
    },
    {
      id: 'fields', heading: 'Product fields and Status',
      blocks: [
        { kind: 'paragraph', text: 'The fields are the same as when adding a product, including the pipe-separated formats for Features, Specifications and Model numbers. Blanking an optional field clears it; Name, Slug (url key), Subsidiary and Therapeutic area cannot be blanked.', labels: ['Features', 'Specifications', 'Model numbers', 'Name', 'Subsidiary'] },
        { kind: 'list', items: [
          'DISCONTINUED does not hide or delete the product, and nothing in the catalog displays that status.',
          'To hide a product from viewers, use Disable in the detail view instead. Administrators still see it, badged DISABLED, and can enable it again.',
          'DRAFT hides the product from everyone, including administrators. It disappears from the grid, cannot be opened or edited in the app, and the only way back is Export CSV, change that row’s status cell, then Import CSV.',
        ], labels: ['Status', 'Disable', 'Export CSV', 'Import CSV'] },
      ],
    },
    {
      id: 'product-images', heading: 'Product images',
      blocks: [
        { kind: 'paragraph', text: 'Every change in this section is saved the moment you make it, as its own action. Adding an image, Set primary and Delete are not part of Save changes, and Cancel does not undo them.', labels: ['Product images', 'Set primary', 'Delete', 'Save changes', 'Cancel'] },
        { kind: 'list', items: [
          '+ Add image accepts JPEG, PNG or WebP up to 6 MB. Large images are downsized in the browser before upload; GIF and SVG are rejected.',
          'The first image you upload becomes the primary and shows on the catalog card. Set primary under any other image moves the Primary badge to it.',
          'Delete asks Delete? inline, with Yes and No. Deleting the primary promotes the next image; deleting the last one leaves the product without an image.',
        ], labels: ['+ Add image', 'Set primary', 'Primary', 'Delete'] },
      ],
    },
    {
      id: 'regulatory-clearances', heading: 'Regulatory clearances',
      blocks: [
        { kind: 'paragraph', text: 'A Clearance is the product’s authorisation to be sold in one jurisdiction. The Clearance matrix has five fixed rows, CE, FDA, NMPA, PMDA and TGA, each with Status, Certificate number(s), Qualifier and Notes. The rows are independent of each other.', labels: ['Regulatory clearances', 'Status', 'Qualifier', 'Notes'] },
        { kind: 'list', items: [
          'Status is NONE, IN_PROGRESS, SUBMITTED, APPROVED or NOT_APPROVED. It drives the market chips on the card, the Regulatory filter, and the status table in the detail view.',
          'Certificate number(s) holds the Registration evidence for that Clearance: the certificate or registration numbers, pipe-separated (e.g. CE-100|CE-200), up to 1000 characters.',
          'Qualifier is a caveat from a fixed list: CMD-only, CE-invalid, agent, pending or recently-approved.',
          'Notes is free text up to 2000 characters. Notes are visible only here, in the editor.',
        ], labels: ['Status', 'Certificate number(s)', 'Qualifier', 'Notes'] },
        { kind: 'paragraph', text: 'The matrix saves with Save changes, and only if you touched a cell. The product fields are saved first, then the clearances. If the clearance save fails, the product fields are already saved, the error shows in the banner and a toast, and the form stays open so you can retry.', labels: ['Save changes', 'Regulatory clearances'] },
        { kind: 'paragraph', text: 'A CSV import of this product, even of an unmodified export, erases every region’s Notes, because Notes are never exported. Certificate numbers and qualifiers do round-trip. If the catalog is maintained by CSV, keep anything important out of Notes.', labels: ['Notes', 'Import CSV', 'Export CSV'] },
      ],
    },
    {
      id: 'saving', heading: 'Saving, cancelling and deleting',
      blocks: [
        { kind: 'list', items: [
          'Save changes writes the product fields, and the clearance matrix if you touched it. On success a Changes saved. toast appears, the editor and the detail view both close, and the catalog reloads; click the card again to see the update.',
          'Cancel, the × button, Esc or a click on the backdrop close the form; if anything changed you are asked Discard your unsaved changes? Image changes already made are kept.',
          'Delete (bottom-left) asks Delete this product? and then Confirm delete. This is a soft delete with no way to restore inside the app: bringing the product back needs a database operation, and until then a CSV row with that slug is refused.',
        ], labels: ['Save changes', 'Changes saved.', 'Cancel', 'Delete', 'Confirm delete'] },
      ],
    },
    {
      id: 'faq', heading: 'Common questions',
      blocks: [
        { kind: 'faq', items: [
          { q: 'I clicked Cancel but the image I deleted is still gone.', a: 'Image changes save immediately as their own actions and are not part of Save changes, so Cancel cannot undo them. Upload the image again.' },
          { q: 'Does DISCONTINUED hide the product from viewers?', a: 'No. Nothing in the catalog displays that status. Use Disable in the detail view to hide a product from viewers, or Delete to remove it.' },
          { q: 'My clearance Notes disappeared.', a: 'A CSV import rewrites all five clearance rows and always writes Notes as empty, because the export has no Notes column. Re-enter them in the editor.' },
          { q: 'Can a region have more than one certificate number?', a: 'Yes. Separate them with a pipe in Certificate number(s), e.g. CE-100|CE-200.' },
          { q: 'Can I undo a delete?', a: 'Not in the app. The product is soft-deleted in the database; ask for a database restore. Until then a CSV row with the same slug is rejected.' },
        ] },
      ],
    },
  ],
  related: ['product-create', 'product-detail', 'csv-import'],
};

export default productEdit;
