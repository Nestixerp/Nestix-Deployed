/**
 * BodyDiagram — interactive front/back human body for injury marking.
 *
 * Uses the company's official QMSF 19 anatomy reference image as the
 * background. Users click anywhere on a body to drop a numbered marker tagged
 * with the currently-selected injury code (A/Bl/Bu/C/D/F/L/P/S/T). Side
 * (front vs back) is auto-detected from the click x-coordinate.
 *
 * Markers are stored as: { side: 'front'|'back', x: %, y: %, code, note }
 *
 * Props:
 *   value     Array of markers
 *   onChange  (markers) => void
 *   readOnly  Disables clicks (used in view-only contexts)
 */
import React, { useState } from 'react';

export const INJURY_CODES = [
  { code: 'A',  label: 'abrasion' },
  { code: 'Bl', label: 'bleeding' },
  { code: 'Bu', label: 'burns' },
  { code: 'C',  label: 'contusion' },
  { code: 'D',  label: 'deformity' },
  { code: 'F',  label: 'fracture' },
  { code: 'L',  label: 'laceration' },
  { code: 'P',  label: 'pain' },
  { code: 'S',  label: 'swelling' },
  { code: 'T',  label: 'tenderness' },
];

/**
 * Reference image layout (approximate, measured from the user's QMSF 19 form):
 *   - Legend column:     x =  0% – 28%
 *   - Front silhouette:  x = 28% – 62%  (center ~46%)
 *   - Back silhouette:   x = 62% – 98%  (center ~80%)
 * Anything left of LEGEND_END is ignored (so accidental clicks on the legend
 * don't drop stray markers). Otherwise FRONT_BACK_SPLIT decides side.
 */
const IMG_SRC = '/assets/injury_body_ref.png';
const LEGEND_END = 26;        // % — clicks below this x are treated as legend
const FRONT_BACK_SPLIT = 62;  // % — divides the front and back silhouettes

const BodyDiagram = ({ value = [], onChange, readOnly = false }) => {
  const [code, setCode] = useState('P');

  const handleImgClick = (e) => {
    if (readOnly || !onChange) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    if (xPct < LEGEND_END) return; // clicked on the legend — ignore
    const side = xPct < FRONT_BACK_SPLIT ? 'front' : 'back';
    onChange([...value, { side, x: xPct, y: yPct, code, note: '' }]);
  };

  const removeMarker = (idx) => {
    if (readOnly) return;
    onChange?.(value.filter((_, i) => i !== idx));
  };

  const clearAll = () => {
    if (readOnly) return;
    if (window.confirm('Remove all markers?')) onChange?.([]);
  };

  return (
    <div className="border border-slate-300 rounded-md p-3 bg-white" data-testid="body-diagram">
      {/* Code picker (active injury code) */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs font-semibold text-slate-700 mr-1">Active code:</span>
        {INJURY_CODES.map((c) => (
          <button
            type="button"
            key={c.code}
            disabled={readOnly}
            onClick={() => setCode(c.code)}
            data-testid={`code-${c.code}`}
            className={`px-2 py-1 rounded text-xs border ${
              code === c.code
                ? 'bg-red-600 text-white border-red-600'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            } ${readOnly ? 'cursor-default opacity-90' : ''}`}
          >
            <span className="font-bold mr-1">{c.code}</span>
            <span className="capitalize">{c.label}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Body diagram with markers overlay */}
        <div
          onClick={handleImgClick}
          style={{
            position: 'relative',
            display: 'inline-block',
            cursor: readOnly ? 'default' : 'crosshair',
            lineHeight: 0,
            userSelect: 'none',
          }}
          data-testid="body-diagram-image"
        >
          <img
            src={IMG_SRC}
            alt="Body diagram (front and back)"
            draggable={false}
            style={{ display: 'block', maxWidth: '100%', width: 520, height: 'auto', pointerEvents: 'none' }}
          />
          {value.map((m, i) => (
            <div
              key={i}
              title={`${m.code}${m.note ? `: ${m.note}` : ''} — ${m.side}`}
              style={{
                position: 'absolute',
                left: `calc(${m.x}% - 13px)`,
                top: `calc(${m.y}% - 13px)`,
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: '#dc2626',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid #fff',
                boxShadow: '0 1px 3px rgba(0,0,0,.5)',
                pointerEvents: 'none',
              }}
            >{m.code}</div>
          ))}
        </div>

        {/* Marker list */}
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center justify-between mb-1">
            <div className="font-semibold text-slate-700 text-xs">Markers ({value.length})</div>
            {!readOnly && value.length > 0 && (
              <button type="button" onClick={clearAll} className="text-xs text-red-600 hover:underline" data-testid="clear-markers">Clear all</button>
            )}
          </div>
          {value.length === 0 ? (
            <div className="text-xs text-slate-500 italic">Pick a code above, then click the body to mark the injury location.</div>
          ) : (
            <ol className="space-y-1 text-xs max-h-72 overflow-auto pr-1">
              {value.map((m, i) => (
                <li key={i} className="flex items-center gap-2 border border-slate-200 rounded px-2 py-1">
                  <span className="inline-block w-7 text-center font-bold text-red-600">{m.code}</span>
                  <span className="text-slate-600 capitalize">{m.side}</span>
                  <span className="text-slate-400">({m.x.toFixed(0)}, {m.y.toFixed(0)})</span>
                  {!readOnly && (
                    <button type="button" onClick={() => removeMarker(i)} className="ml-auto text-slate-400 hover:text-red-600" title="Remove">×</button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
};

export default BodyDiagram;

/**
 * Render body diagram as HTML for the print template — uses the same
 * reference image with marker dots overlaid at the saved percentages.
 * Absolute URL is preferred so the print window (about:blank) can still
 * resolve the asset.
 */
export const renderBodyDiagramHtml = (markers = []) => {
  const safe = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
  const origin = (typeof window !== 'undefined') ? window.location.origin : '';
  const dots = (markers || []).map((m) =>
    `<div style="position:absolute;left:calc(${m.x}% - 9px);top:calc(${m.y}% - 9px);width:18px;height:18px;border-radius:50%;background:#dc2626;color:#fff;font-size:9pt;font-weight:700;display:flex;align-items:center;justify-content:center;border:1.5px solid #fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${safe(m.code)}</div>`
  ).join('');
  return `<div style="position:relative;display:inline-block;line-height:0;">
    <img src="${origin}${IMG_SRC}" style="display:block;width:280px;height:auto;" alt="Body diagram" />
    ${dots}
  </div>`;
};
