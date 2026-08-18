import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, Save, ArrowLeft, Download, Upload, FileText, Eye } from 'lucide-react';
import api from '../services/api';
import { formatDate } from '../utils/dateFormatter';
import {
  getControlledDocumentByModule, buildDocControlFooter,
  buildPrintFooterCss, buildPrintBodyOpen, buildPrintBodyClose,
} from '../utils/documentControl';

const MODULE_REGISTER = 'Risk & Opportunities Register';
const MODULE_RECORD = 'Risk & Opportunity Form';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);
const nl2br = (v) => esc(v).replace(/\n/g, '<br/>');

const RISK_LEVEL_BADGE = {
  Low: 'bg-green-100 text-green-800 border-green-300',
  Medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  High: 'bg-orange-100 text-orange-800 border-orange-300',
  Extreme: 'bg-red-200 text-red-900 border-red-400',
};
const STATUS_BADGE = {
  Open: 'bg-amber-100 text-amber-800 border-amber-300',
  Monitoring: 'bg-blue-100 text-blue-800 border-blue-300',
  Closed: 'bg-green-100 text-green-800 border-green-300',
};

const riskLevel = (rating) => {
  if (rating == null) return null;
  if (rating <= 4) return 'Low';
  if (rating <= 9) return 'Medium';
  if (rating <= 16) return 'High';
  return 'Extreme';
};

const RiskOpportunities = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState({ search: '', area: '', type: '', source: '', risk_level: '', status: '', linked_module: '', overdue: false, review_due: false });
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [ref, setRef] = useState(null);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [docInfo, setDocInfo] = useState(null);

  useEffect(() => {
    api.get('/risk-opportunities/reference').then(r => setRef(r.data));
    api.get('/risk-opportunities/users').then(r => setUsers(r.data || []));
    getControlledDocumentByModule(MODULE_REGISTER, { fallback: 'Risk & Opportunities', docType: 'Register' }).then(setDocInfo);
    try {
      const u = localStorage.getItem('currentUser');
      if (u) setCurrentUser(JSON.parse(u));
    } catch (_) { /* ignore */ }
    fetchAll();
    // Honor query-string prefill (from "Create R/O" button in other modules)
    const q = new URLSearchParams(location.search);
    if (q.get('new') === '1') {
      openNewPrefilled({
        source: q.get('source') || '',
        linked_module: q.get('linked_module') || '',
        linked_record_id: q.get('linked_record_id') || '',
        area: q.get('area') || '',
        title: q.get('title') || '',
        description: q.get('description') || '',
        type: q.get('type') || 'Risk',
      });
    }
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const params = {};
      Object.entries(filters).forEach(([k, v]) => {
        if (v === true) params[k] = true;
        else if (v) params[k] = v;
      });
      const [l, s] = await Promise.all([
        api.get('/risk-opportunities', { params }),
        api.get('/risk-opportunities/stats'),
      ]);
      setItems(l.data.items || []); setStats(s.data || {});
    } finally { setLoading(false); }
  };

  const blank = useMemo(() => ({
    date_raised: new Date().toISOString().slice(0, 10),
    raised_by: '', area: '', type: 'Risk', source: '',
    linked_module: '', linked_record_id: '',
    title: '', description: '', potential_impact: '', existing_controls: '',
    interested_parties: [], process_affected: '',
    likelihood: null, consequence: null,
    treatment_decision: '', further_action_required: 'No', proposed_action: '',
    responsible_person: '', due_date: '', action_status: 'Not Started',
    review_frequency: '', next_review_date: '', review_comments: '',
    residual_likelihood: null, residual_consequence: null,
    status: 'Open', closure_notes: '', closed_by: '', closed_date: '',
    attachments: [],
  }), []);

  const openNew = () => {
    const fresh = { ...blank };
    if (currentUser?.username) fresh.raised_by = currentUser.username;
    setEditing(fresh);
  };

  const openNewPrefilled = (prefill) => {
    const fresh = { ...blank, ...prefill };
    if (currentUser?.username) fresh.raised_by = currentUser.username;
    setEditing(fresh);
  };

  const openView = async (it) => {
    const r = await api.get(`/risk-opportunities/${it.id}`);
    setViewing(r.data);
  };
  const openEdit = async (it) => {
    const r = await api.get(`/risk-opportunities/${it.id}`);
    setEditing(r.data); setViewing(null);
  };
  const close = () => { setEditing(null); setViewing(null); navigate('/ims/risk-opportunities', { replace: true }); };
  const updateField = (patch) => setEditing(e => ({ ...e, ...patch }));

  const save = async () => {
    try {
      const payload = { ...editing };
      ['id','ro_id','ro_no','risk_rating','risk_level','residual_rating','residual_risk_level','created_at','updated_at','created_by','attachments']
        .forEach(k => delete payload[k]);
      if (editing.id) await api.put(`/risk-opportunities/${editing.id}`, payload);
      else await api.post('/risk-opportunities', payload);
      close(); fetchAll();
    } catch (e) {
      alert('Save failed: ' + (e?.response?.data?.detail || e.message));
    }
  };

  const remove = async (it) => {
    if (!window.confirm(`Delete ${it.ro_id}? (Admin only)`)) return;
    try { await api.delete(`/risk-opportunities/${it.id}`); fetchAll(); }
    catch (e) { alert('Delete failed: ' + (e?.response?.data?.detail || e.message)); }
  };

  const quickClose = async (it) => {
    const notes = window.prompt(`Closure notes for ${it.ro_id}?`);
    if (notes == null) return;
    try {
      const payload = { ...it, status: 'Closed', closure_notes: notes,
        closed_by: currentUser?.username || 'admin', closed_date: new Date().toISOString().slice(0,10) };
      delete payload.id; delete payload.ro_id; delete payload.ro_no;
      delete payload.risk_rating; delete payload.risk_level; delete payload.residual_rating; delete payload.residual_risk_level;
      delete payload.created_at; delete payload.updated_at; delete payload.created_by; delete payload.attachments;
      await api.put(`/risk-opportunities/${it.id}`, payload);
      fetchAll();
    } catch (e) { alert('Close failed: ' + (e?.response?.data?.detail || e.message)); }
  };

  const exportCSV = () => {
    const url = `${api.defaults.baseURL}/risk-opportunities/export.csv`;
    api.get('/risk-opportunities/export.csv', { responseType: 'blob' }).then(r => {
      const blob = new Blob([r.data], { type: 'text/csv' });
      const u = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = u; a.download = 'risk_opportunities.csv'; a.click();
      URL.revokeObjectURL(u);
    }).catch(() => { window.open(url, '_blank'); });
  };

  const exportPDF = async () => {
    const doc = await getControlledDocumentByModule(MODULE_REGISTER, { fallback: 'Risk & Opportunities', docType: 'Register' });
    const footer = buildDocControlFooter(doc, {
      title: 'Risk & Opportunities Register',
    });
    const rows = items.map(it => `<tr>
      <td>${esc(it.ro_id || '')}</td><td>${esc(formatDate(it.date_raised) || '')}</td>
      <td>${esc(it.area || '')}</td><td>${esc(it.type || '')}</td>
      <td>${esc(it.source || '')}</td><td>${esc(it.title || '')}</td>
      <td>${esc(it.risk_level || '')}</td><td>${esc(it.residual_risk_level || '')}</td>
      <td>${esc(it.responsible_person || '')}</td><td>${esc(formatDate(it.due_date) || '')}</td>
      <td>${esc(formatDate(it.next_review_date) || '')}</td><td>${esc(it.status || '')}</td>
    </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>Risk & Opportunities Register</title>
      <style>${buildPrintFooterCss()}
        @page { size: A4 landscape; margin: 8mm 8mm 14mm 8mm; }
        body { font-family: Arial, sans-serif; font-size: 9pt; color: #111; }
        h1 { font-size: 14pt; margin: 0 0 3mm 0; color: #1f2937; }
        .meta { font-size: 8.5pt; color: #555; margin-bottom: 3mm; }
        table.data { width: 100%; border-collapse: collapse; }
        table.data th, table.data td { border: 1px solid #333; padding: 3px 5px; text-align: left; vertical-align: top; font-size: 8.5pt; }
        table.data th { background: #1f2937; color: #fff; }
        table.data tr:nth-child(even) td { background: #f7f7f7; }
      </style></head><body>
      ${buildPrintBodyOpen(footer)}
      <h1>Risk &amp; Opportunities Register</h1>
      <div class="meta">${items.length} record(s) on file · printed ${esc(formatDate(new Date().toISOString()))}</div>
      <table class="data"><thead><tr>
        <th>ID</th><th>Date</th><th>Area</th><th>Type</th><th>Source</th><th>Title</th>
        <th>Risk</th><th>Residual</th><th>Responsible</th><th>Due</th><th>Next Review</th><th>Status</th>
      </tr></thead><tbody>${rows || '<tr><td colspan="12" style="text-align:center;color:#999;padding:6mm;">No records.</td></tr>'}</tbody></table>
      ${buildPrintBodyClose()}
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return alert('Popup blocked');
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (_) { /* blocked */ } }, 400);
  };

  const printRecord = async (rec) => {
    const doc = await getControlledDocumentByModule(MODULE_RECORD, { fallback: 'Risk & Opportunities', docType: 'Form' });
    const footer = buildDocControlFooter(doc, {
      title: `Risk & Opportunity — ${rec.ro_id}`,
    });
    const row = (l, v) => `<tr><td class="lbl">${esc(l)}</td><td>${esc(v == null || v === '' ? '—' : v)}</td></tr>`;
    const blk = (l, v) => `<h3>${esc(l)}</h3><div class="prose">${nl2br(v || '—')}</div>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>${esc(rec.ro_id)} — Risk &amp; Opportunity</title>
      <style>${buildPrintFooterCss()}
        @page { size: A4 portrait; margin: 10mm 10mm 14mm 10mm; }
        body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; }
        h1 { font-size: 15pt; margin: 0 0 1mm 0; color: #1f2937; }
        h2 { font-size: 10pt; margin: 4mm 0 1mm 0; background:#1f2937; color:#fff; padding: 1mm 2mm; text-transform: uppercase; letter-spacing: 0.05em; }
        h3 { font-size: 10pt; margin: 3mm 0 1mm 0; color: #374151; }
        table.meta { width: 100%; border-collapse: collapse; margin: 2mm 0; }
        table.meta td { border: 1px solid #333; padding: 3px 6px; vertical-align: top; font-size: 9pt; }
        td.lbl { background: #f3f4f6; font-weight: 700; width: 30%; }
        .prose { border: 1px solid #ccc; padding: 2mm; min-height: 10mm; background: #fafafa; font-size: 9pt; white-space: pre-wrap; }
        .badges span { display: inline-block; padding: 1mm 3mm; margin-right: 3mm; border: 1px solid #333; border-radius: 2mm; font-size: 9pt; font-weight: 700; }
        .b-high { background: #fee2e2; color: #991b1b; }
        .b-med { background: #fed7aa; color: #9a3412; }
        .b-low { background: #fef3c7; color: #854d0e; }
        .b-extreme { background: #fecaca; color: #7f1d1d; }
        .b-open { background: #fef3c7; color: #92400e; }
        .b-monitoring { background: #dbeafe; color: #1e40af; }
        .b-closed { background: #d1fae5; color: #065f46; }
      </style></head><body>
      ${buildPrintBodyOpen(footer)}
      <h1>${esc(rec.ro_id)} — ${esc(rec.title || '')}</h1>
      <div class="badges">
        <span>${esc(rec.area || '')}</span>
        <span>${esc(rec.type || '')}</span>
        ${rec.risk_level ? `<span class="b-${rec.risk_level.toLowerCase()}">Risk: ${esc(rec.risk_level)} (${esc(rec.risk_rating || '')})</span>` : ''}
        ${rec.residual_risk_level ? `<span class="b-${rec.residual_risk_level.toLowerCase()}">Residual: ${esc(rec.residual_risk_level)} (${esc(rec.residual_rating || '')})</span>` : ''}
        ${rec.status ? `<span class="b-${rec.status.toLowerCase()}">${esc(rec.status)}</span>` : ''}
      </div>
      <h2>Identification</h2>
      <table class="meta">
        ${row('Date Raised', formatDate(rec.date_raised))}
        ${row('Raised By', rec.raised_by)}
        ${row('Area', rec.area)}
        ${row('Type', rec.type)}
        ${row('Source', rec.source)}
        ${row('Linked Module', rec.linked_module)}
        ${row('Linked Record ID', rec.linked_record_id)}
        ${row('Process Affected', rec.process_affected)}
        ${row('Interested Parties', (rec.interested_parties || []).join(', '))}
      </table>
      <h2>Details</h2>
      ${blk('Description', rec.description)}
      ${blk('Potential Impact', rec.potential_impact)}
      ${blk('Existing Controls', rec.existing_controls)}
      <h2>Risk Rating</h2>
      <table class="meta">
        ${row('Likelihood', rec.likelihood)}
        ${row('Consequence', rec.consequence)}
        ${row('Risk Rating', rec.risk_rating)}
        ${row('Risk Level', rec.risk_level)}
      </table>
      <h2>Treatment / Action</h2>
      <table class="meta">
        ${row('Treatment Decision', rec.treatment_decision)}
        ${row('Further Action Required', rec.further_action_required)}
        ${row('Responsible Person', rec.responsible_person)}
        ${row('Due Date', formatDate(rec.due_date))}
        ${row('Action Status', rec.action_status)}
      </table>
      ${blk('Proposed Action', rec.proposed_action)}
      <h2>Review &amp; Residual Risk</h2>
      <table class="meta">
        ${row('Review Frequency', rec.review_frequency)}
        ${row('Next Review Date', formatDate(rec.next_review_date))}
        ${row('Residual Likelihood', rec.residual_likelihood)}
        ${row('Residual Consequence', rec.residual_consequence)}
        ${row('Residual Rating', rec.residual_rating)}
        ${row('Residual Risk Level', rec.residual_risk_level)}
      </table>
      ${blk('Review Comments', rec.review_comments)}
      <h2>Closure</h2>
      <table class="meta">
        ${row('Status', rec.status)}
        ${row('Closed By', rec.closed_by)}
        ${row('Closed Date', formatDate(rec.closed_date))}
      </table>
      ${blk('Closure Notes', rec.closure_notes)}
      ${buildPrintBodyClose()}
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return alert('Popup blocked');
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (_) { /* blocked */ } }, 400);
  };

  // ---- File upload helpers (only on edit) ----
  const uploadFile = async (f) => {
    if (!f || !editing?.id) return;
    const fd = new FormData(); fd.append('file', f);
    try {
      const r = await api.post(`/risk-opportunities/${editing.id}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setEditing(e => ({ ...e, attachments: [...(e.attachments || []), r.data] }));
    } catch (e) { alert('Upload failed: ' + (e?.response?.data?.detail || e.message)); }
  };
  const downloadAttach = async (att) => {
    try {
      const r = await api.get(`/risk-opportunities/attachments/${att.id}`, { responseType: 'blob' });
      const u = URL.createObjectURL(r.data);
      const a = document.createElement('a'); a.href = u; a.download = att.filename; a.click();
      URL.revokeObjectURL(u);
    } catch { alert('Download failed'); }
  };
  const removeAttach = async (att) => {
    if (!window.confirm(`Remove ${att.filename}?`)) return;
    await api.delete(`/risk-opportunities/${editing.id}/attachments/${att.id}`);
    setEditing(e => ({ ...e, attachments: (e.attachments || []).filter(a => a.id !== att.id) }));
  };

  // ---- DERIVED / RENDER ----
  const computedRating = editing && editing.likelihood && editing.consequence ? editing.likelihood * editing.consequence : null;
  const computedLevel = riskLevel(computedRating);
  const computedResidual = editing && editing.residual_likelihood && editing.residual_consequence ? editing.residual_likelihood * editing.residual_consequence : null;
  const computedResidualLevel = riskLevel(computedResidual);

  // ============================================================
  // VIEW MODAL
  // ============================================================
  if (viewing) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4" data-testid="ro-view-page">
        <div className="flex justify-between items-center">
          <div>
            <button onClick={close} className="text-sm text-blue-600 hover:underline mb-1 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</button>
            <h1 className="text-2xl font-bold">{viewing.ro_id} — {viewing.title}</h1>
            <div className="flex gap-2 text-sm mt-1">
              <span className="bg-gray-100 px-2 rounded">{viewing.area}</span>
              <span className="bg-gray-100 px-2 rounded">{viewing.type}</span>
              <span className={`inline-block px-2 py-0.5 rounded border text-xs font-bold ${RISK_LEVEL_BADGE[viewing.risk_level] || ''}`}>{viewing.risk_level} ({viewing.risk_rating})</span>
              <span className={`inline-block px-2 py-0.5 rounded border text-xs font-semibold ${STATUS_BADGE[viewing.status] || ''}`}>{viewing.status}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => printRecord(viewing)} data-testid="ro-print-record"><Download className="w-4 h-4 mr-1" /> Print Form</Button>
            <Button onClick={() => openEdit(viewing)} data-testid="ro-edit-from-view"><Edit className="w-4 h-4 mr-1" /> Edit</Button>
          </div>
        </div>
        <Card><CardContent className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {Object.entries({
            'Date Raised': formatDate(viewing.date_raised),
            'Raised By': viewing.raised_by, 'Source': viewing.source,
            'Linked Module': viewing.linked_module, 'Linked Record ID': viewing.linked_record_id,
            'Process Affected': viewing.process_affected,
            'Interested Parties': (viewing.interested_parties || []).join(', '),
            'Likelihood': viewing.likelihood, 'Consequence': viewing.consequence,
            'Treatment Decision': viewing.treatment_decision,
            'Further Action Required': viewing.further_action_required,
            'Responsible Person': viewing.responsible_person,
            'Due Date': formatDate(viewing.due_date), 'Action Status': viewing.action_status,
            'Review Frequency': viewing.review_frequency,
            'Next Review Date': formatDate(viewing.next_review_date),
            'Residual L × C': `${viewing.residual_likelihood || ''} × ${viewing.residual_consequence || ''} = ${viewing.residual_rating || ''} (${viewing.residual_risk_level || ''})`,
            'Closed By': viewing.closed_by, 'Closed Date': formatDate(viewing.closed_date),
          }).map(([k, v]) => (
            <div key={k}><span className="text-gray-500 text-xs">{k}</span><div className="font-medium">{v || '—'}</div></div>
          ))}
          {['description','potential_impact','existing_controls','proposed_action','review_comments','closure_notes'].map(k => (
            <div key={k} className="md:col-span-2"><span className="text-gray-500 text-xs">{k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</span><div className="whitespace-pre-wrap border rounded p-2 bg-gray-50">{viewing[k] || '—'}</div></div>
          ))}
          {(viewing.attachments || []).length > 0 && (
            <div className="md:col-span-2">
              <span className="text-gray-500 text-xs">Attachments</span>
              <div className="space-y-1 mt-1">
                {(viewing.attachments || []).map(a => (
                  <div key={a.id} className="flex items-center gap-2 border rounded p-2 bg-gray-50">
                    <FileText className="w-4 h-4" /> <span className="flex-1">{a.filename}</span>
                    <Button size="sm" variant="outline" onClick={async () => {
                      const r = await api.get(`/risk-opportunities/attachments/${a.id}`, { responseType: 'blob' });
                      const u = URL.createObjectURL(r.data);
                      const x = document.createElement('a'); x.href = u; x.download = a.filename; x.click();
                    }}><Download className="w-3 h-3 mr-1" /> Download</Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent></Card>
      </div>
    );
  }

  // ============================================================
  // EDIT FORM
  // ============================================================
  if (editing) {
    const r = ref || {};
    const userOpts = users.map(u => ({ id: u.id, label: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email }));
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4" data-testid="ro-form-page">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <button onClick={close} className="text-sm text-blue-600 hover:underline mb-1 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back to register</button>
            <h1 className="text-2xl font-bold">{editing.id ? `${editing.ro_id} — Edit` : 'New Risk / Opportunity'}</h1>
          </div>
          <Button onClick={save} data-testid="ro-save"><Save className="w-4 h-4 mr-1" /> Save</Button>
        </div>

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Identification</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Date Raised</Label><Input type="date" value={editing.date_raised || ''} onChange={e => updateField({ date_raised: e.target.value })} /></div>
            <div><Label>Raised By</Label><Input value={editing.raised_by || ''} onChange={e => updateField({ raised_by: e.target.value })} placeholder="username" /></div>
            <div><Label>Type *</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.type || ''} onChange={e => updateField({ type: e.target.value })} data-testid="ro-type">
                {(r.types || []).map(t => <option key={t}>{t}</option>)}
              </select></div>
            <div><Label>Area *</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.area || ''} onChange={e => updateField({ area: e.target.value })} data-testid="ro-area">
                <option value="">—</option>{(r.areas || []).map(t => <option key={t}>{t}</option>)}
              </select></div>
            <div><Label>Source *</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.source || ''} onChange={e => updateField({ source: e.target.value })} data-testid="ro-source">
                <option value="">—</option>{(r.sources || []).map(t => <option key={t}>{t}</option>)}
              </select></div>
            <div><Label>Linked Module</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.linked_module || ''} onChange={e => updateField({ linked_module: e.target.value })}>
                <option value="">—</option>{(r.linked_modules || []).map(t => <option key={t}>{t}</option>)}
              </select></div>
            <div><Label>Linked Record ID</Label><Input value={editing.linked_record_id || ''} onChange={e => updateField({ linked_record_id: e.target.value })} placeholder="e.g. NCR-0007" /></div>
            <div className="md:col-span-2"><Label>Title *</Label><Input value={editing.title} onChange={e => updateField({ title: e.target.value })} data-testid="ro-title" /></div>
          </CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2"><Label>Description *</Label><Textarea rows={3} value={editing.description || ''} onChange={e => updateField({ description: e.target.value })} data-testid="ro-desc" /></div>
            <div className="md:col-span-2"><Label>Potential Impact</Label><Textarea rows={2} value={editing.potential_impact || ''} onChange={e => updateField({ potential_impact: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Existing Controls *</Label><Textarea rows={2} value={editing.existing_controls || ''} onChange={e => updateField({ existing_controls: e.target.value })} data-testid="ro-controls" /></div>
            <div><Label>Process Affected</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.process_affected || ''} onChange={e => updateField({ process_affected: e.target.value })}>
                <option value="">—</option>{(r.processes || []).map(t => <option key={t}>{t}</option>)}
              </select></div>
            <div><Label>Interested Parties Affected</Label>
              <div className="border rounded p-2 grid grid-cols-2 gap-1 text-xs">
                {(r.interested_parties || []).map(p => (
                  <label key={p} className="flex items-center gap-1">
                    <input type="checkbox" checked={(editing.interested_parties || []).includes(p)}
                      onChange={() => updateField({ interested_parties: (editing.interested_parties || []).includes(p) ? editing.interested_parties.filter(x => x !== p) : [...(editing.interested_parties || []), p] })} />
                    {p}
                  </label>
                ))}
              </div>
            </div>
          </CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Risk Rating</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div><Label>Likelihood *</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.likelihood || ''} onChange={e => updateField({ likelihood: e.target.value ? parseInt(e.target.value) : null })} data-testid="ro-likelihood">
                <option value="">—</option>
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} — {(r.likelihood_labels || {})[n]}</option>)}
              </select></div>
            <div><Label>Consequence *</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.consequence || ''} onChange={e => updateField({ consequence: e.target.value ? parseInt(e.target.value) : null })} data-testid="ro-consequence">
                <option value="">—</option>
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} — {(r.consequence_labels || {})[n]}</option>)}
              </select></div>
            <div><Label>Risk Rating</Label><Input value={computedRating ?? ''} readOnly className="bg-gray-50 font-bold" data-testid="ro-rating" /></div>
            <div><Label>Risk Level</Label>
              <div className={`inline-block px-3 py-1.5 rounded border text-sm font-bold ${RISK_LEVEL_BADGE[computedLevel] || 'bg-gray-50'}`} data-testid="ro-level">{computedLevel || '—'}</div>
            </div>
          </CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Treatment / Action</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Treatment Decision</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.treatment_decision || ''} onChange={e => updateField({ treatment_decision: e.target.value })} data-testid="ro-treatment">
                <option value="">—</option>{(r.treatment_decisions || []).map(t => <option key={t}>{t}</option>)}
              </select></div>
            <div><Label>Further Action Required?</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.further_action_required || 'No'} onChange={e => updateField({ further_action_required: e.target.value })}>
                <option>No</option><option>Yes</option>
              </select></div>
            <div><Label>Action Status</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.action_status || ''} onChange={e => updateField({ action_status: e.target.value })}>
                {(r.action_statuses || []).map(t => <option key={t}>{t}</option>)}
              </select></div>
            <div className="md:col-span-3"><Label>Proposed Action</Label><Textarea rows={2} value={editing.proposed_action || ''} onChange={e => updateField({ proposed_action: e.target.value })} /></div>
            <div><Label>Responsible Person</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.responsible_person || ''} onChange={e => updateField({ responsible_person: e.target.value })}>
                <option value="">—</option>{userOpts.map(u => <option key={u.id} value={u.label}>{u.label}</option>)}
              </select></div>
            <div><Label>Due Date</Label><Input type="date" value={editing.due_date || ''} onChange={e => updateField({ due_date: e.target.value })} /></div>
          </CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Review &amp; Residual Risk</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div><Label>Review Frequency</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.review_frequency || ''} onChange={e => updateField({ review_frequency: e.target.value })}>
                <option value="">—</option>{(r.review_frequencies || []).map(t => <option key={t}>{t}</option>)}
              </select></div>
            <div><Label>Next Review Date</Label><Input type="date" value={editing.next_review_date || ''} onChange={e => updateField({ next_review_date: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Review Comments</Label><Input value={editing.review_comments || ''} onChange={e => updateField({ review_comments: e.target.value })} /></div>
            <div><Label>Residual Likelihood</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.residual_likelihood || ''} onChange={e => updateField({ residual_likelihood: e.target.value ? parseInt(e.target.value) : null })}>
                <option value="">—</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n} — {(r.likelihood_labels || {})[n]}</option>)}
              </select></div>
            <div><Label>Residual Consequence</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.residual_consequence || ''} onChange={e => updateField({ residual_consequence: e.target.value ? parseInt(e.target.value) : null })}>
                <option value="">—</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n} — {(r.consequence_labels || {})[n]}</option>)}
              </select></div>
            <div><Label>Residual Rating</Label><Input value={computedResidual ?? ''} readOnly className="bg-gray-50 font-bold" /></div>
            <div><Label>Residual Risk Level</Label>
              <div className={`inline-block px-3 py-1.5 rounded border text-sm font-bold ${RISK_LEVEL_BADGE[computedResidualLevel] || 'bg-gray-50'}`}>{computedResidualLevel || '—'}</div>
            </div>
          </CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Closure</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Status</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.status || ''} onChange={e => {
                const newStatus = e.target.value;
                const patch = { status: newStatus };
                if (newStatus === 'Closed') {
                  if (!editing.closed_date) patch.closed_date = new Date().toISOString().slice(0,10);
                  if (!editing.closed_by) patch.closed_by = currentUser?.username || '';
                }
                updateField(patch);
              }} data-testid="ro-status">
                {(r.statuses || []).map(t => <option key={t}>{t}</option>)}
              </select></div>
            <div><Label>Closed By</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.closed_by || ''} onChange={e => updateField({ closed_by: e.target.value })}>
                <option value="">—</option>{userOpts.map(u => <option key={u.id} value={u.label}>{u.label}</option>)}
              </select></div>
            <div><Label>Closed Date</Label><Input type="date" value={editing.closed_date || ''} onChange={e => updateField({ closed_date: e.target.value })} /></div>
            <div className="md:col-span-3"><Label>Closure Notes</Label><Textarea rows={2} value={editing.closure_notes || ''} onChange={e => updateField({ closure_notes: e.target.value })} /></div>
          </CardContent></Card>

        {editing.id && (
          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Attachments (evidence)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <label className="inline-flex items-center gap-2 px-3 py-2 border-2 border-dashed border-blue-300 rounded cursor-pointer hover:bg-blue-50 text-sm">
                <Upload className="w-4 h-4" /> Upload file (max 20MB)
                <input type="file" className="hidden" onChange={e => uploadFile(e.target.files?.[0])} data-testid="ro-upload" />
              </label>
              {(editing.attachments || []).map(a => (
                <div key={a.id} className="flex items-center gap-2 border rounded p-2 bg-gray-50">
                  <FileText className="w-4 h-4" /> <span className="flex-1">{a.filename}</span>
                  <span className="text-xs text-gray-500">{(a.size/1024).toFixed(1)} KB</span>
                  <Button size="sm" variant="outline" onClick={() => downloadAttach(a)}><Download className="w-3 h-3" /></Button>
                  <Button size="sm" variant="outline" onClick={() => removeAttach(a)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              ))}
            </CardContent></Card>
        )}
      </div>
    );
  }

  // ============================================================
  // REGISTER VIEW
  // ============================================================
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="ro-page">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Risk &amp; Opportunities Register</h1>
          <p className="text-gray-600 text-sm mt-1">IMS Control · ISO 9001 / 14001 / 45001 <span className="ml-1 font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{docInfo?.form_no || '—'}</span></p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={exportCSV} data-testid="ro-export-csv"><Download className="w-4 h-4 mr-1" /> Export CSV</Button>
          <Button variant="outline" onClick={exportPDF} data-testid="ro-export-pdf"><Download className="w-4 h-4 mr-1" /> Export PDF</Button>
          <Button onClick={openNew} data-testid="ro-new"><Plus className="w-4 h-4 mr-1" /> New Risk / Opportunity</Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-l-4 border-l-amber-600"><CardContent className="pt-4 pb-3"><div className="text-xs text-gray-500">Open / Monitoring</div><div className="text-3xl font-bold text-amber-700" data-testid="ro-stat-open">{stats.open}</div></CardContent></Card>
          <Card className="border-l-4 border-l-red-600"><CardContent className="pt-4 pb-3"><div className="text-xs text-gray-500">High / Extreme</div><div className="text-3xl font-bold text-red-700">{stats.high_extreme}</div></CardContent></Card>
          <Card className="border-l-4 border-l-orange-600"><CardContent className="pt-4 pb-3"><div className="text-xs text-gray-500">Overdue Actions</div><div className="text-3xl font-bold text-orange-700">{stats.overdue_actions}</div></CardContent></Card>
          <Card className="border-l-4 border-l-blue-600"><CardContent className="pt-4 pb-3"><div className="text-xs text-gray-500">Reviews due ≤30d</div><div className="text-3xl font-bold text-blue-700">{stats.reviews_due_30}</div></CardContent></Card>
        </div>
      )}

      {stats && (stats.by_area || stats.by_source || stats.by_status) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { label: 'By Area', data: stats.by_area },
            { label: 'By Source', data: stats.by_source },
            { label: 'By Status', data: stats.by_status },
          ].map(({ label, data }) => (
            <Card key={label}><CardHeader className="pb-2"><CardTitle className="text-sm">{label}</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-0.5">
                {Object.entries(data || {}).map(([k, v]) => <div key={k} className="flex justify-between"><span>{k}</span><span className="font-bold">{v}</span></div>)}
                {Object.keys(data || {}).length === 0 && <span className="text-gray-400">No data yet.</span>}
              </CardContent></Card>
          ))}
        </div>
      )}

      <Card><CardContent className="pt-6 grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
        <div className="col-span-2"><Label className="text-xs">Search</Label><Input value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} onKeyDown={e => e.key === 'Enter' && fetchAll()} placeholder="Title, ID, linked record…" data-testid="ro-search" /></div>
        <div><Label className="text-xs">Area</Label><select className="border rounded h-9 px-2 w-full text-sm" value={filters.area} onChange={e => setFilters({ ...filters, area: e.target.value })}><option value="">All</option>{(ref?.areas || []).map(a => <option key={a}>{a}</option>)}</select></div>
        <div><Label className="text-xs">Type</Label><select className="border rounded h-9 px-2 w-full text-sm" value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}><option value="">All</option>{(ref?.types || []).map(a => <option key={a}>{a}</option>)}</select></div>
        <div><Label className="text-xs">Risk Level</Label><select className="border rounded h-9 px-2 w-full text-sm" value={filters.risk_level} onChange={e => setFilters({ ...filters, risk_level: e.target.value })}><option value="">All</option><option>Low</option><option>Medium</option><option>High</option><option>Extreme</option></select></div>
        <div><Label className="text-xs">Status</Label><select className="border rounded h-9 px-2 w-full text-sm" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="">All</option>{(ref?.statuses || []).map(a => <option key={a}>{a}</option>)}</select></div>
        <div><Label className="text-xs">Source</Label><select className="border rounded h-9 px-2 w-full text-sm" value={filters.source} onChange={e => setFilters({ ...filters, source: e.target.value })}><option value="">All</option>{(ref?.sources || []).map(a => <option key={a}>{a}</option>)}</select></div>
        <div><Label className="text-xs">Linked Module</Label><select className="border rounded h-9 px-2 w-full text-sm" value={filters.linked_module} onChange={e => setFilters({ ...filters, linked_module: e.target.value })}><option value="">All</option>{(ref?.linked_modules || []).map(a => <option key={a}>{a}</option>)}</select></div>
        <div className="col-span-2 flex gap-3 text-xs items-center">
          <label className="flex items-center gap-1"><input type="checkbox" checked={filters.overdue} onChange={e => setFilters({ ...filters, overdue: e.target.checked })} /> Overdue only</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={filters.review_due} onChange={e => setFilters({ ...filters, review_due: e.target.checked })} /> Reviews due ≤30d</label>
        </div>
        <Button onClick={fetchAll}><Search className="w-4 h-4 mr-1" /> Apply</Button>
      </CardContent></Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle>{items.length} record{items.length === 1 ? '' : 's'}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr>
              <th className="text-left p-2 border">ID</th><th className="text-left p-2 border">Date</th>
              <th className="text-left p-2 border">Area</th><th className="text-left p-2 border">Type</th>
              <th className="text-left p-2 border">Source</th><th className="text-left p-2 border">Title</th>
              <th className="text-left p-2 border">Risk</th><th className="text-left p-2 border">Residual</th>
              <th className="text-left p-2 border">Responsible</th><th className="text-left p-2 border">Due</th>
              <th className="text-left p-2 border">Next Review</th><th className="text-left p-2 border">Status</th>
              <th className="text-left p-2 border w-32">Actions</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={13} className="text-center text-gray-500 py-6">Loading…</td></tr>}
              {!loading && items.length === 0 && <tr><td colSpan={13} className="text-center text-gray-500 py-6">No records yet. Click &quot;New Risk / Opportunity&quot; to add your first.</td></tr>}
              {items.map(it => (
                <tr key={it.id} className="hover:bg-gray-50">
                  <td className="p-2 border font-mono font-bold">{it.ro_id}</td>
                  <td className="p-2 border">{formatDate(it.date_raised)}</td>
                  <td className="p-2 border">{it.area}</td>
                  <td className="p-2 border">{it.type}</td>
                  <td className="p-2 border text-xs">{it.source}</td>
                  <td className="p-2 border max-w-[260px] truncate" title={it.title}>{it.title}</td>
                  <td className="p-2 border">{it.risk_level && <span className={`inline-block px-2 py-0.5 rounded border text-xs font-bold ${RISK_LEVEL_BADGE[it.risk_level]}`}>{it.risk_level} ({it.risk_rating})</span>}</td>
                  <td className="p-2 border">{it.residual_risk_level && <span className={`inline-block px-2 py-0.5 rounded border text-xs font-bold ${RISK_LEVEL_BADGE[it.residual_risk_level]}`}>{it.residual_risk_level} ({it.residual_rating})</span>}</td>
                  <td className="p-2 border text-xs">{it.responsible_person || ''}</td>
                  <td className="p-2 border text-xs">{formatDate(it.due_date)}</td>
                  <td className="p-2 border text-xs">{formatDate(it.next_review_date)}</td>
                  <td className="p-2 border">{it.status && <span className={`inline-block px-2 py-0.5 rounded border text-xs font-semibold ${STATUS_BADGE[it.status]}`}>{it.status}</span>}</td>
                  <td className="p-2 border whitespace-nowrap">
                    <button onClick={() => openView(it)} className="text-gray-700 hover:underline mr-1" title="View"><Eye className="w-4 h-4 inline" /></button>
                    <button onClick={() => openEdit(it)} className="text-blue-600 hover:underline mr-1" title="Edit" data-testid={`ro-edit-${it.id}`}><Edit className="w-4 h-4 inline" /></button>
                    {it.status !== 'Closed' && <button onClick={() => quickClose(it)} className="text-green-700 hover:underline mr-1" title="Close" data-testid={`ro-close-${it.id}`}>Close</button>}
                    <button onClick={() => remove(it)} className="text-red-600 hover:underline" title="Delete (Admin)"><Trash2 className="w-4 h-4 inline" /></button>
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

export default RiskOpportunities;
