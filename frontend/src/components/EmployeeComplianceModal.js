/**
 * EmployeeComplianceModal — aggregates every Forklift license, First Aid
 * certificate and Training Matrix record for a single employee on one page.
 * Useful for surfacing all compliance evidence for an auditor without
 * jumping between modules.
 */
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import { Download, FileText, Truck, HeartHandshake, Award, Printer } from 'lucide-react';
import api from '../services/api';
import { formatDate } from '../utils/dateFormatter';

const StatusBadge = ({ status }) => {
  const cls = {
    current: 'bg-green-100 text-green-700',
    expiring_soon: 'bg-amber-100 text-amber-700',
    expired: 'bg-red-100 text-red-700',
    missing: 'bg-gray-100 text-gray-500',
  }[status] || 'bg-gray-100 text-gray-500';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
      {(status || 'missing').replace('_', ' ')}
    </span>
  );
};

const EmployeeComplianceModal = ({ employee, open, onOpenChange }) => {
  const [loading, setLoading] = useState(false);
  const [forkliftLicenses, setForkliftLicenses] = useState([]);
  const [firstAidRecord, setFirstAidRecord] = useState(null);
  const [trainingRows, setTrainingRows] = useState([]);  // [{matrix_name, skill_name, score}]

  const fullName = employee
    ? `${employee.first_name || ''} ${employee.last_name || ''}`.trim()
    : '';

  useEffect(() => {
    if (!open || !employee) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Drop the server-side search param — backend strict-substring filter
        // would strip out middle-initial variants before sameName() can see them.
        // Fetch everything and rely on the forgiving client-side match below.
        const [fl, fa, mats] = await Promise.all([
          api.get('/compliance/forklift'),
          api.get('/compliance/first-aid'),
          api.get('/training-matrices'),
        ]);
        if (cancelled) return;

        // Forgiving name match — handles middle initials / extra whitespace / case.
        // Two names match when their first token AND last token agree (case-insensitive),
        // ignoring punctuation. So "Kiran Satheesh" matches "KIRAN V. SATHEESH" and
        // "KIRAN V SATHEESH".
        const tokens = (s) => (s || '')
          .toString()
          .toLowerCase()
          .replace(/[.,]/g, ' ')
          .split(/\s+/)
          .filter(Boolean);
        const meT = tokens(fullName);
        const sameName = (other) => {
          const t = tokens(other);
          if (t.length === 0 || meT.length === 0) return false;
          return t[0] === meT[0] && t[t.length - 1] === meT[meT.length - 1];
        };

        setForkliftLicenses((fl.data.items || []).filter(x => sameName(x.name)));
        const faMine = (fa.data.items || []).find(x => sameName(x.name));
        setFirstAidRecord(faMine || null);

        const rows = [];
        for (const m of (mats.data || [])) {
          const person = (m.people || []).find(p => sameName(p.name));
          if (!person) continue;
          const skillsById = Object.fromEntries((m.skills || []).map(s => [s.id, s]));
          for (const [skillId, score] of Object.entries(person.scores || {})) {
            if (score === undefined || score === null || score === '') continue;
            rows.push({
              matrix_name: m.name,
              skill_name: skillsById[skillId]?.name || '(unknown skill)',
              score,
              reviewed_date: m.reviewed_date || m.updated_at,
            });
          }
        }
        setTrainingRows(rows);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, employee, fullName]);

  const downloadCert = async (fileId, filename) => {
    try {
      const res = await api.get(`/compliance/files/${fileId}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = filename || 'certificate';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert('Download failed'); }
  };

  const handlePrint = () => {
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
    const flRows = forkliftLicenses.map(l =>
      `<tr><td>${esc(l.license_number || '')}</td><td>${esc(formatDate(l.issue_date))}</td><td>${esc(formatDate(l.expiry_date))}</td><td>${esc((l.status || '').replace('_', ' '))}</td></tr>`
    ).join('') || '<tr><td colspan="4" style="text-align:center;color:#777;">— No forklift licenses on file —</td></tr>';

    const faCerts = (firstAidRecord?.certificates || []);
    const faRows = faCerts.length
      ? faCerts.map(c =>
          `<tr><td>${esc(c.certificate_number || '')}</td><td>${esc((c.attainments || []).join(', '))}</td><td>${esc(formatDate(c.issue_date))}</td><td>${esc(formatDate(c.expiry_date))}</td><td>${esc(c.issuer || '')}</td></tr>`
        ).join('')
      : '<tr><td colspan="5" style="text-align:center;color:#777;">— No first-aid certificates on file —</td></tr>';

    const tmRows = trainingRows.length
      ? trainingRows.map(t =>
          `<tr><td>${esc(t.matrix_name)}</td><td>${esc(t.skill_name)}</td><td>${esc(t.score)}</td><td>${esc(formatDate(t.reviewed_date))}</td></tr>`
        ).join('')
      : '<tr><td colspan="4" style="text-align:center;color:#777;">— No training records on file —</td></tr>';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>Compliance Report — ${esc(fullName)}</title>
      <style>
        @page { size: A4 portrait; margin: 12mm; }
        body { font-family: Arial, sans-serif; color: #111; font-size: 10pt; }
        h1 { font-size: 16pt; margin: 0 0 2mm 0; }
        h2 { font-size: 11pt; margin: 6mm 0 2mm 0; color: #b91c1c; border-bottom: 1px solid #ccc; padding-bottom: 1mm; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
        th, td { border: 1px solid #333; padding: 3px 6px; font-size: 9pt; text-align: left; }
        th { background: #f3f4f6; }
        .meta { color: #555; font-size: 9pt; margin-bottom: 4mm; }
      </style></head><body>
      <h1>Employee Compliance Report</h1>
      <div class="meta">
        <strong>Name:</strong> ${esc(fullName)} &nbsp;&nbsp;
        <strong>Employee #:</strong> ${esc(employee?.employee_number || '')} &nbsp;&nbsp;
        <strong>Role:</strong> ${esc(employee?.role || '')} &nbsp;&nbsp;
        <strong>Department:</strong> ${esc(employee?.department || '')} &nbsp;&nbsp;
        <strong>Generated:</strong> ${esc(formatDate(new Date().toISOString()))}
      </div>
      <h2>Forklift Licenses (QMSF 29)</h2>
      <table><thead><tr><th>License #</th><th>Issue Date</th><th>Expiry</th><th>Status</th></tr></thead><tbody>${flRows}</tbody></table>
      <h2>First Aid Certificates (QMSF 30)</h2>
      <table><thead><tr><th>Cert #</th><th>Attainments</th><th>Issue</th><th>Expiry</th><th>Issuer</th></tr></thead><tbody>${faRows}</tbody></table>
      <h2>Training Matrix Records (QMSF 13)</h2>
      <table><thead><tr><th>Matrix</th><th>Skill</th><th>Score</th><th>Reviewed</th></tr></thead><tbody>${tmRows}</tbody></table>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (_) { /* blocked */ } }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" data-testid="employee-compliance-modal">
        <DialogHeader>
          <DialogTitle>Compliance Report — {fullName}</DialogTitle>
          <DialogDescription>
            {employee?.employee_number} · {employee?.role || '—'} · {employee?.department || '—'}
          </DialogDescription>
        </DialogHeader>

        {loading && <div className="text-sm text-gray-500 py-4">Loading compliance records…</div>}

        {!loading && (
          <div className="space-y-4">
            {/* Forklift Licenses */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Truck className="w-4 h-4 text-blue-600" />
                  Forklift Licenses
                  <span className="text-xs text-gray-500 font-normal">({forkliftLicenses.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {forkliftLicenses.length === 0 ? (
                  <p className="text-sm text-gray-500">No forklift licenses on file.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-2 border">License #</th>
                        <th className="text-left p-2 border">Issue Date</th>
                        <th className="text-left p-2 border">Expiry Date</th>
                        <th className="text-left p-2 border">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forkliftLicenses.map(l => (
                        <tr key={l.id}>
                          <td className="p-2 border font-mono">{l.license_number || ''}</td>
                          <td className="p-2 border">{formatDate(l.issue_date)}</td>
                          <td className="p-2 border">{formatDate(l.expiry_date)}</td>
                          <td className="p-2 border"><StatusBadge status={l.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            {/* First Aid Certificates */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <HeartHandshake className="w-4 h-4 text-red-600" />
                  First Aid Certificates
                  <span className="text-xs text-gray-500 font-normal">
                    ({(firstAidRecord?.certificates || []).length} renewals
                    {firstAidRecord ? <> · <StatusBadge status={firstAidRecord.status} /></> : ''})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!firstAidRecord ? (
                  <p className="text-sm text-gray-500">No first-aid record on file.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-2 border">Cert #</th>
                        <th className="text-left p-2 border">Attainments</th>
                        <th className="text-left p-2 border">Issue</th>
                        <th className="text-left p-2 border">Expiry</th>
                        <th className="text-left p-2 border">Issuer</th>
                        <th className="text-left p-2 border">File</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(firstAidRecord.certificates || []).map(c => (
                        <tr key={c.id}>
                          <td className="p-2 border font-mono">{c.certificate_number || ''}</td>
                          <td className="p-2 border">
                            {(c.attainments || []).map(a => <span key={a} className="inline-block text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded mr-1">{a}</span>)}
                          </td>
                          <td className="p-2 border whitespace-nowrap">{formatDate(c.issue_date)}</td>
                          <td className="p-2 border whitespace-nowrap">{formatDate(c.expiry_date)}</td>
                          <td className="p-2 border">{c.issuer || ''}</td>
                          <td className="p-2 border">
                            {c.file_id ? (
                              <button onClick={() => downloadCert(c.file_id, c.file_name)} className="text-green-700 hover:underline inline-flex items-center gap-1">
                                <Download className="w-3.5 h-3.5" /> <span className="truncate max-w-[140px]" title={c.file_name}>{c.file_name}</span>
                              </button>
                            ) : <span className="text-xs text-gray-400">— no file —</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            {/* Training Matrix */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Award className="w-4 h-4 text-amber-600" />
                  Training Matrix Records
                  <span className="text-xs text-gray-500 font-normal">({trainingRows.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {trainingRows.length === 0 ? (
                  <p className="text-sm text-gray-500">No training matrix records found for this employee.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-2 border">Matrix</th>
                        <th className="text-left p-2 border">Skill</th>
                        <th className="text-left p-2 border">Score</th>
                        <th className="text-left p-2 border">Last Reviewed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trainingRows.map((t, i) => (
                        <tr key={i}>
                          <td className="p-2 border">{t.matrix_name}</td>
                          <td className="p-2 border">{t.skill_name}</td>
                          <td className="p-2 border font-mono">{t.score}</td>
                          <td className="p-2 border">{formatDate(t.reviewed_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handlePrint} data-testid="compliance-print">
            <Printer className="w-4 h-4 mr-2" /> Print Compliance Report
          </Button>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EmployeeComplianceModal;
