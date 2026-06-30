'use client';
/* eslint-disable @next/next/no-img-element -- product photos are small static
   assets served from /public; next/image optimization is unwanted overhead here
   and would change the MVP's contain-fit layout. */

// ProductPort catalog — the Viewer surface (PRD §6). A faithful React port of
// the standalone MVP: load the whole (small) catalog once, then search / filter
// / detail entirely in memory. Every authenticated employee is a viewer.
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { statusOf, orderedAreas, filterProducts } from '@/lib/catalogFilter';
import s from './catalog.module.css';

type ClearanceStatus = 'APPROVED' | 'IN_PROGRESS' | 'SUBMITTED' | 'NOT_APPROVED' | 'NONE';

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
  clearances: Clearance[];
  trials: Trial[];
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
const thumbSrc = (p: Product) => (p.image ? `/products/thumbs/${p.image.replace(/\.(jpe?g|png)$/i, '.webp')}` : null);
const fullSrc = (p: Product) => (p.image ? `/products/${p.image}` : null);
const splitList = (v: string) => (v || '').split('|').map((x) => x.trim()).filter(Boolean);

function Chip({ label, status }: { label: string; status: ClearanceStatus }) {
  const m = STATUS_META[status];
  return <span className={s.chip} style={{ background: m.bg, color: m.fg }}>{label}</span>;
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

function DetailModal({ p, onClose }: { p: Product; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const feats = splitList(p.features);
  const specs = splitList(p.specs).map((line) => {
    const i = line.indexOf(':');
    return { k: i < 0 ? line : line.slice(0, i).trim(), v: i < 0 ? '' : line.slice(i + 1).trim() };
  });
  const hasOverview = !!(p.overview || feats.length);
  const hasDetail = !!(p.indication || p.patientPopulation || specs.length);

  return (
    <div className={s.ov} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="pp-modal-title">
        <button className={s.x} onClick={onClose} aria-label="Close">&times;</button>
        <div className={s.mhead}>
          <div className={s.mimg}><ProductImg p={p} /></div>
          <div className={s.mbody}>
            <div className={s.mft}>{p.therapeuticArea}{p.category ? ` · ${p.category}` : ''}</div>
            <h1 id="pp-modal-title">{p.name}</h1>
            <div className={s.msub}>
              {p.tagline}<br />{p.subsidiary}{p.type ? ` · ${p.type}` : ''}
            </div>
            <div className={s.chips}><MarketChips p={p} /></div>
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
              <table className={s.tbl}>
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
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    api<{ products: Product[] }>('/api/products')
      .then((d) => { if (alive) setProducts(d.products); })
      .catch(() => { if (alive) setLoadError(true); });
    return () => { alive = false; };
  }, [user]);

  const areas = useMemo(() => orderedAreas(products ?? []), [products]);
  const subs = useMemo(() => [...new Set((products ?? []).map((p) => p.subsidiary))].sort(), [products]);
  const cats = useMemo(() => [...new Set((products ?? []).map((p) => p.category).filter(Boolean))].sort(), [products]);
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
            <div className={s.bar}>
              <span className={s.lbl}>Subsidiary</span>
              <span className={s.pillrow}>
                {subs.map((sb) => (
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
                    <div className={s.ftag}>{p.therapeuticArea}</div>
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

      {opened && <DetailModal p={opened} onClose={() => setOpenId(null)} />}
    </div>
  );
}
