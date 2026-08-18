import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { ArrowLeft, Printer, RotateCcw, Send, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { employmentApplication } from '../forms/employmentApplication';
import {
  buildDocControlFooter, getControlledDocumentByModule, invalidateDocControlCache
} from '../utils/documentControl';

const STORAGE_KEY = 'ul-employment-application-draft';

const blankRepeating = () => ({ name: '', address: '', from_date: '', to_date: '', graduated: '', degree: '' });
const blankRef = () => ({ name: '', relationship: '', phone: '', company: '', address: '' });
const blankJob = () => ({
  company: '', phone: '', address: '', supervisor: '', title: '',
  start_salary: '', end_salary: '', responsibilities: '',
  from_date: '', to_date: '', reason: '', may_contact: '',
});

const loadDraft = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; } catch { return null; }
};
const saveDraft = (data) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
};

const Field = ({ label, value, onChange, type = 'text', ...rest }) => (
  <div>
    <Label className="text-xs text-slate-600">{label}</Label>
    <Input type={type} value={value || ''} onChange={(e) => onChange(e.target.value)} {...rest} />
  </div>
);

const YN = ({ label, value, onChange }) => (
  <div>
    <Label className="text-xs text-slate-600">{label}</Label>
    <div className="flex gap-3 mt-1">
      {['Yes', 'No'].map((opt) => (
        <label key={opt} className="flex items-center gap-1 text-sm cursor-pointer">
          <input type="radio" checked={value === opt} onChange={() => onChange(opt)} /> {opt}
        </label>
      ))}
    </div>
  </div>
);

const Section = ({ title, children }) => (
  <Card className="p-4 mb-3">
    <h3 className="font-semibold text-blue-900 border-b pb-1 mb-3">{title}</h3>
    {children}
  </Card>
);

const EmploymentApplicationForm = ({ publicMode = false }) => {
  const navigate = useNavigate();
  const [v, setV] = useState(() => loadDraft() || {
    education: [blankRepeating(), blankRepeating(), blankRepeating()],
    references: [blankRef(), blankRef(), blankRef()],
    previous_employment: [blankJob(), blankJob(), blankJob()],
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  const set = (key, val) => {
    const next = { ...v, [key]: val };
    setV(next); saveDraft(next);
  };
  const setNested = (key, idx, subkey, val) => {
    const arr = [...(v[key] || [])];
    arr[idx] = { ...arr[idx], [subkey]: val };
    const next = { ...v, [key]: arr };
    setV(next); saveDraft(next);
  };

  const handlePrint = async () => {
    invalidateDocControlCache();
    const doc = await getControlledDocumentByModule('Employment Application Form', { fallback: 'Employment Application', docType: 'Form' });
    const footer = buildDocControlFooter(doc, {
      title: 'Employment Application', owner: 'Quality Manager',
    });
    const w = window.open('', '_blank', 'width=1100,height=1400');
    if (!w) { toast.error('Pop-up blocked'); return; }
    w.document.write(employmentApplication.render(footer, v));
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };

  const handleSubmit = async () => {
    if (!v.last_name || !v.first_name) {
      toast.error('Please enter your name'); return;
    }
    setSubmitting(true);
    try {
      const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
      const res = await axios.post(`${API}/employment-applications/public/submit`, v);
      setSubmitted({ submission_no: res.data.submission_no });
      localStorage.removeItem(STORAGE_KEY);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    if (!window.confirm('Clear all entered data?')) return;
    const blank = {
      education: [blankRepeating(), blankRepeating(), blankRepeating()],
      references: [blankRef(), blankRef(), blankRef()],
      previous_employment: [blankJob(), blankJob(), blankJob()],
    };
    setV(blank); saveDraft(blank);
    toast.success('Form cleared');
  };

  const Section_DELETED_SHOULD_NOT_EXIST = null; // placeholder for old nested component
  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <Card className="max-w-xl w-full p-8 text-center">
          <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
          <h2 className="text-2xl font-bold mb-2">Application Submitted</h2>
          <p className="text-slate-700 mb-3">Thank you for your application. Our HR team will be in touch.</p>
          <div className="text-xs text-slate-500">Reference: <strong className="font-mono">{submitted.submission_no}</strong></div>
        </Card>
      </div>
    );
  }

  return (
    <div className={`p-6 max-w-5xl mx-auto ${publicMode ? 'bg-slate-50 min-h-screen' : ''}`} data-testid="employment-app-form">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          {!publicMode && (
            <Button variant="outline" onClick={() => navigate('/quality/forms')}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Forms
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset}><RotateCcw className="w-4 h-4 mr-1" /> Clear</Button>
          {publicMode ? (
            <Button onClick={handleSubmit} disabled={submitting} className="bg-blue-700" data-testid="submit-application-btn">
              <Send className="w-4 h-4 mr-1" /> {submitting ? 'Submitting…' : 'Submit Application'}
            </Button>
          ) : (
            <Button onClick={handlePrint} data-testid="print-filled-btn">
              <Printer className="w-4 h-4 mr-1" /> Print Form
            </Button>
          )}
        </div>
      </div>

      <h1 className="text-2xl font-bold mb-1">Employment Application{publicMode ? '' : ''}</h1>
      <p className="text-xs text-slate-500 mb-4">
        {publicMode
          ? 'Please complete all fields. Your entries are auto-saved on this device until you submit.'
          : 'QMSF 02 · Fill in below and click Print. Your entries are auto-saved on this device.'}
      </p>

      <Section title="Applicant Information">
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Last Name" value={v.last_name} onChange={(x) => set('last_name', x)} />
          <Field label="First Name" value={v.first_name} onChange={(x) => set('first_name', x)} />
          <Field label="Date" type="date" value={v.application_date} onChange={(x) => set('application_date', x)} />
          <div className="md:col-span-2"><Field label="Street Address" value={v.street_address} onChange={(x) => set('street_address', x)} /></div>
          <Field label="Apartment/Unit #" value={v.apartment} onChange={(x) => set('apartment', x)} />
          <Field label="City" value={v.city} onChange={(x) => set('city', x)} />
          <Field label="State" value={v.state} onChange={(x) => set('state', x)} />
          <Field label="Postcode" value={v.postcode} onChange={(x) => set('postcode', x)} />
          <Field label="Phone" value={v.phone} onChange={(x) => set('phone', x)} />
          <div className="md:col-span-2"><Field label="E-mail Address" type="email" value={v.email} onChange={(x) => set('email', x)} /></div>
          <Field label="Date Available" type="date" value={v.date_available} onChange={(x) => set('date_available', x)} />
          <Field label="Desired Salary" value={v.desired_salary} onChange={(x) => set('desired_salary', x)} />
          <Field label="Position Applied for" value={v.position} onChange={(x) => set('position', x)} />
          <YN label="Australian citizen?" value={v.is_citizen} onChange={(x) => set('is_citizen', x)} />
          <Field label="If no, work authorisation?" value={v.work_auth} onChange={(x) => set('work_auth', x)} />
          <YN label="Worked for this company before?" value={v.worked_before} onChange={(x) => set('worked_before', x)} />
          <Field label="If so, when?" value={v.worked_before_when} onChange={(x) => set('worked_before_when', x)} />
          <YN label="Convicted of criminal offence?" value={v.criminal} onChange={(x) => set('criminal', x)} />
          <div className="md:col-span-2"><Field label="If yes, explain" value={v.criminal_explain} onChange={(x) => set('criminal_explain', x)} /></div>
        </div>
      </Section>

      <Section title="Education">
        {['High School', 'University', 'Other'].map((label, i) => (
          <div key={label} className="grid md:grid-cols-4 gap-3 mb-3 pb-3 border-b last:border-b-0">
            <div className="md:col-span-2 font-medium text-slate-700 text-sm">{label}</div>
            <div className="md:col-span-2"><Field label="Name / Institution" value={v.education[i].name} onChange={(x) => setNested('education', i, 'name', x)} /></div>
            <div className="md:col-span-2"><Field label="Address" value={v.education[i].address} onChange={(x) => setNested('education', i, 'address', x)} /></div>
            <Field label="From" type="date" value={v.education[i].from_date} onChange={(x) => setNested('education', i, 'from_date', x)} />
            <Field label="To" type="date" value={v.education[i].to_date} onChange={(x) => setNested('education', i, 'to_date', x)} />
            <YN label="Graduated?" value={v.education[i].graduated} onChange={(x) => setNested('education', i, 'graduated', x)} />
            <Field label={i === 0 ? 'Year 12 / VCE' : 'Degree'} value={v.education[i].degree} onChange={(x) => setNested('education', i, 'degree', x)} />
          </div>
        ))}
      </Section>

      <Section title="References (3)">
        {v.references.map((_, i) => (
          <div key={i} className="grid md:grid-cols-3 gap-3 mb-3 pb-3 border-b last:border-b-0">
            <Field label={`Reference ${i + 1} — Full Name`} value={v.references[i].name} onChange={(x) => setNested('references', i, 'name', x)} />
            <Field label="Relationship" value={v.references[i].relationship} onChange={(x) => setNested('references', i, 'relationship', x)} />
            <Field label="Phone" value={v.references[i].phone} onChange={(x) => setNested('references', i, 'phone', x)} />
            <Field label="Company" value={v.references[i].company} onChange={(x) => setNested('references', i, 'company', x)} />
            <div className="md:col-span-2"><Field label="Address" value={v.references[i].address} onChange={(x) => setNested('references', i, 'address', x)} /></div>
          </div>
        ))}
      </Section>

      <Section title="Previous Employment (3)">
        {v.previous_employment.map((_, i) => (
          <div key={i} className="grid md:grid-cols-3 gap-3 mb-3 pb-3 border-b last:border-b-0">
            <Field label={`Job ${i + 1} — Company`} value={v.previous_employment[i].company} onChange={(x) => setNested('previous_employment', i, 'company', x)} />
            <Field label="Phone" value={v.previous_employment[i].phone} onChange={(x) => setNested('previous_employment', i, 'phone', x)} />
            <Field label="Supervisor" value={v.previous_employment[i].supervisor} onChange={(x) => setNested('previous_employment', i, 'supervisor', x)} />
            <div className="md:col-span-3"><Field label="Address" value={v.previous_employment[i].address} onChange={(x) => setNested('previous_employment', i, 'address', x)} /></div>
            <Field label="Job Title" value={v.previous_employment[i].title} onChange={(x) => setNested('previous_employment', i, 'title', x)} />
            <Field label="Starting Salary" value={v.previous_employment[i].start_salary} onChange={(x) => setNested('previous_employment', i, 'start_salary', x)} />
            <Field label="Ending Salary" value={v.previous_employment[i].end_salary} onChange={(x) => setNested('previous_employment', i, 'end_salary', x)} />
            <div className="md:col-span-3">
              <Label className="text-xs text-slate-600">Responsibilities</Label>
              <Textarea rows={2} value={v.previous_employment[i].responsibilities || ''} onChange={(e) => setNested('previous_employment', i, 'responsibilities', e.target.value)} />
            </div>
            <Field label="From" type="date" value={v.previous_employment[i].from_date} onChange={(x) => setNested('previous_employment', i, 'from_date', x)} />
            <Field label="To" type="date" value={v.previous_employment[i].to_date} onChange={(x) => setNested('previous_employment', i, 'to_date', x)} />
            <Field label="Reason for Leaving" value={v.previous_employment[i].reason} onChange={(x) => setNested('previous_employment', i, 'reason', x)} />
            <YN label="May we contact supervisor?" value={v.previous_employment[i].may_contact} onChange={(x) => setNested('previous_employment', i, 'may_contact', x)} />
          </div>
        ))}
      </Section>

      <Section title="Disclaimer & Signature">
        <p className="text-xs text-slate-600 mb-3">
          I certify that my answers are true and complete to the best of my knowledge. If this application leads to employment,
          I understand that false or misleading information in my application or interview may result in my release.
        </p>
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Signature (typed name)" value={v.signature} onChange={(x) => set('signature', x)} />
          <Field label="Date" type="date" value={v.signature_date} onChange={(x) => set('signature_date', x)} />
          <Field label="Marital Status" value={v.marital_status} onChange={(x) => set('marital_status', x)} />
          <Field label="No. of Dependants" value={v.dependants} onChange={(x) => set('dependants', x)} />
        </div>
      </Section>

      <div className="flex justify-end gap-2 mb-8">
        <Button variant="outline" onClick={handleReset}>Clear</Button>
        {publicMode ? (
          <Button onClick={handleSubmit} disabled={submitting} className="bg-blue-700" data-testid="submit-application-btn-bottom">
            <Send className="w-4 h-4 mr-1" /> {submitting ? 'Submitting…' : 'Submit Application'}
          </Button>
        ) : (
          <Button onClick={handlePrint}><Printer className="w-4 h-4 mr-1" /> Print Form</Button>
        )}
      </div>
    </div>
  );
};

export default EmploymentApplicationForm;
