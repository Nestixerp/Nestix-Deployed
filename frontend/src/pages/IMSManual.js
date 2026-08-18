import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import {
  BookOpen, Printer, CheckCircle2, Pencil, Save, X, Plus, History, Trash2, Link2, FileDown,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../services/api';

const statusBadge = (status) => (
  <Badge className={status === 'Approved' ? 'bg-green-600 text-white' : 'bg-amber-500 text-white'}>
    {status || 'Draft'}
  </Badge>
);

const SectionContent = ({ content }) => {
  const blocks = (content || '').split('\n\n').filter((b) => b.trim());
  return (
    <div className="space-y-3 text-sm leading-6 text-slate-800" data-testid="section-content">
      {blocks.map((blk, i) => {
        const lines = blk.split('\n').filter((l) => l.trim());
        if (lines.length > 0 && lines.every((l) => l.trim().startsWith('|'))) {
          const rows = lines.map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
          return (
            <table key={i} className="w-full border-collapse border border-slate-400 text-xs">
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={ri} className={ri === 0 ? 'bg-slate-100 font-semibold' : ''}>
                    {r.map((c, ci) => <td key={ci} className="border border-slate-300 px-2 py-1 align-top">{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        }
        return <p key={i} className="whitespace-pre-wrap">{blk}</p>;
      })}
    </div>
  );
};

const downloadBlob = async (url, fallbackName) => {
  try {
    const res = await api.get(url, { responseType: 'blob' });
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const cd = res.headers['content-disposition'] || '';
    const m = cd.match(/filename=([^;]+)/);
    link.download = m ? m[1].trim() : fallbackName;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (e) {
    toast.error('PDF export failed: ' + (e?.response?.status || e.message));
  }
};

export default function IMSManual() {
  const [manual, setManual] = useState(null);
  const [sections, setSections] = useState([]);
  const [stats, setStats] = useState({});
  const [selId, setSelId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaDraft, setMetaDraft] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [revisions, setRevisions] = useState([]);
  const [addingSection, setAddingSection] = useState(false);
  const [newSec, setNewSec] = useState({ part: 'manual', section_number: '', title: '' });
  const [standards, setStandards] = useState([]);
  const [clauses, setClauses] = useState([]);
  const [clauseStd, setClauseStd] = useState('');
  const [busy, setBusy] = useState(false);

  const selected = useMemo(() => sections.find((s) => s.id === selId), [sections, selId]);

  const load = async (keepSel = true) => {
    const { data } = await api.get('/ims-manual');
    setManual(data.manual); setSections(data.sections); setStats(data.stats);
    if (!keepSel || !data.sections.find((s) => s.id === selId)) setSelId(data.sections[0]?.id || null);
  };
  useEffect(() => { load(false); api.get('/standards-library/standards').then((r) => setStandards(r.data.items)); }, []);
  useEffect(() => { if (clauseStd) api.get('/standards-library/clauses', { params: { standard_id: clauseStd } }).then((r) => setClauses(r.data.items.filter((c) => c.active !== false))); }, [clauseStd]);
  useEffect(() => { setEditing(false); setShowHistory(false); }, [selId]);

  const startEdit = () => { setDraft({ ...selected, mapped_clauses: [...(selected.mapped_clauses || [])], change_summary: '' }); setEditing(true); };

  const saveSection = async () => {
    setBusy(true);
    try {
      const payload = {
        part: draft.part, section_number: draft.section_number, title: draft.title,
        clause_refs: draft.clause_refs || '', content: draft.content || '',
        mapped_clauses: draft.mapped_clauses || [], change_summary: draft.change_summary || '',
      };
      await api.put(`/ims-manual/sections/${draft.id}`, payload);
      toast.success('Section saved — new revision recorded, status back to Draft');
      setEditing(false); await load();
    } catch (e) { toast.error('Save failed: ' + (e?.response?.data?.detail || e.message)); }
    setBusy(false);
  };

  const approveSection = async () => {
    try {
      await api.post(`/ims-manual/sections/${selected.id}/approve`);
      toast.success('Section approved'); await load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Approval failed'); }
  };

  const approveManual = async () => {
    if (!window.confirm('Approve the entire manual? All draft sections will be marked Approved and the manual revision will be recorded.')) return;
    try {
      await api.post('/ims-manual/approve');
      toast.success('Manual approved'); await load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Approval failed'); }
  };

  const saveMeta = async () => {
    try {
      await api.put('/ims-manual', {
        title: metaDraft.title, doc_number: metaDraft.doc_number,
        company_name: metaDraft.company_name, issue_date: metaDraft.issue_date, notes: metaDraft.notes,
      });
      toast.success('Manual details saved'); setEditingMeta(false); await load();
    } catch (e) { toast.error('Save failed'); }
  };

  const addSection = async () => {
    if (!newSec.section_number || !newSec.title) { toast.error('Section number and title required'); return; }
    try {
      const { data } = await api.post('/ims-manual/sections', { ...newSec, clause_refs: '', content: '', mapped_clauses: [] });
      toast.success('Section added'); setAddingSection(false); setNewSec({ part: 'manual', section_number: '', title: '' });
      await load(); setSelId(data.id);
    } catch (e) { toast.error('Add failed'); }
  };

  const archiveSection = async () => {
    if (!window.confirm(`Remove section "${selected.title}"? A snapshot is kept in revision history.`)) return;
    try { await api.delete(`/ims-manual/sections/${selected.id}`); toast.success('Section removed'); await load(false); }
    catch (e) { toast.error(e?.response?.data?.detail || 'Remove failed'); }
  };

  const loadHistory = async () => {
    const { data } = await api.get('/ims-manual/revisions', { params: { section_id: selected.id } });
    setRevisions(data.items); setShowHistory(true);
  };

  const addMappedClause = (clauseId) => {
    const c = clauses.find((x) => x.id === clauseId);
    const std = standards.find((x) => x.id === clauseStd);
    if (!c || !std) return;
    const entry = { standard_name: std.name, version: std.version, clause_number: c.clause_number, clause_title: c.clause_title };
    if ((draft.mapped_clauses || []).some((m) => m.standard_name === entry.standard_name && m.version === entry.version && m.clause_number === entry.clause_number)) return;
    setDraft({ ...draft, mapped_clauses: [...(draft.mapped_clauses || []), entry] });
  };

  if (!manual) return <div className="p-8 text-slate-500">Loading IMS Manual…</div>;

  const parts = [
    { key: 'manual', label: 'Manual Sections' },
    { key: 'procedure', label: 'Procedures' },
  ];

  return (
    <div className="p-6 space-y-4" data-testid="ims-manual-page">
      {/* Header */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <BookOpen className="h-6 w-6 text-blue-700" />
                <h1 className="text-xl font-bold" data-testid="manual-title">{manual.title}</h1>
                {statusBadge(manual.status)}
              </div>
              <div className="text-sm text-slate-600 mt-1" data-testid="manual-meta">
                {manual.company_name} · Doc No: <b>{manual.doc_number}</b> · Rev: <b>{manual.revision}</b>
                {manual.approved_by && <> · Approved by <b>{manual.approved_by}</b> on {(manual.approved_at || '').slice(0, 10)}</>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" data-testid="edit-manual-meta-btn" onClick={() => { setMetaDraft({ ...manual }); setEditingMeta(true); }}>
                <Pencil className="h-4 w-4 mr-1" /> Details
              </Button>
              <Button variant="outline" size="sm" data-testid="print-manual-btn" onClick={() => downloadBlob('/ims-manual/export/pdf', 'IMS-Manual.pdf')}>
                <Printer className="h-4 w-4 mr-1" /> Print Full Manual
              </Button>
              <Button size="sm" className="bg-green-700 hover:bg-green-800" data-testid="approve-manual-btn"
                disabled={manual.status === 'Approved' && stats.draft === 0} onClick={approveManual}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> {manual.status === 'Approved' && stats.draft === 0 ? 'Manual Approved' : 'Approve Manual'}
              </Button>
            </div>
          </div>
          {/* Completion stats */}
          <div className="flex flex-wrap items-center gap-4 mt-3 text-sm" data-testid="manual-stats">
            <span><b>{stats.total}</b> sections</span>
            <span className="text-green-700"><b>{stats.approved}</b> approved</span>
            <span className="text-amber-600"><b>{stats.draft}</b> draft</span>
            <div className="flex-1 min-w-[160px] max-w-xs h-2 bg-slate-200 rounded overflow-hidden">
              <div className="h-full bg-green-600" style={{ width: `${stats.completion_percent || 0}%` }} />
            </div>
            <span className="font-semibold">{stats.completion_percent || 0}% audit-ready</span>
          </div>
          {editingMeta && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 border-t pt-4">
              <div><label className="text-xs font-medium">Manual Title</label><Input data-testid="meta-title-input" value={metaDraft.title} onChange={(e) => setMetaDraft({ ...metaDraft, title: e.target.value })} /></div>
              <div><label className="text-xs font-medium">Document Number</label><Input data-testid="meta-docnum-input" value={metaDraft.doc_number || ''} onChange={(e) => setMetaDraft({ ...metaDraft, doc_number: e.target.value })} /></div>
              <div><label className="text-xs font-medium">Company Name</label><Input value={metaDraft.company_name || ''} onChange={(e) => setMetaDraft({ ...metaDraft, company_name: e.target.value })} /></div>
              <div><label className="text-xs font-medium">Issue Date</label><Input type="date" value={metaDraft.issue_date || ''} onChange={(e) => setMetaDraft({ ...metaDraft, issue_date: e.target.value })} /></div>
              <div className="md:col-span-2 flex gap-2">
                <Button size="sm" data-testid="save-manual-meta-btn" onClick={saveMeta}><Save className="h-4 w-4 mr-1" /> Save</Button>
                <Button size="sm" variant="outline" onClick={() => setEditingMeta(false)}><X className="h-4 w-4 mr-1" /> Cancel</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* TOC */}
        <Card className="h-fit">
          <CardContent className="pt-4 pb-4" data-testid="manual-toc">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-sm">Table of Contents</h2>
              <Button size="sm" variant="ghost" data-testid="add-section-btn" onClick={() => setAddingSection(!addingSection)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {addingSection && (
              <div className="space-y-2 mb-3 p-2 border rounded bg-slate-50">
                <select className="border rounded h-8 px-2 text-sm w-full" data-testid="new-section-part" value={newSec.part} onChange={(e) => setNewSec({ ...newSec, part: e.target.value })}>
                  <option value="manual">Manual Section</option>
                  <option value="procedure">Procedure</option>
                </select>
                <Input placeholder="Section number e.g. 12 or 2.17" data-testid="new-section-number" value={newSec.section_number} onChange={(e) => setNewSec({ ...newSec, section_number: e.target.value })} className="h-8" />
                <Input placeholder="Title" data-testid="new-section-title" value={newSec.title} onChange={(e) => setNewSec({ ...newSec, title: e.target.value })} className="h-8" />
                <Button size="sm" className="w-full" data-testid="create-section-btn" onClick={addSection}>Add Section</Button>
              </div>
            )}
            {parts.map((p) => (
              <div key={p.key} className="mb-3">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">{p.label}</div>
                {sections.filter((s) => s.part === p.key).map((s) => (
                  <button
                    key={s.id}
                    data-testid={`toc-section-${s.section_number}`}
                    onClick={() => setSelId(s.id)}
                    className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 hover:bg-slate-100 ${selId === s.id ? 'bg-blue-50 text-blue-800 font-medium' : ''}`}
                  >
                    <span className={`h-2 w-2 rounded-full shrink-0 ${s.status === 'Approved' ? 'bg-green-600' : 'bg-amber-500'}`} />
                    <span className="truncate">{s.section_number}. {s.title}</span>
                  </button>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Section view / edit */}
        {selected && (
          <Card>
            <CardContent className="pt-5 pb-5" data-testid="section-detail">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div>
                  <h2 className="text-lg font-bold" data-testid="section-heading">Section {selected.section_number} — {selected.title}</h2>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Rev {selected.revision} · Last updated {(selected.updated_at || '').slice(0, 10)} by {selected.updated_by}
                    {selected.approved_by && <> · Approved by <b>{selected.approved_by}</b> {(selected.approved_at || '').slice(0, 10)}</>}
                  </div>
                </div>
                <div className="flex items-center gap-2">{statusBadge(selected.status)}</div>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {!editing && <Button size="sm" variant="outline" data-testid="edit-section-btn" onClick={startEdit}><Pencil className="h-4 w-4 mr-1" /> Edit</Button>}
                {!editing && selected.status !== 'Approved' && (
                  <Button size="sm" className="bg-green-700 hover:bg-green-800" data-testid="approve-section-btn" onClick={approveSection}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Approve Section
                  </Button>
                )}
                <Button size="sm" variant="outline" data-testid="print-section-btn" onClick={() => downloadBlob(`/ims-manual/sections/${selected.id}/export/pdf`, `Section_${selected.section_number}.pdf`)}>
                  <FileDown className="h-4 w-4 mr-1" /> Print Section
                </Button>
                <Button size="sm" variant="outline" data-testid="section-history-btn" onClick={() => (showHistory ? setShowHistory(false) : loadHistory())}>
                  <History className="h-4 w-4 mr-1" /> Revision History
                </Button>
                {!editing && (
                  <Button size="sm" variant="ghost" className="text-red-600" data-testid="archive-section-btn" onClick={archiveSection}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {showHistory && (
                <div className="mb-4 border rounded p-3 bg-slate-50 max-h-64 overflow-y-auto" data-testid="revision-history">
                  <h3 className="text-sm font-semibold mb-2">Revision History</h3>
                  {revisions.length === 0 && <div className="text-sm text-slate-500">No revisions recorded yet.</div>}
                  {revisions.map((r) => (
                    <div key={r.id} className="text-xs border-b py-1.5 last:border-0">
                      <b>{r.action.toUpperCase()}</b> — Rev {r.rev_number} · {r.changed_by} · {(r.changed_at || '').slice(0, 16).replace('T', ' ')}
                      {r.summary && <div className="text-slate-600">{r.summary}</div>}
                    </div>
                  ))}
                </div>
              )}

              {!editing ? (
                <>
                  {(selected.clause_refs || (selected.mapped_clauses || []).length > 0) && (
                    <div className="mb-3 text-sm bg-blue-50 border border-blue-100 rounded p-2" data-testid="section-clauses">
                      {selected.clause_refs && <div><b>Clause references:</b> {selected.clause_refs}</div>}
                      {(selected.mapped_clauses || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selected.mapped_clauses.map((c, i) => (
                            <Badge key={i} variant="outline" className="text-xs"><Link2 className="h-3 w-3 mr-1" />{c.standard_name}:{c.version} {c.clause_number}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <SectionContent content={selected.content} />
                </>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div><label className="text-xs font-medium">Section Number</label><Input data-testid="edit-section-number" value={draft.section_number} onChange={(e) => setDraft({ ...draft, section_number: e.target.value })} /></div>
                    <div className="md:col-span-2"><label className="text-xs font-medium">Title</label><Input data-testid="edit-section-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
                  </div>
                  <div><label className="text-xs font-medium">Clause References (free text)</label><Input data-testid="edit-clause-refs" value={draft.clause_refs || ''} onChange={(e) => setDraft({ ...draft, clause_refs: e.target.value })} /></div>
                  <div>
                    <label className="text-xs font-medium">Mapped Clauses (from Standards Library)</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <select className="border rounded h-9 px-2 text-sm" data-testid="map-standard-select" value={clauseStd} onChange={(e) => setClauseStd(e.target.value)}>
                        <option value="">Select standard…</option>
                        {standards.map((s) => <option key={s.id} value={s.id}>{s.name}:{s.version}</option>)}
                      </select>
                      <select className="border rounded h-9 px-2 text-sm min-w-[220px]" data-testid="map-clause-select" disabled={!clauseStd} onChange={(e) => { if (e.target.value) { addMappedClause(e.target.value); e.target.value = ''; } }}>
                        <option value="">Add clause…</option>
                        {clauses.map((c) => <option key={c.id} value={c.id}>{c.clause_number} — {c.clause_title}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(draft.mapped_clauses || []).map((c, i) => (
                        <Badge key={i} variant="outline" className="text-xs cursor-pointer" data-testid={`mapped-clause-chip-${i}`}
                          onClick={() => setDraft({ ...draft, mapped_clauses: draft.mapped_clauses.filter((_, j) => j !== i) })}>
                          {c.standard_name}:{c.version} {c.clause_number} <X className="h-3 w-3 ml-1" />
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium">Content</label>
                    <Textarea data-testid="edit-section-content" className="min-h-[420px] font-mono text-sm" value={draft.content || ''} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />
                  </div>
                  <div><label className="text-xs font-medium">Change Summary (for revision history)</label><Input data-testid="edit-change-summary" placeholder="e.g. Updated responsibilities for new Operations Manager" value={draft.change_summary} onChange={(e) => setDraft({ ...draft, change_summary: e.target.value })} /></div>
                  <div className="flex gap-2">
                    <Button size="sm" data-testid="save-section-btn" disabled={busy} onClick={saveSection}><Save className="h-4 w-4 mr-1" /> Save (new revision)</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(false)}><X className="h-4 w-4 mr-1" /> Cancel</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
