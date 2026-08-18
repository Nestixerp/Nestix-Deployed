import React, { useEffect, useMemo, useState } from 'react';
import ReactQuill, { Quill } from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import './Policies.css';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { FileText, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../services/api';

// Inline-style attributors so saved HTML carries real font-family / font-size / align styles
const FONTS = ['Calibri', 'Arial', 'Times New Roman', 'Georgia', 'Courier New'];
const SIZES = ['8pt', '9pt', '10pt', '11pt', '12pt', '14pt', '16pt', '18pt', '20pt', '24pt', '28pt', '36pt'];
const FontStyle = Quill.import('attributors/style/font');
FontStyle.whitelist = FONTS;
Quill.register(FontStyle, true);
const SizeStyle = Quill.import('attributors/style/size');
SizeStyle.whitelist = SIZES;
Quill.register(SizeStyle, true);
Quill.register(Quill.import('attributors/style/align'), true);

const MODULES = {
  toolbar: [
    [{ font: FONTS }, { size: SIZES }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ script: 'sub' }, { script: 'super' }],
    [{ color: [] }, { background: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ indent: '-1' }, { indent: '+1' }],
    [{ align: [] }],
    ['clean'],
  ],
};

export default function Policies() {
  const [policies, setPolicies] = useState([]);
  const [selId, setSelId] = useState(null);
  const [doc, setDoc] = useState(null); // {id?, title, issue, issue_date, content_html}
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const skipChange = React.useRef(false);

  const load = async () => setPolicies((await api.get('/policies')).data.items);
  useEffect(() => { load(); }, []);

  const open = async (id) => {
    const { data } = await api.get(`/policies/${id}`);
    skipChange.current = true;
    setSelId(id); setDoc(data); setDirty(false);
  };

  const newPolicy = () => {
    setSelId(null);
    setDoc({
      title: 'New Policy', issue: '1',
      issue_date: `${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}`,
      content_html: '<p style="text-align: center;"><strong><span style="font-size: 16pt;">NEW POLICY</span></strong></p><p><br/></p><p><strong>Purpose:</strong></p><p>Describe the purpose of this policy…</p>',
    });
    setDirty(true);
  };

  const save = async () => {
    if (!doc.title.trim()) { toast.error('Title is required'); return; }
    setBusy(true);
    try {
      // Quill 2 emits &nbsp; for normal spaces — convert back so text wraps in print
      const cleanHtml = (doc.content_html || '').replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ');
      const payload = { title: doc.title, issue: doc.issue, issue_date: doc.issue_date, content_html: cleanHtml };
      if (doc.id) {
        await api.put(`/policies/${doc.id}`, payload);
      } else {
        const { data } = await api.post('/policies', payload);
        setDoc(data); setSelId(data.id);
      }
      toast.success('Policy saved');
      setDirty(false); await load();
    } catch (e) { toast.error('Save failed: ' + (e?.response?.data?.detail || e.message)); }
    setBusy(false);
  };

  const printPdf = async () => {
    if (!doc?.id) { toast.error('Save the policy first'); return; }
    if (dirty) await save();
    try {
      const res = await api.get(`/policies/${doc.id}/export/pdf`, { responseType: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      link.download = `${doc.title.replace(/ /g, '_')}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) { toast.error('PDF export failed'); }
  };

  const remove = async () => {
    if (!doc?.id) return;
    if (!window.confirm(`Delete policy "${doc.title}"?`)) return;
    try {
      await api.delete(`/policies/${doc.id}`);
      toast.success('Policy deleted');
      setDoc(null); setSelId(null); await load();
    } catch (e) { toast.error('Delete failed'); }
  };

  const editorKey = useMemo(() => selId || 'new', [selId]);

  return (
    <div className="p-6 space-y-4" data-testid="policies-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-blue-700" />
          <h1 className="text-xl font-bold">Company Policies</h1>
        </div>
        <Button size="sm" data-testid="new-policy-btn" onClick={newPolicy}><Plus className="h-4 w-4 mr-1" /> New Policy</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        <Card className="h-fit">
          <CardContent className="pt-4 pb-4" data-testid="policies-list">
            <h2 className="font-semibold text-sm mb-2">Policy Register</h2>
            {policies.length === 0 && <div className="text-sm text-slate-500">No policies yet.</div>}
            {policies.map((p) => (
              <button key={p.id} data-testid={`policy-item-${p.id}`} onClick={() => open(p.id)}
                className={`w-full text-left px-2 py-2 rounded text-sm hover:bg-slate-100 ${selId === p.id ? 'bg-blue-50 text-blue-800 font-medium' : ''}`}>
                <div className="truncate">{p.title}</div>
                <div className="text-xs text-slate-500">Issue {p.issue} · {p.issue_date}</div>
              </button>
            ))}
          </CardContent>
        </Card>

        {doc ? (
          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_140px] gap-2 mb-3">
                <div><label className="text-xs font-medium">Policy Title</label>
                  <Input data-testid="policy-title-input" value={doc.title} onChange={(e) => { setDoc({ ...doc, title: e.target.value }); setDirty(true); }} /></div>
                <div><label className="text-xs font-medium">Issue</label>
                  <Input data-testid="policy-issue-input" value={doc.issue || ''} onChange={(e) => { setDoc({ ...doc, issue: e.target.value }); setDirty(true); }} /></div>
                <div><label className="text-xs font-medium">Issue Date (MM/YYYY)</label>
                  <Input data-testid="policy-issue-date-input" value={doc.issue_date || ''} onChange={(e) => { setDoc({ ...doc, issue_date: e.target.value }); setDirty(true); }} /></div>
              </div>
              <div className="flex flex-wrap gap-2 sticky top-[52px] z-30 bg-white py-2 border-b mb-2" data-testid="policy-actions-bar">
                <Button size="sm" data-testid="save-policy-btn" disabled={busy} onClick={save}><Save className="h-4 w-4 mr-1" /> Save</Button>
                <Button size="sm" variant="outline" data-testid="print-policy-btn" onClick={printPdf}><Printer className="h-4 w-4 mr-1" /> Print PDF</Button>
                {doc.id && <Button size="sm" variant="ghost" className="text-red-600" data-testid="delete-policy-btn" onClick={remove}><Trash2 className="h-4 w-4" /></Button>}
                {dirty && <span className="text-xs text-amber-600 self-center">Unsaved changes</span>}
              </div>
              <div className="policy-editor bg-white" data-testid="policy-editor">
                <ReactQuill key={editorKey} theme="snow" modules={MODULES}
                  value={doc.content_html || ''}
                  onChange={(html) => {
                    setDoc((d) => ({ ...d, content_html: html }));
                    if (skipChange.current) { skipChange.current = false; return; }
                    setDirty(true);
                  }} />
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Printed PDF uses Calibri, your company logo at the top, and the standard policy footer
                (Title · Issue · Page x of y) like your other quality documents.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card><CardContent className="pt-10 pb-10 text-center text-slate-500" data-testid="policies-empty">
            Select a policy from the register or click <b>New Policy</b> to start writing.
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}
