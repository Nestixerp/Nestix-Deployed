import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Plus, Search, Edit, Trash2, Save, Printer, ArrowLeft, FileDown } from 'lucide-react';
import api from '../services/api';
import { formatDate } from '../utils/dateFormatter';
import {
  getControlledDocumentByModule, buildDocControlFooter,
  buildPrintFooterCss, buildPrintBodyOpen, buildPrintBodyClose,
} from '../utils/documentControl';

const MODULE_NAME = 'Training Appraisal Form';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

const TrainingAppraisal = () => {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [ref, setRef] = useState({ sources: ['Internal', 'External'], effectiveness_ratings: [] });
  const [docInfo, setDocInfo] = useState(null);

  useEffect(() => {
    fetchAll();
    api.get('/training-appraisals/reference').then(r => setRef(r.data));
    api.get('/employees').then(r => setEmployees(r.data || [])).catch(() => {});
    getControlledDocumentByModule(MODULE_NAME, { fallback: 'Training Appraisal', docType: 'Form' }).then(setDocInfo);
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (sourceFilter) params.source = sourceFilter;
      const [l, s] = await Promise.all([
        api.get('/training-appraisals', { params }),
        api.get('/training-appraisals/stats'),
      ]);
      setItems(l.data.items || []); setStats(s.data || {});
    } finally { setLoading(false); }
  };

  const blank = useMemo(() => ({
    employee_id: '', employee_name: '', department: '',
    date_of_training: new Date().toISOString().slice(0, 10),
    description: '', provider: '', source: 'Internal', total_hours: '',
    training_objectives: '', learning_outcomes: '', effectiveness_rating: null,
    appraisal_comments: '', date_of_appraisal: '',
    trainee_signature: '', manager_name: '', manager_signature: '',
  }), []);

  const openNew = () => setEditing({ ...blank });
  const openEdit = async (it) => {
    const r = await api.get(`/training-appraisals/${it.id}`);
    setEditing(r.data);
  };
  const close = () => setEditing(null);
  const updateField = (patch) => setEditing(e => ({ ...e, ...patch }));

  const pickEmployee = (id) => {
    const emp = employees.find(e => e.id === id);
    updateField({
      employee_id: id,
      employee_name: emp ? `${emp.first_name || ''} ${emp.last_name || ''}`.trim() : '',
      department: emp?.department || editing.department,
    });
  };

  const save = async () => {
    if (!editing.employee_name) return alert('Employee Name is required');
    try {
      const payload = { ...editing };
      if (payload.total_hours === '') payload.total_hours = null;
      else if (payload.total_hours != null) payload.total_hours = parseFloat(payload.total_hours);
      delete payload.created_at; delete payload.updated_at; delete payload.ta_no; delete payload.id;
      if (editing.id) await api.put(`/training-appraisals/${editing.id}`, payload);
      else await api.post('/training-appraisals', payload);
      close(); fetchAll();
    } catch (e) { alert('Save failed: ' + (e?.response?.data?.detail || e.message)); }
  };

  const remove = async (it) => {
    if (!window.confirm(`Delete TA-${String(it.ta_no).padStart(3, '0')}?`)) return;
    await api.delete(`/training-appraisals/${it.id}`); fetchAll();
  };

  const printOne = async (rec, blankForm = false) => {
    const doc = await getControlledDocumentByModule(MODULE_NAME, { fallback: 'Training Appraisal', docType: 'Form' });
    const footer = buildDocControlFooter(doc, {
      title: blankForm ? 'Training Record / Appraisal Form (Blank)' : `Training Record — TA-${String(rec.ta_no).padStart(3, '0')}`,
    });
    const v = (k) => blankForm ? '' : esc(rec?.[k] ?? '');
    const checked = (val, opt) => (!blankForm && val === opt) ? 'on' : '';
    const blankLines = (n) => Array(n).fill('<tr><td style="height:6mm;border-bottom:1px solid #aaa;"></td></tr>').join('');
    const ratingDisplay = (() => {
      if (blankForm) return '1   2   3   4   5';
      const r = rec?.effectiveness_rating;
      return r ? `<strong>${r}</strong> / 5` : '';
    })();
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>${blankForm ? 'Blank Training Appraisal' : `TA-${rec.ta_no}`}</title>
      <style>${buildPrintFooterCss()}
        @page { size: A4 portrait; margin: 10mm 10mm 14mm 10mm; }
        body { font-size: 10pt; color: #111; }
        h1 { font-size: 15pt; margin: 0 0 3mm 0; text-align: center; }
        h2 { font-size: 10pt; margin: 4mm 0 1mm 0; background:#1f2937; color:#fff; padding: 1mm 2mm; text-transform: uppercase; letter-spacing: 0.05em; }
        table { width: 100%; border-collapse: collapse; }
        td, th { border: 1px solid #333; padding: 3px 5px; font-size: 9pt; vertical-align: top; }
        td.lbl { background:#f3f4f6; font-weight: 600; width: 22%; }
        .desc { min-height: 18mm; }
        .chk { display: inline-block; width: 4mm; height: 4mm; border: 1px solid #111; text-align: center; line-height: 4mm; margin-right: 2mm; vertical-align: middle; }
        .chk.on { background: #111; color: #fff; }
        .sig { display: flex; gap: 10mm; margin-top: 4mm; }
        .sig .box { flex: 1; }
        .sig .line { border-bottom: 1px solid #111; min-height: 8mm; padding-bottom: 1mm; }
        .blanklines table { border: 1px solid #888; }
      </style></head><body>
      ${buildPrintBodyOpen(footer)}
      <h1>TRAINING RECORD / APPRAISAL FORM</h1>
      <h2>Trainee &amp; Training Details</h2>
      <table>
        <tr><td class="lbl">Name</td><td>${v('employee_name')}</td><td class="lbl">Department</td><td>${v('department')}</td></tr>
        <tr><td class="lbl">Date of Training</td><td>${blankForm ? '' : esc(formatDate(rec.date_of_training))}</td>
          <td class="lbl">Total Hours</td><td>${v('total_hours')}</td></tr>
        <tr><td class="lbl">Description of Training</td><td colspan="3" class="desc">${v('description').replace(/\n/g,'<br/>')}</td></tr>
        <tr><td class="lbl">Provided By</td><td>${v('provider')}</td>
          <td class="lbl">Source</td>
          <td><span class="chk ${checked(rec?.source,'Internal')}">${checked(rec?.source,'Internal')?'✓':''}</span> Internal
              &nbsp;&nbsp;<span class="chk ${checked(rec?.source,'External')}">${checked(rec?.source,'External')?'✓':''}</span> External</td></tr>
      </table>
      <h2>ISO Training Effectiveness</h2>
      <table>
        <tr><td class="lbl">Training Objectives</td><td class="desc">${v('training_objectives').replace(/\n/g,'<br/>')}</td></tr>
        <tr><td class="lbl">Learning Outcomes Achieved</td><td class="desc">${v('learning_outcomes').replace(/\n/g,'<br/>')}</td></tr>
        <tr><td class="lbl">Effectiveness Rating</td><td>${ratingDisplay}${blankForm ? '<br/><small>(1 = Not effective, 5 = Outstanding)</small>' : ''}</td></tr>
      </table>
      <h2>Appraisal Comments</h2>
      <table><tr><td class="desc" style="min-height:35mm;">${v('appraisal_comments').replace(/\n/g,'<br/>')}${blankForm ? '<div class="blanklines"><table>'+blankLines(6)+'</table></div>' : ''}</td></tr></table>
      <h2>Sign-off</h2>
      <div class="sig">
        <div class="box"><div><strong>Trainee Signature</strong></div><div class="line">${v('trainee_signature')}</div></div>
        <div class="box"><div><strong>Manager Name</strong></div><div class="line">${v('manager_name')}</div></div>
        <div class="box"><div><strong>Manager Signature</strong></div><div class="line">${v('manager_signature')}</div></div>
        <div class="box"><div><strong>Date of Appraisal</strong></div><div class="line">${blankForm ? '' : esc(formatDate(rec?.date_of_appraisal))}</div></div>
      </div>
      ${buildPrintBodyClose()}
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (_) { /* blocked */ } }, 300);
  };

  if (editing) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4" data-testid="ta-form-page">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <button onClick={close} className="text-sm text-blue-600 hover:underline mb-1 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</button>
            <h1 className="text-2xl font-bold">{editing.id ? `TA-${String(editing.ta_no).padStart(3,'0')} — ${editing.employee_name}` : 'New Training Record / Appraisal'}</h1>
            <p className="text-xs text-gray-500"><span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{docInfo?.form_no || '—'}</span></p>
          </div>
          <div className="flex gap-2">
            {editing.id && <Button variant="outline" onClick={() => printOne(editing)} data-testid="ta-print"><Printer className="w-4 h-4 mr-1" /> Print</Button>}
            <Button onClick={save} data-testid="ta-save"><Save className="w-4 h-4 mr-1" /> Save</Button>
          </div>
        </div>

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Trainee & Training Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Employee (link to directory)</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.employee_id || ''} onChange={e => pickEmployee(e.target.value)} data-testid="ta-employee">
                <option value="">— (manual name) —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select></div>
            <div><Label>Name *</Label><Input value={editing.employee_name || ''} onChange={e => updateField({ employee_name: e.target.value })} data-testid="ta-name" /></div>
            <div><Label>Department</Label><Input value={editing.department || ''} onChange={e => updateField({ department: e.target.value })} /></div>
            <div><Label>Date of Training</Label><Input type="date" value={editing.date_of_training || ''} onChange={e => updateField({ date_of_training: e.target.value })} /></div>
            <div><Label>Total Hours</Label><Input type="number" step="0.25" value={editing.total_hours ?? ''} onChange={e => updateField({ total_hours: e.target.value })} /></div>
            <div><Label>Source</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.source || ''} onChange={e => updateField({ source: e.target.value })} data-testid="ta-source">
                {(ref.sources || []).map(s => <option key={s}>{s}</option>)}
              </select></div>
            <div className="md:col-span-3"><Label>Description of Training</Label><Textarea rows={2} value={editing.description || ''} onChange={e => updateField({ description: e.target.value })} data-testid="ta-desc" /></div>
            <div className="md:col-span-3"><Label>Provided By</Label><Input value={editing.provider || ''} onChange={e => updateField({ provider: e.target.value })} /></div>
          </CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">ISO Training Effectiveness</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Training Objectives</Label><Textarea rows={3} value={editing.training_objectives || ''} onChange={e => updateField({ training_objectives: e.target.value })} placeholder="What was the training intended to achieve?" /></div>
            <div><Label>Learning Outcomes Achieved</Label><Textarea rows={3} value={editing.learning_outcomes || ''} onChange={e => updateField({ learning_outcomes: e.target.value })} placeholder="What did the employee learn / demonstrate?" /></div>
            <div className="md:col-span-2"><Label>Effectiveness Rating (1 = Not effective, 5 = Outstanding)</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.effectiveness_rating ?? ''} onChange={e => updateField({ effectiveness_rating: e.target.value ? parseInt(e.target.value) : null })} data-testid="ta-rating">
                <option value="">—</option>
                {(ref.effectiveness_ratings || []).map(r => <option key={r.v} value={r.v}>{r.label}</option>)}
              </select></div>
          </CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Appraisal Comments</CardTitle></CardHeader>
          <CardContent><Textarea rows={6} value={editing.appraisal_comments || ''} onChange={e => updateField({ appraisal_comments: e.target.value })} /></CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Sign-off</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div><Label>Trainee Signature</Label><Input value={editing.trainee_signature || ''} onChange={e => updateField({ trainee_signature: e.target.value })} /></div>
            <div><Label>Manager Name</Label><Input value={editing.manager_name || ''} onChange={e => updateField({ manager_name: e.target.value })} /></div>
            <div><Label>Manager Signature</Label><Input value={editing.manager_signature || ''} onChange={e => updateField({ manager_signature: e.target.value })} /></div>
            <div><Label>Date of Appraisal</Label><Input type="date" value={editing.date_of_appraisal || ''} onChange={e => updateField({ date_of_appraisal: e.target.value })} /></div>
          </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="ta-page">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Training Records / Appraisals</h1>
          <p className="text-gray-600 text-sm mt-1">ISO 9001 training register <span className="ml-1 font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{docInfo?.form_no || '—'}</span></p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => printOne(null, true)} data-testid="ta-print-blank"><FileDown className="w-4 h-4 mr-1" /> Print Blank Form</Button>
          <Button onClick={openNew} data-testid="ta-new"><Plus className="w-4 h-4 mr-1" /> New Record</Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-l-4 border-l-blue-600"><CardContent className="pt-4 pb-3"><div className="text-xs text-gray-500">Total Records</div><div className="text-3xl font-bold text-blue-700" data-testid="ta-stat-total">{stats.total}</div></CardContent></Card>
          <Card className="border-l-4 border-l-purple-600"><CardContent className="pt-4 pb-3"><div className="text-xs text-gray-500">Internal</div><div className="text-3xl font-bold text-purple-700">{stats.internal}</div></CardContent></Card>
          <Card className="border-l-4 border-l-amber-600"><CardContent className="pt-4 pb-3"><div className="text-xs text-gray-500">External</div><div className="text-3xl font-bold text-amber-700">{stats.external}</div></CardContent></Card>
          <Card className="border-l-4 border-l-green-600"><CardContent className="pt-4 pb-3"><div className="text-xs text-gray-500">Total Hours Logged</div><div className="text-3xl font-bold text-green-700">{(stats.total_hours || 0).toFixed(1)}</div></CardContent></Card>
        </div>
      )}

      <Card>
        <CardContent className="pt-6 flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]"><Label className="text-xs">Search</Label><Input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchAll()} placeholder="Name, department, provider…" data-testid="ta-search" /></div>
          <div><Label className="text-xs">Source</Label><select className="border rounded h-9 px-2" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}><option value="">All</option><option>Internal</option><option>External</option></select></div>
          <Button onClick={fetchAll}><Search className="w-4 h-4 mr-1" /> Apply</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle>{items.length} record{items.length === 1 ? '' : 's'}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr>
              <th className="text-left p-2 border">TA #</th><th className="text-left p-2 border">Employee</th>
              <th className="text-left p-2 border">Department</th><th className="text-left p-2 border">Date</th>
              <th className="text-left p-2 border">Training</th><th className="text-left p-2 border">Source</th>
              <th className="text-left p-2 border">Hrs</th><th className="text-left p-2 border">Rating</th>
              <th className="text-left p-2 border w-32">Actions</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={9} className="text-center text-gray-500 py-6">Loading…</td></tr>}
              {!loading && items.length === 0 && <tr><td colSpan={9} className="text-center text-gray-500 py-6">No records yet.</td></tr>}
              {items.map(it => (
                <tr key={it.id} className="hover:bg-gray-50">
                  <td className="p-2 border font-mono font-bold">TA-{String(it.ta_no).padStart(3, '0')}</td>
                  <td className="p-2 border">{it.employee_name}</td>
                  <td className="p-2 border">{it.department || ''}</td>
                  <td className="p-2 border">{formatDate(it.date_of_training)}</td>
                  <td className="p-2 border text-xs">{(it.description || '').slice(0, 50)}</td>
                  <td className="p-2 border">{it.source || ''}</td>
                  <td className="p-2 border">{it.total_hours ?? ''}</td>
                  <td className="p-2 border text-center">{it.effectiveness_rating ?? ''}</td>
                  <td className="p-2 border whitespace-nowrap">
                    <button onClick={() => printOne(it)} className="text-gray-700 hover:underline mr-2"><Printer className="w-4 h-4 inline" /></button>
                    <button onClick={() => openEdit(it)} className="text-blue-600 hover:underline mr-2" data-testid={`ta-edit-${it.id}`}><Edit className="w-4 h-4 inline" /></button>
                    <button onClick={() => remove(it)} className="text-red-600 hover:underline" data-testid={`ta-delete-${it.id}`}><Trash2 className="w-4 h-4 inline" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

export default TrainingAppraisal;
