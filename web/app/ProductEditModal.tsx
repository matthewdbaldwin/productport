'use client';

// ProductEditModal — the product_admin catalog editor (Slice 2). Create a new
// product or edit/delete an existing one. Mirrors the server write validator
// (src/lib/productWrite.js): slug/name/subsidiary/therapeuticArea required;
// tier/classification/status are enums; empty inputs submit as null.

import { useState } from 'react';
import { useModalEsc, useFocusTrap, optimizeImageForUpload, Tooltip } from '@matthewdbaldwin/microport-ui';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api';
import { testId } from '@/lib/i18nIds';
import s from './catalog.module.css';
import {
  createProduct, updateProduct, deleteProduct, uploadProductImage, deleteProductImage, setPrimaryImage,
  galleryImageSrc, THERAPEUTIC_AREAS, updateClearances, CLEARANCE_QUALIFIERS,
  type ProductInput, type ProductTier, type ProductClassification, type ProductStatus, type GalleryImage,
  type ClearanceRow, type ClearanceStatus,
} from '@/lib/products';
import { HelpButton } from '@matthewdbaldwin/microport-ui/help';
import { getPopoverContent, getPopoverTitle } from '@/lib/help/popovers';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_LOCALE } from '@/lib/locales';

type Initial = Partial<ProductInput> & { slug?: string; images?: GalleryImage[]; clearances?: ClearanceRow[] };

const TIERS: ProductTier[] = ['TIER1', 'TIER2', 'TIER3'];
const CLASSES: ProductClassification[] = ['CORE', 'HIPO', 'FLAGSHIP'];
const STATUSES: ProductStatus[] = ['ACTIVE', 'DISCONTINUED', 'DRAFT'];
const CLR_REGIONS = ['CE', 'FDA', 'NMPA', 'PMDA', 'TGA'] as const;
const CLR_STATUSES: ClearanceStatus[] = ['NONE', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'NOT_APPROVED'];
const NS = 'productEdit';

// The matrix is edited as plain strings (all inputs emit strings), so state is
// this all-string row — never ClearanceRow. clearancePayload() maps it back to
// ClearanceRow (cast status, blank → null). This dodges the computed-key write
// on a union-typed field (string ≠ the ClearanceStatus union under tsc).
type EditRow = { region: string; status: string; certificateNumbers: string; qualifier: string; notes: string };

// Seed a full 5-region matrix from a product's (possibly partial) clearance rows.
function seedMatrix(rows?: ClearanceRow[]): EditRow[] {
  const by = new Map((rows ?? []).map((r) => [r.region, r]));
  return CLR_REGIONS.map((region) => {
    const r = by.get(region);
    return {
      region,
      status: r?.status ?? 'NONE',
      certificateNumbers: r?.certificateNumbers ?? '',
      qualifier: r?.qualifier ?? '',
      notes: r?.notes ?? '',
    };
  });
}

// Pull field-level errors out of a 422/400 ApiError.details ([{field,message}])
// so the editor can highlight the exact input. feedback_validation_details_must_propagate.
function fieldErrorsFrom(e: unknown): Record<string, string> {
  if (e instanceof ApiError && Array.isArray(e.details)) {
    const map: Record<string, string> = {};
    for (const d of e.details as Array<{ field?: string; message?: string }>) {
      if (d && d.field) map[d.field] = d.message || 'Invalid value';
    }
    return map;
  }
  return {};
}

export function ProductEditModal({ mode, initial, onClose, onSaved, onGalleryChanged }: {
  mode: 'create' | 'edit';
  initial?: Initial;
  onClose: () => void;
  onSaved: () => void;
  // Gallery mutations (set primary / delete / upload) persist immediately and
  // refresh the catalog thumbnail, but must NOT close the modal — the primary
  // form fields may still be dirty. Bug: this used to call onSaved(), which
  // closes the whole edit surface and silently drops any unsaved field edits.
  onGalleryChanged?: () => void | Promise<void>;
}) {
  const i = initial ?? {};
  // Contextual help for the two edit-only sub-sections (Help Library, Task 7).
  // Locale-aware via the user's hub-provisioned locale; useAuth() outside a
  // provider yields user:null, so bare renders (tests) fall back to English.
  const { user } = useAuth();
  const helpLocale = user?.locale ?? DEFAULT_LOCALE;
  const galleryPopover = getPopoverContent('gallery', helpLocale);
  const clearancePopover = getPopoverContent('clearance', helpLocale);
  const [f, setF] = useState<Record<string, string>>({
    slug: i.slug ?? '', name: i.name ?? '', subsidiary: i.subsidiary ?? '', therapeuticArea: i.therapeuticArea ?? '',
    category: i.category ?? '', type: i.type ?? '', businessSegment: i.businessSegment ?? '', image: i.image ?? '',
    tagline: i.tagline ?? '', overview: i.overview ?? '', features: i.features ?? '', indication: i.indication ?? '',
    patientPopulation: i.patientPopulation ?? '', specs: i.specs ?? '', regNotes: i.regNotes ?? '',
    applicableDepartments: i.applicableDepartments ?? '', modelNumbers: i.modelNumbers ?? '', developmentStatus: i.developmentStatus ?? '',
    tier: i.tier ?? '', classification: i.classification ?? '', status: i.status ?? 'ACTIVE',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmDel, setConfirmDel] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [gallery, setGallery] = useState<GalleryImage[]>(i.images ?? []);
  const [imgBusy, setImgBusy] = useState<string | null>(null);      // image id with an in-flight mutation
  const [confirmDelImg, setConfirmDelImg] = useState<string | null>(null); // image id pending delete confirm
  const [matrix, setMatrix] = useState<EditRow[]>(() => seedMatrix(i.clearances));
  // The clearance matrix persists with the primary "Save changes" button (there
  // is no separate save). clrDirty gates the extra write so an untouched-matrix
  // product save doesn't emit a spurious clearance.updated audit row. Bug #6.
  const [clrDirty, setClrDirty] = useState(false);
  // Snapshot of the form fields as seeded on mount, captured once (the lazy
  // useState initializer only runs on the first render; this value itself is
  // never updated). Compared against the live `f` to know whether the user has
  // typed anything worth confirming a discard of — a plain state read (unlike
  // a ref) is safe during render. Gallery mutations persist immediately (not
  // part of this), so they're deliberately excluded.
  const [initialF] = useState(f);
  const isDirty = clrDirty || Object.keys(f).some((k) => f[k] !== initialF[k]);
  const trapRef = useFocusTrap<HTMLDivElement>();
  const { toast } = useToast();

  // Every dismissal path (ESC, backdrop click, the X button, Cancel) funnels
  // through here: a dirty, unsaved form asks for confirmation before discarding
  // it. useModalEsc's own `!saving` gate (below) already blocks ESC outright
  // while a save is in flight; backdrop/X/Cancel re-check `saving` too so a
  // stray call can't slip through and pop the confirm mid-save.
  const requestClose = () => {
    if (saving) return;
    if (isDirty && !confirm('Discard your unsaved changes?')) return;
    onClose();
  };
  useModalEsc(requestClose, !saving);

  const setCell = (idx: number, key: keyof EditRow) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setClrDirty(true);
      setMatrix((m) => m.map((row, j) => (j === idx ? { ...row, [key]: e.target.value } : row)));
    };

  // Map the all-string edit matrix back to the ClearanceRow wire shape (cast
  // status; blank cert/qualifier/notes → null; the server validator also trims).
  const clearancePayload = (): ClearanceRow[] =>
    matrix.map((r) => ({
      region: r.region,
      status: r.status as ClearanceStatus,
      certificateNumbers: r.certificateNumbers.trim() || null,
      qualifier: r.qualifier.trim() || null,
      notes: r.notes.trim() || null,
    }));

  // All gallery mutations return the full product (with images) — reflect it and
  // refresh the catalog (the primary drives the card thumbnail).
  const applyProduct = (product: unknown) => {
    setGallery((product as { images?: GalleryImage[] }).images ?? []);
    setF((p) => ({ ...p, image: (product as { image?: string }).image ?? '' }));
    onGalleryChanged?.();
  };

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file || uploading) return;
    setUploading(true); setErr('');
    try {
      // Shrink/recompress client-side before upload — product images are display
      // only, so downscaling to web size keeps the 6 MB gate from rejecting large
      // source photos and trims catalog payloads. optimizeImageForUpload never
      // throws and returns the original file if it can't help.
      const optimized = await optimizeImageForUpload(file);
      applyProduct((await uploadProductImage(i.slug as string, optimized)).product);
    }
    // Gallery lives high in a tall scrolling modal, so the top-of-modal banner
    // can be off-screen — also toast so the failure is always seen. Bug #6.
    catch (er) { const m = er instanceof Error ? er.message : 'Image upload failed'; setErr(m); toast(m, 'error'); }
    finally { setUploading(false); }
  }

  async function onSetPrimary(imageId: string) {
    if (imgBusy) return;
    setErr(''); setImgBusy(imageId);
    try { applyProduct((await setPrimaryImage(i.slug as string, imageId)).product); }
    catch (er) { const m = er instanceof Error ? er.message : 'Could not set primary'; setErr(m); toast(m, 'error'); }
    finally { setImgBusy(null); }
  }

  async function onDeleteImage(imageId: string) {
    if (imgBusy) return;
    setErr(''); setImgBusy(imageId);
    try { applyProduct((await deleteProductImage(i.slug as string, imageId)).product); }
    catch (er) { const m = er instanceof Error ? er.message : 'Could not delete image'; setErr(m); toast(m, 'error'); }
    finally { setImgBusy(null); setConfirmDelImg(null); }
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const nn = (v: string) => (v.trim() === '' ? null : v.trim());

  async function save() {
    setSaving(true); setErr(''); setFieldErrors({});
    const input: ProductInput = {
      slug: f.slug.trim(), name: f.name.trim(), subsidiary: f.subsidiary.trim(), therapeuticArea: f.therapeuticArea.trim(),
      category: nn(f.category), type: nn(f.type), businessSegment: nn(f.businessSegment), image: nn(f.image),
      tagline: nn(f.tagline), overview: nn(f.overview), features: nn(f.features), indication: nn(f.indication),
      patientPopulation: nn(f.patientPopulation), specs: nn(f.specs), regNotes: nn(f.regNotes),
      applicableDepartments: nn(f.applicableDepartments), modelNumbers: nn(f.modelNumbers), developmentStatus: nn(f.developmentStatus),
      tier: (nn(f.tier) as ProductTier | null), classification: (nn(f.classification) as ProductClassification | null),
      status: (f.status as ProductStatus),
    };
    try {
      if (mode === 'create') {
        await createProduct(input);
      } else {
        await updateProduct(i.slug as string, input);
        // Clearances live in the same modal but a separate endpoint; the primary
        // Save persists them too so an edited region can't be silently dropped
        // (bug #6). Only when the matrix was actually touched.
        if (clrDirty) {
          await updateClearances(i.slug as string, clearancePayload());
          setClrDirty(false);
        }
      }
      toast(mode === 'create' ? 'Product created.' : 'Changes saved.', 'ok');
      onSaved();
    } catch (e) {
      // The modal is tall and scrolls, so the top-of-modal error banner + field
      // highlights can sit off-screen from the Save button. A viewport-fixed
      // toast guarantees the failure (and the actual reason) is seen no matter
      // where the user is scrolled.
      const message = e instanceof Error ? e.message : 'Save failed';
      setErr(message);
      setFieldErrors(fieldErrorsFrom(e));
      toast(message, 'error');
      setSaving(false);
    }
  }

  async function del() {
    setSaving(true); setErr('');
    try { await deleteProduct(i.slug as string); toast('Product deleted.', 'ok'); onSaved(); }
    catch (e) {
      const message = e instanceof Error ? e.message : 'Delete failed';
      setErr(message); toast(message, 'error'); setSaving(false);
    }
  }

  const invalidStyle = (k: string) => (fieldErrors[k] ? { borderColor: 'var(--rd)' } : undefined);
  const fieldErr = (k: string) => fieldErrors[k]
    ? <em style={{ color: 'var(--rd)', fontWeight: 400, fontSize: 11 }}>{fieldErrors[k]}</em>
    : null;

  // Plain render helpers (NOT components) — called inline as {text(...)}. Defining
  // them as <Component/> here would give React a new type each render and remount
  // the input on every keystroke (focus loss). As function calls they just return
  // elements, so the input identity is stable. `focus` autofocuses the first
  // meaningful field (Name) on open, overriding useFocusTrap's default of focusing
  // the close-X (first DOM node) — matches BugReportModal's pattern.
  const text = (k: string, label: string, req?: boolean, focus?: boolean) => (
    <label key={k} className={s.efield}>
      <span>{label}{req && <b style={{ color: 'var(--rd)' }}> *</b>}</span>
      <input className={s.einput} value={f[k]} onChange={set(k)} {...testId(NS, k)}
        autoFocus={focus} aria-invalid={fieldErrors[k] ? true : undefined} style={invalidStyle(k)} />
      {fieldErr(k)}
    </label>
  );
  const area = (k: string, label: string, hint?: string) => (
    <label key={k} className={s.efield}>
      <span>{label}{hint && <em style={{ color: 'var(--grey)', fontWeight: 400 }}> — {hint}</em>}</span>
      <textarea className={s.einput} rows={2} value={f[k]} onChange={set(k)} {...testId(NS, k)}
        aria-invalid={fieldErrors[k] ? true : undefined} style={invalidStyle(k)} />
      {fieldErr(k)}
    </label>
  );

  return (
    <div className={s.modalOverlay} onClick={(e) => { if (saving) return; if (e.target === e.currentTarget) requestClose(); }}>
      <div ref={trapRef} className={s.modal} role="dialog" aria-modal="true" style={{ maxWidth: 720, maxHeight: '92vh', overflowY: 'auto', padding: 24 }}>
        <Tooltip content="Close">
          <button className={s.closeButton} onClick={requestClose} disabled={saving} aria-label="Close" {...testId(NS, 'close')}>&times;</button>
        </Tooltip>
        <h2 style={{ margin: '4px 0 14px' }}>{mode === 'create' ? 'Add product' : `Edit ${i.name ?? ''}`}</h2>

        {err && <p role="alert" style={{ background: 'var(--rdb)', color: 'var(--rd)', padding: '8px 12px', borderRadius: 6, fontSize: 13 }}>{err}</p>}

        <div className={s.egrid}>
          {text('name', 'Name', true, true)}
          {text('slug', 'Slug (url key)', true)}
          {text('subsidiary', 'Subsidiary', true)}
          <label className={s.efield}><span>Therapeutic area <b style={{ color: 'var(--rd)' }}>*</b></span>
            <select className={s.einput} value={f.therapeuticArea} onChange={set('therapeuticArea')} {...testId(NS, 'therapeuticArea')}
              aria-invalid={fieldErrors.therapeuticArea ? true : undefined} style={invalidStyle('therapeuticArea')}>
              <option value="">— select —</option>{THERAPEUTIC_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            {fieldErr('therapeuticArea')}
          </label>
          {text('businessSegment', 'Business segment')}
          {text('category', 'Category')}
          {text('type', 'Type')}
          {text('image', 'Image filename')}
          <label className={s.efield}><span>Tier</span>
            <select className={s.einput} value={f.tier} onChange={set('tier')} {...testId(NS, 'tier')} style={invalidStyle('tier')}>
              <option value="">— none —</option>{TIERS.map((t) => <option key={t} value={t}>{t.replace('TIER', 'Tier ')}</option>)}
            </select>
            {fieldErr('tier')}
          </label>
          <label className={s.efield}><span>Classification</span>
            <select className={s.einput} value={f.classification} onChange={set('classification')} {...testId(NS, 'classification')} style={invalidStyle('classification')}>
              <option value="">— none —</option>{CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {fieldErr('classification')}
          </label>
          <label className={s.efield}><span>Status</span>
            <select className={s.einput} value={f.status} onChange={set('status')} {...testId(NS, 'status')} style={invalidStyle('status')}>
              {STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
            </select>
            {fieldErr('status')}
          </label>
          {text('developmentStatus', 'Development status')}
        </div>

        {mode === 'edit' && (
          <div className={s.efield} style={{ marginBottom: 12 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              Product images <em style={{ color: 'var(--grey)', fontWeight: 400 }}>— gallery; the primary shows on the catalog card. JPEG/PNG/WebP, max 6 MB each.</em>
              <HelpButton content={galleryPopover} title={getPopoverTitle('gallery', helpLocale)} inline />
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6, alignItems: 'flex-start' }}>
              {gallery.map((img) => {
                const busy = imgBusy === img.id;
                const confirming = confirmDelImg === img.id;
                return (
                  <div key={img.id} style={{ width: 96, opacity: busy ? 0.55 : 1 }}>
                    <div style={{ position: 'relative' }}>
                      <img src={galleryImageSrc(i.slug as string, img.id)} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 6, border: img.isPrimary ? '2px solid var(--catalog-blue)' : '1px solid var(--lgrey)' }} />
                      {img.isPrimary && <span className={s.primaryBadge}>Primary</span>}
                    </div>
                    {/* Small labels, but a 44px-tall hit area (padding) per the tap-target standard. */}
                    {confirming ? (
                      <div style={{ display: 'flex', gap: 4, marginTop: 3, fontSize: 11, alignItems: 'center' }}>
                        <span style={{ color: 'var(--rd)' }}>Delete?</span>
                        <button type="button" onClick={() => onDeleteImage(img.id)} disabled={busy} {...testId(NS, `deleteImageConfirm-${img.id}`)}
                          style={{ background: 'none', border: 'none', color: 'var(--rd)', fontWeight: 600, cursor: 'pointer', padding: '11px 6px', minHeight: 44 }}>{busy ? '…' : 'Yes'}</button>
                        <button type="button" onClick={() => setConfirmDelImg(null)} disabled={busy} {...testId(NS, `deleteImageCancel-${img.id}`)}
                          style={{ background: 'none', border: 'none', color: 'var(--grey)', cursor: 'pointer', padding: '11px 6px', minHeight: 44 }}>No</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, marginTop: 3, fontSize: 11, alignItems: 'center', minHeight: 44 }}>
                        {!img.isPrimary && <button type="button" onClick={() => onSetPrimary(img.id)} disabled={busy} {...testId(NS, `setPrimaryImage-${img.id}`)}
                          style={{ background: 'none', border: 'none', color: 'var(--catalog-blue)', cursor: 'pointer', padding: '11px 4px', minHeight: 44 }}>{busy ? '…' : 'Set primary'}</button>}
                        <button type="button" onClick={() => setConfirmDelImg(img.id)} disabled={busy} aria-label="Delete image" {...testId(NS, `deleteImage-${img.id}`)}
                          style={{ background: 'none', border: 'none', color: 'var(--rd)', cursor: 'pointer', padding: '11px 4px', minHeight: 44, marginLeft: 'auto' }}>Delete</button>
                      </div>
                    )}
                  </div>
                );
              })}
              <label className={s.ghostButton} aria-disabled={uploading} {...testId(NS, 'addImage')}
                style={{ cursor: uploading ? 'default' : 'pointer', pointerEvents: uploading ? 'none' : undefined, width: 96, height: 96, display: 'grid', placeItems: 'center', textAlign: 'center', fontSize: 12 }}>
                {uploading ? 'Uploading…' : '+ Add image'}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onPickImage} disabled={uploading} style={{ display: 'none' }} {...testId(NS, 'imageFileInput')} />
              </label>
            </div>
          </div>
        )}

        {mode === 'edit' && (
          <div className={s.efield} style={{ marginBottom: 12 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              Regulatory clearances <em style={{ color: 'var(--grey)', fontWeight: 400 }}>— status, certificate number(s) (pipe-separated), and any caveat, per region.</em>
              <HelpButton content={clearancePopover} title={getPopoverTitle('clearance', helpLocale)} inline />
            </span>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 6 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--grey)' }}>
                    <th style={{ padding: '4px 6px' }}>Region</th>
                    <th style={{ padding: '4px 6px' }}>Status</th>
                    <th style={{ padding: '4px 6px' }}>Certificate number(s)</th>
                    <th style={{ padding: '4px 6px' }}>Qualifier</th>
                    <th style={{ padding: '4px 6px' }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row, idx) => (
                    <tr key={row.region}>
                      <td style={{ padding: '4px 6px', fontWeight: 600 }}>{row.region}</td>
                      <td style={{ padding: '4px 6px' }}>
                        <select className={s.einput} aria-label={`${row.region} clearance status`} value={row.status} onChange={setCell(idx, 'status')} {...testId(NS, `clearance-${row.region}-status`)}>
                          {CLR_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <input className={s.einput} aria-label={`${row.region} certificate numbers`} value={row.certificateNumbers ?? ''} onChange={setCell(idx, 'certificateNumbers')} placeholder="e.g. CE-100|CE-200" {...testId(NS, `clearance-${row.region}-certificateNumbers`)} />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <select className={s.einput} aria-label={`${row.region} qualifier`} value={row.qualifier ?? ''} onChange={setCell(idx, 'qualifier')} {...testId(NS, `clearance-${row.region}-qualifier`)}>
                          <option value="">— none —</option>
                          {CLEARANCE_QUALIFIERS.map((q) => <option key={q} value={q}>{q}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <input className={s.einput} aria-label={`${row.region} clearance notes`} value={row.notes ?? ''} onChange={setCell(idx, 'notes')} {...testId(NS, `clearance-${row.region}-notes`)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <em style={{ color: 'var(--grey)', fontSize: 12, marginTop: 6, display: 'block' }}>
              Clearance changes save with “Save changes” below.
            </em>
          </div>
        )}

        {text('tagline', 'Tagline')}
        {area('overview', 'Overview')}
        {area('features', 'Features', 'pipe-separated a|b|c')}
        {area('indication', 'Indication')}
        {area('patientPopulation', 'Patient population')}
        {area('specs', 'Specifications', 'pipe-separated key: value')}
        {area('modelNumbers', 'Model numbers', 'pipe-separated')}
        {area('applicableDepartments', 'Applicable departments', 'pipe-separated')}
        {area('regNotes', 'Regulatory notes')}

        {/* Footer: wraps on narrow screens; destructive Delete is separated on the
            left, primary Save is rightmost (not the far-right slot Delete used to
            hold). Standardized toward BugReportModal's convention. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16, alignItems: 'center' }}>
          {mode === 'edit' && (
            confirmDel ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13 }}>Delete this product?</span>
                <button className={s.dangerButton} disabled={saving} onClick={del} {...testId(NS, 'confirmDelete')}>Confirm delete</button>
                <button className={s.ghostButton} disabled={saving} onClick={() => setConfirmDel(false)} {...testId(NS, 'cancelDelete')}>No</button>
              </span>
            ) : (
              <button className={s.dangerButton} disabled={saving} onClick={() => setConfirmDel(true)} {...testId(NS, 'deleteProduct')}>Delete</button>
            )
          )}
          <span style={{ display: 'inline-flex', gap: 10, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <button className={s.ghostButton} disabled={saving} onClick={requestClose} {...testId(NS, 'cancel')}>Cancel</button>
            <button className={s.primaryButton} disabled={saving} onClick={save} {...testId(NS, 'save')}>{saving ? 'Saving…' : mode === 'create' ? 'Create' : 'Save changes'}</button>
          </span>
        </div>
      </div>
    </div>
  );
}
