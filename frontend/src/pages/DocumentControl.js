import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import { formatDate } from '../utils/dateFormatter';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Printer, Save, X, FileText, Search } from 'lucide-react';
import {
  getControlledDocumentByModule, buildDocControlFooter,
  buildPrintFooterCss, buildPrintBodyOpen, buildPrintBodyClose, invalidateDocControlCache
} from '../utils/documentControl';
const emptyForm = () => ({
  form_no: '', title: '', doc_type: 'Form', issue: '1',
  revision_date: '', owner: '', location: '', related_module: '', notes: ''
});

/**
 * Natural sort key for QMSF form numbers.
 * Examples:
 *   "QMSF 01"   -> [0, 1,    "",   "QMSF 01"]
 *   "QMSF 01A"  -> [0, 1,    "A",  "QMSF 01A"]
 *   "QMSF 1"    -> [0, 1,    "",   "QMSF 1"]
 *   "QMSF 2"    -> [0, 2,    "",   "QMSF 2"]
 *   "QMSF 10"   -> [0, 10,   "",   "QMSF 10"]
 *   "POL 01"    -> [1, 1,    "",   "POL 01"]  (non-QMSF sorted after QMSF)
 *   ""          -> [2, 0,    "",   ""]
 * This yields QMSF 01, 01A, 02, 7, 10, 14, ... in true numerical order.
 */
const formNoSortKey = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return [2, 0, '', ''];
  const m = s.match(/^([A-Za-z]+)?\s*0*(\d+)\s*([A-Za-z]*)/);
  if (!m) return [2, 0, '', s.toUpperCase()];
  const prefix = (m[1] || '').toUpperCase();
  const num = parseInt(m[2], 10) || 0;
  const suffix = (m[3] || '').toUpperCase();
  // QMSF first, then other prefixes alphabetically, then unknown
  const prefixRank = prefix === 'QMSF' ? 0 : 1;
  return [prefixRank, num, suffix, s.toUpperCase(), prefix];
};

const sortByFormNo = (list) => {
  return [...(list || [])].sort((a, b) => {
    const ka = formNoSortKey(a.form_no);
    const kb = formNoSortKey(b.form_no);
    // Compare prefix rank
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    // Same prefix rank but different prefixes -> alphabetical
    if (ka[4] !== kb[4]) return String(ka[4]).localeCompare(String(kb[4]));
    // Same prefix -> compare number
    if (ka[1] !== kb[1]) return ka[1] - kb[1];
    // Same number -> compare suffix ("" before "A" before "B")
    if (ka[2] !== kb[2]) return ka[2].localeCompare(kb[2]);
    return ka[3].localeCompare(kb[3]);
  });
};

export default function DocumentControl() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [modulesGrouped, setModulesGrouped] = useState({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchItems();
    // Load the central module registry so "Related Module" can be a dropdown
    api.get('/iso-modules/modules')
      .then((r) => setModulesGrouped(r.data?.grouped || {}))
      .catch(() => setModulesGrouped({}));
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try { setItems((await api.get('/document-control')).data || []); }
    catch { toast.error('Failed to load'); } finally { setLoading(false); }
  };

  const openCreate = () => { setEditingId(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (it) => {
    setEditingId(it.id);
    setForm({ ...emptyForm(), ...it });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.form_no.trim() || !form.title.trim()) { toast.error('Form No. and Title required'); return; }
    setSaving(true);
    try {
      if (editingId) await api.put(`/document-control/${editingId}`, form);
      else await api.post('/document-control', form);
      toast.success('Saved');
      setDialogOpen(false);
      fetchItems();
    } catch { toast.error('Save failed'); } finally { setSaving(false); }
  };

  const remove = async (it) => {
    if (!window.confirm(`Delete "${it.form_no} – ${it.title}"?`)) return;
    try { await api.delete(`/document-control/${it.id}`); toast.success('Deleted'); fetchItems(); }
    catch { toast.error('Delete failed'); }
  };

  const handlePrint = async () => {
    invalidateDocControlCache();
    const doc = await getControlledDocumentByModule('Document Control Register', {
      fallback: 'Document Control', docType: 'Register',
    });
    const footer = buildDocControlFooter(doc, {
      title: 'Document Control Register', owner: 'Quality Manager',
    });
    const w = window.open('', '_blank', 'width=1400,height=1400');
    if (!w) { toast.error('Pop-up blocked'); return; }
    w.document.write(buildPrintHtml(visibleItems, footer));
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };

  // Sort numerically by form_no (QMSF 01, 01A, 02, 7, 10, 14...) then apply search filter.
  const visibleItems = useMemo(() => {
    const sorted = sortByFormNo(items);
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((it) => {
      const haystack = [
        it.form_no, it.title, it.doc_type, it.issue,
        it.owner, it.related_module, it.location, it.notes
      ].map((v) => String(v || '').toLowerCase()).join(' | ');
      return haystack.includes(q);
    });
  }, [items, search]);

  return (
    <div className="space-y-6 p-1" data-testid="doc-control-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Document Control Register</h1>
          <p className="text-sm text-slate-600">Central register of all controlled forms / policies / procedures and their current Issue & Revision Date</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint} disabled={!items.length} data-testid="doc-print-btn"><Printer className="h-4 w-4 mr-2" /> Print</Button>
          <Button onClick={openCreate} className="bg-slate-900" data-testid="doc-new-btn"><Plus className="h-4 w-4 mr-2" /> New Document</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle>Register</CardTitle>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search form no, title, owner, module..."
                className="pl-8"
                data-testid="doc-search-input"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="py-10 text-center text-slate-500">Loading...</div>
          : items.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-600 mb-4">No controlled documents yet.</p>
              <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> Add First Document</Button>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="py-10 text-center text-slate-500" data-testid="doc-search-empty">
              No documents match &ldquo;{search}&rdquo;.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Form No.</th>
                    <th className="text-left px-3 py-2 font-semibold">Title</th>
                    <th className="text-left px-3 py-2 font-semibold">Type</th>
                    <th className="text-left px-3 py-2 font-semibold">Issue</th>
                    <th className="text-left px-3 py-2 font-semibold">Revision Date</th>
                    <th className="text-left px-3 py-2 font-semibold">Owner</th>
                    <th className="text-left px-3 py-2 font-semibold">Related Module</th>
                    <th className="text-right px-3 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((it) => (
                    <tr key={it.id} className="border-t hover:bg-slate-50" data-testid={`doc-row-${it.id}`}>
                      <td className="px-3 py-2 font-medium">{it.form_no}</td>
                      <td className="px-3 py-2">{it.title}</td>
                      <td className="px-3 py-2">{it.doc_type}</td>
                      <td className="px-3 py-2">{it.issue}</td>
                      <td className="px-3 py-2">{it.revision_date ? formatDate(it.revision_date) : '—'}</td>
                      <td className="px-3 py-2">{it.owner}</td>
                      <td className="px-3 py-2">{it.related_module}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => openEdit(it)} data-testid={`doc-edit-${it.id}`}><Edit className="h-3 w-3 mr-1" /> Edit</Button>
                          <Button size="sm" variant="outline" onClick={() => remove(it)}><Trash2 className="h-3 w-3 text-red-600" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Document' : 'New Document'}</DialogTitle>
            <DialogDescription>Add to the controlled document register.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Form No. *</Label>
              <Input value={form.form_no} onChange={(e) => setForm({ ...form, form_no: e.target.value })} placeholder="QMSF 13" data-testid="doc-form-formno" />
            </div>
            <div>
              <Label>Type</Label>
              <select value={form.doc_type} onChange={(e) => setForm({ ...form, doc_type: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm">
                <option>Form</option>
                <option>Procedure</option>
                <option>Policy</option>
                <option>Register</option>
                <option>Manual</option>
                <option>Other</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Skills Matrix - Workshop" data-testid="doc-form-title" />
            </div>
            <div>
              <Label>Issue</Label>
              <Input value={form.issue} onChange={(e) => setForm({ ...form, issue: e.target.value })} placeholder="2" />
            </div>
            <div>
              <Label>Revision Date</Label>
              <Input type="date" value={form.revision_date} onChange={(e) => setForm({ ...form, revision_date: e.target.value })} />
            </div>
            <div>
              <Label>Owner</Label>
              <Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="Quality Manager" />
            </div>
            <div>
              <Label>Related Module</Label>
              <select
                className="w-full mt-1 border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
                value={form.related_module || ''}
                onChange={(e) => setForm({ ...form, related_module: e.target.value })}
                data-testid="related-module-select"
              >
                <option value="">— Select a module —</option>
                {Object.entries(modulesGrouped).map(([group, mods]) => (
                  <optgroup key={group} label={group.toUpperCase()}>
                    {mods.map((m) => (
                      <option key={m.name} value={m.name}>{m.name}</option>
                    ))}
                  </optgroup>
                ))}
                {/* Allow keeping an unrecognised legacy value so existing records aren't lost */}
                {form.related_module && !Object.values(modulesGrouped).flat().some((m) => m.name === form.related_module) && (
                  <option value={form.related_module}>{form.related_module} (legacy)</option>
                )}
              </select>
            </div>
            <div className="md:col-span-2">
              <Label>Location / Path</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. /Volumes/ISO/Forms/" />
            </div>
            <div className="md:col-span-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}><X className="h-4 w-4 mr-2" /> Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-slate-900" data-testid="doc-form-save"><Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function buildPrintHtml(items, footer) {
  const fmt = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
  const today = new Date();
  const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
  const rows = (items || []).map((it) => `
    <tr>
      <td>${escapeHtml(it.form_no || '')}</td>
      <td>${escapeHtml(it.title || '')}</td>
      <td>${escapeHtml(it.doc_type || '')}</td>
      <td style="text-align:center;">${escapeHtml(it.issue || '')}</td>
      <td style="text-align:center;">${fmt(it.revision_date)}</td>
      <td>${escapeHtml(it.owner || '')}</td>
      <td>${escapeHtml(it.related_module || '')}</td>
    </tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Document Control Register</title>
  <style>
    ${buildPrintFooterCss()}
    @page { size: A4 landscape; margin: 10mm 12mm 18mm 12mm; }
    body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; margin: 0; }
    h1 { text-align: center; font-size: 16pt; margin: 0 0 4px 0; color: #c00; text-decoration: underline; }
    .meta { display: flex; justify-content: space-between; font-size: 10pt; margin-bottom: 8px; }
    table.data-tbl { width: 100%; border-collapse: collapse; }
    table.data-tbl th, table.data-tbl td { border: 1px solid #000; padding: 4px 6px; font-size: 10pt; }
    table.data-tbl th { background: #e2e8f0; text-align: center; }
  </style></head><body>${buildPrintBodyOpen(footer)}
    <h1>Document Control Register</h1>
    <div class="meta"><span><strong>Printed:</strong> ${todayStr}</span><span><strong>Total Records:</strong> ${items.length}</span></div>
    <table class="data-tbl">
      <thead><tr>
        <th style="width: 10%;">Form No.</th>
        <th style="width: 28%;">Title</th>
        <th style="width: 10%;">Type</th>
        <th style="width: 6%;">Issue</th>
        <th style="width: 12%;">Revision Date</th>
        <th style="width: 16%;">Owner</th>
        <th style="width: 18%;">Related Module</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="7" style="text-align:center;padding:12px;">No records</td></tr>'}</tbody>
    </table>
    ${buildPrintBodyClose()}
  </body></html>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
