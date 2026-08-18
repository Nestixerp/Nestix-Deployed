import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { Save, ArrowLeft, Printer } from 'lucide-react';
import BodyDiagram, { INJURY_CODES, renderBodyDiagramHtml } from '../components/BodyDiagram';
import {
  buildDocControlFooter,
  buildPrintFooterCss,
  buildPrintBodyOpen,
  buildPrintBodyClose,
  getControlledDocumentByModule,
} from '../utils/documentControl';

const emptyForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  surname: '', given_name: '', sex: '', worker_address: '',
  company_name: 'ULTIMATE Laser Pty Ltd.',
  company_address: '36-40 Micro Circuit, Dandenong, Vic 3175',
  date_of_event: '', time_of_event: '',
  activity_area: '',
  injury_description: '',
  body_markers: [],
  cause_of_injury: '',
  treatment_given: '',
  first_aid_person: '',
  referral_treatment: '',
  ceased_work: '',
  date_completed: '', time_completed: '', completed_by: '',
});

export default function InjuryRegisterForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const printOnLoad = searchParams.get('print') === '1';

  const isNew = !id || id === 'new';
  const [form, setForm] = useState(emptyForm());
  const [recordNumberLabel, setRecordNumberLabel] = useState('—');
  const [recordIdState, setRecordIdState] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (isNew) {
        try {
          const r = await api.get('/injury-register/next-number');
          if (alive) setRecordNumberLabel(r.data?.next_number_label || '—');
        } catch { /* non-fatal */ }
        return;
      }
      setLoading(true);
      try {
        const r = await api.get(`/injury-register/${id}`);
        if (!alive) return;
        const data = r.data || {};
        setForm({ ...emptyForm(), ...data });
        setRecordNumberLabel(data.record_number_label || '—');
        setRecordIdState(data.id);
      } catch {
        toast.error('Failed to load record');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, isNew]);

  const update = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    if (!form.surname.trim() && !form.given_name.trim()) {
      toast.error('At least a Surname or Given Name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form };
      let saved;
      if (isNew && !recordIdState) {
        saved = (await api.post('/injury-register', payload)).data;
        setRecordIdState(saved.id);
        setRecordNumberLabel(saved.record_number_label);
        toast.success(`Record ${saved.record_number_label} created`);
        navigate(`/safety/injury-register/${saved.id}`, { replace: true });
      } else {
        saved = (await api.put(`/injury-register/${recordIdState || id}`, payload)).data;
        toast.success('Record updated');
      }
    } catch (e) {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = async () => {
    try {
      const doc = await getControlledDocumentByModule('Injury Report Form', { fallback: 'Injury Register', docType: 'Form' });
      const footer = buildDocControlFooter(doc, {
        title: 'Register of Injury', owner: 'Safety Manager',
      });
      const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[c]);
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Injury Record ${esc(recordNumberLabel)}</title>
<style>
  ${buildPrintFooterCss()}
  /* Tighten page margins so the whole form fits on one A4 page. */
  @page { size: A4 portrait; margin: 8mm 9mm 8mm 9mm; }
  body { font-family: Calibri, Arial, sans-serif; color: #000; font-size: 9pt; }
  h1 { text-align: center; font-size: 13pt; color: #c00; text-decoration: underline; margin: 0 0 4px 0; }
  .row { display: flex; gap: 0; border: 1px solid #000; }
  .row + .row { border-top: 0; }
  .cell { flex: 1; padding: 2px 5px; border-right: 1px solid #000; font-size: 9pt; }
  .cell:last-child { border-right: 0; }
  .cell .lbl { font-size: 7.5pt; color: #475569; font-weight: 600; line-height: 1.1; }
  .cell .val { min-height: 12px; font-size: 9pt; line-height: 1.2; }
  .section-title { font-weight: 700; margin: 4px 0 1px 0; text-transform: uppercase; font-size: 9pt; }
  .full { width: 100%; box-sizing: border-box; }
  .desc { border: 1px solid #000; padding: 3px 5px; min-height: 28px; white-space: pre-wrap; font-size: 9pt; line-height: 1.25; }
  /* Tighter footer so the page-flow table doesn't reserve too much space. */
  .dc-print-footer { font-size: 7.5pt !important; margin-top: 2mm !important; padding-top: 1.5mm !important; }
</style></head><body>${buildPrintBodyOpen(footer)}
  <h1>REGISTER OF INJURY</h1>
  <div class="row">
    <div class="cell"><div class="lbl">Date</div><div class="val">${esc(form.date)}</div></div>
    <div class="cell"><div class="lbl">Record Number</div><div class="val" style="color:#c00;font-weight:700;">${esc(recordNumberLabel)}</div></div>
  </div>

  <div class="section-title">Injured Worker / Worker Involved</div>
  <div class="row">
    <div class="cell"><div class="lbl">Surname</div><div class="val">${esc(form.surname)}</div></div>
    <div class="cell"><div class="lbl">Given Name</div><div class="val">${esc(form.given_name)}</div></div>
    <div class="cell"><div class="lbl">Sex</div><div class="val">${esc(form.sex)}</div></div>
  </div>
  <div class="row"><div class="cell"><div class="lbl">Address</div><div class="val">${esc(form.worker_address)}</div></div></div>

  <div class="section-title">Employer</div>
  <div class="row"><div class="cell"><div class="lbl">Company Name</div><div class="val">${esc(form.company_name)}</div></div></div>
  <div class="row"><div class="cell"><div class="lbl">Address</div><div class="val">${esc(form.company_address)}</div></div></div>

  <div class="section-title">Accident / Incident Details</div>
  <div class="row">
    <div class="cell"><div class="lbl">Date of Event</div><div class="val">${esc(form.date_of_event)}</div></div>
    <div class="cell"><div class="lbl">Time of Event</div><div class="val">${esc(form.time_of_event)}</div></div>
  </div>
  <div class="row"><div class="cell"><div class="lbl">Activity And Area in Which the Person Was Engaged at The Time</div><div class="val">${esc(form.activity_area)}</div></div></div>

  <div class="section-title">Type of injury and part of the body injured / nature of incident</div>
  <div style="display:flex;gap:8px;align-items:stretch;">
    <div class="desc" style="flex:1;min-height:120px;">${esc(form.injury_description)}</div>
    <div>${renderBodyDiagramHtml(form.body_markers || [])}</div>
  </div>

  <div class="section-title">Cause of Injury</div>
  <div class="desc">${esc(form.cause_of_injury)}</div>

  <div class="section-title">Treatment Given</div>
  <div class="desc">${esc(form.treatment_given)}</div>

  <div class="row" style="margin-top:4px;">
    <div class="cell"><div class="lbl">Name of Person Administering First Aid</div><div class="val">${esc(form.first_aid_person)}</div></div>
    <div class="cell"><div class="lbl">Any Referral for Further Treatment</div><div class="val">${esc(form.referral_treatment)}</div></div>
    <div class="cell"><div class="lbl">Did the Person Cease Work?</div><div class="val">${esc(form.ceased_work)}</div></div>
  </div>

  <div class="row">
    <div class="cell"><div class="lbl">Date Form was Completed</div><div class="val">${esc(form.date_completed)}</div></div>
    <div class="cell"><div class="lbl">Time</div><div class="val">${esc(form.time_completed)}</div></div>
    <div class="cell"><div class="lbl">Person Completing this Form</div><div class="val">${esc(form.completed_by)}</div></div>
  </div>

  ${buildPrintBodyClose()}
</body></html>`;
      const w = window.open('', '_blank', 'width=1100,height=1400');
      if (!w) { toast.error('Pop-up blocked — please allow pop-ups'); return; }
      w.document.write(html);
      w.document.close();
      setTimeout(() => { w.focus(); w.print(); }, 400);
    } catch (e) {
      toast.error('Print failed');
    }
  };

  // Auto-trigger print if ?print=1 and record already loaded
  useEffect(() => {
    if (printOnLoad && !loading && recordIdState) {
      handlePrint();
    }
  }, [printOnLoad, loading, recordIdState]); // eslint-disable-line

  if (loading) return <div className="py-10 text-center text-slate-500">Loading...</div>;

  return (
    <div className="space-y-6 p-1" data-testid="injury-form-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate('/safety/injury-register')} data-testid="back-btn">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Register of Injury — <span className="text-red-700 font-mono">{recordNumberLabel}</span>
            </h1>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint} data-testid="print-btn">
            <Printer className="h-4 w-4 mr-2" /> Print
          </Button>
          <Button onClick={save} disabled={saving} className="bg-slate-900" data-testid="save-btn">
            <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : (isNew && !recordIdState ? 'Create Record' : 'Save')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Header</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => update({ date: e.target.value })} data-testid="field-date" />
            </div>
            <div>
              <Label>Record Number (auto)</Label>
              <Input value={recordNumberLabel} readOnly className="font-mono font-bold text-red-700" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Injured Worker / Worker Involved</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Surname</Label>
              <Input value={form.surname} onChange={(e) => update({ surname: e.target.value })} data-testid="field-surname" />
            </div>
            <div>
              <Label>Given Name</Label>
              <Input value={form.given_name} onChange={(e) => update({ given_name: e.target.value })} data-testid="field-given-name" />
            </div>
            <div>
              <Label>Sex</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                value={form.sex} onChange={(e) => update({ sex: e.target.value })} data-testid="field-sex">
                <option value="">—</option>
                <option>Male</option>
                <option>Female</option>
                <option>Other / Prefer not to say</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <Label>Address</Label>
              <Input value={form.worker_address} onChange={(e) => update({ worker_address: e.target.value })} data-testid="field-worker-address" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Employer</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Company Name</Label>
              <Input value={form.company_name} onChange={(e) => update({ company_name: e.target.value })} />
            </div>
            <div>
              <Label>Address</Label>
              <Input value={form.company_address} onChange={(e) => update({ company_address: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Accident / Incident Details</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Date of Event</Label>
              <Input type="date" value={form.date_of_event} onChange={(e) => update({ date_of_event: e.target.value })} data-testid="field-event-date" />
            </div>
            <div>
              <Label>Time of Event</Label>
              <Input type="time" value={form.time_of_event} onChange={(e) => update({ time_of_event: e.target.value })} data-testid="field-event-time" />
            </div>
            <div className="md:col-span-2">
              <Label>Activity And Area in Which the Person Was Engaged at The Time</Label>
              <Input value={form.activity_area} onChange={(e) => update({ activity_area: e.target.value })} data-testid="field-activity" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Type of Injury &amp; Part of Body Injured</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <Label>Description / Nature of incident</Label>
              <Textarea rows={4} value={form.injury_description} onChange={(e) => update({ injury_description: e.target.value })} data-testid="field-injury-desc" />
            </div>
            <Label>Mark on Body Diagram (click to place markers)</Label>
            <BodyDiagram value={form.body_markers || []} onChange={(markers) => update({ body_markers: markers })} />
            <p className="text-xs text-slate-500">
              Pick an injury code on the left, then click anywhere on the front or back body silhouette to mark the
              location. Click &ldquo;×&rdquo; on a marker in the list to remove it.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Cause &amp; Treatment</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Cause of Injury</Label>
              <Textarea rows={2} value={form.cause_of_injury} onChange={(e) => update({ cause_of_injury: e.target.value })} data-testid="field-cause" />
            </div>
            <div className="md:col-span-2">
              <Label>Treatment Given</Label>
              <Textarea rows={2} value={form.treatment_given} onChange={(e) => update({ treatment_given: e.target.value })} data-testid="field-treatment" />
            </div>
            <div>
              <Label>Name of Person Administering First Aid</Label>
              <Input value={form.first_aid_person} onChange={(e) => update({ first_aid_person: e.target.value })} data-testid="field-first-aid" />
            </div>
            <div>
              <Label>Any Referral for Further Treatment</Label>
              <Input value={form.referral_treatment} onChange={(e) => update({ referral_treatment: e.target.value })} />
            </div>
            <div>
              <Label>Did the Person Cease Work?</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                value={form.ceased_work} onChange={(e) => update({ ceased_work: e.target.value })}>
                <option value="">—</option>
                <option>No</option>
                <option>Yes — same day</option>
                <option>Yes — partial day</option>
                <option>Yes — multiple days</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Sign-off</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Date Form was Completed</Label>
              <Input type="date" value={form.date_completed} onChange={(e) => update({ date_completed: e.target.value })} />
            </div>
            <div>
              <Label>Time</Label>
              <Input type="time" value={form.time_completed} onChange={(e) => update({ time_completed: e.target.value })} />
            </div>
            <div>
              <Label>Person Completing this Form</Label>
              <Input value={form.completed_by} onChange={(e) => update({ completed_by: e.target.value })} data-testid="field-completed-by" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reference code key for users */}
      <Card>
        <CardHeader><CardTitle className="text-base">Injury Code Reference</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
            {INJURY_CODES.map((c) => (
              <div key={c.code} className="flex items-center gap-2">
                <span className="inline-block w-7 text-center font-bold text-red-600">{c.code}</span>
                <span className="capitalize text-slate-700">{c.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
