import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { formatDate } from '../utils/dateFormatter';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Eye, Printer, Save, ArrowLeft, ClipboardCheck, Settings2 } from 'lucide-react';
import {
  buildDocControlFooter, buildPrintFooterCss, buildPrintBodyOpen, buildPrintBodyClose,
  getControlledDocumentByModule,
} from '../utils/documentControl';

const newEntry = (location = '') => ({
  id: crypto.randomUUID(), location, findings: 'No Concerns',
});

// ---------------------------------------------------------------------------
// List page
// ---------------------------------------------------------------------------
export function HousekeepingAudits() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setItems((await api.get('/housekeeping-audits')).data || []); }
    catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const remove = async (a) => {
    if (!window.confirm(`Delete audit from ${a.date || '(no date)'}?`)) return;
    try { await api.delete(`/housekeeping-audits/${a.id}`); toast.success('Deleted'); load(); }
    catch { toast.error('Delete failed'); }
  };

  return (
    <div className="space-y-6 p-1" data-testid="hka-list-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Housekeeping Audit Summary</h1>
          <p className="text-sm text-slate-600">QMSF 26 — One row per Factory / Building / Workstation</p>
        </div>
        <Button onClick={() => navigate('/safety/housekeeping-audits/new')} className="bg-slate-900" data-testid="hka-new-btn">
          <Plus className="h-4 w-4 mr-2" /> New Audit
        </Button>
      </div>
      <Card>
        <CardHeader><CardTitle>All Audits</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="py-10 text-center text-slate-500">Loading...</div>
          : items.length === 0 ? (
            <div className="py-12 text-center">
              <ClipboardCheck className="h-12 w-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-600 mb-4">No housekeeping audits yet.</p>
              <Button onClick={() => navigate('/safety/housekeeping-audits/new')}><Plus className="h-4 w-4 mr-2" /> Create first audit</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Date</th>
                    <th className="text-left px-3 py-2 font-semibold">Auditor</th>
                    <th className="text-left px-3 py-2 font-semibold">Locations</th>
                    <th className="text-right px-3 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => (
                    <tr key={a.id} className="border-t hover:bg-slate-50" data-testid={`hka-row-${a.id}`}>
                      <td className="px-3 py-2 font-semibold">{a.date ? formatDate(a.date) : '—'}</td>
                      <td className="px-3 py-2">{a.auditor || '—'}</td>
                      <td className="px-3 py-2">{(a.entries || []).length}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => navigate(`/safety/housekeeping-audits/${a.id}`)} title="View / Edit">
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => remove(a)} title="Delete">
                            <Trash2 className="h-3 w-3 text-red-600" />
                          </Button>
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form page (create / edit / print)
// ---------------------------------------------------------------------------
export function HousekeepingAuditForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isNew = !id || id === 'new';

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    date: today, title: '',
    entries: [],
    auditor: '', signature: '', signed_date: today,
  });
  const [recordId, setRecordId] = useState(null);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locDialogOpen, setLocDialogOpen] = useState(false);
  const [locDraft, setLocDraft] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const locs = (await api.get('/ohs-meetings/locations')).data?.locations || [];
        if (!alive) return;
        setLocations(locs);
        if (isNew) {
          // Seed one row per known location so the auditor just fills findings.
          setForm((f) => ({
            ...f,
            entries: locs.length > 0 ? locs.map(newEntry) : [newEntry()],
          }));
        } else {
          const data = (await api.get(`/housekeeping-audits/${id}`)).data || {};
          if (!alive) return;
          setForm({
            date: data.date || today,
            title: data.title || '',
            entries: (data.entries || []).map((e) => ({ ...newEntry(), ...e })),
            auditor: data.auditor || '',
            signature: data.signature || '',
            signed_date: data.signed_date || data.date || today,
          });
          setRecordId(data.id);
        }
      } catch { toast.error('Failed to load'); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [id, isNew, today]);

  const updateField = (patch) => setForm((f) => ({ ...f, ...patch }));
  const updateEntry = (idx, patch) =>
    setForm((f) => ({ ...f, entries: f.entries.map((e, i) => (i === idx ? { ...e, ...patch } : e)) }));
  const addEntry = () => setForm((f) => ({ ...f, entries: [...f.entries, newEntry()] }));
  const removeEntry = (idx) => setForm((f) => ({ ...f, entries: f.entries.filter((_, i) => i !== idx) }));

  const openLocationsDialog = () => { setLocDraft((locations || []).join('\n')); setLocDialogOpen(true); };
  const saveLocations = async () => {
    const list = locDraft.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    try {
      const r = await api.put('/ohs-meetings/locations', { locations: list });
      setLocations(r.data?.locations || list);
      toast.success('Locations saved');
      setLocDialogOpen(false);
    } catch { toast.error('Failed to save locations'); }
  };

  const save = async () => {
    setSaving(true);
    try {
      let saved;
      if (isNew && !recordId) {
        saved = (await api.post('/housekeeping-audits', form)).data;
        setRecordId(saved.id);
        toast.success('Audit created');
        navigate(`/safety/housekeeping-audits/${saved.id}`, { replace: true });
      } else {
        saved = (await api.put(`/housekeeping-audits/${recordId || id}`, form)).data;
        toast.success('Audit saved');
      }
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const fmt = (v) => v ? formatDate(v) : '';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);

  const handlePrint = async () => {
    try {
      const doc = await getControlledDocumentByModule('Housekeeping Audit Form', { fallback: 'Housekeeping Audit', docType: 'Form' });
      const footer = buildDocControlFooter(doc, {
        title: 'Housekeeping Audit Summary', owner: 'Safety Manager',
      });
      const entriesHtml = (form.entries || []).filter((e) => e.location || e.findings).map((e) => `
        <div style="margin-bottom:14px;">
          <div style="font-weight:700;font-size:11pt;">${esc(e.location || '—')}</div>
          <div style="margin-top:4px;white-space:pre-wrap;">${esc(e.findings || '')}</div>
        </div>
      `).join('');
      const title = form.title || `HOUSEKEEPING AUDIT SUMMARY ${fmt(form.date)}`;
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  ${buildPrintFooterCss().replace('size: A4 portrait;', 'size: A4 portrait;\n    margin: 12mm 14mm 10mm 14mm;')}
  body { font-family: Calibri, Arial, sans-serif; color: #000; font-size: 10.5pt; line-height: 1.4; }
  h1 { text-align: center; font-size: 14pt; margin: 0 0 18px 0; }
  .signoff { margin-top: 24px; }
  .signoff .row { margin-bottom: 6px; }
  .sig { font-weight: 700; font-style: italic; text-decoration: underline; }
</style></head><body>${buildPrintBodyOpen(footer)}
  <h1>${esc(title.toUpperCase())}</h1>
  ${entriesHtml || '<div style="font-style:italic;color:#64748b;">No entries.</div>'}
  <div class="signoff">
    <div class="row"><strong>Auditor – </strong>${esc(form.auditor || '')}</div>
    <div class="row"><strong>Signed:</strong> <span class="sig">${esc(form.signature || '')}</span></div>
    <div class="row">${esc(fmt(form.signed_date))}</div>
  </div>
  ${buildPrintBodyClose()}
</body></html>`;
      const w = window.open('', '_blank', 'width=1100,height=1400');
      if (!w) { toast.error('Pop-up blocked'); return; }
      w.document.write(html); w.document.close();
      setTimeout(() => { w.focus(); w.print(); }, 400);
    } catch { toast.error('Print failed'); }
  };

  const headingPreview = useMemo(
    () => form.title || `HOUSEKEEPING AUDIT SUMMARY ${fmt(form.date)}`,
    [form.title, form.date, fmt]
  );

  if (loading) return <div className="py-10 text-center text-slate-500">Loading...</div>;

  // Build the dropdown options preserving any value not currently in the list.
  const allLocationOptions = (() => {
    const set = new Set(locations);
    (form.entries || []).forEach((e) => { if (e.location) set.add(e.location); });
    return Array.from(set);
  })();

  return (
    <div className="space-y-5 p-1" data-testid="hka-form-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate('/safety/housekeeping-audits')} data-testid="back-btn">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{headingPreview}</h1>
            <p className="text-xs text-slate-500">QMSF 26 — Issue 1 (February 2026)</p>
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
            <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : (isNew && !recordId ? 'Create Audit' : 'Save')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Header</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Audit Date</Label>
              <Input type="date" value={form.date} onChange={(e) => updateField({ date: e.target.value })} data-testid="field-date" />
            </div>
            <div>
              <Label>Title (optional override)</Label>
              <Input
                value={form.title}
                onChange={(e) => updateField({ title: e.target.value })}
                placeholder={`HOUSEKEEPING AUDIT SUMMARY ${fmt(form.date)}`}
                data-testid="field-title"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <CardTitle>Findings by Location</CardTitle>
            <Button size="sm" variant="outline" onClick={addEntry} data-testid="add-entry-btn">
              <Plus className="h-3 w-3 mr-1" /> Add Location
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {form.entries.map((e, i) => (
              <div key={e.id || i} className="grid grid-cols-1 md:grid-cols-[200px_1fr_40px] gap-2 items-start border-l-4 border-slate-300 pl-3 py-1" data-testid={`hka-entry-${i}`}>
                <div>
                  <Label className="text-xs">Location</Label>
                  <select
                    value={e.location || ''}
                    onChange={(ev) => updateEntry(i, { location: ev.target.value })}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm font-semibold"
                    data-testid={`entry-location-${i}`}
                  >
                    <option value="">—</option>
                    {allLocationOptions.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Findings</Label>
                  <Textarea
                    rows={2}
                    value={e.findings || ''}
                    onChange={(ev) => updateEntry(i, { findings: ev.target.value })}
                    className="text-sm min-h-[40px]"
                    data-testid={`entry-findings-${i}`}
                  />
                </div>
                <div className="flex items-end justify-end pb-1">
                  <button type="button" onClick={() => removeEntry(i)} className="text-slate-400 hover:text-red-600 mt-6" title="Remove">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            {form.entries.length === 0 && (
              <p className="text-sm text-slate-500 italic py-2">
                No entries. Click <strong>Add Location</strong> to start the audit.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Sign-off</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Auditor Name</Label>
              <Input value={form.auditor} onChange={(e) => updateField({ auditor: e.target.value })} placeholder="e.g. Bob Wilkinson" data-testid="field-auditor" />
            </div>
            <div>
              <Label>Signed (printed signature)</Label>
              <Input value={form.signature} onChange={(e) => updateField({ signature: e.target.value })} placeholder="e.g. B. Wilkinson" data-testid="field-signature" />
            </div>
            <div>
              <Label>Signed Date</Label>
              <Input type="date" value={form.signed_date} onChange={(e) => updateField({ signed_date: e.target.value })} data-testid="field-signed-date" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Manage Locations dialog — shared with OHS Meetings */}
      <Dialog open={locDialogOpen} onOpenChange={setLocDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Locations</DialogTitle>
            <DialogDescription>
              One per line. Shared with OHS Meetings. Add Factories, Buildings, Workstations or any
              other areas you want available across both modules.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={locDraft}
            onChange={(e) => setLocDraft(e.target.value)}
            rows={10}
            className="font-mono text-sm"
            data-testid="locations-textarea"
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
