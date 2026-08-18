import React, { useEffect, useState } from 'react';
import { HelpCircle, Save, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import api from '../../services/api';

/**
 * HelpButton — question-mark button beside an audit heading.
 * Opens a side panel with structured, admin-editable help content for that section.
 * On-screen guidance only: never included in printed or PDF reports.
 */
const FIELDS = [
  ['purpose', 'Purpose of this section'],
  ['what_to_check', 'What the auditor should check'],
  ['evidence_examples', 'Evidence examples'],
  ['sample_records', 'Sample records to review'],
  ['people_to_interview', 'People to interview'],
  ['areas_to_inspect', 'Areas to inspect'],
  ['red_flags', 'Common issues / red flags'],
  ['wording_conformity', 'Example wording — conformity'],
  ['wording_nonconformity', 'Example wording — nonconformity'],
  ['related_clauses', 'Related clauses'],
  ['related_registers', 'Related registers'],
  ['related_forms', 'Related forms'],
  ['admin_notes', 'Admin notes'],
];

export const HelpButton = ({ section, isAdmin = true, size = 'sm' }) => {
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/standards-library/help/lookup', { params: { section } });
      setHelp(r.data.help);
      setForm(r.data.help || { section_key: r.data.mapped_key, help_title: section });
    } finally { setLoading(false); }
  };

  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open]);

  const save = async () => {
    const payload = { ...form };
    delete payload._id; delete payload.id; delete payload.created_at; delete payload.updated_at; delete payload.updated_by;
    const r = await api.put('/standards-library/help', payload);
    setHelp(r.data); setEditing(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={`inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-full px-1.5 py-0.5 ${size === 'xs' ? 'text-[11px]' : 'text-xs'} font-medium print:hidden`}
        title={`Help — ${section}`}
        data-testid={`help-btn-${section.slice(0, 24).replace(/\s+/g, '-').toLowerCase()}`}
      >
        <HelpCircle className={size === 'xs' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        Help
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] print:hidden pointer-events-auto" data-testid="help-drawer">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl overflow-y-auto">
            <div className="sticky top-0 bg-blue-700 text-white px-5 py-4 flex items-start justify-between gap-2 z-10">
              <div>
                <div className="flex items-center gap-2 text-blue-100 text-xs font-semibold uppercase tracking-wide"><HelpCircle className="w-4 h-4" /> Auditor Guidance — on-screen only</div>
                <h2 className="text-lg font-bold mt-0.5">{help?.help_title || section}</h2>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-blue-600" data-testid="help-drawer-close"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-4">
              {loading && <p className="text-sm text-gray-500">Loading help…</p>}

              {!loading && !editing && (
                <>
                  {!help && (
                    <div className="text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded p-3">
                      No help content exists for this section yet.
                      {isAdmin && ' Click "Edit Help" below to create it.'}
                    </div>
                  )}
                  {help && FIELDS.map(([k, label]) => help[k] ? (
                    <div key={k}>
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">{label}</div>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap mt-0.5">{help[k]}</p>
                    </div>
                  ) : null)}
                  <div className="pt-2 border-t text-[11px] text-gray-400">
                    Help guidance is not part of audit evidence and never appears on printed or PDF reports.
                    {help?.updated_by && <span> · Last edited by {help.updated_by}</span>}
                  </div>
                  {isAdmin && (
                    <Button variant="outline" size="sm" onClick={() => setEditing(true)} data-testid="help-edit-btn">Edit Help</Button>
                  )}
                </>
              )}

              {!loading && editing && form && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Help Title</Label>
                    <Input value={form.help_title || ''} onChange={e => setForm(f => ({ ...f, help_title: e.target.value }))} data-testid="help-edit-title" />
                  </div>
                  {FIELDS.map(([k, label]) => (
                    <div key={k}>
                      <Label className="text-xs">{label}</Label>
                      <Textarea rows={2} value={form[k] || ''} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} data-testid={`help-edit-${k}`} />
                    </div>
                  ))}
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" onClick={save} data-testid="help-save-btn"><Save className="w-4 h-4 mr-1" /> Save Help</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default HelpButton;
