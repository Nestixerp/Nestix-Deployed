import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { Save, ArrowLeft, Printer, Trash2, Plus, ListChecks } from 'lucide-react';
import { AgendaEditorDialog } from '../components/AgendaEditorDialog';
import { formatDate } from '../utils/dateFormatter';
import {
  buildDocControlFooter,
  buildPrintFooterCss,
  buildPrintBodyOpen,
  buildPrintBodyClose,
  getControlledDocumentByModule,
} from '../utils/documentControl';

const COMPLETED_OPTIONS = ['', 'Yes', 'No', 'Ongoing', 'N/A'];

const emptyAction = () => ({ minutes: '', action_by_whom: '', action_when: '', completed: '' });

/**
 * Normalize a single agenda row to the new shape: each row has `actions: [{...}]`.
 * Handles legacy data where the action fields lived directly on the row.
 */
const normalizeRow = (row, agendaNo) => {
  if (Array.isArray(row?.actions) && row.actions.length > 0) {
    return { ...row, agenda_no: row.agenda_no || agendaNo, actions: row.actions.map((a) => ({ ...emptyAction(), ...a })) };
  }
  const hasLegacy = row && (row.minutes || row.action_by_whom || row.action_when || row.completed);
  return {
    agenda_no: row?.agenda_no || agendaNo,
    agenda_text: row?.agenda_text || '',
    actions: [hasLegacy
      ? {
          minutes: row.minutes || '',
          action_by_whom: row.action_by_whom || '',
          action_when: row.action_when || '',
          completed: row.completed || '',
        }
      : emptyAction()],
  };
};

const emptyMeeting = (agenda = []) => ({
  date: new Date().toISOString().slice(0, 10),
  attendees: '',
  apologies: '',
  company_name: 'ULTIMATE LASER PTY.LTD.',
  agenda_rows: agenda.map((text, i) => ({
    agenda_no: i + 1,
    agenda_text: text,
    actions: [emptyAction()],
  })),
  carryover_items: [],
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

export default function ManagementReviewForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const carryOnLoad = searchParams.get('carry') === '1';

  const isNew = !id || id === 'new';
  const [agendaTemplate, setAgendaTemplate] = useState([]);
  const [form, setForm] = useState(emptyMeeting());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recordId, setRecordId] = useState(null);
  const [loadingCarry, setLoadingCarry] = useState(false);
  const [phrases, setPhrases] = useState({}); // { "8": [{text, count}], ... }
  const [agendaEditorOpen, setAgendaEditorOpen] = useState(false);

  // Load agenda template + (when editing) the existing meeting
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [tmplRes, phrasesRes] = await Promise.all([
          api.get('/management-review/agenda-template'),
          api.get('/management-review/phrases').catch(() => ({ data: { phrases: {} } })),
        ]);
        const tmpl = tmplRes.data?.agenda || [];
        if (!alive) return;
        setAgendaTemplate(tmpl);
        setPhrases(phrasesRes.data?.phrases || {});
        if (isNew) {
          setForm(emptyMeeting(tmpl));
          // Optional auto-carry from previous meeting
          if (carryOnLoad) {
            try {
              const sug = (await api.get('/management-review/carryover-suggestions')).data;
              if (sug?.items?.length) {
                setForm((f) => ({ ...f, carryover_items: sug.items }));
                toast.success(`Loaded ${sug.items.length} carry-over item(s) from previous meeting`);
              } else {
                toast.info('No outstanding items in previous meeting');
              }
            } catch { /* non-fatal */ }
          }
        } else {
          const data = (await api.get(`/management-review/${id}`)).data || {};
          const existingRows = data.agenda_rows || [];
          // Meetings saved with an agenda_text snapshot keep their own agenda
          // (even if the template changed since). Legacy meetings map onto the
          // current template by number.
          const hasSnapshot = existingRows.some((r) => r.agenda_text);
          const rows = hasSnapshot
            ? existingRows.map((r, i) => normalizeRow(r, r.agenda_no || i + 1))
            : tmpl.map((t, i) => {
                const existing = existingRows.find((r) => r.agenda_no === i + 1);
                return { ...normalizeRow(existing, i + 1), agenda_text: t };
              });
          setForm({ ...emptyMeeting(tmpl), ...data, agenda_rows: rows, carryover_items: data.carryover_items || [] });
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

  const updateField = (patch) => setForm((f) => ({ ...f, ...patch }));

  const updateAction = (rowIdx, actionIdx, patch) =>
    setForm((f) => ({
      ...f,
      agenda_rows: f.agenda_rows.map((r, i) =>
        i === rowIdx
          ? { ...r, actions: r.actions.map((a, ai) => (ai === actionIdx ? { ...a, ...patch } : a)) }
          : r
      ),
    }));

  const addAction = (rowIdx) =>
    setForm((f) => ({
      ...f,
      agenda_rows: f.agenda_rows.map((r, i) =>
        i === rowIdx ? { ...r, actions: [...r.actions, emptyAction()] } : r
      ),
    }));

  const removeAction = (rowIdx, actionIdx) =>
    setForm((f) => ({
      ...f,
      agenda_rows: f.agenda_rows.map((r, i) => {
        if (i !== rowIdx) return r;
        // Never drop below 1 action — clear it instead.
        if (r.actions.length <= 1) return { ...r, actions: [emptyAction()] };
        return { ...r, actions: r.actions.filter((_, ai) => ai !== actionIdx) };
      }),
    }));

  const updateCarry = (idx, patch) =>
    setForm((f) => ({
      ...f,
      carryover_items: f.carryover_items.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    }));

  const addCarry = () =>
    setForm((f) => ({
      ...f,
      carryover_items: [
        ...f.carryover_items,
        { id: crypto.randomUUID(), description: '', action_by_whom: '', action_when: '', completed: '' },
      ],
    }));

  const removeCarry = (idx) =>
    setForm((f) => ({ ...f, carryover_items: f.carryover_items.filter((_, i) => i !== idx) }));

  const loadCarryFromPrevious = async () => {
    setLoadingCarry(true);
    try {
      const sug = (await api.get('/management-review/carryover-suggestions')).data;
      if (!sug?.items?.length) {
        toast.info('No outstanding items in previous meeting');
        return;
      }
      // Merge: skip ones already present (by description/source_meeting_id+source_agenda_no)
      setForm((f) => {
        const existing = new Set(
          f.carryover_items.map((c) => `${c.source_meeting_id}|${c.source_agenda_no}|${c.description}`)
        );
        const fresh = sug.items.filter(
          (s) => !existing.has(`${s.source_meeting_id}|${s.source_agenda_no}|${s.description}`)
        );
        return { ...f, carryover_items: [...f.carryover_items, ...fresh] };
      });
      toast.success(`Added ${sug.items.length} carry-over item(s)`);
    } catch {
      toast.error('Failed to load carry-overs');
    } finally {
      setLoadingCarry(false);
    }
  };

  // ---- editable agenda template -------------------------------------------
  const handleAgendaSaved = (newAgenda, mapping, applyToCurrent) => {
    setAgendaTemplate(newAgenda);
    const unsavedNew = isNew && !recordId;
    if (unsavedNew || applyToCurrent) {
      setForm((f) => ({
        ...f,
        agenda_rows: newAgenda.map((text, i) => {
          const oi = mapping[i];
          const old = oi != null ? f.agenda_rows[oi] : null;
          return { agenda_no: i + 1, agenda_text: text, actions: old?.actions || [emptyAction()] };
        }),
      }));
      if (!unsavedNew) toast.info('Agenda applied to this meeting — remember to Save');
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      let saved;
      if (isNew && !recordId) {
        saved = (await api.post('/management-review', form)).data;
        setRecordId(saved.id);
        toast.success('Meeting created');
        navigate(`/quality/management-review/${saved.id}`, { replace: true });
      } else {
        saved = (await api.put(`/management-review/${recordId || id}`, form)).data;
        toast.success('Meeting saved');
      }
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = useCallback(async () => {
    try {
      const doc = await getControlledDocumentByModule('Management Review Form', { fallback: 'Management Review', docType: 'Form' });
      const footer = buildDocControlFooter(doc, {
        title: 'Management Review Meeting', owner: 'Quality Manager',
      });
      const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[c]);
      // dd/mm/yyyy (system timezone). Empty string when no date so the cell stays blank.
      const fmt = (v) => v ? formatDate(v) : '';
      const statusCell = (s) => {
        const u = (s || '').toUpperCase();
        let bg = '';
        if (u === 'YES') bg = 'background:#dcfce7;';
        else if (u === 'NO') bg = 'background:#fee2e2;';
        else if (u === 'ONGOING') bg = 'background:#fef9c3;';
        return `<td style="${bg}text-align:center;font-weight:600;">${esc(u || '')}</td>`;
      };

      const agendaRows = (form.agenda_rows || []).map((row, i) => {
        if (row.agenda_no === 1) {
          // Render carry-over items as a nested table inside the Minutes cell.
          const carry = form.carryover_items || [];
          const carryBody = carry.length === 0
            ? `<div style="font-style:italic;color:#64748b;font-size:8pt;">No carry-over items.</div>`
            : `<table style="width:100%;border-collapse:collapse;border:1px solid #000;">
                <thead>
                  <tr style="background:#f1f5f9;">
                    <th style="border:1px solid #000;padding:2px 4px;text-align:center;width:7%;font-size:7.5pt;">#</th>
                    <th style="border:1px solid #000;padding:2px 4px;text-align:left;font-size:7.5pt;">Item / Description</th>
                    <th style="border:1px solid #000;padding:2px 4px;text-align:center;width:14%;font-size:7.5pt;">By Whom</th>
                    <th style="border:1px solid #000;padding:2px 4px;text-align:center;width:14%;font-size:7.5pt;">By When</th>
                    <th style="border:1px solid #000;padding:2px 4px;text-align:center;width:14%;font-size:7.5pt;">Completed</th>
                  </tr>
                </thead>
                <tbody>
                  ${carry.map((c, ci) => {
                    const u = (c.completed || '').toUpperCase();
                    let bg = '';
                    if (u === 'YES') bg = 'background:#dcfce7;';
                    else if (u === 'NO') bg = 'background:#fee2e2;';
                    else if (u === 'ONGOING') bg = 'background:#fef9c3;';
                    return `
                      <tr>
                        <td style="border:1px solid #000;padding:2px 4px;text-align:center;font-weight:600;">${ci + 1}</td>
                        <td style="border:1px solid #000;padding:2px 4px;white-space:pre-wrap;">${esc(c.description)}${c.source_meeting_date ? `<div style="font-size:7pt;color:#64748b;">From: ${esc(fmt(c.source_meeting_date))}${c.source_agenda_no ? ` (#${c.source_agenda_no})` : ''}</div>` : ''}</td>
                        <td style="border:1px solid #000;padding:2px 4px;text-align:center;">${esc(c.action_by_whom)}</td>
                        <td style="border:1px solid #000;padding:2px 4px;text-align:center;">${esc(c.action_when)}</td>
                        <td style="border:1px solid #000;padding:2px 4px;text-align:center;font-weight:600;${bg}">${esc(u || '')}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>`;
          return `
            <tr>
              <td style="vertical-align:top;"><strong>${row.agenda_no}.</strong> ${esc(row.agenda_text || agendaTemplate[i] || '')}</td>
              <td colspan="4" style="vertical-align:top;padding:3px 4px;">${carryBody}</td>
            </tr>
          `;
        }
        return row.actions.map((action, ai) => `
          <tr>
            ${ai === 0 ? `<td rowspan="${row.actions.length}" style="vertical-align:top;"><strong>${row.agenda_no}.</strong> ${esc(row.agenda_text || agendaTemplate[i] || '')}</td>` : ''}
            <td style="vertical-align:top;white-space:pre-wrap;">${esc(action.minutes)}</td>
            <td style="vertical-align:top;text-align:center;">${esc(action.action_by_whom)}</td>
            <td style="vertical-align:top;text-align:center;">${esc(action.action_when)}</td>
            ${statusCell(action.completed)}
          </tr>
        `).join('');
      }).join('');

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Management Review ${esc(fmt(form.date))}</title>
<style>
  ${buildPrintFooterCss().replace('size: A4 portrait;', 'size: A4 portrait;\n    margin: 10mm 9mm 10mm 9mm;')}
  body { font-family: Calibri, Arial, sans-serif; color: #000; font-size: 9pt; }
  .header-tbl { width: 100%; border-collapse: collapse; border: 1px solid #000; margin-bottom: 4px; }
  .header-tbl td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
  .header-tbl .company, .header-tbl .title { color: #0033a0; font-weight: 700; font-size: 11pt; }
  table.minutes { width: 100%; border-collapse: collapse; border: 1px solid #000; }
  table.minutes th, table.minutes td { border: 1px solid #000; padding: 3px 5px; font-size: 8.5pt; line-height: 1.3; vertical-align: top; }
  table.minutes thead th { background: #f1f5f9; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; text-align: center; }
  .section-title { font-weight: 700; margin: 8px 0 3px 0; font-size: 10pt; color: #0033a0; }
  .next-meeting { margin-top: 6px; font-weight: 700; font-size: 9.5pt; }
  td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>${buildPrintBodyOpen(footer)}
  <table class="header-tbl">
    <tr>
      <td class="company" style="width:33%;">${esc(form.company_name || 'ULTIMATE LASER PTY.LTD.')}</td>
      <td class="title" colspan="2">MANAGEMENT REVIEW MEETING AGENDA &amp; MINUTES.</td>
    </tr>
    <tr>
      <td><strong>Date:</strong> ${esc(fmt(form.date))}</td>
      <td colspan="2"><strong>Attendees:</strong> ${esc(form.attendees)}&nbsp;&nbsp;&nbsp;<strong>Apologies:</strong> ${esc(form.apologies)}</td>
    </tr>
  </table>

  <table class="minutes">
    <thead>
      <tr>
        <th style="width:26%;">AGENDA</th>
        <th style="width:42%;">MINUTES OF MEETING</th>
        <th style="width:10%;">ACTION BY WHOM</th>
        <th style="width:11%;">ACTION BY WHEN</th>
        <th style="width:11%;">COMPLETED YES/NO</th>
      </tr>
    </thead>
    <tbody>${agendaRows}</tbody>
  </table>

  <div class="next-meeting">NEXT MEETING: ${esc(form.next_meeting || 'TBA')}</div>
  ${buildPrintBodyClose()}
</body></html>`;
      const w = window.open('', '_blank', 'width=1200,height=1400');
      if (!w) { toast.error('Pop-up blocked'); return; }
      w.document.write(html);
      w.document.close();
      setTimeout(() => { w.focus(); w.print(); }, 400);
    } catch {
      toast.error('Print failed');
    }
  }, [form, agendaTemplate]);

  // ---- quick-fill phrase library -----------------------------------------
  const applyPhrase = (rowIdx, actionIdx, text) => {
    updateAction(rowIdx, actionIdx, { minutes: text });
  };

  const savePhrase = async (agendaNo, text) => {
    const t = (text || '').trim();
    if (!t) { toast.error('Type something in Minutes first'); return; }
    try {
      await api.post('/management-review/phrases', { agenda_no: agendaNo, text: t });
      // Refresh phrase library so the new entry is immediately visible.
      const r = await api.get('/management-review/phrases');
      setPhrases(r.data?.phrases || {});
      toast.success('Saved to quick fill');
    } catch {
      toast.error('Failed to save phrase');
    }
  };

  if (loading) return <div className="py-10 text-center text-slate-500">Loading...</div>;

  return (
    <div className="space-y-5 p-1" data-testid="management-review-form">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate('/quality/management-review')} data-testid="back-btn">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Management Review Meeting</h1>
            <p className="text-xs text-slate-500">QMSF 05 — Issue 2 (June 2023)</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint} data-testid="print-btn">
            <Printer className="h-4 w-4 mr-2" /> Print
          </Button>
          <Button onClick={save} disabled={saving} className="bg-slate-900" data-testid="save-btn">
            <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : (isNew && !recordId ? 'Create Meeting' : 'Save')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Meeting Header</CardTitle></CardHeader>
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
            <div className="md:col-span-2">
              <Label>Attendees</Label>
              <Input value={form.attendees} onChange={(e) => updateField({ attendees: e.target.value })} placeholder="John / Bob / Peter" data-testid="field-attendees" />
            </div>
            <div>
              <Label>Apologies</Label>
              <Input value={form.apologies} onChange={(e) => updateField({ apologies: e.target.value })} data-testid="field-apologies" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Agenda &amp; Minutes</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setAgendaEditorOpen(true)} data-testid="edit-agenda-btn">
            <ListChecks className="h-4 w-4 mr-2" /> Edit Agenda
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-slate-300">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="text-left px-2 py-1 border w-[28%]">Agenda</th>
                  <th className="text-left px-2 py-1 border w-[34%]">Minutes of Meeting</th>
                  <th className="text-left px-2 py-1 border w-[10%]">Action by Whom</th>
                  <th className="text-left px-2 py-1 border w-[11%]">Action by When</th>
                  <th className="text-left px-2 py-1 border w-[12%]">Completed</th>
                </tr>
              </thead>
              <tbody>
                {form.agenda_rows.map((row, i) => {
                  // Agenda Item #1 is special: its "Minutes" cell holds the list of
                  // carry-over items from the previous meeting, each individually
                  // tracked with its own Yes/No/Ongoing status. The parent row's
                  // by-whom / when / completed cells are folded into the cell.
                  if (row.agenda_no === 1) {
                    return (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1 border align-top text-slate-700">
                          <strong>{row.agenda_no}.</strong> {row.agenda_text || agendaTemplate[i]}
                        </td>
                        <td colSpan={4} className="px-2 py-2 border align-top">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                            <div className="text-xs text-slate-500">
                              Items carried forward from the previous meeting. Mark each off individually as actions are
                              completed.
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={loadCarryFromPrevious} disabled={loadingCarry} data-testid="load-carry-btn">
                                {loadingCarry ? 'Loading...' : 'Load from Previous Meeting'}
                              </Button>
                              <Button size="sm" variant="outline" onClick={addCarry} data-testid="add-carry-btn">
                                <Plus className="h-3 w-3 mr-1" /> Add item
                              </Button>
                            </div>
                          </div>
                          {form.carryover_items.length === 0 ? (
                            <p className="text-xs text-slate-500 italic py-2">
                              No carry-over items. Click <strong>Load from Previous Meeting</strong> to bring across any
                              open actions, or <strong>Add item</strong> to enter one manually.
                            </p>
                          ) : (
                            <table className="w-full text-xs border border-slate-300">
                              <thead className="bg-slate-50 text-slate-700">
                                <tr>
                                  <th className="text-left px-2 py-1 border w-[8%]">#</th>
                                  <th className="text-left px-2 py-1 border w-[44%]">Item / Description</th>
                                  <th className="text-left px-2 py-1 border w-[13%]">Action by Whom</th>
                                  <th className="text-left px-2 py-1 border w-[13%]">Action by When</th>
                                  <th className="text-left px-2 py-1 border w-[14%]">Completed</th>
                                  <th className="text-right px-2 py-1 border w-[8%]">—</th>
                                </tr>
                              </thead>
                              <tbody>
                                {form.carryover_items.map((c, ci) => (
                                  <tr key={c.id || ci} className="border-t">
                                    <td className="px-1 py-1 border align-top text-center text-slate-600 font-semibold">{ci + 1}</td>
                                    <td className="px-1 py-1 border align-top">
                                      <Textarea
                                        rows={2}
                                        value={c.description}
                                        onChange={(e) => updateCarry(ci, { description: e.target.value })}
                                        className="text-xs min-h-[40px]"
                                        data-testid={`carry-desc-${ci}`}
                                        placeholder="What action / item is being carried forward?"
                                      />
                                      {c.source_meeting_date && (
                                        <div className="text-[10px] text-slate-500 mt-0.5">
                                          From: {formatDate(c.source_meeting_date)}
                                          {c.source_agenda_no ? ` (Agenda #${c.source_agenda_no})` : ''}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-1 py-1 border align-top">
                                      <Input value={c.action_by_whom || ''} onChange={(e) => updateCarry(ci, { action_by_whom: e.target.value })} className="text-xs" />
                                    </td>
                                    <td className="px-1 py-1 border align-top">
                                      <Input value={c.action_when || ''} onChange={(e) => updateCarry(ci, { action_when: e.target.value })} className="text-xs" placeholder="e.g. Oct 2024" />
                                    </td>
                                    <td className={`px-1 py-1 border align-top ${completedColor(c.completed)}`}>
                                      <select
                                        className="flex h-8 w-full rounded-md border border-input bg-transparent px-1 py-0 text-xs font-semibold"
                                        value={c.completed || ''}
                                        onChange={(e) => updateCarry(ci, { completed: e.target.value })}
                                        data-testid={`carry-completed-${ci}`}
                                      >
                                        {COMPLETED_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt || '—'}</option>)}
                                      </select>
                                    </td>
                                    <td className="px-1 py-1 border align-top text-right">
                                      <button type="button" onClick={() => removeCarry(ci)} className="text-slate-400 hover:text-red-600" title="Remove">
                                        <Trash2 className="h-3 w-3 inline" />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <React.Fragment key={i}>
                      {row.actions.map((action, ai) => (
                        <tr key={`${i}-${ai}`} className={ai === 0 ? 'border-t' : ''}>
                          {ai === 0 && (
                            <td className="px-2 py-1 border align-top text-slate-700" rowSpan={row.actions.length}>
                              <strong>{row.agenda_no}.</strong> {row.agenda_text || agendaTemplate[i]}
                              <div className="mt-2">
                                <button
                                  type="button"
                                  onClick={() => addAction(i)}
                                  className="text-[11px] text-blue-700 hover:underline inline-flex items-center"
                                  data-testid={`add-action-${row.agenda_no}`}
                                >
                                  <Plus className="h-3 w-3 mr-0.5" /> Add another action
                                </button>
                              </div>
                            </td>
                          )}
                          <td className="px-1 py-1 border align-top">
                            {(phrases[String(row.agenda_no)] || []).length > 0 && (
                              <div className="flex items-center gap-1 mb-1">
                                <select
                                  className="h-6 flex-1 rounded border border-slate-300 bg-slate-50 px-1 text-[11px] text-slate-700"
                                  value=""
                                  onChange={(e) => { if (e.target.value) applyPhrase(i, ai, e.target.value); e.target.value = ''; }}
                                  data-testid={`quickfill-${row.agenda_no}-${ai}`}
                                  title="Pick from previously used answers"
                                >
                                  <option value="">⌄ Quick fill from saved answers...</option>
                                  {(phrases[String(row.agenda_no)] || []).map((p, pi) => (
                                    <option key={pi} value={p.text}>
                                      {p.text.length > 80 ? p.text.slice(0, 77) + '...' : p.text}{p.count > 0 ? ` (×${p.count})` : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                            <Textarea
                              rows={2}
                              value={action.minutes}
                              onChange={(e) => updateAction(i, ai, { minutes: e.target.value })}
                              className="min-h-[40px] text-xs"
                              data-testid={`row-minutes-${row.agenda_no}-${ai}`}
                            />
                            {action.minutes && action.minutes.trim().length >= 3 && (
                              <button
                                type="button"
                                onClick={() => savePhrase(row.agenda_no, action.minutes)}
                                className="mt-0.5 text-[10px] text-blue-600 hover:underline"
                                data-testid={`save-phrase-${row.agenda_no}-${ai}`}
                              >
                                + Save as quick fill
                              </button>
                            )}
                          </td>
                          <td className="px-1 py-1 border align-top">
                            <Input value={action.action_by_whom} onChange={(e) => updateAction(i, ai, { action_by_whom: e.target.value })} className="text-xs" />
                          </td>
                          <td className="px-1 py-1 border align-top">
                            <Input value={action.action_when} onChange={(e) => updateAction(i, ai, { action_when: e.target.value })} className="text-xs" placeholder="e.g. Oct 2024" />
                          </td>
                          <td className={`px-1 py-1 border align-top ${completedColor(action.completed)}`}>
                            <div className="flex items-center gap-1">
                              <select
                                className="flex h-8 flex-1 rounded-md border border-input bg-transparent px-1 py-0 text-xs font-semibold"
                                value={action.completed}
                                onChange={(e) => updateAction(i, ai, { completed: e.target.value })}
                                data-testid={`row-completed-${row.agenda_no}-${ai}`}
                              >
                                {COMPLETED_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt || '—'}</option>)}
                              </select>
                              {row.actions.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeAction(i, ai)}
                                  className="text-slate-400 hover:text-red-600 px-1"
                                  title="Remove this action line"
                                  data-testid={`remove-action-${row.agenda_no}-${ai}`}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <AgendaEditorDialog
        open={agendaEditorOpen}
        onOpenChange={setAgendaEditorOpen}
        agenda={agendaTemplate}
        showApplyOption={!(isNew && !recordId)}
        onSaved={handleAgendaSaved}
      />

      <Card>
        <CardContent className="pt-6">
          <Label>Next Meeting</Label>
          <Input value={form.next_meeting} onChange={(e) => updateField({ next_meeting: e.target.value })} placeholder="TBA" data-testid="field-next-meeting" />
        </CardContent>
      </Card>
    </div>
  );
}
