import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Plus, Search, Edit, Trash2, Save, Printer, ArrowLeft, FileDown } from 'lucide-react';
import api from '../services/api';
import { formatDate } from '../utils/dateFormatter';
import CreateRiskButton from '../components/CreateRiskButton';
import {
  getControlledDocumentByModule, buildDocControlFooter,
  buildPrintFooterCss, buildPrintBodyOpen, buildPrintBodyClose,
} from '../utils/documentControl';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

const STATUS_BADGE = {
  Open: 'bg-amber-100 text-amber-800 border-amber-300',
  'In Progress': 'bg-blue-100 text-blue-800 border-blue-300',
  Closed: 'bg-green-100 text-green-800 border-green-300',
};
const SEVERITY_BADGE = {
  Low: 'bg-green-100 text-green-800 border-green-300',
  Medium: 'bg-amber-100 text-amber-800 border-amber-300',
  High: 'bg-orange-100 text-orange-800 border-orange-300',
  Critical: 'bg-red-200 text-red-900 border-red-400',
};

const NearMissRegister = () => {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [ref, setRef] = useState({ incident_types: [], severity_levels: [] });
  const [docInfo, setDocInfo] = useState(null);

  useEffect(() => {
    fetchAll();
    api.get('/near-miss/reference').then(r => setRef(r.data));
    getControlledDocumentByModule('Near Miss / Hazard Form', { fallback: 'Near Miss', docType: 'Form' }).then(setDocInfo);
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.incident_type = typeFilter;
      const [l, s] = await Promise.all([
        api.get('/near-miss', { params }),
        api.get('/near-miss/stats'),
      ]);
      setItems(l.data.items || []); setStats(s.data || {});
    } finally { setLoading(false); }
  };

  const blank = useMemo(() => ({
    surname: '', first_name: '', location: '',
    date_reported: new Date().toISOString().slice(0, 10),
    ohs_rep_notified: 'No',
    incident_type: 'Near Miss', severity: 'Low',
    description: '',
    corrective_required: 'No', corrective_details: '', corrective_date: '', corrective_signed: '',
    asset_required: 'No', asset_details: '',
    mgmt_representative: { name: '', signature: '', date: '' },
    action_completion: { name: '', signature: '', date: '' },
    revised_closed: { name: '', signature: '', date: '' },
    status: 'Open',
  }), []);

  const openNew = () => setEditing({ ...blank });
  const openEdit = async (it) => {
    const r = await api.get(`/near-miss/${it.id}`);
    setEditing(r.data);
  };
  const close = () => setEditing(null);
  const updateField = (patch) => setEditing(e => ({ ...e, ...patch }));
  const updateBlock = (k, patch) => setEditing(e => ({ ...e, [k]: { ...(e[k] || {}), ...patch } }));

  const save = async () => {
    if (!editing.surname || !editing.first_name) return alert('Surname and First Name are required');
    try {
      const payload = { ...editing };
      delete payload.created_at; delete payload.updated_at; delete payload.nm_no; delete payload.id;
      if (editing.id) await api.put(`/near-miss/${editing.id}`, payload);
      else await api.post('/near-miss', payload);
      close(); fetchAll();
    } catch (e) { alert('Save failed: ' + (e?.response?.data?.detail || e.message)); }
  };

  const remove = async (it) => {
    if (!window.confirm(`Delete Near-Miss NM-${String(it.nm_no).padStart(3, '0')}?`)) return;
    await api.delete(`/near-miss/${it.id}`); fetchAll();
  };

  const printOne = async (rec, blank = false) => {
    const doc = await getControlledDocumentByModule('Near Miss / Hazard Form', { fallback: 'Near Miss', docType: 'Form' });
    const footer = buildDocControlFooter(doc, {
      title: blank ? 'Near Miss / Incident / Hazard Identification (Blank Form)' : `Near Miss Report — NM-${String(rec.nm_no).padStart(3, '0')}`,
    });
    const v = (k) => blank ? '' : esc(rec?.[k] ?? '');
    const b = (k, f) => blank ? '' : esc(rec?.[k]?.[f] ?? '');
    const checked = (val, opt) => (!blank && val === opt) ? 'checked' : '';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>${blank ? 'Blank Near Miss Form' : `NM-${rec.nm_no}`}</title>
      <style>${buildPrintFooterCss()}
        @page { size: A4 portrait; margin: 10mm 10mm 14mm 10mm; }
        body { font-size: 10pt; color: #111; }
        h1 { font-size: 14pt; margin: 0 0 2mm 0; text-align: center; }
        h2 { font-size: 10pt; margin: 4mm 0 1mm 0; background:#1f2937; color:#fff; padding: 1mm 2mm; text-transform: uppercase; letter-spacing: 0.05em; }
        table { width: 100%; border-collapse: collapse; }
        td, th { border: 1px solid #333; padding: 3px 5px; font-size: 9pt; vertical-align: top; }
        td.lbl { background:#f3f4f6; font-weight: 600; width: 18%; }
        .desc { min-height: 22mm; }
        .chk { display: inline-block; width: 4mm; height: 4mm; border: 1px solid #111; text-align: center; line-height: 4mm; margin-right: 2mm; vertical-align: middle; }
        .chk.on { background: #111; color: #fff; }
        .sig-row td { height: 18mm; }
      </style></head><body>
      ${buildPrintBodyOpen(footer)}
      <h1>NEAR MISS / INCIDENT / HAZARD IDENTIFICATION FORM</h1>
      <h2>1. Reporter Information</h2>
      <table>
        <tr><td class="lbl">Surname</td><td>${v('surname')}</td><td class="lbl">First Name</td><td>${v('first_name')}</td></tr>
        <tr><td class="lbl">Location</td><td colspan="3">${v('location')}</td></tr>
        <tr><td class="lbl">Date</td><td>${blank ? '' : esc(formatDate(rec.date_reported))}</td>
          <td class="lbl">OHS Rep Notified?</td>
          <td><span class="chk ${checked(rec?.ohs_rep_notified,'Yes')}">${checked(rec?.ohs_rep_notified,'Yes')?'✓':''}</span> Yes
              <span class="chk ${checked(rec?.ohs_rep_notified,'No')}">${checked(rec?.ohs_rep_notified,'No')?'✓':''}</span> No</td></tr>
        <tr><td class="lbl">Incident Type</td><td>${v('incident_type')}</td>
          <td class="lbl">Severity</td><td>${v('severity')}</td></tr>
      </table>
      <h2>2. Description of Incident / Near Miss / Hazard</h2>
      <table><tr><td class="desc">${v('description').replace(/\n/g,'<br/>')}</td></tr></table>
      <h2>3. Corrective / Preventive Action</h2>
      <table>
        <tr><td class="lbl">Required?</td>
          <td><span class="chk ${checked(rec?.corrective_required,'Yes')}">${checked(rec?.corrective_required,'Yes')?'✓':''}</span> Yes
              <span class="chk ${checked(rec?.corrective_required,'No')}">${checked(rec?.corrective_required,'No')?'✓':''}</span> No</td>
          <td class="lbl">Date</td><td>${blank?'':esc(formatDate(rec.corrective_date))}</td></tr>
        <tr><td class="lbl">Details</td><td colspan="3" class="desc">${v('corrective_details').replace(/\n/g,'<br/>')}</td></tr>
        <tr><td class="lbl">Signed</td><td colspan="3">${v('corrective_signed')}</td></tr>
      </table>
      <h2>4. Asset Repair / Maintenance</h2>
      <table>
        <tr><td class="lbl">Required?</td>
          <td colspan="3"><span class="chk ${checked(rec?.asset_required,'Yes')}">${checked(rec?.asset_required,'Yes')?'✓':''}</span> Yes
              <span class="chk ${checked(rec?.asset_required,'No')}">${checked(rec?.asset_required,'No')?'✓':''}</span> No</td></tr>
        <tr><td class="lbl">Details</td><td colspan="3" class="desc">${v('asset_details').replace(/\n/g,'<br/>')}</td></tr>
      </table>
      <h2>5. Management Workflow</h2>
      <table>
        <tr><th style="width:34%;">Management Representative</th><th style="width:33%;">Action Completion</th><th>Revised / Closed</th></tr>
        <tr class="sig-row">
          <td>Name: ${b('mgmt_representative','name')}<br/>Signed: ${b('mgmt_representative','signature')}<br/>Date: ${blank?'':esc(formatDate(rec?.mgmt_representative?.date))}</td>
          <td>Name: ${b('action_completion','name')}<br/>Signed: ${b('action_completion','signature')}<br/>Date: ${blank?'':esc(formatDate(rec?.action_completion?.date))}</td>
          <td>Name: ${b('revised_closed','name')}<br/>Signed: ${b('revised_closed','signature')}<br/>Date: ${blank?'':esc(formatDate(rec?.revised_closed?.date))}</td>
        </tr>
      </table>
      ${buildPrintBodyClose()}
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (_) { /* blocked */ } }, 300);
  };

  const printRegister = async () => {
    // Pull the Near Miss Register entry from Document Control
    const doc = await getControlledDocumentByModule('Near Miss Register', {
      fallback: 'Near Miss', docType: 'Register',
    });
    const footer = buildDocControlFooter(doc, {
      title: 'Near Miss / Incident / Hazard Register', owner: 'Safety Manager',
    });
    const today = new Date().toISOString().slice(0, 10);
    const fmt = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
    const rows = (items || []).map(it => `
      <tr>
        <td>NM-${String(it.nm_no).padStart(3, '0')}</td>
        <td>${fmt(it.date_reported)}</td>
        <td>${esc(it.surname || '')}, ${esc(it.first_name || '')}</td>
        <td>${esc(it.location || '')}</td>
        <td>${esc(it.incident_type || '')}</td>
        <td>${esc(it.severity || '')}</td>
        <td>${esc(it.status || '')}</td>
        <td>${esc(it.corrective_details || '')}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Near Miss / Hazard Register</title>
      <style>
        ${buildPrintFooterCss()}
        @page { size: A4 landscape; margin: 10mm 12mm 18mm 12mm; }
        body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; margin: 0; }
        h1 { font-size: 15pt; margin: 0 0 2mm 0; color: #1f2937; }
        .meta { font-size: 9pt; color: #555; margin-bottom: 3mm; display:flex; justify-content:space-between; }
        table.data-tbl { width: 100%; border-collapse: collapse; }
        table.data-tbl th, table.data-tbl td { border: 1px solid #444; padding: 4px 6px; vertical-align: top; }
        table.data-tbl th { background: #1f2937; color: #fff; text-align: left; font-size: 9pt; }
        table.data-tbl tr:nth-child(even) td { background: #f7f7f7; }
        .sev-High { color: #b91c1c; font-weight: 700; }
        .sev-Medium { color: #b45309; font-weight: 600; }
      </style></head><body>${buildPrintBodyOpen(footer)}
      <h1>Near Miss / Incident / Hazard Register</h1>
      <div class="meta"><span>${items.length} record(s) on file</span><span>Printed ${fmt(today)}</span></div>
      <table class="data-tbl">
        <thead><tr>
          <th style="width:7%">NM #</th>
          <th style="width:9%">Date</th>
          <th style="width:16%">Reporter</th>
          <th style="width:14%">Location</th>
          <th style="width:11%">Type</th>
          <th style="width:8%">Severity</th>
          <th style="width:8%">Status</th>
          <th style="width:27%">Corrective Action</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="8" style="text-align:center;padding:6mm;color:#888;">No records on file.</td></tr>'}</tbody>
      </table>
      ${buildPrintBodyClose()}
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return alert('Popup blocked. Please allow popups for this site.');
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (_) { /* blocked */ } }, 400);
  };

  if (editing) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4" data-testid="nm-form-page">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <button onClick={close} className="text-sm text-blue-600 hover:underline mb-1 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</button>
            <h1 className="text-2xl font-bold">{editing.id ? `NM-${String(editing.nm_no).padStart(3,'0')} — ${editing.surname} ${editing.first_name}` : 'New Near Miss / Incident'}</h1>
            <p className="text-xs text-gray-500"><span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{docInfo?.form_no || '—'}</span></p>
          </div>
          <div className="flex gap-2">
            {editing.id && <Button variant="outline" onClick={() => printOne(editing)} data-testid="nm-print"><Printer className="w-4 h-4 mr-1" /> Print</Button>}
            <Button onClick={save} data-testid="nm-save"><Save className="w-4 h-4 mr-1" /> Save</Button>
          </div>
        </div>

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">1. Reporter Information</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Surname *</Label><Input value={editing.surname} onChange={e => updateField({ surname: e.target.value })} data-testid="nm-surname" /></div>
            <div><Label>First Name *</Label><Input value={editing.first_name} onChange={e => updateField({ first_name: e.target.value })} data-testid="nm-firstname" /></div>
            <div><Label>Date</Label><Input type="date" value={editing.date_reported || ''} onChange={e => updateField({ date_reported: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Location</Label><Input value={editing.location || ''} onChange={e => updateField({ location: e.target.value })} /></div>
            <div><Label>OHS Rep Notified?</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.ohs_rep_notified || 'No'} onChange={e => updateField({ ohs_rep_notified: e.target.value })}><option>No</option><option>Yes</option></select></div>
            <div><Label>Incident Type</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.incident_type || ''} onChange={e => updateField({ incident_type: e.target.value })} data-testid="nm-type">
                {ref.incident_types.map(t => <option key={t}>{t}</option>)}
              </select></div>
            <div><Label>Severity</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.severity || ''} onChange={e => updateField({ severity: e.target.value })} data-testid="nm-severity">
                {ref.severity_levels.map(t => <option key={t}>{t}</option>)}
              </select></div>
            <div><Label>Status</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.status || 'Open'} onChange={e => updateField({ status: e.target.value })} data-testid="nm-status">
                <option>Open</option><option>In Progress</option><option>Closed</option>
              </select></div>
          </CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">2. Description of Incident / Near Miss / Hazard</CardTitle></CardHeader>
          <CardContent><Textarea rows={4} value={editing.description || ''} onChange={e => updateField({ description: e.target.value })} data-testid="nm-desc" /></CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">3. Corrective / Preventive Action</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Required?</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.corrective_required || 'No'} onChange={e => updateField({ corrective_required: e.target.value })}><option>No</option><option>Yes</option></select></div>
            <div><Label>Date</Label><Input type="date" value={editing.corrective_date || ''} onChange={e => updateField({ corrective_date: e.target.value })} /></div>
            <div><Label>Signed</Label><Input value={editing.corrective_signed || ''} onChange={e => updateField({ corrective_signed: e.target.value })} /></div>
            <div className="md:col-span-3"><Label>Details</Label><Textarea rows={2} value={editing.corrective_details || ''} onChange={e => updateField({ corrective_details: e.target.value })} /></div>
          </CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">4. Asset Repair / Maintenance</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Required?</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.asset_required || 'No'} onChange={e => updateField({ asset_required: e.target.value })}><option>No</option><option>Yes</option></select></div>
            <div className="md:col-span-3"><Label>Details</Label><Textarea rows={2} value={editing.asset_details || ''} onChange={e => updateField({ asset_details: e.target.value })} /></div>
          </CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">5. Management Workflow</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { k: 'mgmt_representative', label: 'Management Representative' },
              { k: 'action_completion', label: 'Action Completion' },
              { k: 'revised_closed', label: 'Revised / Closed' },
            ].map(({ k, label }) => (
              <div key={k} className="border rounded p-3 space-y-2">
                <div className="font-semibold text-sm">{label}</div>
                <div><Label className="text-xs">Name</Label><Input value={editing[k]?.name || ''} onChange={e => updateBlock(k, { name: e.target.value })} /></div>
                <div><Label className="text-xs">Signature (typed)</Label><Input value={editing[k]?.signature || ''} onChange={e => updateBlock(k, { signature: e.target.value })} /></div>
                <div><Label className="text-xs">Date</Label><Input type="date" value={editing[k]?.date || ''} onChange={e => updateBlock(k, { date: e.target.value })} /></div>
              </div>
            ))}
          </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="nm-page">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Near Miss / Incident / Hazard Register</h1>
          <p className="text-gray-600 text-sm mt-1">ISO OHS reporting <span className="ml-1 font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{docInfo?.form_no || '—'}</span></p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => printOne(null, true)} data-testid="nm-print-blank"><FileDown className="w-4 h-4 mr-1" /> Print Blank Form</Button>
          <Button variant="outline" onClick={printRegister} data-testid="nm-print-register"><Printer className="w-4 h-4 mr-1" /> Print Register</Button>
          <Button onClick={openNew} data-testid="nm-new"><Plus className="w-4 h-4 mr-1" /> New Report</Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-l-4 border-l-blue-600"><CardContent className="pt-4 pb-3"><div className="text-xs text-gray-500">Total</div><div className="text-3xl font-bold text-blue-700" data-testid="nm-stat-total">{stats.total}</div></CardContent></Card>
          <Card className="border-l-4 border-l-amber-600"><CardContent className="pt-4 pb-3"><div className="text-xs text-gray-500">Open / In Progress</div><div className="text-3xl font-bold text-amber-700" data-testid="nm-stat-open">{stats.open}</div></CardContent></Card>
          <Card className="border-l-4 border-l-green-600"><CardContent className="pt-4 pb-3"><div className="text-xs text-gray-500">Closed</div><div className="text-3xl font-bold text-green-700" data-testid="nm-stat-closed">{stats.closed}</div></CardContent></Card>
          <Card className="border-l-4 border-l-red-600"><CardContent className="pt-4 pb-3"><div className="text-xs text-gray-500">By Type</div><div className="text-xs space-y-0.5 mt-1">{Object.entries(stats.by_type || {}).map(([t, c]) => <div key={t} className="flex justify-between"><span>{t}</span><span className="font-bold">{c}</span></div>)}</div></CardContent></Card>
        </div>
      )}

      <Card>
        <CardContent className="pt-6 flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]"><Label className="text-xs">Search</Label><Input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchAll()} placeholder="Name, location, NM #…" data-testid="nm-search" /></div>
          <div><Label className="text-xs">Status</Label><select className="border rounded h-9 px-2" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All</option><option>Open</option><option>In Progress</option><option>Closed</option></select></div>
          <div><Label className="text-xs">Type</Label><select className="border rounded h-9 px-2" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}><option value="">All</option>{ref.incident_types.map(t => <option key={t}>{t}</option>)}</select></div>
          <Button onClick={fetchAll}><Search className="w-4 h-4 mr-1" /> Apply</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle>{items.length} record{items.length === 1 ? '' : 's'}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr>
              <th className="text-left p-2 border">NM #</th><th className="text-left p-2 border">Date</th>
              <th className="text-left p-2 border">Reporter</th><th className="text-left p-2 border">Location</th>
              <th className="text-left p-2 border">Type</th><th className="text-left p-2 border">Severity</th>
              <th className="text-left p-2 border">Status</th><th className="text-left p-2 border w-32">Actions</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="text-center text-gray-500 py-6">Loading…</td></tr>}
              {!loading && items.length === 0 && <tr><td colSpan={8} className="text-center text-gray-500 py-6">No reports yet.</td></tr>}
              {items.map(it => (
                <tr key={it.id} className="hover:bg-gray-50">
                  <td className="p-2 border font-mono font-bold">NM-{String(it.nm_no).padStart(3, '0')}</td>
                  <td className="p-2 border">{formatDate(it.date_reported)}</td>
                  <td className="p-2 border">{it.surname}, {it.first_name}</td>
                  <td className="p-2 border">{it.location || ''}</td>
                  <td className="p-2 border">{it.incident_type || ''}</td>
                  <td className="p-2 border">{it.severity ? <span className={`inline-block px-2 py-0.5 rounded border text-xs font-bold ${SEVERITY_BADGE[it.severity] || ''}`}>{it.severity}</span> : ''}</td>
                  <td className="p-2 border">{it.status ? <span className={`inline-block px-2 py-0.5 rounded border text-xs font-semibold ${STATUS_BADGE[it.status] || ''}`}>{it.status}</span> : ''}</td>
                  <td className="p-2 border whitespace-nowrap">
                    <button onClick={() => printOne(it)} className="text-gray-700 hover:underline mr-2"><Printer className="w-4 h-4 inline" /></button>
                    <button onClick={() => openEdit(it)} className="text-blue-600 hover:underline mr-2" data-testid={`nm-edit-${it.id}`}><Edit className="w-4 h-4 inline" /></button>
                    <CreateRiskButton
                      source="Near Miss / Hazard" linkedModule="Near Miss / Hazard"
                      linkedRecordId={`NM-${String(it.nm_no).padStart(3,'0')}`} area="Safety"
                      title={`Near Miss NM-${String(it.nm_no).padStart(3,'0')} — ${(it.location || '').slice(0,40)}`}
                      description={it.description || ''}
                      label="" size="sm" variant="ghost"
                      className="text-purple-600 hover:underline mr-2 px-1 h-auto py-0.5"
                      testId={`nm-create-ro-${it.id}`}
                    />
                    <button onClick={() => remove(it)} className="text-red-600 hover:underline" data-testid={`nm-delete-${it.id}`}><Trash2 className="w-4 h-4 inline" /></button>

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

export default NearMissRegister;