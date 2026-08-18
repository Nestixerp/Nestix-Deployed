import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Plus, Search, Printer, Edit, Trash2, FileText, AlertCircle, FileSearch, X as XIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { formatDate } from '../utils/dateFormatter';
import CreateRiskButton from '../components/CreateRiskButton';
import {
  getControlledDocumentByModule,
  buildDocControlFooter,
  buildPrintFooterCss,
  buildPrintBodyOpen,
  buildPrintBodyClose,
} from '../utils/documentControl';

const MODULE_NAME = 'NCR Register';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

const NCRRegister = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [rangeStats, setRangeStats] = useState(null);
  const [docInfo, setDocInfo] = useState(null);

  useEffect(() => {
    fetchItems();
    fetchStats();
    getControlledDocumentByModule(MODULE_NAME, { fallback: 'NCR Register', docType: 'Register' }).then(setDocInfo);
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (category) params.category = category;
      if (statusFilter) params.status = statusFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await api.get('/ncr', { params });
      setItems(res.data.items || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchStats = async (params = {}) => {
    try {
      const res = await api.get('/ncr/stats', { params });
      setStats(res.data);
      if (params.date_from && params.date_to) setRangeStats(res.data.range);
    } catch (e) { console.error(e); }
  };

  const runSearch = () => {
    fetchItems();
    if (dateFrom && dateTo) fetchStats({ date_from: dateFrom, date_to: dateTo });
    else setRangeStats(null);
  };

  const clearFilters = () => {
    setSearch(''); setCategory(''); setStatusFilter(''); setDateFrom(''); setDateTo('');
    setRangeStats(null);
    setTimeout(fetchItems, 0);
  };

  const deleteNCR = async (id, ncr_no) => {
    if (!window.confirm(`Delete NCR #${ncr_no}? This cannot be undone.`)) return;
    try {
      await api.delete(`/ncr/${id}`);
      fetchItems();
      fetchStats();
    } catch (e) { alert('Failed to delete'); }
  };

  const handlePrintRegister = async () => {
    const doc = await getControlledDocumentByModule(MODULE_NAME, { fallback: 'NCR Register', docType: 'Register' });
    const footer = buildDocControlFooter(doc, {
      title: 'NCR Register',
    });

    const rows = items.map(n => `
      <tr>
        <td>${esc(n.ncr_no)}</td>
        <td>${esc(n.category || '')}</td>
        <td>${esc(formatDate(n.date_raised))}</td>
        <td>${esc(n.customer || '')}</td>
        <td>${esc(n.supplier || '')}</td>
        <td>${esc(n.product || '')}</td>
        <td>${esc(n.department || '')}</td>
        <td style="text-align:right;">${n.total_cost != null ? '$' + Number(n.total_cost).toFixed(2) : ''}</td>
        <td>${esc(n.action_completed_verified || '')}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<title>NCR Register</title>
<style>
  ${buildPrintFooterCss()}
  @page { size: A4 landscape; }
  body { color: #111; }
  h1 { text-align: center; margin: 0 0 2mm 0; font-size: 16pt; }
  h2 { text-align: center; margin: 0 0 5mm 0; font-size: 11pt; color: #555; font-weight: normal; }
  table.reg { width: 100%; border-collapse: collapse; font-size: 9pt; }
  table.reg th, table.reg td { border: 1px solid #333; padding: 4px 5px; text-align: left; }
  table.reg th { background: #f3f4f6; font-weight: bold; }
  .meta { font-size: 9pt; color: #555; margin: 3mm 0; display: flex; gap: 18mm; }
</style></head>
<body>
${buildPrintBodyOpen(footer)}
  <h1>ULTIMATE LASER PTY LTD</h1>
  <h2>Non-Conformance Report Register</h2>
  <div class="meta">
    <span><strong>Generated:</strong> ${esc(formatDate(new Date().toISOString()))}</span>
    ${dateFrom || dateTo ? `<span><strong>Date Range:</strong> ${esc(dateFrom || '...')} → ${esc(dateTo || '...')}</span>` : ''}
    <span><strong>Total:</strong> ${items.length}</span>
  </div>
  <table class="reg">
    <thead>
      <tr>
        <th>NCR #</th><th>Category</th><th>Date</th><th>Customer</th><th>Supplier</th>
        <th>Product</th><th>Department</th><th>Total $</th><th>Verified</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
${buildPrintBodyClose()}
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (_) { /* blocked */ } }, 250);
  };

  const widgets = useMemo(() => {
    if (!stats) return null;
    const tm = stats.this_month || {}, ytd = stats.ytd || {};
    return { tm, ytd };
  }, [stats]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="ncr-register-page">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">NCR Register</h1>
          <p className="text-gray-600 mt-1">
            Non-Conformance Report Register{' '}
            <span className="ml-1 inline-block text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-mono" data-testid="ncr-form-no">
              {docInfo?.form_no || '—'}
            </span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => navigate('/quality/credit-requests')} data-testid="ncr-credit-log-btn">
            <FileText className="w-4 h-4 mr-2" /> Credit Requests Log
          </Button>
          <Button variant="outline" onClick={handlePrintRegister} data-testid="ncr-print-register">
            <Printer className="w-4 h-4 mr-2" /> Print Register
          </Button>
          <Button onClick={() => navigate('/quality/ncr/new')} data-testid="ncr-create-new">
            <Plus className="w-4 h-4 mr-2" /> New NCR
          </Button>
        </div>
      </div>

      {/* Stats widgets */}
      {widgets && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="ncr-stats-widgets">
          <Card className="border-l-4 border-l-red-600">
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-gray-500">This Month — NCRs</div>
              <div className="text-3xl font-bold text-red-700" data-testid="stat-month-ncr">{widgets.tm.NCR ?? 0}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-orange-500">
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-gray-500">This Month — Concerns</div>
              <div className="text-3xl font-bold text-orange-600" data-testid="stat-month-concern">{widgets.tm.Concern ?? 0}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-400">
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-gray-500">YTD — NCRs</div>
              <div className="text-3xl font-bold text-red-600" data-testid="stat-ytd-ncr">{widgets.ytd.NCR ?? 0}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-orange-300">
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-gray-500">YTD — Concerns</div>
              <div className="text-3xl font-bold text-orange-500" data-testid="stat-ytd-concern">{widgets.ytd.Concern ?? 0}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search / filter bar */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-gray-500">Search</Label>
              <Input
                placeholder="NCR #, customer, supplier, product, PO, item no..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                data-testid="ncr-search-input"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Category</Label>
              <select
                className="border rounded px-3 py-2 text-sm h-10"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                data-testid="ncr-category-filter"
              >
                <option value="">All</option>
                <option value="NCR">NCR</option>
                <option value="Concern">Concern</option>
              </select>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Verified</Label>
              <select
                className="border rounded px-3 py-2 text-sm h-10"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                data-testid="ncr-status-filter"
              >
                <option value="">All</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
                <option value="Pending">Pending</option>
              </select>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Date From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} data-testid="ncr-date-from" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Date To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} data-testid="ncr-date-to" />
            </div>
            <Button onClick={runSearch} data-testid="ncr-search-btn">
              <Search className="w-4 h-4 mr-1" /> Search
            </Button>
            <Button variant="outline" onClick={clearFilters} data-testid="ncr-clear-filters">
              <XIcon className="w-4 h-4 mr-1" /> Clear
            </Button>
          </div>

          {/* Range result widget */}
          {rangeStats && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3 flex flex-wrap gap-6" data-testid="ncr-range-stats">
              <div>
                <span className="text-xs text-gray-600">Period:</span>{' '}
                <strong>{formatDate(rangeStats.from)}</strong> → <strong>{formatDate(rangeStats.to)}</strong>
              </div>
              <div>
                <span className="text-xs text-gray-600">NCRs:</span>{' '}
                <strong className="text-red-700 text-lg" data-testid="ncr-range-ncr-count">{rangeStats.NCR}</strong>
              </div>
              <div>
                <span className="text-xs text-gray-600">Concerns:</span>{' '}
                <strong className="text-orange-700 text-lg" data-testid="ncr-range-concern-count">{rangeStats.Concern}</strong>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex justify-between items-center">
            <span>{items.length} record{items.length === 1 ? '' : 's'}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="ncr-table">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2 border">NCR #</th>
                <th className="text-left p-2 border">Cat.</th>
                <th className="text-left p-2 border">Date</th>
                <th className="text-left p-2 border">Customer</th>
                <th className="text-left p-2 border">Supplier</th>
                <th className="text-left p-2 border">Product / Description</th>
                <th className="text-left p-2 border">Department</th>
                <th className="text-right p-2 border">Total $</th>
                <th className="text-left p-2 border">Verified</th>
                <th className="text-left p-2 border">Tags</th>
                <th className="text-left p-2 border">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={11} className="text-center text-gray-500 py-6">Loading…</td></tr>
              )}
              {!loading && items.length === 0 && (
                <tr><td colSpan={11} className="text-center text-gray-500 py-6">No NCRs found.</td></tr>
              )}
              {items.map(n => (
                <tr key={n.id} className="hover:bg-gray-50" data-testid={`ncr-row-${n.ncr_no}`}>
                  <td className="p-2 border font-mono font-bold">{n.ncr_no}</td>
                  <td className="p-2 border">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      n.category === 'NCR' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {n.category || '—'}
                    </span>
                  </td>
                  <td className="p-2 border whitespace-nowrap">{n.date_raised ? formatDate(n.date_raised) : ''}</td>
                  <td className="p-2 border">{n.customer || ''}</td>
                  <td className="p-2 border">{n.supplier || ''}</td>
                  <td className="p-2 border max-w-[280px] truncate" title={n.description}>
                    {n.product || n.description || ''}
                  </td>
                  <td className="p-2 border">{n.department || ''}</td>
                  <td className="p-2 border text-right">{n.total_cost != null ? '$' + Number(n.total_cost).toFixed(2) : ''}</td>
                  <td className="p-2 border">{n.action_completed_verified || ''}</td>
                  <td className="p-2 border space-x-1">
                    {n.credit_request?.enabled && (
                      <span className="inline-block text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded" title="Credit Request">CR</span>
                    )}
                    {n.ncr_job_sheet?.required && (
                      <span className="inline-block text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded" title="NCR Job Sheet / Recut">JS</span>
                    )}
                  </td>
                  <td className="p-2 border whitespace-nowrap">
                    <button
                      onClick={() => navigate(`/quality/ncr/${n.id}`)}
                      className="text-blue-600 hover:underline mr-2"
                      data-testid={`ncr-edit-${n.ncr_no}`}
                    >
                      <Edit className="w-4 h-4 inline" />
                    </button>
                    <CreateRiskButton
                      source="NCR" linkedModule="NCR Register"
                      linkedRecordId={n.ncr_no} area="Quality"
                      title={`NCR ${n.ncr_no} — ${(n.product || n.description || '').slice(0, 60)}`}
                      description={n.description || ''}
                      label="" size="sm" variant="ghost"
                      className="text-purple-600 hover:underline mr-2 px-1 h-auto py-0.5"
                      testId={`ncr-create-ro-${n.ncr_no}`}
                    />
                    <button
                      onClick={() => deleteNCR(n.id, n.ncr_no)}
                      className="text-red-600 hover:underline"
                      data-testid={`ncr-delete-${n.ncr_no}`}
                    >
                      <Trash2 className="w-4 h-4 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

export default NCRRegister;
