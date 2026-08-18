import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Plus, Search, Edit, Trash2, X as XIcon, Save, Printer, BellRing, Upload, Download, FileText } from 'lucide-react';
import api from '../services/api';
import { formatDate } from '../utils/dateFormatter';
import {
  getControlledDocumentByModule,
  buildDocControlFooter,
  buildPrintFooterCss,
  buildPrintBodyOpen,
  buildPrintBodyClose,
} from '../utils/documentControl';

const MODULE_NAME = 'Forklift License Register';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

const addYears = (iso, n) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  d.setFullYear(d.getFullYear() + n);
  return d.toISOString().slice(0, 10);
};

const STATUS_STYLES = {
  current: 'bg-green-100 text-green-700',
  expiring_soon: 'bg-amber-100 text-amber-700',
  expired: 'bg-red-100 text-red-700',
  missing: 'bg-gray-100 text-gray-500',
};

const ForkliftRegister = () => {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [editing, setEditing] = useState(null);  // null | {} (new) | record (edit)
  const [uploading, setUploading] = useState(false);
  const [docInfo, setDocInfo] = useState(null);

  const blank = { name: '', employee_id: '', license_number: '', issue_date: '', expiry_date: '', notes: '', file_id: '', file_name: '' };

  const uploadFile = async (f) => {
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await api.post('/compliance/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      updateField({ file_id: res.data.id, file_name: res.data.filename });
    } catch (e) {
      alert('Upload failed: ' + (e?.response?.data?.detail || e.message));
    } finally {
      setUploading(false);
    }
  };

  const downloadFile = async (fileId, filename) => {
    try {
      const res = await api.get(`/compliance/files/${fileId}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = filename || 'forklift-licence';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert('Download failed'); }
  };

  useEffect(() => {
    fetchAll();
    getControlledDocumentByModule(MODULE_NAME, { fallback: 'Forklift Register', docType: 'Register' }).then(setDocInfo);
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const [list, st, emp] = await Promise.all([
        api.get('/compliance/forklift', { params }),
        api.get('/compliance/forklift/stats'),
        api.get('/employees'),
      ]);
      setItems(list.data.items || []);
      setStats(st.data || {});
      setEmployees(emp.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const employeeNames = useMemo(
    () => Array.from(new Set(
      (employees || [])
        .filter(e => (e.status || 'Active') === 'Active')
        .map(e => (e.name || `${e.first_name || ''} ${e.last_name || ''}`).trim())
        .filter(Boolean)
    )).sort(),
    [employees],
  );

  const openNew = () => setEditing({ ...blank });
  const openEdit = (rec) => setEditing({ ...blank, ...rec });
  const close = () => setEditing(null);

  const updateField = (patch) => {
    setEditing(e => {
      const next = { ...e, ...patch };
      // Forklift licence default: +5 years from issue date
      if ('issue_date' in patch && patch.issue_date && !next.expiry_date) {
        next.expiry_date = addYears(patch.issue_date, 5);
      }
      return next;
    });
  };

  const save = async () => {
    if (!editing.name) return alert('Name is required');
    try {
      const payload = { ...editing };
      delete payload.status; delete payload.created_at; delete payload.updated_at; delete payload.created_by;
      if (editing.id) {
        await api.put(`/compliance/forklift/${editing.id}`, payload);
      } else {
        await api.post('/compliance/forklift', payload);
      }
      close(); fetchAll();
    } catch (e) {
      alert('Failed to save: ' + (e?.response?.data?.detail || e.message));
    }
  };

  const remove = async (rec) => {
    if (!window.confirm(`Delete forklift license for ${rec.name}?`)) return;
    try {
      await api.delete(`/compliance/forklift/${rec.id}`);
      fetchAll();
    } catch (e) { alert('Failed to delete'); }
  };

  const handlePrint = async () => {
    const doc = await getControlledDocumentByModule(MODULE_NAME, { fallback: 'Forklift Register', docType: 'Register' });
    const footer = buildDocControlFooter(doc, {
      title: 'Forklift License Register',
    });
    const rows = items.map(it => `
      <tr>
        <td>${esc(it.name)}</td>
        <td>${esc(it.license_number || '')}</td>
        <td>${esc(formatDate(it.issue_date))}</td>
        <td>${esc(formatDate(it.expiry_date))}</td>
        <td>${esc((it.status || '').replace('_', ' '))}</td>
      </tr>
    `).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>Forklift License Register</title>
      <style>${buildPrintFooterCss()}
        @page { size: A4 portrait; margin: 12mm; }
        body { font-size: 10pt; color:#111; }
        h1 { text-align:center; font-size:14pt; margin:0 0 4mm 0; }
        h2 { text-align:center; font-size:11pt; color:#555; font-weight:normal; margin:0 0 4mm; }
        table { width:100%; border-collapse:collapse; }
        th, td { border:1px solid #333; padding:4px 6px; text-align:left; font-size:9.5pt; }
        th { background:#f3f4f6; }
        .meta { display:flex; gap:18mm; font-size:9pt; color:#555; margin:2mm 0 4mm; }
      </style></head><body>
      ${buildPrintBodyOpen(footer)}
      <h1>ULTIMATE LASER PTY LTD</h1>
      <h2>Forklift License Register</h2>
      <div class="meta">
        <span><strong>Generated:</strong> ${esc(formatDate(new Date().toISOString()))}</span>
        <span><strong>Total:</strong> ${items.length}</span>
        <span><strong>Current:</strong> ${stats?.current ?? 0}</span>
        <span><strong>Expiring Soon:</strong> ${stats?.expiring_soon ?? 0}</span>
        <span><strong>Expired:</strong> ${stats?.expired ?? 0}</span>
      </div>
      <table>
        <thead><tr><th>Name</th><th>License #</th><th>Issue Date</th><th>Expiry Date</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${buildPrintBodyClose()}
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (_) { /* blocked */ } }, 250);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="forklift-register-page">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Forklift License Register</h1>
          <p className="text-gray-600 mt-1 text-sm">
            ISO compliance register{' '}
            <span className="ml-1 inline-block text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-mono">
              {docInfo?.form_no || '—'}
            </span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={async () => {
            try {
              const r = await api.post('/notifications/check-alerts');
              const n = r.data?.alerts_created || 0;
              alert(n > 0 ? `${n} new expiry alert(s) added to the bell.` : 'No new expiry alerts — all licenses are current or already alerted.');
            } catch (e) { alert('Scan failed: ' + (e?.response?.data?.detail || e.message)); }
          }} data-testid="fl-check-expiry">
            <BellRing className="w-4 h-4 mr-2" /> Check Expiries
          </Button>
          <Button variant="outline" onClick={handlePrint} data-testid="fl-print">
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
          <Button onClick={openNew} data-testid="fl-new"><Plus className="w-4 h-4 mr-2" /> New License</Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="fl-stats">
          {[
            { key: 'current', label: 'Current', cls: 'border-l-green-600', txt: 'text-green-700', testid: 'fl-stat-current' },
            { key: 'expiring_soon', label: 'Expiring Soon (≤90d)', cls: 'border-l-amber-500', txt: 'text-amber-600', testid: 'fl-stat-expiring' },
            { key: 'expired', label: 'Expired', cls: 'border-l-red-600', txt: 'text-red-700', testid: 'fl-stat-expired' },
            { key: 'missing', label: 'Missing Expiry', cls: 'border-l-gray-400', txt: 'text-gray-600', testid: 'fl-stat-missing' },
            { key: 'total', label: 'Total', cls: 'border-l-blue-600', txt: 'text-blue-700', testid: 'fl-stat-total' },
          ].map(s => (
            <Card key={s.key} className={`border-l-4 ${s.cls}`}>
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-gray-500">{s.label}</div>
                <div className={`text-3xl font-bold ${s.txt}`} data-testid={s.testid}>{stats[s.key] ?? 0}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-gray-500">Search</Label>
              <Input placeholder="Name, license number…" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchAll()} data-testid="fl-search" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Status</Label>
              <select className="border rounded px-3 py-2 text-sm h-10" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} data-testid="fl-status">
                <option value="">All</option>
                <option value="current">Current</option>
                <option value="expiring_soon">Expiring Soon</option>
                <option value="expired">Expired</option>
                <option value="missing">Missing Expiry</option>
              </select>
            </div>
            <Button onClick={fetchAll} data-testid="fl-search-btn"><Search className="w-4 h-4 mr-1" /> Search</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle>{items.length} record{items.length === 1 ? '' : 's'}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="fl-table">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2 border">Name</th>
                <th className="text-left p-2 border">License #</th>
                <th className="text-left p-2 border">Issue Date</th>
                <th className="text-left p-2 border">Expiry Date</th>
                <th className="text-left p-2 border">Status</th>
                <th className="text-left p-2 border">Notes</th>
                <th className="text-left p-2 border">File</th>
                <th className="text-left p-2 border w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="text-center text-gray-500 py-6">Loading…</td></tr>}
              {!loading && items.length === 0 && <tr><td colSpan={8} className="text-center text-gray-500 py-6">No licenses on file.</td></tr>}
              {items.map(it => (
                <tr key={it.id} className="hover:bg-gray-50">
                  <td className="p-2 border font-medium">{it.name}</td>
                  <td className="p-2 border font-mono">{it.license_number || ''}</td>
                  <td className="p-2 border whitespace-nowrap">{formatDate(it.issue_date)}</td>
                  <td className="p-2 border whitespace-nowrap">{formatDate(it.expiry_date)}</td>
                  <td className="p-2 border">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_STYLES[it.status] || 'bg-gray-100'}`}>
                      {(it.status || 'missing').replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-2 border text-xs text-gray-600 max-w-[260px] truncate" title={it.notes}>{it.notes || ''}</td>
                  <td className="p-2 border">
                    {it.file_id ? (
                      <button onClick={() => downloadFile(it.file_id, it.file_name)} className="text-green-700 hover:underline inline-flex items-center gap-1" title={it.file_name} data-testid={`fl-download-${it.id}`}>
                        <Download className="w-4 h-4" /> <span className="text-xs">View</span>
                      </button>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="p-2 border whitespace-nowrap">
                    <button onClick={() => openEdit(it)} className="text-blue-600 hover:underline mr-2" data-testid={`fl-edit-${it.id}`}><Edit className="w-4 h-4 inline" /></button>
                    <button onClick={() => remove(it)} className="text-red-600 hover:underline" data-testid={`fl-delete-${it.id}`}><Trash2 className="w-4 h-4 inline" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-xl" data-testid="fl-modal">
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <span>{editing.id ? 'Edit License' : 'New Forklift License'}</span>
                <Button variant="ghost" size="sm" onClick={close}><XIcon className="w-4 h-4" /></Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Name <span className="text-red-500">*</span></Label>
                <div className="flex gap-1">
                  <select className="border rounded px-2 py-2 text-sm flex-1 h-10" value={employeeNames.includes(editing.name) ? editing.name : ''} onChange={(e) => updateField({ name: e.target.value })}>
                    <option value="">— select employee —</option>
                    {employeeNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <Input value={!employeeNames.includes(editing.name) ? editing.name : ''} onChange={e => updateField({ name: e.target.value })} placeholder="or type name" className="w-40" data-testid="fl-input-name" />
                </div>
              </div>
              <div>
                <Label>License Number</Label>
                <Input value={editing.license_number || ''} onChange={e => updateField({ license_number: e.target.value })} data-testid="fl-input-licno" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Issue Date</Label>
                  <Input type="date" value={editing.issue_date || ''} onChange={e => updateField({ issue_date: e.target.value })} data-testid="fl-input-issue" />
                </div>
                <div>
                  <Label>Expiry Date <span className="text-[10px] text-gray-400">(auto +5y)</span></Label>
                  <Input type="date" value={editing.expiry_date || ''} onChange={e => updateField({ expiry_date: e.target.value })} data-testid="fl-input-expiry" />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={editing.notes || ''} onChange={e => updateField({ notes: e.target.value })} placeholder="e.g. LF / Counterbalance / High Reach" />
              </div>
              <div>
                <Label>Licence Photo / File <span className="text-[10px] text-gray-400">(PDF or image, max 10 MB)</span></Label>
                {editing.file_id ? (
                  <div className="flex items-center gap-2 mt-1 border rounded p-2 bg-gray-50">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span className="text-sm flex-1 truncate" data-testid="fl-file-name">{editing.file_name}</span>
                    <Button size="sm" variant="outline" onClick={() => downloadFile(editing.file_id, editing.file_name)} data-testid="fl-file-download">
                      <Download className="w-3.5 h-3.5 mr-1" /> View
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => updateField({ file_id: '', file_name: '' })} data-testid="fl-file-remove">
                      Remove
                    </Button>
                  </div>
                ) : (
                  <label className="inline-flex items-center gap-2 mt-1 px-3 py-2 border-2 border-dashed border-blue-300 rounded cursor-pointer hover:bg-blue-50 text-sm">
                    <Upload className="w-4 h-4" />
                    {uploading ? 'Uploading…' : 'Choose file (PDF/Image, max 10MB)'}
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.heic" className="hidden" onChange={e => uploadFile(e.target.files?.[0])} data-testid="fl-file-input" />
                  </label>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={save} className="flex-1" data-testid="fl-save"><Save className="w-4 h-4 mr-2" /> Save</Button>
                <Button variant="outline" onClick={close}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ForkliftRegister;
