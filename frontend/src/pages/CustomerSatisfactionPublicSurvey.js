import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { CheckCircle2, AlertCircle, Send } from 'lucide-react';

import BACKEND_URL from '../lib/backendUrl';
const API_BASE = `${BACKEND_URL}/api`;

const RATING_QUESTIONS = [
  { key: 'q_overall_quality', section: 'Service Experience', label: '1. How satisfied are you with the overall quality of laser cutting service you received from Ultimate Laser?', options: ['Very Unsatisfied', 'Unsatisfied', 'Neutral', 'Satisfied', 'Very Satisfied'] },
  { key: 'q_accuracy', section: 'Service Experience', label: '2. Please rate the accuracy and precision of the laser cutting according to your specifications:', options: ['Very Poor', 'Poor', 'Fair', 'Good', 'Excellent'] },
  { key: 'q_deadlines', section: 'Service Experience', label: '3. Were your deadlines met as promised?', options: ['Never', 'Rarely', 'Sometimes', 'Most of the time', 'Always'] },
  { key: 'q_communication', section: 'Service Experience', label: '4. How would you evaluate the level of communication, encompassing updates and clarifications?', options: ['Very Poor', 'Poor', 'Fair', 'Good', 'Excellent'] },
  { key: 'q_professionalism', section: 'Team Interaction', label: '1. Did our staff exhibit professionalism and courtesy in all interactions?', options: ['Never', 'Rarely', 'Sometimes', 'Most of the time', 'Always'] },
  { key: 'q_responsiveness', section: 'Team Interaction', label: '2. Were your inquiries and concerns addressed promptly and to your satisfaction?', options: ['Never', 'Rarely', 'Sometimes', 'Most of the time', 'Always'] },
  { key: 'q_recommend', section: 'Overall Satisfaction', label: '1. How likely are you to recommend Ultimate Laser to others seeking metal laser cutting services?', options: ['Very Unlikely', 'Unlikely', 'Neutral', 'Likely', 'Very Likely'] },
];

const CustomerSatisfactionPublicSurvey = () => {
  const { token } = useParams();
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null); // {response_no, message}
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    customer_name: '', company: '', contact_email: '', contact_number: '',
    q_overall_quality: null, q_accuracy: null, q_deadlines: null,
    q_communication: null, q_professionalism: null, q_responsiveness: null,
    q_recommend: null,
    improvements_text: '', suggestions_text: '', additional_comments: '',
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API_BASE}/customer-satisfaction/public/campaign/${token}`);
        setMeta(res.data);
      } catch (e) {
        setError(e.response?.data?.detail || 'Survey link is invalid or no longer available');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const setRating = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const validate = () => {
    if (!form.company.trim()) return 'Please enter your company name';
    if (!form.customer_name.trim()) return 'Please enter your name';
    for (const q of RATING_QUESTIONS) {
      if (form[q.key] == null) return `Please answer: ${q.label}`;
    }
    return '';
  };

  const submit = async () => {
    const v = validate();
    if (v) { setError(v); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setError('');
    setSubmitting(true);
    try {
      const res = await axios.post(`${API_BASE}/customer-satisfaction/public/submit/${token}`, form);
      setSubmitted({ response_no: res.data.response_no, message: res.data.message });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e.response?.data?.detail || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-slate-500">Loading survey…</div>
      </div>
    );
  }

  if (error && !meta) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-8 text-center">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-2" />
          <h2 className="text-lg font-semibold mb-1">Survey unavailable</h2>
          <p className="text-slate-600 text-sm">{error}</p>
        </Card>
      </div>
    );
  }

  if (meta && !meta.active) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-8 text-center">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-2" />
          <h2 className="text-lg font-semibold mb-1">{meta.title}</h2>
          <p className="text-slate-600 text-sm">{meta.message || 'This survey has been closed.'}</p>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6" data-testid="survey-submitted">
        <Card className="max-w-xl w-full p-8 text-center">
          <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
          <h2 className="text-2xl font-bold mb-2">Thank you!</h2>
          <p className="text-slate-700 mb-3">{submitted.message}</p>
          <div className="text-xs text-slate-500">Your reference: <strong className="font-mono">{submitted.response_no}</strong></div>
          <div className="text-[10px] text-slate-400 mt-6 border-t pt-3">
            Ultimate Laser Pty Ltd — Form {meta.form_no} &nbsp;|&nbsp; Confidential ISO 9001 Record
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4" data-testid="public-survey">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <Card className="p-6 mb-4 bg-gradient-to-r from-blue-700 to-blue-900 text-white">
          <div className="text-xs uppercase tracking-wider text-blue-200">Ultimate Laser Pty Ltd</div>
          <h1 className="text-2xl md:text-3xl font-bold mt-1">{meta.title}</h1>
          <div className="text-xs text-blue-200 mt-1">Form {meta.form_no} &nbsp;•&nbsp; Year {meta.year}</div>
        </Card>

        <Card className="p-6 mb-4 bg-white">
          <p className="text-slate-700 text-sm leading-relaxed">{meta.intro_message}</p>
        </Card>

        {error && (
          <Card className="p-3 mb-4 bg-red-50 border-red-300 text-red-700 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </Card>
        )}

        {/* Section 1 */}
        <Card className="p-6 mb-4">
          <h2 className="font-semibold text-lg mb-3 text-blue-900 border-b pb-1">General Information</h2>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-600">Name *</label>
              <Input value={form.customer_name} onChange={(e) => setField('customer_name', e.target.value)} data-testid="field-name" />
            </div>
            <div>
              <label className="text-xs text-slate-600">Company *</label>
              <Input value={form.company} onChange={(e) => setField('company', e.target.value)} data-testid="field-company" />
            </div>
            <div>
              <label className="text-xs text-slate-600">Contact Email</label>
              <Input type="email" value={form.contact_email} onChange={(e) => setField('contact_email', e.target.value)} data-testid="field-email" />
            </div>
            <div>
              <label className="text-xs text-slate-600">Contact Number</label>
              <Input value={form.contact_number} onChange={(e) => setField('contact_number', e.target.value)} data-testid="field-phone" />
            </div>
          </div>
        </Card>

        {/* Rating sections */}
        {['Service Experience', 'Team Interaction', 'Overall Satisfaction'].map((sectionName) => {
          const qs = RATING_QUESTIONS.filter((q) => q.section === sectionName);
          return (
            <Card key={sectionName} className="p-6 mb-4">
              <h2 className="font-semibold text-lg mb-3 text-blue-900 border-b pb-1">{sectionName}</h2>
              <div className="space-y-5">
                {qs.map((q) => (
                  <div key={q.key} data-testid={`question-${q.key}`}>
                    <div className="text-sm font-medium mb-2">{q.label}</div>
                    <div className="grid grid-cols-5 gap-2">
                      {q.options.map((opt, i) => {
                        const val = i + 1;
                        const isOn = form[q.key] === val;
                        return (
                          <button
                            type="button"
                            key={opt}
                            onClick={() => setRating(q.key, val)}
                            className={`text-xs px-2 py-3 rounded border transition ${isOn ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-slate-700 border-slate-300 hover:border-blue-400'}`}
                            data-testid={`rating-${q.key}-${val}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}

        {/* Section 4: free-text */}
        <Card className="p-6 mb-4">
          <h2 className="font-semibold text-lg mb-3 text-blue-900 border-b pb-1">Improvements & Suggestions</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Is there any aspect of our laser cutting service that you believe needs improvement? Please elaborate.</label>
              <Textarea
                rows={3}
                value={form.improvements_text}
                onChange={(e) => setField('improvements_text', e.target.value)}
                data-testid="field-improvements"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Do you have any suggestions for enhancing our service quality or customer experience?</label>
              <Textarea
                rows={3}
                value={form.suggestions_text}
                onChange={(e) => setField('suggestions_text', e.target.value)}
                data-testid="field-suggestions"
              />
            </div>
          </div>
        </Card>

        {/* Section 6 */}
        <Card className="p-6 mb-4">
          <h2 className="font-semibold text-lg mb-3 text-blue-900 border-b pb-1">Additional Comments</h2>
          <Textarea
            rows={4}
            placeholder="Please feel free to provide any additional comments or feedback about your experience with Ultimate Laser. Your insights are valuable to us."
            value={form.additional_comments}
            onChange={(e) => setField('additional_comments', e.target.value)}
            data-testid="field-additional"
          />
        </Card>

        {/* Submit */}
        <div className="flex justify-end mb-3">
          <Button onClick={submit} disabled={submitting} className="bg-blue-700 hover:bg-blue-800 px-8" data-testid="submit-survey-btn">
            <Send className="w-4 h-4 mr-2" /> {submitting ? 'Submitting…' : 'Submit Survey'}
          </Button>
        </div>

        {/* Closing */}
        <Card className="p-4 text-xs text-slate-500 text-center">
          <p>{meta.closing_message}</p>
          <p className="mt-2 text-[10px]">Confidential — Form {meta.form_no} — Ultimate Laser Pty Ltd</p>
        </Card>
      </div>
    </div>
  );
};

export default CustomerSatisfactionPublicSurvey;
