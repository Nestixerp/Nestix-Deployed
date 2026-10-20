import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Gauge, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../services/api';

const fmtHours = (mins) => {
  if (!mins) return '0h';
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const fmtDue = (d) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' }); } catch { return '—'; }
};

const JobList = ({ jobs, machines, onAssign }) => (
  <table className="w-full text-xs mt-2">
    <thead>
      <tr className="text-slate-400 text-left">
        <th className="py-0.5 pr-2 font-medium">Job #</th>
        <th className="py-0.5 pr-2 font-medium">Part</th>
        <th className="py-0.5 pr-2 font-medium">Qty</th>
        <th className="py-0.5 pr-2 font-medium">Due</th>
        <th className="py-0.5 pr-2 font-medium">Status</th>
        {onAssign && <th className="py-0.5 font-medium">Assign to…</th>}
      </tr>
    </thead>
    <tbody>
      {jobs.map((j, i) => (
        <tr key={i} className="border-t">
          <td className="py-1 pr-2 font-semibold">{j.job_sheet_number}</td>
          <td className="py-1 pr-2 truncate max-w-[220px]">{j.part_description}</td>
          <td className="py-1 pr-2">{j.quantity}</td>
          <td className="py-1 pr-2">{fmtDue(j.due_date)}</td>
          <td className="py-1 pr-2"><Badge variant="outline" className="text-[10px]">{j.status}</Badge></td>
          {onAssign && (
            <td className="py-1">
              <select
                className="h-7 text-xs border rounded px-1 bg-white"
                defaultValue=""
                onChange={(e) => e.target.value && onAssign(j, e.target.value)}
                data-testid={`assign-machine-${j.job_sheet_number}`}
              >
                <option value="">Select machine…</option>
                {machines.map(m => (
                  <option key={m.id} value={m.id}>{m.machine_name}</option>
                ))}
              </select>
            </td>
          )}
        </tr>
      ))}
    </tbody>
  </table>
);

const MachineBlock = ({ title, badge, data, maxJobs, highlight, machines, onAssign }) => {
  const [open, setOpen] = useState(!!onAssign);
  const pct = maxJobs > 0 ? Math.min(100, (data.open_jobs / maxJobs) * 100) : 0;
  return (
    <div className={`border rounded-lg p-3 ${highlight ? 'border-amber-300 bg-amber-50/50' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm">{title}</span>
          {badge && <Badge variant="outline" className="text-[10px]">{badge}</Badge>}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span><strong>{data.open_jobs}</strong> open</span>
          <span>{data.total_parts} parts</span>
          <span>{fmtHours(data.est_minutes)} est.</span>
          {data.jobs.length > 0 && (
            <button className="p-0.5 text-slate-400 hover:text-slate-700" onClick={() => setOpen(!open)}
              data-testid={`workload-toggle-${title.replace(/\s+/g, '-')}`}>
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
      <div className="h-1.5 bg-slate-100 rounded mt-2">
        <div className={`h-1.5 rounded ${highlight ? 'bg-amber-500' : 'bg-blue-600'}`} style={{ width: `${pct}%` }} />
      </div>
      {open && data.jobs.length > 0 && <JobList jobs={data.jobs} machines={machines} onAssign={onAssign} />}
    </div>
  );
};

export const MachineWorkload = () => {
  const [workload, setWorkload] = useState(null);
  const [machines, setMachines] = useState([]);

  const load = () => {
    api.get('/job-sheets/machine-workload/summary').then(r => setWorkload(r.data)).catch(() => {});
  };
  useEffect(() => {
    load();
    api.get('/machines').then(r =>
      setMachines((r.data || []).filter(m => /press/i.test(m.machine_type || '') && m.status === 'Active'))
    ).catch(() => {});
  }, []);

  const assignJob = async (job, machineId) => {
    const machine = machines.find(m => m.id === machineId);
    if (!machine) return;
    if (!window.confirm(`Assign ${job.job_sheet_number} to ${machine.machine_name}?`)) return;
    try {
      await api.put(`/job-sheets/${job.id}`, { machine_id: machine.id, machine_name: machine.machine_name });
      load();
    } catch { alert('Failed to assign job to machine'); }
  };

  if (!workload) return null;
  const maxJobs = Math.max(1, ...workload.machines.map(m => m.open_jobs), workload.unassigned.open_jobs);

  return (
    <Card data-testid="machine-workload-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4" /> Press Brake Workload
        </CardTitle>
        <p className="text-xs text-slate-500">Open jobs per machine — assign unassigned jobs to a machine directly from here.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {workload.machines.map(m => (
          <MachineBlock key={m.machine_id}
            title={m.machine_name}
            badge={[m.tooling_system, m.machine_status !== 'Active' ? m.machine_status : null].filter(Boolean).join(' · ')}
            data={m} maxJobs={maxJobs} />
        ))}
        {workload.unassigned.open_jobs > 0 && (
          <MachineBlock title="Not assigned to a machine" data={workload.unassigned} maxJobs={maxJobs}
            highlight machines={machines} onAssign={assignJob} />
        )}
      </CardContent>
    </Card>
  );
};
