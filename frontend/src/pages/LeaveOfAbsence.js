import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Plus, Search, Edit, Trash2, Save, Printer, ArrowLeft, FileDown, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import api from '../services/api';
import { formatDate } from '../utils/dateFormatter';
import {
  getControlledDocumentByModule, buildDocControlFooter,
  buildPrintFooterCss, buildPrintBodyOpen, buildPrintBodyClose,
} from '../utils/documentControl';

const MODULE_NAME = 'Leave of Absence Form';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

const STATUS_BADGE = {
  Pending: 'bg-amber-100 text-amber-800 border-amber-300',
  Approved: 'bg-green-100 text-green-800 border-green-300',
  Declined: 'bg-red-100 text-red-800 border-red-300',
  Completed: 'bg-blue-100 text-blue-800 border-blue-300',
};

const LeaveOfAbsence = () => {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [ref, setRef] = useState({ paid_leave_types: [], unpaid_leave_types: [], titles: [] });
  const [docInfo, setDocInfo] = useState(null);

  useEffect(() => {
    fetchAll();
    api.get('/leave-of-absence/reference').then(r => setRef(r.data));
    api.get('/employees').then(r => setEmployees(r.data || [])).catch(() => {});
    getControlledDocumentByModule(MODULE_NAME, { fallback: 'Leave of Absence', docType: 'Form' }).then(setDocInfo);
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const [l, s] = await Promise.all([
        api.get('/leave-of-absence', { params }),
        api.get('/leave-of-absence/stats'),
      ]);
      setItems(l.data.items || []); setStats(s.data || {});
    } finally { setLoading(false); }
  };

  const blank = useMemo(() => ({
    title: 'Mr', surname: '', first_name: '', employee_id: '', employee_no: '',
    work_area: '', shift: '',
    last_date_of_work: '', last_time_of_work: '',
    date_work_resumes: '', time_work_resumes: '',
    total_days_absent: '',
    leave: { paid_types: [], paid_special_reason: '', unpaid_types: [], unpaid_special_reason: '' },
    employee_signature: '', employee_sig_date: '',
    supervisor: { name: '', date: '', approved: null },
    operations_manager: { name: '', date: '', approved: null },
    pay_office_notification_name: '', pay_office_notification_date: '', pay_office_notification_time: '',
    anticipated_return_date: '', pay_office_signature: '', pay_office_explanation: '',
    status: 'Pending',
  }), []);

  const openNew = () => setEditing({ ...blank });
  const openEdit = async (it) => {
    const r = await api.get(`/leave-of-absence/${it.id}`);
    setEditing(r.data);
  };
  const close = () => setEditing(null);
  const updateField = (patch) => setEditing(e => ({ ...e, ...patch }));
  const updateLeave = (patch) => setEditing(e => ({ ...e, leave: { ...(e.leave || {}), ...patch } }));
  const updateBlock = (k, patch) => setEditing(e => ({ ...e, [k]: { ...(e[k] || {}), ...patch } }));

  const togglePaid = (t) => {
    const arr = editing.leave?.paid_types || [];
    updateLeave({ paid_types: arr.includes(t) ? arr.filter(x => x !== t) : [...arr, t] });
  };
  const toggleUnpaid = (t) => {
    const arr = editing.leave?.unpaid_types || [];
    updateLeave({ unpaid_types: arr.includes(t) ? arr.filter(x => x !== t) : [...arr, t] });
  };

  const pickEmployee = (id) => {
    const emp = employees.find(e => e.id === id);
    updateField({
      employee_id: id,
      surname: emp?.last_name || editing.surname,
      first_name: emp?.first_name || editing.first_name,
      employee_no: emp?.employee_no || editing.employee_no,
    });
  };

  const save = async () => {
    if (!editing.surname || !editing.first_name) return alert('Surname and First Name are required');
    try {
      const payload = { ...editing };
      if (payload.total_days_absent === '') payload.total_days_absent = null;
      else if (payload.total_days_absent != null) payload.total_days_absent = parseFloat(payload.total_days_absent);
      delete payload.created_at; delete payload.updated_at; delete payload.loa_no; delete payload.id;
      if (editing.id) await api.put(`/leave-of-absence/${editing.id}`, payload);
      else await api.post('/leave-of-absence', payload);
      close(); fetchAll();
    } catch (e) { alert('Save failed: ' + (e?.response?.data?.detail || e.message)); }
  };

  const remove = async (it) => {
    if (!window.confirm(`Delete LOA-${String(it.loa_no).padStart(3, '0')}?`)) return;
    await api.delete(`/leave-of-absence/${it.id}`); fetchAll();
  };

  // Quick status change (e.g. approve / decline / mark pending) without opening the editor.
  const setStatus = async (it, newStatus) => {
    try {
      const full = (await api.get(`/leave-of-absence/${it.id}`)).data || it;
      await api.put(`/leave-of-absence/${it.id}`, { ...full, status: newStatus });
      toast.success(`LOA-${String(it.loa_no).padStart(3, '0')} marked ${newStatus}`);
      fetchAll();
    } catch (e) {
      toast.error('Could not update status');
    }
  };

  const printOne = async (rec, blankForm = false) => {
    const doc = await getControlledDocumentByModule(MODULE_NAME, { fallback: 'Leave of Absence', docType: 'Form' });
    const footer = buildDocControlFooter(doc, {
      title: blankForm ? 'Leave of Absence Request (Blank Form)' : `Leave of Absence — LOA-${String(rec.loa_no).padStart(3, '0')}`,
    });
    const v = (k) => blankForm ? '' : esc(rec?.[k] ?? '');
    const checked = (val, opt) => (!blankForm && val === opt) ? 'on' : '';
    const titles = ref.titles || ['Mr', 'Mrs', 'Ms'];
    const paidChk = (t) => (!blankForm && (rec?.leave?.paid_types || []).includes(t)) ? 'on' : '';
    const unpaidChk = (t) => (!blankForm && (rec?.leave?.unpaid_types || []).includes(t)) ? 'on' : '';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>${blankForm ? 'Blank LOA' : `LOA-${rec.loa_no}`}</title>
      <style>${buildPrintFooterCss()}
        @page { size: A4 portrait; margin: 10mm 10mm 14mm 10mm; }
        body { font-size: 10pt; color: #111; }
        h1 { font-size: 15pt; margin: 0 0 3mm 0; text-align: center; }
        h2 { font-size: 10pt; margin: 4mm 0 1mm 0; background:#1f2937; color:#fff; padding: 1mm 2mm; text-transform: uppercase; letter-spacing: 0.05em; }
        table { width: 100%; border-collapse: collapse; }
        td, th { border: 1px solid #333; padding: 3px 5px; font-size: 9pt; vertical-align: top; }
        td.lbl { background:#f3f4f6; font-weight: 600; width: 20%; }
        .chk { display: inline-block; width: 4mm; height: 4mm; border: 1px solid #111; text-align: center; line-height: 4mm; margin-right: 2mm; vertical-align: middle; }
        .chk.on { background: #111; color: #fff; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
      </style></head><body>
      ${buildPrintBodyOpen(footer)}
      <h1>LEAVE OF ABSENCE REQUEST</h1>
      <h2>Employee Details</h2>
      <table>
        <tr><td class="lbl">Title</td><td>${titles.map(t => `<span class="chk ${checked(rec?.title,t)}">${checked(rec?.title,t)?'✓':''}</span> ${t}`).join('&nbsp;&nbsp;')}</td>
            <td class="lbl">Employee No</td><td>${v('employee_no')}</td></tr>
        <tr><td class="lbl">Surname</td><td>${v('surname')}</td><td class="lbl">First Name</td><td>${v('first_name')}</td></tr>
        <tr><td class="lbl">Work Area</td><td>${v('work_area')}</td><td class="lbl">Shift</td><td>${v('shift')}</td></tr>
      </table>
      <h2>Leave Duration</h2>
      <table>
        <tr><td class="lbl">Last Day Worked</td><td>${blankForm ? '' : esc(formatDate(rec.last_date_of_work))}</td><td class="lbl">Time</td><td>${v('last_time_of_work')}</td></tr>
        <tr><td class="lbl">Date Work Resumes</td><td>${blankForm ? '' : esc(formatDate(rec.date_work_resumes))}</td><td class="lbl">Time</td><td>${v('time_work_resumes')}</td></tr>
        <tr><td class="lbl">Total Days Absent</td><td colspan="3">${v('total_days_absent')}</td></tr>
      </table>
      <h2>Paid Leave</h2>
      <table><tr><td>
        ${(ref.paid_leave_types || ['Annual Leave','Sick Leave','Rostered Days','Long Service Leave','Carers Leave','Public Holidays','Bereavement Leave','Special Leave']).map(t => `<span style="display:inline-block;min-width:46mm;"><span class="chk ${paidChk(t)}">${paidChk(t)?'✓':''}</span> ${esc(t)}</span>`).join(' ')}
        <br/><br/><strong>Special Leave Reason:</strong> ${blankForm ? '' : esc(rec?.leave?.paid_special_reason || '')}
      </td></tr></table>
      <h2>Unpaid Leave</h2>
      <table><tr><td>
        ${(ref.unpaid_leave_types || ['Sick Leave','Special Leave']).map(t => `<span style="display:inline-block;min-width:46mm;"><span class="chk ${unpaidChk(t)}">${unpaidChk(t)?'✓':''}</span> ${esc(t)}</span>`).join(' ')}
        <br/><br/><strong>Special Leave Reason:</strong> ${blankForm ? '' : esc(rec?.leave?.unpaid_special_reason || '')}
      </td></tr></table>
      <h2>Approvals</h2>
      <table>
        <tr><th>Role</th><th>Name / Signature</th><th>Date</th></tr>
        <tr><td>Employee</td><td>${v('employee_signature')}</td><td>${blankForm ? '' : esc(formatDate(rec?.employee_sig_date))}</td></tr>
        <tr><td>Supervisor</td><td>${blankForm ? '' : esc(rec?.supervisor?.name || '')}</td><td>${blankForm ? '' : esc(formatDate(rec?.supervisor?.date))}</td></tr>
        <tr><td>Operations Manager</td><td>${blankForm ? '' : esc(rec?.operations_manager?.name || '')}</td><td>${blankForm ? '' : esc(formatDate(rec?.operations_manager?.date))}</td></tr>
      </table>
      <h2>Pay Office Use Only</h2>
      <table>
        <tr><td class="lbl">Notification Name</td><td>${v('pay_office_notification_name')}</td>
            <td class="lbl">Date / Time</td><td>${blankForm ? '' : esc(formatDate(rec?.pay_office_notification_date))} ${v('pay_office_notification_time')}</td></tr>
        <tr><td class="lbl">Anticipated Return</td><td>${blankForm ? '' : esc(formatDate(rec?.anticipated_return_date))}</td>
            <td class="lbl">Signature</td><td>${v('pay_office_signature')}</td></tr>
        <tr><td class="lbl">Explanation</td><td colspan="3" style="min-height:14mm;">${v('pay_office_explanation').replace(/\n/g,'<br/>')}</td></tr>
      </table>
      ${buildPrintBodyClose()}
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (_) { /* blocked */ } }, 300);
  };

  if (editing) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4" data-testid="loa-form-page">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <button onClick={close} className="text-sm text-blue-600 hover:underline mb-1 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</button>
            <h1 className="text-2xl font-bold">{editing.id ? `LOA-${String(editing.loa_no).padStart(3,'0')} — ${editing.title} ${editing.first_name} ${editing.surname}` : 'New Leave of Absence Request'}</h1>
            <p className="text-xs text-gray-500"><span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{docInfo?.form_no || '—'}</span></p>
          </div>
          <div className="flex gap-2">
            {editing.id && <Button variant="outline" onClick={() => printOne(editing)} data-testid="loa-print"><Printer className="w-4 h-4 mr-1" /> Print</Button>}
            <Button onClick={save} data-testid="loa-save"><Save className="w-4 h-4 mr-1" /> Save</Button>
          </div>
        </div>

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Employee Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div><Label>Title</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.title || ''} onChange={e => updateField({ title: e.target.value })}>
                {(ref.titles || []).map(t => <option key={t}>{t}</option>)}
              </select></div>
            <div className="md:col-span-3"><Label>Pick Employee (autofills name + no.)</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.employee_id || ''} onChange={e => pickEmployee(e.target.value)} data-testid="loa-employee">
                <option value="">— (manual entry) —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select></div>
            <div><Label>Surname *</Label><Input value={editing.surname || ''} onChange={e => updateField({ surname: e.target.value })} data-testid="loa-surname" /></div>
            <div><Label>First Name *</Label><Input value={editing.first_name || ''} onChange={e => updateField({ first_name: e.target.value })} data-testid="loa-firstname" /></div>
            <div><Label>Employee No</Label><Input value={editing.employee_no || ''} onChange={e => updateField({ employee_no: e.target.value })} /></div>
            <div><Label>Status</Label>
              <select className="w-full border rounded h-9 px-2" value={editing.status || 'Pending'} onChange={e => updateField({ status: e.target.value })} data-testid="loa-status">
                <option>Pending</option><option>Approved</option><option>Declined</option><option>Completed</option>
              </select></div>
            <div><Label>Work Area</Label><Input value={editing.work_area || ''} onChange={e => updateField({ work_area: e.target.value })} /></div>
            <div><Label>Shift</Label><Input value={editing.shift || ''} onChange={e => updateField({ shift: e.target.value })} /></div>
          </CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Leave Duration</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Last Day Worked</Label><Input type="date" value={editing.last_date_of_work || ''} onChange={e => updateField({ last_date_of_work: e.target.value })} /></div>
            <div><Label>Last Time of Work</Label><Input type="time" value={editing.last_time_of_work || ''} onChange={e => updateField({ last_time_of_work: e.target.value })} /></div>
            <div><Label>Total Days Absent</Label><Input type="number" step="0.5" value={editing.total_days_absent ?? ''} onChange={e => updateField({ total_days_absent: e.target.value })} /></div>
            <div><Label>Date Work Resumes</Label><Input type="date" value={editing.date_work_resumes || ''} onChange={e => updateField({ date_work_resumes: e.target.value })} /></div>
            <div><Label>Time Work Resumes</Label><Input type="time" value={editing.time_work_resumes || ''} onChange={e => updateField({ time_work_resumes: e.target.value })} /></div>
          </CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Paid Leave</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(ref.paid_leave_types || []).map(t => (
                <label key={t} className="flex items-center gap-2 text-sm border rounded px-2 py-1 cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={(editing.leave?.paid_types || []).includes(t)} onChange={() => togglePaid(t)} data-testid={`loa-paid-${t.replace(/\s+/g,'-')}`} />
                  {t}
                </label>
              ))}
            </div>
            {(editing.leave?.paid_types || []).includes('Special Leave') && (
              <div><Label className="text-xs">Special Leave Reason</Label><Input value={editing.leave?.paid_special_reason || ''} onChange={e => updateLeave({ paid_special_reason: e.target.value })} /></div>
            )}
          </CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Unpaid Leave</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(ref.unpaid_leave_types || []).map(t => (
                <label key={t} className="flex items-center gap-2 text-sm border rounded px-2 py-1 cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={(editing.leave?.unpaid_types || []).includes(t)} onChange={() => toggleUnpaid(t)} />
                  {t}
                </label>
              ))}
            </div>
            {(editing.leave?.unpaid_types || []).includes('Special Leave') && (
              <div><Label className="text-xs">Special Leave Reason</Label><Input value={editing.leave?.unpaid_special_reason || ''} onChange={e => updateLeave({ unpaid_special_reason: e.target.value })} /></div>
            )}
          </CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Approvals</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="border rounded p-3 space-y-2">
              <div className="font-semibold text-sm">Employee</div>
              <div><Label className="text-xs">Signature (typed)</Label><Input value={editing.employee_signature || ''} onChange={e => updateField({ employee_signature: e.target.value })} /></div>
              <div><Label className="text-xs">Date</Label><Input type="date" value={editing.employee_sig_date || ''} onChange={e => updateField({ employee_sig_date: e.target.value })} /></div>
            </div>
            {[
              { k: 'supervisor', label: 'Supervisor' },
              { k: 'operations_manager', label: 'Operations Manager' },
            ].map(({ k, label }) => (
              <div key={k} className="border rounded p-3 space-y-2">
                <div className="font-semibold text-sm">{label}</div>
                <div><Label className="text-xs">Name</Label><Input value={editing[k]?.name || ''} onChange={e => updateBlock(k, { name: e.target.value })} /></div>
                <div><Label className="text-xs">Date</Label><Input type="date" value={editing[k]?.date || ''} onChange={e => updateBlock(k, { date: e.target.value })} /></div>
              </div>
            ))}
          </CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Pay Office Use Only</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Notification Name</Label><Input value={editing.pay_office_notification_name || ''} onChange={e => updateField({ pay_office_notification_name: e.target.value })} /></div>
            <div><Label>Notification Date</Label><Input type="date" value={editing.pay_office_notification_date || ''} onChange={e => updateField({ pay_office_notification_date: e.target.value })} /></div>
            <div><Label>Notification Time</Label><Input type="time" value={editing.pay_office_notification_time || ''} onChange={e => updateField({ pay_office_notification_time: e.target.value })} /></div>
            <div><Label>Anticipated Return</Label><Input type="date" value={editing.anticipated_return_date || ''} onChange={e => updateField({ anticipated_return_date: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Pay Office Signature</Label><Input value={editing.pay_office_signature || ''} onChange={e => updateField({ pay_office_signature: e.target.value })} /></div>
            <div className="md:col-span-3"><Label>Explanation</Label><Textarea rows={2} value={editing.pay_office_explanation || ''} onChange={e => updateField({ pay_office_explanation: e.target.value })} /></div>
          </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="loa-page">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Leave of Absence Register</h1>
          <p className="text-gray-600 text-sm mt-1">HR / Payroll <span className="ml-1 font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{docInfo?.form_no || '—'}</span></p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => printOne(null, true)} data-testid="loa-print-blank"><FileDown className="w-4 h-4 mr-1" /> Print Blank Form</Button>
          <Button onClick={openNew} data-testid="loa-new"><Plus className="w-4 h-4 mr-1" /> New Request</Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-l-4 border-l-blue-600"><CardContent className="pt-4 pb-3"><div className="text-xs text-gray-500">Total</div><div className="text-3xl font-bold text-blue-700" data-testid="loa-stat-total">{stats.total}</div></CardContent></Card>
          <Card className="border-l-4 border-l-amber-600"><CardContent className="pt-4 pb-3"><div className="text-xs text-gray-500">Pending</div><div className="text-3xl font-bold text-amber-700">{stats.pending}</div></CardContent></Card>
          <Card className="border-l-4 border-l-green-600"><CardContent className="pt-4 pb-3"><div className="text-xs text-gray-500">Approved</div><div className="text-3xl font-bold text-green-700">{stats.approved}</div></CardContent></Card>
          <Card className="border-l-4 border-l-red-600"><CardContent className="pt-4 pb-3"><div className="text-xs text-gray-500">Declined</div><div className="text-3xl font-bold text-red-700">{stats.declined}</div></CardContent></Card>
        </div>
      )}

      <Card>
        <CardContent className="pt-6 flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]"><Label className="text-xs">Search</Label><Input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchAll()} placeholder="Name, employee #, area…" data-testid="loa-search" /></div>
          <div><Label className="text-xs">Status</Label><select className="border rounded h-9 px-2" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All</option><option>Pending</option><option>Approved</option><option>Declined</option><option>Completed</option></select></div>
          <Button onClick={fetchAll}><Search className="w-4 h-4 mr-1" /> Apply</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle>{items.length} record{items.length === 1 ? '' : 's'}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr>
              <th className="text-left p-2 border">LOA #</th><th className="text-left p-2 border">Employee</th>
              <th className="text-left p-2 border">Emp No</th><th className="text-left p-2 border">Last Day</th>
              <th className="text-left p-2 border">Resumes</th><th className="text-left p-2 border">Days</th>
              <th className="text-left p-2 border">Status</th><th className="text-left p-2 border w-32">Actions</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="text-center text-gray-500 py-6">Loading…</td></tr>}
              {!loading && items.length === 0 && <tr><td colSpan={8} className="text-center text-gray-500 py-6">No requests yet.</td></tr>}
              {items.map(it => (
                <tr key={it.id} className="hover:bg-gray-50">
                  <td className="p-2 border font-mono font-bold">LOA-{String(it.loa_no).padStart(3, '0')}</td>
                  <td className="p-2 border">{it.title} {it.first_name} {it.surname}</td>
                  <td className="p-2 border">{it.employee_no || ''}</td>
                  <td className="p-2 border">{formatDate(it.last_date_of_work)}</td>
                  <td className="p-2 border">{formatDate(it.date_work_resumes)}</td>
                  <td className="p-2 border">{it.total_days_absent ?? ''}</td>
                  <td className="p-2 border">{it.status ? <span className={`inline-block px-2 py-0.5 rounded border text-xs font-semibold ${STATUS_BADGE[it.status] || ''}`}>{it.status}</span> : ''}</td>
                  <td className="p-2 border whitespace-nowrap">
                    {it.status === 'Pending' && (
                      <>
                        <button onClick={() => setStatus(it, 'Approved')} className="text-green-700 hover:underline mr-2" title="Approve" data-testid={`loa-approve-${it.id}`}><CheckCircle2 className="w-4 h-4 inline" /></button>
                        <button onClick={() => setStatus(it, 'Declined')} className="text-red-700 hover:underline mr-2" title="Decline" data-testid={`loa-decline-${it.id}`}><XCircle className="w-4 h-4 inline" /></button>
                      </>
                    )}
                    {(it.status === 'Approved' || it.status === 'Declined') && (
                      <button onClick={() => setStatus(it, 'Pending')} className="text-amber-700 hover:underline mr-2" title="Revert to Pending" data-testid={`loa-revert-${it.id}`}><RotateCcw className="w-4 h-4 inline" /></button>
                    )}
                    <button onClick={() => printOne(it)} className="text-gray-700 hover:underline mr-2" title="Print"><Printer className="w-4 h-4 inline" /></button>
                    <button onClick={() => openEdit(it)} className="text-blue-600 hover:underline mr-2" title="Edit" data-testid={`loa-edit-${it.id}`}><Edit className="w-4 h-4 inline" /></button>
                    <button onClick={() => remove(it)} className="text-red-600 hover:underline" title="Delete" data-testid={`loa-delete-${it.id}`}><Trash2 className="w-4 h-4 inline" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

export default LeaveOfAbsence;
