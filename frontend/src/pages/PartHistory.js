import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Search, FileText, Clock, ChevronDown, ChevronRight, Package, DollarSign, User, CalendarDays, AlertCircle, CheckCircle, ArrowLeft, Clipboard, Truck } from 'lucide-react';

const PartHistory = () => {
  const { currentUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Load all quotes on mount
  useEffect(() => {
    fetchResults('');
  }, []);

  const fetchResults = useCallback(async (query) => {
    setLoading(true);
    try {
      const params = query ? `?q=${encodeURIComponent(query)}` : '';
      const response = await api.get(`/part-history/search${params}`);
      setResults(response.data);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchResults(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, fetchResults]);

  const fetchDetail = async (quoteId) => {
    setDetailLoading(true);
    try {
      const response = await api.get(`/part-history/detail/${quoteId}`);
      setDetailData(response.data);
    } catch (error) {
      console.error('Detail fetch error:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSelectQuote = (quote) => {
    setSelectedQuote(quote);
    fetchDetail(quote.id);
  };

  const handleBack = () => {
    setSelectedQuote(null);
    setDetailData(null);
  };

  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0;
    return `$${num.toFixed(2)}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const formatDuration = (minutes) => {
    if (!minutes && minutes !== 0) return '-';
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  };

  const statusColor = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'completed' || s === 'paid' || s === 'approved') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (s === 'in progress' || s === 'sent' || s === 'active') return 'bg-blue-100 text-blue-800 border-blue-200';
    if (s === 'pending' || s === 'draft') return 'bg-slate-100 text-slate-700 border-slate-200';
    if (s === 'ready for invoice' || s === 'job created') return 'bg-amber-100 text-amber-800 border-amber-200';
    if (s === 'on hold' || s === 'overdue') return 'bg-red-100 text-red-800 border-red-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  // DETAIL VIEW
  if (selectedQuote && detailData) {
    const { quote, job_sheets, invoices, packing_slips, related_quotes, summary } = detailData;
    const allInstances = [
      { ...quote, job_sheets, invoices, packing_slips, isCurrent: true },
      ...related_quotes.map(rq => ({ ...rq, isCurrent: false }))
    ];

    return (
      <div className="p-6 max-w-6xl mx-auto" data-testid="part-history-detail">
        <Button variant="ghost" onClick={handleBack} className="mb-4 text-slate-600 hover:text-slate-900" data-testid="back-button">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Search
        </Button>

        {/* Part Header */}
        <div className="bg-white border rounded-lg p-5 mb-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900 mb-1" data-testid="part-title">{quote.part_description}</h1>
          {quote.drawing_number && <p className="text-sm text-slate-500 mb-3">Drawing: {quote.drawing_number}</p>}
          
          {/* Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
            <div className="bg-slate-50 rounded-lg p-3 text-center border">
              <div className="text-2xl font-bold text-slate-900" data-testid="times-quoted">{summary.times_quoted}</div>
              <div className="text-xs text-slate-500 mt-1">Times Quoted</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-100">
              <div className="text-2xl font-bold text-blue-700" data-testid="times-produced">{summary.times_produced}</div>
              <div className="text-xs text-blue-600 mt-1">Job Sheets</div>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3 text-center border border-emerald-100">
              <div className="text-2xl font-bold text-emerald-700" data-testid="times-invoiced">{summary.times_invoiced}</div>
              <div className="text-xs text-emerald-600 mt-1">Invoiced</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-100">
              <div className="text-2xl font-bold text-amber-700" data-testid="total-qty">{summary.total_quantity_produced}</div>
              <div className="text-xs text-amber-600 mt-1">Total Qty Produced</div>
            </div>
          </div>
        </div>

        {detailLoading && <div className="text-center py-8 text-slate-500">Loading history...</div>}

        {/* All Instances */}
        {allInstances.map((instance, idx) => (
          <HistoryInstance 
            key={instance.id || idx} 
            instance={instance} 
            formatCurrency={formatCurrency}
            formatDate={formatDate}
            formatDuration={formatDuration}
            statusColor={statusColor}
          />
        ))}
      </div>
    );
  }

  // SEARCH / LIST VIEW
  return (
    <div className="p-6 max-w-5xl mx-auto" data-testid="part-history-page">
      <div className="flex items-center gap-3 mb-6">
        <Clock className="w-7 h-7 text-slate-700" />
        <h1 className="text-2xl font-bold text-slate-900">Part History</h1>
      </div>

      {/* Search Bar */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <Input
          data-testid="part-history-search"
          className="pl-10 h-12 text-base border-slate-300"
          placeholder="Search by quote number, customer, part description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
        />
      </div>

      {/* Results */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">Searching...</div>
      ) : results.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No parts found. Try a different search term.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {results.map((item) => (
            <div
              key={item.id}
              data-testid={`part-result-${item.quote_number}`}
              className="bg-white border rounded-lg px-4 py-3 flex items-center gap-4 cursor-pointer hover:border-slate-400 hover:shadow-sm transition-all"
              onClick={() => handleSelectQuote(item)}
            >
              <div className="bg-slate-100 text-slate-700 font-bold text-sm rounded-md w-12 h-12 flex items-center justify-center shrink-0 border">
                #{item.quote_number}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-900 truncate">{item.part_description}</div>
                <div className="text-sm text-slate-500 truncate">{item.customer_name}</div>
              </div>
              <div className="hidden sm:flex items-center gap-6 text-sm text-slate-600 shrink-0">
                <span>Qty: {item.quantity_required}</span>
                <span className="font-semibold text-slate-800">{formatCurrency(item.quote_total)}</span>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full border font-medium shrink-0 ${statusColor(item.status)}`}>
                {item.status}
              </span>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Sub-component: One quote instance with its job sheets, time entries, invoices
const HistoryInstance = ({ instance, formatCurrency, formatDate, formatDuration, statusColor }) => {
  const [expanded, setExpanded] = useState(instance.isCurrent);
  const jobSheets = instance.job_sheets || [];
  const invoiceList = instance.invoices || [];
  const timeEntries = instance.time_entries || [];
  const packingSlips = instance.packing_slips || [];

  return (
    <div className="bg-white border rounded-lg mb-4 shadow-sm overflow-hidden" data-testid={`history-instance-${instance.quote_number}`}>
      {/* Instance Header */}
      <div 
        className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
        <div className="bg-slate-100 text-slate-700 font-bold text-sm rounded-md px-3 py-1.5 border">
          Quote #{instance.quote_number}
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium text-slate-700">{instance.customer_name}</div>
          <div className="text-xs text-slate-400">{formatDate(instance.quote_date)}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-slate-800">{formatCurrency(instance.quote_total)}</div>
          <div className="text-xs text-slate-500">Qty: {instance.quantity_required}</div>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${statusColor(instance.status)}`}>
          {instance.status}
        </span>
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div className="border-t px-5 py-4 bg-slate-50/50">
          {/* Price Info */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="text-sm">
              <span className="text-slate-500">Price/Part:</span>
              <span className="ml-2 font-semibold text-slate-800">{formatCurrency(instance.price_per_part)}</span>
            </div>
            <div className="text-sm">
              <span className="text-slate-500">Total:</span>
              <span className="ml-2 font-semibold text-slate-800">{formatCurrency(instance.quote_total)}</span>
            </div>
            <div className="text-sm">
              <span className="text-slate-500">Quantity:</span>
              <span className="ml-2 font-semibold text-slate-800">{instance.quantity_required}</span>
            </div>
            <div className="text-sm">
              <span className="text-slate-500">Status:</span>
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor(instance.status)}`}>{instance.status}</span>
            </div>
          </div>

          {/* Job Sheets */}
          {jobSheets.length > 0 && (
            <div className="mb-5">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                <Clipboard className="w-4 h-4" /> Job Sheets ({jobSheets.length})
              </h4>
              <div className="space-y-3">
                {jobSheets.map((js, i) => (
                  <JobSheetCard key={js.id || i} js={js} formatDate={formatDate} formatDuration={formatDuration} statusColor={statusColor} formatCurrency={formatCurrency} />
                ))}
              </div>
            </div>
          )}

          {/* Time Entries (for related quotes that have flat time entries) */}
          {timeEntries.length > 0 && jobSheets.length === 0 && (
            <div className="mb-5">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                <Clock className="w-4 h-4" /> Time Entries ({timeEntries.length})
              </h4>
              <div className="space-y-2">
                {timeEntries.map((te, i) => (
                  <TimeEntryRow key={i} te={te} formatDate={formatDate} formatDuration={formatDuration} />
                ))}
              </div>
            </div>
          )}

          {/* Invoices */}
          {invoiceList.length > 0 && (
            <div className="mb-5">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                <DollarSign className="w-4 h-4" /> Invoices ({invoiceList.length})
              </h4>
              <div className="space-y-2">
                {invoiceList.map((inv, i) => (
                  <div key={i} className="bg-white border rounded px-4 py-2.5 flex items-center gap-4 text-sm">
                    <span className="font-medium text-slate-700">{inv.invoice_number}</span>
                    <span className="text-slate-500">{formatDate(inv.created_at)}</span>
                    <span className="font-semibold text-slate-800 ml-auto">{formatCurrency(inv.total)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor(inv.status)}`}>{inv.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Packing Slips */}
          {packingSlips.length > 0 && (
            <div className="mb-3">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                <Truck className="w-4 h-4" /> Packing Slips ({packingSlips.length})
              </h4>
              <div className="space-y-2">
                {packingSlips.map((ps, i) => (
                  <div key={i} className="bg-white border rounded px-4 py-2.5 flex items-center gap-4 text-sm">
                    <span className="font-medium text-slate-700">{ps.packing_slip_number}</span>
                    <span className="text-slate-500">{formatDate(ps.created_at)}</span>
                    <span className="text-slate-600 ml-auto">Qty: {ps.quantity_shipped}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor(ps.status)}`}>{ps.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No production data message */}
          {jobSheets.length === 0 && timeEntries.length === 0 && invoiceList.length === 0 && packingSlips.length === 0 && (
            <div className="text-center py-4 text-sm text-slate-400">
              <AlertCircle className="w-5 h-5 mx-auto mb-1" />
              No production data yet for this quote
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Sub-component: Job Sheet card with time entries
const JobSheetCard = ({ js, formatDate, formatDuration, statusColor, formatCurrency }) => {
  const [showTimeEntries, setShowTimeEntries] = useState(false);
  const timeEntries = js.time_entries || [];

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <div className="px-4 py-3">
        <div className="flex items-center gap-3 mb-2">
          <span className="font-semibold text-sm text-slate-800">{js.job_sheet_number}</span>
          <span className="text-xs text-slate-500">{js.process_name}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ml-auto ${statusColor(js.status)}`}>{js.status}</span>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-xs">
          {js.operator_name && (
            <div className="flex items-center gap-1.5 text-slate-600">
              <User className="w-3 h-3" /> {js.operator_name}
            </div>
          )}
          {js.purchase_order_number && (
            <div className="flex items-center gap-1.5 text-slate-600">
              <Package className="w-3 h-3" /> PO: {js.purchase_order_number}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-slate-600">
            <CalendarDays className="w-3 h-3" />
            {js.started_at ? formatDate(js.started_at) : '-'} {js.completed_at ? `to ${formatDate(js.completed_at)}` : ''}
          </div>
          <div className="flex items-center gap-1.5 text-slate-600">
            Qty: {js.quantity_completed || js.quantity || '-'}
          </div>
        </div>

        {/* Time & Efficiency - ALWAYS SHOW */}
        <div className="flex flex-wrap gap-4 mt-2 text-xs bg-slate-50 rounded px-3 py-2 border">
          <span className="text-slate-500">
            Est: {js.estimated_hours != null && js.estimated_hours > 0 ? formatDuration(js.estimated_hours * 60) : <span className="text-slate-300">N/A</span>}
          </span>
          <span className="font-semibold text-blue-700">
            Actual: {(() => {
              if (js.actual_hours != null && js.actual_hours > 0) return formatDuration(js.actual_hours * 60);
              if (js.actual_time_taken != null && js.actual_time_taken > 0) return formatDuration(js.actual_time_taken);
              if (js.started_at && js.completed_at) {
                const start = new Date(js.started_at);
                const end = new Date(js.completed_at);
                if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                  const diffMin = (end - start) / 60000;
                  if (diffMin > 0) return formatDuration(diffMin);
                }
              }
              return <span className="text-slate-300 font-normal">N/A</span>;
            })()}
          </span>
          {js.hours_saved != null && (
            <span className={`font-semibold ${js.hours_saved > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              Saved: {js.hours_saved > 0 ? '+' : ''}{formatDuration(Math.abs(js.hours_saved) * 60)}
            </span>
          )}
          <span className={`font-semibold ${js.efficiency_percent != null && js.efficiency_percent >= 100 ? 'text-emerald-600' : js.efficiency_percent != null ? 'text-amber-600' : ''}`}>
            Efficiency: {js.efficiency_percent != null ? `${js.efficiency_percent.toFixed(1)}%` : <span className="text-slate-300 font-normal">N/A</span>}
          </span>
          {js.money_impact != null && js.money_impact !== 0 && (
            <span className={`font-semibold ${js.money_impact > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {js.money_impact > 0 ? '+' : ''}{formatCurrency(js.money_impact)}
            </span>
          )}
        </div>

        {/* Production Notes - ALWAYS SHOW */}
        <div className="mt-2 p-2 bg-amber-50 border border-amber-100 rounded text-xs text-amber-800">
          <span className="font-semibold">Notes:</span> {js.production_notes || <span className="text-amber-400 italic">No production notes recorded</span>}
        </div>

        {/* Quality Notes */}
        {js.quality_notes && (
          <div className="mt-1.5 p-2 bg-blue-50 border border-blue-100 rounded text-xs text-blue-800">
            <span className="font-semibold">Quality:</span> {js.quality_notes}
          </div>
        )}
      </div>

      {/* Time Entries Toggle */}
      {timeEntries.length > 0 && (
        <>
          <button
            className="w-full text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50 py-2 border-t flex items-center justify-center gap-1 transition-colors"
            onClick={() => setShowTimeEntries(!showTimeEntries)}
          >
            <Clock className="w-3 h-3" /> {timeEntries.length} time {timeEntries.length === 1 ? 'entry' : 'entries'}
            {showTimeEntries ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {showTimeEntries && (
            <div className="border-t bg-slate-50/50 px-4 py-2 space-y-2">
              {timeEntries.map((te, i) => (
                <TimeEntryRow key={i} te={te} formatDate={formatDate} formatDuration={formatDuration} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Sub-component: Time entry row
const TimeEntryRow = ({ te, formatDate, formatDuration }) => {
  return (
    <div className="bg-white border rounded px-3 py-2 text-xs">
      <div className="flex items-center gap-3 mb-1">
        <span className="font-medium text-slate-700">{te.operator_name}</span>
        <span className="text-slate-400">{te.process_name}</span>
        {te.actual_duration_minutes != null && (
          <span className="ml-auto font-semibold text-blue-700">{formatDuration(te.actual_duration_minutes)}</span>
        )}
      </div>
      <div className="text-slate-400">
        {formatDate(te.start_time)} {te.end_time ? `- ${formatDate(te.end_time)}` : '(in progress)'}
        {te.total_pause_minutes > 0 && <span className="ml-2 text-amber-600">(paused {formatDuration(te.total_pause_minutes)})</span>}
      </div>
      {/* Operator Notes */}
      {te.notes && te.notes.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {te.notes.map((note, ni) => (
            <div key={ni} className="p-1.5 bg-amber-50 border border-amber-100 rounded text-amber-800">
              {note.category && <span className="font-semibold capitalize">{note.category}: </span>}
              {note.text || note.note || JSON.stringify(note)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PartHistory;
