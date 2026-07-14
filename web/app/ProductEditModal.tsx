'use client';

// ProductEditModal — the product_admin catalog editor (Slice 2). Create a new
// product or edit/delete an existing one. Mirrors the server write validator
// (src/lib/productWrite.js): slug/name/subsidiary/therapeuticArea required;
// tier/classification/status are enums; empty inputs submit as null.

import { useState } from 'react';
import { useModalEsc, useFocusTrap } from '@matthewdbaldwin/microport-ui';
import { ApiError } from '@/lib/api';
import s from './catalog.module.css';
import {
  createProduct, updateProduct, deleteProduct, uploadProductImage, deleteProductImage, setPrimaryImage,
  galleryImageSrc, THERAPEUTIC_AREAS, updateClearances, CLEARANCE_QUALIFIERS,
  type ProductInput, type ProductTier, type ProductClassification, type ProductStatus, type GalleryImage,
  type ClearanceRow, type ClearanceStatus,
} from '@/lib/products';

type Initial = Partial<ProductInput> & { slug?: string; images?: GalleryImage[]; clearances?: ClearanceRow[] };

const TIERS: ProductTier[] = ['TIER1', 'TIER2', 'TIER3'];
const CLASSES: ProductClassification[] = ['CORE', 'HIPO', 'FLAGSHIP'];
const STATUSES: ProductStatus[] = ['ACTIVE', 'DISCONTINUED', 'DRAFT'];
const CLR_REGIONS = ['CE', 'FDA', 'NMPA', 'PMDA', 'TGA'] as const;
const CLR_STATUSES: ClearanceStatus[] = ['NONE', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'NOT_APPROVED'];

// The matrix is edited as plain strings (all inputs emit strings), so state is
// this all-string row — never ClearanceRow. saveClearances() maps it back to
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

export function ProductEditModal({ mode, initial, onClose, onSaved }: {
  mode: 'create' | 'edit';
  initial?: Initial;
  onClose: () => void;
  onSaved: () => void;
}) {
  const i = initial ?? {};
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
  const [clrSaving, setClrSaving] = useState(false);
  const [clrErr, setClrErr] = useState('');
  const [clrSaved, setClrSaved] = useState(false);
  useModalEsc(onClose);
  const trapRef = useFocusTrap<HTMLDivElement>();

  const setCell = (idx: number, key: keyof EditRow) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setMatrix((m) => m.map((row, j) => (j === idx ? { ...row, [key]: e.target.value } : row)));

  async function saveClearances() {
    setClrSaving(true); setClrErr(''); setClrSaved(false);
    // Send blank cert/qualifier/notes as null; the server validator also trims.
    const payload: ClearanceRow[] = matrix.map((r) => ({
      region: r.region,
      status: r.status as ClearanceStatus,
      certificateNumbers: r.certificateNumbers.trim() || null,
      qualifier: r.qualifier.trim() || null,
      notes: r.notes.trim() || null,
    }));
    try {
      await updateClearances(i.slug as string, payload);
      setClrSaved(true);
      onSaved();
    } catch (e) {
      setClrErr(e instanceof Error ? e.message : 'Could not save clearances');
    } finally {
      setClrSaving(false);
    }
  }

  // All gallery mutations return the full product (with images) — reflect it and
  // refresh the catalog (the primary drives the card thumbnail).
  const applyProduct = (product: unknown) => {
    setGallery((product as { images?: GalleryImage[] }).images ?? []);
    setF((p) => ({ ...p, image: (product as { image?: string }).image ?? '' }));
    onSaved();
  };

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file || uploading) return;
    setUploading(true); setErr('');
    try { applyProduct((await uploadProductImage(i.slug as string, file)).product); }
    catch (er) { setErr(er instanceof Error ? er.message : 'Image upload failed'); }
    finally { setUploading(false); }
  }

  async function onSetPrimary(imageId: string) {
    if (imgBusy) return;
    setErr(''); setImgBusy(imageId);
    try { applyProduct((await setPrimaryImage(i.slug as string, imageId)).product); }
    catch (er) { setErr(er instanceof Error ? er.message : 'Could not set primary'); }
    finally { setImgBusy(null); }
  }

  async function onDeleteImage(imageId: string) {
    if (imgBusy) return;
    setErr(''); setImgBusy(imageId);
    try { applyProduct((await deleteProductImage(i.slug as string, imageId)).product); }
    catch (er) { setErr(er instanceof Error ? er.message : 'Could not delete image'); }
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
      if (mode === 'create') await createProduct(input);
      else await updateProduct(i.slug as string, input);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
      setFieldErrors(fieldErrorsFrom(e));
      setSaving(false);
    }
  }

  async function del() {
    setSaving(true); setErr('');
    try { await deleteProduct(i.slug as string); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Delete failed'); setSaving(false); }
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
      <input className={s.einput} value={f[k]} onChange={set(k)}
        autoFocus={focus} aria-invalid={fieldErrors[k] ? true : undefined} style={invalidStyle(k)} />
      {fieldErr(k)}
    </label>
  );
  const area = (k: string, label: string, hint?: string) => (
    <label key={k} className={s.efield}>
      <span>{label}{hint && <em style={{ color: 'var(--grey)', fontWeight: 400 }}> — {hint}</em>}</span>
      <textarea className={s.einput} rows={2} value={f[k]} onChange={set(k)}
        aria-invalid={fieldErrors[k] ? true : undefined} style={invalidStyle(k)} />
      {fieldErr(k)}
    </label>
  );

  return (
    <div className={s.ov} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={trapRef} className={s.modal} role="dialog" aria-modal="true" style={{ maxWidth: 720, maxHeight: '92vh', overflowY: 'auto', padding: 24 }}>
        <button className={s.x} onClick={onClose} aria-label="Close">&times;</button>
        <h2 style={{ margin: '4px 0 14px' }}>{mode === 'create' ? 'Add product' : `Edit ${i.name ?? ''}`}</h2>

        {err && <p role="alert" style={{ background: 'var(--rdb)', color: 'var(--rd)', padding: '8px 12px', borderRadius: 6, fontSize: 13 }}>{err}</p>}

        <div className={s.egrid}>
          {text('name', 'Name', true, true)}
          {text('slug', 'Slug (url key)', true)}
          {text('subsidiary', 'Subsidiary', true)}
          <label className={s.efield}><span>Therapeutic area <b style={{ color: 'var(--rd)' }}>*</b></span>
            <select className={s.einput} value={f.therapeuticArea} onChange={set('therapeuticArea')}
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
            <select className={s.einput} value={f.tier} onChange={set('tier')} style={invalidStyle('tier')}>
              <option value="">— none —</option>{TIERS.map((t) => <option key={t} value={t}>{t.replace('TIER', 'Tier ')}</option>)}
            </select>
            {fieldErr('tier')}
          </label>
          <label className={s.efield}><span>Classification</span>
            <select className={s.einput} value={f.classification} onChange={set('classification')} style={invalidStyle('classification')}>
              <option value="">— none —</option>{CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {fieldErr('classification')}
          </label>
          <label className={s.efield}><span>Status</span>
            <select className={s.einput} value={f.status} onChange={set('status')} style={invalidStyle('status')}>
              {STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
            </select>
            {fieldErr('status')}
          </label>
          {text('developmentStatus', 'Development status')}
        </div>

        {mode === 'edit' && (
          <div className={s.efield} style={{ marginBottom: 12 }}>
            <span>Product images <em style={{ color: 'var(--grey)', fontWeight: 400 }}>— gallery; the primary shows on the catalog card. JPEG/PNG/WebP, max 6 MB each.</em></span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6, alignItems: 'flex-start' }}>
              {gallery.map((img) => {
                const busy = imgBusy === img.id;
                const confirming = confirmDelImg === img.id;
                return (
                  <div key={img.id} style={{ width: 96, opacity: busy ? 0.55 : 1 }}>
                    <div style={{ position: 'relative' }}>
                      <img src={galleryImageSrc(i.slug as string, img.id)} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 6, border: img.isPrimary ? '2px solid var(--blue)' : '1px solid var(--lgrey)' }} />
                      {img.isPrimary && <span style={{ position: 'absolute', top: 3, left: 3, background: 'var(--blue)', color: '#fff', fontSize: 10, padding: '1px 5px', borderRadius: 4 }}>Primary</span>}
                    </div>
                    {/* Small labels, but a 44px-tall hit area (padding) per the tap-target standard. */}
                    {confirming ? (
                      <div style={{ display: 'flex', gap: 4, marginTop: 3, fontSize: 11, alignItems: 'center' }}>
                        <span style={{ color: 'var(--rd)' }}>Delete?</span>
                        <button type="button" onClick={() => onDeleteImage(img.id)} disabled={busy}
                          style={{ background: 'none', border: 'none', color: 'var(--rd)', fontWeight: 600, cursor: 'pointer', padding: '11px 6px', minHeight: 44 }}>{busy ? '…' : 'Yes'}</button>
                        <button type="button" onClick={() => setConfirmDelImg(null)} disabled={busy}
                          style={{ background: 'none', border: 'none', color: 'var(--grey)', cursor: 'pointer', padding: '11px 6px', minHeight: 44 }}>No</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, marginTop: 3, fontSize: 11, alignItems: 'center', minHeight: 44 }}>
                        {!img.isPrimary && <button type="button" onClick={() => onSetPrimary(img.id)} disabled={busy}
                          style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', padding: '11px 4px', minHeight: 44 }}>{busy ? '…' : 'Set primary'}</button>}
                        <button type="button" onClick={() => setConfirmDelImg(img.id)} disabled={busy} aria-label="Delete image"
                          style={{ background: 'none', border: 'none', color: 'var(--rd)', cursor: 'pointer', padding: '11px 4px', minHeight: 44, marginLeft: 'auto' }}>Delete</button>
                      </div>
                    )}
                  </div>
                );
              })}
              <label className={s.ebtnGhost} aria-disabled={uploading}
                style={{ cursor: uploading ? 'default' : 'pointer', pointerEvents: uploading ? 'none' : undefined, width: 96, height: 96, display: 'grid', placeItems: 'center', textAlign: 'center', fontSize: 12 }}>
                {uploading ? 'Uploading…' : '+ Add image'}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onPickImage} disabled={uploading} style={{ display: 'none' }} />
              </label>
            </div>
          </div>
        )}

        {mode === 'edit' && (
          <div className={s.efield} style={{ marginBottom: 12 }}>
            <span>Regulatory clearances <em style={{ color: 'var(--grey)', fontWeight: 400 }}>— status, certificate number(s) (pipe-separated), and any caveat, per region.</em></span>
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
                        <select className={s.einput} value={row.status} onChange={setCell(idx, 'status')}>
                          {CLR_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <input className={s.einput} value={row.certificateNumbers ?? ''} onChange={setCell(idx, 'certificateNumbers')} placeholder="e.g. CE-100|CE-200" />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <select className={s.einput} value={row.qualifier ?? ''} onChange={setCell(idx, 'qualifier')}>
                          <option value="">— none —</option>
                          {CLEARANCE_QUALIFIERS.map((q) => <option key={q} value={q}>{q}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <input className={s.einput} value={row.notes ?? ''} onChange={setCell(idx, 'notes')} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {clrErr && <em style={{ color: 'var(--rd)', fontSize: 12 }}>{clrErr}</em>}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
              <button type="button" className={s.ebtnGhost} disabled={clrSaving} onClick={saveClearances}>
                {clrSaving ? 'Saving…' : 'Save clearances'}
              </button>
              {clrSaved && <em style={{ color: 'var(--ok)', fontSize: 12 }}>Saved.</em>}
            </div>
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
                <button className={s.ebtnDanger} disabled={saving} onClick={del}>Confirm delete</button>
                <button className={s.ebtnGhost} disabled={saving} onClick={() => setConfirmDel(false)}>No</button>
              </span>
            ) : (
              <button className={s.ebtnDanger} disabled={saving} onClick={() => setConfirmDel(true)}>Delete</button>
            )
          )}
          <span style={{ display: 'inline-flex', gap: 10, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <button className={s.ebtnGhost} disabled={saving} onClick={onClose}>Cancel</button>
            <button className={s.ebtn} disabled={saving} onClick={save}>{saving ? 'Saving…' : mode === 'create' ? 'Create' : 'Save changes'}</button>
          </span>
        </div>
      </div>
    </div>
  );
}
