// web/lib/help/content/csv-import.ts
// Facts verified 2026-09-04 against web/app/ProductEditModal.tsx,
// web/app/ImportCsvButton.tsx, web/app/page.tsx and src/lib/* (see the
// wave-1 UI facts sheet). UI labels are quoted verbatim from the components,
// which are hardcoded English in every locale.
import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';

const csvImport: HelpArticleContent = {
  slug: 'csv-import',
  title: 'CSV import and export',
  intro: 'Export CSV downloads the whole catalog as a spreadsheet. Import CSV writes a spreadsheet back, creating or updating one product per row. Verify (dry run) checks a file without writing anything. All three sit in the top bar and are visible to administrators only.',
  lastUpdated: '2026-09-04',
  sections: [
    {
      id: 'workflow', heading: 'The recommended workflow',
      blocks: [
        { kind: 'steps', steps: [
          'Click Export CSV to download productport-catalog.csv: the current catalog, in exactly the column layout the importer expects.',
          'Edit the file in a spreadsheet. Keep every column, add rows for new products, and leave rows you are not changing alone.',
          'Click Verify (dry run) and pick the file; the file picker opens directly.',
          'Read the result next to the buttons: Preview: N new, M updated and, if any rows have problems, K would fail. Click Download errors to save import-errors.csv, which lists each failing row with its slug and the reason.',
          'Fix those rows in your spreadsheet and verify again until nothing would fail.',
          'Click Import CSV and pick the file. The result reads Imported: N new, M updated, plus K failed if rows were rejected, and the catalog reloads.',
        ], labels: ['Export CSV', 'Verify (dry run)', 'Download errors', 'Import CSV'] },
        { kind: 'paragraph', text: 'The result is inline text beside the buttons, not a toast, and it stays until the next run. In import-errors.csv the row number counts the header as line 1; blank lines are skipped, so a file with blank lines will have row numbers that drift from your spreadsheet’s. Files up to 15 MB are accepted.', labels: ['Download errors', 'Verify (dry run)'] },
      ],
    },
    {
      id: 'header-check', heading: 'The header check',
      blocks: [
        { kind: 'paragraph', text: 'Before a single row is read, the header is checked against the 36 columns that Export CSV produces. Every one of them must be present, in any order; extra columns are ignored and listed as unknown in the result. If any column is missing, the whole file is rejected and no rows change, because an import replaces every column and a partial header would erase data. Start from an export rather than building a file by hand.', labels: ['Export CSV', 'Import CSV'] },
      ],
    },
    {
      id: 'matching', heading: 'How rows match products',
      blocks: [
        { kind: 'list', items: [
          'The match key is the id column, which is the product’s slug (lowercase letters, digits and hyphens), matched exactly. An existing slug updates that product; a new slug creates one. Names are never matched.',
          'An update replaces every column with the value in the CSV; a blank cell clears the field. The exceptions are tier, classification and status, where a blank cell keeps the existing value.',
          'Rows are processed one by one and independently. A failing row is listed and the others are still written; nothing is rolled back. If two rows share an id, the last one wins.',
          'A slug that matches a deleted product is refused; the product is not revived.',
          'Trials and gallery images are untouched by import.',
        ] },
      ],
    },
    {
      id: 'row-rules', heading: 'What each row must contain',
      blocks: [
        { kind: 'list', items: [
          'id, name, subsidiary and therapeutic_area are required. therapeutic_area must be one of the ten canonical names, spelled exactly as in the export.',
          'The market columns fda, ce, nmpa, pmda and tga accept cleared or approved, in progress, submitted, not cleared, and blank or none. Any other word silently becomes none, and Verify (dry run) will not flag it, so a typo such as clearred erases that market’s status.',
          'Each *_qualifier must be blank or one of CMD-only, CE-invalid, agent, pending, recently-approved. Each *_cert is pipe-separated (CE-100|CE-200), up to 1000 characters.',
          'tier accepts 1, Tier 1, TIER1 and similar spellings; classification accepts CORE, HIPO, FLAGSHIP and a few spelled-out forms. An unknown word in either silently becomes blank, which on an update keeps the existing value.',
          'status must be ACTIVE, DISCONTINUED or DRAFT; any other word is a row error. Remember that DRAFT hides the product from everyone, including administrators, and Import CSV is then the only way to change it back.',
          'Free-text columns have the same length limits as the editor, for example 255 characters for name and 500 for tagline.',
        ], labels: ['Verify (dry run)', 'Import CSV'] },
      ],
    },
    {
      id: 'notes-warning', heading: 'Clearance Notes are erased by import',
      blocks: [
        { kind: 'paragraph', text: 'The import deletes and recreates all five clearance rows for every product in the file, and always writes Notes as empty, because there is no notes column. Importing a product, even from an unmodified export, erases any Notes typed in the editor’s Regulatory clearances section. Certificate numbers and qualifiers round-trip normally.', labels: ['Notes', 'Regulatory clearances', 'Import CSV'] },
      ],
    },
    {
      id: 'export', heading: 'What the export contains',
      blocks: [
        { kind: 'list', items: [
          'Every product that has not been deleted, including DRAFT and disabled ones, in name order, capped at 5,000 rows, saved as productport-catalog.csv.',
          'All 36 columns; there is no Notes column. Market statuses are written as words (cleared, in progress, submitted, not cleared, or blank); tier, classification and status as their enum values (TIER1, CORE, ACTIVE and so on).',
          'A cell that begins with =, +, - or @ is written with a leading apostrophe so a spreadsheet does not run it as a formula. That apostrophe is re-imported as part of the text, so check such cells (for example a tagline that starts with a dash) before importing.',
        ], labels: ['Export CSV', 'Notes'] },
      ],
    },
    {
      id: 'faq', heading: 'Common questions',
      blocks: [
        { kind: 'faq', items: [
          { q: 'Do I have to verify before every import?', a: 'It is not enforced, but Verify (dry run) runs the same checks as a real import without writing anything, so it is the cheapest way to catch a bad row.' },
          { q: 'If some rows fail, is anything rolled back?', a: 'No. Every row is processed on its own, and the rows that passed are already written. Fix the failing rows and import the file again; the unchanged rows are simply updated to the same values.' },
          { q: 'Why did a market status disappear after an import?', a: 'Most likely a typo in that market column. Any word the importer does not recognise becomes none without an error. Check the spelling against the export and import again.' },
          { q: 'Can I import a file with only the columns I want to change?', a: 'No. All 36 columns must be present, because an update replaces every column. Export the catalog, change the cells you need, and import that file.' },
          { q: 'Can I build the file by hand?', a: 'You can, but it must carry all 36 columns with the exact header names. Starting from Export CSV is far safer.' },
        ] },
      ],
    },
  ],
  related: ['product-edit', 'product-create', 'catalog-browse'],
};

export default csvImport;
