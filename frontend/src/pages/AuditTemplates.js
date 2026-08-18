import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { FilePlus, ChevronDown, ChevronRight, PlayCircle } from 'lucide-react';
import api from '../services/api';
import HelpButton from '../components/audit/HelpButton';

export default function AuditTemplates() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [createFor, setCreateFor] = useState(null); // template being used to create an audit
  const [form, setForm] = useState({ auditor_name: '', scope_of_audit: '', exclusions: '' });
  const [creating, setCreating] = useState(false);

  const load = async () => setTemplates((await api.get('/audit-templates')).data.items);
  useEffect(() => { load(); }, []);

  const createAudit = async () => {
    if (!form.auditor_name.trim()) return alert('Auditor name is required');
    setCreating(true);
    try {
      const r = await api.post(`/audit-templates/${createFor.id}/create-audit`, form);
      navigate(`/quality/audits/${r.data.audit_id}`);
    } catch (e) { alert('Failed: ' + (e?.response?.data?.detail || e.message)); }
    finally { setCreating(false); }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5" data-testid="audit-templates-page">
      <div>
        <h1 className="text-3xl font-bold">Audit Templates</h1>
        <p className="text-gray-600 text-sm mt-1">Create audits from pre-built IMS framework templates. Each section carries its own audit prompt, evidence requirements and Help guidance.</p>
      </div>

      <div className="space-y-3">
        {templates.map(t => (
          <Card key={t.id} data-testid={`template-card-${t.template_type.replace(/\s+/g, '-').toLowerCase()}`}>
            <CardHeader className="pb-2 cursor-pointer" onClick={() => setOpenId(openId === t.id ? null : t.id)}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="text-base flex items-center gap-2">
                  {openId === t.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  {t.name}
                  <span className="text-xs font-normal text-gray-500">({(t.sections || []).length} sections)</span>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1 flex-wrap">{(t.standards || []).map(s => <span key={s} className="bg-gray-800 text-white text-[10px] px-2 py-0.5 rounded">{s}</span>)}</div>
                  <Button size="sm" onClick={(e) => { e.stopPropagation(); setCreateFor(t); setForm({ auditor_name: '', scope_of_audit: '', exclusions: '' }); }} data-testid={`template-use-${t.id}`}>
                    <PlayCircle className="w-4 h-4 mr-1" /> Create Audit
                  </Button>
                </div>
              </div>
            </CardHeader>
            {openId === t.id && (
              <CardContent>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr>
                    <th className="text-left p-2 border w-12">#</th><th className="text-left p-2 border">Section</th>
                    <th className="text-left p-2 border">Clause references</th><th className="text-left p-2 border w-24">Mandatory</th>
                    <th className="text-left p-2 border w-20">Help</th>
                  </tr></thead>
                  <tbody>{(t.sections || []).map(s => (
                    <tr key={s.number} className="hover:bg-gray-50">
                      <td className="p-2 border font-mono">{s.number}</td>
                      <td className="p-2 border font-medium">{s.title}</td>
                      <td className="p-2 border text-xs text-gray-600">{s.clause_refs || ''}</td>
                      <td className="p-2 border text-xs">{s.mandatory !== false ? 'Yes' : 'Optional'}</td>
                      <td className="p-2 border"><HelpButton section={s.title} size="xs" /></td>
                    </tr>))}</tbody>
                </table>
              </CardContent>
            )}
          </Card>
        ))}
        {templates.length === 0 && <Card><CardContent className="py-8 text-center text-gray-500">No templates found.</CardContent></Card>}
      </div>

      {createFor && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" data-testid="template-create-dialog">
          <Card className="w-full max-w-lg shadow-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><FilePlus className="w-5 h-5" /> New audit from “{createFor.name}”</CardTitle>
              <p className="text-xs text-gray-500">{(createFor.sections || []).length} sections will be created with prompts, evidence requirements and Help guidance.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div><Label>Auditor name *</Label><Input value={form.auditor_name} onChange={e => setForm(f => ({ ...f, auditor_name: e.target.value }))} data-testid="template-auditor-input" /></div>
              <div><Label>Scope of audit</Label><Textarea rows={3} value={form.scope_of_audit} onChange={e => setForm(f => ({ ...f, scope_of_audit: e.target.value }))} placeholder={createFor.description || ''} data-testid="template-scope-input" /></div>
              <div><Label>Exclusions</Label><Input value={form.exclusions} onChange={e => setForm(f => ({ ...f, exclusions: e.target.value }))} placeholder="e.g. Design and development — ISO 9001:2015 8.3" /></div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setCreateFor(null)}>Cancel</Button>
                <Button onClick={createAudit} disabled={creating} data-testid="template-create-confirm">{creating ? 'Creating…' : 'Create Audit'}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
