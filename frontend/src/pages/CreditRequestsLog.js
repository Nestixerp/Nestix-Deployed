import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Search, ArrowLeft, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { formatDate } from '../utils/dateFormatter';

const padCR = (n) => (n == null ? '' : String(n).padStart(2, '0'));

const CreditRequestsLog = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchItems(); }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const res = await api.get('/ncr/credit-requests/list', { params });
      setItems(res.data.items || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="credit-requests-page">
      <div>
        <button onClick={() => navigate('/quality/ncr')} className="text-sm text-blue-600 hover:underline mb-1 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to NCR Register
        </button>
        <h1 className="text-3xl font-bold text-gray-900">Credit Requests Log</h1>
        <p className="text-gray-600 mt-1 text-sm">
          Auto-generated from any NCR with <strong>Credit Requested</strong> ticked.{' '}
          <span className="ml-1 inline-block text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-mono">QMSF 03A</span>
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-gray-500">Search</Label>
              <Input placeholder="Customer, invoice, PO, credit note, CR#…" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchItems()} data-testid="cr-search" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Status</Label>
              <select className="border rounded px-3 py-2 text-sm h-10" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} data-testid="cr-status-filter">
                <option value="">All</option>
                <option>Pending</option><option>Approved</option><option>Rejected</option><option>Issued</option>
              </select>
            </div>
            <Button onClick={fetchItems} data-testid="cr-search-btn"><Search className="w-4 h-4 mr-1" /> Search</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle>{items.length} record{items.length === 1 ? '' : 's'}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="cr-table">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2 border">CR #</th>
                <th className="text-left p-2 border">NCR #</th>
                <th className="text-left p-2 border">Date</th>
                <th className="text-left p-2 border">Customer</th>
                <th className="text-left p-2 border">Invoice</th>
                <th className="text-left p-2 border">PO</th>
                <th className="text-right p-2 border">Amount</th>
                <th className="text-left p-2 border">Status</th>
                <th className="text-left p-2 border">Credit Note</th>
                <th className="text-left p-2 border">Open NCR</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={10} className="text-center text-gray-500 py-6">Loading…</td></tr>}
              {!loading && items.length === 0 && <tr><td colSpan={10} className="text-center text-gray-500 py-6">No credit requests.</td></tr>}
              {items.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="p-2 border font-mono font-bold">{padCR(c.credit_request_no)}</td>
                  <td className="p-2 border">{c.ncr_no}</td>
                  <td className="p-2 border whitespace-nowrap">{formatDate(c.requested_date)}</td>
                  <td className="p-2 border">{c.customer || ''}</td>
                  <td className="p-2 border">{c.invoice_no || ''}</td>
                  <td className="p-2 border">{c.po_no || ''}</td>
                  <td className="p-2 border text-right">{c.total_amount != null ? '$' + Number(c.total_amount).toFixed(2) : ''}</td>
                  <td className="p-2 border">{c.status || ''}</td>
                  <td className="p-2 border">{c.credit_note_no || ''}</td>
                  <td className="p-2 border">
                    <button onClick={() => navigate(`/quality/ncr/${c.ncr_id}`)} className="text-blue-600 hover:underline">
                      <FileText className="w-4 h-4 inline" /> View
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

export default CreditRequestsLog;
