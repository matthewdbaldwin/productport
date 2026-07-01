'use client';

// ProductEditModal — the product_admin catalog editor (Slice 2). Create a new
// product or edit/delete an existing one. Mirrors the server write validator
// (src/lib/productWrite.js): slug/name/subsidiary/therapeuticArea required;
// tier/classification/status are enums; empty inputs submit as null.

import { useState } from 'react';
import s from './catalog.module.css';
import {
  createProduct, updateProduct, deleteProduct, THERAPEUTIC_AREAS,
  type ProductInput, type ProductTier, type ProductClassification, type ProductStatus,
} from '@/lib/products';

type Initial = Partial<ProductInput> & { slug?: string };

const TIERS: ProductTier[] = ['TIER1', 'TIER2', 'TIER3'];
const CLASSES: ProductClassification[] = ['CORE', 'HIPO', 'FLAGSHIP'];
const STATUSES: ProductStatus[] = ['ACTIVE', 'DISCONTINUED', 'DRAFT'];

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
  const [confirmDel, setConfirmDel] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const nn = (v: string) => (v.trim() === '' ? null : v.trim());

  async function save() {
    setSaving(true); setErr('');
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
      setSaving(false);
    }
  }

  async function del() {
    setSaving(true); setErr('');
    try { await deleteProduct(i.slug as string); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Delete failed'); setSaving(false); }
  }

  // Plain render helpers (NOT components) — called inline as {text(...)}. Defining
  // them as <Component/> here would give React a new type each render and remount
  // the input on every keystroke (focus loss). As function calls they just return
  // elements, so the input identity is stable.
  const text = (k: string, label: string, req?: boolean) => (
    <label key={k} className={s.efield}>
      <span>{label}{req && <b style={{ color: 'var(--rd)' }}> *</b>}</span>
      <input className={s.einput} value={f[k]} onChange={set(k)} />
    </label>
  );
  const area = (k: string, label: string, hint?: string) => (
    <label key={k} className={s.efield}>
      <span>{label}{hint && <em style={{ color: 'var(--grey)', fontWeight: 400 }}> — {hint}</em>}</span>
      <textarea className={s.einput} rows={2} value={f[k]} onChange={set(k)} />
    </label>
  );

  return (
    <div className={s.ov} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={s.modal} role="dialog" aria-modal="true" style={{ maxWidth: 720, maxHeight: '92vh', overflowY: 'auto', padding: 24 }}>
        <button className={s.x} onClick={onClose} aria-label="Close">&times;</button>
        <h2 style={{ margin: '4px 0 14px' }}>{mode === 'create' ? 'Add product' : `Edit ${i.name ?? ''}`}</h2>

        {err && <p role="alert" style={{ background: 'var(--rdb)', color: 'var(--rd)', padding: '8px 12px', borderRadius: 6, fontSize: 13 }}>{err}</p>}

        <div className={s.egrid}>
          {text('name', 'Name', true)}
          {text('slug', 'Slug (url key)', true)}
          {text('subsidiary', 'Subsidiary', true)}
          <label className={s.efield}><span>Therapeutic area *</span>
            <select className={s.einput} value={f.therapeuticArea} onChange={set('therapeuticArea')}>
              <option value="">— select —</option>{THERAPEUTIC_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          {text('businessSegment', 'Business segment')}
          {text('category', 'Category')}
          {text('type', 'Type')}
          {text('image', 'Image filename')}
          <label className={s.efield}><span>Tier</span>
            <select className={s.einput} value={f.tier} onChange={set('tier')}>
              <option value="">— none —</option>{TIERS.map((t) => <option key={t} value={t}>{t.replace('TIER', 'Tier ')}</option>)}
            </select>
          </label>
          <label className={s.efield}><span>Classification</span>
            <select className={s.einput} value={f.classification} onChange={set('classification')}>
              <option value="">— none —</option>{CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className={s.efield}><span>Status</span>
            <select className={s.einput} value={f.status} onChange={set('status')}>
              {STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
            </select>
          </label>
          {text('developmentStatus', 'Development status')}
        </div>

        {text('tagline', 'Tagline')}
        {area('overview', 'Overview')}
        {area('features', 'Features', 'pipe-separated a|b|c')}
        {area('indication', 'Indication')}
        {area('patientPopulation', 'Patient population')}
        {area('specs', 'Specifications', 'pipe-separated key: value')}
        {area('modelNumbers', 'Model numbers', 'pipe-separated')}
        {area('applicableDepartments', 'Applicable departments', 'pipe-separated')}
        {area('regNotes', 'Regulatory notes')}

        <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
          <button className={s.ebtn} disabled={saving} onClick={save}>{saving ? 'Saving…' : mode === 'create' ? 'Create' : 'Save changes'}</button>
          <button className={s.ebtnGhost} disabled={saving} onClick={onClose}>Cancel</button>
          {mode === 'edit' && (
            <span style={{ marginLeft: 'auto' }}>
              {confirmDel ? (
                <>
                  <span style={{ fontSize: 13, marginRight: 8 }}>Delete this product?</span>
                  <button className={s.ebtnDanger} disabled={saving} onClick={del}>Confirm delete</button>
                  <button className={s.ebtnGhost} disabled={saving} onClick={() => setConfirmDel(false)}>No</button>
                </>
              ) : (
                <button className={s.ebtnDanger} disabled={saving} onClick={() => setConfirmDel(true)}>Delete</button>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
