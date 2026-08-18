import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Save, Printer, ArrowLeft, FileText, Wrench, Plus, X as XIcon, Trash2 } from 'lucide-react';
import api from '../services/api';
import { formatDate } from '../utils/dateFormatter';
import {
  getControlledDocumentByModule,
  buildDocControlFooter,
  buildPrintFooterCss,
  buildPrintBodyOpen,
  buildPrintBodyClose,
} from '../utils/documentControl';

const YN = ['', 'Yes', 'No'];

const padCR = (n) => (n == null ? '' : String(n).padStart(2, '0'));

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

const blank = () => ({
  ult_lsr_po_no: '', ult_lsr_invoice_no: '', ult_lsr_posc_no: '', ult_lsr_pot_no: '',
  qty: '', date_raised: new Date().toISOString().slice(0, 10), return_item_no: '',
  customer: '', supplier: '', location: 'Ultimate Laser', product: '',
  ultimate_laser_item_no: '', pn_code: '',
  description: '', cost_per_item: '', entered_by: '', signature: '',
  notified_by_customer: 'No', supplier_notified: 'No', internal: 'Yes',
  quality_assurance: '', downgrade_use: 'No', scrap: 'No', rework: 'No',
  root_cause: '', name: '', qa_date: '',
  corrective_action_against_recurrence: '', signed_by: '', implementation_date: '',
  comments: '', action_completed_verified: 'No',
  category: 'NCR',
  creditor_note: '', creditor_date: '',
  verified_by: '', verified_date: '', total_cost: '', loss_status: '',
  department: '', allocated_person_sales: '', allocated_person_programming: '', allocated_person_production: '',
  credit_request: { enabled: false, status: 'Pending' },
  ncr_job_sheet: { required: false, status: 'Open' },
});

const SelectOrFree = ({ value, onChange, options, placeholder, testId }) => (
  <div className="flex gap-1">
    <select
      className="border rounded px-2 py-2 text-sm flex-1 h-10"
      value={options.includes(value) ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      data-testid={testId}
    >
      <option value="">{placeholder || '— select —'}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
    <Input
      placeholder="or type"
      value={!options.includes(value) ? (value || '') : ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-28"
    />
  </div>
);

const NCRForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = id && id !== 'new';

  const [form, setForm] = useState(blank());
  const [employees, setEmployees] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ncrNo, setNcrNo] = useState(null);
  const [showCR, setShowCR] = useState(false);
  const [showJS, setShowJS] = useState(false);
  const [showDeptMgr, setShowDeptMgr] = useState(false);
  const [deptDraft, setDeptDraft] = useState([]);
  const [docInfo, setDocInfo] = useState(null);

  useEffect(() => {
    loadLookups();
    getControlledDocumentByModule('NCR Form', { fallback: 'NCR Register', docType: 'Form' }).then(setDocInfo);
  }, []);
  useEffect(() => { if (isEdit) loadNCR(); }, [id]);

  const loadLookups = async () => {
    try {
      const [emp, sup, dep] = await Promise.all([
        api.get('/employees'),
        api.get('/suppliers'),
        api.get('/ncr/departments'),
      ]);
      setEmployees(emp.data || []);
      setSuppliers(sup.data || []);
      setDepartments(dep.data.departments || []);
    } catch (e) { console.error('lookup load failed', e); }
  };

  const loadNCR = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/ncr/${id}`);
      const d = res.data;
      // ensure nested objects exist
      d.credit_request = d.credit_request || { enabled: false, status: 'Pending' };
      d.ncr_job_sheet = d.ncr_job_sheet || { required: false, status: 'Open' };
      setForm(d);
      setNcrNo(d.ncr_no);
    } catch (e) { console.error(e); alert('Failed to load NCR'); navigate('/quality/ncr'); }
    finally { setLoading(false); }
  };

  const update = (patch) => setForm(f => {
    const next = { ...f, ...patch };
    // Auto-calculate Total Cost = Qty × Cost per Item whenever those change
    if ('qty' in patch || 'cost_per_item' in patch) {
      const q = parseFloat(next.qty);
      const c = parseFloat(next.cost_per_item);
      if (!isNaN(q) && !isNaN(c)) {
        next.total_cost = +(q * c).toFixed(2);
      }
    }
    return next;
  });
  const updateCR = (patch) => setForm(f => {
    const cr = { ...(f.credit_request || {}), ...patch };
    // Auto-calculate Total Amount = Qty × Unit Cost in the credit request block
    if ('qty' in patch || 'unit_cost' in patch) {
      const q = parseFloat(cr.qty);
      const u = parseFloat(cr.unit_cost);
      if (!isNaN(q) && !isNaN(u)) cr.total_amount = +(q * u).toFixed(2);
    }
    return { ...f, credit_request: cr };
  });
  const updateJS = (patch) => setForm(f => ({ ...f, ncr_job_sheet: { ...(f.ncr_job_sheet || {}), ...patch } }));

  const employeeNames = useMemo(
    () => Array.from(new Set(
      (employees || [])
        .filter(e => (e.status || 'Active') === 'Active')
        .map(e => (e.name || `${e.first_name || ''} ${e.last_name || ''}`).trim())
        .filter(Boolean)
    )).sort(),
    [employees],
  );
  const supplierNames = useMemo(
    () => Array.from(new Set(suppliers.map(s => s.name).filter(Boolean))).sort(),
    [suppliers],
  );

  const save = async () => {
    setSaving(true);
    try {
      // coerce numeric fields
      const payload = { ...form };
      ['qty', 'cost_per_item', 'total_cost'].forEach(k => {
        if (payload[k] === '') payload[k] = null;
        else if (payload[k] != null) payload[k] = Number(payload[k]);
      });
      if (payload.credit_request) {
        ['qty', 'unit_cost', 'total_amount'].forEach(k => {
          const v = payload.credit_request[k];
          if (v === '' || v == null) payload.credit_request[k] = null;
          else payload.credit_request[k] = Number(v);
        });
      }
      if (payload.ncr_job_sheet) {
        ['recut_qty', 'material_cost', 'labour_cost'].forEach(k => {
          const v = payload.ncr_job_sheet[k];
          if (v === '' || v == null) payload.ncr_job_sheet[k] = null;
          else payload.ncr_job_sheet[k] = Number(v);
        });
      }
      let res;
      if (isEdit) {
        res = await api.put(`/ncr/${id}`, payload);
      } else {
        res = await api.post('/ncr', payload);
      }
      setForm({ ...res.data, credit_request: res.data.credit_request || { enabled: false, status: 'Pending' }, ncr_job_sheet: res.data.ncr_job_sheet || { required: false, status: 'Open' } });
      setNcrNo(res.data.ncr_no);
      if (!isEdit) navigate(`/quality/ncr/${res.data.id}`, { replace: true });
      else alert('NCR saved');
    } catch (e) {
      console.error(e);
      alert('Failed to save: ' + (e?.response?.data?.detail || e.message));
    } finally { setSaving(false); }
  };

  // ---- print helpers
  const buildPrintHTML = async (kind /* 'ncr' | 'credit' | 'jobsheet' */) => {
    const moduleMap = { ncr: 'NCR Form', credit: 'Credit Request Form', jobsheet: 'NCR Job Sheet (Recut)' };
    const fallbackMap = { ncr: 'NCR Register', credit: 'Credit Request', jobsheet: 'NCR Job Sheet' };
    const titleMap = {
      ncr: 'Non-Conformance Report',
      credit: 'Credit Request',
      jobsheet: 'NCR Job Sheet (Recut)',
    };
    const doc = await getControlledDocumentByModule(moduleMap[kind], { fallback: fallbackMap[kind], docType: 'Form' });
    const footer = buildDocControlFooter(doc, {
      title: titleMap[kind],
    });

    const row = (label, val) =>
      `<tr><td class="lbl">${esc(label)}</td><td>${esc(val ?? '')}</td></tr>`;

    // Two-column variant: pairs (label, value, label, value) per row.
    const twoCol = (pairs) => {
      const fmt = (v) => esc(v ?? '');
      let html = '';
      for (let i = 0; i < pairs.length; i += 2) {
        const a = pairs[i] || ['', ''];
        const b = pairs[i + 1] || ['', ''];
        html += `<tr>
          <td class="lbl">${esc(a[0])}</td><td>${fmt(a[1])}</td>
          <td class="lbl">${esc(b[0])}</td><td>${fmt(b[1])}</td>
        </tr>`;
      }
      return html;
    };

    let body = '';
    if (kind === 'ncr') {
      const identifierPairs = [
        ['ULT LSR PO No', form.ult_lsr_po_no],
        ['ULT LSR Invoice No', form.ult_lsr_invoice_no],
        ['ULT LSR POSC No', form.ult_lsr_posc_no],
        ['ULT LSR POT No', form.ult_lsr_pot_no],
        ['Customer', form.customer],
        ['Supplier', form.supplier],
        ['Location', form.location],
        ['Product', form.product],
        ['Ultimate Laser Item No', form.ultimate_laser_item_no],
        ['PN Code', form.pn_code],
        ['Qty', form.qty],
        ['Return Item #', form.return_item_no],
        ['Cost per Item', form.cost_per_item != null && form.cost_per_item !== '' ? '$' + Number(form.cost_per_item).toFixed(2) : ''],
        ['Total Cost (no GST)', form.total_cost != null && form.total_cost !== '' ? '$' + Number(form.total_cost).toFixed(2) : ''],
        ['Loss Status', form.loss_status],
        ['Date Raised', formatDate(form.date_raised)],
      ];
      const peoplePairs = [
        ['Entered By', form.entered_by],
        ['Name', form.name],
        ['Signed By', form.signed_by],
        ['Verified By', form.verified_by],
        ['Quality Assurance', form.quality_assurance],
        ['Department', form.department],
        ['Allocated — Sales', form.allocated_person_sales],
        ['Allocated — Programming', form.allocated_person_programming],
        ['Allocated — Production', form.allocated_person_production],
        ['Implementation Date', formatDate(form.implementation_date)],
        ['Verified Date', formatDate(form.verified_date)],
        ['Action Completed & Verified', form.action_completed_verified],
        ['Notified By Customer', form.notified_by_customer],
        ['Supplier Notified', form.supplier_notified],
        ['Internal', form.internal],
        ['Downgrade Use', form.downgrade_use],
        ['Scrap', form.scrap],
        ['Rework', form.rework],
        ['Credit Requested', form.credit_request?.enabled ? `Yes (CR #${padCR(form.credit_request.credit_request_no)})` : 'No'],
        ['Recut Job Sheet', form.ncr_job_sheet?.required ? `Yes (#${form.ncr_no ?? ncrNo})` : 'No'],
      ];
      body = `
        <h1>${esc(titleMap.ncr)}</h1>
        <div class="meta">
          <strong>NCR #:</strong> ${esc(form.ncr_no || ncrNo || '—')} &nbsp;&nbsp;
          <strong>Date:</strong> ${esc(formatDate(form.date_raised))} &nbsp;&nbsp;
          <strong>Category:</strong> ${esc(form.category)}
        </div>
        <table class="kv two">${twoCol(identifierPairs)}</table>
        <h2>Description of Non-Conformance / Programmer Notes</h2>
        <div class="block">${esc(form.description)}</div>
        <h2>Root Cause</h2>
        <div class="block">${esc(form.root_cause)}</div>
        <h2>Corrective Action Against Recurrence</h2>
        <div class="block">${esc(form.corrective_action_against_recurrence)}</div>
        <h2>People &amp; Sign-off</h2>
        <table class="kv two">${twoCol(peoplePairs)}</table>
        ${form.comments ? `<h2>Comments</h2><div class="block">${esc(form.comments)}</div>` : ''}
      `;
    } else if (kind === 'credit') {
      const cr = form.credit_request || {};
      body = `
        <h1>${esc(titleMap.credit)}</h1>
        <div class="meta">
          <strong>Credit Request #:</strong> ${esc(padCR(cr.credit_request_no) || 'pending')} &nbsp;&nbsp;
          <strong>NCR #:</strong> ${esc(form.ncr_no || ncrNo || '—')} &nbsp;&nbsp;
          <strong>Date:</strong> ${esc(formatDate(cr.requested_date || form.date_raised))}
        </div>
        <table class="kv">
          ${row('Customer', cr.customer || form.customer)}
          ${row('Invoice #', cr.invoice_no || form.ult_lsr_invoice_no)}
          ${row('PO #', cr.po_no || form.ult_lsr_po_no)}
          ${row('Qty', cr.qty ?? form.qty)}
          ${row('Unit Cost', (cr.unit_cost ?? form.cost_per_item) != null ? '$' + Number(cr.unit_cost ?? form.cost_per_item).toFixed(2) : '')}
          ${row('Total Amount', (cr.total_amount ?? form.total_cost) != null ? '$' + Number(cr.total_amount ?? form.total_cost).toFixed(2) : '')}
          ${row('Requested By', cr.requested_by)}
          ${row('Approved By', cr.approved_by)}
          ${row('Approved Date', formatDate(cr.approved_date))}
          ${row('Status', cr.status)}
          ${row('Credit Note #', cr.credit_note_no)}
        </table>
        <h2>Reason for Credit</h2>
        <div class="block">${esc(cr.reason || form.description)}</div>
      `;
    } else if (kind === 'jobsheet') {
      const js = form.ncr_job_sheet || {};
      body = `
        <h1>${esc(titleMap.jobsheet)}</h1>
        <div class="meta">
          <strong>Job Sheet:</strong> ${esc(form.ncr_no ?? ncrNo ?? 'pending')} &nbsp;&nbsp;
          <strong>NCR #:</strong> ${esc(form.ncr_no || ncrNo || '—')} &nbsp;&nbsp;
          <strong>Target Date:</strong> ${esc(formatDate(js.target_completion_date))}
        </div>
        <table class="kv">
          ${row('Customer', form.customer)}
          ${row('Original PO #', js.original_po_no || form.ult_lsr_po_no)}
          ${row('Original Job #', js.original_job_no)}
          ${row('Recut Qty', js.recut_qty)}
          ${row('Status', js.status)}
          ${row('Material Cost', js.material_cost != null ? '$' + Number(js.material_cost).toFixed(2) : '')}
          ${row('Labour Cost', js.labour_cost != null ? '$' + Number(js.labour_cost).toFixed(2) : '')}
          ${row('Completed By', js.completed_by)}
          ${row('Completed Date', formatDate(js.completed_date))}
          ${row('Signed Off By', js.signed_off_by)}
          ${row('Signed Off Date', formatDate(js.signed_off_date))}
        </table>
        <h2>Reason for Recut</h2>
        <div class="block">${esc(js.reason || form.description)}</div>
        <h2>Recut Instructions</h2>
        <div class="block">${esc(js.instructions)}</div>
        <div class="sign-row">
          <div><strong>Production Sign-off</strong><br/><span class="sig-line"></span></div>
          <div><strong>QA Sign-off</strong><br/><span class="sig-line"></span></div>
          <div><strong>Date</strong><br/><span class="sig-line"></span></div>
        </div>
      `;
    }

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<title>${esc(titleMap[kind])} ${esc(form.ncr_no || ncrNo || '')}</title>
<style>
  ${buildPrintFooterCss()}
  /* Tighter page margins for NCR-style forms — keeps full document on one page */
  ${kind === 'ncr' ? '@page { margin: 10mm 10mm 14mm 10mm; }' : ''}
  body { color: #111; font-size: ${kind === 'ncr' ? '8.5pt' : '10pt'}; }
  h1 { font-size: ${kind === 'ncr' ? '14pt' : '16pt'}; margin: 0 0 2mm 0; }
  h2 { font-size: ${kind === 'ncr' ? '9.5pt' : '11pt'}; margin: ${kind === 'ncr' ? '3mm 0 1mm 0' : '5mm 0 1.5mm 0'}; color: #b91c1c; border-bottom: 1px solid #ddd; padding-bottom: 1mm; }
  .meta { font-size: ${kind === 'ncr' ? '9pt' : '10pt'}; color: #333; margin-bottom: ${kind === 'ncr' ? '2mm' : '4mm'}; }
  table.kv { width: 100%; border-collapse: collapse; margin: 0 0 ${kind === 'ncr' ? '1.5mm' : '3mm'} 0; }
  table.kv td { border: 1px solid #333; padding: ${kind === 'ncr' ? '1.5px 4px' : '3px 6px'}; font-size: ${kind === 'ncr' ? '8pt' : '9pt'}; vertical-align: top; }
  table.kv td.lbl { background: #f3f4f6; font-weight: bold; width: ${kind === 'ncr' ? '20%' : '32%'}; }
  table.kv.two td.lbl { width: 18%; }
  table.kv.two td:not(.lbl) { width: 32%; }
  .block { border: 1px solid #333; padding: ${kind === 'ncr' ? '2px 4px' : '4px 6px'}; min-height: ${kind === 'ncr' ? '8mm' : '12mm'}; white-space: pre-wrap; font-size: ${kind === 'ncr' ? '8.5pt' : '9.5pt'}; }
  .sign-row { display: flex; gap: 10mm; margin-top: 15mm; font-size: 9.5pt; }
  .sign-row > div { flex: 1; }
  .sig-line { display: inline-block; border-bottom: 1px solid #111; width: 100%; min-height: 8mm; }
</style></head>
<body>
${buildPrintBodyOpen(footer)}
  ${body}
${buildPrintBodyClose()}
</body></html>`;
  };

  const handlePrint = async (kind) => {
    const html = await buildPrintHTML(kind);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (_) { /* blocked */ } }, 250);
  };

  // ---- department manager
  const openDeptManager = () => {
    setDeptDraft([...departments]);
    setShowDeptMgr(true);
  };
  const saveDept = async () => {
    try {
      const res = await api.put('/ncr/departments', { departments: deptDraft });
      setDepartments(res.data.departments || []);
      setShowDeptMgr(false);
    } catch (e) { alert('Failed to save departments'); }
  };

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="ncr-form-page">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <button
            onClick={() => navigate('/quality/ncr')}
            className="text-sm text-blue-600 hover:underline mb-1 inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Register
          </button>
          <h1 className="text-3xl font-bold text-gray-900">
            {isEdit ? `NCR #${ncrNo ?? '—'}` : 'New NCR'}
          </h1>
          <p className="text-gray-600 text-sm">
            Non-Conformance Report{' '}
            <span className="ml-1 inline-block text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-mono">
              {docInfo?.form_no || '—'}
            </span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => handlePrint('ncr')} disabled={!isEdit} data-testid="ncr-print-form">
            <Printer className="w-4 h-4 mr-2" /> Print NCR
          </Button>
          <Button onClick={save} disabled={saving} data-testid="ncr-save">
            <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Identifiers */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Identifiers</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label>ULT LSR PO No</Label><Input value={form.ult_lsr_po_no || ''} onChange={e => update({ ult_lsr_po_no: e.target.value })} data-testid="f-po" /></div>
          <div><Label>ULT LSR Invoice No</Label><Input value={form.ult_lsr_invoice_no || ''} onChange={e => update({ ult_lsr_invoice_no: e.target.value })} data-testid="f-inv" /></div>
          <div><Label>ULT LSR POSC No</Label><Input value={form.ult_lsr_posc_no || ''} onChange={e => update({ ult_lsr_posc_no: e.target.value })} /></div>
          <div><Label>ULT LSR POT No</Label><Input value={form.ult_lsr_pot_no || ''} onChange={e => update({ ult_lsr_pot_no: e.target.value })} /></div>
          <div><Label>Qty</Label><Input type="number" value={form.qty ?? ''} onChange={e => update({ qty: e.target.value })} data-testid="f-qty" /></div>
          <div><Label>Date Raised</Label><Input type="date" value={form.date_raised || ''} onChange={e => update({ date_raised: e.target.value })} data-testid="f-date" /></div>
          <div><Label>Return Item #</Label><Input value={form.return_item_no || ''} onChange={e => update({ return_item_no: e.target.value })} /></div>
          <div>
            <Label>Category</Label>
            <select className="border rounded w-full px-3 py-2 text-sm h-10" value={form.category || 'NCR'} onChange={e => update({ category: e.target.value })} data-testid="f-category">
              <option value="NCR">NCR</option>
              <option value="Concern">Concern</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Customer / Supplier / Product */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Customer / Supplier / Product</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="md:col-span-2"><Label>Customer</Label><Input value={form.customer || ''} onChange={e => update({ customer: e.target.value })} data-testid="f-customer" /></div>
          <div><Label>Location</Label><Input value={form.location || ''} onChange={e => update({ location: e.target.value })} /></div>
          <div><Label>Supplier (dropdown)</Label>
            <SelectOrFree value={form.supplier || ''} onChange={(v) => update({ supplier: v })} options={supplierNames} placeholder="— select supplier —" testId="f-supplier" />
          </div>
          <div><Label>Ultimate Laser Item No</Label><Input value={form.ultimate_laser_item_no || ''} onChange={e => update({ ultimate_laser_item_no: e.target.value })} /></div>
          <div><Label>PN Code</Label><Input value={form.pn_code || ''} onChange={e => update({ pn_code: e.target.value })} /></div>
          <div className="md:col-span-3"><Label>Product</Label><Input value={form.product || ''} onChange={e => update({ product: e.target.value })} /></div>
        </CardContent>
      </Card>

      {/* Description + Root cause + Corrective */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Description &amp; Root Cause</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><Label>Description of Non-Conformance / Programmer Notes</Label>
            <Textarea rows={5} value={form.description || ''} onChange={e => update({ description: e.target.value })} data-testid="f-description" />
          </div>
          <div><Label>Root Cause</Label>
            <Textarea rows={5} value={form.root_cause || ''} onChange={e => update({ root_cause: e.target.value })} data-testid="f-root-cause" />
          </div>
          <div className="md:col-span-2"><Label>Corrective Action Against Recurrence</Label>
            <Textarea rows={4} value={form.corrective_action_against_recurrence || ''} onChange={e => update({ corrective_action_against_recurrence: e.target.value })} />
          </div>
          <div className="md:col-span-2"><Label>Comments</Label>
            <Textarea rows={3} value={form.comments || ''} onChange={e => update({ comments: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      {/* People */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">People &amp; Sign-off</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><Label>Entered By</Label>
            <SelectOrFree value={form.entered_by || ''} onChange={(v) => update({ entered_by: v })} options={employeeNames} testId="f-entered-by" />
          </div>
          <div><Label>Name (Raised By)</Label>
            <SelectOrFree value={form.name || ''} onChange={(v) => update({ name: v })} options={employeeNames} testId="f-name" />
          </div>
          <div><Label>Quality Assurance</Label>
            <SelectOrFree value={form.quality_assurance || ''} onChange={(v) => update({ quality_assurance: v })} options={employeeNames} testId="f-qa" />
          </div>
          <div><Label>Signed By</Label>
            <SelectOrFree value={form.signed_by || ''} onChange={(v) => update({ signed_by: v })} options={employeeNames} testId="f-signed-by" />
          </div>
          <div><Label>Verified By</Label>
            <SelectOrFree value={form.verified_by || ''} onChange={(v) => update({ verified_by: v })} options={employeeNames} testId="f-verified-by" />
          </div>
          <div><Label>Verified Date</Label><Input type="date" value={form.verified_date || ''} onChange={e => update({ verified_date: e.target.value })} /></div>
          <div><Label>Implementation Date</Label><Input type="date" value={form.implementation_date || ''} onChange={e => update({ implementation_date: e.target.value })} /></div>
          <div>
            <Label>Department</Label>
            <div className="flex gap-1">
              <select className="border rounded px-2 py-2 text-sm flex-1 h-10" value={form.department || ''} onChange={e => update({ department: e.target.value })} data-testid="f-department">
                <option value="">— select —</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <Button size="sm" variant="outline" onClick={openDeptManager} title="Manage departments" data-testid="f-dept-manage"><Plus className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
          <div><Label>Action Completed &amp; Verified</Label>
            <select className="border rounded w-full px-3 py-2 text-sm h-10" value={form.action_completed_verified || 'No'} onChange={e => update({ action_completed_verified: e.target.value })} data-testid="f-verified">
              {YN.map(v => <option key={v} value={v}>{v || 'select'}</option>)}
              <option value="Pending">Pending</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Allocated persons */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Allocated Persons</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><Label>Sales</Label>
            <SelectOrFree value={form.allocated_person_sales || ''} onChange={(v) => update({ allocated_person_sales: v })} options={employeeNames} />
          </div>
          <div><Label>Programming</Label>
            <SelectOrFree value={form.allocated_person_programming || ''} onChange={(v) => update({ allocated_person_programming: v })} options={employeeNames} />
          </div>
          <div><Label>Production / Packing / Scheduling / Dispatch</Label>
            <SelectOrFree value={form.allocated_person_production || ''} onChange={(v) => update({ allocated_person_production: v })} options={employeeNames} />
          </div>
        </CardContent>
      </Card>

      {/* Cost & flags */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Cost &amp; Outcome Flags</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label>Cost per Item (no GST)</Label><Input type="number" step="0.01" value={form.cost_per_item ?? ''} onChange={e => update({ cost_per_item: e.target.value })} data-testid="f-cost-per-item" /></div>
          <div>
            <Label>Total Cost of NCR (no GST) <span className="text-[10px] text-gray-400 font-normal">auto = Qty × Cost</span></Label>
            <Input type="number" step="0.01" value={form.total_cost ?? ''} onChange={e => update({ total_cost: e.target.value })} data-testid="f-total-cost" />
          </div>
          <div><Label>Loss Status</Label>
            <select className="border rounded w-full px-3 py-2 text-sm h-10" value={form.loss_status || ''} onChange={e => update({ loss_status: e.target.value })}>
              <option value="">—</option>
              <option value="No Loss">No Loss</option>
              <option value="Loss">Loss</option>
            </select>
          </div>
          <div><Label>Notified by Customer</Label>
            <select className="border rounded w-full px-3 py-2 text-sm h-10" value={form.notified_by_customer || 'No'} onChange={e => update({ notified_by_customer: e.target.value })}>
              {YN.map(v => <option key={v} value={v}>{v || 'select'}</option>)}
            </select>
          </div>
          <div><Label>Supplier Notified</Label>
            <select className="border rounded w-full px-3 py-2 text-sm h-10" value={form.supplier_notified || 'No'} onChange={e => update({ supplier_notified: e.target.value })}>
              {YN.map(v => <option key={v} value={v}>{v || 'select'}</option>)}
            </select>
          </div>
          <div><Label>Internal</Label>
            <select className="border rounded w-full px-3 py-2 text-sm h-10" value={form.internal || 'Yes'} onChange={e => update({ internal: e.target.value })}>
              {YN.map(v => <option key={v} value={v}>{v || 'select'}</option>)}
            </select>
          </div>
          <div><Label>Downgrade Use</Label>
            <select className="border rounded w-full px-3 py-2 text-sm h-10" value={form.downgrade_use || 'No'} onChange={e => update({ downgrade_use: e.target.value })}>
              {YN.map(v => <option key={v} value={v}>{v || 'select'}</option>)}
            </select>
          </div>
          <div><Label>Scrap</Label>
            <select className="border rounded w-full px-3 py-2 text-sm h-10" value={form.scrap || 'No'} onChange={e => update({ scrap: e.target.value })}>
              {YN.map(v => <option key={v} value={v}>{v || 'select'}</option>)}
            </select>
          </div>
          <div><Label>Rework</Label>
            <select className="border rounded w-full px-3 py-2 text-sm h-10" value={form.rework || 'No'} onChange={e => update({ rework: e.target.value })}>
              {YN.map(v => <option key={v} value={v}>{v || 'select'}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Credit Request + NCR Job Sheet */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Credit Request &amp; Recut</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-6 items-center">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={!!form.credit_request?.enabled}
                onChange={(e) => updateCR({ enabled: e.target.checked })}
                data-testid="f-credit-toggle" />
              <span className="font-medium">Credit Requested</span>
              {form.credit_request?.credit_request_no && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                  CR #{padCR(form.credit_request.credit_request_no)}
                </span>
              )}
            </label>
            {form.credit_request?.enabled && (
              <Button size="sm" variant="outline" onClick={() => setShowCR(true)} data-testid="f-credit-edit">
                <FileText className="w-4 h-4 mr-1" /> Edit Credit Request
              </Button>
            )}
            {form.credit_request?.enabled && isEdit && (
              <Button size="sm" variant="outline" onClick={() => handlePrint('credit')} data-testid="f-credit-print">
                <Printer className="w-4 h-4 mr-1" /> Print Credit Request
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-6 items-center pt-2 border-t">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={!!form.ncr_job_sheet?.required}
                onChange={(e) => updateJS({ required: e.target.checked })}
                data-testid="f-recut-toggle" />
              <span className="font-medium">Recut Required → NCR Job Sheet</span>
              {form.ncr_job_sheet?.required && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                  Job Sheet #{form.ncr_no ?? ncrNo ?? '— (auto on save)'}
                </span>
              )}
            </label>
            {form.ncr_job_sheet?.required && (
              <Button size="sm" variant="outline" onClick={() => setShowJS(true)} data-testid="f-recut-edit">
                <Wrench className="w-4 h-4 mr-1" /> Edit NCR Job Sheet
              </Button>
            )}
            {form.ncr_job_sheet?.required && isEdit && (
              <Button size="sm" variant="outline" onClick={() => handlePrint('jobsheet')} data-testid="f-recut-print">
                <Printer className="w-4 h-4 mr-1" /> Print NCR Job Sheet
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Credit Request modal */}
      {showCR && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="cr-modal">
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <span>Credit Request {form.credit_request?.credit_request_no ? `#${padCR(form.credit_request.credit_request_no)}` : '(new — will be #'+padCR(1)+' on save if first)'}</span>
                <Button variant="ghost" size="sm" onClick={() => setShowCR(false)}><XIcon className="w-4 h-4" /></Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Customer</Label><Input value={form.credit_request?.customer || form.customer || ''} onChange={e => updateCR({ customer: e.target.value })} /></div>
              <div><Label>Invoice #</Label><Input value={form.credit_request?.invoice_no || form.ult_lsr_invoice_no || ''} onChange={e => updateCR({ invoice_no: e.target.value })} /></div>
              <div><Label>PO #</Label><Input value={form.credit_request?.po_no || form.ult_lsr_po_no || ''} onChange={e => updateCR({ po_no: e.target.value })} /></div>
              <div><Label>Qty</Label><Input type="number" value={form.credit_request?.qty ?? ''} onChange={e => updateCR({ qty: e.target.value })} /></div>
              <div><Label>Unit Cost</Label><Input type="number" step="0.01" value={form.credit_request?.unit_cost ?? ''} onChange={e => updateCR({ unit_cost: e.target.value })} /></div>
              <div><Label>Total Amount</Label><Input type="number" step="0.01" value={form.credit_request?.total_amount ?? ''} onChange={e => updateCR({ total_amount: e.target.value })} data-testid="cr-total" /></div>
              <div><Label>Status</Label>
                <select className="border rounded w-full px-3 py-2 text-sm h-10" value={form.credit_request?.status || 'Pending'} onChange={e => updateCR({ status: e.target.value })}>
                  <option>Pending</option><option>Approved</option><option>Rejected</option><option>Issued</option>
                </select>
              </div>
              <div className="col-span-2"><Label>Reason</Label><Textarea rows={3} value={form.credit_request?.reason || form.description || ''} onChange={e => updateCR({ reason: e.target.value })} data-testid="cr-reason" /></div>
              <div><Label>Requested By</Label>
                <SelectOrFree value={form.credit_request?.requested_by || ''} onChange={(v) => updateCR({ requested_by: v })} options={employeeNames} />
              </div>
              <div><Label>Requested Date</Label><Input type="date" value={form.credit_request?.requested_date || ''} onChange={e => updateCR({ requested_date: e.target.value })} /></div>
              <div><Label>Approved By</Label>
                <SelectOrFree value={form.credit_request?.approved_by || ''} onChange={(v) => updateCR({ approved_by: v })} options={employeeNames} />
              </div>
              <div><Label>Approved Date</Label><Input type="date" value={form.credit_request?.approved_date || ''} onChange={e => updateCR({ approved_date: e.target.value })} /></div>
              <div className="col-span-2"><Label>Credit Note #</Label><Input value={form.credit_request?.credit_note_no || ''} onChange={e => updateCR({ credit_note_no: e.target.value })} /></div>

              <div className="col-span-2 flex gap-2 pt-2">
                <Button onClick={() => setShowCR(false)} className="flex-1" data-testid="cr-done">Done</Button>
                <Button variant="outline" onClick={() => setShowCR(false)}>Cancel</Button>
              </div>
              <div className="col-span-2 text-xs text-gray-500">
                Remember to click <strong>Save</strong> on the NCR after closing this dialog to persist changes.
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* NCR Job Sheet modal */}
      {showJS && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="js-modal">
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <span>NCR Job Sheet — Recut</span>
                <Button variant="ghost" size="sm" onClick={() => setShowJS(false)}><XIcon className="w-4 h-4" /></Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div>
                <Label>Job Sheet #</Label>
                <Input
                  value={form.ncr_no ?? ncrNo ?? '(auto on save)'}
                  readOnly
                  disabled
                  className="bg-gray-50 font-mono"
                  data-testid="js-no"
                />
                <p className="text-[10px] text-gray-500 mt-0.5">Mirrors the NCR number.</p>
              </div>
              <div><Label>Status</Label>
                <select className="border rounded w-full px-3 py-2 text-sm h-10" value={form.ncr_job_sheet?.status || 'Open'} onChange={e => updateJS({ status: e.target.value })}>
                  <option>Open</option><option>In Progress</option><option>Completed</option><option>Signed Off</option>
                </select>
              </div>
              <div><Label>Original PO #</Label><Input value={form.ncr_job_sheet?.original_po_no || form.ult_lsr_po_no || ''} onChange={e => updateJS({ original_po_no: e.target.value })} /></div>
              <div><Label>Original Job #</Label><Input value={form.ncr_job_sheet?.original_job_no || ''} onChange={e => updateJS({ original_job_no: e.target.value })} /></div>
              <div><Label>Recut Qty</Label><Input type="number" value={form.ncr_job_sheet?.recut_qty ?? ''} onChange={e => updateJS({ recut_qty: e.target.value })} data-testid="js-qty" /></div>
              <div><Label>Target Completion Date</Label><Input type="date" value={form.ncr_job_sheet?.target_completion_date || ''} onChange={e => updateJS({ target_completion_date: e.target.value })} /></div>
              <div className="col-span-2"><Label>Reason for Recut</Label><Textarea rows={2} value={form.ncr_job_sheet?.reason || form.description || ''} onChange={e => updateJS({ reason: e.target.value })} /></div>
              <div className="col-span-2"><Label>Instructions</Label><Textarea rows={3} value={form.ncr_job_sheet?.instructions || ''} onChange={e => updateJS({ instructions: e.target.value })} data-testid="js-instructions" /></div>
              <div><Label>Material Cost</Label><Input type="number" step="0.01" value={form.ncr_job_sheet?.material_cost ?? ''} onChange={e => updateJS({ material_cost: e.target.value })} /></div>
              <div><Label>Labour Cost</Label><Input type="number" step="0.01" value={form.ncr_job_sheet?.labour_cost ?? ''} onChange={e => updateJS({ labour_cost: e.target.value })} /></div>
              <div><Label>Completed By</Label>
                <SelectOrFree value={form.ncr_job_sheet?.completed_by || ''} onChange={(v) => updateJS({ completed_by: v })} options={employeeNames} />
              </div>
              <div><Label>Completed Date</Label><Input type="date" value={form.ncr_job_sheet?.completed_date || ''} onChange={e => updateJS({ completed_date: e.target.value })} /></div>
              <div><Label>Signed Off By</Label>
                <SelectOrFree value={form.ncr_job_sheet?.signed_off_by || ''} onChange={(v) => updateJS({ signed_off_by: v })} options={employeeNames} />
              </div>
              <div><Label>Signed Off Date</Label><Input type="date" value={form.ncr_job_sheet?.signed_off_date || ''} onChange={e => updateJS({ signed_off_date: e.target.value })} /></div>

              <div className="col-span-2 flex gap-2 pt-2">
                <Button onClick={() => setShowJS(false)} className="flex-1" data-testid="js-done">Done</Button>
                <Button variant="outline" onClick={() => setShowJS(false)}>Cancel</Button>
              </div>
              <div className="col-span-2 text-xs text-gray-500">
                Remember to click <strong>Save</strong> on the NCR after closing this dialog to persist changes.
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Department manager modal */}
      {showDeptMgr && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto" data-testid="dept-modal">
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <span>Manage Departments</span>
                <Button variant="ghost" size="sm" onClick={() => setShowDeptMgr(false)}><XIcon className="w-4 h-4" /></Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {deptDraft.map((d, i) => (
                <div key={i} className="flex gap-2 items-center" data-testid={`dept-row-${i}`}>
                  <Input value={d} onChange={e => {
                    const nx = [...deptDraft]; nx[i] = e.target.value; setDeptDraft(nx);
                  }} />
                  <button onClick={() => setDeptDraft(deptDraft.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <Button variant="outline" onClick={() => setDeptDraft([...deptDraft, ''])} data-testid="dept-add">
                <Plus className="w-4 h-4 mr-1" /> Add Department
              </Button>
              <div className="flex gap-2 pt-2">
                <Button onClick={saveDept} className="flex-1" data-testid="dept-save"><Save className="w-4 h-4 mr-2" /> Save</Button>
                <Button variant="outline" onClick={() => setShowDeptMgr(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default NCRForm;
