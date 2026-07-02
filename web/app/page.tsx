'use client';
/* eslint-disable @next/next/no-img-element -- product photos are small static
   assets served from /public; next/image optimization is unwanted overhead here
   and would change the MVP's contain-fit layout. */

// ProductPort catalog — the Viewer surface (PRD §6). A faithful React port of
// the standalone MVP: load the whole (small) catalog once, then search / filter
// / detail entirely in memory. Every authenticated employee is a viewer.
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useModalEsc, useFocusTrap } from '@matthewdbaldwin/microport-ui';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { statusOf, orderedAreas, filterProducts } from '@/lib/catalogFilter';
import { ProductEditModal } from './ProductEditModal';
import { ImportCsvButton } from './ImportCsvButton';
import { galleryImageSrc, type ProductInput, type GalleryImage } from '@/lib/products';
import s from './catalog.module.css';

type ClearanceStatus = 'APPROVED' | 'IN_PROGRESS' | 'SUBMITTED' | 'NOT_APPROVED' | 'NONE';
type ProductTier = 'TIER1' | 'TIER2' | 'TIER3';

interface Clearance { region: string; status: ClearanceStatus; notes: string | null }
interface Trial { trial: string; identifier: string; n: string; design: string; result: string }
interface Product {
  id: string;
  name: string;
  subsidiary: string;
  therapeuticArea: string;
  category: string;
  type: string;
  tagline: string;
  overview: string;
  features: string;
  indication: string;
  patientPopulation: string;
  specs: string;
  regNotes: string;
  image: string | null;
  status: 'ACTIVE' | 'DISCONTINUED' | 'DRAFT';
  tier: ProductTier | null;
  classification: 'CORE' | 'HIPO' | 'FLAGSHIP' | null;
  businessSegment: string | null;
  applicableDepartments: string | null; // pipe-delimited
  modelNumbers: string | null;           // pipe-delimited
  developmentStatus: string | null;
  clearances: Clearance[];
  trials: Trial[];
  images: GalleryImage[];
}

const REGIONS = ['CE', 'FDA', 'NMPA', 'PMDA'] as const;

const STATUS_META: Record<ClearanceStatus, { label: string; bg: string; fg: string }> = {
  APPROVED:     { label: 'Cleared',     bg: 'var(--okb)', fg: 'var(--ok)' },
  IN_PROGRESS:  { label: 'In progress', bg: 'var(--amb)', fg: 'var(--am)' },
  SUBMITTED:    { label: 'Submitted',   bg: 'var(--blb)', fg: 'var(--bl)' },
  NOT_APPROVED: { label: 'Not cleared', bg: 'var(--rdb)', fg: 'var(--rd)' },
  NONE:         { label: '—',           bg: '#eef0f3',    fg: '#6b7280' },
};

// Grid cards use a lightweight ~240px WebP thumbnail (products/thumbs/, generated
// by web/scripts/optimize-images.mjs); the detail modal uses the full original.
// Uploaded (s3:) images resolve through the API's presigned redirect (no static
// thumb variant — the full image is served for both); legacy filenames keep the
// optimized /products/thumbs/*.webp + /products/<file> static paths.
const thumbSrc = (p: Product) => (!p.image ? null
  : p.image.startsWith('s3:') ? `/api/products/${encodeURIComponent(p.id)}/image`
  : `/products/thumbs/${p.image.replace(/\.(jpe?g|png)$/i, '.webp')}`);
const fullSrc = (p: Product) => (!p.image ? null
  : p.image.startsWith('s3:') ? `/api/products/${encodeURIComponent(p.id)}/image`
  : `/products/${p.image}`);
const splitList = (v: string) => (v || '').split('|').map((x) => x.trim()).filter(Boolean);

function Chip({ label, status }: { label: string; status: ClearanceStatus }) {
  const m = STATUS_META[status];
  return <span className={s.chip} style={{ background: m.bg, color: m.fg }}>{label}</span>;
}

// Gold / Silver / Bronze medal palette — mirrors src/lib/tierPalette.js TIER_META.
// Fixed hex (not theme tokens): a tier must read the same in every theme.
const TIER_META: Record<ProductTier, { label: string; bg: string; fg: string }> = {
  TIER1: { label: 'Tier 1', bg: '#E8B923', fg: '#3D2E00' },
  TIER2: { label: 'Tier 2', bg: '#B8BEC7', fg: '#26292E' },
  TIER3: { label: 'Tier 3', bg: '#C77B3B', fg: '#2E1600' },
};

function TierBadge({ tier }: { tier: ProductTier | null }) {
  if (!tier) return null;
  const m = TIER_META[tier];
  return (
    <span
      className={s.tier}
      style={{ background: m.bg, color: m.fg }}
      data-testid={`tier-badge-${tier}`}
    >
      {m.label}
    </span>
  );
}

// Card market chips: approved → solid, in-progress / submitted → "• " suffix.
function MarketChips({ p }: { p: Product }) {
  const chips = REGIONS.flatMap((r) => {
    const st = statusOf(p, r);
    if (st === 'APPROVED') return [<Chip key={r} label={r} status="APPROVED" />];
    if (st === 'IN_PROGRESS') return [<Chip key={r} label={`${r} •`} status="IN_PROGRESS" />];
    if (st === 'SUBMITTED') return [<Chip key={r} label={`${r} •`} status="SUBMITTED" />];
    return [];
  });
  if (!chips.length) return <span className={s.cs}>Status: see detail</span>;
  return <>{chips}</>;
}

function ProductImg({ p, thumb }: { p: Product; thumb?: boolean }) {
  const src = thumb ? thumbSrc(p) : fullSrc(p);
  if (src) return <img src={src} alt={p.name} loading={thumb ? 'lazy' : undefined} />;
  return (
    <div className={s.ph}>
      <img src="/products/logo.jpg" alt="" />
      <div className={s.pht}>{p.name}</div>
    </div>
  );
}

function DetailModal({ p, onClose, onEdit }: { p: Product; onClose: () => void; onEdit?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [heroId, setHeroId] = useState<string | null>(null); // gallery thumb → swap the hero
  useModalEsc(onClose);
  const trapRef = useFocusTrap<HTMLDivElement>();
  const heroSrc = heroId ? galleryImageSrc(p.id, heroId) : fullSrc(p);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Canonical, shareable URL for this product — the link hub.microport.com (and
  // anyone else) uses to deep-link straight to it. product.id === slug.
  const copyLink = () => {
    const href = `${window.location.origin}/?product=${p.id}`;
    (navigator.clipboard?.writeText(href) ?? Promise.reject()).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1600); },
      () => { window.prompt('Copy this product link', href); },
    );
  };

  const feats = splitList(p.features);
  const specs = splitList(p.specs).map((line) => {
    const i = line.indexOf(':');
    return { k: i < 0 ? line : line.slice(0, i).trim(), v: i < 0 ? '' : line.slice(i + 1).trim() };
  });
  const hasOverview = !!(p.overview || feats.length);
  const hasDetail = !!(p.indication || p.patientPopulation || specs.length);

  return (
    <div className={s.ov} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={trapRef} className={s.modal} role="dialog" aria-modal="true" aria-labelledby="pp-modal-title" style={{ maxHeight: '92vh', overflowY: 'auto' }}>
        <button className={s.x} onClick={onClose} aria-label="Close">&times;</button>
        <div className={s.mhead}>
          <div>
            <div className={s.mimg}>
              {heroSrc ? <img src={heroSrc} alt={p.name} /> : <ProductImg p={p} />}
            </div>
            {p.images.length > 1 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {p.images.map((img) => {
                  const active = heroId ? heroId === img.id : img.isPrimary;
                  return (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => setHeroId(img.id)}
                      aria-label={`View image${img.isPrimary ? ' (primary)' : ''}`}
                      style={{ padding: 0, border: active ? '2px solid var(--blue)' : '1px solid var(--lgrey)', borderRadius: 6, cursor: 'pointer', background: 'none', lineHeight: 0 }}
                    >
                      <img src={galleryImageSrc(p.id, img.id)} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 5 }} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className={s.mbody}>
            <div className={s.mft}>{p.therapeuticArea}{p.category ? ` · ${p.category}` : ''}<TierBadge tier={p.tier} /></div>
            <h1 id="pp-modal-title">{p.name}</h1>
            <div className={s.msub}>
              {p.tagline}<br />{p.subsidiary}{p.type ? ` · ${p.type}` : ''}
            </div>
            <div className={s.chips}><MarketChips p={p} /></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
              <button
                type="button"
                onClick={copyLink}
                aria-label="Copy a shareable link to this product"
                style={{
                  cursor: 'pointer', minHeight: 40,
                  fontSize: 12, padding: '4px 10px', borderRadius: 6,
                  border: '1px solid var(--line, #d0d5dd)', background: 'transparent',
                  color: 'inherit',
                }}
              >
                {copied ? '✓ Link copied' : '🔗 Copy link'}
              </button>
              {onEdit && (
                <button type="button" className={s.ebtn} data-testid="edit-product"
                  style={{ fontSize: 13 }} onClick={onEdit}>
                  Edit
                </button>
              )}
            </div>
          </div>
        </div>
        <div className={s.body}>
          {hasOverview && (
            <div className={s.sec}>
              <h2>Overview</h2>
              {p.overview && <p style={{ fontSize: 14 }}>{p.overview}</p>}
              {feats.length > 0 && <ul className={s.feat}>{feats.map((f, i) => <li key={i}>{f}</li>)}</ul>}
            </div>
          )}
          {hasDetail && (
            <div className={s.sec}>
              <div className={s.g2}>
                <div className={s.kv}>
                  {p.indication && (<><div className="l">Indication</div><div className="v">{p.indication}</div></>)}
                </div>
                <div className={s.kv}>
                  {p.patientPopulation && (<><div className="l">Patient population</div><div className="v">{p.patientPopulation}</div></>)}
                  {specs.length > 0 && (
                    <>
                      <div className="l">Specifications</div>
                      <div className={s.spec}>
                        {specs.map((sp, i) => <span key={i}><b>{sp.k}:</b> {sp.v}</span>)}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className={s.sec}>
            <h2>Regulatory status by market</h2>
            <table className={s.tbl} style={{ maxWidth: 360 }}>
              <tbody>
                {REGIONS.map((r) => {
                  const st = statusOf(p, r);
                  return (
                    <tr key={r}>
                      <td style={{ fontWeight: 500 }}>{r}</td>
                      <td><Chip label={STATUS_META[st].label} status={st} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {p.regNotes && <div className={s.note}>{p.regNotes}</div>}
          </div>
          {p.trials.length > 0 && (
            <div className={s.sec}>
              <h2>Key clinical evidence</h2>
              {/* Own horizontal-scroll context: the ancestor .modal is overflow:hidden,
                  so without this a wide trials table clips its Design/Result cells with
                  no way to reach them on a phone. */}
              <div style={{ overflowX: 'auto' }}>
                <table className={s.tbl} style={{ minWidth: 520 }}>
                  <thead>
                    <tr>
                      <th>Trial</th><th>Identifier</th>
                      <th style={{ textAlign: 'center' }}>N</th><th>Design</th><th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.trials.map((t, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 500, color: 'var(--blue)' }}>{t.trial}</td>
                        <td style={{ color: 'var(--grey)', whiteSpace: 'nowrap' }}>{t.identifier}</td>
                        <td style={{ textAlign: 'center' }}>{t.n}</td>
                        <td>{t.design}</td>
                        <td>{t.result}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CatalogPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [fr, setFr] = useState<string | null>(null);
  const [sub, setSub] = useState<string | null>(null);
  const [mk, setMk] = useState<string | null>(null);
  const [cat, setCat] = useState<string>('');
  const [q, setQ] = useState('');
  // Initial open product comes from ?product=<slug> (canonical deep-link IN).
  // Done in the state initializer, not an effect, so there's no setState-in-
  // effect; the modal only renders once products load, so no hydration mismatch.
  const [openId, setOpenId] = useState<string | null>(
    () => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('product')),
  );

  const isAdmin = !!user && (user.role === 'product_admin' || user.role === 'superuser' || !!user.isSuperuser);
  const [editState, setEditState] = useState<{ mode: 'create' | 'edit'; initial?: ProductInput & { slug: string; images?: GalleryImage[] } } | null>(null);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [loading, user, router]);

  const loadProducts = useCallback(
    () => api<{ products: Product[] }>('/api/products')
      .then((d) => setProducts(d.products))
      .catch(() => setLoadError(true)),
    [],
  );

  useEffect(() => { if (user) loadProducts(); }, [user, loadProducts]);

  // Canonical deep-link OUT — reflect the open product in the URL (so a refresh
  // or a copied link reopens it) and keep <link rel="canonical"> in sync. Uses
  // replaceState (no history spam) and never triggers a navigation.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (openId) url.searchParams.set('product', openId);
    else        url.searchParams.delete('product');
    window.history.replaceState(null, '', url);

    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
    link.href = openId ? `${url.origin}/?product=${openId}` : `${url.origin}/`;
  }, [openId]);

  const areas = useMemo(() => orderedAreas(products ?? []), [products]);
  const cats = useMemo(() => [...new Set((products ?? []).map((p) => p.category).filter(Boolean))].sort(), [products]);
  // Subsidiaries grouped under their therapeutic area (a subsidiary spanning two
  // TAs appears under both — expected). Drives the Subsidiary accordion so the 27
  // subsidiaries browse as ~10 collapsible sections instead of one flat pill wall.
  const subsByArea = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    for (const p of products ?? []) {
      (m[p.therapeuticArea] ??= new Set()).add(p.subsidiary);
    }
    const out: Record<string, string[]> = {};
    for (const a of Object.keys(m)) out[a] = [...m[a]].sort();
    return out;
  }, [products]);
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const toggleArea = (a: string) =>
    setExpandedAreas((prev) => { const n = new Set(prev); n.has(a) ? n.delete(a) : n.add(a); return n; });
  // A section renders open if the user expanded it, OR it's the selected TA, OR it
  // holds the selected subsidiary (so the active pill is always visible).
  const areaOpen = (a: string) => expandedAreas.has(a) || fr === a || (!!sub && (subsByArea[a] ?? []).includes(sub));
  const countBy = useCallback(
    (key: keyof Product, v: string) => (products ?? []).filter((p) => p[key] === v).length,
    [products],
  );

  const filtered = useMemo(
    () => filterProducts(products ?? [], { area: fr, subsidiary: sub, category: cat, market: mk, query: q }),
    [products, fr, sub, mk, cat, q],
  );

  const hasFilters = !!(fr || sub || mk || cat || q);
  const clearAll = () => { setFr(null); setSub(null); setMk(null); setCat(''); setQ(''); };
  const opened = openId ? (filtered.find((p) => p.id === openId) ?? products?.find((p) => p.id === openId)) : null;

  if (loading || !user) return null;

  return (
    <div className={s.page}>
      <div className={s.top}>
        <div className={s.tb}>
          <img className={s.logo} src="/products/logo.jpg" alt="MicroPort" />
          <span className={s.pp}>ProductPort</span>
          <div className={s.sw}>
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
            <input
              data-testid="catalog-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search products, indications, types…"
              aria-label="Search products"
            />
          </div>
          <span className={s.status}>
            <span className={s.gdot} />
            <span>{products ? `${products.length} products` : 'Loading…'}</span>
          </span>
          <span className={s.conf}>For Internal Use Only</span>
          {isAdmin && (
            <button type="button" className={s.btn} data-testid="add-product" onClick={() => setEditState({ mode: 'create' })}>
              + Add product
            </button>
          )}
          {isAdmin && <ImportCsvButton onDone={loadProducts} />}
          {isAdmin && (
            <a className={s.btn} href="/api/products/export.csv" data-testid="export-csv" style={{ textDecoration: 'none' }}>
              Export CSV
            </a>
          )}
          <a className={s.hublink} href="https://hub.microport.com">← Hub</a>
        </div>
      </div>

      <div className={s.wrap}>
        {loadError ? (
          <div className={s.center}>Could not load the catalog. Please refresh.</div>
        ) : !products ? (
          <div className={s.center}>Loading catalog…</div>
        ) : (
          <>
            <div className={s.bar}>
              <span className={s.lbl}>Therapeutic area</span>
              <span className={s.pillrow}>
                {areas.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={`${s.pill} ${fr === a ? s.pillOn : ''}`}
                    onClick={() => setFr(fr === a ? null : a)}
                  >
                    {a}<span className={s.pcount}>{countBy('therapeuticArea', a)}</span>
                  </button>
                ))}
              </span>
            </div>
            <div className={s.accWrap}>
              <span className={s.lbl}>Subsidiary</span>
              <div className={s.acc}>
                {areas.map((a) => {
                  const list = subsByArea[a] ?? [];
                  if (!list.length) return null;
                  const open = areaOpen(a);
                  return (
                    <div key={a} className={s.accSec}>
                      <button type="button" className={s.accHead} aria-expanded={open} onClick={() => toggleArea(a)}>
                        <span className={s.accChev} data-open={open || undefined} aria-hidden="true">▸</span>
                        <span className={s.accName}>{a}</span>
                        <span className={s.pcount}>{list.length}</span>
                      </button>
                      {open && (
                        <span className={`${s.pillrow} ${s.accBody}`}>
                          {list.map((sb) => (
                            <button
                              key={sb}
                              type="button"
                              className={`${s.pill} ${sub === sb ? s.pillOn : ''}`}
                              onClick={() => setSub(sub === sb ? null : sb)}
                            >
                              {sb.replace('MicroPort ', '')}<span className={s.pcount}>{countBy('subsidiary', sb)}</span>
                            </button>
                          ))}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className={s.bar}>
              <span className={s.lbl}>Regulatory</span>
              <span className={s.pillrow}>
                {REGIONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`${s.pill} ${mk === r ? s.pillOn : ''}`}
                    onClick={() => setMk(mk === r ? null : r)}
                  >
                    {r}
                  </button>
                ))}
              </span>
              <span className={s.legend}>
                <Chip label="Cleared" status="APPROVED" />
                <Chip label="In progress" status="IN_PROGRESS" />
                <Chip label="Submitted" status="SUBMITTED" />
              </span>
            </div>
            <div className={s.bar}>
              <span className={s.lbl}>Category</span>
              <select className={s.sel} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
                <option value="">All categories</option>
                {cats.map((c) => <option key={c} value={c}>{c} ({countBy('category', c)})</option>)}
              </select>
              {hasFilters && (
                <button type="button" className={`${s.btn} ${s.clearbtn}`} onClick={clearAll}>Clear filters</button>
              )}
            </div>

            <div className={s.count} data-testid="catalog-count">
              {filtered.length} shown · {products.length} in catalog
            </div>

            <div className={s.grid}>
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={s.card}
                  data-testid={`product-card-${p.id}`}
                  onClick={() => setOpenId(p.id)}
                >
                  <div className={s.cimg}><ProductImg p={p} thumb /></div>
                  <div className={s.cb}>
                    <div className={s.ftag}>{p.therapeuticArea}<TierBadge tier={p.tier} /></div>
                    <div className={s.cn}>{p.name}</div>
                    <div className={s.ct}>{p.tagline}</div>
                    <div className={s.cs}>{p.subsidiary}{p.category ? ` · ${p.category}` : ''}</div>
                    <div className={s.chips}><MarketChips p={p} /></div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className={s.foot}>
        © 2026 MicroPort Scientific Corporation. All rights reserved.<br />
        Confidential · For internal use only
      </div>

      {opened && (
        <DetailModal
          p={opened}
          onClose={() => setOpenId(null)}
          onEdit={isAdmin ? () => setEditState({ mode: 'edit', initial: toInput(opened) }) : undefined}
        />
      )}

      {editState && (
        <ProductEditModal
          mode={editState.mode}
          initial={editState.initial}
          onClose={() => setEditState(null)}
          onSaved={async () => {
            const wasEdit = editState.mode === 'edit';
            setEditState(null);
            if (wasEdit) setOpenId(null); // a rename/delete would leave a stale detail open
            await loadProducts();
          }}
        />
      )}
    </div>
  );
}

// Map a shaped catalog Product to the editor's input shape (id === slug).
// Carries the gallery so the editor can manage it without a separate fetch.
function toInput(p: Product): ProductInput & { slug: string; images?: GalleryImage[] } {
  return {
    slug: p.id, name: p.name, subsidiary: p.subsidiary, therapeuticArea: p.therapeuticArea,
    category: p.category || null, type: p.type || null, tagline: p.tagline || null, overview: p.overview || null,
    features: p.features || null, indication: p.indication || null, patientPopulation: p.patientPopulation || null,
    specs: p.specs || null, regNotes: p.regNotes || null, image: p.image || null,
    businessSegment: p.businessSegment || null, applicableDepartments: p.applicableDepartments || null,
    modelNumbers: p.modelNumbers || null, developmentStatus: p.developmentStatus || null,
    tier: p.tier, classification: p.classification, status: p.status, images: p.images,
  };
}
