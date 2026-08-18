import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Plus, Edit, Trash2, Save, BookOpen, GitCompare, HelpCircle, ArrowRightLeft } from 'lucide-react';
import api from '../services/api';
import HelpButton from '../components/audit/HelpButton';

const TABS = [
  { key: 'standards', label: 'Standards', icon: BookOpen },
  { key: 'clauses', label: 'Clauses', icon: Edit },
  { key: 'mappings', label: 'Clause Mappings', icon: GitCompare },
  { key: 'help', label: 'Help Content', icon: HelpCircle },
  { key: 'transition', label: 'Transition Readiness', icon: ArrowRightLeft },
];

const inputCls = 'border rounded h-9 px-2 text-sm w-full';

export default function StandardsLibrary() {
  const [tab, setTab] = useState('standards');
  const [standards, setStandards] = useState([]);
  const [clauses, setClauses] = useState([]);
  const [selStd, setSelStd] = useState('');
  const [mappings, setMappings] = useState([]);
  const [helpItems, setHelpItems] = useState([]);
  const [transition, setTransition] = useState([]);
  const [editItem, setEditItem] = useState(null); // {type, data}

  const loadStandards = async () => setStandards((await api.get('/standards-library/standards')).data.items);
  const loadClauses = async (sid) => setClauses((await api.get('/standards-library/clauses', { params: sid ? { standard_id: sid } : {} })).data.items);
  const loadMappings = async () => setMappings((await api.get('/standards-library/mappings')).data.items);
  const loadHelp = async () => setHelpItems((await api.get('/standards-library/help')).data.items);
  const loadTransition = async () => setTransition((await api.get('/standards-library/transition-items')).data.items);

  useEffect(() => { loadStandards(); }, []);
  useEffect(() => {
    if (tab === 'clauses') loadClauses(selStd);
    if (tab === 'mappings') loadMappings();
    if (tab === 'help') loadHelp();
    if (tab === 'transition') loadTransition();
  }, [tab, selStd]);

  const save = async () => {
    const { type, data } = editItem;
    const clean = { ...data }; ['id', '_id', 'created_at', 'updated_at', 'created_by', 'updated_by', 'overdue'].forEach(k => delete clean[k]);
    try {
      if (type === 'standard') data.id ? await api.put(`/standards-library/standards/${data.id}`, clean) : await api.post('/standards-library/standards', clean);
      if (type === 'clause') data.id ? await api.put(`/standards-library/clauses/${data.id}`, clean) : await api.post('/standards-library/clauses', clean);
      if (type === 'mapping') data.id ? await api.put(`/standards-library/mappings/${data.id}`, clean) : await api.post('/standards-library/mappings', clean);
      if (type === 'transition') data.id ? await api.put(`/standards-library/transition-items/${data.id}`, clean) : await api.post('/standards-library/transition-items', clean);
      setEditItem(null);
      if (type === 'standard') loadStandards();
      if (type === 'clause') loadClauses(selStd);
      if (type === 'mapping') loadMappings();
      if (type === 'transition') loadTransition();
    } catch (e) { alert('Save failed: ' + (e?.response?.data?.detail || e.message)); }
  };

  const F = (label, key, opts = {}) => (
    <div className={opts.wide ? 'md:col-span-2' : ''}>
      <Label className="text-xs">{label}</Label>
      {opts.area
        ? <Textarea rows={2} value={editItem.data[key] || ''} onChange={e => setEditItem(it => ({ ...it, data: { ...it.data, [key]: e.target.value } }))} data-testid={`sl-edit-${key}`} />
        : opts.options
          ? <select className={inputCls} value={editItem.data[key] || ''} onChange={e => setEditItem(it => ({ ...it, data: { ...it.data, [key]: e.target.value } }))} data-testid={`sl-edit-${key}`}>
              <option value="">—</option>{opts.options.map(o => <option key={o}>{o}</option>)}
            </select>
          : <Input type={opts.date ? 'date' : 'text'} value={editItem.data[key] || ''} onChange={e => setEditItem(it => ({ ...it, data: { ...it.data, [key]: e.target.value } }))} data-testid={`sl-edit-${key}`} />}
    </div>
  );

  const riskCls = (r) => r === 'Critical' ? 'bg-red-200 text-red-900' : r === 'High' ? 'bg-red-100 text-red-800' : r === 'Medium' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800';

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5" data-testid="standards-library-page">
      <div>
        <h1 className="text-3xl font-bold">Standards & Clause Library</h1>
        <p className="text-gray-600 text-sm mt-1">Admin-editable standards, clauses, transition mappings and audit help content. Clause numbers and short internal summaries only — no copyrighted ISO wording.</p>
      </div>

      <div className="flex gap-1 border-b flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 ${tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            data-testid={`sl-tab-${t.key}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* STANDARDS */}
      {tab === 'standards' && (
        <Card><CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base">{standards.length} standards</CardTitle>
          <Button size="sm" onClick={() => setEditItem({ type: 'standard', data: { name: '', version: '', type: 'Quality', status: 'Current' } })} data-testid="sl-new-standard"><Plus className="w-4 h-4 mr-1" /> Add Standard</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr>{['Standard', 'Version', 'Type', 'Status', 'Effective', 'Transition deadline', 'Notes', ''].map(h => <th key={h} className="text-left p-2 border">{h}</th>)}</tr></thead>
            <tbody>{standards.map(s => (
              <tr key={s.id} className="hover:bg-gray-50" data-testid={`sl-standard-row-${s.name.replace(/\s/g, '')}-${s.version}`}>
                <td className="p-2 border font-semibold">{s.name}</td><td className="p-2 border">{s.version}</td>
                <td className="p-2 border">{s.type}</td>
                <td className="p-2 border"><span className={`px-2 py-0.5 rounded text-xs font-semibold ${s.status === 'Current' ? 'bg-green-100 text-green-800' : s.status === 'Transition' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>{s.status}</span></td>
                <td className="p-2 border">{s.effective_date || ''}</td><td className="p-2 border">{s.transition_deadline || ''}</td>
                <td className="p-2 border text-xs text-gray-600 max-w-[240px]">{s.notes || ''}</td>
                <td className="p-2 border"><button className="text-blue-600" onClick={() => setEditItem({ type: 'standard', data: s })}><Edit className="w-4 h-4" /></button></td>
              </tr>))}</tbody>
          </table>
        </CardContent></Card>
      )}

      {/* CLAUSES */}
      {tab === 'clauses' && (
        <Card><CardHeader className="pb-2">
          <div className="flex items-end justify-between flex-wrap gap-2">
            <div className="min-w-[260px]">
              <Label className="text-xs">Standard</Label>
              <select className={inputCls} value={selStd} onChange={e => setSelStd(e.target.value)} data-testid="sl-clause-standard-filter">
                <option value="">All standards</option>
                {standards.map(s => <option key={s.id} value={s.id}>{s.name}:{s.version}</option>)}
              </select>
            </div>
            <Button size="sm" onClick={() => setEditItem({ type: 'clause', data: { standard_id: selStd || (standards[0]?.id || ''), clause_number: '', clause_title: '', active: true } })} data-testid="sl-new-clause"><Plus className="w-4 h-4 mr-1" /> Add Clause</Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr>{['Clause', 'Title', 'Summary', 'Audit prompt', 'Applicable to', 'Active', ''].map(h => <th key={h} className="text-left p-2 border">{h}</th>)}</tr></thead>
            <tbody>{clauses.map(c => (
              <tr key={c.id} className={`hover:bg-gray-50 ${c.active === false ? 'opacity-40' : ''}`}>
                <td className="p-2 border font-mono font-bold">{c.clause_number}</td>
                <td className="p-2 border">{c.clause_title}</td>
                <td className="p-2 border text-xs text-gray-600 max-w-[260px]">{c.clause_summary || ''}</td>
                <td className="p-2 border text-xs text-gray-600 max-w-[220px]">{c.audit_prompt || ''}</td>
                <td className="p-2 border text-xs">{c.applicable_to}</td>
                <td className="p-2 border text-xs">{c.active === false ? 'No' : 'Yes'}</td>
                <td className="p-2 border"><button className="text-blue-600" onClick={() => setEditItem({ type: 'clause', data: c })}><Edit className="w-4 h-4" /></button></td>
              </tr>))}</tbody>
          </table>
          {clauses.length === 0 && <p className="text-center text-gray-500 py-4 text-sm">Select a standard to view its clauses.</p>}
        </CardContent></Card>
      )}

      {/* MAPPINGS */}
      {tab === 'mappings' && (
        <Card><CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base">Clause transition mappings ({mappings.length})</CardTitle>
          <Button size="sm" onClick={() => setEditItem({ type: 'mapping', data: { current_standard: 'ISO 9001:2015', new_standard: 'ISO 9001:2026', mapping_type: 'Equivalent' } })} data-testid="sl-new-mapping"><Plus className="w-4 h-4 mr-1" /> Add Mapping</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr>{['Current standard', 'Clause', '→ New standard', 'Clause', 'Type', 'Transition notes', 'Action required', ''].map(h => <th key={h} className="text-left p-2 border">{h}</th>)}</tr></thead>
            <tbody>{mappings.map(m => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="p-2 border">{m.current_standard}</td><td className="p-2 border font-mono">{m.current_clause}</td>
                <td className="p-2 border">{m.new_standard}</td><td className="p-2 border font-mono">{m.new_clause}</td>
                <td className="p-2 border"><span className={`px-2 py-0.5 rounded text-xs font-semibold ${m.mapping_type === 'Expanded' ? 'bg-amber-100 text-amber-800' : m.mapping_type === 'New' ? 'bg-blue-100 text-blue-800' : m.mapping_type === 'Removed' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>{m.mapping_type}</span></td>
                <td className="p-2 border text-xs max-w-[220px]">{m.transition_notes || ''}</td>
                <td className="p-2 border text-xs max-w-[220px]">{m.action_required || ''}</td>
                <td className="p-2 border whitespace-nowrap">
                  <button className="text-blue-600 mr-2" onClick={() => setEditItem({ type: 'mapping', data: m })}><Edit className="w-4 h-4" /></button>
                  <button className="text-red-600" onClick={async () => { if (window.confirm('Delete mapping?')) { await api.delete(`/standards-library/mappings/${m.id}`); loadMappings(); } }}><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>))}</tbody>
          </table>
        </CardContent></Card>
      )}

      {/* HELP CONTENT */}
      {tab === 'help' && (
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Audit section help content ({helpItems.length})</CardTitle>
          <p className="text-xs text-gray-500">Click Help beside a section to view or edit it — same editor as the audit screens. On-screen only, never printed.</p>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr>{['Section', 'Purpose', 'Last edited by', 'Help'].map(h => <th key={h} className="text-left p-2 border">{h}</th>)}</tr></thead>
            <tbody>{helpItems.map(h => (
              <tr key={h.section_key} className="hover:bg-gray-50">
                <td className="p-2 border font-semibold">{h.section_key}</td>
                <td className="p-2 border text-xs text-gray-600 max-w-[380px]">{(h.purpose || '').slice(0, 160)}</td>
                <td className="p-2 border text-xs">{h.updated_by || ''}</td>
                <td className="p-2 border"><HelpButton section={h.section_key} /></td>
              </tr>))}</tbody>
          </table>
        </CardContent></Card>
      )}

      {/* TRANSITION */}
      {tab === 'transition' && (
        <Card><CardHeader className="pb-2 flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">Transition gap register ({transition.length}) <HelpButton section="Transition Readiness" /></CardTitle>
            <p className="text-xs text-gray-500">ISO 9001:2015→2026 · ISO 14001:2015→2026 · ISO 19011 audit programme improvement</p>
          </div>
          <Button size="sm" onClick={() => setEditItem({ type: 'transition', data: { current_standard: 'ISO 9001:2015', new_standard: 'ISO 9001:2026', risk_level: 'Medium', status: 'Open' } })} data-testid="sl-new-transition"><Plus className="w-4 h-4 mr-1" /> Add Gap Item</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr>{['Current → New', 'Clauses', 'Existing process', 'Gap', 'Risk', 'Action', 'Responsible', 'Due', 'Status', ''].map(h => <th key={h} className="text-left p-2 border">{h}</th>)}</tr></thead>
            <tbody>{transition.map(t => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="p-2 border text-xs">{t.current_standard} → {t.new_standard}</td>
                <td className="p-2 border font-mono text-xs">{t.current_clause || ''} → {t.new_clause || ''}</td>
                <td className="p-2 border text-xs max-w-[180px]">{t.existing_process || ''}</td>
                <td className="p-2 border text-xs max-w-[200px]">{t.gap_identified || ''}</td>
                <td className="p-2 border"><span className={`px-2 py-0.5 rounded text-xs font-semibold ${riskCls(t.risk_level)}`}>{t.risk_level}</span></td>
                <td className="p-2 border text-xs max-w-[180px]">{t.action_required || ''}</td>
                <td className="p-2 border text-xs">{t.responsible_person || ''}</td>
                <td className="p-2 border text-xs">{t.due_date || ''}</td>
                <td className="p-2 border"><span className={`px-2 py-0.5 rounded text-xs font-semibold ${t.status === 'Closed' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{t.status}</span></td>
                <td className="p-2 border"><button className="text-blue-600" onClick={() => setEditItem({ type: 'transition', data: t })}><Edit className="w-4 h-4" /></button></td>
              </tr>))}</tbody>
          </table>
          {transition.length === 0 && <p className="text-center text-gray-500 py-4 text-sm">No transition gap items yet — add gaps found during transition audits.</p>}
        </CardContent></Card>
      )}

      {/* EDIT DIALOG */}
      {editItem && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" data-testid="sl-edit-dialog">
          <Card className="w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="pb-2"><CardTitle className="text-base capitalize">{editItem.data.id ? 'Edit' : 'Add'} {editItem.type}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {editItem.type === 'standard' && <>
                {F('Standard name', 'name')}{F('Version', 'version')}
                {F('Type', 'type', { options: ['Quality', 'Environmental', 'OHS', 'Audit Guidance', 'Other'] })}
                {F('Status', 'status', { options: ['Current', 'Superseded', 'Draft', 'Transition', 'Archived'] })}
                {F('Effective date', 'effective_date', { date: true })}{F('Transition deadline', 'transition_deadline', { date: true })}
                {F('Notes', 'notes', { area: true, wide: true })}
              </>}
              {editItem.type === 'clause' && <>
                <div className="md:col-span-2"><Label className="text-xs">Standard</Label>
                  <select className={inputCls} value={editItem.data.standard_id || ''} onChange={e => setEditItem(it => ({ ...it, data: { ...it.data, standard_id: e.target.value } }))}>
                    {standards.map(s => <option key={s.id} value={s.id}>{s.name}:{s.version}</option>)}
                  </select></div>
                {F('Clause number', 'clause_number')}{F('Clause title', 'clause_title')}
                {F('Short clause summary', 'clause_summary', { area: true, wide: true })}
                {F('Parent clause', 'parent_clause')}{F('Applicable to', 'applicable_to', { options: ['Quality', 'Environmental', 'OHS', 'IMS'] })}
                {F('Audit prompt', 'audit_prompt', { area: true, wide: true })}
                {F('Evidence guidance', 'evidence_guidance', { area: true, wide: true })}
                {F('Typical records to check', 'typical_records', { area: true, wide: true })}
              </>}
              {editItem.type === 'mapping' && <>
                {F('Current standard', 'current_standard')}{F('Current clause', 'current_clause')}
                {F('New standard', 'new_standard')}{F('New clause', 'new_clause')}
                {F('Mapping type', 'mapping_type', { options: ['Equivalent', 'Changed', 'New', 'Removed', 'Expanded'] })}
                {F('Action required', 'action_required')}
                {F('Transition notes', 'transition_notes', { area: true, wide: true })}
              </>}
              {editItem.type === 'transition' && <>
                {F('Current standard', 'current_standard')}{F('New standard', 'new_standard')}
                {F('Current clause', 'current_clause')}{F('New clause', 'new_clause')}
                {F('Existing process', 'existing_process', { area: true, wide: true })}
                {F('Gap identified', 'gap_identified', { area: true, wide: true })}
                {F('Risk level', 'risk_level', { options: ['Low', 'Medium', 'High', 'Critical'] })}
                {F('Status', 'status', { options: ['Open', 'In Progress', 'Closed'] })}
                {F('Action required', 'action_required', { area: true, wide: true })}
                {F('Responsible person', 'responsible_person')}{F('Due date', 'due_date', { date: true })}
                {F('Evidence of closure', 'evidence_of_closure', { area: true, wide: true })}
              </>}
              <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
                <Button onClick={save} data-testid="sl-save-btn"><Save className="w-4 h-4 mr-1" /> Save</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
