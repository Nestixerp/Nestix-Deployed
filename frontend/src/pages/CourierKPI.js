import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Plus, Save, Trash2, Edit3, FileDown, Truck, X } from 'lucide-react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import api from '../services/api';
import {
  getControlledDocumentByModule,
  buildDocControlFooter,
  buildPrintFooterCss,
  buildPrintBodyOpen,
  buildPrintBodyClose,
} from '../utils/documentControl';
import { formatDate } from '../utils/dateFormatter';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Title, Tooltip, Legend, Filler
);

const MODULE_NAME = 'Courier KPI';

// Empty entry template for new-row editing
const emptyEntry = (courierId, month) => ({
  courier_id: courierId,
  month,
  on_time_3hr_percent: '',
  late_3hr_percent: '',
  on_time_4hr_percent: '',
  late_4hr_percent: '',
  total_jobs: '',
  notes: '',
});

// Format 'YYYY-MM' → 'Jul-25' (title case for tables)
const prettyMonth = (key) => {
  if (!key) return '';
  const [y, m] = key.split('-').map(Number);
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[m - 1]}-${String(y).slice(-2)}`;
};

// Current month key
const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const CourierKPI = () => {
  const [period, setPeriod] = useState('rolling'); // 'rolling' | 'calendar'
  const [endMonth, setEndMonth] = useState(currentMonthKey());
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('by-courier');
  const [printMode, setPrintMode] = useState(false);  // renders an offscreen chart stage for print capture

  // Courier management
  const [courierDialogOpen, setCourierDialogOpen] = useState(false);
  const [editingCourier, setEditingCourier] = useState(null);
  const [courierForm, setCourierForm] = useState({ name: '', code: '', color: '#3b82f6' });

  // KPI entry editing
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [entryForm, setEntryForm] = useState(emptyEntry('', currentMonthKey()));

  useEffect(() => {
    fetchData();
  }, [period, endMonth, year]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = period === 'calendar' ? { period, year } : { period, end_month: endMonth };
      const res = await api.get('/courier-kpi/data', { params });
      setData(res.data);
      if (res.data.couriers.length > 0
        && activeTab !== 'manage'
        && activeTab !== 'compare'
        && !res.data.couriers.find((c) => c.id === activeTab)) {
        setActiveTab(res.data.couriers[0].id);
      } else if (res.data.couriers.length === 0) {
        setActiveTab('manage');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const couriers = data?.couriers || [];
  const months = data?.months || [];

  // ─── Chart data builders ─────────────────────────────────────────────

  const buildSingleCourierChartData = (courierId, kind /* '3hr'|'4hr' */) => {
    if (!data) return null;
    const series = kind === '3hr' ? data.series_3hr : data.series_4hr;
    const c = couriers.find((x) => x.id === courierId);
    if (!c) return null;
    const s = series[courierId];
    return {
      labels: months.map((m) => m.label),
      datasets: [
        {
          label: 'ON TIME',
          data: s?.on_time || [],
          borderColor: '#dc2626',
          backgroundColor: '#dc2626',
          pointBackgroundColor: '#dc2626',
          pointRadius: 5,
          pointHoverRadius: 8,
          borderWidth: 3,
          tension: 0.35,
          spanGaps: true,
        },
        {
          label: 'LATE',
          data: s?.late || [],
          borderColor: '#1e40af',
          backgroundColor: '#1e40af',
          pointBackgroundColor: '#1e40af',
          pointRadius: 5,
          pointHoverRadius: 8,
          borderWidth: 3,
          tension: 0.35,
          spanGaps: true,
        },
      ],
    };
  };

  const buildComparisonLineData = (kind /* '3hr'|'4hr' */, metric /* 'on_time'|'late' */) => {
    if (!data) return null;
    const series = kind === '3hr' ? data.series_3hr : data.series_4hr;
    return {
      labels: months.map((m) => m.label),
      datasets: couriers.map((c) => ({
        label: c.name,
        data: (series[c.id]?.[metric]) || [],
        borderColor: c.color,
        backgroundColor: c.color,
        pointBackgroundColor: c.color,
        pointRadius: 6,
        pointHoverRadius: 9,
        borderWidth: 3,
        tension: 0.3,
        spanGaps: true,
      })),
    };
  };

  const buildComparisonBarData = (kind, metric) => {
    if (!data) return null;
    const series = kind === '3hr' ? data.series_3hr : data.series_4hr;
    return {
      labels: months.map((m) => m.label),
      datasets: couriers.map((c) => ({
        label: c.name,
        data: (series[c.id]?.[metric]) || [],
        backgroundColor: c.color,
        borderColor: c.color,
        borderWidth: 1,
      })),
    };
  };

  const singleChartOptions = (title, dataLabelColor) => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    // Extra top padding so labels sitting above the 100% point aren't clipped
    layout: { padding: { top: 24, right: 12, left: 4, bottom: 4 } },
    plugins: {
      legend: { position: 'bottom', labels: { font: { size: 13, weight: 'bold' } } },
      title: {
        display: true,
        text: title,
        color: '#ffffff',
        backgroundColor: '#1e3a8a',
        font: { size: 15, weight: 'bold' },
        padding: 10,
      },
      datalabels: {
        display: (ctx) => ctx.dataset.data[ctx.dataIndex] !== null && ctx.dataset.data[ctx.dataIndex] !== undefined,
        // Sit ABOVE the point rather than inside it, so long values like 73.33% aren't clipped
        anchor: 'end',
        align: 'top',
        offset: 8,
        clip: false,
        clamp: true,
        color: (ctx) => ctx.dataset.borderColor || '#111',
        backgroundColor: 'rgba(255,255,255,0.92)',
        borderColor: (ctx) => ctx.dataset.borderColor || '#111',
        borderWidth: 1,
        borderRadius: 4,
        padding: { top: 2, bottom: 2, left: 5, right: 5 },
        font: { weight: 'bold', size: 11 },
        formatter: (v) => {
          if (v === null || v === undefined) return '';
          // Round to 1 decimal, drop trailing .0
          const rounded = Math.round(Number(v) * 10) / 10;
          return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y ?? '—'}%`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        title: { display: true, text: 'PERCENTAGE', color: '#b91c1c', font: { weight: 'bold', size: 13 } },
        ticks: { callback: (v) => `${v}%` },
      },
      x: {
        title: { display: true, text: 'MONTH', font: { weight: 'bold', size: 12 } },
      },
    },
  });

  const comparisonLineOptions = (title) => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { position: 'top', labels: { font: { size: 13, weight: 'bold' } } },
      title: { display: true, text: title, font: { size: 15, weight: 'bold' }, color: '#1e3a8a' },
      datalabels: { display: false },
      tooltip: {
        callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y ?? '—'}%` },
      },
    },
    scales: {
      y: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%` } },
    },
  });

  const comparisonBarOptions = (title) => ({
    ...comparisonLineOptions(title),
    scales: {
      y: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%` } },
      x: { stacked: false },
    },
  });

  // ─── Courier CRUD ────────────────────────────────────────────────────

  const openNewCourier = () => {
    setEditingCourier(null);
    setCourierForm({ name: '', code: '', color: '#3b82f6' });
    setCourierDialogOpen(true);
  };

  const openEditCourier = (c) => {
    setEditingCourier(c);
    setCourierForm({ name: c.name, code: c.code || '', color: c.color || '#3b82f6' });
    setCourierDialogOpen(true);
  };

  const saveCourier = async () => {
    if (!courierForm.name.trim()) {
      alert('Courier name is required');
      return;
    }
    try {
      if (editingCourier) {
        await api.put(`/courier-kpi/couriers/${editingCourier.id}`, courierForm);
      } else {
        await api.post('/courier-kpi/couriers', courierForm);
      }
      setCourierDialogOpen(false);
      fetchData();
    } catch (e) {
      alert('Failed: ' + (e.response?.data?.detail || e.message));
    }
  };

  const deleteCourier = async (c) => {
    if (!window.confirm(`Deactivate "${c.name}"?\n\nHistorical KPI entries will be preserved but the courier will no longer appear in charts.`)) return;
    try {
      await api.delete(`/courier-kpi/couriers/${c.id}`);
      fetchData();
    } catch (e) {
      alert('Failed: ' + (e.response?.data?.detail || e.message));
    }
  };

  // ─── Entry CRUD ──────────────────────────────────────────────────────

  const openEntryEditor = (courierId, monthKey, existing = null) => {
    setEntryForm({
      courier_id: courierId,
      month: monthKey,
      on_time_3hr_percent: existing?.on_time_3hr_percent ?? '',
      late_3hr_percent: existing?.late_3hr_percent ?? '',
      on_time_4hr_percent: existing?.on_time_4hr_percent ?? '',
      late_4hr_percent: existing?.late_4hr_percent ?? '',
      total_jobs: existing?.total_jobs ?? '',
      notes: existing?.notes ?? '',
    });
    setEntryDialogOpen(true);
  };

  const saveEntry = async () => {
    const payload = {
      courier_id: entryForm.courier_id,
      month: entryForm.month,
      on_time_3hr_percent: entryForm.on_time_3hr_percent === '' ? null : parseFloat(entryForm.on_time_3hr_percent),
      late_3hr_percent: entryForm.late_3hr_percent === '' ? null : parseFloat(entryForm.late_3hr_percent),
      on_time_4hr_percent: entryForm.on_time_4hr_percent === '' ? null : parseFloat(entryForm.on_time_4hr_percent),
      late_4hr_percent: entryForm.late_4hr_percent === '' ? null : parseFloat(entryForm.late_4hr_percent),
      total_jobs: entryForm.total_jobs === '' ? null : parseInt(entryForm.total_jobs, 10),
      notes: entryForm.notes,
    };
    try {
      await api.put('/courier-kpi/entries', payload);
      setEntryDialogOpen(false);
      fetchData();
    } catch (e) {
      alert('Failed: ' + (e.response?.data?.detail || e.message));
    }
  };

  // Get existing entry cell value by courier + month + field
  const cellValue = (courierId, monthKey, kind, metric) => {
    if (!data) return null;
    const series = kind === '3hr' ? data.series_3hr : data.series_4hr;
    const monthIdx = months.findIndex((m) => m.key === monthKey);
    if (monthIdx < 0) return null;
    const arr = series[courierId]?.[metric];
    return arr ? arr[monthIdx] : null;
  };

  const existingEntryFor = (courierId, monthKey) => {
    return {
      on_time_3hr_percent: cellValue(courierId, monthKey, '3hr', 'on_time'),
      late_3hr_percent: cellValue(courierId, monthKey, '3hr', 'late'),
      on_time_4hr_percent: cellValue(courierId, monthKey, '4hr', 'on_time'),
      late_4hr_percent: cellValue(courierId, monthKey, '4hr', 'late'),
    };
  };

  // ─── PRINT ───────────────────────────────────────────────────────────

  const handlePrint = async () => {
    try {
      // 1) Mount the offscreen print stage so all charts render at proper size
      setPrintMode(true);
      // Wait 2 animation frames + a small settle time for Chart.js to draw
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 400));

      const doc = await getControlledDocumentByModule(MODULE_NAME, {
        fallback: 'Courier KPI',
        docType: 'Form',
      });
      const footer = buildDocControlFooter(doc, { title: 'Courier KPI — Delivery Performance' });

      const captureCanvas = (id) => {
        const el = document.getElementById(id);
        if (!el) return '';
        const canvas = el.querySelector('canvas');
        return canvas ? canvas.toDataURL('image/png', 1.0) : '';
      };

      // Capture from the OFFSCREEN print stage (ck-print-* ids) — always mounted at fixed size
      const perCourierBlocks = couriers
        .map((c) => {
          const img3 = captureCanvas(`ck-print-3hr-${c.id}`);
          const img4 = captureCanvas(`ck-print-4hr-${c.id}`);
          const avg3On = data.series_3hr[c.id]?.avg_on_time;
          const avg3Late = data.series_3hr[c.id]?.avg_late;
          const avg4On = data.series_4hr[c.id]?.avg_on_time;
          const avg4Late = data.series_4hr[c.id]?.avg_late;
          return `
            <div class="page-break"></div>
            <h2>${c.name} — 3 Hours KPI</h2>
            ${img3 ? `<img class="chart" src="${img3}" />` : '<p>No chart</p>'}
            <p class="avg">Average: ON TIME <b>${avg3On ?? '—'}%</b> &nbsp;·&nbsp; LATE <b>${avg3Late ?? '—'}%</b></p>
            <h2>${c.name} — 4 Hours KPI</h2>
            ${img4 ? `<img class="chart" src="${img4}" />` : '<p>No chart</p>'}
            <p class="avg">Average: ON TIME <b>${avg4On ?? '—'}%</b> &nbsp;·&nbsp; LATE <b>${avg4Late ?? '—'}%</b></p>
          `;
        })
        .filter(Boolean)
        .join('');

      // Comparison charts — read from offscreen print stage (always mounted)
      const cmp3On = captureCanvas('ck-print-cmp-3hr-ontime');
      const cmp4On = captureCanvas('ck-print-cmp-4hr-ontime');
      const cmpBar3 = captureCanvas('ck-print-cmp-bar-3hr');
      const cmpBar4 = captureCanvas('ck-print-cmp-bar-4hr');

      const compareBlock = (cmp3On || cmp4On || cmpBar3 || cmpBar4) ? `
        <div class="page-break"></div>
        <h1>Comparison — All Couriers</h1>
        ${cmp3On ? `<h2>3 Hours — ON TIME %</h2><img class="chart" src="${cmp3On}" />` : ''}
        ${cmp4On ? `<h2>4 Hours — ON TIME %</h2><img class="chart" src="${cmp4On}" />` : ''}
        ${cmpBar3 ? `<h2>3 Hours — Monthly Bar Comparison</h2><img class="chart" src="${cmpBar3}" />` : ''}
        ${cmpBar4 ? `<h2>4 Hours — Monthly Bar Comparison</h2><img class="chart" src="${cmpBar4}" />` : ''}
      ` : '';

      const periodLabel = period === 'calendar'
        ? `Calendar Year ${year}`
        : `Rolling 12 Months (${months[0]?.label} → ${months[11]?.label})`;

      const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Courier KPI Report</title>
<style>
  ${buildPrintFooterCss()}
  body { color: #111; }
  h1 { font-size: 18pt; margin: 0 0 4mm 0; text-align: center; }
  h2 { font-size: 12pt; margin: 6mm 0 2mm 0; color: #1e3a8a; }
  .meta { text-align: center; font-size: 9pt; color: #444; margin-bottom: 4mm; }
  .avg { font-size: 10pt; text-align: center; margin: 2mm 0 4mm 0; color: #7f1d1d; }
  img.chart { width: 100%; max-width: 100%; height: auto; display: block; }
  .page-break { page-break-after: always; }
</style></head>
<body>
${buildPrintBodyOpen(footer)}
  <h1>Courier KPI — Delivery Performance</h1>
  <div class="meta">${periodLabel} &nbsp;•&nbsp; Printed: ${formatDate(new Date().toISOString())}</div>
  ${perCourierBlocks || '<p>No courier data available.</p>'}
  ${compareBlock}
${buildPrintBodyClose()}
</body></html>`;

      const w = window.open('', '_blank');
      if (!w) { setPrintMode(false); return; }
      w.document.open();
      w.document.write(html);
      w.document.close();
      setTimeout(() => { try { w.focus(); w.print(); } catch (err) { /* print blocked */ } }, 500);
    } catch (e) {
      console.error(e);
      alert('Failed to print');
    } finally {
      // Unmount the offscreen print stage
      setPrintMode(false);
    }
  };

  // ─── Header controls ─────────────────────────────────────────────────

  const periodLabel = period === 'calendar'
    ? `Calendar Year ${year}`
    : `Rolling 12 Months ending ${prettyMonth(endMonth)}`;

  return (
    <div className="p-6 space-y-6" data-testid="courier-kpi-page">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Truck className="w-8 h-8 text-blue-700" /> Courier KPI
          </h1>
          <p className="text-slate-600 mt-1">
            Track 3-hour and 4-hour on-time delivery performance across your courier fleet.
          </p>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <Label className="text-xs text-slate-500">Period</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-44" data-testid="ck-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rolling">Rolling 12 Months</SelectItem>
                <SelectItem value="calendar">Calendar Year</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {period === 'rolling' ? (
            <div>
              <Label className="text-xs text-slate-500">End Month</Label>
              <Input
                type="month"
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                className="w-40"
                data-testid="ck-end-month"
              />
            </div>
          ) : (
            <div>
              <Label className="text-xs text-slate-500">Year</Label>
              <Input
                type="number"
                min="2000"
                max="2100"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value) || new Date().getFullYear())}
                className="w-28"
                data-testid="ck-year"
              />
            </div>
          )}
          <Button onClick={handlePrint} data-testid="ck-print" className="bg-slate-900 hover:bg-slate-800">
            <FileDown className="w-4 h-4 mr-2" /> Print / PDF
          </Button>
        </div>
      </div>

      {loading && <div className="text-sm text-slate-500">Loading…</div>}

      {couriers.length === 0 && !loading && (
        <Card>
          <CardContent className="pt-6 text-center">
            <Truck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold mb-2">No couriers configured yet</h3>
            <p className="text-slate-600 mb-4">Add your courier companies to start tracking delivery KPIs.</p>
            <Button onClick={openNewCourier} data-testid="ck-empty-add-courier">
              <Plus className="w-4 h-4 mr-2" /> Add Courier
            </Button>
          </CardContent>
        </Card>
      )}

      {couriers.length > 0 && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto">
            {couriers.map((c) => (
              <TabsTrigger key={c.id} value={c.id} data-testid={`ck-tab-${c.name}`}>
                <span
                  className="inline-block w-3 h-3 rounded-full mr-2"
                  style={{ background: c.color }}
                />
                {c.name}
              </TabsTrigger>
            ))}
            <TabsTrigger value="compare" data-testid="ck-tab-compare">Comparison</TabsTrigger>
            <TabsTrigger value="manage" data-testid="ck-tab-manage">Manage Couriers</TabsTrigger>
          </TabsList>

          {/* PER-COURIER TABS */}
          {couriers.map((c) => (
            <TabsContent key={c.id} value={c.id} className="space-y-6">
              <div className="text-sm text-slate-600">{periodLabel}</div>

              {/* 3 HRS KPI */}
              <Card>
                <CardHeader className="bg-blue-50">
                  <CardTitle className="text-lg">
                    {c.name} KPI ({periodLabel}) — 3 HRS
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div id={`ck-chart-3hr-${c.id}`} style={{ height: 380 }}>
                    <Line
                      data={buildSingleCourierChartData(c.id, '3hr')}
                      options={singleChartOptions(`${c.name} KPI — 3 HRS`)}
                      plugins={[ChartDataLabels]}
                    />
                  </div>
                  <div className="mt-3 text-sm text-slate-700 flex flex-wrap gap-4">
                    <span><b>Average ON TIME:</b> {data.series_3hr[c.id]?.avg_on_time ?? '—'}%</span>
                    <span><b>Average LATE:</b> {data.series_3hr[c.id]?.avg_late ?? '—'}%</span>
                  </div>
                </CardContent>
              </Card>

              {/* 4 HRS KPI */}
              <Card>
                <CardHeader className="bg-amber-50">
                  <CardTitle className="text-lg">
                    {c.name} KPI ({periodLabel}) — 4 HRS
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div id={`ck-chart-4hr-${c.id}`} style={{ height: 380 }}>
                    <Line
                      data={buildSingleCourierChartData(c.id, '4hr')}
                      options={singleChartOptions(`${c.name} KPI — 4 HRS`)}
                      plugins={[ChartDataLabels]}
                    />
                  </div>
                  <div className="mt-3 text-sm text-slate-700 flex flex-wrap gap-4">
                    <span><b>Average ON TIME:</b> {data.series_4hr[c.id]?.avg_on_time ?? '—'}%</span>
                    <span><b>Average LATE:</b> {data.series_4hr[c.id]?.avg_late ?? '—'}%</span>
                  </div>
                </CardContent>
              </Card>

              {/* DATA TABLE */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Monthly Entries — {c.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-100">
                          <TableHead>Month</TableHead>
                          <TableHead className="text-right bg-blue-50">3HR On-Time %</TableHead>
                          <TableHead className="text-right bg-blue-50">3HR Late %</TableHead>
                          <TableHead className="text-right bg-amber-50">4HR On-Time %</TableHead>
                          <TableHead className="text-right bg-amber-50">4HR Late %</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {months.map((m) => {
                          const existing = existingEntryFor(c.id, m.key);
                          const hasData = existing.on_time_3hr_percent !== null || existing.on_time_4hr_percent !== null
                            || existing.late_3hr_percent !== null || existing.late_4hr_percent !== null;
                          return (
                            <TableRow key={m.key} data-testid={`ck-row-${c.id}-${m.key}`}>
                              <TableCell className="font-medium">{prettyMonth(m.key)}</TableCell>
                              <TableCell className="text-right">{existing.on_time_3hr_percent ?? '—'}</TableCell>
                              <TableCell className="text-right">{existing.late_3hr_percent ?? '—'}</TableCell>
                              <TableCell className="text-right">{existing.on_time_4hr_percent ?? '—'}</TableCell>
                              <TableCell className="text-right">{existing.late_4hr_percent ?? '—'}</TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openEntryEditor(c.id, m.key, existing)}
                                  data-testid={`ck-edit-${c.id}-${m.key}`}
                                >
                                  <Edit3 className="w-3.5 h-3.5 mr-1" />
                                  {hasData ? 'Edit' : 'Add'}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}

          {/* COMPARISON TAB */}
          <TabsContent value="compare" className="space-y-6">
            <div className="text-sm text-slate-600">{periodLabel} — All Couriers Overlay</div>

            <Card>
              <CardHeader className="bg-blue-50">
                <CardTitle>3 Hours — ON TIME % Comparison</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div id="ck-cmp-3hr-ontime" style={{ height: 380 }}>
                  <Line
                    data={buildComparisonLineData('3hr', 'on_time')}
                    options={comparisonLineOptions('3 Hours ON TIME — All Couriers')}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="bg-amber-50">
                <CardTitle>4 Hours — ON TIME % Comparison</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div id="ck-cmp-4hr-ontime" style={{ height: 380 }}>
                  <Line
                    data={buildComparisonLineData('4hr', 'on_time')}
                    options={comparisonLineOptions('4 Hours ON TIME — All Couriers')}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Monthly Bar Comparison — 3 HRS ON TIME</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div id="ck-cmp-bar-3hr" style={{ height: 380 }}>
                  <Bar
                    data={buildComparisonBarData('3hr', 'on_time')}
                    options={comparisonBarOptions('3 HRS ON TIME — Side by Side')}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Monthly Bar Comparison — 4 HRS ON TIME</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div id="ck-cmp-bar-4hr" style={{ height: 380 }}>
                  <Bar
                    data={buildComparisonBarData('4hr', 'on_time')}
                    options={comparisonBarOptions('4 HRS ON TIME — Side by Side')}
                  />
                </div>
              </CardContent>
            </Card>

            {/* AVERAGE SUMMARY */}
            <Card>
              <CardHeader>
                <CardTitle>Averages Summary ({periodLabel})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-100">
                      <TableHead>Courier</TableHead>
                      <TableHead className="text-right bg-blue-50">Avg 3HR On-Time</TableHead>
                      <TableHead className="text-right bg-blue-50">Avg 3HR Late</TableHead>
                      <TableHead className="text-right bg-amber-50">Avg 4HR On-Time</TableHead>
                      <TableHead className="text-right bg-amber-50">Avg 4HR Late</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {couriers.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <span className="inline-block w-3 h-3 rounded-full mr-2 align-middle" style={{ background: c.color }} />
                          <span className="font-medium">{c.name}</span>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{data.series_3hr[c.id]?.avg_on_time ?? '—'}%</TableCell>
                        <TableCell className="text-right">{data.series_3hr[c.id]?.avg_late ?? '—'}%</TableCell>
                        <TableCell className="text-right font-semibold">{data.series_4hr[c.id]?.avg_on_time ?? '—'}%</TableCell>
                        <TableCell className="text-right">{data.series_4hr[c.id]?.avg_late ?? '—'}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* MANAGE COURIERS TAB */}
          <TabsContent value="manage">
            <Card>
              <CardHeader className="flex flex-row justify-between items-center">
                <CardTitle>Manage Couriers</CardTitle>
                <Button onClick={openNewCourier} data-testid="ck-add-courier">
                  <Plus className="w-4 h-4 mr-2" /> Add Courier
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-100">
                      <TableHead>Colour</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Sort Order</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {couriers.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="w-6 h-6 rounded" style={{ background: c.color }} />
                        </TableCell>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{c.code || '—'}</TableCell>
                        <TableCell>{c.sort_order}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" className="mr-2" onClick={() => openEditCourier(c)} data-testid={`ck-edit-courier-${c.name}`}>
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => deleteCourier(c)} data-testid={`ck-delete-courier-${c.name}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* COURIER DIALOG */}
      <Dialog open={courierDialogOpen} onOpenChange={setCourierDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCourier ? `Edit ${editingCourier.name}` : 'Add Courier'}</DialogTitle>
            <DialogDescription>
              Set the courier&apos;s display name, an optional short code, and the colour used to identify it on charts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input
                value={courierForm.name}
                onChange={(e) => setCourierForm({ ...courierForm, name: e.target.value })}
                placeholder="e.g. JET Couriers"
                data-testid="ck-courier-name"
              />
            </div>
            <div>
              <Label>Code (optional)</Label>
              <Input
                value={courierForm.code}
                onChange={(e) => setCourierForm({ ...courierForm, code: e.target.value })}
                placeholder="e.g. JET"
                data-testid="ck-courier-code"
              />
            </div>
            <div>
              <Label>Chart Colour</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={courierForm.color}
                  onChange={(e) => setCourierForm({ ...courierForm, color: e.target.value })}
                  className="w-16 h-10 p-1"
                  data-testid="ck-courier-color"
                />
                <Input
                  value={courierForm.color}
                  onChange={(e) => setCourierForm({ ...courierForm, color: e.target.value })}
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCourierDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveCourier} data-testid="ck-save-courier">
              <Save className="w-4 h-4 mr-2" /> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ENTRY DIALOG */}
      <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {couriers.find((c) => c.id === entryForm.courier_id)?.name} — {prettyMonth(entryForm.month)}
            </DialogTitle>
            <DialogDescription>
              Enter the on-time and late delivery percentages for this month. Leave blank to skip.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded p-3">
              <h4 className="font-semibold text-blue-900 mb-2">3 Hours KPI</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>On-Time %</Label>
                  <Input
                    type="number" step="0.1" min="0" max="100"
                    value={entryForm.on_time_3hr_percent}
                    onChange={(e) => setEntryForm({ ...entryForm, on_time_3hr_percent: e.target.value })}
                    data-testid="ck-entry-on-3hr"
                  />
                </div>
                <div>
                  <Label>Late %</Label>
                  <Input
                    type="number" step="0.1" min="0" max="100"
                    value={entryForm.late_3hr_percent}
                    onChange={(e) => setEntryForm({ ...entryForm, late_3hr_percent: e.target.value })}
                    data-testid="ck-entry-late-3hr"
                  />
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded p-3">
              <h4 className="font-semibold text-amber-900 mb-2">4 Hours KPI</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>On-Time %</Label>
                  <Input
                    type="number" step="0.1" min="0" max="100"
                    value={entryForm.on_time_4hr_percent}
                    onChange={(e) => setEntryForm({ ...entryForm, on_time_4hr_percent: e.target.value })}
                    data-testid="ck-entry-on-4hr"
                  />
                </div>
                <div>
                  <Label>Late %</Label>
                  <Input
                    type="number" step="0.1" min="0" max="100"
                    value={entryForm.late_4hr_percent}
                    onChange={(e) => setEntryForm({ ...entryForm, late_4hr_percent: e.target.value })}
                    data-testid="ck-entry-late-4hr"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Total Jobs (optional)</Label>
                <Input
                  type="number" min="0"
                  value={entryForm.total_jobs}
                  onChange={(e) => setEntryForm({ ...entryForm, total_jobs: e.target.value })}
                />
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Input
                  value={entryForm.notes}
                  onChange={(e) => setEntryForm({ ...entryForm, notes: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntryDialogOpen(false)}>
              <X className="w-4 h-4 mr-2" /> Cancel
            </Button>
            <Button onClick={saveEntry} data-testid="ck-save-entry">
              <Save className="w-4 h-4 mr-2" /> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── OFFSCREEN PRINT STAGE ────────────────────────────────────
          Mounted only during printMode. Renders all charts at a fixed
          size so canvas.toDataURL() returns filled PNGs regardless of
          which tab the user was viewing when they clicked Print. */}
      {printMode && data && couriers.length > 0 && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: '-10000px',
            top: 0,
            width: '900px',
            pointerEvents: 'none',
          }}
        >
          {couriers.map((c) => (
            <div key={`print-${c.id}`}>
              <div id={`ck-print-3hr-${c.id}`} style={{ width: 900, height: 380 }}>
                <Line
                  data={buildSingleCourierChartData(c.id, '3hr')}
                  options={singleChartOptions(`${c.name} KPI — 3 HRS`)}
                  plugins={[ChartDataLabels]}
                />
              </div>
              <div id={`ck-print-4hr-${c.id}`} style={{ width: 900, height: 380 }}>
                <Line
                  data={buildSingleCourierChartData(c.id, '4hr')}
                  options={singleChartOptions(`${c.name} KPI — 4 HRS`)}
                  plugins={[ChartDataLabels]}
                />
              </div>
            </div>
          ))}
          <div id="ck-print-cmp-3hr-ontime" style={{ width: 900, height: 380 }}>
            <Line
              data={buildComparisonLineData('3hr', 'on_time')}
              options={comparisonLineOptions('3 Hours ON TIME — All Couriers')}
            />
          </div>
          <div id="ck-print-cmp-4hr-ontime" style={{ width: 900, height: 380 }}>
            <Line
              data={buildComparisonLineData('4hr', 'on_time')}
              options={comparisonLineOptions('4 Hours ON TIME — All Couriers')}
            />
          </div>
          <div id="ck-print-cmp-bar-3hr" style={{ width: 900, height: 380 }}>
            <Bar
              data={buildComparisonBarData('3hr', 'on_time')}
              options={comparisonBarOptions('3 HRS ON TIME — Side by Side')}
            />
          </div>
          <div id="ck-print-cmp-bar-4hr" style={{ width: 900, height: 380 }}>
            <Bar
              data={buildComparisonBarData('4hr', 'on_time')}
              options={comparisonBarOptions('4 HRS ON TIME — Side by Side')}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default CourierKPI;
