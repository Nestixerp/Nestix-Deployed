import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { Save, ArrowLeft, Printer, Trash2, Plus, ChevronUp, ChevronDown, Settings2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import {
  buildDocControlFooter,
  buildPrintFooterCss,
  buildPrintBodyOpen,
  buildPrintBodyClose,
  getControlledDocumentByModule,
} from '../utils/documentControl';

const COMPLETED_OPTIONS = ['', 'Yes', 'No', 'Ongoing', 'N/A'];

const newItem = (factory = '') => ({
  id: crypto.randomUUID(),
  factory, description: '', action_by_whom: '', action_when: '', completed: '',
});

const newSection = (title = '') => ({
  id: crypto.randomUUID(),
  title,
  items: [newItem()],   // start with a single empty row; user adds more as needed
  notes: '',
});

const emptyMeeting = (defaults = {}) => ({
  date: new Date().toISOString().slice(0, 10),
  company_name: 'ULTIMATE LASER PTY. LTD.',
  attendees: defaults.attendees || [],
  apologies: '',
  objectives: defaults.objectives || [],
  carryover_items: [],
  sections: [newSection(`HOUSEKEEPING AUDIT ${new Date().toLocaleDateString('en-GB')}`)],
  next_meeting: 'TBA',
});

const completedColor = (status) => {
  const s = (status || '').toLowerCase();
  if (s === 'yes') return 'bg-green-100 text-green-800';
  if (s === 'no') return 'bg-red-100 text-red-800';
  if (s === 'ongoing') return 'bg-amber-100 text-amber-800';
  if (s === 'n/a') return 'bg-slate-200 text-slate-700';
  return 'bg-white';
};

/** Factory/Location dropdown that always preserves the current value even
 *  if it isn't in the active locations list (e.g. legacy data). */
const FactorySelect = ({ value, onChange, testId, locations }) => {
  const opts = [...locations];
  if (value && !opts.includes(value)) opts.unshift(value);
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-8 w-full rounded-md border border-input bg-transparent px-1 py-0 text-xs"
      data-testid={testId}
    >
      <option value="">—</option>
      {opts.map((f) => <option key={f} value={f}>{f}</option>)}
    </select>
  );
};

export default function OHSMeetingForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const carryOnLoad = searchParams.get('carry') === '1';
  const isNew = !id || id === 'new';

  const [form, setForm] = useState(emptyMeeting());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recordId, setRecordId] = useState(null);
  const [loadingCarry, setLoadingCarry] = useState(false);
  const [locations, setLocations] = useState([]);
  const [locDialogOpen, setLocDialogOpen] = useState(false);
  const [locDraft, setLocDraft] = useState('');
  const [phrases, setPhrases] = useState({ description: [], action_by_whom: [], action_when: [] });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [defaultsRes, phrasesRes] = await Promise.all([
          api.get('/ohs-meetings/defaults'),
          api.get('/ohs-meetings/phrases').catch(() => ({ data: { phrases: {} } })),
        ]);
        const defaults = defaultsRes.data || {};
        setLocations(defaults.locations || []);
        setPhrases(phrasesRes.data?.phrases || {});
        if (isNew) {
          setForm(emptyMeeting(defaults));
          if (carryOnLoad) {
            try {
              const sug = (await api.get('/ohs-meetings/carryover-suggestions')).data;
              if (sug?.items?.length) {
                setForm((f) => ({ ...f, carryover_items: sug.items }));
                toast.success(`Loaded ${sug.items.length} carry-over item(s) from previous meeting`);
              } else {
                toast.info('No outstanding items in previous meeting');
              }
            } catch { /* non-fatal */ }
          }
        } else {
          const data = (await api.get(`/ohs-meetings/${id}`)).data || {};
          if (!alive) return;
          // Make sure objectives & attendees are arrays; sections always have ids.
          const sections = (data.sections || []).map((s) => ({
            ...newSection(),
            ...s,
            items: (s.items || []).map((it) => ({ ...newItem(), ...it })),
          }));
          setForm({
            ...emptyMeeting(defaults),
            ...data,
            attendees: Array.isArray(data.attendees) ? data.attendees : (defaults.attendees || []),
            objectives: Array.isArray(data.objectives) ? data.objectives : (defaults.objectives || []),
            sections: sections.length ? sections : [newSection('HOUSEKEEPING AUDIT')],
            carryover_items: (data.carryover_items || []).map((c) => ({ ...newItem(), ...c })),
          });
          setRecordId(data.id);
        }
      } catch {
        toast.error('Failed to load meeting');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, isNew, carryOnLoad]);

  // ---- form-level ----------------------------------------------------------
  const updateField = (patch) => setForm((f) => ({ ...f, ...patch }));

  // ---- carry-over ----------------------------------------------------------
  const updateCarry = (idx, patch) =>
    setForm((f) => ({ ...f, carryover_items: f.carryover_items.map((c, i) => (i === idx ? { ...c, ...patch } : c)) }));
  const removeCarry = (idx) =>
    setForm((f) => ({ ...f, carryover_items: f.carryover_items.filter((_, i) => i !== idx) }));
  const addCarry = () =>
    setForm((f) => ({ ...f, carryover_items: [...f.carryover_items, newItem()] }));

  const loadCarryFromPrevious = async () => {
    setLoadingCarry(true);
    try {
      const sug = (await api.get('/ohs-meetings/carryover-suggestions')).data;
      if (!sug?.items?.length) { toast.info('No outstanding items'); return; }
      setForm((f) => ({ ...f, carryover_items: [...f.carryover_items, ...sug.items] }));
      toast.success(`Added ${sug.items.length} carry-over item(s)`);
    } catch { toast.error('Failed to load carry-overs'); }
    finally { setLoadingCarry(false); }
  };

  // ---- sections & items ----------------------------------------------------
  const updateSection = (sIdx, patch) =>
    setForm((f) => ({ ...f, sections: f.sections.map((s, i) => (i === sIdx ? { ...s, ...patch } : s)) }));
  const removeSection = (sIdx) => {
    if (!window.confirm('Delete this section and all its items?')) return;
    setForm((f) => ({ ...f, sections: f.sections.filter((_, i) => i !== sIdx) }));
  };
  const addSection = () =>
    setForm((f) => ({ ...f, sections: [...f.sections, newSection('NEW SECTION')] }));
  const moveSection = (sIdx, dir) =>
    setForm((f) => {
      const arr = [...f.sections];
      const target = sIdx + dir;
      if (target < 0 || target >= arr.length) return f;
      [arr[sIdx], arr[target]] = [arr[target], arr[sIdx]];
      return { ...f, sections: arr };
    });

  const updateItem = (sIdx, iIdx, patch) =>
    setForm((f) => ({
      ...f,
      sections: f.sections.map((s, si) =>
        si === sIdx ? { ...s, items: s.items.map((it, ii) => (ii === iIdx ? { ...it, ...patch } : it)) } : s
      ),
    }));
  const addItem = (sIdx) =>
    setForm((f) => ({
      ...f,
      sections: f.sections.map((s, si) => (si === sIdx ? { ...s, items: [...s.items, newItem()] } : s)),
    }));
  const removeItem = (sIdx, iIdx) =>
    setForm((f) => ({
      ...f,
      sections: f.sections.map((s, si) =>
        si === sIdx ? { ...s, items: s.items.filter((_, ii) => ii !== iIdx) } : s
      ),
    }));

  // ---- attendees / objectives ---------------------------------------------
  const updateAttendees = (val) => updateField({ attendees: val.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) });
  const updateObjectives = (val) => updateField({ objectives: val.split(/\r?\n/).map((s) => s.trimEnd()) });

  // ---- locations management -----------------------------------------------
  const openLocationsDialog = () => {
    setLocDraft((locations || []).join('\n'));
    setLocDialogOpen(true);
  };

  const saveLocations = async () => {
    const list = locDraft.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    try {
      const r = await api.put('/ohs-meetings/locations', { locations: list });
      setLocations(r.data?.locations || list);
      toast.success('Locations saved');
      setLocDialogOpen(false);
    } catch {
      toast.error('Failed to save locations');
    }
  };

  // ---- quick-fill phrases -------------------------------------------------
  const savePhrase = async (field, text) => {
    const t = (text || '').trim();
    if (!t) { toast.error('Type something first'); return; }
    try {
      await api.post('/ohs-meetings/phrases', { field, text: t });
      const r = await api.get('/ohs-meetings/phrases');
      setPhrases(r.data?.phrases || {});
      toast.success('Saved to quick fill');
    } catch {
      toast.error('Failed to save');
    }
  };

  // ---- save / print --------------------------------------------------------
  const save = async () => {
    setSaving(true);
    try {
      let saved;
      if (isNew && !recordId) {
        saved = (await api.post('/ohs-meetings', form)).data;
        setRecordId(saved.id);
        toast.success('Meeting created');
        navigate(`/safety/ohs-meetings/${saved.id}`, { replace: true });
      } else {
        saved = (await api.put(`/ohs-meetings/${recordId || id}`, form)).data;
        toast.success('Meeting saved');
      }
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const handlePrint = useCallback(async () => {
    try {
      const doc = await getControlledDocumentByModule('OHS Meeting Minutes Form', { fallback: 'OHS Meetings', docType: 'Form' });
      const footer = buildDocControlFooter(doc, {
        title: 'OHS / Environmental Minutes of Meeting', owner: 'Safety Manager',
      });
      const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[c]);
      const statusCell = (s) => {
        const u = (s || '').toUpperCase();
        let bg = '';
        if (u === 'YES') bg = 'background:#dcfce7;';
        else if (u === 'NO') bg = 'background:#fee2e2;';
        else if (u === 'ONGOING') bg = 'background:#fef9c3;';
        return `<td style="${bg}text-align:center;font-weight:600;vertical-align:top;">${u}</td>`;
      };

      // Render a single section as a sequence of rows in the central content table.
      const renderSection = (sec) => {
        const itemRows = (sec.items || []).filter((it) => it.factory || it.description || it.action_by_whom || it.action_when || it.completed).map((it) => {
          const u = (it.completed || '').toUpperCase();
          let bg = '';
          if (u === 'YES') bg = 'background:#dcfce7;';
          else if (u === 'NO') bg = 'background:#fee2e2;';
          else if (u === 'ONGOING') bg = 'background:#fef9c3;';
          return `
            <tr>
              <td class="desc">
                ${it.factory ? `<div style="font-weight:700;text-decoration:underline;">${esc(it.factory)}</div>` : ''}
                <div style="white-space:pre-wrap;">${esc(it.description)}</div>
              </td>
              <td class="whom">${esc(it.action_by_whom)}</td>
              <td class="when">${esc(it.action_when)}</td>
              <td class="status" style="${bg}">${u}</td>
            </tr>
          `;
        }).join('');
        return `
          <tr><td colspan="4" class="sec-title">${esc(sec.title)}</td></tr>
          ${itemRows || `<tr><td colspan="4" class="empty">No items.</td></tr>`}
          ${sec.notes ? `<tr><td colspan="4" class="notes">${esc(sec.notes)}</td></tr>` : ''}
        `;
      };

      // Format a YYYY-MM-DD (or any date-ish string) to DD/MM/YYYY for print.
      const fmtDate = (d) => {
        if (!d) return '';
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
        return String(d);
      };

      // Carry-over rendered as a single colspan=4 cell containing a nested
      // table so the extra Date column doesn't disturb the section rows below.
      const carryRows = (form.carryover_items || []).length === 0 ? '' : `
        <tr><td colspan="4" style="font-weight:700;text-decoration:underline;background:#fff7ed;padding:4px 6px;">ITEMS BROUGHT UP IN THE LAST MEETING (CARRIED FORWARD)</td></tr>
        <tr>
          <td colspan="4" style="padding:0;background:#fffbeb;">
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="background:#fef3c7;">
                  <th style="border:1px solid #cbd5e1;padding:2px 4px;text-align:left;width:13%;font-size:8pt;">Date</th>
                  <th style="border:1px solid #cbd5e1;padding:2px 4px;text-align:left;width:42%;font-size:8pt;">Item / Description</th>
                  <th style="border:1px solid #cbd5e1;padding:2px 4px;text-align:center;width:15%;font-size:8pt;">By Whom</th>
                  <th style="border:1px solid #cbd5e1;padding:2px 4px;text-align:center;width:15%;font-size:8pt;">By When</th>
                  <th style="border:1px solid #cbd5e1;padding:2px 4px;text-align:center;width:15%;font-size:8pt;">Completed</th>
                </tr>
              </thead>
              <tbody>
                ${form.carryover_items.map((it) => {
                  const u = (it.completed || '').toUpperCase();
                  let bg = '';
                  if (u === 'YES') bg = 'background:#dcfce7;';
                  else if (u === 'NO') bg = 'background:#fee2e2;';
                  else if (u === 'ONGOING') bg = 'background:#fef9c3;';
                  return `
                    <tr>
                      <td style="border:1px solid #cbd5e1;padding:3px 4px;vertical-align:top;white-space:nowrap;font-weight:700;">${esc(fmtDate(it.source_meeting_date))}${it.source_section_title ? `<div style="font-size:7pt;color:#64748b;font-weight:400;">${esc(it.source_section_title)}</div>` : ''}</td>
                      <td style="border:1px solid #cbd5e1;padding:3px 4px;vertical-align:top;">
                        ${it.factory ? `<div style="font-weight:700;text-decoration:underline;">${esc(it.factory)}</div>` : ''}
                        <div style="white-space:pre-wrap;">${esc(it.description)}</div>
                      </td>
                      <td style="border:1px solid #cbd5e1;padding:3px 4px;vertical-align:top;text-align:center;">${esc(it.action_by_whom)}</td>
                      <td style="border:1px solid #cbd5e1;padding:3px 4px;vertical-align:top;text-align:center;">${esc(it.action_when)}</td>
                      <td style="border:1px solid #cbd5e1;padding:3px 4px;vertical-align:top;text-align:center;font-weight:600;${bg}">${u}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </td>
        </tr>
        <tr><td colspan="4" style="border-top:2px solid #000;padding-top:2px;"></td></tr>
      `;

      const objectivesHtml = (form.objectives || []).map((o) => o ? `<div>${esc(o)}</div>` : '<div>&nbsp;</div>').join('');
      const attendeesHtml = (form.attendees || []).map((a) => `<div>${esc(a)}</div>`).join('');

      // Outer 5-column layout: Objectives | Header+Items | Whom | When | Completed
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>OHS Meeting ${esc(form.date)}</title>
<style>
  ${buildPrintFooterCss().replace('size: A4 portrait;', 'size: A4 portrait;\n    margin: 8mm 8mm 8mm 8mm;')}
  body { font-family: Calibri, Arial, sans-serif; color: #000; font-size: 9pt; }
  table.ohs { width: 100%; border-collapse: collapse; border: 1px solid #000; }
  table.ohs th, table.ohs td { border: 1px solid #000; padding: 4px 6px; font-size: 9pt; line-height: 1.3; }
  table.ohs thead th { background: #fff; font-weight: 700; text-align: center; vertical-align: middle; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  table.inner { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.inner td { border: 1px solid #000; padding: 4px 6px; font-size: 9pt; vertical-align: top; line-height: 1.35; word-wrap: break-word; }
  /* Column widths inside the colspan=4 content cell. Sum = 100% of the
     76% outer cell so the visual columns line up with the outer header. */
  table.inner td.desc   { width: 60.5%; }
  table.inner td.whom   { width: 13.2%; text-align: center; }
  table.inner td.when   { width: 13.2%; text-align: center; }
  table.inner td.status { width: 13.1%; text-align: center; font-weight: 700; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  table.inner td.sec-title { font-weight: 700; text-decoration: underline; background: #f8fafc; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  table.inner td.empty { font-style: italic; color: #64748b; }
  table.inner td.notes { white-space: pre-wrap; font-style: italic; }
  .obj-cell { vertical-align: top; font-size: 9pt; line-height: 1.35; }
  .obj-cell .label { font-weight: 700; margin-top: 6px; }
  td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>${buildPrintBodyOpen(footer)}
  <table class="ohs">
    <thead>
      <tr>
        <th style="width:24%;">OBJECTIVES</th>
        <th style="width:46%;">
          ${esc(form.company_name || 'ULTIMATE LASER PTY. LTD.')}<br/>
          OHS / ENVIRONMENTAL MINUTES OF MEETING – DATE: ${esc(form.date)}
        </th>
        <th style="width:10%;">ACTION BY WHOM.</th>
        <th style="width:10%;">ACTION BY WHEN</th>
        <th style="width:10%;">COMPLETED YES/NO</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="obj-cell">
          ${objectivesHtml}
          <div class="label">Attendees:</div>
          ${attendeesHtml}
          ${form.apologies ? `<div class="label">Apologies:</div><div style="white-space:pre-wrap;">${esc(form.apologies)}</div>` : ''}
          <div class="label">Next meeting date:</div>
          <div>${esc(form.next_meeting || 'TBA')}</div>
        </td>
        <td colspan="4" style="vertical-align:top;padding:0;">
          <table class="inner">
            ${carryRows}
            ${(form.sections || []).map(renderSection).join('')}
          </table>
        </td>
      </tr>
    </tbody>
  </table>
  ${buildPrintBodyClose()}
</body></html>`;

      const w = window.open('', '_blank', 'width=1200,height=1400');
      if (!w) { toast.error('Pop-up blocked'); return; }
      w.document.write(html);
      w.document.close();
      setTimeout(() => { w.focus(); w.print(); }, 400);
    } catch (e) {
      toast.error('Print failed');
    }
  }, [form]);

  if (loading) return <div className="py-10 text-center text-slate-500">Loading...</div>;

  return (
    <div className="space-y-5 p-1" data-testid="ohs-meeting-form">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate('/safety/ohs-meetings')} data-testid="back-btn">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">OHS / Environmental Meeting</h1>
            <p className="text-xs text-slate-500">QMSF 25 — Issue 2 (June 2023)</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openLocationsDialog} data-testid="manage-locations-btn">
            <Settings2 className="h-4 w-4 mr-2" /> Manage Locations
          </Button>
          <Button variant="outline" onClick={handlePrint} data-testid="print-btn">
            <Printer className="h-4 w-4 mr-2" /> Print
          </Button>
          <Button onClick={save} disabled={saving} className="bg-slate-900" data-testid="save-btn">
            <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : (isNew && !recordId ? 'Create Meeting' : 'Save')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Header</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => updateField({ date: e.target.value })} data-testid="field-date" />
            </div>
            <div className="md:col-span-2">
              <Label>Company Name</Label>
              <Input value={form.company_name} onChange={(e) => updateField({ company_name: e.target.value })} />
            </div>
            <div>
              <Label>Attendees (one per line)</Label>
              <Textarea rows={6} value={(form.attendees || []).join('\n')} onChange={(e) => updateAttendees(e.target.value)} data-testid="field-attendees" />
            </div>
            <div>
              <Label>Apologies</Label>
              <Textarea rows={6} value={form.apologies} onChange={(e) => updateField({ apologies: e.target.value })} />
            </div>
            <div>
              <Label>Next Meeting</Label>
              <Input value={form.next_meeting} onChange={(e) => updateField({ next_meeting: e.target.value })} data-testid="field-next-meeting" />
            </div>
            <div className="md:col-span-3">
              <Label>Objectives (one per line — printed in the left column)</Label>
              <Textarea rows={6} value={(form.objectives || []).join('\n')} onChange={(e) => updateObjectives(e.target.value)} data-testid="field-objectives" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Carry-over from previous meeting */}
      <Card className="border-amber-300">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
              Items Brought Up in the Last Meeting (Carry-Over)
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={loadCarryFromPrevious} disabled={loadingCarry} data-testid="load-carry-btn">
                {loadingCarry ? 'Loading...' : 'Load from Previous Meeting'}
              </Button>
              <Button size="sm" variant="outline" onClick={addCarry} data-testid="add-carry-btn">
                <Plus className="h-3 w-3 mr-1" /> Add item
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {form.carryover_items.length === 0 ? (
            <p className="text-sm text-slate-500 italic">
              No carry-over items. Click <strong>Load from Previous Meeting</strong> to bring across any
              open actions from the last recorded meeting and review whether they were completed.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border border-slate-300">
                <thead className="bg-amber-50 text-slate-700">
                  <tr>
                    <th className="text-left px-2 py-1 border w-[11%]">Date</th>
                    <th className="text-left px-2 py-1 border w-[12%]">Factory</th>
                    <th className="text-left px-2 py-1 border w-[36%]">Item / Description</th>
                    <th className="text-left px-2 py-1 border w-[12%]">By Whom</th>
                    <th className="text-left px-2 py-1 border w-[12%]">By When</th>
                    <th className="text-left px-2 py-1 border w-[11%]">Completed</th>
                    <th className="text-right px-2 py-1 border w-[6%]">—</th>
                  </tr>
                </thead>
                <tbody>
                  {form.carryover_items.map((c, i) => (
                    <tr key={c.id || i} className="border-t">
                      <td className="px-1 py-1 border align-top">
                        <Input
                          type="date"
                          value={c.source_meeting_date || ''}
                          onChange={(e) => updateCarry(i, { source_meeting_date: e.target.value })}
                          className="text-xs"
                          data-testid={`carry-date-${i}`}
                        />
                        {c.source_section_title && (
                          <div className="text-[10px] text-slate-500 mt-0.5">{c.source_section_title}</div>
                        )}
                      </td>
                      <td className="px-1 py-1 border align-top">
                        <FactorySelect value={c.factory} onChange={(v) => updateCarry(i, { factory: v })} testId={`carry-factory-${i}`} locations={locations} />
                      </td>
                      <td className="px-1 py-1 border align-top">
                        <Textarea rows={2} value={c.description || ''} onChange={(e) => updateCarry(i, { description: e.target.value })} className="text-xs min-h-[36px]" data-testid={`carry-desc-${i}`} />
                      </td>
                      <td className="px-1 py-1 border align-top">
                        <Input
                          list={`carry-whom-list-${i}`}
                          value={c.action_by_whom || ''}
                          onChange={(e) => updateCarry(i, { action_by_whom: e.target.value })}
                          className="text-xs"
                        />
                        <datalist id={`carry-whom-list-${i}`}>
                          {(phrases.action_by_whom || []).map((p, pi) => <option key={pi} value={p.text} />)}
                        </datalist>
                      </td>
                      <td className="px-1 py-1 border align-top">
                        <Input
                          list={`carry-when-list-${i}`}
                          value={c.action_when || ''}
                          onChange={(e) => updateCarry(i, { action_when: e.target.value })}
                          className="text-xs"
                        />
                        <datalist id={`carry-when-list-${i}`}>
                          {(phrases.action_when || []).map((p, pi) => <option key={pi} value={p.text} />)}
                        </datalist>
                      </td>
                      <td className={`px-1 py-1 border align-top ${completedColor(c.completed)}`}>
                        <select
                          className="flex h-8 w-full rounded-md border border-input bg-transparent px-1 py-0 text-xs font-semibold"
                          value={c.completed || ''}
                          onChange={(e) => updateCarry(i, { completed: e.target.value })}
                          data-testid={`carry-completed-${i}`}
                        >
                          {COMPLETED_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt || '—'}</option>)}
                        </select>
                      </td>
                      <td className="px-1 py-1 border align-top text-right">
                        <button type="button" onClick={() => removeCarry(i)} className="text-slate-400 hover:text-red-600" title="Remove">
                          <Trash2 className="h-3 w-3 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sections */}
      {form.sections.map((sec, sIdx) => (
        <Card key={sec.id} data-testid={`section-${sIdx}`}>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <Input
                value={sec.title}
                onChange={(e) => updateSection(sIdx, { title: e.target.value })}
                className="text-base font-bold sm:max-w-md"
                placeholder="Section title (e.g. HOUSEKEEPING AUDIT 16/1/2025)"
                data-testid={`section-title-${sIdx}`}
              />
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => moveSection(sIdx, -1)} title="Move up"><ChevronUp className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => moveSection(sIdx, 1)} title="Move down"><ChevronDown className="h-4 w-4" /></Button>
                <Button size="sm" variant="outline" onClick={() => addItem(sIdx)} data-testid={`add-item-${sIdx}`}>
                  <Plus className="h-3 w-3 mr-1" /> Add row
                </Button>
                <Button size="sm" variant="ghost" onClick={() => removeSection(sIdx)} title="Delete section">
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border border-slate-300">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="text-left px-2 py-1 border w-[14%]">Factory / Area</th>
                    <th className="text-left px-2 py-1 border w-[42%]">Description</th>
                    <th className="text-left px-2 py-1 border w-[13%]">Action by Whom</th>
                    <th className="text-left px-2 py-1 border w-[13%]">Action by When</th>
                    <th className="text-left px-2 py-1 border w-[12%]">Completed</th>
                    <th className="text-right px-2 py-1 border w-[6%]">—</th>
                  </tr>
                </thead>
                <tbody>
                  {sec.items.map((it, iIdx) => (
                    <tr key={it.id || iIdx} className="border-t">
                      <td className="px-1 py-1 border align-top">
                        <FactorySelect value={it.factory} onChange={(v) => updateItem(sIdx, iIdx, { factory: v })} testId={`item-factory-${sIdx}-${iIdx}`} locations={locations} />
                      </td>
                      <td className="px-1 py-1 border align-top">
                        {(phrases.description || []).length > 0 && (
                          <select
                            className="h-6 w-full mb-1 rounded border border-slate-300 bg-slate-50 px-1 text-[11px] text-slate-700"
                            value=""
                            onChange={(e) => { if (e.target.value) updateItem(sIdx, iIdx, { description: e.target.value }); e.target.value = ''; }}
                            data-testid={`qf-desc-${sIdx}-${iIdx}`}
                            title="Pick from saved descriptions"
                          >
                            <option value="">⌄ Quick fill...</option>
                            {phrases.description.map((p, pi) => (
                              <option key={pi} value={p.text}>
                                {p.text.length > 80 ? p.text.slice(0, 77) + '...' : p.text}{p.count > 0 ? ` (×${p.count})` : ''}
                              </option>
                            ))}
                          </select>
                        )}
                        <Textarea rows={2} value={it.description || ''} onChange={(e) => updateItem(sIdx, iIdx, { description: e.target.value })} className="text-xs min-h-[36px]" data-testid={`item-desc-${sIdx}-${iIdx}`} />
                        {it.description && it.description.trim().length >= 3 && (
                          <button type="button" onClick={() => savePhrase('description', it.description)} className="mt-0.5 text-[10px] text-blue-600 hover:underline" data-testid={`save-desc-${sIdx}-${iIdx}`}>
                            + Save as quick fill
                          </button>
                        )}
                      </td>
                      <td className="px-1 py-1 border align-top">
                        <Input
                          list={`whom-list-${sIdx}-${iIdx}`}
                          value={it.action_by_whom || ''}
                          onChange={(e) => updateItem(sIdx, iIdx, { action_by_whom: e.target.value })}
                          className="text-xs"
                          data-testid={`item-whom-${sIdx}-${iIdx}`}
                        />
                        <datalist id={`whom-list-${sIdx}-${iIdx}`}>
                          {(phrases.action_by_whom || []).map((p, pi) => <option key={pi} value={p.text} />)}
                        </datalist>
                      </td>
                      <td className="px-1 py-1 border align-top">
                        <Input
                          list={`when-list-${sIdx}-${iIdx}`}
                          value={it.action_when || ''}
                          onChange={(e) => updateItem(sIdx, iIdx, { action_when: e.target.value })}
                          className="text-xs"
                          placeholder="ASAP / OCT / 2024-10-01"
                          data-testid={`item-when-${sIdx}-${iIdx}`}
                        />
                        <datalist id={`when-list-${sIdx}-${iIdx}`}>
                          {(phrases.action_when || []).map((p, pi) => <option key={pi} value={p.text} />)}
                        </datalist>
                      </td>
                      <td className={`px-1 py-1 border align-top ${completedColor(it.completed)}`}>
                        <select
                          className="flex h-8 w-full rounded-md border border-input bg-transparent px-1 py-0 text-xs font-semibold"
                          value={it.completed || ''}
                          onChange={(e) => updateItem(sIdx, iIdx, { completed: e.target.value })}
                          data-testid={`item-completed-${sIdx}-${iIdx}`}
                        >
                          {COMPLETED_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt || '—'}</option>)}
                        </select>
                      </td>
                      <td className="px-1 py-1 border align-top text-right">
                        <button type="button" onClick={() => removeItem(sIdx, iIdx)} className="text-slate-400 hover:text-red-600" title="Remove">
                          <Trash2 className="h-3 w-3 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3">
              <Label className="text-xs">Section notes (printed after the items — e.g. &ldquo;No injuries reported&rdquo;)</Label>
              <Textarea rows={2} value={sec.notes || ''} onChange={(e) => updateSection(sIdx, { notes: e.target.value })} className="text-xs" />
            </div>
          </CardContent>
        </Card>
      ))}

      <div>
        <Button variant="outline" onClick={addSection} data-testid="add-section-btn">
          <Plus className="h-4 w-4 mr-2" /> Add Section
        </Button>
      </div>

      {/* Manage Locations dialog — lets each customer maintain their own list
          of Factories / Buildings / Workstations etc. */}
      <Dialog open={locDialogOpen} onOpenChange={setLocDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Locations</DialogTitle>
            <DialogDescription>
              One per line. Add as many Factories, Buildings, Workstations, or other
              areas as you need. The list appears in every Factory / Area dropdown
              on this form.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={locDraft}
            onChange={(e) => setLocDraft(e.target.value)}
            rows={10}
            className="font-mono text-sm"
            data-testid="locations-textarea"
            placeholder="Factory 1&#10;Factory 2&#10;Office Building&#10;Workstation A"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setLocDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveLocations} className="bg-slate-900" data-testid="locations-save-btn">Save Locations</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
