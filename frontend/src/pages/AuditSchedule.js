import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Plus, Save, Trash2, Copy, Printer, GripVertical, Star, StarOff, Palette, X as XIcon,
} from 'lucide-react';
import api from '../services/api';
import {
  getControlledDocumentByModule,
  buildDocControlFooter,
  buildPrintFooterCss,
  buildPrintBodyOpen,
  buildPrintBodyClose,
} from '../utils/documentControl';
import { formatDate } from '../utils/dateFormatter';

const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_LABELS = ['Jan', 'Feb', 'March', 'April', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

const MODULE_NAME = 'ISO Audit Schedule';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

// ---- helpers ----------------------------------------------------------------

// Pick black/white text colour for best contrast against a hex bg.
const textOn = (hex) => {
  if (!hex || hex.length < 7) return '#fff';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Standard luminance threshold
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#111' : '#fff';
};

// Resolve a raw cell value (either category id or legacy char) to a category object.
const resolveCell = (value, categories) => {
  if (!value) return null;
  const direct = categories.find((c) => c.id === value);
  if (direct) return direct;
  // legacy: match against legacy_chars (case-sensitive then insensitive)
  const v = String(value);
  const byChar = categories.find((c) => (c.legacy_chars || []).includes(v));
  if (byChar) return byChar;
  const lc = v.toLowerCase();
  return categories.find((c) => (c.legacy_chars || []).some((ch) => String(ch).toLowerCase() === lc)) || null;
};

// ---- Category Editor component ---------------------------------------------

const CategoryEditor = ({ open, categories, setCategories, onClose, onSave }) => {
  if (!open) return null;
  const updateCat = (idx, patch) => {
    setCategories((cs) => cs.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };
  const addCat = () => {
    setCategories((cs) => [
      ...cs,
      { id: `tmp-${Date.now()}`, name: 'New Category', short: '', color: '#16a34a', legacy_chars: [], order: cs.length },
    ]);
  };
  const removeCat = (idx) => {
    if (!window.confirm('Delete this category? Existing cells using it will appear blank until re-marked.')) return;
    setCategories((cs) => cs.filter((_, i) => i !== idx));
  };
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="audit-categories-modal">
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            <span>Manage Audit Categories</span>
            <Button variant="ghost" size="sm" onClick={onClose}><XIcon className="w-4 h-4" /></Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-gray-500">
            Categories are <strong>shared across all years</strong>. Each cell on the schedule stores a reference to
            one of these. Add a new auditing body anytime (e.g. a different accreditation body) — pick its colour and
            a short label to display on the matrix.
          </p>

          <div className="space-y-2">
            {categories.map((c, i) => (
              <div key={c.id || i} className="flex flex-wrap items-center gap-2 border rounded p-2" data-testid={`cat-row-${i}`}>
                <input
                  type="color"
                  value={c.color || '#2563eb'}
                  onChange={(e) => updateCat(i, { color: e.target.value })}
                  className="w-10 h-10 rounded border cursor-pointer"
                  data-testid={`cat-color-${i}`}
                />
                <div className="flex-1 min-w-[180px]">
                  <Label className="text-xs text-gray-500">Name</Label>
                  <Input
                    value={c.name}
                    onChange={(e) => updateCat(i, { name: e.target.value })}
                    data-testid={`cat-name-${i}`}
                  />
                </div>
                <div className="w-28">
                  <Label className="text-xs text-gray-500">Short label</Label>
                  <Input
                    value={c.short}
                    maxLength={8}
                    onChange={(e) => updateCat(i, { short: e.target.value })}
                    data-testid={`cat-short-${i}`}
                  />
                </div>
                <div className="flex-1 min-w-[160px]">
                  <Label className="text-xs text-gray-500">Legacy text marks (comma-sep)</Label>
                  <Input
                    value={(c.legacy_chars || []).join(',')}
                    placeholder="e.g. X  or  C,O,M,P,A,S"
                    onChange={(e) => updateCat(i, {
                      legacy_chars: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    })}
                    data-testid={`cat-legacy-${i}`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeCat(i)}
                  className="text-gray-400 hover:text-red-600 mt-5"
                  title="Delete category"
                  data-testid={`cat-delete-${i}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={addCat} data-testid="cat-add">
              <Plus className="w-4 h-4 mr-1" /> Add Category
            </Button>
            <Button onClick={onSave} className="flex-1" data-testid="cat-save">
              <Save className="w-4 h-4 mr-2" /> Save Categories
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ---- Cell popover -----------------------------------------------------------

const CellPopover = ({ categories, current, onPick, onClose, anchorRect }) => {
  // Position the popover so it doesn't overflow viewport.
  const style = anchorRect
    ? {
        position: 'fixed',
        top: Math.min(anchorRect.bottom + 4, window.innerHeight - 220),
        left: Math.min(anchorRect.left, window.innerWidth - 240),
        zIndex: 60,
      }
    : { display: 'none' };
  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div
        className="bg-white border rounded shadow-lg p-2 w-56"
        style={style}
        data-testid="cell-popover"
      >
        <div className="text-xs text-gray-500 mb-2">Mark cell as…</div>
        <div className="space-y-1 max-h-56 overflow-y-auto">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:opacity-90 ${current === c.id ? 'ring-2 ring-offset-1 ring-gray-700' : ''}`}
              style={{ background: c.color, color: textOn(c.color) }}
              data-testid={`popover-pick-${c.short || c.id}`}
            >
              <span className="font-bold text-xs">{c.short || '•'}</span>
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onPick('')}
          className="mt-2 w-full text-xs text-gray-600 border rounded px-2 py-1 hover:bg-gray-100"
          data-testid="popover-clear"
        >
          Clear cell
        </button>
      </div>
    </>
  );
};

// ---- Main page --------------------------------------------------------------

const AuditSchedule = () => {
  const currentYear = new Date().getFullYear();
  const [years, setYears] = useState([]);
  const [year, setYear] = useState(currentYear);
  const [schedule, setSchedule] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newYear, setNewYear] = useState('');
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [dupFrom, setDupFrom] = useState(currentYear);
  const [dupTo, setDupTo] = useState(currentYear + 1);
  const [showCategories, setShowCategories] = useState(false);
  const [draftCategories, setDraftCategories] = useState([]);
  const [popoverCell, setPopoverCell] = useState(null);  // {elIdx, month, anchorRect}

  useEffect(() => {
    fetchYears();
  }, []);

  useEffect(() => {
    if (year) fetchSchedule(year);
  }, [year]);

  const fetchYears = async () => {
    try {
      const res = await api.get('/audit-schedule/years');
      setYears(res.data.years || []);
    } catch (e) { console.error(e); }
  };

  const fetchSchedule = async (yr) => {
    setLoading(true);
    try {
      const res = await api.get(`/audit-schedule/${yr}`);
      setSchedule(res.data);
      setCategories(res.data.categories || []);
      if (!years.includes(yr)) fetchYears();
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const updateCell = (elementIdx, monthKey, value) => {
    setSchedule((s) => {
      const copy = { ...s, elements: s.elements.map((e) => ({ ...e, cells: { ...e.cells } })) };
      copy.elements[elementIdx].cells[monthKey] = value;
      return copy;
    });
  };

  const updateName = (idx, value) => {
    setSchedule((s) => {
      const copy = { ...s, elements: [...s.elements] };
      copy.elements[idx] = { ...copy.elements[idx], name: value };
      return copy;
    });
  };

  const togglePriority = (idx) => {
    setSchedule((s) => {
      const copy = { ...s, elements: [...s.elements] };
      copy.elements[idx] = { ...copy.elements[idx], priority: !copy.elements[idx].priority };
      return copy;
    });
  };

  const addElement = () => {
    setSchedule((s) => {
      const cells = MONTH_KEYS.reduce((acc, m) => ((acc[m] = ''), acc), {});
      return {
        ...s,
        elements: [
          ...s.elements,
          { id: `tmp-${Date.now()}`, name: 'New Element', priority: false, order: s.elements?.length || 0, cells },
        ],
      };
    });
  };

  const removeElement = (idx) => {
    if (!window.confirm('Delete this element?')) return;
    setSchedule((s) => ({ ...s, elements: s.elements.filter((_, i) => i !== idx) }));
  };

  const moveElement = (idx, delta) => {
    setSchedule((s) => {
      const next = [...s.elements];
      const dst = idx + delta;
      if (dst < 0 || dst >= next.length) return s;
      [next[idx], next[dst]] = [next[dst], next[idx]];
      return { ...s, elements: next.map((e, i) => ({ ...e, order: i })) };
    });
  };

  const save = async () => {
    if (!schedule) return;
    setSaving(true);
    try {
      const payload = {
        title: schedule.title,
        company: schedule.company,
        elements: schedule.elements.map((e, i) => ({
          id: e.id, name: e.name, priority: !!e.priority, order: i, cells: e.cells,
        })),
        signed_by: schedule.signed_by || '',
        signed_date: schedule.signed_date || '',
      };
      const res = await api.put(`/audit-schedule/${year}`, payload);
      setSchedule(res.data);
      setCategories(res.data.categories || []);
      fetchYears();
    } catch (e) {
      console.error(e); alert('Failed to save');
    } finally { setSaving(false); }
  };

  const addYear = () => {
    const yr = parseInt(newYear);
    if (!yr || yr < 2000 || yr > 2100) return alert('Enter a valid year');
    setNewYear('');
    setYear(yr);
  };

  const duplicateYear = async () => {
    if (!dupFrom || !dupTo || dupFrom === dupTo) return alert('Pick distinct from/to years');
    try {
      await api.post(`/audit-schedule/${dupFrom}/duplicate-to/${dupTo}`);
      setShowDuplicate(false);
      await fetchYears();
      setYear(dupTo);
    } catch (e) {
      const msg = e?.response?.data?.detail || 'Failed to duplicate';
      alert(msg);
    }
  };

  // -- Categories editor --
  const openCategoryEditor = () => {
    setDraftCategories(categories.map((c, i) => ({ ...c, order: i })));
    setShowCategories(true);
  };
  const saveCategories = async () => {
    try {
      const res = await api.put('/audit-schedule/categories', { categories: draftCategories });
      setCategories(res.data.categories || []);
      setShowCategories(false);
    } catch (e) {
      console.error(e); alert('Failed to save categories');
    }
  };

  // -- Print --
  const handlePrint = async () => {
    if (!schedule) return;
    try {
      const doc = await getControlledDocumentByModule(MODULE_NAME, { fallback: 'Audit Schedule', docType: 'Form' });
      const footer = buildDocControlFooter(doc, {
        title: 'Internal Audit Schedule',
      });

      const rows = schedule.elements.map((el) => {
        const cells = MONTH_KEYS.map((m) => {
          const raw = el.cells?.[m] || '';
          const cat = resolveCell(raw, categories);
          if (cat) {
            return `<td class="cell" style="background:${esc(cat.color)};color:${textOn(cat.color)};"><span class="lbl">${esc(cat.short || '')}</span></td>`;
          }
          // unmatched / orphan id → blank cell
          return `<td class="cell"></td>`;
        }).join('');
        const nameHtml = `<strong>${esc(el.name)}</strong>${el.priority ? ' <span class="pri">*</span>' : ''}`;
        return `<tr><td class="el">${nameHtml}</td>${cells}</tr>`;
      }).join('');

      const headerCols = MONTH_LABELS.map((m) => `<th>${esc(m)}</th>`).join('');

      const legendItems = categories.map((c) => (
        `<span class="leg-item"><span class="sw" style="background:${esc(c.color)};color:${textOn(c.color)};">${esc(c.short || '·')}</span> ${esc(c.name)}</span>`
      )).join('');

      const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<title>${esc(schedule.title)}</title>
<style>
  ${buildPrintFooterCss()}
  body { color: #111; font-size: 10pt; }
  .head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6mm; }
  .head h1 { font-size: 14pt; margin: 0; }
  .head .co { font-size: 13pt; font-weight: bold; letter-spacing: 1px; }
  table.sched { width: 100%; border-collapse: collapse; }
  table.sched th, table.sched td { border: 1px solid #111; padding: 4px 5px; font-size: 9pt; vertical-align: middle; }
  table.sched th { background: #f3f4f6; text-align: left; }
  table.sched td.el { width: 30%; }
  table.sched td.cell { text-align: center; min-width: 20px; font-weight: bold; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table.sched td.cell .lbl { font-size: 8pt; letter-spacing: 0.4px; }
  .pri { color: #b91c1c; font-weight: 900; }
  .legend { margin-top: 4mm; font-size: 8.5pt; color: #333; display: flex; flex-wrap: wrap; gap: 8px 18px; }
  .leg-item { display: inline-flex; align-items: center; gap: 4px; }
  .leg-item .sw { display: inline-block; min-width: 26px; padding: 0 6px; text-align: center; font-weight: bold; border-radius: 3px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .priority-note { margin-top: 2mm; font-size: 8.5pt; color: #444; }
  .sign { margin-top: 10mm; display: flex; gap: 20mm; font-size: 10pt; }
  .sign .line { border-bottom: 1px solid #111; min-width: 70mm; display: inline-block; padding-bottom: 1px; }
</style></head>
<body>
${buildPrintBodyOpen(footer)}
  <div class="head">
    <h1>${esc(schedule.title)}</h1>
    <div class="co">${esc(schedule.company || '')}</div>
  </div>
  <table class="sched">
    <thead>
      <tr><th>Element</th>${headerCols}</tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="legend">${legendItems}</div>
  <div class="priority-note"><span class="pri">*</span> Priority</div>
  <div class="sign">
    <div><strong>Signed</strong> <span class="line">${esc(schedule.signed_by || '')}</span></div>
    <div><strong>Date:</strong> ${esc(schedule.signed_date ? formatDate(schedule.signed_date) : '')}</div>
  </div>
${buildPrintBodyClose()}
</body></html>`;

      const w = window.open('', '_blank');
      if (!w) return;
      w.document.open();
      w.document.write(html);
      w.document.close();
      setTimeout(() => {
        try { w.focus(); w.print(); } catch (_) { /* blocked */ }
      }, 250);
    } catch (e) {
      console.error(e); alert('Failed to print');
    }
  };

  const elements = schedule?.elements || [];

  const yearOptions = useMemo(() => {
    const set = new Set(years);
    set.add(year);
    return Array.from(set).sort((a, b) => b - a);
  }, [years, year]);

  return (
    <div className="p-6 space-y-6" data-testid="audit-schedule-page">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Internal Audit Schedule</h1>
          <p className="text-gray-600 mt-1">
            Annual audit plan — elements × 12 months. Click any cell to mark it with a colour-coded audit category.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs text-gray-500">Year</Label>
            <select
              className="border rounded px-3 py-2 text-sm"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              data-testid="audit-year-select"
            >
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-1">
            <div>
              <Label className="text-xs text-gray-500">New Year</Label>
              <Input
                type="number" min="2000" max="2100"
                value={newYear} onChange={(e) => setNewYear(e.target.value)}
                placeholder={String(currentYear + 1)} className="w-24"
                data-testid="audit-new-year-input"
              />
            </div>
            <Button variant="outline" onClick={addYear} data-testid="audit-add-year">
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
          <Button variant="outline" onClick={() => { setDupFrom(year); setDupTo(year + 1); setShowDuplicate(true); }} data-testid="audit-duplicate-btn">
            <Copy className="w-4 h-4 mr-1" /> Duplicate Year
          </Button>
          <Button variant="outline" onClick={openCategoryEditor} data-testid="audit-manage-categories">
            <Palette className="w-4 h-4 mr-1" /> Categories
          </Button>
          <Button onClick={save} disabled={saving} data-testid="audit-save">
            <Save className="w-4 h-4 mr-1" /> {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="outline" onClick={handlePrint} data-testid="audit-print">
            <Printer className="w-4 h-4 mr-1" /> Print / PDF
          </Button>
        </div>
      </div>

      {/* Legend / category chips */}
      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" data-testid="audit-legend">
          <span className="text-xs text-gray-500 mr-1">Legend:</span>
          {categories.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs"
              style={{ background: c.color, color: textOn(c.color) }}
            >
              <span className="font-bold">{c.short || '•'}</span>
              <span>{c.name}</span>
            </span>
          ))}
          <button
            type="button"
            onClick={openCategoryEditor}
            className="text-xs text-blue-600 hover:underline ml-1"
            data-testid="audit-edit-categories-link"
          >
            edit
          </button>
        </div>
      )}

      {loading && <div className="text-sm text-gray-500">Loading…</div>}

      {schedule && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Input
                  value={schedule.title || ''}
                  onChange={(e) => setSchedule({ ...schedule, title: e.target.value })}
                  className="text-base font-semibold w-72"
                  data-testid="audit-title-input"
                />
                <Input
                  value={schedule.company || ''}
                  onChange={(e) => setSchedule({ ...schedule, company: e.target.value })}
                  placeholder="Company"
                  className="text-base font-semibold w-56"
                  data-testid="audit-company-input"
                />
              </div>
              <Button size="sm" variant="outline" onClick={addElement} data-testid="audit-add-element">
                <Plus className="w-4 h-4 mr-1" /> Add Element
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-gray-300" data-testid="audit-matrix">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-300 px-2 py-2 text-left w-8"></th>
                    <th className="border border-gray-300 px-2 py-2 text-left" style={{ minWidth: 280 }}>Element</th>
                    {MONTH_LABELS.map((m) => (
                      <th key={m} className="border border-gray-300 px-1 py-2 text-center text-xs">{m}</th>
                    ))}
                    <th className="border border-gray-300 px-2 py-2 text-left w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {elements.map((el, idx) => (
                    <tr key={el.id} data-testid={`audit-row-${idx}`}>
                      <td className="border border-gray-300 text-center align-middle">
                        <div className="flex flex-col items-center justify-center text-gray-400">
                          <button type="button" onClick={() => moveElement(idx, -1)} className="leading-none hover:text-gray-700" title="Move up">▲</button>
                          <GripVertical className="w-3 h-3" />
                          <button type="button" onClick={() => moveElement(idx, 1)} className="leading-none hover:text-gray-700" title="Move down">▼</button>
                        </div>
                      </td>
                      <td className="border border-gray-300 px-2 py-1" style={{ minWidth: 280 }}>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => togglePriority(idx)}
                            className={el.priority ? 'text-red-600' : 'text-gray-300 hover:text-gray-500'}
                            title={el.priority ? 'Priority element — click to unmark' : 'Mark as priority'}
                            data-testid={`audit-priority-${idx}`}
                          >
                            {el.priority ? <Star className="w-4 h-4 fill-current" /> : <StarOff className="w-4 h-4" />}
                          </button>
                          <Input
                            value={el.name}
                            onChange={(e) => updateName(idx, e.target.value)}
                            className="h-8 text-sm"
                            data-testid={`audit-name-${idx}`}
                          />
                        </div>
                      </td>
                      {MONTH_KEYS.map((m) => {
                        const raw = el.cells?.[m] || '';
                        const cat = resolveCell(raw, categories);
                        return (
                          <td key={m} className="border border-gray-300 p-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setPopoverCell({ elIdx: idx, month: m, anchorRect: rect });
                              }}
                              className="w-full h-9 text-center text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-400"
                              style={cat ? { background: cat.color, color: textOn(cat.color) } : { background: '#fff', color: '#666' }}
                              data-testid={`audit-cell-${idx}-${m}`}
                            >
                              {cat ? (cat.short || '') : ''}
                            </button>
                          </td>
                        );
                      })}
                      <td className="border border-gray-300 text-center">
                        <button
                          type="button"
                          onClick={() => removeElement(idx)}
                          className="text-gray-400 hover:text-red-600"
                          title="Delete element"
                          data-testid={`audit-delete-${idx}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {elements.length === 0 && (
                    <tr><td colSpan={14} className="text-center text-gray-500 py-6">No elements — click <em>Add Element</em>.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 text-xs text-gray-600">
              <span className="text-red-600 font-bold">*</span> Priority &nbsp;|&nbsp; Click any cell to choose an audit category.
              Manage categories via the <strong>Categories</strong> button to add a new auditing body or change colours.
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
              <div>
                <Label className="text-xs text-gray-500">Signed</Label>
                <Input
                  value={schedule.signed_by || ''}
                  onChange={(e) => setSchedule({ ...schedule, signed_by: e.target.value })}
                  placeholder="Signature / name"
                  data-testid="audit-signed-by"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500">Date</Label>
                <Input
                  type="date"
                  value={schedule.signed_date || ''}
                  onChange={(e) => setSchedule({ ...schedule, signed_date: e.target.value })}
                  data-testid="audit-signed-date"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Duplicate Year dialog */}
      {showDuplicate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md" data-testid="audit-duplicate-modal">
            <CardHeader><CardTitle>Duplicate Audit Schedule</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                Clones the elements and cell marks from <strong>{dupFrom}</strong> into a new schedule for{' '}
                <strong>{dupTo}</strong>. You can then edit the dates / marks for the new year.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-500">Copy From</Label>
                  <select
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={dupFrom}
                    onChange={(e) => setDupFrom(parseInt(e.target.value))}
                    data-testid="audit-dup-from"
                  >
                    {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">New Year</Label>
                  <Input
                    type="number" min="2000" max="2100"
                    value={dupTo} onChange={(e) => setDupTo(parseInt(e.target.value))}
                    data-testid="audit-dup-to"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={duplicateYear} className="flex-1" data-testid="audit-dup-confirm">
                  <Copy className="w-4 h-4 mr-2" /> Duplicate
                </Button>
                <Button variant="outline" onClick={() => setShowDuplicate(false)} className="flex-1">Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <CategoryEditor
        open={showCategories}
        categories={draftCategories}
        setCategories={setDraftCategories}
        onClose={() => setShowCategories(false)}
        onSave={saveCategories}
      />

      {popoverCell && (
        <CellPopover
          categories={categories}
          current={schedule.elements[popoverCell.elIdx]?.cells?.[popoverCell.month] || ''}
          anchorRect={popoverCell.anchorRect}
          onClose={() => setPopoverCell(null)}
          onPick={(catId) => {
            updateCell(popoverCell.elIdx, popoverCell.month, catId);
            setPopoverCell(null);
          }}
        />
      )}
    </div>
  );
};

export default AuditSchedule;
