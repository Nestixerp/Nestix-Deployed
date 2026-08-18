/**
 * Document Control helpers
 *
 * Provides utilities for pulling the current Form No / Issue / Revision Date
 * for a given module from the central Document Control register, so every
 * printed form can carry an audit-compliant footer (ISO/QMS requirement).
 */

import api from '../services/api';
import { formatDate } from './dateFormatter';

let _cache = null;
let _cacheAt = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute

let _companySettings = null;
let _settingsAt = 0;
const SETTINGS_TTL_MS = 5 * 60 * 1000; // 5 minutes — logos change rarely

/**
 * Fetch and cache the company settings (logo, name, address, ABN, etc.).
 * Used to put a company-branded header on every printed document.
 */
export const fetchCompanySettings = async () => {
  const now = Date.now();
  if (_companySettings && (now - _settingsAt) < SETTINGS_TTL_MS) return _companySettings;
  try {
    const res = await api.get('/settings/');
    _companySettings = res.data || {};
    _settingsAt = now;
  } catch (e) {
    _companySettings = {};
    _settingsAt = now;
  }
  return _companySettings;
};

export const invalidateCompanySettingsCache = () => {
  _companySettings = null;
  _settingsAt = 0;
};

/**
 * Fetch and cache the full Document Control register.
 */
export const fetchControlledDocuments = async () => {
  const now = Date.now();
  if (_cache && (now - _cacheAt) < CACHE_TTL_MS) return _cache;
  try {
    const res = await api.get('/document-control');
    _cache = Array.isArray(res.data) ? res.data : [];
    _cacheAt = now;
  } catch (e) {
    _cache = [];
    _cacheAt = now;
  }
  return _cache;
};

/**
 * Find the controlled document entry whose related_module matches the given
 * module name (case/space-insensitive contains match). Also matches against
 * title and form_no as a fallback.
 */
export const findControlledDocument = (items, moduleName) => {
  if (!items || !moduleName) return null;
  const needle = String(moduleName).toLowerCase().replace(/[^a-z0-9]/g, '');
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // Strongest: exact form_no match (preferred when caller passes a form number)
  const byFormExact = items.find((it) => norm(it.form_no) === needle);
  if (byFormExact) return byFormExact;
  // Next: related_module contains the needle (or vice-versa)
  const byRelated = items.find((it) => {
    const r = norm(it.related_module);
    return r && (r.includes(needle) || needle.includes(r));
  });
  if (byRelated) return byRelated;
  // Fallback: match title
  const byTitle = items.find((it) => {
    const t = norm(it.title);
    return t && (t.includes(needle) || needle.includes(t));
  });
  return byTitle || null;
};

/**
 * Look up by EXACT form_no first; if not found, fall back to module name.
 * Use this when the caller has a concrete form number (e.g. from a campaign).
 */
export const findByFormNoOrModule = (items, formNo, moduleName) => {
  if (formNo) {
    const byForm = findControlledDocument(items, formNo);
    if (byForm) return byForm;
  }
  if (moduleName) return findControlledDocument(items, moduleName);
  return null;
};

/**
 * Convenience: fetch + find in one call.
 */
export const getControlledDocument = async (moduleName) => {
  const [items] = await Promise.all([
    fetchControlledDocuments(),
    fetchCompanySettings(), // warm the cache so buildPrintBodyOpen() has the logo
  ]);
  return findControlledDocument(items, moduleName);
};

/**
 * Convenience: fetch then find by form_no first, falling back to module name.
 */
export const getControlledDocumentByFormOrModule = async (formNo, moduleName) => {
  const [items] = await Promise.all([
    fetchControlledDocuments(),
    fetchCompanySettings(), // warm the cache so buildPrintBodyOpen() has the logo
  ]);
  return findByFormNoOrModule(items, formNo, moduleName);
};

/**
 * STRICT registry-driven lookup. Matches ONLY against `related_module` field
 * (case/punctuation-insensitive exact match). This is the preferred lookup
 * for all print flows: the module file declares a single canonical key
 * (e.g. "JSA Form" or "JSA Register") and the Document Control register
 * is the single source of truth for form_no / issue / revision_date / title.
 *
 * If no entry is found, returns null — caller should render dashes in the
 * footer so user knows the registry needs updating.
 */
export const findByModuleStrict = (items, moduleKey) => {
  if (!items || !moduleKey) return null;
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const needle = norm(moduleKey);
  return items.find((it) => norm(it.related_module) === needle) || null;
};

/**
 * SMART lookup: tries exact match on the new canonical module key first
 * (e.g. "JSA Form"), and if not found, falls back to a legacy single-name
 * key (e.g. "JSA") — disambiguating by `doc_type` ("Form" / "Register").
 *
 * This makes existing Document Control entries created against the OLD
 * single-entry dropdown (where "JSA" matched both Register & Form) still
 * resolve correctly after the registry was split into separate entries.
 *
 * opts: { fallback?: string, docType?: 'Form' | 'Register' }
 */
export const findByModuleSmart = (items, primaryKey, opts = {}) => {
  if (!items) return null;
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // 1. Strict match on the canonical key
  if (primaryKey) {
    const p = norm(primaryKey);
    const hit = items.find((it) => norm(it.related_module) === p);
    if (hit) return hit;
  }
  // 2. Legacy single-name fallback
  const fb = norm(opts.fallback || '');
  if (fb) {
    const candidates = items.filter((it) => norm(it.related_module) === fb);
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      if (opts.docType) {
        const dt = String(opts.docType).toLowerCase();
        const typed = candidates.find((it) => String(it.doc_type || '').toLowerCase() === dt);
        if (typed) return typed;
      }
      return candidates[0];
    }
  }
  return null;
};

export const getControlledDocumentByModule = async (primaryKey, opts) => {
  const [items] = await Promise.all([
    fetchControlledDocuments(),
    fetchCompanySettings(),
  ]);
  return findByModuleSmart(items, primaryKey, opts && typeof opts === 'object' ? opts : {});
};

/**
 * Force-refresh the cache (call after Document Control edits so the next
 * print pulls the latest revision_date/issue values).
 */
export const invalidateDocControlCache = () => {
  _cache = null;
  _cacheAt = 0;
};

/**
 * Build a Document Control footer object with sensible defaults so printable
 * forms never end up empty if the registry hasn't been populated yet.
 *
 * Returns an object with stringified, escape-safe values:
 *   { form_no, issue, revision_date, title, owner }
 */
export const buildDocControlFooter = (doc, defaults = {}) => {
  const d = doc || {};
  return {
    form_no: d.form_no || defaults.form_no || '',
    issue: d.issue || defaults.issue || '1',
    revision_date: d.revision_date ? formatDate(d.revision_date) : (defaults.revision_date || ''),
    title: d.title || defaults.title || '',
    owner: d.owner || defaults.owner || ''
  };
};

const _esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[c]);

/**
 * CSS block to embed in any print window for a Document Control footer that
 * actually prints on every page across all major browsers.
 *
 * Uses position: fixed (Chrome/Edge/Safari/Firefox all repeat fixed elements
 * on every printed page) instead of @page margin-boxes (which require the
 * user to disable browser-default headers/footers in the print dialog).
 *
 * The page number, however, IS injected via @page @bottom-right because that
 * is the only way to access counter(page) / counter(pages).
 *
 * IMPORTANT: footer is positioned at bottom: 6mm (not 0) because most printers
 * have an unprintable hardware margin of ~5-10mm at the page edge — anchoring
 * at 0 would clip half the footer text.
 */
/**
 * CSS block + footer HTML for audit-compliant print output.
 *
 * Strategy: Chrome's `position: fixed` does NOT reliably reserve vertical space
 * during pagination — content can overlap the fixed footer band on long tables.
 * Instead, we wrap the printable body content in a single-cell table whose
 * <tfoot> contains the Document Control footer. <tfoot> with
 * display: table-footer-group is the only mechanism browsers consistently
 * honour for repeating page footers AND reserving space.
 *
 * Page numbers are still injected via @page @bottom-right because counter(page)
 * only works in @page margin boxes.
 *
 * Usage in a print template:
 *   <style>${buildPrintFooterCss()}</style>
 *   <body>${buildPrintBodyWrapper(innerHtml, footer)}</body>
 *
 * The legacy buildPrintFooterHtml() is kept for templates that haven't been
 * migrated yet — it still works visually (just may overlap on long tables).
 */
export const buildPrintFooterCss = () => `
  @page {
    size: A4 portrait;
    margin: 12mm 12mm 12mm 12mm;
    @bottom-right {
      content: "Page " counter(page) " of " counter(pages);
      font-family: Calibri, Arial, sans-serif;
      font-size: 8pt;
      color: #222;
    }
  }
  html, body { margin: 0; padding: 0; }
  body { font-family: Calibri, Arial, sans-serif; }

  /* Page-flow table: wraps the entire printable body. The <tfoot> repeats on
     every printed page AND reserves the vertical space it needs, so content
     can never overlap into the footer band. */
  table.dc-page-flow { width: 100%; border-collapse: collapse; }
  table.dc-page-flow > thead { display: table-header-group; }
  table.dc-page-flow > tfoot { display: table-footer-group; }
  table.dc-page-flow > thead > tr > td,
  table.dc-page-flow > tbody > tr > td,
  table.dc-page-flow > tfoot > tr > td { border: 0; padding: 0; }

  /* Company-branded header: logo top-left, company info top-right.
     Sits inside the <thead> so it repeats on every printed page. */
  .dc-print-header {
    width: 100%;
    border-bottom: 0.8px solid #bbb;
    padding-bottom: 2mm;
    margin-bottom: 3mm;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8mm;
  }
  .dc-print-header .dc-left { flex-shrink: 0; }
  .dc-print-header .dc-right {
    flex: 1; text-align: right;
    font-family: Calibri, Arial, sans-serif;
    font-size: 8.5pt; color: #222; line-height: 1.35;
  }
  .dc-print-header .dc-co-name { font-size: 11pt; font-weight: 700; color: #111; margin-bottom: 1mm; }
  .dc-print-header .dc-co-tag { font-size: 8.5pt; font-style: italic; color: #555; margin-bottom: 1mm; }
  .dc-print-logo {
    max-height: 18mm; max-width: 50mm; object-fit: contain;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  .dc-print-footer {
    width: 100%;
    border-top: 1.2px solid #111;
    margin-top: 4mm;
    padding: 2.5mm 0 0 0;
    font-family: Calibri, Arial, sans-serif;
    font-size: 8pt;
    line-height: 1.3;
    color: #111;
    background: #fff;
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .dc-print-footer .dc-left { flex: 1; min-width: 0; }
  .dc-print-footer .dc-right { white-space: nowrap; color: #555; }
  .dc-print-footer strong { color: #000; }

  @media print {
    .dc-print-footer { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    /* Avoid splitting individual table rows across pages */
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    table.dc-page-flow > tbody table thead { display: table-header-group; }
  }
`;

/**
 * Render the Document Control footer as raw HTML (just the styled div). Use
 * this when you want to embed the footer inside your own <tfoot><tr><td>
 * structure, or as a one-shot footer at the end of body content.
 *
 * For the bulletproof "footer repeats on every page" behaviour, wrap your
 * body content using buildPrintBodyWrapper() instead.
 */
/**
 * Build the print HEADER (logo + company info on every page) as an HTML string.
 * Called by buildPrintBodyOpen() when company settings are supplied.
 *
 * @param company  Object from fetchCompanySettings()
 * @param footer   Optional footer object — used to pull the form title onto the header right column
 */
export const buildPrintHeaderHtml = (company, footer = null) => {
  const c = company || {};
  const f = footer || {};
  const logoHtml = c.company_logo_url
    ? `<img src="${c.company_logo_url}" alt="logo" class="dc-print-logo" />`
    : '';
  // Field name compat: settings model uses company_* prefix; alt keys supported
  const abn = c.company_abn || c.abn || '';
  const email = c.company_email || c.email || '';
  const phone = c.company_phone || c.phone || '';
  const website = c.company_website || c.website || '';
  const right = [
    c.company_name ? `<div class="dc-co-name">${_esc(c.company_name)}</div>` : '',
    c.company_tagline ? `<div class="dc-co-tag">${_esc(c.company_tagline)}</div>` : '',
    [c.street_address, c.suburb, c.state, c.postcode].filter(Boolean).map(_esc).join(', '),
    [phone ? `T ${_esc(phone)}` : '', email ? _esc(email) : '', website ? _esc(website) : ''].filter(Boolean).join(' &nbsp;·&nbsp; '),
    abn ? `<strong>ABN</strong> ${_esc(abn)}` : '',
  ].filter(Boolean).join('<br/>');
  return `<div class="dc-print-header">
    <div class="dc-left">${logoHtml}</div>
    <div class="dc-right">${right}</div>
  </div>`;
};

export const buildPrintFooterHtml = (footer, extraRight = '') => {
  const f = footer || {};
  const left = [
    `<strong>Form No:</strong> ${_esc(f.form_no) || '—'}`,
    `<strong>Issue:</strong> ${_esc(f.issue) || '—'}`,
    `<strong>Revision Date:</strong> ${_esc(f.revision_date) || '—'}`,
    f.owner ? `<strong>Owner:</strong> ${_esc(f.owner)}` : null,
    f.title ? `<strong>Title:</strong> ${_esc(f.title)}` : null,
  ].filter(Boolean).join('  &nbsp;|&nbsp;  ');
  return `<div class="dc-print-footer">
    <div class="dc-left">${left}</div>
    <div class="dc-right">${_esc(extraRight)}</div>
  </div>`;
};

/**
 * Wrap your printable body content in a page-flow table whose <tfoot>
 * carries the Document Control footer. This is the BULLETPROOF pattern:
 * <tfoot> with display: table-footer-group truly reserves space and
 * repeats on every printed page — no content overlap on long tables.
 *
 * @param innerHtml  HTML string containing the body of the document
 * @param footer     Object from buildDocControlFooter()
 * @returns HTML string ready to drop straight inside <body>...</body>
 */
export const buildPrintBodyWrapper = (innerHtml, footer) => {
  const company = _companySettings || {};
  const headerHtml = (company.company_logo_url || company.company_name)
    ? `<thead><tr><td>${buildPrintHeaderHtml(company, footer)}</td></tr></thead>` : '';
  return `<table class="dc-page-flow">
    ${headerHtml}
    <tfoot><tr><td>${buildPrintFooterHtml(footer, '')}</td></tr></tfoot>
    <tbody><tr><td>${innerHtml}</td></tr></tbody>
  </table>`;
};

/**
 * Pair of helpers for templates that build their body content imperatively
 * (template literals). Open at the start of <body>, close at the end.
 * The footer object is captured at open-time and rendered in <tfoot>.
 *
 *   <body>
 *     ${buildPrintBodyOpen(footer)}
 *       ... your content ...
 *     ${buildPrintBodyClose()}
 *   </body>
 */
export const buildPrintBodyOpen = (footer) => {
  const company = _companySettings || {};
  const headerHtml = (company.company_logo_url || company.company_name)
    ? `<thead><tr><td>${buildPrintHeaderHtml(company, footer)}</td></tr></thead>` : '';
  return `<table class="dc-page-flow">
    ${headerHtml}
    <tfoot><tr><td>${buildPrintFooterHtml(footer, '')}</td></tr></tfoot>
    <tbody><tr><td>`;
};

export const buildPrintBodyClose = () => `</td></tr></tbody></table>`;

/**
 * Render the Document Control footer as an HTML string suitable for
 * embedding into a print window. Designed to sit at the bottom of every
 * page via CSS @page bottom margin boxes or as an in-body footer block.
 */
export const renderDocControlFooterHtml = (footer) => {
  const f = footer || {};
  const safe = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
  return `<div class="doc-control-footer">
    <span><strong>Form No:</strong> ${safe(f.form_no) || '—'}</span>
    <span><strong>Issue:</strong> ${safe(f.issue) || '—'}</span>
    <span><strong>Revision Date:</strong> ${safe(f.revision_date) || '—'}</span>
    ${f.owner ? `<span><strong>Owner:</strong> ${safe(f.owner)}</span>` : ''}
  </div>`;
};

/**
 * Standard CSS block for print-window Document Control header/footer.
 * Pair with `renderDocControlFooterHtml`.
 */
export const docControlPrintCss = `
  .doc-control-footer {
    width: 100%;
    border-top: 1px solid #000;
    padding-top: 4px;
    margin-top: 14px;
    font-size: 8.5pt;
    color: #111;
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-family: Calibri, Arial, sans-serif;
  }
  .doc-control-footer span { white-space: nowrap; }
`;
