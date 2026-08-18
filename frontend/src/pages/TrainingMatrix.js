import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { formatDate } from '../utils/dateFormatter';
import { buildDocControlFooter, buildPrintFooterCss, buildPrintFooterHtml, buildPrintBodyOpen, buildPrintBodyClose } from '../utils/documentControl';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, Printer, Save, X, FileText, ArrowLeft, GraduationCap
} from 'lucide-react';

const todayISO = () => new Date().toISOString().split('T')[0];
const SCORE_OPTIONS = ['', 'C', 'T', 'N/A'];

export default function TrainingMatrix() {
  const [matrices, setMatrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFormNo, setNewFormNo] = useState('');

  useEffect(() => { fetchMatrices(); }, []);

  const fetchMatrices = async () => {
    setLoading(true);
    try {
      const res = await api.get('/training-matrices');
      setMatrices(res.data || []);
    } catch { toast.error('Failed to load'); } finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error('Name required'); return; }
    try {
      const payload = {
        name: newName.trim(),
        form_no: newFormNo.trim(),
        issue: '1',
        revision_date: todayISO(),
        reviewed_date: todayISO(),
        skills: [],
        people: []
      };
      const res = await api.post('/training-matrices', payload);
      toast.success('Matrix created');
      setCreateOpen(false);
      setNewName(''); setNewFormNo('');
      fetchMatrices();
      setEditing(res.data);
    } catch { toast.error('Create failed'); }
  };

  const handleDelete = async (m) => {
    if (!window.confirm(`Delete "${m.name}"? This cannot be undone.`)) return;
    try { await api.delete(`/training-matrices/${m.id}`); toast.success('Deleted'); fetchMatrices(); }
    catch { toast.error('Delete failed'); }
  };

  if (editing) {
    return <MatrixEditor key={editing.id} matrix={editing} onBack={() => { setEditing(null); fetchMatrices(); }} onSaved={(d) => setEditing(d)} />;
  }

  return (
    <div className="space-y-6 p-1" data-testid="training-matrix-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Training / Skills Matrix</h1>
          <p className="text-sm text-slate-600">ISO 9001 — record staff capability across skills; controlled document with Form No., Issue and Revision Date</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-slate-900" data-testid="new-matrix-btn">
          <Plus className="h-4 w-4 mr-2" /> New Matrix
        </Button>
      </div>

      {loading ? (
        <Card><CardContent className="py-10 text-center text-slate-500">Loading...</CardContent></Card>
      ) : matrices.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-12 w-12 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600 mb-4">No skills matrices yet.</p>
            <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" /> Create First Matrix</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>Matrices</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Name</th>
                  <th className="text-left px-3 py-2 font-semibold">Form No.</th>
                  <th className="text-left px-3 py-2 font-semibold">Issue</th>
                  <th className="text-left px-3 py-2 font-semibold">Revision</th>
                  <th className="text-left px-3 py-2 font-semibold">Reviewed</th>
                  <th className="text-left px-3 py-2 font-semibold">People</th>
                  <th className="text-left px-3 py-2 font-semibold">Skills</th>
                  <th className="text-right px-3 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {matrices.map((m) => (
                  <tr key={m.id} className="border-t hover:bg-slate-50" data-testid={`matrix-row-${m.id}`}>
                    <td className="px-3 py-2 font-medium">{m.name}</td>
                    <td className="px-3 py-2">{m.form_no || '—'}</td>
                    <td className="px-3 py-2">{m.issue || '—'}</td>
                    <td className="px-3 py-2">{m.revision_date ? formatDate(m.revision_date) : '—'}</td>
                    <td className="px-3 py-2">{m.reviewed_date ? formatDate(m.reviewed_date) : '—'}</td>
                    <td className="px-3 py-2">{(m.people || []).length}</td>
                    <td className="px-3 py-2">{(m.skills || []).length}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => setEditing(m)} data-testid={`open-${m.id}`}><Edit className="h-3 w-3 mr-1" /> Open</Button>
                        <Button size="sm" variant="outline" onClick={() => handleDelete(m)}><Trash2 className="h-3 w-3 text-red-600" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Skills Matrix</DialogTitle>
            <DialogDescription>e.g. Workshop, Office, Sales. You can add skills & people after creation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Matrix Name *</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Workshop" data-testid="new-matrix-name" />
            </div>
            <div>
              <Label>Form No. <span className="text-slate-400 text-xs">(e.g. QMSF 13)</span></Label>
              <Input value={newFormNo} onChange={(e) => setNewFormNo(e.target.value)} placeholder="QMSF 13" data-testid="new-matrix-formno" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}><X className="h-4 w-4 mr-2" /> Cancel</Button>
            <Button onClick={handleCreate} className="bg-slate-900" data-testid="create-matrix-confirm"><Save className="h-4 w-4 mr-2" /> Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MatrixEditor({ matrix, onBack, onSaved }) {
  const [name, setName] = useState(matrix.name || '');
  const [formNo, setFormNo] = useState(matrix.form_no || '');
  const [issue, setIssue] = useState(matrix.issue || '');
  const [revisionDate, setRevisionDate] = useState(matrix.revision_date || '');
  const [reviewedDate, setReviewedDate] = useState(matrix.reviewed_date || '');
  const [skills, setSkills] = useState(matrix.skills || []);
  const [people, setPeople] = useState(matrix.people || []);
  const [saving, setSaving] = useState(false);

  const addSkill = () => {
    const newSk = { id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '' };
    setSkills([...skills, newSk]);
  };
  const updateSkillName = (idx, value) => {
    const next = [...skills]; next[idx] = { ...next[idx], name: value }; setSkills(next);
  };
  const removeSkill = (idx) => {
    if (!window.confirm(`Remove skill "${skills[idx].name || 'this skill'}" from all people?`)) return;
    const removedId = skills[idx].id;
    setSkills(skills.filter((_, i) => i !== idx));
    setPeople(people.map((p) => {
      const newScores = { ...(p.scores || {}) };
      delete newScores[removedId];
      return { ...p, scores: newScores };
    }));
  };

  const addPerson = () => {
    const newP = { id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '', scores: {} };
    setPeople([...people, newP]);
  };
  const updatePersonName = (idx, value) => {
    const next = [...people]; next[idx] = { ...next[idx], name: value }; setPeople(next);
  };
  const removePerson = (idx) => {
    if (!window.confirm(`Remove "${people[idx].name || 'this person'}" from the matrix?`)) return;
    setPeople(people.filter((_, i) => i !== idx));
  };
  const updateScore = (personIdx, skillId, value) => {
    const next = [...people];
    next[personIdx] = { ...next[personIdx], scores: { ...(next[personIdx].scores || {}), [skillId]: value } };
    setPeople(next);
  };

  const save = async () => {
    if (!name.trim()) { toast.error('Name required'); return; }
    setSaving(true);
    try {
      const payload = {
        name, form_no: formNo, issue, revision_date: revisionDate,
        reviewed_date: reviewedDate, skills, people
      };
      const res = await api.put(`/training-matrices/${matrix.id}`, payload);
      toast.success('Saved');
      onSaved(res.data);
    } catch { toast.error('Save failed'); } finally { setSaving(false); }
  };

  const handlePrint = () => {
    const w = window.open('', '_blank', 'width=1300,height=1400');
    if (!w) { toast.error('Pop-up blocked'); return; }
    w.document.write(buildPrintHtml({ name, form_no: formNo, issue, revision_date: revisionDate, reviewed_date: reviewedDate, skills, people }));
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };

  // Set Reviewed to today
  const markReviewed = () => { setReviewedDate(todayISO()); toast.info('Reviewed date set to today — click Save to apply.'); };
  // Bump revision (Issue +1, revision date today)
  const newRevision = () => {
    const nextIssue = String((parseInt(issue) || 0) + 1);
    setIssue(nextIssue);
    setRevisionDate(todayISO());
    toast.info(`Issue bumped to ${nextIssue}. Click Save to commit.`);
  };

  return (
    <div className="space-y-4 p-1" data-testid="matrix-editor">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onBack} data-testid="back-btn"><ArrowLeft className="h-4 w-4 mr-2" /> Back</Button>
          <h1 className="text-2xl font-bold text-slate-900">Skills Matrix — {name || '(unnamed)'}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint} data-testid="print-btn"><Printer className="h-4 w-4 mr-2" /> Print</Button>
          <Button onClick={save} disabled={saving} className="bg-slate-900" data-testid="save-btn"><Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save'}</Button>
        </div>
      </div>

      {/* Document control header */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Document Control</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs">Matrix Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="editor-name" />
            </div>
            <div>
              <Label className="text-xs">Form No.</Label>
              <Input value={formNo} onChange={(e) => setFormNo(e.target.value)} placeholder="QMSF 13" data-testid="editor-formno" />
            </div>
            <div>
              <Label className="text-xs">Issue</Label>
              <Input value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="2" data-testid="editor-issue" />
            </div>
            <div>
              <Label className="text-xs">Revision Date</Label>
              <Input type="date" value={revisionDate} onChange={(e) => setRevisionDate(e.target.value)} data-testid="editor-revdate" />
            </div>
            <div>
              <Label className="text-xs">Last Reviewed</Label>
              <div className="flex gap-1">
                <Input type="date" value={reviewedDate} onChange={(e) => setReviewedDate(e.target.value)} data-testid="editor-revieweddate" />
                <Button size="sm" variant="outline" onClick={markReviewed} title="Set to today">Today</Button>
              </div>
            </div>
          </div>
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={newRevision} title="Bump Issue by 1 and set Revision Date to today">
              New Revision
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Skills */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle className="text-base">Skills ({skills.length})</CardTitle>
            <Button size="sm" variant="outline" onClick={addSkill} data-testid="add-skill-btn">
              <Plus className="h-3 w-3 mr-1" /> Add Skill
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {skills.length === 0 ? (
            <div className="text-sm text-slate-500 italic">No skills yet — add at least one to start scoring.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {skills.map((sk, idx) => (
                <div key={sk.id} className="flex items-center gap-1 bg-slate-50 border rounded px-2 py-1" data-testid={`skill-${idx}`}>
                  <Input value={sk.name} onChange={(e) => updateSkillName(idx, e.target.value)} className="h-7 text-sm w-40" placeholder="Skill name" data-testid={`skill-name-${idx}`} />
                  <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => removeSkill(idx)}>
                    <X className="h-3 w-3 text-red-600" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Matrix grid */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle className="text-base">People ({people.length})</CardTitle>
            <Button size="sm" variant="outline" onClick={addPerson} disabled={skills.length === 0} data-testid="add-person-btn">
              <Plus className="h-3 w-3 mr-1" /> Add Person
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {skills.length === 0 ? (
            <div className="text-sm text-slate-500 italic">Add at least one skill before adding people.</div>
          ) : people.length === 0 ? (
            <div className="text-sm text-slate-500 italic">No people yet — click &quot;Add Person&quot;.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border px-2 py-1 text-left sticky left-0 bg-slate-100 z-10" style={{ minWidth: '180px' }}>Name</th>
                    {skills.map((sk, sIdx) => (
                      <th key={sk.id} className="border px-2 py-1 text-center" style={{ minWidth: '90px', writingMode: 'vertical-lr', transform: 'rotate(180deg)' }} data-testid={`skill-header-${sIdx}`}>
                        {sk.name || '—'}
                      </th>
                    ))}
                    <th className="border px-2 py-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((p, pIdx) => (
                    <tr key={p.id} data-testid={`person-row-${pIdx}`}>
                      <td className="border px-2 py-1 sticky left-0 bg-white z-10">
                        <Input value={p.name} onChange={(e) => updatePersonName(pIdx, e.target.value)} className="h-7 text-sm" placeholder="Full name" data-testid={`person-name-${pIdx}`} />
                      </td>
                      {skills.map((sk) => (
                        <td key={sk.id} className="border p-0 text-center" style={{ background: scoreColor(p.scores?.[sk.id]) }}>
                          <select
                            value={p.scores?.[sk.id] || ''}
                            onChange={(e) => updateScore(pIdx, sk.id, e.target.value)}
                            className="w-full h-8 bg-transparent text-center text-sm font-bold focus:outline-none"
                            data-testid={`score-${pIdx}-${sk.id}`}
                          >
                            {SCORE_OPTIONS.map((o) => <option key={o} value={o}>{o || '—'}</option>)}
                          </select>
                        </td>
                      ))}
                      <td className="border px-1 py-1">
                        <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => removePerson(pIdx)}><X className="h-3 w-3 text-red-600" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {skills.length > 0 && (
            <div className="mt-3 text-xs text-slate-600">
              <strong>Key:</strong>{' '}
              <Badge className="bg-green-100 text-green-800 border-green-300 mr-1" variant="outline">C = Capable</Badge>
              <Badge className="bg-amber-100 text-amber-800 border-amber-300 mr-1" variant="outline">T = Training</Badge>
              <Badge className="bg-slate-100 text-slate-700 border-slate-300" variant="outline">N/A = Not Applicable</Badge>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function scoreColor(s) {
  switch (s) {
    case 'C': return '#bbf7d0';   // green
    case 'T': return '#fde68a';   // amber
    case 'N/A': return '#e2e8f0'; // slate
    default: return '#ffffff';
  }
}

function buildPrintHtml({ name, form_no, issue, revision_date, reviewed_date, skills, people }) {
  const fmt = (iso) => {
    if (!iso) return '';
    if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y.substring(0, 4)}`;
  };
  const safeSkills = skills || [];
  const safePeople = people || [];
  const headerCols = safeSkills.map((sk) =>
    `<th class="skill-col"><div class="vert">${escapeHtml(sk.name || '')}</div></th>`
  ).join('');
  const rows = safePeople.map((p) => `
    <tr>
      <td>${escapeHtml((p.name || '').toUpperCase())}</td>
      ${safeSkills.map((sk) => {
        const s = (p.scores || {})[sk.id] || '';
        const bg = s === 'C' ? '#bbf7d0' : s === 'T' ? '#fde68a' : s === 'N/A' ? '#e2e8f0' : '#ffffff';
        return `<td style="text-align:center;font-weight:bold;background:${bg};">${escapeHtml(s)}</td>`;
      }).join('')}
    </tr>
  `).join('');
  const titleSuffix = name ? ` — ${escapeHtml(name.toUpperCase())}` : '';
  // Build the audit footer from the matrix's own form_no / issue / revision_date
  // (Training Matrix stores these per-record, so no Document Control DB lookup needed).
  const footer = buildDocControlFooter(null, {
    form_no: form_no || 'QMSF 13',
    issue: issue || '1',
    revision_date: revision_date ? formatRevDate(revision_date) : '',
    title: `Skills Matrix${name ? ` — ${name.toUpperCase()}` : ''}`,
    owner: 'Quality Manager',
  });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Skills Matrix${titleSuffix}</title>
  <style>
    ${buildPrintFooterCss().replace('size: A4 portrait;', 'size: A4 landscape;')}
    body { font-family: Calibri, Arial, sans-serif; color: #000; font-size: 11pt; }
    .header { display: flex; justify-content: center; align-items: center; margin-bottom: 12px; }
    h1 { font-size: 18pt; margin: 0; color: #c00; text-decoration: underline; text-align: center; }
    h2 { font-size: 13pt; margin: 0; color: #c00; text-align: center; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #000; padding: 5px 7px; font-size: 10pt; }
    th { background: #f3f4f6; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    th.skill-col { height: 110px; vertical-align: bottom; padding: 4px; }
    th.skill-col .vert { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; font-weight: bold; }
    table tr { page-break-inside: avoid; break-inside: avoid; }
    .key { margin-top: 12px; font-size: 11pt; }
    .reviewed { margin-top: 10px; font-weight: bold; font-size: 11pt; }
    @media print { button { display: none; } }
  </style></head><body>${buildPrintBodyOpen(footer)}
    <div class="header">
      <div>
        <h1>SKILLS MATRIX</h1>
        ${name ? `<h2>${escapeHtml(name.toUpperCase())}</h2>` : ''}
      </div>
    </div>
    <table>
      <thead><tr>
        <th style="width: 22%; text-align: left;">Name</th>
        ${headerCols || '<th>—</th>'}
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="' + (safeSkills.length + 1) + '" style="text-align:center;padding:14px;">No people recorded</td></tr>'}</tbody>
    </table>
    <div class="key"><strong>Key:</strong> &nbsp; C = Capable &nbsp;&nbsp; T = Training &nbsp;&nbsp; N/A = Not Applicable</div>
    <div class="reviewed">Reviewed: ${fmt(reviewed_date)}</div>
    ${buildPrintBodyClose()}
  </body></html>`;
}

function formatRevDate(iso) {
  if (!iso) return '';
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
