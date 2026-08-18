import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Edit, FileDown, RotateCcw, Save, X } from 'lucide-react';
import api from '../services/api';
import {
  getControlledDocumentByModule,
  buildDocControlFooter,
  buildPrintFooterCss,
  buildPrintBodyOpen,
  buildPrintBodyClose,
} from '../utils/documentControl';
import { formatDate } from '../utils/dateFormatter';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const MONTH_LABELS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// 3 distinct, print-friendly colours — oldest to newest year
const YEAR_COLORS = [
  { bg: 'rgba(148, 163, 184, 0.85)', border: 'rgb(100, 116, 139)' }, // slate
  { bg: 'rgba(251, 146, 60, 0.85)', border: 'rgb(234, 88, 12)' },    // orange
  { bg: 'rgba(59, 130, 246, 0.85)', border: 'rgb(29, 78, 216)' },    // blue
];

const MODULE_NAME = 'Injury Graph';

const InjuryGraph = () => {
  const currentYear = new Date().getFullYear();
  const [endYear, setEndYear] = useState(currentYear);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editYear, setEditYear] = useState(null);
  const [editType, setEditType] = useState('LTI');
  const [editValues, setEditValues] = useState(Array(12).fill(0));

  useEffect(() => {
    fetchData(endYear);
  }, [endYear]);

  const fetchData = async (yr) => {
    setLoading(true);
    try {
      const res = await api.get(`/injury-graph/data`, { params: { end_year: yr } });
      setData(res.data);
    } catch (e) {
      console.error('Failed to load injury graph', e);
    } finally {
      setLoading(false);
    }
  };

  const years = data?.years || [];

  const buildChartData = (kind /* 'lti' | 'mti' */) => {
    if (!data) return null;
    const series = data[kind] || {};
    return {
      labels: MONTH_LABELS,
      datasets: years.map((y, idx) => ({
        label: String(y),
        data: series[String(y)] || Array(12).fill(0),
        backgroundColor: YEAR_COLORS[idx % YEAR_COLORS.length].bg,
        borderColor: YEAR_COLORS[idx % YEAR_COLORS.length].border,
        borderWidth: 1,
      })),
    };
  };

  const chartOptions = (title) => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { position: 'top' },
      title: {
        display: true,
        text: title,
        font: { size: 16, weight: 'bold' },
        color: '#b91c1c',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { precision: 0, stepSize: 1 },
        title: { display: true, text: 'Number of Injuries' },
      },
    },
  });

  const ltiChart = useMemo(() => buildChartData('lti'), [data]);
  const mtiChart = useMemo(() => buildChartData('mti'), [data]);

  const totals = data?.totals || {};

  const openEdit = (yr, type) => {
    setEditYear(yr);
    setEditType(type);
    const series = type === 'LTI' ? data.lti : data.mti;
    setEditValues((series[String(yr)] || Array(12).fill(0)).slice());
    setEditMode(true);
  };

  const saveEdits = async () => {
    try {
      await api.put('/injury-graph/override-year', {
        year: editYear,
        type: editType,
        values: editValues.map((v) => parseInt(v) || 0),
      });
      setEditMode(false);
      fetchData(endYear);
    } catch (e) {
      console.error(e);
      alert('Failed to save');
    }
  };

  const clearOverrideYear = async () => {
    if (!window.confirm(`Reset ${editType} for ${editYear} to auto-aggregated values from Injury Register?`)) return;
    try {
      await api.delete(`/injury-graph/override-year/${editYear}/${editType}`);
      setEditMode(false);
      fetchData(endYear);
    } catch (e) {
      console.error(e);
      alert('Failed to reset');
    }
  };

  // ---- PRINT ----
  const handlePrint = async () => {
    try {
      const doc = await getControlledDocumentByModule(MODULE_NAME, { fallback: 'Injury Graph', docType: 'Form' });
      const footer = buildDocControlFooter(doc, {
        title: 'Injury Graph (LTI / MTI)',
      });

      // Capture chart canvases as PNG data URLs
      const captureCanvas = (id) => {
        const el = document.getElementById(id);
        if (!el) return '';
        const canvas = el.querySelector('canvas');
        if (!canvas) return '';
        return canvas.toDataURL('image/png', 1.0);
      };

      const ltiImg = captureCanvas('injury-lti-chart');
      const mtiImg = captureCanvas('injury-mti-chart');

      const totalsRows = years
        .map(
          (y) => `
        <tr>
          <td>${y}</td>
          <td style="text-align:right;">${(totals[String(y)]?.LTI ?? 0)}</td>
          <td style="text-align:right;">${(totals[String(y)]?.MTI ?? 0)}</td>
          <td style="text-align:right;">${(totals[String(y)]?.LTI ?? 0) + (totals[String(y)]?.MTI ?? 0)}</td>
        </tr>`,
        )
        .join('');

      const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Injury Graph ${years[0] || ''} – ${years[years.length - 1] || ''}</title>
<style>
  ${buildPrintFooterCss()}
  body { color: #111; }
  h1 { font-size: 18pt; margin: 0 0 4mm 0; text-align: center; }
  h2 { font-size: 12pt; margin: 6mm 0 2mm 0; color: #b91c1c; }
  .meta { text-align: center; font-size: 9pt; color: #444; margin-bottom: 4mm; }
  img.chart { width: 100%; max-width: 100%; height: auto; display: block; }
  table.totals { width: 100%; border-collapse: collapse; margin-top: 4mm; font-size: 10pt; }
  table.totals th, table.totals td { border: 1px solid #333; padding: 3px 6px; }
  table.totals th { background: #f3f4f6; }
  .page-break { page-break-after: always; }
</style></head>
<body>
${buildPrintBodyOpen(footer)}
  <h1>Injury Graph – LTI &amp; MTI</h1>
  <div class="meta">Rolling 3-Year View: ${years.join(' / ')} &nbsp;•&nbsp; Printed: ${formatDate(new Date().toISOString())}</div>

  <h2>Lost Time Injuries (LTI)</h2>
  ${ltiImg ? `<img class="chart" src="${ltiImg}" />` : '<p>No chart available.</p>'}

  <h2>Medical Treatment Injuries (MTI)</h2>
  ${mtiImg ? `<img class="chart" src="${mtiImg}" />` : '<p>No chart available.</p>'}

  <h2>Annual Totals</h2>
  <table class="totals">
    <thead>
      <tr><th>Year</th><th>LTI</th><th>MTI</th><th>Total</th></tr>
    </thead>
    <tbody>${totalsRows}</tbody>
  </table>
${buildPrintBodyClose()}
</body></html>`;

      const w = window.open('', '_blank');
      if (!w) return;
      w.document.open();
      w.document.write(html);
      w.document.close();
      // Wait for images to load before print dialog
      setTimeout(() => {
        try {
          w.focus();
          w.print();
        } catch (_) {
          /* print blocked by browser */
        }
      }, 400);
    } catch (e) {
      console.error(e);
      alert('Failed to print');
    }
  };

  return (
    <div className="p-6 space-y-6" data-testid="injury-graph-page">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Injury Graph – LTI / MTI</h1>
          <p className="text-gray-600 mt-1">
            Rolling 3-year view of Lost-Time and Medical-Treatment injuries. Counts are auto-aggregated from the
            Injury Register and can be manually overridden per month.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <Label className="text-xs text-gray-500">End Year (Current)</Label>
            <Input
              type="number"
              min="2000"
              max="2100"
              value={endYear}
              onChange={(e) => setEndYear(parseInt(e.target.value) || currentYear)}
              className="w-28"
              data-testid="injury-graph-end-year"
            />
          </div>
          <Button onClick={handlePrint} data-testid="injury-graph-print">
            <FileDown className="w-4 h-4 mr-2" /> Print / PDF
          </Button>
        </div>
      </div>

      {loading && <div className="text-sm text-gray-500">Loading…</div>}

      {/* Annual Totals Card */}
      {data && (
        <Card>
          <CardHeader>
            <CardTitle>Annual Totals — {years.join(' · ')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {years.map((y, idx) => (
                <div
                  key={y}
                  className="rounded-lg p-4 border"
                  style={{
                    background: YEAR_COLORS[idx].bg.replace('0.85', '0.15'),
                    borderColor: YEAR_COLORS[idx].border,
                  }}
                  data-testid={`totals-card-${y}`}
                >
                  <div className="text-lg font-bold" style={{ color: YEAR_COLORS[idx].border }}>
                    {y}
                  </div>
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="text-gray-700">LTI</span>
                    <span className="font-semibold">{totals[String(y)]?.LTI ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">MTI</span>
                    <span className="font-semibold">{totals[String(y)]?.MTI ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t mt-2 pt-2">
                    <span className="text-gray-700 font-semibold">Total</span>
                    <span className="font-bold">
                      {(totals[String(y)]?.LTI ?? 0) + (totals[String(y)]?.MTI ?? 0)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* LTI Chart */}
      {ltiChart && (
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center flex-wrap gap-2">
              <span>LOST TIME INJURIES (LTI) – {years.join(' / ')}</span>
              <div className="flex gap-2 flex-wrap">
                {years.map((y) => (
                  <Button
                    key={`lti-edit-${y}`}
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(y, 'LTI')}
                    data-testid={`edit-lti-${y}`}
                  >
                    <Edit className="w-4 h-4 mr-1" /> Edit {y}
                  </Button>
                ))}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div id="injury-lti-chart" style={{ height: 380 }}>
              <Bar data={ltiChart} options={chartOptions('LOST TIME INJURIES (LTI)')} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* MTI Chart */}
      {mtiChart && (
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center flex-wrap gap-2">
              <span>MEDICAL TREATMENT INJURIES (MTI) – {years.join(' / ')}</span>
              <div className="flex gap-2 flex-wrap">
                {years.map((y) => (
                  <Button
                    key={`mti-edit-${y}`}
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(y, 'MTI')}
                    data-testid={`edit-mti-${y}`}
                  >
                    <Edit className="w-4 h-4 mr-1" /> Edit {y}
                  </Button>
                ))}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div id="injury-mti-chart" style={{ height: 380 }}>
              <Bar data={mtiChart} options={chartOptions('MEDICAL TREATMENT INJURIES (MTI)')} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Modal */}
      {editMode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="edit-injury-modal">
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <span>
                  Edit {editType} – {editYear}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setEditMode(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-gray-500">
                Values entered here override the auto-count from the Injury Register for this year/type.
                Use <strong>Reset to Auto</strong> to clear all overrides for this year/type.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {MONTH_LABELS.map((m, i) => (
                  <div key={m}>
                    <Label className="text-xs">{m}</Label>
                    <Input
                      type="number"
                      min="0"
                      value={editValues[i]}
                      onChange={(e) => {
                        const v = [...editValues];
                        v[i] = parseInt(e.target.value) || 0;
                        setEditValues(v);
                      }}
                      data-testid={`edit-month-${m.toLowerCase()}`}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2 flex-wrap">
                <Button onClick={saveEdits} className="flex-1" data-testid="save-injury-edit">
                  <Save className="w-4 h-4 mr-2" /> Save
                </Button>
                <Button variant="outline" onClick={clearOverrideYear} data-testid="reset-injury-edit">
                  <RotateCcw className="w-4 h-4 mr-2" /> Reset to Auto
                </Button>
                <Button variant="outline" onClick={() => setEditMode(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default InjuryGraph;
