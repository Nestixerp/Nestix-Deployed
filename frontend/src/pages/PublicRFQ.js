import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { CheckCircle2 } from 'lucide-react';

import API from '../lib/backendUrl';

export default function PublicRFQ() {
  const { token } = useParams();
  const [rfq, setRfq] = useState(null);
  const [error, setError] = useState('');
  const [supplier, setSupplier] = useState({ supplier_company: '', contact_name: '', email: '', phone: '', overall_notes: '' });
  const [freight, setFreight] = useState('');
  const [extras, setExtras] = useState([{ label: '', amount: '' }, { label: '', amount: '' }]);
  const [attachment, setAttachment] = useState(null); // {name, b64}
  const [lines, setLines] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    // Prefill supplier details remembered on this device (private to this browser)
    try {
      const saved = JSON.parse(localStorage.getItem('rfq_supplier_details') || 'null');
      if (saved?.supplier_company) setSupplier(s => ({ ...s, ...saved, overall_notes: '' }));
    } catch (e) { /* ignore */ }
    axios.get(`${API}/api/rfqs/public/${token}`)
      .then(r => {
        setRfq(r.data);
        const init = {};
        (r.data.items || []).forEach(it => { init[it.id] = { price: '', available: true, alternative_size: '', alternative_price: '', notes: '', offerAlt: false }; });
        setLines(init);
      })
      .catch(() => setError('This enquiry link is not valid.'));
  }, [token]);

  const setLine = (id, field, val) => setLines(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));

  const onAttach = (e) => {
    const f = e.target.files?.[0];
    if (!f) { setAttachment(null); return; }
    if (f.size > 5 * 1024 * 1024) { setValidationError('Attachment too large (max 5 MB).'); e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = (ev) => setAttachment({ name: f.name, b64: String(ev.target.result).split(',', 2)[1] });
    reader.readAsDataURL(f);
  };

  const submit = async () => {
    setValidationError('');
    if (!supplier.supplier_company.trim()) { setValidationError('Please enter your company name.'); return; }
    const items = Object.entries(lines).map(([item_id, l]) => ({
      item_id,
      price: l.price !== '' ? parseFloat(l.price) : null,
      available: l.available,
      alternative_size: l.offerAlt ? l.alternative_size : '',
      alternative_price: l.offerAlt && l.alternative_price !== '' ? parseFloat(l.alternative_price) : null,
      notes: l.notes,
    }));
    setBusy(true);
    try {
      await axios.post(`${API}/api/rfqs/public/${token}/respond`, {
        ...supplier,
        freight: freight !== '' ? parseFloat(freight) : null,
        extra_costs: extras.filter(x => x.label || x.amount !== '').map(x => ({ label: x.label, amount: x.amount !== '' ? parseFloat(x.amount) : null })),
        attachment_name: attachment?.name || '',
        attachment_b64: attachment?.b64 || '',
        items,
      });
      try {
        localStorage.setItem('rfq_supplier_details', JSON.stringify({
          supplier_company: supplier.supplier_company,
          contact_name: supplier.contact_name,
          email: supplier.email,
          phone: supplier.phone,
        }));
      } catch (e) { /* ignore */ }
      setSubmitted(true);
    } catch (e) {
      setValidationError(e?.response?.data?.detail || 'Submission failed — please try again.');
    }
    setBusy(false);
  };

  if (error) return <div className="min-h-screen flex items-center justify-center text-slate-600">{error}</div>;
  if (!rfq) return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading enquiry…</div>;

  if (submitted) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <Card className="max-w-md w-full"><CardContent className="pt-8 pb-8 text-center" data-testid="rfq-thankyou">
        <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-3" />
        <h2 className="text-lg font-bold mb-1">Pricing Submitted</h2>
        <p className="text-sm text-slate-600">Thank you — {rfq.company_name} has received your pricing for {rfq.rfq_number}.</p>
      </CardContent></Card>
    </div>
  );

  if (rfq.active === false) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <Card className="max-w-md w-full"><CardContent className="pt-8 pb-8 text-center">
        <h2 className="text-lg font-bold mb-1">{rfq.rfq_number} — {rfq.title}</h2>
        <p className="text-sm text-slate-600">{rfq.message}</p>
      </CardContent></Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4" data-testid="public-rfq-page">
      <div className="max-w-3xl mx-auto space-y-4">
        <Card>
          <CardContent className="pt-6 pb-5">
            <div className="flex items-center gap-3 mb-1">
              {rfq.company_logo_url && <img src={rfq.company_logo_url} alt="logo" className="h-10 w-10 object-contain" />}
              <div>
                <h1 className="text-lg font-bold">{rfq.company_name} — Material Purchasing Enquiry</h1>
                <p className="text-sm text-slate-600">{rfq.rfq_number} · {rfq.title}{rfq.required_by ? ` · Pricing required by ${rfq.required_by}` : ''}</p>
              </div>
            </div>
            {rfq.notes && <p className="text-sm text-slate-700 mt-2 bg-blue-50 border border-blue-100 rounded p-2">{rfq.notes}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5 space-y-3">
            <h2 className="font-semibold">Your Details <span className="text-xs font-normal text-slate-500">(remembered on this device for next time)</span></h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className="text-xs font-medium">Company Name *</label>
                <Input data-testid="supplier-company-input" placeholder="Your company name" value={supplier.supplier_company} onChange={e => setSupplier({ ...supplier, supplier_company: e.target.value })} /></div>
              <div><label className="text-xs font-medium">Contact Name</label>
                <Input data-testid="supplier-contact-input" value={supplier.contact_name} onChange={e => setSupplier({ ...supplier, contact_name: e.target.value })} /></div>
              <div><label className="text-xs font-medium">Email</label>
                <Input data-testid="supplier-email-input" value={supplier.email} onChange={e => setSupplier({ ...supplier, email: e.target.value })} /></div>
              <div><label className="text-xs font-medium">Phone</label>
                <Input value={supplier.phone} onChange={e => setSupplier({ ...supplier, phone: e.target.value })} /></div>
            </div>
          </CardContent>
        </Card>

        {(rfq.items || []).map((it, idx) => {
          const l = lines[it.id] || {};
          return (
            <Card key={it.id} data-testid={`rfq-public-item-${idx}`}>
              <CardContent className="pt-4 pb-4">
                <div className="flex flex-wrap justify-between gap-2 mb-2">
                  <div>
                    <span className="font-semibold">{idx + 1}. {it.description}</span>
                    <div className="text-xs text-slate-600">
                      {it.code && <>Code: <b className="font-mono">{it.code}</b> · </>}
                      {it.material_type && <>Material: {it.material_type} · </>}
                      {it.size && <>Size: <b>{it.size}</b> · </>}
                      Qty: <b>{it.quantity}</b>
                    </div>
                    {it.notes && <div className="text-xs text-slate-500">{it.notes}</div>}
                  </div>
                  <div className="w-44">
                    <label className="text-xs font-medium">Your Price (ea, ex GST)</label>
                    <Input type="number" step="0.01" min="0" placeholder="0.00" data-testid={`price-input-${idx}`}
                      value={l.price} disabled={!l.available && !l.offerAlt}
                      onChange={e => setLine(it.id, 'price', e.target.value)} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" data-testid={`not-available-${idx}`} checked={!l.available}
                      onChange={e => setLine(it.id, 'available', !e.target.checked)} />
                    Size not available
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" data-testid={`offer-alt-${idx}`} checked={!!l.offerAlt}
                      onChange={e => setLine(it.id, 'offerAlt', e.target.checked)} />
                    Offer an alternative size
                  </label>
                </div>
                {l.offerAlt && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2 bg-amber-50 border border-amber-200 rounded p-2">
                    <div><label className="text-xs font-medium">Alternative Size</label>
                      <Input data-testid={`alt-size-${idx}`} placeholder="e.g. 3.0 x 3000 x 1500" value={l.alternative_size} onChange={e => setLine(it.id, 'alternative_size', e.target.value)} /></div>
                    <div><label className="text-xs font-medium">Alternative Price (ea, ex GST)</label>
                      <Input type="number" step="0.01" min="0" data-testid={`alt-price-${idx}`} value={l.alternative_price} onChange={e => setLine(it.id, 'alternative_price', e.target.value)} /></div>
                  </div>
                )}
                <div className="mt-2">
                  <Input placeholder="Notes for this item (lead time, MOQ, etc.)" className="h-8 text-sm" value={l.notes} onChange={e => setLine(it.id, 'notes', e.target.value)} />
                </div>
              </CardContent>
            </Card>
          );
        })}

        <Card>
          <CardContent className="pt-4 pb-5 space-y-3">
            <h2 className="font-semibold">Freight &amp; Other Charges</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className="text-xs font-medium">Freight (ex GST)</label>
                <Input type="number" step="0.01" min="0" placeholder="0.00" data-testid="freight-input" value={freight} onChange={e => setFreight(e.target.value)} /></div>
            </div>
            {extras.map((x, i) => (
              <div key={i} className="grid grid-cols-[2fr_1fr] gap-3">
                <div><label className="text-xs font-medium">Other cost {i + 1} — description</label>
                  <Input placeholder="e.g. Fuel surcharge, cutting fee…" data-testid={`extra-label-${i}`} value={x.label}
                    onChange={e => setExtras(prev => prev.map((p, j) => j === i ? { ...p, label: e.target.value } : p))} /></div>
                <div><label className="text-xs font-medium">Amount (ex GST)</label>
                  <Input type="number" step="0.01" min="0" placeholder="0.00" data-testid={`extra-amount-${i}`} value={x.amount}
                    onChange={e => setExtras(prev => prev.map((p, j) => j === i ? { ...p, amount: e.target.value } : p))} /></div>
              </div>
            ))}
            <div>
              <label className="text-xs font-medium">Attach your quote (optional, max 5 MB)</label>
              <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={onAttach} data-testid="attachment-input"
                className="block text-sm mt-1 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-slate-800 file:text-white file:cursor-pointer" />
              {attachment && <span className="text-xs text-green-700">✓ {attachment.name} attached</span>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-5 space-y-3">
            <div><label className="text-xs font-medium">General Notes / Terms</label>
              <Textarea data-testid="supplier-notes" value={supplier.overall_notes} onChange={e => setSupplier({ ...supplier, overall_notes: e.target.value })} /></div>
            {validationError && <p className="text-sm text-red-600" data-testid="rfq-validation-error">{validationError}</p>}
            <Button className="w-full" data-testid="submit-rfq-response-btn" disabled={busy} onClick={submit}>Submit Pricing</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
