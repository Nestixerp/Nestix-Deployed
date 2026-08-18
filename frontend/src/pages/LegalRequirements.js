import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import { formatDate, formatDateTime } from '../utils/dateFormatter';
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
  Plus, Edit, Trash2, Printer, Sparkles, CheckCircle2, AlertTriangle,
  HelpCircle, Loader2, ExternalLink, Save, X, FileText, History, ArrowRight
} from 'lucide-react';

// Default category set (matches the user's docx structure)
const DEFAULT_CATEGORIES = [
  'Victorian Legislation',
  'Victorian Codes of Practice',
  'Commonwealth Legislation',
  'Australian Standards',
  'Industry Standards',
  'Environmental',
  'Other'
];

const DEFAULT_SUBCATEGORIES = {
  'Victorian Legislation': [
    'Victorian Compliance Codes',
    'OHS Acts and Regulations',
    'Environmental Policies',
    'Other'
  ],
  'Victorian Codes of Practice': ['Codes of Practice'],
  'Commonwealth Legislation': ['Acts', 'Regulations'],
  'Australian Standards': ['AS Standards', 'AS/NZS Standards'],
  'Industry Standards': ['Industry'],
  'Environmental': ['EPA', 'Waste Management'],
  'Other': ['Other']
};

const initialForm = {
  name: '',
  category: 'Victorian Legislation',
  subcategory: 'OHS Acts and Regulations',
  year: '',
  last_review_date: '',
  responsible_person: '',
  notes: ''
};

export default function LegalRequirements() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('register'); // 'register' (form view) | 'manage' (edit list)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [aiCheckingId, setAiCheckingId] = useState(null);
  const [bulkChecking, setBulkChecking] = useState(false);
  const [aiResultDialog, setAiResultDialog] = useState(null); // {item, result}
  const [historyDialog, setHistoryDialog] = useState(null); // item

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await api.get('/legal-requirements');
      setItems(res.data || []);
    } catch (e) {
      toast.error('Failed to load legal requirements');
    } finally {
      setLoading(false);
    }
  };

  const grouped = useMemo(() => {
    const out = {};
    for (const it of items) {
      const cat = it.category || 'Other';
      const sub = it.subcategory || 'Other';
      if (!out[cat]) out[cat] = {};
      if (!out[cat][sub]) out[cat][sub] = [];
      out[cat][sub].push(it);
    }
    return out;
  }, [items]);

  const openCreate = () => {
    setEditingId(null);
    setForm(initialForm);
    setDialogOpen(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name || '',
      category: item.category || 'Victorian Legislation',
      subcategory: item.subcategory || '',
      year: item.year || '',
      last_review_date: item.last_review_date || '',
      responsible_person: item.responsible_person || '',
      notes: item.notes || ''
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    try {
      if (editingId) {
        await api.put(`/legal-requirements/${editingId}`, form);
        toast.success('Updated');
      } else {
        await api.post('/legal-requirements', form);
        toast.success('Added');
      }
      setDialogOpen(false);
      fetchItems();
    } catch (e) {
      toast.error('Save failed');
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    try {
      await api.delete(`/legal-requirements/${item.id}`);
      toast.success('Deleted');
      fetchItems();
    } catch {
      toast.error('Delete failed');
    }
  };

  const runAiCheck = async (item) => {
    setAiCheckingId(item.id);
    try {
      const res = await api.post(`/legal-requirements/${item.id}/ai-check`);
      const result = res.data;
      if (result.auto_updated) {
        toast.success(`Year auto-updated: ${result.old_year || '—'} → ${result.new_year}`, { duration: 5000 });
      }
      setAiResultDialog({ item, result });
      // Refresh list to update stored ai_status and history
      fetchItems();
    } catch (e) {
      toast.error('AI check failed');
    } finally {
      setAiCheckingId(null);
    }
  };

  const runBulkCheck = async () => {
    if (items.length === 0) { toast.info('No items to check'); return; }
    if (!window.confirm(`Check all ${items.length} legal requirements with AI? This may take a minute.`)) return;
    setBulkChecking(true);
    try {
      const res = await api.post('/legal-requirements/ai-check-all');
      const updated = (res.data?.results || []).filter(r => r.auto_updated);
      if (updated.length > 0) {
        toast.success(`AI auto-updated ${updated.length} item(s). Check history for details.`);
      } else {
        toast.success('Bulk AI check complete');
      }
      fetchItems();
    } catch {
      toast.error('Bulk AI check failed');
    } finally {
      setBulkChecking(false);
    }
  };

  const acceptAiUpdate = async (item, latestVersion) => {
    // Try to extract just a year (4 digits) from latestVersion; else use full string
    const yearMatch = (latestVersion || '').match(/\b(19|20)\d{2}\b/);
    const newYear = yearMatch ? yearMatch[0] : latestVersion;
    if (!newYear) { toast.error('No year detected in AI suggestion'); return; }
    try {
      await api.post(`/legal-requirements/${item.id}/accept-ai-update`, { new_year: newYear });
      toast.success(`Updated to ${newYear}`);
      setAiResultDialog(null);
      fetchItems();
    } catch {
      toast.error('Failed to apply update');
    }
  };

  const renderAiBadge = (item) => {
    if (!item.ai_status) return null;
    const conf = item.ai_confidence || 'low';
    if (item.ai_status === 'current') {
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300" data-testid={`ai-status-${item.id}`}>
          <CheckCircle2 className="h-3 w-3 mr-1" /> Up-to-date {conf !== 'high' && `(${conf})`}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300" data-testid={`ai-status-${item.id}`}>
        <AlertTriangle className="h-3 w-3 mr-1" /> Review needed
      </Badge>
    );
  };

  const handlePrint = async () => {
    invalidateDocControlCache();
    const doc = await getControlledDocumentByModule('Legal Requirements Register', { fallback: 'Legal Requirements', docType: 'Register' });
    const footer = buildDocControlFooter(doc, {
      title: 'Legal Requirements Register', owner: 'Quality Manager',
    });
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) { toast.error('Pop-up blocked'); return; }
    const html = buildPrintHtml(items, { footer });
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };

  const subcategoryOptions = DEFAULT_SUBCATEGORIES[form.category] || ['Other'];

  return (
    <div className="space-y-6 p-1" data-testid="legal-requirements-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Legal Requirements</h1>
          <p className="text-sm text-slate-600">Compliance register: Acts, Regulations, Standards & Codes of Practice</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={view === 'register' ? 'default' : 'outline'}
            onClick={() => setView('register')}
            data-testid="view-register-btn"
          >
            <FileText className="h-4 w-4 mr-2" /> Register View
          </Button>
          <Button
            variant={view === 'manage' ? 'default' : 'outline'}
            onClick={() => setView('manage')}
            data-testid="view-manage-btn"
          >
            <Edit className="h-4 w-4 mr-2" /> Manage / Edit
          </Button>
          <Button onClick={openCreate} className="bg-slate-900 hover:bg-slate-800" data-testid="add-requirement-btn">
            <Plus className="h-4 w-4 mr-2" /> Add
          </Button>
          <Button variant="outline" onClick={handlePrint} data-testid="print-register-btn">
            <Printer className="h-4 w-4 mr-2" /> Print
          </Button>
          <Button
            variant="outline"
            onClick={runBulkCheck}
            disabled={bulkChecking || items.length === 0}
            className="bg-purple-50 border-purple-300 text-purple-800 hover:bg-purple-100"
            data-testid="bulk-ai-check-btn"
          >
            {bulkChecking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            AI Check All
          </Button>
        </div>
      </div>

      {loading ? (
        <Card><CardContent className="py-10 text-center text-slate-500">Loading...</CardContent></Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-12 w-12 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600 mb-4">No legal requirements yet. Start by adding your first Act, Regulation or Code of Practice.</p>
            <Button onClick={openCreate} data-testid="empty-state-add-btn"><Plus className="h-4 w-4 mr-2" /> Add First Requirement</Button>
          </CardContent>
        </Card>
      ) : (
        <RegisterView
          grouped={grouped}
          view={view}
          renderAiBadge={renderAiBadge}
          aiCheckingId={aiCheckingId}
          onAiCheck={runAiCheck}
          onEdit={openEdit}
          onDelete={handleDelete}
          onHistory={(item) => setHistoryDialog(item)}
        />
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Legal Requirement' : 'Add Legal Requirement'}</DialogTitle>
            <DialogDescription>
              Record an Act, Regulation, Code of Practice or Standard that applies to your operations.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Occupational Health & Safety Act"
                data-testid="form-name"
              />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v, subcategory: (DEFAULT_SUBCATEGORIES[v] || ['Other'])[0] })}>
                <SelectTrigger data-testid="form-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEFAULT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sub-category</Label>
              <Select value={form.subcategory} onValueChange={(v) => setForm({ ...form, subcategory: v })}>
                <SelectTrigger data-testid="form-subcategory"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {subcategoryOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Year / Version</Label>
              <Input
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
                placeholder="e.g. 2004"
                data-testid="form-year"
              />
            </div>
            <div>
              <Label>Responsible Person</Label>
              <Select
                value={form.responsible_person}
                onValueChange={(v) => setForm({ ...form, responsible_person: v })}
              >
                <SelectTrigger data-testid="form-responsible">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Operations Manager">Operations Manager</SelectItem>
                  <SelectItem value="Quality Manager">Quality Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Last Review Date</Label>
              <Input
                type="date"
                value={form.last_review_date}
                onChange={(e) => setForm({ ...form, last_review_date: e.target.value })}
                data-testid="form-last-review"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                placeholder="Compliance evidence, links to internal procedures, etc."
                data-testid="form-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="form-cancel-btn">
              <X className="h-4 w-4 mr-2" /> Cancel
            </Button>
            <Button onClick={handleSave} className="bg-slate-900" data-testid="form-save-btn">
              <Save className="h-4 w-4 mr-2" /> {editingId ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Result Dialog */}
      <Dialog open={!!aiResultDialog} onOpenChange={(o) => !o && setAiResultDialog(null)}>
        <DialogContent className="max-w-2xl" data-testid="ai-result-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" /> AI Compliance Check
            </DialogTitle>
            <DialogDescription>{aiResultDialog?.item?.name}</DialogDescription>
          </DialogHeader>
          {aiResultDialog && <AiResultBody data={aiResultDialog} onAccept={acceptAiUpdate} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiResultDialog(null)} data-testid="ai-result-close-btn">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit History Dialog */}
      <Dialog open={!!historyDialog} onOpenChange={(o) => !o && setHistoryDialog(null)}>
        <DialogContent className="max-w-2xl" data-testid="history-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-slate-700" /> Change History
            </DialogTitle>
            <DialogDescription>{historyDialog?.name}</DialogDescription>
          </DialogHeader>
          {historyDialog && <HistoryBody item={historyDialog} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryDialog(null)} data-testid="history-close-btn">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HistoryBody({ item }) {
  const history = (item.change_history || []).slice().reverse(); // newest first
  if (history.length === 0) {
    return <div className="text-sm text-slate-500 py-6 text-center">No changes recorded yet.</div>;
  }
  const labelFor = (action) => {
    switch (action) {
      case 'created': return { text: 'Record created', color: 'bg-blue-100 text-blue-800' };
      case 'manual_edit': return { text: 'Manual edit', color: 'bg-slate-100 text-slate-800' };
      case 'ai_check': return { text: 'AI check', color: 'bg-purple-100 text-purple-800' };
      case 'ai_auto_update': return { text: 'AI auto-update', color: 'bg-amber-100 text-amber-800' };
      case 'manual_accept_ai_update': return { text: 'Manual accept of AI suggestion', color: 'bg-green-100 text-green-800' };
      default: return { text: action, color: 'bg-slate-100 text-slate-800' };
    }
  };
  return (
    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1" data-testid="history-list">
      {history.map((h) => {
        const lbl = labelFor(h.action);
        return (
          <div key={h.id} className="border rounded-lg p-3 bg-white">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Badge className={lbl.color} variant="outline">{lbl.text}</Badge>
                <span className="text-xs text-slate-500">by <strong className="text-slate-700">{h.by || 'system'}</strong></span>
              </div>
              <span className="text-xs text-slate-500">{formatDateTime(h.at)}</span>
            </div>

            {(h.action === 'ai_auto_update' || h.action === 'manual_accept_ai_update') && (
              <div className="mt-2 text-sm flex items-center gap-2">
                <span className="text-slate-500">Year:</span>
                <span className="font-mono bg-slate-100 px-2 py-0.5 rounded">{h.old_year || '—'}</span>
                <ArrowRight className="h-3 w-3 text-slate-400" />
                <span className="font-mono bg-green-100 text-green-800 px-2 py-0.5 rounded">{h.new_year || '—'}</span>
              </div>
            )}
            {h.action === 'manual_edit' && h.changes && (
              <div className="mt-2 text-sm space-y-1">
                {Object.entries(h.changes).map(([field, diff]) => (
                  <div key={field} className="flex items-center gap-2 flex-wrap">
                    <span className="text-slate-500 capitalize">{field.replaceAll('_', ' ')}:</span>
                    <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-xs">{String(diff.from || '—').slice(0, 80)}</span>
                    <ArrowRight className="h-3 w-3 text-slate-400" />
                    <span className="font-mono bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs">{String(diff.to || '—').slice(0, 80)}</span>
                  </div>
                ))}
              </div>
            )}
            {h.ai_summary && (
              <div className="mt-2 text-xs text-slate-600 italic border-l-2 border-purple-200 pl-2">{h.ai_summary}</div>
            )}
            {Array.isArray(h.ai_sources) && h.ai_sources.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-2">
                {h.ai_sources.map((u, i) => (
                  <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> source {i + 1}
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AiResultBody({ data, onAccept }) {
  const { item, result } = data;
  const isCurrent = result?.is_current;
  const conf = result?.confidence || 'low';
  const autoUpdated = result?.auto_updated;
  return (
    <div className="space-y-4">
      {autoUpdated && (
        <div className="p-3 rounded-lg border-2 border-blue-300 bg-blue-50 flex items-start gap-2" data-testid="auto-updated-banner">
          <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <div className="font-bold">Year auto-updated by AI</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono bg-white px-2 py-0.5 rounded border">{result.old_year || '—'}</span>
              <span>→</span>
              <span className="font-mono bg-white px-2 py-0.5 rounded border font-semibold">{result.new_year}</span>
            </div>
            <div className="text-xs mt-1 text-blue-700">This change has been logged for audit purposes.</div>
          </div>
        </div>
      )}
      <div className={`p-4 rounded-lg border-2 ${isCurrent ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'}`}>
        <div className="flex items-center gap-2 mb-2">
          {isCurrent
            ? <CheckCircle2 className="h-6 w-6 text-green-600" />
            : <AlertTriangle className="h-6 w-6 text-amber-600" />}
          <span className="font-bold text-lg">
            {isCurrent ? 'Appears up-to-date' : 'Review recommended'}
          </span>
          <Badge variant="outline" className="ml-auto">Confidence: {conf}</Badge>
        </div>
        <p className="text-sm text-slate-700">{result?.summary || 'No summary available.'}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-slate-500 font-medium">On file (year/version)</div>
          <div className="font-semibold">{item.year || '—'}</div>
        </div>
        <div>
          <div className="text-slate-500 font-medium">AI says latest is</div>
          <div className="font-semibold">{result?.latest_version || '—'}</div>
        </div>
        {result?.last_amended_date && (
          <div className="col-span-2">
            <div className="text-slate-500 font-medium">Last amended</div>
            <div className="font-semibold">{result.last_amended_date}</div>
          </div>
        )}
      </div>

      {result?.source_urls?.length > 0 && (
        <div>
          <div className="text-slate-500 font-medium text-sm mb-1">Verify with official sources:</div>
          <ul className="space-y-1">
            {result.source_urls.map((u, i) => (
              <li key={i}>
                <a href={u} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm flex items-center gap-1 break-all">
                  <ExternalLink className="h-3 w-3 flex-shrink-0" /> {u}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!autoUpdated && !isCurrent && result?.latest_version && (
        <div className="pt-2 border-t">
          <Button
            onClick={() => onAccept(item, result.latest_version)}
            className="bg-blue-600 hover:bg-blue-700 w-full"
            data-testid="ai-accept-update-btn"
          >
            Apply suggested update to record
          </Button>
        </div>
      )}

      <div className="text-xs text-slate-500 italic flex items-start gap-2">
        <HelpCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
        AI knowledge has a training cutoff and may miss very recent amendments. Always verify with the official sources above before relying on this for compliance decisions.
      </div>
    </div>
  );
}

function RegisterView({ grouped, view, renderAiBadge, aiCheckingId, onAiCheck, onEdit, onDelete, onHistory }) {
  const cats = Object.keys(grouped).sort();
  return (
    <div className="space-y-5">
      {cats.map((cat) => (
        <Card key={cat} className="border-l-4 border-l-slate-700">
          <CardHeader className="bg-slate-50 py-3">
            <CardTitle className="text-lg">{cat}</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {Object.keys(grouped[cat]).sort().map((sub) => (
              <div key={sub}>
                <div className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">{sub}</div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold">Name</th>
                        <th className="text-left px-3 py-2 font-semibold w-20">Year</th>
                        <th className="text-left px-3 py-2 font-semibold">Last Review</th>
                        <th className="text-left px-3 py-2 font-semibold">Responsible</th>
                        <th className="text-left px-3 py-2 font-semibold">AI Status</th>
                        <th className="text-right px-3 py-2 font-semibold w-56">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouped[cat][sub].map((item) => {
                        const histCount = (item.change_history || []).length;
                        return (
                          <tr key={item.id} className="border-t hover:bg-slate-50" data-testid={`legal-row-${item.id}`}>
                            <td className="px-3 py-2">
                              <div className="font-medium">{item.name}</div>
                              {item.notes && <div className="text-xs text-slate-500 mt-0.5">{item.notes}</div>}
                            </td>
                            <td className="px-3 py-2">{item.year || '—'}</td>
                            <td className="px-3 py-2">{item.last_review_date ? formatDate(item.last_review_date) : '—'}</td>
                            <td className="px-3 py-2">{item.responsible_person || '—'}</td>
                            <td className="px-3 py-2">{renderAiBadge(item) || <span className="text-slate-400 text-xs">Not checked</span>}</td>
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm" variant="outline"
                                  onClick={() => onAiCheck(item)}
                                  disabled={aiCheckingId === item.id}
                                  title="AI Check Latest Version"
                                  className="bg-purple-50 border-purple-300 text-purple-800 hover:bg-purple-100"
                                  data-testid={`ai-check-btn-${item.id}`}
                                >
                                  {aiCheckingId === item.id
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <Sparkles className="h-3 w-3" />}
                                </Button>
                                <Button
                                  size="sm" variant="outline"
                                  onClick={() => onHistory(item)}
                                  title="Audit history"
                                  data-testid={`history-btn-${item.id}`}
                                >
                                  <History className="h-3 w-3" />
                                  {histCount > 0 && <span className="ml-1 text-[10px] font-semibold">{histCount}</span>}
                                </Button>
                                {view === 'manage' && (
                                  <>
                                    <Button size="sm" variant="outline" onClick={() => onEdit(item)} title="Edit" data-testid={`edit-btn-${item.id}`}>
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => onDelete(item)} title="Delete" data-testid={`delete-btn-${item.id}`}>
                                      <Trash2 className="h-3 w-3 text-red-600" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function buildPrintHtml(items, opts = {}) {
  const footer = opts.footer || null;
  // Group items
  const grouped = {};
  for (const it of items) {
    const cat = it.category || 'Other';
    const sub = it.subcategory || 'Other';
    grouped[cat] = grouped[cat] || {};
    grouped[cat][sub] = grouped[cat][sub] || [];
    grouped[cat][sub].push(it);
  }

  const reviewDate = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });

  let body = '';
  // Custom display order per user preference
  const PREFERRED_ORDER = [
    'Victorian Legislation',
    'Victorian Codes of Practice',
    'Environmental'
  ];
  const allCats = Object.keys(grouped);
  const orderedCats = [
    ...PREFERRED_ORDER.filter(c => allCats.includes(c)),
    ...allCats.filter(c => !PREFERRED_ORDER.includes(c)).sort()
  ];
  orderedCats.forEach((cat) => {
    body += `<h2 class="cat">${cat}</h2>`;
    Object.keys(grouped[cat]).sort().forEach((sub) => {
      body += `<h3 class="sub">${sub}</h3><ul>`;
      grouped[cat][sub].forEach((it) => {
        const yearStr = it.year ? ` &ndash; ${it.year}` : '';
        const meta = [];
        if (it.responsible_person) meta.push(`Responsible: ${it.responsible_person}`);
        if (it.last_review_date) meta.push(`Last reviewed: ${formatDate(it.last_review_date)}`);
        body += `<li><strong>${it.name}${yearStr}</strong>`;
        if (meta.length) body += `<div class="meta">${meta.join(' &nbsp;|&nbsp; ')}</div>`;
        if (it.notes) body += `<div class="notes">${it.notes}</div>`;
        body += `</li>`;
      });
      body += `</ul>`;
    });
  });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Legal Requirements Register</title>
  <style>
    ${buildPrintFooterCss()}
    html, body { margin: 0; padding: 0; }
    body { font-family: Calibri, Arial, sans-serif; color: #222; line-height: 1.45; font-size: 12pt; }
    h1 { text-align: center; font-size: 18pt; margin: 0 0 4px 0; }
    .review { text-align: center; font-size: 12pt; color: #333; margin-bottom: 14px; font-weight: bold; }
    .scope { background: #f4f4f4; padding: 10px; border-left: 4px solid #555; margin-bottom: 16px; font-size: 12pt; }
    h2.cat { font-size: 14pt; margin-top: 18px; padding: 6px 8px; background: #e8eef7; border: 1px solid #888; page-break-after: avoid; }
    h3.sub { font-size: 12pt; margin: 10px 0 4px 0; color: #222; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 2px; border-bottom: 1px solid #aaa; page-break-after: avoid; }
    ul { margin: 0 0 10px 18px; padding: 0; }
    li { margin-bottom: 6px; font-size: 12pt; page-break-inside: avoid; }
    .meta { font-size: 11pt; color: #555; margin-top: 2px; }
    .notes { font-size: 11pt; color: #555; font-style: italic; margin-top: 2px; }
    .print-tip {
      background: #fff3cd;
      border: 1px solid #ffc107;
      padding: 10px;
      margin-bottom: 14px;
      font-size: 11pt;
      border-radius: 4px;
    }
    @media print {
      button { display: none; }
      .print-tip { display: none; }
    }
  </style></head><body>${buildPrintBodyOpen(footer)}
    <h1>Ultimate Laser Pty. Ltd. — Legal Requirements Register</h1>
    <div class="review">Printed Date: ${reviewDate}</div>
    <div class="scope">
      <strong>Scope:</strong> Environmental, OHS Acts and Regulations, Compliance Standards, Codes,
      Codes of Practice, Industry Standards.
    </div>
    ${body || '<p style="text-align:center;color:#888;">No legal requirements recorded.</p>'}
    ${buildPrintBodyClose()}
  </body></html>`;
}
