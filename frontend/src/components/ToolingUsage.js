import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { BarChart3 } from 'lucide-react';
import api from '../services/api';

const UsageColumn = ({ title, rows }) => {
  const max = Math.max(1, ...rows.map(r => r.jobs));
  return (
    <div className="flex-1 min-w-[280px]">
      <h4 className="font-medium text-xs uppercase tracking-wide text-slate-500 mb-2">{title}</h4>
      {rows.length === 0 && <p className="text-xs text-slate-400">No usage recorded yet — counts build as jobs are completed.</p>}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} data-testid={`usage-row-${title.replace(/\s+/g, '-')}-${i}`}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold">{r.name}</span>
              <span className="text-slate-500">
                {r.jobs} job{r.jobs === 1 ? '' : 's'} · {r.parts} parts
                {r.last_used ? ` · last ${new Date(r.last_used).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: '2-digit' })}` : ''}
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded mt-0.5">
              <div className="h-1.5 rounded bg-emerald-600" style={{ width: `${(r.jobs / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const ToolingUsage = () => {
  const [report, setReport] = useState(null);

  useEffect(() => {
    api.get('/tooling/usage-report').then(r => setReport(r.data)).catch(() => {});
  }, []);

  if (!report) return null;

  return (
    <Card data-testid="tooling-usage-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4" /> Tooling Usage Report
        </CardTitle>
        <p className="text-xs text-slate-500">
          Which punches and dies get used most — handy for deciding what to duplicate or replace. Counts come from completed job sheets.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-8">
          <UsageColumn title="Top Punches" rows={report.top_punches || []} />
          <UsageColumn title="V Dies" rows={report.v_dies || []} />
        </div>
      </CardContent>
    </Card>
  );
};
