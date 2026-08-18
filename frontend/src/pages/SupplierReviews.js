import React, { useState, useEffect, useMemo } from 'react';
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, Printer, Save, X, FileText, Copy, ArrowLeft
} from 'lucide-react';

const EMPTY_ROW = () => ({
  id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  company_name: '',
  orders_raised: 0,
  ncrs: 0,
  delivery_reliability: 'A',
  product_supplied: ''
});

// Pre-populate with the supplier list from the user's docx for convenience
const DEFAULT_SUPPLIERS = [
  'IMPACT STEEL', 'DAL', 'ASD', 'APEX', 'SELECTION STEEL',
  'SURDEX', 'ATLAS', 'AUSTRAL', 'TSM', 'BLUESCOPE'
].map((name) => ({
  id: `seed_${name}`,
  company_name: name,
  orders_raised: 0,
  ncrs: 0,
  delivery_reliability: 'A',
  product_supplied: 'STEEL SHEET / PLATE'
}));

const DECISION_OPTIONS = [
  'Continue with controls',
  'Restricted use only',
  'Supplier corrective action required',
  'Suspended',
  'Removed from approved supplier list'
];

const needsEscalation = (r) => ['C', 'D'].includes(r.product_quality_grade) || ['C', 'D'].includes(r.delivery_reliability);

const buildSuggestedComment = (rows) => {
  const bad = rows.filter((r) => ['C', 'D'].includes(r.product_quality_grade));
  let text = 'All steel suppliers listed are capable of supplying material from ISO-accredited mills with material test certificates where required. Supplier performance has been reviewed based on order volume and NCR history.';
  if (bad.length === 0) {
    text += ' All suppliers remain acceptable or preferred. Future performance will continue to be monitored at each periodic review.';
    return text;
  }
  text += ' Most suppliers remain acceptable or preferred.';
  bad.forEach((r) => {
    const name = (r.company_name || 'Supplier').toUpperCase();
    if (r.product_quality_grade === 'D') {
      text += ` ${name} has been rated D due to an NCR rate of ${r.quality_percent}% and requires escalation.`;
      const decision = r.escalation_decision ? ` Management decision: ${r.escalation_decision}.` : '';
      text += ` Continued use of ${name} is subject to increased inspection, NCR review, supplier communication, and management approval.${decision}`;
    } else {
      text += ` ${name} has been rated C (NCR rate ${r.quality_percent}%) and is under increased monitoring.`;
    }
  });
  text += ' Future performance will be monitored, and alternative suppliers will be used where practical if improvement is not demonstrated.';
  return text;
};

const computeRow = (row) => {
  const orders = parseFloat(row.orders_raised) || 0;
  const ncrs = parseFloat(row.ncrs) || 0;
  const pct = orders > 0 ? (ncrs / orders) * 100 : 0;
  let grade = 'A';
  if (pct > 10) grade = 'D';
  else if (pct > 6) grade = 'C';
  else if (pct > 3) grade = 'B';
  return { ...row, quality_percent: Math.round(pct * 100) / 100, product_quality_grade: grade };
};

const gradeColor = (g) => ({
  A: 'bg-green-100 text-green-800 border-green-300',
  B: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  C: 'bg-orange-100 text-orange-800 border-orange-300',
  D: 'bg-red-100 text-red-800 border-red-300'
}[g] || 'bg-slate-100 text-slate-800');

export default function SupplierReviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // current review being edited (or null = list view)
  const [createOpen, setCreateOpen] = useState(false);
  const [newReviewDate, setNewReviewDate] = useState(new Date().toISOString().split('T')[0]);
  const [seedDefaults, setSeedDefaults] = useState(true);

  useEffect(() => { fetchReviews(); }, []);

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const res = await api.get('/supplier-reviews');
      setReviews(res.data || []);
    } catch {
      toast.error('Failed to load reviews');
    } finally { setLoading(false); }
  };

  const handleCreate = async () => {
    try {
      const payload = {
        review_date: newReviewDate,
        comments: 'All steel suppliers listed are capable of supplying material from ISO-accredited mills with material test certificates where required. Supplier performance has been reviewed based on order volume and NCR history. Future performance will be monitored, and alternative suppliers will be used where practical if improvement is not demonstrated.',
        suppliers: seedDefaults ? DEFAULT_SUPPLIERS.map((s) => computeRow({ ...s })) : []
      };
      const res = await api.post('/supplier-reviews', payload);
      toast.success('Review created');
      setCreateOpen(false);
      await fetchReviews();
      setEditing(res.data);
    } catch {
      toast.error('Create failed');
    }
  };

  const handleDuplicate = async (review) => {
    if (!window.confirm(`Duplicate review from ${formatDate(review.review_date)} as a new review (today's date, NCRs cleared)?`)) return;
    try {
      const res = await api.post(`/supplier-reviews/${review.id}/duplicate`);
      toast.success('Duplicated as new review');
      await fetchReviews();
      setEditing(res.data);
    } catch { toast.error('Duplicate failed'); }
  };

  const handleDelete = async (review) => {
    if (!window.confirm(`Delete review from ${formatDate(review.review_date)}? This cannot be undone.`)) return;
    try {
      await api.delete(`/supplier-reviews/${review.id}`);
      toast.success('Deleted');
      fetchReviews();
    } catch { toast.error('Delete failed'); }
  };

  if (editing) {
    return <ReviewEditor
      review={editing}
      onBack={() => { setEditing(null); fetchReviews(); }}
      onSaved={(updated) => setEditing(updated)}
    />;
  }

  return (
    <div className="space-y-6 p-1" data-testid="supplier-reviews-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Top 10 Supplier Reviews</h1>
          <p className="text-sm text-slate-600">QMSF 10 — Periodic supplier performance assessment</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-slate-900" data-testid="new-review-btn">
          <Plus className="h-4 w-4 mr-2" /> New Review
        </Button>
      </div>

      {loading ? (
        <Card><CardContent className="py-10 text-center text-slate-500">Loading...</CardContent></Card>
      ) : reviews.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-12 w-12 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600 mb-4">No supplier reviews yet.</p>
            <Button onClick={() => setCreateOpen(true)} data-testid="empty-new-review-btn">
              <Plus className="h-4 w-4 mr-2" /> Create First Review
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>Review History</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Review Date</th>
                  <th className="text-left px-3 py-2 font-semibold">Suppliers</th>
                  <th className="text-left px-3 py-2 font-semibold">Avg NCR%</th>
                  <th className="text-left px-3 py-2 font-semibold">Issues (B/C/D)</th>
                  <th className="text-left px-3 py-2 font-semibold">Created By</th>
                  <th className="text-right px-3 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => {
                  const sups = r.suppliers || [];
                  const totalOrders = sups.reduce((s, x) => s + (parseFloat(x.orders_raised) || 0), 0);
                  const totalNcrs = sups.reduce((s, x) => s + (parseFloat(x.ncrs) || 0), 0);
                  const avgPct = totalOrders > 0 ? (totalNcrs / totalOrders) * 100 : 0;
                  const issues = sups.filter((x) => ['B', 'C', 'D'].includes(x.product_quality_grade)).length;
                  return (
                    <tr key={r.id} className="border-t hover:bg-slate-50" data-testid={`review-row-${r.id}`}>
                      <td className="px-3 py-2 font-medium">{formatDate(r.review_date)}</td>
                      <td className="px-3 py-2">{sups.length}</td>
                      <td className="px-3 py-2">{avgPct.toFixed(2)}%</td>
                      <td className="px-3 py-2">{issues > 0 ? <Badge className="bg-amber-100 text-amber-800">{issues}</Badge> : <span className="text-slate-400">0</span>}</td>
                      <td className="px-3 py-2 text-slate-600">{r.created_by || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setEditing(r)} data-testid={`open-review-${r.id}`}>
                            <Edit className="h-3 w-3 mr-1" /> Open
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleDuplicate(r)} title="Duplicate as new review">
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleDelete(r)} title="Delete">
                            <Trash2 className="h-3 w-3 text-red-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Supplier Review</DialogTitle>
            <DialogDescription>Start a new periodic review (QMSF 10).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Review Date</Label>
              <Input type="date" value={newReviewDate} onChange={(e) => setNewReviewDate(e.target.value)} data-testid="new-review-date" />
            </div>
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded">
              <input
                type="checkbox" id="seed-defaults" checked={seedDefaults}
                onChange={(e) => setSeedDefaults(e.target.checked)}
                className="mt-1"
              />
              <label htmlFor="seed-defaults" className="text-sm text-slate-700 cursor-pointer">
                Pre-populate with your standard 10 steel suppliers (IMPACT STEEL, DAL, ASD, APEX, SELECTION STEEL, SURDEX, ATLAS, AUSTRAL, TSM, BLUESCOPE). Uncheck to start empty.
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}><X className="h-4 w-4 mr-2" /> Cancel</Button>
            <Button onClick={handleCreate} className="bg-slate-900" data-testid="create-review-confirm-btn"><Save className="h-4 w-4 mr-2" /> Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReviewEditor({ review, onBack, onSaved }) {
  const [reviewDate, setReviewDate] = useState(review.review_date || '');
  const [comments, setComments] = useState(review.comments || '');
  const [rows, setRows] = useState((review.suppliers || []).map(computeRow));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReviewDate(review.review_date || '');
    setComments(review.comments || '');
    setRows((review.suppliers || []).map(computeRow));
  }, [review.id]);

  const updateRow = (idx, field, value) => {
    const next = [...rows];
    next[idx] = computeRow({ ...next[idx], [field]: value });
    setRows(next);
  };

  const addRow = () => setRows([...rows, computeRow(EMPTY_ROW())]);
  const removeRow = (idx) => setRows(rows.filter((_, i) => i !== idx));

  const totals = useMemo(() => {
    const totalOrders = rows.reduce((s, r) => s + (parseFloat(r.orders_raised) || 0), 0);
    const totalNcrs = rows.reduce((s, r) => s + (parseFloat(r.ncrs) || 0), 0);
    const avgPct = totalOrders > 0 ? (totalNcrs / totalOrders) * 100 : 0;
    return { totalOrders, totalNcrs, avgPct: Math.round(avgPct * 100) / 100 };
  }, [rows]);

  const save = async () => {
    if (!reviewDate) { toast.error('Review date required'); return; }
    // A D-rated supplier requires a mandatory management decision
    const missing = rows.filter((r) => r.product_quality_grade === 'D' && !(r.escalation_decision || '').trim());
    if (missing.length > 0) {
      toast.error(`${missing.map((r) => r.company_name || 'Unnamed supplier').join(', ')}: rated D — a management decision is mandatory (Continue with controls / Restricted use only / Supplier corrective action required / Suspended / Removed).`);
      return;
    }
    setSaving(true);
    try {
      const res = await api.put(`/supplier-reviews/${review.id}`, {
        review_date: reviewDate,
        comments,
        suppliers: rows.map(({ id, company_name, orders_raised, ncrs, delivery_reliability, product_supplied,
          escalation_reason_approved, escalation_risk_controls, escalation_corrective_action,
          escalation_supplier_contacted, escalation_date_contacted, escalation_followup_date,
          escalation_approved_by, escalation_decision }) => ({
          id, company_name,
          orders_raised: parseFloat(orders_raised) || 0,
          ncrs: parseFloat(ncrs) || 0,
          delivery_reliability,
          product_supplied,
          escalation_reason_approved, escalation_risk_controls, escalation_corrective_action,
          escalation_supplier_contacted, escalation_date_contacted, escalation_followup_date,
          escalation_approved_by, escalation_decision
        }))
      });
      toast.success('Saved');
      onSaved(res.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  const handlePrint = async () => {
    invalidateDocControlCache();
    const doc = await getControlledDocumentByModule('Supplier Review Form', { fallback: 'Supplier Review', docType: 'Form' });
    const footer = buildDocControlFooter(doc, {
      title: 'Supplier Reviews', owner: 'Quality Manager',
    });
    const w = window.open('', '_blank', 'width=1100,height=1200');
    if (!w) { toast.error('Pop-up blocked'); return; }
    w.document.write(buildPrintHtml({ review_date: reviewDate, comments, suppliers: rows, footer }));
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };

  return (
    <div className="space-y-5 p-1" data-testid="supplier-review-editor">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onBack} data-testid="back-to-list-btn"><ArrowLeft className="h-4 w-4 mr-2" /> Back</Button>
          <h1 className="text-2xl font-bold text-slate-900">Top 10 Supplier Review</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint} data-testid="print-review-btn"><Printer className="h-4 w-4 mr-2" /> Print</Button>
          <Button onClick={save} disabled={saving} className="bg-slate-900" data-testid="save-review-btn">
            <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <Label>Review Date</Label>
              <Input type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} data-testid="editor-review-date" />
            </div>
            <div className="md:col-span-2 flex flex-wrap gap-3 items-end text-sm">
              <div className="bg-slate-50 px-4 py-2 rounded border">
                <div className="text-xs text-slate-500">Total Orders</div>
                <div className="font-bold">{totals.totalOrders}</div>
              </div>
              <div className="bg-slate-50 px-4 py-2 rounded border">
                <div className="text-xs text-slate-500">Total NCRs</div>
                <div className="font-bold">{totals.totalNcrs}</div>
              </div>
              <div className="bg-slate-50 px-4 py-2 rounded border">
                <div className="text-xs text-slate-500">Avg NCR %</div>
                <div className="font-bold">{totals.avgPct}%</div>
              </div>
            </div>
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-yellow-200 text-slate-900">
                <tr>
                  <th className="text-left px-2 py-2 font-bold">Company Name</th>
                  <th className="text-center px-2 py-2 font-bold w-24">Product Quality</th>
                  <th className="text-center px-2 py-2 font-bold w-24">Orders Raised</th>
                  <th className="text-center px-2 py-2 font-bold w-24">NCRs</th>
                  <th className="text-center px-2 py-2 font-bold w-24">Quality %</th>
                  <th className="text-center px-2 py-2 font-bold w-32">Delivery Reliability</th>
                  <th className="text-left px-2 py-2 font-bold">Product Supplied</th>
                  <th className="text-center px-2 py-2 font-bold w-12"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-6 text-slate-500">No suppliers. Click &quot;Add Row&quot; below.</td></tr>
                )}
                {rows.map((r, idx) => (
                  <React.Fragment key={r.id}>
                  <tr className="border-t" data-testid={`supplier-row-${idx}`}>
                    <td className="px-2 py-1">
                      <Input value={r.company_name} onChange={(e) => updateRow(idx, 'company_name', e.target.value)} className="h-8" data-testid={`row-company-${idx}`} />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <Badge variant="outline" className={`${gradeColor(r.product_quality_grade)} font-bold text-base px-3`} title="Auto-derived from NCR%">
                        {r.product_quality_grade}
                      </Badge>
                    </td>
                    <td className="px-2 py-1">
                      <Input type="number" min="0" step="1" value={r.orders_raised} onChange={(e) => updateRow(idx, 'orders_raised', e.target.value)} className="h-8 text-center" data-testid={`row-orders-${idx}`} />
                    </td>
                    <td className="px-2 py-1">
                      <Input type="number" min="0" step="1" value={r.ncrs} onChange={(e) => updateRow(idx, 'ncrs', e.target.value)} className="h-8 text-center" data-testid={`row-ncrs-${idx}`} />
                    </td>
                    <td className="px-2 py-1 text-center font-mono font-semibold">
                      {r.quality_percent != null ? `${r.quality_percent}%` : '—'}
                    </td>
                    <td className="px-2 py-1">
                      <Select value={r.delivery_reliability} onValueChange={(v) => updateRow(idx, 'delivery_reliability', v)}>
                        <SelectTrigger className="h-8" data-testid={`row-delivery-${idx}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A">A</SelectItem>
                          <SelectItem value="B">B</SelectItem>
                          <SelectItem value="C">C</SelectItem>
                          <SelectItem value="D">D</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1">
                      <Input value={r.product_supplied} onChange={(e) => updateRow(idx, 'product_supplied', e.target.value)} className="h-8" data-testid={`row-product-${idx}`} />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <Button size="sm" variant="ghost" onClick={() => removeRow(idx)} title="Remove row">
                        <Trash2 className="h-3 w-3 text-red-600" />
                      </Button>
                    </td>
                  </tr>
                  {needsEscalation(r) && (
                    <tr className={r.product_quality_grade === 'D' ? 'bg-red-50' : 'bg-orange-50'} data-testid={`escalation-panel-${idx}`}>
                      <td colSpan={8} className="px-3 py-3 border-t-0">
                        <div className={`text-xs font-bold uppercase tracking-wide mb-2 ${r.product_quality_grade === 'D' ? 'text-red-700' : 'text-orange-700'}`}>
                          {r.product_quality_grade === 'D' ? '🚩 D-rated — escalation details MANDATORY' : '⚠ C-rated — escalation details required'}
                          <span className="font-normal normal-case text-slate-500"> · {r.company_name || 'Supplier'} — NCR rate {r.quality_percent}%</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div className="md:col-span-2">
                            <Label className="text-xs">Reason supplier is still approved</Label>
                            <Input className="h-8 bg-white" value={r.escalation_reason_approved || ''} onChange={(e) => updateRow(idx, 'escalation_reason_approved', e.target.value)} data-testid={`esc-reason-${idx}`} />
                          </div>
                          <div className="md:col-span-2">
                            <Label className="text-xs">Risk controls applied</Label>
                            <Input className="h-8 bg-white" value={r.escalation_risk_controls || ''} onChange={(e) => updateRow(idx, 'escalation_risk_controls', e.target.value)} placeholder="e.g. increased inspection, NCR review on receipt" data-testid={`esc-controls-${idx}`} />
                          </div>
                          <div className="md:col-span-2">
                            <Label className="text-xs">Corrective action required</Label>
                            <Input className="h-8 bg-white" value={r.escalation_corrective_action || ''} onChange={(e) => updateRow(idx, 'escalation_corrective_action', e.target.value)} data-testid={`esc-ca-${idx}`} />
                          </div>
                          <div>
                            <Label className="text-xs">Supplier contacted?</Label>
                            <Select value={r.escalation_supplier_contacted === true ? 'yes' : r.escalation_supplier_contacted === false ? 'no' : ''} onValueChange={(v) => updateRow(idx, 'escalation_supplier_contacted', v === 'yes')}>
                              <SelectTrigger className="h-8 bg-white" data-testid={`esc-contacted-${idx}`}><SelectValue placeholder="—" /></SelectTrigger>
                              <SelectContent><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Date contacted</Label>
                            <Input type="date" className="h-8 bg-white" value={r.escalation_date_contacted || ''} onChange={(e) => updateRow(idx, 'escalation_date_contacted', e.target.value)} data-testid={`esc-date-contacted-${idx}`} />
                          </div>
                          <div>
                            <Label className="text-xs">Follow-up review date</Label>
                            <Input type="date" className="h-8 bg-white" value={r.escalation_followup_date || ''} onChange={(e) => updateRow(idx, 'escalation_followup_date', e.target.value)} data-testid={`esc-followup-${idx}`} />
                          </div>
                          <div>
                            <Label className="text-xs">Approved by management</Label>
                            <Input className="h-8 bg-white" value={r.escalation_approved_by || ''} onChange={(e) => updateRow(idx, 'escalation_approved_by', e.target.value)} data-testid={`esc-approved-${idx}`} />
                          </div>
                          <div className="md:col-span-2">
                            <Label className="text-xs font-bold">
                              Management decision {r.product_quality_grade === 'D' && <span className="text-red-600">* mandatory for D</span>}
                            </Label>
                            <Select value={r.escalation_decision || ''} onValueChange={(v) => updateRow(idx, 'escalation_decision', v)}>
                              <SelectTrigger className={`h-8 bg-white ${r.product_quality_grade === 'D' && !r.escalation_decision ? 'border-red-500 ring-1 ring-red-400' : ''}`} data-testid={`esc-decision-${idx}`}>
                                <SelectValue placeholder="Select decision…" />
                              </SelectTrigger>
                              <SelectContent>
                                {DECISION_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <Button variant="outline" onClick={addRow} className="mt-3" data-testid="add-row-btn">
            <Plus className="h-4 w-4 mr-2" /> Add Row
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base">Comments</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setComments(buildSuggestedComment(rows))} title="Compose an auditor-ready comment from the current supplier data" data-testid="suggest-comment-btn">
            Suggest Comment
          </Button>
        </CardHeader>
        <CardContent>
          <Textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={5} data-testid="editor-comments" />
          <p className="text-xs text-slate-500 mt-1">Tip: “Suggest Comment” writes a risk-controlled summary naming any C/D suppliers with their NCR rates and decisions — auditors want to see the D is controlled, not ignored.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Assessment Legend (auto-applied to Product Quality)</CardTitle></CardHeader>
        <CardContent>
          <table className="text-sm border w-full max-w-3xl">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-3 py-2 text-left">Assessment</th>
                <th className="px-3 py-2 text-left">NCR % of Orders</th>
                <th className="px-3 py-2 text-left">Interpretation</th>
                <th className="px-3 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t"><td className="px-3 py-1"><Badge className={gradeColor('A')}>A</Badge></td><td className="px-3 py-1">0.0% – 3.0%</td><td className="px-3 py-1">Strong / reliable supplier</td><td className="px-3 py-1">Preferred</td></tr>
              <tr className="border-t"><td className="px-3 py-1"><Badge className={gradeColor('B')}>B</Badge></td><td className="px-3 py-1">&gt;3.0% – 6.0%</td><td className="px-3 py-1">Acceptable with some issues</td><td className="px-3 py-1">Monitor</td></tr>
              <tr className="border-t"><td className="px-3 py-1"><Badge className={gradeColor('C')}>C</Badge></td><td className="px-3 py-1">&gt;6.0% – 10.0%</td><td className="px-3 py-1">Poor trend emerging</td><td className="px-3 py-1">Review required</td></tr>
              <tr className="border-t"><td className="px-3 py-1"><Badge className={gradeColor('D')}>D</Badge></td><td className="px-3 py-1">&gt;10.0%</td><td className="px-3 py-1">Unacceptable</td><td className="px-3 py-1">Corrective action / escalate</td></tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function buildPrintHtml({ review_date, comments, suppliers, footer }) {
  const list = suppliers || [];
  const totalOrders = list.reduce((s, x) => s + (parseFloat(x.orders_raised) || 0), 0);
  const totalNcrs = list.reduce((s, x) => s + (parseFloat(x.ncrs) || 0), 0);
  const avgPct = totalOrders > 0 ? Math.round((totalNcrs / totalOrders) * 10000) / 100 : 0;

  const escalated = list.filter((s) => ['C', 'D'].includes(s.product_quality_grade) || ['C', 'D'].includes(s.delivery_reliability));
  const escBlock = escalated.length === 0 ? '' : `
      <div class="comments-label">Supplier Escalation &amp; Risk Control (C / D rated):</div>
      <table class="main" style="margin-top:4px;">
        <thead>
          <tr>
            <th>SUPPLIER</th><th>GRADE</th><th>REASON STILL APPROVED</th><th>RISK CONTROLS</th>
            <th>CORRECTIVE ACTION</th><th>CONTACTED</th><th>FOLLOW-UP</th><th>APPROVED BY</th><th>DECISION</th>
          </tr>
        </thead>
        <tbody>
          ${escalated.map((s) => `
          <tr>
            <td style="padding:6px;text-align:center;font-weight:bold;">${escapeHtml(s.company_name || '')}</td>
            <td style="padding:6px;text-align:center;font-weight:bold;">${escapeHtml(s.product_quality_grade || '')}</td>
            <td style="padding:6px;">${escapeHtml(s.escalation_reason_approved || '')}</td>
            <td style="padding:6px;">${escapeHtml(s.escalation_risk_controls || '')}</td>
            <td style="padding:6px;">${escapeHtml(s.escalation_corrective_action || '')}</td>
            <td style="padding:6px;text-align:center;">${s.escalation_supplier_contacted === true ? 'Yes' : s.escalation_supplier_contacted === false ? 'No' : ''}${s.escalation_date_contacted ? '<br/>' + formatDateAU(s.escalation_date_contacted) : ''}</td>
            <td style="padding:6px;text-align:center;">${s.escalation_followup_date ? formatDateAU(s.escalation_followup_date) : ''}</td>
            <td style="padding:6px;text-align:center;">${escapeHtml(s.escalation_approved_by || '')}</td>
            <td style="padding:6px;font-weight:bold;">${escapeHtml(s.escalation_decision || '')}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;

  const rows = list.map((s) => `
    <tr>
      <td style="padding:8px;text-align:center;">${escapeHtml(s.company_name || '')}</td>
      <td style="padding:8px;text-align:center;font-weight:bold;">${escapeHtml(s.product_quality_grade || '')}</td>
      <td style="padding:8px;text-align:center;">${s.orders_raised || ''}</td>
      <td style="padding:8px;text-align:center;">${s.ncrs || 0}</td>
      <td style="padding:8px;text-align:center;">${(s.quality_percent != null ? s.quality_percent + '%' : '')}</td>
      <td style="padding:8px;text-align:center;font-weight:bold;">${escapeHtml(s.delivery_reliability || '')}</td>
      <td style="padding:8px;text-align:center;">${escapeHtml(s.product_supplied || '')}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Top 10 Supplier Review</title>
  <style>
    ${buildPrintFooterCss()}
    body { font-family: Calibri, Arial, sans-serif; color: #000; font-size: 12px; }
    .frame { border: 2px solid #000; padding: 14px; }
    .title { color: #c00; font-weight: bold; font-size: 18px; text-align: center; }
    .review-date { font-weight: bold; text-align: center; margin: 6px 0 14px; font-size: 13px; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 0 0 12px; }
    .summary .box { border: 1px solid #000; padding: 8px 10px; text-align: center; background: #f9f9f9; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .summary .lbl { font-size: 10px; color: #555; text-transform: uppercase; letter-spacing: 0.5px; }
    .summary .val { font-size: 18px; font-weight: bold; }
    table.main { width: 100%; border-collapse: collapse; }
    table.main th { background: #ffff00; border: 1px solid #000; padding: 8px; font-weight: bold; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    table.main td { border: 1px solid #000; }
    table.main tr { page-break-inside: avoid; break-inside: avoid; }
    .comments-label { margin-top: 14px; font-weight: bold; }
    .comments-box { border: 1px solid #000; padding: 10px; font-weight: bold; }
    .legend-label { margin-top: 14px; font-weight: bold; }
    table.legend { border-collapse: collapse; margin-top: 4px; }
    table.legend th, table.legend td { border: 1px solid #888; padding: 4px 10px; font-size: 11px; }
    table.legend th { background: #f3f3f3; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @media print { button { display: none; } }
  </style></head><body>${buildPrintBodyOpen(footer)}
    <div class="frame">
      <div class="title">TOP 10 SUPPLIER REVIEW</div>
      <div class="review-date">REVIEW DATE: ${review_date ? formatDateAU(review_date) : ''}</div>
      <div class="summary">
        <div class="box"><div class="lbl">Total Orders</div><div class="val">${totalOrders}</div></div>
        <div class="box"><div class="lbl">Total NCRs</div><div class="val">${totalNcrs}</div></div>
        <div class="box"><div class="lbl">Avg NCR %</div><div class="val">${avgPct}%</div></div>
      </div>
      <table class="main">
        <thead>
          <tr>
            <th>COMPANY NAME</th>
            <th>PRODUCT QUALITY</th>
            <th>No. Of Orders Raised</th>
            <th>NCR&rsquo;S</th>
            <th>Quality %</th>
            <th>DELIVERY RELIABILITY</th>
            <th>PRODUCT SUPPLIED</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="7" style="padding:14px;text-align:center;">No suppliers</td></tr>'}</tbody>
      </table>
      <div class="comments-label">Comments:</div>
      <div class="comments-box">${escapeHtml(comments || '')}</div>
      ${escBlock}
      <div class="legend-label">Legend:</div>
      <table class="legend">
        <thead><tr><th>Assessment</th><th>NCR % of Orders</th><th>Interpretation</th><th>Action</th></tr></thead>
        <tbody>
          <tr><td style="text-align:center;">A</td><td>0.0% &ndash; 3.0%</td><td>Strong / reliable supplier</td><td>Preferred</td></tr>
          <tr><td style="text-align:center;">B</td><td>&gt;3.0% &ndash; 6.0%</td><td>Acceptable with some issues</td><td>Monitor</td></tr>
          <tr><td style="text-align:center;">C</td><td>&gt;6.0% &ndash; 10.0%</td><td>Poor trend emerging</td><td>Review required</td></tr>
          <tr><td style="text-align:center;">D</td><td>&gt;10.0%</td><td>Unacceptable</td><td>Corrective action / escalate</td></tr>
        </tbody>
      </table>
    </div>
    ${buildPrintBodyClose()}
  </body></html>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDateAU(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
