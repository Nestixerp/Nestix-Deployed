import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import api from '../services/api';
import { formatDate } from '../utils/dateFormatter';

const Stat = ({ label, value, tone = 'blue', testid }) => (
  <Card className={`border-l-4 border-l-${tone}-600`}>
    <CardContent className="pt-4 pb-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-3xl font-bold text-${tone}-700`} data-testid={testid}>{value}</div>
    </CardContent>
  </Card>
);

export default function AuditDashboard() {
  const [s, setS] = useState(null);
  const [open, setOpen] = useState([]);
  const [transition, setTransition] = useState(null);

  useEffect(() => {
    api.get('/audits/dashboard/summary').then(r => setS(r.data));
    api.get('/audits/reports/open-findings').then(r => setOpen(r.data.items));
    api.get('/standards-library/transition-report').then(r => setTransition(r.data));
  }, []);

  if (!s) return <div className="p-6 text-gray-500">Loading dashboard…</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="audit-dashboard-page">
      <div>
        <h1 className="text-3xl font-bold">IMS Audit Dashboard</h1>
        <p className="text-gray-600 text-sm mt-1">Audit coverage, findings, corrective actions, transition progress and asset compliance at a glance.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total Audits" value={s.total_audits} testid="dash-total-audits" />
        <Stat label="Locked / Completed" value={s.locked_audits} tone="gray" testid="dash-locked" />
        <Stat label="Open Findings" value={s.open_findings} tone="amber" testid="dash-open-findings" />
        <Stat label="Overdue Findings" value={s.overdue_findings} tone="red" testid="dash-overdue-findings" />
        <Stat label="Total Clauses / Findings" value={s.total_findings} testid="dash-total-findings" />
        <Stat label="Clauses with No Evidence" value={s.clauses_no_evidence} tone="amber" testid="dash-no-evidence" />
        <Stat label="Repeat Findings" value={s.repeat_findings} tone="red" testid="dash-repeat" />
        <Stat label="CA Closure Rate" value={s.corrective_action_closure_rate != null ? `${s.corrective_action_closure_rate}%` : '—'} tone="green" testid="dash-ca-rate" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Findings by Severity</CardTitle></CardHeader>
          <CardContent>
            {Object.entries(s.findings_by_severity || {}).map(([sev, n]) => (
              <div key={sev} className="flex items-center gap-2 mb-2">
                <span className="w-16 text-xs font-semibold">{sev}</span>
                <div className="flex-1 bg-gray-100 rounded h-4 overflow-hidden">
                  <div className={`h-4 ${sev === 'Critical' ? 'bg-red-600' : sev === 'High' ? 'bg-red-400' : sev === 'Medium' ? 'bg-amber-400' : 'bg-green-400'}`}
                    style={{ width: `${Math.min(100, n * 12)}%` }} />
                </div>
                <span className="text-sm font-bold w-6 text-right" data-testid={`dash-sev-${sev.toLowerCase()}`}>{n}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Asset Compliance & Transition</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[['Fire equipment checks overdue', s.assets_overdue?.fire_equipment], ['Test & tag checks overdue', s.assets_overdue?.test_tag],
              ['First aid inspections overdue', s.assets_overdue?.first_aid], ['Spill kit inspections overdue', s.assets_overdue?.spill_kit]].map(([l, v]) => (
              <div key={l} className="flex justify-between border-b pb-1">
                <span className="text-gray-600">{l}</span>
                <span className={`font-bold ${v > 0 ? 'text-red-600' : 'text-green-700'}`}>{v ?? 0}</span>
              </div>
            ))}
            <div className="flex justify-between pt-1">
              <span className="text-gray-600">Transition progress (gap items closed)</span>
              <span className="font-bold text-blue-700" data-testid="dash-transition">{transition ? `${transition.closed}/${transition.total} (${transition.progress_percent}%)` : '—'}</span>
            </div>
            <div className="pt-2 flex gap-3 text-xs">
              <Link to="/quality/asset-registers" className="text-blue-600 hover:underline">Asset Registers →</Link>
              <Link to="/quality/standards-library" className="text-blue-600 hover:underline">Standards Library →</Link>
              <Link to="/quality/audit-templates" className="text-blue-600 hover:underline">Audit Templates →</Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Open Findings Report ({open.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr>
              {['Audit', 'Clause', 'Title', 'Finding type', 'Risk', 'Responsible', 'Due date', 'Days overdue', 'Status'].map(h => <th key={h} className="text-left p-2 border">{h}</th>)}
            </tr></thead>
            <tbody>
              {open.map(f => (
                <tr key={f.finding_id} className="hover:bg-gray-50">
                  <td className="p-2 border"><Link className="text-blue-600 hover:underline" to={`/quality/audits/${f.report_id}`}>{f.audit_number || f.report_id}</Link></td>
                  <td className="p-2 border font-mono">{f.clause}</td>
                  <td className="p-2 border text-xs">{f.clause_title}</td>
                  <td className="p-2 border text-xs font-semibold">{f.finding_type}</td>
                  <td className="p-2 border text-xs">{f.risk_rating || ''}</td>
                  <td className="p-2 border text-xs">{f.responsible_person || ''}</td>
                  <td className="p-2 border text-xs">{formatDate(f.due_date)}</td>
                  <td className={`p-2 border text-xs ${f.days_overdue > 0 ? 'text-red-600 font-bold' : ''}`}>{f.days_overdue ?? ''}</td>
                  <td className="p-2 border text-xs">{f.status}</td>
                </tr>
              ))}
              {open.length === 0 && <tr><td colSpan={9} className="text-center text-gray-500 py-6">No open findings. 🎉</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
