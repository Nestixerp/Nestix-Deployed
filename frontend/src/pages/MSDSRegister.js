import React, { useState, useEffect, useMemo, useRef } from 'react';
import api from '../services/api';
import { formatDate } from '../utils/dateFormatter';
import {
  getControlledDocumentByModule, buildDocControlFooter,
  buildPrintFooterCss, buildPrintFooterHtml, buildPrintBodyOpen, buildPrintBodyClose, invalidateDocControlCache
} from '../utils/documentControl';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, Printer, Save, X, FileText, Upload, Download, Eye, AlertTriangle, CheckCircle2, Loader2
} from 'lucide-react';

const todayISO = () => new Date().toISOString().split('T')[0];
const addYearsISO = (iso, years) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try { d.setFullYear(d.getFullYear() + years); }
  catch { return ''; }
  return d.toISOString().split('T')[0];
};
const daysUntil = (iso) => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!t) return null;
  return Math.ceil((t - Date.now()) / (1000 * 60 * 60 * 24));
};
const expiryStatus = (iso) => {
  const days = daysUntil(iso);
  if (days === null) return { label: '—', cls: 'text-slate-400 text-xs', bucket: 'NoDate', days: null };
  if (days < 0) return { label: `Expired ${Math.abs(days)}d ago`, cls: 'bg-red-100 text-red-800 border-red-300', bucket: 'Expired', days };
  if (days <= 90) return { label: `Expiring in ${days}d`, cls: 'bg-amber-100 text-amber-800 border-amber-300', bucket: 'Soon', days };
  return { label: `Valid (${days}d)`, cls: 'bg-green-100 text-green-800 border-green-300', bucket: 'Valid', days };
};

const emptyForm = () => ({
  name: '', supplier: '', hazardous: 'NO', dangerous_goods_class: '',
  date_of_issue: '', date_of_expiry: '', volume: '', notes: ''
});

export default function MSDSRegister() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All'); // All | Expired | Soon | Valid
  const [filterHaz, setFilterHaz] = useState('All'); // All | YES | NO
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);
  const fileInputRefs = useRef({});

  useEffect(() => { fetchItems(); }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await api.get('/msds');
      setItems(res.data || []);
    } catch { toast.error('Failed to load MSDS register'); }
    finally { setLoading(false); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (filterHaz !== 'All' && (i.hazardous || 'NO') !== filterHaz) return false;
      if (filterStatus !== 'All') {
        const b = expiryStatus(i.date_of_expiry).bucket;
        if (b !== filterStatus) return false;
      }
      if (!q) return true;
      return [i.name, i.supplier, i.dangerous_goods_class, i.volume, i.notes]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [items, search, filterStatus, filterHaz]);

  const counts = useMemo(() => {
    const c = { Expired: 0, Soon: 0, Valid: 0 };
    items.forEach((i) => {
      const b = expiryStatus(i.date_of_expiry).bucket;
      if (c[b] !== undefined) c[b] += 1;
    });
    return c;
  }, [items]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name || '',
      supplier: item.supplier || '',
      hazardous: item.hazardous || 'NO',
      dangerous_goods_class: item.dangerous_goods_class || '',
      date_of_issue: item.date_of_issue || '',
      date_of_expiry: item.date_of_expiry || '',
      volume: item.volume || '',
      notes: item.notes || ''
    });
    setDialogOpen(true);
  };

  const updateForm = (field, value) => {
    const next = { ...form, [field]: value };
    if (field === 'date_of_issue') {
      // Auto-fill expiry if blank or it was equal to old +5y
      const proposed = addYearsISO(value, 5);
      const oldProposed = addYearsISO(form.date_of_issue, 5);
      if (!next.date_of_expiry || next.date_of_expiry === oldProposed) {
        next.date_of_expiry = proposed;
      }
    }
    setForm(next);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        date_of_expiry: form.date_of_expiry || (form.date_of_issue ? addYearsISO(form.date_of_issue, 5) : '')
      };
      if (editingId) {
        await api.put(`/msds/${editingId}`, payload);
        toast.success('MSDS updated');
      } else {
        await api.post('/msds', payload);
        toast.success('MSDS added');
      }
      setDialogOpen(false);
      fetchItems();
    } catch { toast.error('Save failed'); } finally { setSaving(false); }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete MSDS for "${item.name}"?`)) return;
    try { await api.delete(`/msds/${item.id}`); toast.success('Deleted'); fetchItems(); }
    catch { toast.error('Delete failed'); }
  };

  const triggerUpload = (id) => {
    const input = fileInputRefs.current[id];
    if (input) input.click();
  };

  const handleUploadChange = async (e, id) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) { toast.error('Only PDF files allowed'); return; }
    setUploadingId(id);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post(`/msds/${id}/upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(`Uploaded ${file.name}`);
      fetchItems();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Upload failed');
    } finally {
      setUploadingId(null);
    }
  };

  const viewPdf = async (item) => {
    try {
      const res = await api.get(`/msds/${item.id}/pdf?inline=true`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'View failed');
    }
  };

  const downloadPdf = async (item) => {
    try {
      const res = await api.get(`/msds/${item.id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = item.pdf_filename || `${item.name}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Download failed');
    }
  };

  const deletePdf = async (item) => {
    if (!window.confirm('Remove the attached PDF?')) return;
    try { await api.delete(`/msds/${item.id}/pdf`); toast.success('PDF removed'); fetchItems(); }
    catch { toast.error('Failed'); }
  };

  const handlePrint = async () => {
    invalidateDocControlCache();
    const doc = await getControlledDocumentByModule('MSDS Register', { fallback: 'MSDS Register' });
    const footer = buildDocControlFooter(doc, {
      title: 'MSDS Register', owner: 'Safety Manager',
    });
    const w = window.open('', '_blank', 'width=1100,height=1200');
    if (!w) { toast.error('Pop-up blocked'); return; }
    w.document.write(buildPrintHtml(filtered, { search, filterStatus, filterHaz, footer }));
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };

  return (
    <div className="space-y-6 p-1" data-testid="msds-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">MSDS Register</h1>
          <p className="text-sm text-slate-600">Material Safety Data Sheets — validity 5 years from Date of Issue</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint} disabled={!filtered.length} data-testid="msds-print-btn">
            <Printer className="h-4 w-4 mr-2" /> Print Register
          </Button>
          <Button onClick={openCreate} className="bg-slate-900" data-testid="msds-new-btn">
            <Plus className="h-4 w-4 mr-2" /> New MSDS
          </Button>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryTile label="Total" value={items.length} cls="bg-slate-100 text-slate-800" />
        <SummaryTile label="Expired" value={counts.Expired} cls="bg-red-100 text-red-800" icon={<AlertTriangle className="h-4 w-4" />} />
        <SummaryTile label="Expiring ≤ 90d" value={counts.Soon} cls="bg-amber-100 text-amber-800" icon={<AlertTriangle className="h-4 w-4" />} />
        <SummaryTile label="Valid" value={counts.Valid} cls="bg-green-100 text-green-800" icon={<CheckCircle2 className="h-4 w-4" />} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <CardTitle>Register</CardTitle>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label className="text-xs">Search</Label>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="name, supplier..." className="h-9 w-48" data-testid="msds-search" />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="flex h-9 rounded-md border border-input bg-transparent px-2 py-1 text-sm" data-testid="msds-filter-status">
                  <option value="All">All</option>
                  <option value="Expired">Expired</option>
                  <option value="Soon">Expiring ≤ 90d</option>
                  <option value="Valid">Valid</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Hazardous</Label>
                <select value={filterHaz} onChange={(e) => setFilterHaz(e.target.value)} className="flex h-9 rounded-md border border-input bg-transparent px-2 py-1 text-sm" data-testid="msds-filter-haz">
                  <option value="All">All</option>
                  <option value="YES">YES</option>
                  <option value="NO">NO</option>
                </select>
              </div>
              {(search || filterStatus !== 'All' || filterHaz !== 'All') && (
                <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setFilterStatus('All'); setFilterHaz('All'); }}>
                  <X className="h-3 w-3 mr-1" /> Clear
                </Button>
              )}
              <div className="text-xs text-slate-500 self-center">
                Showing {filtered.length} of {items.length}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-slate-500">Loading...</div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-600 mb-4">No MSDS records yet.</p>
              <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> Add First MSDS</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Name</th>
                    <th className="text-left px-3 py-2 font-semibold">Supplier</th>
                    <th className="text-center px-3 py-2 font-semibold">Hazardous</th>
                    <th className="text-center px-3 py-2 font-semibold">DG Class</th>
                    <th className="text-left px-3 py-2 font-semibold">Date of Issue</th>
                    <th className="text-left px-3 py-2 font-semibold">Date of Expiry</th>
                    <th className="text-left px-3 py-2 font-semibold">Volume</th>
                    <th className="text-left px-3 py-2 font-semibold">Status</th>
                    <th className="text-left px-3 py-2 font-semibold">PDF</th>
                    <th className="text-right px-3 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={10} className="text-center text-slate-500 py-8">No records match the current filters.</td></tr>
                  ) : filtered.map((it) => {
                    const st = expiryStatus(it.date_of_expiry);
                    return (
                      <tr key={it.id} className="border-t hover:bg-slate-50" data-testid={`msds-row-${it.id}`}>
                        <td className="px-3 py-2 font-medium">{it.name}</td>
                        <td className="px-3 py-2">{it.supplier}</td>
                        <td className="px-3 py-2 text-center">
                          {it.hazardous === 'YES'
                            ? <Badge className="bg-red-100 text-red-800 border-red-300" variant="outline">YES</Badge>
                            : <span className="text-slate-500">NO</span>}
                        </td>
                        <td className="px-3 py-2 text-center">{it.dangerous_goods_class || '—'}</td>
                        <td className="px-3 py-2">{it.date_of_issue ? formatDate(it.date_of_issue) : '—'}</td>
                        <td className="px-3 py-2">{it.date_of_expiry ? formatDate(it.date_of_expiry) : '—'}</td>
                        <td className="px-3 py-2">{it.volume || '—'}</td>
                        <td className="px-3 py-2">
                          {st.bucket === 'NoDate'
                            ? <span className="text-slate-400 text-xs">—</span>
                            : <Badge className={st.cls} variant="outline">{st.bucket === 'Expired' && <AlertTriangle className="h-3 w-3 mr-1 inline" />} {st.label}</Badge>}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="file"
                            accept="application/pdf,.pdf"
                            className="hidden"
                            ref={(el) => { fileInputRefs.current[it.id] = el; }}
                            onChange={(e) => handleUploadChange(e, it.id)}
                          />
                          {it.pdf_file_id ? (
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => viewPdf(it)} title="View" data-testid={`msds-view-${it.id}`}>
                                <Eye className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => downloadPdf(it)} title="Download" data-testid={`msds-download-${it.id}`}>
                                <Download className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => triggerUpload(it.id)} title="Replace PDF" disabled={uploadingId === it.id}>
                                {uploadingId === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => deletePdf(it)} title="Remove PDF">
                                <Trash2 className="h-3 w-3 text-red-600" />
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="outline" className="h-7" onClick={() => triggerUpload(it.id)} disabled={uploadingId === it.id} data-testid={`msds-upload-${it.id}`}>
                              {uploadingId === it.id
                                ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> ...</>
                                : <><Upload className="h-3 w-3 mr-1" /> Upload</>}
                            </Button>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => openEdit(it)} data-testid={`msds-edit-${it.id}`}><Edit className="h-3 w-3 mr-1" /> Edit</Button>
                            <Button size="sm" variant="outline" onClick={() => handleDelete(it)} title="Delete"><Trash2 className="h-3 w-3 text-red-600" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit MSDS' : 'New MSDS'}</DialogTitle>
            <DialogDescription>Validity defaults to 5 years from Date of Issue (editable).</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => updateForm('name', e.target.value)} placeholder="e.g. LIQUID NITROGEN" data-testid="msds-form-name" />
            </div>
            <div>
              <Label>Supplier</Label>
              <Input value={form.supplier} onChange={(e) => updateForm('supplier', e.target.value)} placeholder="e.g. COREGAS" />
            </div>
            <div>
              <Label>Volume</Label>
              <Input value={form.volume} onChange={(e) => updateForm('volume', e.target.value)} placeholder="e.g. 6000 L" />
            </div>
            <div>
              <Label>Hazardous</Label>
              <select value={form.hazardous} onChange={(e) => updateForm('hazardous', e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm">
                <option value="NO">NO</option>
                <option value="YES">YES</option>
              </select>
            </div>
            <div>
              <Label>Dangerous Goods Class</Label>
              <Input value={form.dangerous_goods_class} onChange={(e) => updateForm('dangerous_goods_class', e.target.value)} placeholder="e.g. 2.2" />
            </div>
            <div>
              <Label>Date of Issue</Label>
              <Input type="date" value={form.date_of_issue} onChange={(e) => updateForm('date_of_issue', e.target.value)} data-testid="msds-form-issue" />
            </div>
            <div>
              <Label>Date of Expiry <span className="text-xs text-slate-500">(auto: issue + 5 yrs)</span></Label>
              <Input type="date" value={form.date_of_expiry} onChange={(e) => updateForm('date_of_expiry', e.target.value)} data-testid="msds-form-expiry" />
            </div>
            <div className="md:col-span-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => updateForm('notes', e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}><X className="h-4 w-4 mr-2" /> Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-slate-900" data-testid="msds-form-save"><Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryTile({ label, value, cls, icon }) {
  return (
    <div className={`rounded-md border px-4 py-3 flex items-center justify-between ${cls}`}>
      <div>
        <div className="text-xs uppercase tracking-wide opacity-80">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
      {icon}
    </div>
  );
}

function buildPrintHtml(records, filters = {}) {
  const footer = filters.footer || null;
  const fmt = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`;
  };
  const todayStr = (() => {
    const t = new Date();
    return `${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')}/${t.getFullYear()}`;
  })();
  const hasFilter = (filters.search && filters.search.trim()) || (filters.filterStatus && filters.filterStatus !== 'All') || (filters.filterHaz && filters.filterHaz !== 'All');
  const filterLabels = [];
  if (filters.search?.trim()) filterLabels.push(`Search: "${escapeHtml(filters.search.trim())}"`);
  if (filters.filterStatus && filters.filterStatus !== 'All') filterLabels.push(`Status: ${filters.filterStatus}`);
  if (filters.filterHaz && filters.filterHaz !== 'All') filterLabels.push(`Hazardous: ${filters.filterHaz}`);
  const rows = (records || []).map((it) => {
    const st = expiryStatus(it.date_of_expiry);
    const stColor = st.bucket === 'Expired' ? '#fca5a5' : st.bucket === 'Soon' ? '#fdba74' : st.bucket === 'Valid' ? '#bbf7d0' : '#ffffff';
    return `
      <tr>
        <td>${escapeHtml(it.name || '')}</td>
        <td>${escapeHtml(it.supplier || '')}</td>
        <td style="text-align:center;font-weight:bold;color:${it.hazardous === 'YES' ? '#b91c1c' : '#475569'};">${escapeHtml(it.hazardous || 'NO')}</td>
        <td style="text-align:center;">${escapeHtml(it.dangerous_goods_class || '')}</td>
        <td style="text-align:center;">${fmt(it.date_of_issue)}</td>
        <td style="text-align:center;">${fmt(it.date_of_expiry)}</td>
        <td style="text-align:center;">${escapeHtml(it.volume || '')}</td>
        <td style="text-align:center;background:${stColor};font-weight:bold;">${st.bucket === 'NoDate' ? '—' : st.label}</td>
      </tr>`;
  }).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>MSDS Register</title>
  <style>
    ${buildPrintFooterCss().replace('size: A4 portrait;', 'size: A4 landscape;')}
    body { font-family: Calibri, Arial, sans-serif; color: #000; font-size: 10pt; }
    h1 { text-align: center; font-size: 16pt; margin: 0 0 4px 0; color: #b91c1c; text-decoration: underline; }
    .meta { display: flex; justify-content: space-between; font-size: 10pt; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #000; padding: 5px 6px; font-size: 10pt; vertical-align: top; }
    th { background: #e2e8f0; text-align: center; }
    @media print { button { display: none; } }
  </style></head><body>${buildPrintBodyOpen(footer)}
    <h1>MSDS REGISTER</h1>
    ${hasFilter ? `<div style="text-align:center;font-size:10pt;color:#7c2d12;margin-bottom:6px;"><strong>Filtered:</strong> ${filterLabels.join(' &nbsp;|&nbsp; ')}</div>` : ''}
    <div class="meta">
      <span><strong>Printed:</strong> ${todayStr}</span>
      <span><strong>${hasFilter ? 'Filtered' : 'Total'} Records:</strong> ${records.length}</span>
    </div>
    <table>
      <thead><tr>
        <th style="width: 22%;">Name</th>
        <th style="width: 11%;">Supplier</th>
        <th style="width: 9%;">Hazardous<br/>YES / NO</th>
        <th style="width: 9%;">Dangerous<br/>Goods Class</th>
        <th style="width: 11%;">Date of Issue</th>
        <th style="width: 11%;">Date of Expiry</th>
        <th style="width: 9%;">Volume</th>
        <th style="width: 18%;">Status</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="8" style="text-align:center;padding:12px;">No records</td></tr>'}</tbody>
    </table>
    ${buildPrintBodyClose()}
  </body></html>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
