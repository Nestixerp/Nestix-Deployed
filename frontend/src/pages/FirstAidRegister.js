import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Plus, Search, Edit, Trash2, X as XIcon, Save, Upload, Download, Printer, FileText, BellRing } from 'lucide-react';
import api from '../services/api';
import { formatDate } from '../utils/dateFormatter';
import {
  getControlledDocumentByModule,
  buildDocControlFooter,
  buildPrintFooterCss,
  buildPrintBodyOpen,
  buildPrintBodyClose,
} from '../utils/documentControl';

const MODULE_NAME = 'First Aid Certificate Register';

// Default refresh windows (Australian conventions)
const REFRESH_YEARS = { HLTAID009: 1, HLTAID010: 3, HLTAID011: 3, HLTAID012: 3, HLTAID013: 3, HLTAID014: 3 };

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

const addYears = (iso, n) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  d.setFullYear(d.getFullYear() + n);
  return d.toISOString().slice(0, 10);
};

const STATUS_STYLES = {
  current: 'bg-green-100 text-green-700',
  expiring_soon: 'bg-amber-100 text-amber-700',
  expired: 'bg-red-100 text-red-700',
  missing: 'bg-gray-100 text-gray-500',
};

const FirstAidRegister = () => {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [codes, setCodes] = useState([]);
  const [editing, setEditing] = useState(null);
  const [uploadingFor, setUploadingFor] = useState(null);  // index of cert being uploaded
  const [showCodesMgr, setShowCodesMgr] = useState(false);
  const [codesDraft, setCodesDraft] = useState([]);
  const [docInfo, setDocInfo] = useState(null);

  const blankCert = () => ({ id: '', certificate_number: '', attainments: [], issue_date: '', expiry_date: '', issuer: '', file_id: '', file_name: '' });
  const blankRec = () => ({ name: '', employee_id: '', notes: '', certificates: [blankCert()] });

  useEffect(() => {
    fetchAll();
    getControlledDocumentByModule(MODULE_NAME, { fallback: 'First Aid Register', docType: 'Register' }).then(setDocInfo);
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const [list, st, emp, cs] = await Promise.all([
        api.get('/compliance/first-aid', { params }),
        api.get('/compliance/first-aid/stats'),
        api.get('/employees'),
        api.get('/compliance/first-aid/attainment-codes'),
      ]);
      setItems(list.data.items || []);
      setStats(st.data || {});
      setEmployees(emp.data || []);
      setCodes(cs.data.codes || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const employeeNames = useMemo(
    () => Array.from(new Set(
      (employees || [])
        .filter(e => (e.status || 'Active') === 'Active')
        .map(e => (e.name || `${e.first_name || ''} ${e.last_name || ''}`).trim())
        .filter(Boolean)
    )).sort(),
    [employees],
  );

  const openNew = () => setEditing(blankRec());
  const openEdit = (rec) => setEditing({ ...rec, certificates: (rec.certificates || []).map(c => ({ ...c })) });
  const close = () => { setEditing(null); setUploadingFor(null); };

  const updateRec = (patch) => setEditing(e => ({ ...e, ...patch }));
  const updateCert = (idx, patch) => setEditing(e => {
    const next = { ...e, certificates: e.certificates.map((c, i) => i === idx ? { ...c, ...patch } : c) };
    // Auto-suggest expiry — use the longest refresh window of the chosen attainments
    if (('issue_date' in patch || 'attainments' in patch) && !next.certificates[idx].expiry_date) {
      const cert = next.certificates[idx];
      const yrs = Math.max(...(cert.attainments || []).map(a => REFRESH_YEARS[a] || 3), 3);
      if (cert.issue_date) cert.expiry_date = addYears(cert.issue_date, yrs);
    }
    return next;
  });
  const addCert = () => setEditing(e => ({ ...e, certificates: [...(e.certificates || []), blankCert()] }));
  const removeCert = (idx) => setEditing(e => ({ ...e, certificates: e.certificates.filter((_, i) => i !== idx) }));
  const toggleAttainment = (idx, code) => {
    const cert = editing.certificates[idx];
    const has = (cert.attainments || []).includes(code);
    const newList = has ? cert.attainments.filter(a => a !== code) : [...(cert.attainments || []), code];
    updateCert(idx, { attainments: newList });
  };

  const uploadFile = async (certIdx, file) => {
    if (!file) return;
    setUploadingFor(certIdx);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await api.post('/compliance/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      updateCert(certIdx, { file_id: res.data.id, file_name: res.data.filename, uploaded_at: new Date().toISOString() });
    } catch (e) {
      alert('Upload failed: ' + (e?.response?.data?.detail || e.message));
    } finally {
      setUploadingFor(null);
    }
  };

  const downloadFile = async (fileId, filename) => {
    try {
      const res = await api.get(`/compliance/files/${fileId}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = filename || 'certificate';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert('Download failed'); }
  };

  const save = async () => {
    if (!editing.name) return alert('Name is required');
    try {
      const payload = { ...editing };
      delete payload.status; delete payload.current_certificate; delete payload.all_attainments;
      delete payload.created_at; delete payload.updated_at; delete payload.created_by;
      if (editing.id) await api.put(`/compliance/first-aid/${editing.id}`, payload);
      else await api.post('/compliance/first-aid', payload);
      close(); fetchAll();
    } catch (e) { alert('Failed to save: ' + (e?.response?.data?.detail || e.message)); }
  };

  const remove = async (rec) => {
    if (!window.confirm(`Delete first-aid record for ${rec.name}?`)) return;
    try { await api.delete(`/compliance/first-aid/${rec.id}`); fetchAll(); }
    catch (e) { alert('Failed to delete'); }
  };

  const openCodesMgr = () => { setCodesDraft([...codes]); setShowCodesMgr(true); };
  const saveCodes = async () => {
    try {
      const res = await api.put('/compliance/first-aid/attainment-codes', { codes: codesDraft });
      setCodes(res.data.codes || []);
      setShowCodesMgr(false);
    } catch (e) { alert('Failed to save codes'); }
  };

  const handlePrint = async () => {
    const doc = await getControlledDocumentByModule(MODULE_NAME, { fallback: 'First Aid Register', docType: 'Register' });
    const footer = buildDocControlFooter(doc, {
      title: 'First Aid Certificate Register',
    });
    const rows = items.map(it => {
      const cur = it.current_certificate || {};
      return `
        <tr>
          <td>${esc(it.name)}</td>
          <td>${esc(cur.certificate_number || '')}</td>
          <td>${esc((cur.attainments || []).join(', '))}</td>
          <td>${esc(formatDate(cur.issue_date))}</td>
          <td>${esc(formatDate(cur.expiry_date))}</td>
          <td>${esc((it.status || '').replace('_', ' '))}</td>
        </tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>First Aid Register</title>
      <style>${buildPrintFooterCss()}
        @page { size: A4 landscape; margin: 12mm; }
        body { font-size: 10pt; color:#111; }
        h1 { text-align:center; font-size:14pt; margin:0 0 4mm 0; }
        h2 { text-align:center; font-size:11pt; color:#555; font-weight:normal; margin:0 0 4mm; }
        table { width:100%; border-collapse:collapse; }
        th, td { border:1px solid #333; padding:4px 6px; text-align:left; font-size:9.5pt; }
        th { background:#f3f4f6; }
        .meta { display:flex; gap:14mm; font-size:9pt; color:#555; margin:2mm 0 4mm; }
      </style></head><body>
      ${buildPrintBodyOpen(footer)}
      <h1>ULTIMATE LASER PTY LTD</h1>
      <h2>First Aid Certificate Register</h2>
      <div class="meta">
        <span><strong>Generated:</strong> ${esc(formatDate(new Date().toISOString()))}</span>
        <span><strong>Total:</strong> ${items.length}</span>
        <span><strong>Current:</strong> ${stats?.current ?? 0}</span>
        <span><strong>Expiring Soon:</strong> ${stats?.expiring_soon ?? 0}</span>
        <span><strong>Expired:</strong> ${stats?.expired ?? 0}</span>
      </div>
      <table>
        <thead><tr><th>Name</th><th>Cert #</th><th>Attainments</th><th>Issue Date</th><th>Expiry Date</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${buildPrintBodyClose()}
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (_) { /* blocked */ } }, 250);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="firstaid-register-page">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">First Aid Certificate Register</h1>
          <p className="text-gray-600 mt-1 text-sm">
            ISO compliance register{' '}
            <span className="ml-1 inline-block text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-mono">
              {docInfo?.form_no || '—'}
            </span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={openCodesMgr} data-testid="fa-codes-mgr">Manage Codes</Button>
          <Button variant="outline" onClick={async () => {
            try {
              const r = await api.post('/notifications/check-alerts');
              const n = r.data?.alerts_created || 0;
              alert(n > 0 ? `${n} new expiry alert(s) added to the bell.` : 'No new expiry alerts — all certificates are current or already alerted.');
            } catch (e) { alert('Scan failed: ' + (e?.response?.data?.detail || e.message)); }
          }} data-testid="fa-check-expiry">
            <BellRing className="w-4 h-4 mr-2" /> Check Expiries
          </Button>
          <Button variant="outline" onClick={handlePrint} data-testid="fa-print"><Printer className="w-4 h-4 mr-2" /> Print</Button>
          <Button onClick={openNew} data-testid="fa-new"><Plus className="w-4 h-4 mr-2" /> New Record</Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="fa-stats">
          {[
            { key: 'current', label: 'Current', cls: 'border-l-green-600', txt: 'text-green-700', testid: 'fa-stat-current' },
            { key: 'expiring_soon', label: 'Expiring Soon (≤90d)', cls: 'border-l-amber-500', txt: 'text-amber-600', testid: 'fa-stat-expiring' },
            { key: 'expired', label: 'Expired', cls: 'border-l-red-600', txt: 'text-red-700', testid: 'fa-stat-expired' },
            { key: 'missing', label: 'Missing Expiry', cls: 'border-l-gray-400', txt: 'text-gray-600', testid: 'fa-stat-missing' },
            { key: 'total', label: 'Total', cls: 'border-l-blue-600', txt: 'text-blue-700', testid: 'fa-stat-total' },
          ].map(s => (
            <Card key={s.key} className={`border-l-4 ${s.cls}`}>
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-gray-500">{s.label}</div>
                <div className={`text-3xl font-bold ${s.txt}`} data-testid={s.testid}>{stats[s.key] ?? 0}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-gray-500">Search</Label>
              <Input placeholder="Name, certificate #, attainment code…" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchAll()} data-testid="fa-search" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Status</Label>
              <select className="border rounded px-3 py-2 text-sm h-10" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} data-testid="fa-status">
                <option value="">All</option>
                <option value="current">Current</option>
                <option value="expiring_soon">Expiring Soon</option>
                <option value="expired">Expired</option>
                <option value="missing">Missing Expiry</option>
              </select>
            </div>
            <Button onClick={fetchAll} data-testid="fa-search-btn"><Search className="w-4 h-4 mr-1" /> Search</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle>{items.length} record{items.length === 1 ? '' : 's'}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="fa-table">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2 border">Name</th>
                <th className="text-left p-2 border">Cert #</th>
                <th className="text-left p-2 border">Attainments</th>
                <th className="text-left p-2 border">Issue Date</th>
                <th className="text-left p-2 border">Expiry Date</th>
                <th className="text-left p-2 border">Status</th>
                <th className="text-left p-2 border">Renewals</th>
                <th className="text-left p-2 border w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="text-center text-gray-500 py-6">Loading…</td></tr>}
              {!loading && items.length === 0 && <tr><td colSpan={8} className="text-center text-gray-500 py-6">No records on file.</td></tr>}
              {items.map(it => {
                const cur = it.current_certificate || {};
                return (
                  <tr key={it.id} className="hover:bg-gray-50">
                    <td className="p-2 border font-medium">{it.name}</td>
                    <td className="p-2 border font-mono">{cur.certificate_number || ''}</td>
                    <td className="p-2 border">
                      {(cur.attainments || []).map(a => <span key={a} className="inline-block text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded mr-1">{a}</span>)}
                    </td>
                    <td className="p-2 border whitespace-nowrap">{formatDate(cur.issue_date)}</td>
                    <td className="p-2 border whitespace-nowrap">{formatDate(cur.expiry_date)}</td>
                    <td className="p-2 border">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_STYLES[it.status] || 'bg-gray-100'}`}>
                        {(it.status || 'missing').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-2 border text-center">{(it.certificates || []).length}</td>
                    <td className="p-2 border whitespace-nowrap">
                      {cur.file_id && (
                        <button onClick={() => downloadFile(cur.file_id, cur.file_name)} className="text-green-700 hover:underline mr-2" title="Download current cert" data-testid={`fa-download-${it.id}`}><Download className="w-4 h-4 inline" /></button>
                      )}
                      <button onClick={() => openEdit(it)} className="text-blue-600 hover:underline mr-2" data-testid={`fa-edit-${it.id}`}><Edit className="w-4 h-4 inline" /></button>
                      <button onClick={() => remove(it)} className="text-red-600 hover:underline" data-testid={`fa-delete-${it.id}`}><Trash2 className="w-4 h-4 inline" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="fa-modal">
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <span>{editing.id ? `Edit Record — ${editing.name}` : 'New First Aid Record'}</span>
                <Button variant="ghost" size="sm" onClick={close}><XIcon className="w-4 h-4" /></Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Name <span className="text-red-500">*</span></Label>
                <div className="flex gap-1">
                  <select className="border rounded px-2 py-2 text-sm flex-1 h-10" value={employeeNames.includes(editing.name) ? editing.name : ''} onChange={(e) => updateRec({ name: e.target.value })}>
                    <option value="">— select employee —</option>
                    {employeeNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <Input value={!employeeNames.includes(editing.name) ? editing.name : ''} onChange={e => updateRec({ name: e.target.value })} placeholder="or type" className="w-40" data-testid="fa-input-name" />
                </div>
              </div>

              <div>
                <Label>Notes</Label>
                <Input value={editing.notes || ''} onChange={e => updateRec({ notes: e.target.value })} placeholder="e.g. First Aid Officer / Fire Warden" />
              </div>

              {/* Certificates / renewals */}
              <div className="border-t pt-3">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-semibold">Certificates (Renewals)</h3>
                  <Button size="sm" variant="outline" onClick={addCert} data-testid="fa-add-cert"><Plus className="w-4 h-4 mr-1" /> Add Renewal</Button>
                </div>
                {(editing.certificates || []).map((cert, idx) => (
                  <div key={idx} className="border rounded p-3 mb-2 bg-gray-50" data-testid={`fa-cert-${idx}`}>
                    <div className="flex justify-between mb-2">
                      <span className="text-xs text-gray-500">Renewal #{idx + 1}</span>
                      {(editing.certificates || []).length > 1 && (
                        <button onClick={() => removeCert(idx)} className="text-red-600 hover:text-red-800" data-testid={`fa-cert-remove-${idx}`}><Trash2 className="w-3.5 h-3.5 inline" /></button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Certificate #</Label>
                        <Input value={cert.certificate_number || ''} onChange={e => updateCert(idx, { certificate_number: e.target.value })} data-testid={`fa-cert-no-${idx}`} />
                      </div>
                      <div>
                        <Label className="text-xs">Issuer</Label>
                        <Input value={cert.issuer || ''} onChange={e => updateCert(idx, { issuer: e.target.value })} placeholder="e.g. St John Ambulance" />
                      </div>
                      <div>
                        <Label className="text-xs">Issue Date</Label>
                        <Input type="date" value={cert.issue_date || ''} onChange={e => updateCert(idx, { issue_date: e.target.value })} data-testid={`fa-cert-issue-${idx}`} />
                      </div>
                      <div>
                        <Label className="text-xs">Expiry Date <span className="text-[10px] text-gray-400">(auto)</span></Label>
                        <Input type="date" value={cert.expiry_date || ''} onChange={e => updateCert(idx, { expiry_date: e.target.value })} data-testid={`fa-cert-expiry-${idx}`} />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Attainments</Label>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {codes.map(code => {
                            const on = (cert.attainments || []).includes(code);
                            return (
                              <button
                                key={code}
                                type="button"
                                onClick={() => toggleAttainment(idx, code)}
                                className={`text-xs px-2 py-1 rounded border ${on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'}`}
                                data-testid={`fa-cert-att-${idx}-${code}`}
                              >
                                {code}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Certificate File</Label>
                        <div className="flex items-center gap-2 mt-1">
                          {cert.file_id ? (
                            <>
                              <span className="text-sm flex items-center gap-1"><FileText className="w-4 h-4 text-blue-600" /> {cert.file_name}</span>
                              <Button size="sm" variant="outline" onClick={() => downloadFile(cert.file_id, cert.file_name)} data-testid={`fa-cert-dl-${idx}`}><Download className="w-3.5 h-3.5 mr-1" /> Download</Button>
                              <Button size="sm" variant="outline" onClick={() => updateCert(idx, { file_id: '', file_name: '' })}>Remove</Button>
                            </>
                          ) : (
                            <label className="cursor-pointer inline-flex items-center gap-2 text-sm border border-dashed border-gray-400 rounded px-3 py-1.5 hover:bg-gray-50">
                              <Upload className="w-4 h-4" /> {uploadingFor === idx ? 'Uploading…' : 'Choose file (PDF/Image, max 10MB)'}
                              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.heic" className="hidden" onChange={e => uploadFile(idx, e.target.files?.[0])} data-testid={`fa-cert-upload-${idx}`} />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={save} className="flex-1" data-testid="fa-save"><Save className="w-4 h-4 mr-2" /> Save Record</Button>
                <Button variant="outline" onClick={close}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Codes manager */}
      {showCodesMgr && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md" data-testid="fa-codes-modal">
            <CardHeader><CardTitle className="flex justify-between"><span>Manage Attainment Codes</span><Button variant="ghost" size="sm" onClick={() => setShowCodesMgr(false)}><XIcon className="w-4 h-4" /></Button></CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {codesDraft.map((c, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input value={c} onChange={e => setCodesDraft(d => d.map((x, j) => j === i ? e.target.value : x))} data-testid={`fa-code-${i}`} />
                  <button onClick={() => setCodesDraft(d => d.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              <Button variant="outline" onClick={() => setCodesDraft(d => [...d, ''])}><Plus className="w-4 h-4 mr-1" /> Add Code</Button>
              <div className="flex gap-2 pt-2">
                <Button onClick={saveCodes} className="flex-1" data-testid="fa-codes-save"><Save className="w-4 h-4 mr-2" /> Save</Button>
                <Button variant="outline" onClick={() => setShowCodesMgr(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default FirstAidRegister;
