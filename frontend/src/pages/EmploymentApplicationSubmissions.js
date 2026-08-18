import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { ArrowLeft, Eye, Printer, Trash2, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import api from '../services/api';
import { formatDateTime } from '../utils/dateFormatter';
import { employmentApplication } from '../forms/employmentApplication';
import {
  buildDocControlFooter, getControlledDocumentByModule, invalidateDocControlCache
} from '../utils/documentControl';

const EmploymentApplicationSubmissions = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(null);
  const publicUrl = `${window.location.origin}/apply/employment-application`;

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await api.get('/employment-applications');
      setItems(res.data || []);
    } catch (e) {
      toast.error('Failed to load applications');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchItems(); }, []);

  const handleDelete = async (it) => {
    if (!window.confirm(`Delete application from ${it.first_name} ${it.last_name}?`)) return;
    try { await api.delete(`/employment-applications/${it.id}`); toast.success('Deleted'); fetchItems(); }
    catch { toast.error('Delete failed'); }
  };

  const handlePrint = async (it) => {
    invalidateDocControlCache();
    const doc = await getControlledDocumentByModule('Employment Application Form', { fallback: 'Employment Application', docType: 'Form' });
    const footer = buildDocControlFooter(doc, {
      title: 'Employment Application', owner: 'Quality Manager',
    });
    const w = window.open('', '_blank', 'width=1100,height=1400');
    if (!w) { toast.error('Pop-up blocked'); return; }
    w.document.write(employmentApplication.render(footer, it));
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    toast.success('Public link copied');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="employment-submissions-page">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <Button variant="outline" onClick={() => navigate('/quality/forms')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Forms
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={copyLink} data-testid="copy-public-link">
            <Copy className="w-4 h-4 mr-1" /> Copy Public Link
          </Button>
          <Button variant="outline" onClick={() => window.open(publicUrl, '_blank')}>
            <ExternalLink className="w-4 h-4 mr-1" /> Open
          </Button>
        </div>
      </div>

      <h1 className="text-2xl font-bold mb-1">Employment Applications</h1>
      <p className="text-xs text-slate-600 mb-4 break-all">
        Public link to share with candidates: <strong>{publicUrl}</strong>
      </p>

      <Card className="p-4">
        {loading ? <div className="text-center py-6 text-slate-500">Loading…</div> :
         items.length === 0 ? <div className="text-center py-6 text-slate-500">No applications received yet.</div> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="border px-2 py-1.5 text-left">Reference</th>
                <th className="border px-2 py-1.5 text-left">Name</th>
                <th className="border px-2 py-1.5 text-left">Position</th>
                <th className="border px-2 py-1.5 text-left">Email</th>
                <th className="border px-2 py-1.5 text-left">Phone</th>
                <th className="border px-2 py-1.5 text-left">Submitted</th>
                <th className="border px-2 py-1.5 text-left">Status</th>
                <th className="border px-2 py-1.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="hover:bg-slate-50">
                  <td className="border px-2 py-1.5 font-mono text-xs">{it.submission_no}</td>
                  <td className="border px-2 py-1.5">{it.first_name} {it.last_name}</td>
                  <td className="border px-2 py-1.5">{it.position || '—'}</td>
                  <td className="border px-2 py-1.5 text-xs">{it.email || '—'}</td>
                  <td className="border px-2 py-1.5">{it.phone || '—'}</td>
                  <td className="border px-2 py-1.5 text-xs">{formatDateTime(it.submitted_at)}</td>
                  <td className="border px-2 py-1.5"><Badge variant="outline">{it.status || 'New'}</Badge></td>
                  <td className="border px-2 py-1.5 text-center">
                    <Button size="sm" variant="ghost" onClick={() => setView(it)}><Eye className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => handlePrint(it)}><Printer className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDelete(it)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{view?.submission_no} — {view?.first_name} {view?.last_name}</DialogTitle>
          </DialogHeader>
          {view && (
            <div className="text-sm space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div><strong>Position:</strong> {view.position || '—'}</div>
                <div><strong>Date available:</strong> {view.date_available || '—'}</div>
                <div><strong>Email:</strong> {view.email || '—'}</div>
                <div><strong>Phone:</strong> {view.phone || '—'}</div>
                <div><strong>Address:</strong> {view.street_address}, {view.city} {view.state} {view.postcode}</div>
                <div><strong>Australian citizen:</strong> {view.is_citizen || '—'}</div>
              </div>
              <details className="border-t pt-2">
                <summary className="cursor-pointer font-semibold">Education</summary>
                <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(view.education, null, 2)}</pre>
              </details>
              <details className="border-t pt-2">
                <summary className="cursor-pointer font-semibold">Previous Employment</summary>
                <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(view.previous_employment, null, 2)}</pre>
              </details>
              <details className="border-t pt-2">
                <summary className="cursor-pointer font-semibold">References</summary>
                <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(view.references, null, 2)}</pre>
              </details>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => handlePrint(view)}><Printer className="w-4 h-4 mr-1" /> Print</Button>
            <Button onClick={() => setView(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmploymentApplicationSubmissions;
