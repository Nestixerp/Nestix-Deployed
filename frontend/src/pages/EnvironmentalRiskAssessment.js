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
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, Printer, Save, X, FileText, ArrowLeft, AlertTriangle, CheckCircle2, Sparkles, Loader2, Settings, Infinity as InfinityIcon
} from 'lucide-react';

// ============================================================
// 5×5 Risk Matrix (ISO 14001 Risk Assessment Revision 3)
// Rows = Consequence (1=Negligible → 5=Catastrophic)
// Cols = Likelihood (A=Frequent → E=Rare)
// ============================================================
const RISK_MATRIX = {
  5: { A: 8, B: 7, C: 6, D: 5, E: 5 }, // Catastrophic
  4: { A: 7, B: 6, C: 5, D: 4, E: 3 }, // Critical
  3: { A: 6, B: 5, C: 4, D: 3, E: 2 }, // Major
  2: { A: 5, B: 4, C: 3, D: 2, E: 1 }, // Minor
  1: { A: 4, B: 3, C: 2, D: 1, E: 0 }, // Negligible
};

const CONSEQUENCE_OPTIONS = [
  { value: 5, label: '5 — Catastrophic', desc: 'Major emergency incident, e.g. toxic gas cloud, involving external emergency services, major release of polluting substances, serious breach of regulations which could lead to prosecution.' },
  { value: 4, label: '4 — Critical', desc: 'Emergency involving high release of polluting substances e.g. spill of liquid from drums but not involving emergency services, major breach of regulations leading to likely complaint by regulators and possible prosecution.' },
  { value: 3, label: '3 — Major', desc: 'Emergency involving significant release of polluting substances e.g. spill of liquid from drums but not involving emergency services: major breach of regulations leading to likely complaint by regulators and possible prosecution.' },
  { value: 2, label: '2 — Minor', desc: 'Incident leading to moderate level of pollution e.g. small quantity of toxic material discharged or a larger quantity of less toxic material: breach of regulations which could lead to complaint by regulators.' },
  { value: 1, label: '1 — Negligible', desc: 'Incident involving infringement of regulations but not significant environmental effect e.g. uncontrolled discharge of clean water to surface water drains.' },
];

const LIKELIHOOD_OPTIONS = [
  { value: 'A', label: 'A — Frequent', desc: 'Is expected to occur in most circumstances (Daily)' },
  { value: 'B', label: 'B — Reasonable / Probable', desc: 'Will probably occur in most circumstances (Weekly exposure)' },
  { value: 'C', label: 'C — Occasional', desc: 'Might occur at some time (Weekly – monthly exposure)' },
  { value: 'D', label: 'D — Remote', desc: 'Could occur at some time (Monthly)' },
  { value: 'E', label: 'E — Rare', desc: 'May occur in extraordinary circumstances' },
];

const BY_WHOM_DEFAULTS = ['Operations Manager', 'Quality Manager', 'Programmers', 'Maintenance', 'Operators', 'All'];

const computeScore = (consequence, likelihood) => {
  const c = parseInt(consequence);
  if (!c || !likelihood) return 0;
  return RISK_MATRIX[c]?.[likelihood] ?? 0;
};

const levelFromScore = (s) => {
  const n = parseInt(s);
  if (Number.isNaN(n)) return 'None';
  if (n === 0) return 'None';
  if (n <= 3) return 'Low';
  if (n <= 5) return 'Medium';
  return 'High';
};

const levelColor = (lvl) => ({
  None: 'bg-slate-100 text-slate-700 border-slate-300',
  Low: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  Medium: 'bg-orange-100 text-orange-800 border-orange-300',
  High: 'bg-red-100 text-red-800 border-red-300'
}[lvl] || 'bg-slate-100 text-slate-800');

const cellBgForScore = (score) => {
  const n = parseInt(score);
  if (Number.isNaN(n) || n === 0) return '#ffffff';
  if (n <= 3) return '#fde68a'; // yellow
  if (n <= 5) return '#fdba74'; // orange
  return '#fca5a5'; // red
};

const emptyImpact = () => ({
  id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  aspect: '',
  impact: '',
  consequence: 0, likelihood: '',
  risk_score: 0, risk_level: 'None',
  actions: '', by_whom: '', by_when: '',
  revised_consequence: 0, revised_likelihood: '',
  revised_risk_score: 0, revised_risk_level: '', revised_date: ''
});

const todayISO = () => new Date().toISOString().split('T')[0];
const plusYearISO = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
};
const daysUntil = (iso) => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!t) return null;
  return Math.ceil((t - Date.now()) / (1000 * 60 * 60 * 24));
};

// Normalize impact: ensure score & level reflect current consequence × likelihood
const normaliseImpact = (i) => {
  const out = { ...i };
  out.risk_score = computeScore(out.consequence, out.likelihood);
  out.risk_level = levelFromScore(out.risk_score);
  if (out.revised_consequence && out.revised_likelihood) {
    out.revised_risk_score = computeScore(out.revised_consequence, out.revised_likelihood);
    out.revised_risk_level = levelFromScore(out.revised_risk_score);
  } else {
    out.revised_risk_score = 0;
    out.revised_risk_level = '';
  }
  return out;
};

export default function EnvironmentalRiskAssessment() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newAspect, setNewAspect] = useState('');
  const [newDateCreated, setNewDateCreated] = useState(todayISO());
  const [filterLevel, setFilterLevel] = useState('All'); // All | High | Medium | Low | None
  const [filterStatus, setFilterStatus] = useState('All'); // All | Overdue | DueSoon | OK

  useEffect(() => { fetchRecords(); }, []);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const res = await api.get('/environmental-risks');
      setRecords(res.data || []);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!newAspect.trim()) { toast.error('Aspect required'); return; }
    try {
      const payload = {
        aspect: newAspect.trim(),
        date_created: newDateCreated,
        review_date: plusYearISO(newDateCreated),
        impacts: [emptyImpact()],
        actions_summary: ''
      };
      const res = await api.post('/environmental-risks', payload);
      toast.success('Record created');
      setCreateOpen(false);
      setNewAspect('');
      setNewDateCreated(todayISO());
      await fetchRecords();
      setEditing(res.data);
    } catch { toast.error('Create failed'); }
  };

  const handleDelete = async (rec) => {
    if (!window.confirm(`Delete record for "${rec.aspect}"? This cannot be undone.`)) return;
    try { await api.delete(`/environmental-risks/${rec.id}`); toast.success('Deleted'); fetchRecords(); }
    catch { toast.error('Delete failed'); }
  };

  // Helper to compute highest score & status bucket for a record (used by filter + render + print)
  const recordSummary = (r) => {
    let highest = 0;
    (r.impacts || []).forEach((imp) => {
      const useRevised = imp.revised_risk_score && imp.revised_risk_score > 0;
      const s = parseInt(useRevised ? imp.revised_risk_score : imp.risk_score) || 0;
      if (s > highest) highest = s;
    });
    const level = levelFromScore(highest);
    const days = daysUntil(r.review_date);
    let statusBucket = 'NoDate';
    if (days !== null) {
      if (days < 0) statusBucket = 'Overdue';
      else if (days <= 30) statusBucket = 'DueSoon';
      else statusBucket = 'OK';
    }
    return { highest, level, days, statusBucket };
  };

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const { level, statusBucket } = recordSummary(r);
      if (filterLevel !== 'All' && level !== filterLevel) return false;
      if (filterStatus !== 'All' && statusBucket !== filterStatus) return false;
      return true;
    });
  }, [records, filterLevel, filterStatus]); // eslint-disable-line

  if (editing) {
    return <RiskEditor record={editing} onBack={() => { setEditing(null); fetchRecords(); }} onSaved={(d) => setEditing(d)} />;
  }

  const handlePrintIndex = async () => {
    invalidateDocControlCache();
    const doc = await getControlledDocumentByModule('Environmental Risk Assessment Register', { fallback: 'Environmental Risk Assessment', docType: 'Register' });
    const footer = buildDocControlFooter(doc, {
      title: 'Environmental Risk Assessment Index', owner: 'Quality Manager',
    });
    const w = window.open('', '_blank', 'width=1100,height=1200');
    if (!w) { toast.error('Pop-up blocked'); return; }
    w.document.write(buildIndexPrintHtml(filteredRecords, { filterLevel, filterStatus, footer }));
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };

  return (
    <div className="space-y-6 p-1" data-testid="env-risk-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Environmental Aspect / Impact Risk Assessment</h1>
          <p className="text-sm text-slate-600">ISO 14001 Index — 5×5 Risk Matrix (Revision 3) — review each record annually</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrintIndex} disabled={!filteredRecords.length} data-testid="print-index-btn">
            <Printer className="h-4 w-4 mr-2" /> Print Index{(filterLevel !== 'All' || filterStatus !== 'All') ? ` (${filteredRecords.length})` : ''}
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="bg-slate-900" data-testid="new-risk-btn">
            <Plus className="h-4 w-4 mr-2" /> New Aspect
          </Button>
        </div>
      </div>

      {loading ? (
        <Card><CardContent className="py-10 text-center text-slate-500">Loading...</CardContent></Card>
      ) : records.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-12 w-12 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600 mb-4">No risk assessments yet.</p>
            <Button onClick={() => setCreateOpen(true)} data-testid="empty-new-btn">
              <Plus className="h-4 w-4 mr-2" /> Create First Assessment
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Index</CardTitle>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label className="text-xs">Risk Level</Label>
                  <select
                    value={filterLevel}
                    onChange={(e) => setFilterLevel(e.target.value)}
                    className="flex h-9 rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                    data-testid="filter-level"
                  >
                    <option value="All">All Levels</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                    <option value="None">None</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Review Status</Label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="flex h-9 rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                    data-testid="filter-status"
                  >
                    <option value="All">All Status</option>
                    <option value="Overdue">Overdue</option>
                    <option value="DueSoon">Due in ≤ 30d</option>
                    <option value="OK">OK</option>
                  </select>
                </div>
                {(filterLevel !== 'All' || filterStatus !== 'All') && (
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => { setFilterLevel('All'); setFilterStatus('All'); }}
                    data-testid="filter-clear"
                  >
                    <X className="h-3 w-3 mr-1" /> Clear
                  </Button>
                )}
                <div className="text-xs text-slate-500 self-center">
                  Showing {filteredRecords.length} of {records.length}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Risk Being Assessed</th>
                  <th className="text-left px-3 py-2 font-semibold">Date Created</th>
                  <th className="text-left px-3 py-2 font-semibold">Highest Risk</th>
                  <th className="text-left px-3 py-2 font-semibold">Review Date</th>
                  <th className="text-left px-3 py-2 font-semibold">Status</th>
                  <th className="text-right px-3 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr><td colSpan={6} className="text-center text-slate-500 py-8">No records match the current filter.</td></tr>
                ) : filteredRecords.map((r) => {
                  const { highest, level: highestLvl, days } = recordSummary(r);
                  let statusBadge;
                  if (days === null) statusBadge = <span className="text-slate-400 text-xs">—</span>;
                  else if (days < 0) statusBadge = <Badge className="bg-red-100 text-red-800 border-red-300" variant="outline"><AlertTriangle className="h-3 w-3 mr-1" /> Overdue by {Math.abs(days)}d</Badge>;
                  else if (days <= 30) statusBadge = <Badge className="bg-amber-100 text-amber-800 border-amber-300" variant="outline"><AlertTriangle className="h-3 w-3 mr-1" /> Due in {days}d</Badge>;
                  else statusBadge = <Badge className="bg-green-100 text-green-800 border-green-300" variant="outline"><CheckCircle2 className="h-3 w-3 mr-1" /> OK ({days}d)</Badge>;
                  return (
                    <tr key={r.id} className="border-t hover:bg-slate-50" data-testid={`risk-row-${r.id}`}>
                      <td className="px-3 py-2 font-medium">{r.aspect}</td>
                      <td className="px-3 py-2">{r.date_created ? formatDate(r.date_created) : '—'}</td>
                      <td className="px-3 py-2">
                        <Badge className={levelColor(highestLvl)} variant="outline">{highestLvl} ({highest})</Badge>
                      </td>
                      <td className="px-3 py-2">{r.review_date ? formatDate(r.review_date) : '—'}</td>
                      <td className="px-3 py-2">{statusBadge}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setEditing(r)} data-testid={`open-${r.id}`}><Edit className="h-3 w-3 mr-1" /> Open</Button>
                          <Button size="sm" variant="outline" onClick={() => handleDelete(r)} title="Delete"><Trash2 className="h-3 w-3 text-red-600" /></Button>
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
            <DialogTitle>New Environmental Aspect</DialogTitle>
            <DialogDescription>Start a new risk assessment record. Review will default to 12 months from today.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Risk Being Assessed (Machine / Process) *</Label>
              <Input value={newAspect} onChange={(e) => setNewAspect(e.target.value)} placeholder="e.g. Fibre Laser Cutting Machine" data-testid="new-aspect" />
            </div>
            <div>
              <Label>Date Created</Label>
              <Input type="date" value={newDateCreated} onChange={(e) => setNewDateCreated(e.target.value)} data-testid="new-date" />
              <div className="text-xs text-slate-500 mt-1">Review will be set to {plusYearISO(newDateCreated) || '—'}</div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}><X className="h-4 w-4 mr-2" /> Cancel</Button>
            <Button onClick={handleCreate} className="bg-slate-900" data-testid="create-confirm"><Save className="h-4 w-4 mr-2" /> Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RiskEditor({ record, onBack, onSaved }) {
  const [aspect, setAspect] = useState(record.aspect || '');
  const [dateCreated, setDateCreated] = useState(record.date_created || '');
  const [reviewDate, setReviewDate] = useState(record.review_date || '');
  const [impacts, setImpacts] = useState((record.impacts || []).map((i) => normaliseImpact(i)));
  const [actionsSummary, setActionsSummary] = useState(record.actions_summary || '');
  const [saving, setSaving] = useState(false);
  const [aiLoadingIdx, setAiLoadingIdx] = useState(null);
  const [aiRateLoadingIdx, setAiRateLoadingIdx] = useState(null);
  const [byWhomOptions, setByWhomOptions] = useState(BY_WHOM_DEFAULTS);
  const [byWhomDialogOpen, setByWhomDialogOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/environmental-risks/settings/by-whom');
        if (res.data?.options?.length) setByWhomOptions(res.data.options);
      } catch { /* keep defaults */ }
    })();
  }, []);

  useEffect(() => {
    setAspect(record.aspect || '');
    setDateCreated(record.date_created || '');
    setReviewDate(record.review_date || '');
    setImpacts((record.impacts || []).map((i) => normaliseImpact(i)));
    setActionsSummary(record.actions_summary || '');
  }, [record.id]);

  useEffect(() => {
    if (!reviewDate && dateCreated) setReviewDate(plusYearISO(dateCreated));
  }, [dateCreated]); // eslint-disable-line

  const updateImpact = (idx, field, value) => {
    const next = [...impacts];
    next[idx] = { ...next[idx], [field]: value };
    next[idx] = normaliseImpact(next[idx]);
    setImpacts(next);
  };

  const addImpact = () => setImpacts([...impacts, emptyImpact()]);
  const removeImpact = (idx) => setImpacts(impacts.filter((_, i) => i !== idx));

  const markRevised = (idx) => {
    const next = [...impacts];
    next[idx] = {
      ...next[idx],
      revised_consequence: next[idx].revised_consequence || next[idx].consequence || 1,
      revised_likelihood: next[idx].revised_likelihood || next[idx].likelihood || 'E',
      revised_date: todayISO()
    };
    next[idx] = normaliseImpact(next[idx]);
    setImpacts(next);
  };

  const aiSuggestActions = async (idx) => {
    const imp = impacts[idx];
    if (!imp.impact && !imp.aspect && !aspect) { toast.error('Add an Aspect or Impact first'); return; }
    setAiLoadingIdx(idx);
    try {
      const res = await api.post('/environmental-risks/ai-suggest-actions', {
        aspect: imp.aspect || aspect,
        impact: imp.impact || '',
        risk_level: imp.risk_level || ''
      });
      const suggestions = res.data?.suggestions || '';
      if (!suggestions) { toast.error('No suggestions returned'); return; }
      const next = [...impacts];
      // Append (don't overwrite) if there's existing content
      next[idx] = {
        ...next[idx],
        actions: next[idx].actions ? `${next[idx].actions}\n\n${suggestions}` : suggestions
      };
      setImpacts(next);
      toast.success('AI suggestions added');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'AI suggestion failed');
    } finally {
      setAiLoadingIdx(null);
    }
  };

  const aiSuggestRating = async (idx) => {
    const imp = impacts[idx];
    if (!imp.impact && !imp.aspect && !aspect) { toast.error('Add an Aspect or Impact first'); return; }
    setAiRateLoadingIdx(idx);
    try {
      const res = await api.post('/environmental-risks/ai-suggest-rating', {
        aspect: imp.aspect || aspect,
        impact: imp.impact || ''
      });
      const { consequence, likelihood, score, level, reasoning } = res.data || {};
      if (!consequence || !likelihood) { toast.error('No rating returned'); return; }
      const next = [...impacts];
      next[idx] = { ...next[idx], consequence, likelihood };
      next[idx] = normaliseImpact(next[idx]);
      setImpacts(next);
      toast.success(`AI rated: ${level} (${score}) — ${reasoning || ''}`, { duration: 6000 });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'AI rating failed');
    } finally {
      setAiRateLoadingIdx(null);
    }
  };

  const save = async () => {
    if (!aspect.trim()) { toast.error('Aspect required'); return; }
    setSaving(true);
    try {
      const cleaned = impacts.map((i) => normaliseImpact(i));
      const payload = { aspect, date_created: dateCreated, review_date: reviewDate, impacts: cleaned, actions_summary: actionsSummary };
      const res = await api.put(`/environmental-risks/${record.id}`, payload);
      toast.success('Saved');
      onSaved(res.data);
    } catch { toast.error('Save failed'); } finally { setSaving(false); }
  };

  const renewReview = () => {
    setReviewDate(plusYearISO(todayISO()));
    toast.info('Review date renewed (12 months from today). Click Save to apply.');
  };

  const handlePrint = async () => {
    invalidateDocControlCache();
    const doc = await getControlledDocumentByModule('Environmental Risk Assessment Form', { fallback: 'Environmental Risk Assessment', docType: 'Form' });
    const footer = buildDocControlFooter(doc, {
      title: 'Environmental Risk Assessment', owner: 'Quality Manager',
    });
    const w = window.open('', '_blank', 'width=1100,height=1200');
    if (!w) { toast.error('Pop-up blocked'); return; }
    w.document.write(buildPrintHtml({ aspect, date_created: dateCreated, review_date: reviewDate, impacts, actions_summary: actionsSummary, footer }));
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };

  const days = daysUntil(reviewDate);

  return (
    <div className="space-y-5 p-1" data-testid="env-risk-editor">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onBack} data-testid="back-btn"><ArrowLeft className="h-4 w-4 mr-2" /> Back to Index</Button>
          <h1 className="text-2xl font-bold text-slate-900">Risk Assessment — {aspect}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setByWhomDialogOpen(true)} data-testid="bywhom-edit-header" title="Add/edit responsible people (e.g. Operators, Maintenance, etc.)">
            <Settings className="h-4 w-4 mr-2" /> Edit &quot;By Whom&quot; List
          </Button>
          <Button variant="outline" onClick={handlePrint} data-testid="print-btn"><Printer className="h-4 w-4 mr-2" /> Print</Button>
          <Button onClick={save} disabled={saving} className="bg-slate-900" data-testid="save-btn"><Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save'}</Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
            <div>
              <Label>Risk Being Assessed (Machine / Process)</Label>
              <Input value={aspect} onChange={(e) => setAspect(e.target.value)} data-testid="editor-aspect" placeholder="e.g. Fibre Laser Cutting Machine" />
            </div>
            <div>
              <Label>Date Created</Label>
              <Input type="date" value={dateCreated} onChange={(e) => setDateCreated(e.target.value)} data-testid="editor-date" />
            </div>
            <div>
              <Label>Review Date <span className="text-xs text-slate-500">(annual)</span></Label>
              <div className="flex gap-2">
                <Input type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} data-testid="editor-review" />
                <Button type="button" variant="outline" size="sm" onClick={renewReview} title="Set to today + 12 months">Renew</Button>
              </div>
              {days !== null && (
                <div className={`text-xs mt-1 ${days < 0 ? 'text-red-700' : days <= 30 ? 'text-amber-700' : 'text-green-700'}`}>
                  {days < 0 ? `Overdue by ${Math.abs(days)} day(s)` : days === 0 ? 'Due today' : `Due in ${days} day(s)`}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Impacts & Risks (Consequence × Likelihood)</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4">
            {impacts.map((imp, idx) => {
              const isRevised = imp.revised_consequence > 0 && imp.revised_likelihood;
              return (
                <div key={imp.id} className="border rounded-lg p-3 bg-white" data-testid={`impact-row-${idx}`}>
                  {/* Row 0: Per-row Aspect (e.g. "Energy consumption during operation") */}
                  <div className="mb-2">
                    <Label className="text-xs">Aspect <span className="text-slate-400">(specific to this row — e.g. &quot;Energy consumption during operation&quot;)</span></Label>
                    <Input
                      value={imp.aspect || ''}
                      onChange={(e) => updateImpact(idx, 'aspect', e.target.value)}
                      className="text-sm h-9"
                      placeholder="What aspect of the machine/process is being assessed?"
                      data-testid={`impact-aspect-${idx}`}
                    />
                  </div>

                  {/* Row 1: Impact + Consequence + Likelihood + Score + Level + AI Rate */}
                  <div className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-12 md:col-span-4">
                      <Label className="text-xs">Impact</Label>
                      <Textarea rows={2} value={imp.impact} onChange={(e) => updateImpact(idx, 'impact', e.target.value)} className="text-sm" data-testid={`impact-text-${idx}`} />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Consequence (1–5)</Label>
                      </div>
                      <select
                        value={imp.consequence || ''}
                        onChange={(e) => updateImpact(idx, 'consequence', parseInt(e.target.value) || 0)}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                        data-testid={`impact-consequence-${idx}`}
                      >
                        <option value="">—</option>
                        {CONSEQUENCE_OPTIONS.map((c) => <option key={c.value} value={c.value} title={c.desc}>{c.label}</option>)}
                      </select>
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Likelihood (A–E)</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => aiSuggestRating(idx)}
                          disabled={aiRateLoadingIdx === idx}
                          className="h-6 px-2 text-[10px] bg-purple-50 border-purple-300 text-purple-800 hover:bg-purple-100"
                          data-testid={`ai-rate-${idx}`}
                          title="AI rates Consequence + Likelihood based on Aspect & Impact"
                        >
                          {aiRateLoadingIdx === idx
                            ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> ...</>
                            : <><Sparkles className="h-3 w-3 mr-1" /> AI Rate</>}
                        </Button>
                      </div>
                      <select
                        value={imp.likelihood || ''}
                        onChange={(e) => updateImpact(idx, 'likelihood', e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                        data-testid={`impact-likelihood-${idx}`}
                      >
                        <option value="">—</option>
                        {LIKELIHOOD_OPTIONS.map((l) => <option key={l.value} value={l.value} title={l.desc}>{l.label}</option>)}
                      </select>
                    </div>
                    <div className="col-span-6 md:col-span-1">
                      <Label className="text-xs">Score</Label>
                      <div
                        className="h-9 mt-1 flex items-center justify-center font-bold rounded border"
                        style={{ background: cellBgForScore(imp.risk_score) }}
                        data-testid={`impact-score-${idx}`}
                      >
                        {imp.risk_score}
                      </div>
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <Label className="text-xs">Risk Level</Label>
                      <div className="mt-1">
                        <Badge className={`${levelColor(imp.risk_level)} font-bold`} data-testid={`impact-level-${idx}`}>
                          {imp.risk_level}
                        </Badge>
                      </div>
                    </div>
                    <div className="col-span-12 md:col-span-1 flex md:justify-end items-end">
                      <Button size="sm" variant="ghost" onClick={() => removeImpact(idx)} title="Remove impact"><Trash2 className="h-3 w-3 text-red-600" /></Button>
                    </div>
                  </div>

                  {/* Row 2: Actions + AI Suggest */}
                  <div className="grid grid-cols-12 gap-2 mt-2 pt-2 border-t border-slate-100">
                    <div className="col-span-12 md:col-span-8">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Corrective Actions</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => aiSuggestActions(idx)}
                          disabled={aiLoadingIdx === idx}
                          className="h-7 text-xs bg-purple-50 border-purple-300 text-purple-800 hover:bg-purple-100"
                          data-testid={`ai-suggest-${idx}`}
                        >
                          {aiLoadingIdx === idx
                            ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Thinking...</>
                            : <><Sparkles className="h-3 w-3 mr-1" /> AI Suggest Actions</>}
                        </Button>
                      </div>
                      <Textarea rows={3} value={imp.actions} onChange={(e) => updateImpact(idx, 'actions', e.target.value)} className="text-sm" data-testid={`impact-actions-${idx}`} />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">By Whom</Label>
                        <Button
                          type="button" variant="ghost" size="sm"
                          className="h-5 px-1 text-[10px] text-slate-500 hover:text-slate-900"
                          onClick={() => setByWhomDialogOpen(true)}
                          data-testid="bywhom-edit-list"
                          title="Edit By Whom options"
                        >
                          <Settings className="h-3 w-3" />
                        </Button>
                      </div>
                      <select
                        value={imp.by_whom || ''}
                        onChange={(e) => updateImpact(idx, 'by_whom', e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                        data-testid={`impact-bywhom-${idx}`}
                      >
                        <option value="">—</option>
                        {byWhomOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                        {/* Preserve legacy / custom value if not in current options */}
                        {imp.by_whom && !byWhomOptions.includes(imp.by_whom) && (
                          <option value={imp.by_whom}>{imp.by_whom}</option>
                        )}
                      </select>
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <Label className="text-xs">By When</Label>
                      {imp.by_when === 'Ongoing' ? (
                        <div className="flex items-center gap-1 h-9">
                          <Badge className="bg-blue-100 text-blue-800 border-blue-300 font-bold" variant="outline" data-testid={`impact-bywhen-ongoing-${idx}`}>
                            <InfinityIcon className="h-3 w-3 mr-1" /> Ongoing
                          </Badge>
                          <Button
                            type="button" variant="ghost" size="sm" className="h-7 px-1"
                            onClick={() => updateImpact(idx, 'by_when', '')}
                            title="Clear"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Input
                            type="date"
                            value={imp.by_when || ''}
                            onChange={(e) => updateImpact(idx, 'by_when', e.target.value)}
                            className="text-sm h-9 flex-1"
                            data-testid={`impact-bywhen-${idx}`}
                          />
                          <Button
                            type="button" variant="outline" size="sm"
                            className="h-9 px-2 text-xs bg-blue-50 border-blue-300 text-blue-800 hover:bg-blue-100"
                            onClick={() => updateImpact(idx, 'by_when', 'Ongoing')}
                            data-testid={`impact-bywhen-ongoing-btn-${idx}`}
                            title="Mark as Ongoing"
                          >
                            Ongoing
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Row 3: Revised */}
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    {!isRevised ? (
                      <div className="flex items-center">
                        <Button
                          variant="outline" size="sm"
                          onClick={() => markRevised(idx)}
                          disabled={!imp.actions}
                          className="bg-blue-50 border-blue-300 text-blue-800 hover:bg-blue-100"
                          data-testid={`mark-revised-${idx}`}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Mark as Revised (Re-assess after action)
                        </Button>
                        {!imp.actions && <span className="text-xs text-slate-500 ml-2">(fill Actions first)</span>}
                      </div>
                    ) : (
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-12 md:col-span-3">
                          <Label className="text-xs">Revised Consequence</Label>
                          <select
                            value={imp.revised_consequence || ''}
                            onChange={(e) => updateImpact(idx, 'revised_consequence', parseInt(e.target.value) || 0)}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                            data-testid={`impact-rev-consequence-${idx}`}
                          >
                            <option value="">—</option>
                            {CONSEQUENCE_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                        </div>
                        <div className="col-span-12 md:col-span-3">
                          <Label className="text-xs">Revised Likelihood</Label>
                          <select
                            value={imp.revised_likelihood || ''}
                            onChange={(e) => updateImpact(idx, 'revised_likelihood', e.target.value)}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                            data-testid={`impact-rev-likelihood-${idx}`}
                          >
                            <option value="">—</option>
                            {LIKELIHOOD_OPTIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                          </select>
                        </div>
                        <div className="col-span-6 md:col-span-2">
                          <Label className="text-xs">Revised Score</Label>
                          <div
                            className="h-9 mt-1 flex items-center justify-center font-bold rounded border"
                            style={{ background: cellBgForScore(imp.revised_risk_score) }}
                            data-testid={`impact-rev-score-${idx}`}
                          >
                            {imp.revised_risk_score}
                          </div>
                        </div>
                        <div className="col-span-6 md:col-span-2">
                          <Label className="text-xs">Revised Level</Label>
                          <div className="mt-1">
                            <Badge className={`${levelColor(imp.revised_risk_level)} font-bold`}>{imp.revised_risk_level}</Badge>
                          </div>
                        </div>
                        <div className="col-span-12 md:col-span-2">
                          <Label className="text-xs">Revised On</Label>
                          <div className="text-sm text-slate-700 mt-2">{imp.revised_date ? formatDate(imp.revised_date) : '—'}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Button variant="outline" onClick={addImpact} className="mt-3" data-testid="add-impact-btn">
            <Plus className="h-4 w-4 mr-2" /> Add Impact / Risk
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Overall Actions / Summary</CardTitle></CardHeader>
        <CardContent>
          <Textarea rows={3} value={actionsSummary} onChange={(e) => setActionsSummary(e.target.value)} placeholder="Optional overall summary or notes for the auditor..." data-testid="editor-summary" />
        </CardContent>
      </Card>

      <RiskMatrixLegend />

      <ByWhomEditDialog
        open={byWhomDialogOpen}
        onClose={() => setByWhomDialogOpen(false)}
        options={byWhomOptions}
        onSaved={(opts) => setByWhomOptions(opts)}
      />
    </div>
  );
}

function ByWhomEditDialog({ open, onClose, options, onSaved }) {
  const [items, setItems] = useState(options);
  const [newItem, setNewItem] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setItems(options); setNewItem(''); } }, [open, options]);

  const addItem = () => {
    const v = newItem.trim();
    if (!v) return;
    if (items.some((i) => i.toLowerCase() === v.toLowerCase())) {
      toast.error('Already exists');
      return;
    }
    setItems([...items, v]);
    setNewItem('');
  };

  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx, val) => {
    const next = [...items];
    next[idx] = val;
    setItems(next);
  };
  const moveUp = (idx) => {
    if (idx === 0) return;
    const next = [...items];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setItems(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.put('/environmental-risks/settings/by-whom', { options: items });
      onSaved(res.data?.options || items);
      toast.success('By Whom options saved');
      onClose();
    } catch { toast.error('Save failed'); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md" data-testid="bywhom-dialog">
        <DialogHeader>
          <DialogTitle>Edit &quot;By Whom&quot; Options</DialogTitle>
          <DialogDescription>Add or remove the responsible people/teams used across all environmental risk records.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {items.length === 0 && <div className="text-sm text-slate-500 py-4 text-center">No options yet. Add one below.</div>}
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2" data-testid={`bywhom-item-${idx}`}>
              <span className="text-xs text-slate-400 w-6 text-right">{idx + 1}.</span>
              <Input value={item} onChange={(e) => updateItem(idx, e.target.value)} className="text-sm h-9 flex-1" />
              <Button size="sm" variant="outline" className="h-9 px-2" onClick={() => moveUp(idx)} disabled={idx === 0} title="Move up">↑</Button>
              <Button size="sm" variant="ghost" className="h-9 px-2" onClick={() => removeItem(idx)} title="Remove" data-testid={`bywhom-remove-${idx}`}>
                <Trash2 className="h-3 w-3 text-red-600" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2 pt-3 border-t">
          <Input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
            placeholder="New option (e.g. Operations Manager)"
            className="text-sm h-9 flex-1"
            data-testid="bywhom-new-input"
          />
          <Button size="sm" variant="outline" onClick={addItem} data-testid="bywhom-add-btn">
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}><X className="h-4 w-4 mr-2" /> Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-slate-900" data-testid="bywhom-save"><Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RiskMatrixLegend() {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Risk Matrix & Action Guideline</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="text-sm border border-slate-300 w-full max-w-3xl" data-testid="risk-matrix-legend">
            <thead>
              <tr className="bg-slate-100">
                <th className="border px-2 py-1 text-left" colSpan={2}>CONSEQUENCES ↓</th>
                <th className="border px-2 py-1 text-center" colSpan={5}>LIKELIHOOD →</th>
              </tr>
              <tr className="bg-slate-50">
                <th className="border px-2 py-1 text-left">Descriptor</th>
                <th className="border px-2 py-1 text-center">Lvl</th>
                <th className="border px-2 py-1 text-center">A<br/><span className="font-normal text-xs">Frequent</span></th>
                <th className="border px-2 py-1 text-center">B<br/><span className="font-normal text-xs">Reas. Probable</span></th>
                <th className="border px-2 py-1 text-center">C<br/><span className="font-normal text-xs">Occasional</span></th>
                <th className="border px-2 py-1 text-center">D<br/><span className="font-normal text-xs">Remote</span></th>
                <th className="border px-2 py-1 text-center">E<br/><span className="font-normal text-xs">Rare</span></th>
              </tr>
            </thead>
            <tbody>
              {[5, 4, 3, 2, 1].map((c) => {
                const name = CONSEQUENCE_OPTIONS.find((o) => o.value === c).label.split(' — ')[1];
                return (
                  <tr key={c}>
                    <td className="border px-2 py-1 font-medium">{name}</td>
                    <td className="border px-2 py-1 text-center">{c}</td>
                    {['A', 'B', 'C', 'D', 'E'].map((l) => {
                      const score = RISK_MATRIX[c][l];
                      return (
                        <td key={l} className="border px-2 py-1 text-center font-bold" style={{ background: cellBgForScore(score) }}>{score}</td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <table className="text-sm border mt-3 max-w-3xl w-full">
          <thead className="bg-slate-100">
            <tr>
              <th className="border px-2 py-1 text-left">Score</th>
              <th className="border px-2 py-1 text-left">Risk Level</th>
              <th className="border px-2 py-1 text-left">Action Required</th>
            </tr>
          </thead>
          <tbody>
            <tr><td className="border px-2 py-1" style={{ background: '#fca5a5' }}>6, 7, 8</td><td className="border px-2 py-1 font-bold">High Risk</td><td className="border px-2 py-1">Requires Corrective Action</td></tr>
            <tr><td className="border px-2 py-1" style={{ background: '#fdba74' }}>4, 5</td><td className="border px-2 py-1 font-bold">Medium Risk</td><td className="border px-2 py-1">Requires corrective action review, implement as required</td></tr>
            <tr><td className="border px-2 py-1" style={{ background: '#fde68a' }}>1, 2, 3</td><td className="border px-2 py-1 font-bold">Low Risk</td><td className="border px-2 py-1">Requires corrective action review, implement where practicable</td></tr>
            <tr><td className="border px-2 py-1">0</td><td className="border px-2 py-1">None</td><td className="border px-2 py-1">No action required</td></tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function buildPrintHtml({ aspect, date_created, review_date, impacts, actions_summary, footer }) {
  const fmt = (iso) => {
    if (!iso) return '';
    if (iso === 'Ongoing') return 'Ongoing';
    const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`;
  };
  const rows = (impacts || []).map((i) => `
    <tr>
      <td>${escapeHtml(i.aspect || '')}</td>
      <td>${escapeHtml(i.impact || '')}</td>
      <td style="text-align:center;">${i.consequence || ''}</td>
      <td style="text-align:center;">${escapeHtml(i.likelihood || '')}</td>
      <td style="text-align:center;font-weight:bold;background:${cellBgForScore(i.risk_score)};">${i.risk_score || 0}</td>
      <td style="text-align:center;font-weight:bold;">${escapeHtml(i.risk_level || '')}</td>
      <td>${escapeHtml(i.actions || '').replace(/\n/g, '<br/>')}</td>
      <td>${escapeHtml(i.by_whom || '')}</td>
      <td style="text-align:center;">${fmt(i.by_when)}</td>
      <td style="text-align:center;">${i.revised_consequence || ''}</td>
      <td style="text-align:center;">${escapeHtml(i.revised_likelihood || '')}</td>
      <td style="text-align:center;font-weight:bold;background:${cellBgForScore(i.revised_risk_score)};">${i.revised_risk_score || 0}</td>
      <td style="text-align:center;font-weight:bold;">${escapeHtml(i.revised_risk_level || '')}</td>
    </tr>`).join('');
  const matrixRows = [5, 4, 3, 2, 1].map((c) => {
    const name = CONSEQUENCE_OPTIONS.find((o) => o.value === c).label.split(' — ')[1];
    const cells = ['A', 'B', 'C', 'D', 'E'].map((l) => {
      const sc = RISK_MATRIX[c][l];
      return `<td style="text-align:center;font-weight:bold;background:${cellBgForScore(sc)};">${sc}</td>`;
    }).join('');
    return `<tr><td>${name}</td><td style="text-align:center;">${c}</td>${cells}</tr>`;
  }).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Environmental Risk Assessment</title>
  <style>
    ${buildPrintFooterCss().replace('size: A4 portrait;', 'size: A4 landscape;')}
    body { font-family: Calibri, Arial, sans-serif; color: #000; font-size: 10pt; }
    h1 { text-align: center; font-size: 14pt; margin: 0 0 4px 0; }
    h2 { font-size: 11pt; margin: 12px 0 4px 0; }
    .meta { display: flex; justify-content: space-between; font-size: 10pt; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #000; padding: 4px 5px; font-size: 9pt; vertical-align: top; }
    th { background: #d9e2f3; }
    .summary { margin-top: 10px; border: 1px solid #000; padding: 8px; }
    .matrix-tbl { max-width: 55%; }
    .matrix-tbl th { text-align: center; }
    @media print { button { display: none; } }
  </style></head><body>${buildPrintBodyOpen(footer)}
    <h1>Environmental Aspect / Impact Risk Assessment</h1>
    <div class="meta">
      <span><strong>Risk Being Assessed:</strong> ${escapeHtml(aspect || '')}</span>
      <span><strong>Date Created:</strong> ${fmt(date_created)}</span>
      <span><strong>Review Date:</strong> ${fmt(review_date)}</span>
    </div>
    <table>
      <thead><tr>
        <th style="width: 14%;">Aspect</th>
        <th style="width: 16%;">Impact</th>
        <th>C</th>
        <th>L</th>
        <th>Score</th>
        <th>Level</th>
        <th style="width: 18%;">Corrective Actions</th>
        <th style="width: 9%;">By Whom</th>
        <th style="width: 7%;">By When</th>
        <th>Rev C</th>
        <th>Rev L</th>
        <th>Rev Score</th>
        <th>Rev Level</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="13" style="text-align:center;padding:12px;">No impacts</td></tr>'}</tbody>
    </table>
    ${actions_summary ? `<div class="summary"><strong>Overall Summary:</strong> ${escapeHtml(actions_summary).replace(/\n/g, '<br/>')}</div>` : ''}
    <h2>Risk Matrix (Consequence × Likelihood)</h2>
    <table class="matrix-tbl">
      <thead>
        <tr><th rowspan="2">Consequence</th><th rowspan="2">Lvl</th><th colspan="5">Likelihood</th></tr>
        <tr><th>A – Frequent</th><th>B – Probable</th><th>C – Occasional</th><th>D – Remote</th><th>E – Rare</th></tr>
      </thead>
      <tbody>${matrixRows}</tbody>
    </table>
    <table style="max-width: 55%; margin-top: 6px;">
      <tr><td style="background:#fca5a5;">Score 6–8</td><td><strong>High</strong> — Requires Corrective Action</td></tr>
      <tr><td style="background:#fdba74;">Score 4–5</td><td><strong>Medium</strong> — Implement as required</td></tr>
      <tr><td style="background:#fde68a;">Score 1–3</td><td><strong>Low</strong> — Implement where practicable</td></tr>
    </table>
    ${buildPrintBodyClose()}
  </body></html>`;
}

function buildIndexPrintHtml(records, filters = {}) {
  const footer = filters.footer || null;
  const { filterLevel = 'All', filterStatus = 'All' } = filters;
  const statusLabels = { All: 'All Status', Overdue: 'Overdue', DueSoon: 'Due in ≤ 30 days', OK: 'OK' };
  const hasFilter = filterLevel !== 'All' || filterStatus !== 'All';
  const fmt = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`;
  };
  const today = new Date();
  const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

  const rows = (records || []).map((r, idx) => {
    const impacts = r.impacts || [];
    let highest = 0;
    impacts.forEach((imp) => {
      const useRevised = imp.revised_risk_score && imp.revised_risk_score > 0;
      const s = parseInt(useRevised ? imp.revised_risk_score : imp.risk_score) || 0;
      if (s > highest) highest = s;
    });
    const highestLvl = levelFromScore(highest);
    // Days until review (server may not have computed; we re-derive here)
    let statusText = '—';
    if (r.review_date) {
      const t = new Date(r.review_date).getTime();
      if (t) {
        const days = Math.ceil((t - Date.now()) / (1000 * 60 * 60 * 24));
        if (days < 0) statusText = `Overdue by ${Math.abs(days)}d`;
        else if (days === 0) statusText = 'Due today';
        else if (days <= 30) statusText = `Due in ${days}d`;
        else statusText = `OK (${days}d)`;
      }
    }
    return `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td>${escapeHtml(r.aspect || '')}</td>
        <td style="text-align:center;">${fmt(r.date_created)}</td>
        <td style="text-align:center;">${impacts.length}</td>
        <td style="text-align:center;font-weight:bold;background:${cellBgForScore(highest)};">${highest} — ${highestLvl}</td>
        <td style="text-align:center;">${fmt(r.review_date)}</td>
        <td style="text-align:center;">${escapeHtml(statusText)}</td>
      </tr>`;
  }).join('');

  // Summary counts by highest-risk level
  const counts = { High: 0, Medium: 0, Low: 0, None: 0 };
  (records || []).forEach((r) => {
    let highest = 0;
    (r.impacts || []).forEach((imp) => {
      const useRevised = imp.revised_risk_score && imp.revised_risk_score > 0;
      const s = parseInt(useRevised ? imp.revised_risk_score : imp.risk_score) || 0;
      if (s > highest) highest = s;
    });
    const lvl = levelFromScore(highest);
    counts[lvl] = (counts[lvl] || 0) + 1;
  });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Environmental Risk Assessment Index</title>
  <style>
    ${buildPrintFooterCss()}
    body { font-family: Calibri, Arial, sans-serif; color: #000; font-size: 10pt; }
    h1 { text-align: center; font-size: 15pt; margin: 0 0 4px 0; }
    .meta { display: flex; justify-content: space-between; font-size: 10pt; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #000; padding: 5px 6px; font-size: 9.5pt; vertical-align: top; }
    th { background: #d9e2f3; }
    .summary { display: flex; gap: 12px; margin: 10px 0; font-size: 10pt; }
    .summary div { border: 1px solid #000; padding: 6px 10px; }
    @media print { button { display: none; } }
  </style></head><body>${buildPrintBodyOpen(footer)}
    <h1>Environmental Aspect / Impact Risk Assessment — Index Register</h1>
    ${hasFilter ? `<div style="text-align:center;font-size:10pt;color:#7c2d12;margin-bottom:6px;"><strong>Filtered:</strong> Risk Level = ${escapeHtml(filterLevel)} &nbsp;|&nbsp; Status = ${escapeHtml(statusLabels[filterStatus] || filterStatus)}</div>` : ''}
    <div class="meta">
      <span><strong>Printed:</strong> ${todayStr}</span>
      <span><strong>${hasFilter ? 'Filtered' : 'Total'} Records:</strong> ${records.length}</span>
    </div>
    <div class="summary">
      <div style="background:#fca5a5;"><strong>High:</strong> ${counts.High || 0}</div>
      <div style="background:#fdba74;"><strong>Medium:</strong> ${counts.Medium || 0}</div>
      <div style="background:#fde68a;"><strong>Low:</strong> ${counts.Low || 0}</div>
      <div><strong>None:</strong> ${counts.None || 0}</div>
    </div>
    <table>
      <thead><tr>
        <th style="width: 5%;">#</th>
        <th style="width: 40%;">Risk Being Assessed</th>
        <th style="width: 11%;">Date Created</th>
        <th style="width: 8%;"># Impacts</th>
        <th style="width: 14%;">Highest Risk</th>
        <th style="width: 11%;">Review Date</th>
        <th style="width: 11%;">Status</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="7" style="text-align:center;padding:12px;">No records</td></tr>'}</tbody>
    </table>
    ${buildPrintBodyClose()}
  </body></html>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
