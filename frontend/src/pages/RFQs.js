import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { ClipboardList, Plus, Link2, Trash2, Eye, Lock, Unlock, X, Printer, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import api from '../services/api';

const emptyItem = () => ({ description: '', material_type: '', size: '', code: '', quantity: 1, notes: '' });

export default function RFQs() {
  const [rfqs, setRfqs] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: '', notes: '', required_by: '', items: [emptyItem()] });
  const [viewRfq, setViewRfq] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = async () => setRfqs((await api.get('/rfqs')).data.items);
  useEffect(() => {
    load();
    api.get('/materials').then(r => setMaterials(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      load().catch(() => {});
      setViewRfq(v => {
        if (v) api.get(`/rfqs/${v.id}`).then(r => setViewRfq(cur => (cur && cur.id === v.id ? r.data : cur))).catch(() => {});
        return v;
      });
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const pickMaterial = (i, matId) => {
    const m = materials.find(x => String(x.id) === String(matId));
    if (!m) return;
    const items = [...form.items];
    items[i] = {
      ...items[i],
      description: [m.name, m.grade, m.finish, m.type].filter(Boolean).join(' '),
      material_type: [m.name, m.grade].filter(Boolean).join(' '),
      size: [m.thickness, m.length && m.width ? `${m.length} x ${m.width}` : ''].filter(Boolean).join(' x ').replace(' x  ', ' '),
      code: items[i].code || `MAT-${m.id}`,
    };
    setForm({ ...form, items });
  };

  const publicLink = (rfq) => `${window.location.origin}/rfq/${rfq.public_token}`;
  const copyLink = async (rfq) => {
    try {
      await navigator.clipboard.writeText(publicLink(rfq));
      toast.success('Supplier link copied — paste it into your email');
    } catch (e) {
      window.prompt('Copy the supplier link below:', publicLink(rfq));
    }
  };

  const setItem = (i, field, val) => {
    const items = [...form.items];
    items[i] = { ...items[i], [field]: val };
    setForm({ ...form, items });
  };

  const createRfq = async () => {
    if (!form.title.trim()) { toast.error('Enquiry title is required'); return; }
    const items = form.items.filter(it => it.description.trim());
    if (items.length === 0) { toast.error('Add at least one material item'); return; }
    setBusy(true);
    try {
      const { data } = await api.post('/rfqs', { ...form, items });
      toast.success(`${data.rfq_number} created`);
      setCreateOpen(false);
      setForm({ title: '', notes: '', required_by: '', items: [emptyItem()] });
      await load();
      try {
        await navigator.clipboard.writeText(`${window.location.origin}/rfq/${data.public_token}`);
        toast.info('Supplier link copied to clipboard');
      } catch (e) { /* clipboard unavailable — link is on the row's copy button */ }
    } catch (e) { toast.error('Create failed: ' + (e?.response?.data?.detail || e.message)); }
    setBusy(false);
  };

  const downloadOfflineForm = async (rfq) => {
    try {
      const res = await api.get(`/rfqs/${rfq.id}/export/html`, { responseType: 'blob', params: { origin: window.location.origin } });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([res.data], { type: 'text/html' }));
      link.download = `${rfq.rfq_number}_Material_Enquiry.html`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success('Enquiry form downloaded — attach it to your email. Supplier opens it and clicks Submit.');
    } catch (e) { toast.error('Download failed'); }
  };

  const printComparison = async (rfq) => {
    try {
      const res = await api.get(`/rfqs/${rfq.id}/export/pdf`, { responseType: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      link.download = `${rfq.rfq_number}_Price_Comparison.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) { toast.error('Comparison export failed'); }
  };

  const openView = async (rfq) => setViewRfq((await api.get(`/rfqs/${rfq.id}`)).data);

  const toggleStatus = async (rfq) => {
    const status = rfq.status === 'Open' ? 'Closed' : 'Open';
    await api.put(`/rfqs/${rfq.id}/status`, { status });
    toast.success(`${rfq.rfq_number} ${status.toLowerCase()}`);
    await load();
  };

  const removeRfq = async (rfq) => {
    if (!window.confirm(`Delete ${rfq.rfq_number} and all supplier responses?`)) return;
    await api.delete(`/rfqs/${rfq.id}`);
    toast.success('Deleted'); await load();
  };

  return (
    <div className="p-6 space-y-4" data-testid="rfqs-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-blue-700" />
          <h1 className="text-xl font-bold">Material RFQs</h1>
        </div>
        <Button size="sm" data-testid="new-rfq-btn" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> New Enquiry</Button>
      </div>

      <Card>
        <CardContent className="pt-4 pb-4">
          <table className="w-full text-sm" data-testid="rfqs-table">
            <thead>
              <tr className="text-left border-b text-slate-600">
                <th className="py-2">RFQ #</th><th>Title</th><th>Items</th><th>Responses</th><th>Status</th><th>Created</th><th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rfqs.map(r => (
                <tr key={r.id} className="border-b hover:bg-slate-50" data-testid={`rfq-row-${r.rfq_number}`}>
                  <td className="py-2 font-medium">{r.rfq_number}</td>
                  <td>{r.title}</td>
                  <td>{(r.items || []).length}</td>
                  <td>
                    <Badge variant={r.response_count > 0 ? 'default' : 'outline'} data-testid={`rfq-responses-${r.rfq_number}`}>
                      {r.response_count} received
                    </Badge>
                  </td>
                  <td><Badge className={r.status === 'Open' ? 'bg-green-600' : 'bg-slate-500'}>{r.status}</Badge></td>
                  <td className="text-slate-500">{(r.created_at || '').slice(0, 10)}</td>
                  <td className="text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" title="Copy supplier link" data-testid={`copy-rfq-link-${r.rfq_number}`} onClick={() => copyLink(r)}><Link2 className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" title="Download email-attachable enquiry form (for suppliers who can't open links)" data-testid={`download-offline-${r.rfq_number}`} onClick={() => downloadOfflineForm(r)}><FileDown className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" title="View responses" data-testid={`view-rfq-${r.rfq_number}`} onClick={() => openView(r)}><Eye className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" title="Print price comparison (all suppliers, 1 page)" data-testid={`print-comparison-${r.rfq_number}`} disabled={!r.response_count} onClick={() => printComparison(r)}><Printer className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" title={r.status === 'Open' ? 'Close enquiry' : 'Reopen enquiry'} onClick={() => toggleStatus(r)}>
                      {r.status === 'Open' ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-600" title="Delete" onClick={() => removeRfq(r)}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
              {rfqs.length === 0 && <tr><td colSpan="7" className="py-6 text-center text-slate-500">No enquiries yet — create one and send the link to your suppliers.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Material Purchasing Enquiry</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className="text-xs font-medium">Enquiry Title *</label>
                <Input data-testid="rfq-title-input" placeholder="e.g. Mild Steel Sheet — July order" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
              <div><label className="text-xs font-medium">Pricing Required By</label>
                <Input type="date" data-testid="rfq-required-by" value={form.required_by} onChange={e => setForm({ ...form, required_by: e.target.value })} /></div>
            </div>
            <div><label className="text-xs font-medium">Notes to Supplier</label>
              <Textarea data-testid="rfq-notes" placeholder="Delivery address, certification requirements, etc." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium">Material Items</label>
                <Button size="sm" variant="outline" data-testid="rfq-add-item-btn" onClick={() => setForm({ ...form, items: [...form.items, emptyItem()] })}><Plus className="h-3 w-3 mr-1" /> Add Item</Button>
              </div>
              {form.items.map((it, i) => (
                <div key={i} className="border rounded p-2 mb-2 bg-slate-50">
                  <div className="grid grid-cols-[1fr_2fr_28px] gap-2 mb-2 items-center">
                    <select className="border rounded h-9 px-2 text-sm bg-white" data-testid={`rfq-item-material-select-${i}`}
                      value="" onChange={e => { if (e.target.value) pickMaterial(i, e.target.value); }}>
                      <option value="">Pick from materials… (optional)</option>
                      {materials.map(m => (
                        <option key={m.id} value={m.id}>{[m.name, m.grade, m.thickness].filter(Boolean).join(' ')}</option>
                      ))}
                    </select>
                    <Input placeholder="Description (e.g. Mild Steel HA3 P&O Sheet)" data-testid={`rfq-item-desc-${i}`} value={it.description} onChange={e => setItem(i, 'description', e.target.value)} className="h-9 bg-white" />
                    <button className="text-red-500" onClick={() => setForm({ ...form, items: form.items.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></button>
                  </div>
                  <div className="grid grid-cols-[1fr_1fr_110px_70px] gap-2 items-center">
                    <Input placeholder="Material / Grade" value={it.material_type} onChange={e => setItem(i, 'material_type', e.target.value)} className="h-9 bg-white" />
                    <Input placeholder="Size (e.g. 3.0 x 2400 x 1200)" data-testid={`rfq-item-size-${i}`} value={it.size} onChange={e => setItem(i, 'size', e.target.value)} className="h-9 bg-white" />
                    <Input placeholder="Code #" data-testid={`rfq-item-code-${i}`} value={it.code || ''} onChange={e => setItem(i, 'code', e.target.value)} className="h-9 bg-white" />
                    <Input type="number" min="1" title="Quantity" value={it.quantity} onChange={e => setItem(i, 'quantity', parseFloat(e.target.value) || 1)} className="h-9 bg-white" />
                  </div>
                </div>
              ))}
            </div>
            <Button data-testid="create-rfq-btn" disabled={busy} onClick={createRfq}>Create Enquiry &amp; Copy Supplier Link</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View responses dialog */}
      <Dialog open={!!viewRfq} onOpenChange={(o) => !o && setViewRfq(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          {viewRfq && (
            <>
              <DialogHeader><DialogTitle>{viewRfq.rfq_number} — {viewRfq.title}</DialogTitle></DialogHeader>
              <div className="text-sm text-slate-600 mb-2">
                Supplier link: <code className="bg-slate-100 px-1 rounded text-xs">{publicLink(viewRfq)}</code>
                <Button size="sm" variant="ghost" onClick={() => copyLink(viewRfq)}><Link2 className="h-3 w-3" /></Button>
              </div>
              {(viewRfq.responses || []).length === 0 && <div className="text-sm text-slate-500 py-4" data-testid="no-responses">No supplier responses yet.</div>}
              {(viewRfq.responses || []).map((resp, ri) => (
                <Card key={resp.id} className="mb-3" data-testid={`rfq-response-${ri}`}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex justify-between flex-wrap gap-2 mb-2">
                      <div>
                        <span className="font-bold">{resp.supplier_company}</span>
                        {resp.contact_name && <span className="text-slate-600"> · {resp.contact_name}</span>}
                        {resp.email && <span className="text-slate-500 text-xs"> · {resp.email}</span>}
                        {resp.phone && <span className="text-slate-500 text-xs"> · {resp.phone}</span>}
                      </div>
                      <span className="text-xs text-slate-500">{(resp.submitted_at || '').slice(0, 16).replace('T', ' ')}</span>
                    </div>
                    <table className="w-full text-xs border">
                      <thead><tr className="bg-slate-100 text-left">
                        <th className="p-1.5">Item</th><th className="p-1.5">Requested Size</th><th className="p-1.5 text-right">Qty Quoted</th><th className="p-1.5 text-right">Price</th><th className="p-1.5">Alternative Offered</th><th className="p-1.5">Notes</th>
                      </tr></thead>
                      <tbody>
                        {(resp.items || []).map((ri2, ii) => {
                          const src = (viewRfq.items || []).find(x => x.id === ri2.item_id) || {};
                          const short = ri2.quoted_quantity != null && src.quantity != null && Number(ri2.quoted_quantity) < Number(src.quantity);
                          return (
                            <tr key={ii} className="border-t">
                              <td className="p-1.5">{src.code ? <span className="font-mono text-slate-500">[{src.code}] </span> : ''}{src.description} <span className="text-slate-400">x{src.quantity}</span></td>
                              <td className="p-1.5">{src.size}</td>
                              <td className={`p-1.5 text-right ${short ? 'text-red-600 font-semibold' : ''}`}>{ri2.quoted_quantity != null ? `${ri2.quoted_quantity}${short ? ` of ${src.quantity}` : ''}` : '—'}</td>
                              <td className="p-1.5 text-right font-semibold">{ri2.available === false && !ri2.alternative_size ? <span className="text-red-600">N/A</span> : (ri2.price != null ? `$${Number(ri2.price).toFixed(2)}` : '—')}</td>
                              <td className="p-1.5">{ri2.alternative_size ? <span className="text-amber-700">{ri2.alternative_size}{ri2.alternative_price != null ? ` @ $${Number(ri2.alternative_price).toFixed(2)}` : ''}</span> : '—'}</td>
                              <td className="p-1.5 text-slate-600">{ri2.notes || ''}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {(resp.freight != null || (resp.extra_costs || []).length > 0 || resp.attachment_name) && (
                      <div className="flex flex-wrap gap-3 text-xs mt-2 items-center">
                        {resp.freight != null && <span className="bg-blue-50 border border-blue-200 rounded px-2 py-1">Freight: <b>${Number(resp.freight).toFixed(2)}</b></span>}
                        {(resp.extra_costs || []).map((c, ci) => (
                          <span key={ci} className="bg-amber-50 border border-amber-200 rounded px-2 py-1">{c.label || 'Charge'}: <b>{c.amount != null ? `$${Number(c.amount).toFixed(2)}` : '—'}</b></span>
                        ))}
                        {resp.attachment_name && (
                          <Button size="sm" variant="outline" className="h-6 text-xs" data-testid={`download-attachment-${ri}`}
                            onClick={async () => {
                              const res = await api.get(`/rfqs/${viewRfq.id}/responses/${resp.id}/attachment`, { responseType: 'blob' });
                              const link = document.createElement('a');
                              link.href = URL.createObjectURL(new Blob([res.data]));
                              link.download = resp.attachment_name;
                              link.click(); URL.revokeObjectURL(link.href);
                            }}>
                            📎 {resp.attachment_name}
                          </Button>
                        )}
                      </div>
                    )}
                    {resp.overall_notes && <div className="text-xs text-slate-600 mt-2"><b>Supplier notes:</b> {resp.overall_notes}</div>}
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
