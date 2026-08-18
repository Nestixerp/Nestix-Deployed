import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { 
  Plus, 
  Edit, 
  Trash2, 
  ClipboardCheck,
  AlertCircle,
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  History,
  Printer
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  buildDocControlFooter,
  buildPrintFooterCss,
  buildPrintBodyOpen,
  buildPrintBodyClose,
  getControlledDocumentByModule,
} from '../utils/documentControl';

import API_BACKEND from '../lib/backendUrl';
const BACKEND_URL = API_BACKEND;

const CalibrationSchedule = () => {
  const navigate = useNavigate();
  const [instruments, setInstruments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInstrument, setEditingInstrument] = useState(null);
  const [dashboardMetrics, setDashboardMetrics] = useState(null);
  const [expandedInstrument, setExpandedInstrument] = useState(null);
  const [calibrationHistory, setCalibrationHistory] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    instrument_name: '',
    ident_no: '',
    operator_name: '',
    location: '',
    calibration_frequency: 12,
    required_accuracy: '',
    notes: ''
  });

  // Add print styles with multi-page support
  React.useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @media print {
        @page {
          size: A4 landscape;
          margin: 15mm 10mm 20mm 10mm; /* Extra bottom margin for footer */
        }
        
        /* Hide UI elements */
        .no-print,
        button,
        nav,
        aside,
        [data-sidebar="true"],
        [class*="bg-slate-900"],
        [class*="fixed left-0"] {
          display: none !important;
        }
        
        /* Page breaks */
        body {
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }
        
        /* Table styling for multi-page */
        table {
          width: 100%;
          font-size: 9pt;
          page-break-inside: auto;
          border-collapse: collapse;
        }
        
        thead {
          display: table-header-group;
          font-weight: bold;
          background-color: #f3f4f6 !important;
        }
        
        tbody tr {
          page-break-inside: avoid;
          page-break-after: auto;
        }
        
        /* Ensure content flows across pages */
        .calibration-schedule-table {
          width: 100%;
        }
        
        /* Footer on every page */
        .print-footer {
          display: block !important;
          position: fixed;
          bottom: 0;
          left: 10mm;
          right: 10mm;
          padding-top: 5px;
          border-top: 2px solid #000;
          font-size: 7pt;
          background: white;
        }
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const currentUserStr = localStorage.getItem('currentUser');
      const currentUser = JSON.parse(currentUserStr);
      const token = currentUser.token;
      
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      // Fetch instruments
      const instResponse = await fetch(`${BACKEND_URL}/api/calibration/instruments`, { headers });
      const instData = await instResponse.json();
      setInstruments(instData);

      // Fetch dashboard metrics
      const dashResponse = await fetch(`${BACKEND_URL}/api/calibration/dashboard`, { headers });
      const dashData = await dashResponse.json();
      setDashboardMetrics(dashData);

    } catch (error) {
      console.error('Error fetching calibration data:', error);
      alert('Error loading calibration data');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (instrument = null) => {
    if (instrument) {
      setEditingInstrument(instrument);
      setFormData({
        instrument_name: instrument.instrument_name,
        ident_no: instrument.ident_no,
        operator_name: instrument.operator_name || '',
        location: instrument.location || '',
        calibration_frequency: instrument.calibration_frequency,
        required_accuracy: instrument.required_accuracy || '',
        notes: instrument.notes || ''
      });
    } else {
      setEditingInstrument(null);
      setFormData({
        instrument_name: '',
        ident_no: '',
        operator_name: '',
        location: '',
        calibration_frequency: 12,
        required_accuracy: '',
        notes: ''
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const currentUserStr = localStorage.getItem('currentUser');
      const currentUser = JSON.parse(currentUserStr);
      const token = currentUser.token;
      
      const url = editingInstrument 
        ? `${BACKEND_URL}/api/calibration/instruments/${editingInstrument.id}`
        : `${BACKEND_URL}/api/calibration/instruments`;
      
      const method = editingInstrument ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        alert(editingInstrument ? 'Instrument updated!' : 'Instrument created!');
        setDialogOpen(false);
        fetchData();
      } else {
        const error = await response.json();
        alert('Error: ' + (error.detail || 'Failed to save'));
      }
    } catch (error) {
      console.error('Error saving instrument:', error);
      alert('Error saving instrument');
    }
  };

  const handleDelete = async (instrumentId) => {
    if (!window.confirm('Delete this instrument? This will fail if calibration records exist.')) {
      return;
    }

    try {
      const currentUserStr = localStorage.getItem('currentUser');
      const currentUser = JSON.parse(currentUserStr);
      const token = currentUser.token;
      
      const response = await fetch(`${BACKEND_URL}/api/calibration/instruments/${instrumentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        alert('Instrument deleted!');
        fetchData();
      } else {
        const error = await response.json();
        alert('Error: ' + (error.detail || 'Failed to delete'));
      }
    } catch (error) {
      console.error('Error deleting instrument:', error);
      alert('Error deleting instrument');
    }
  };

  const handleCreateRecord = (instrument) => {
    navigate(`/quality/calibration/record/new`, { state: { instrument } });
  };

  const fetchCalibrationHistory = async (instrumentId) => {
    try {
      const currentUserStr = localStorage.getItem('currentUser');
      const currentUser = JSON.parse(currentUserStr);
      const token = currentUser.token;
      
      const response = await fetch(`${BACKEND_URL}/api/calibration/records?instrument_id=${instrumentId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const records = await response.json();
        setCalibrationHistory(prev => ({
          ...prev,
          [instrumentId]: records.slice(0, 3) // Last 3 calibrations
        }));
      } else {
        console.error('Failed to fetch calibration history:', response.status);
        setCalibrationHistory(prev => ({
          ...prev,
          [instrumentId]: [] // Empty array to show "no records" message
        }));
      }
    } catch (error) {
      console.error('Error fetching calibration history:', error);
      setCalibrationHistory(prev => ({
        ...prev,
        [instrumentId]: [] // Empty array on error
      }));
    }
  };

  const toggleHistory = async (instrumentId) => {
    if (expandedInstrument === instrumentId) {
      setExpandedInstrument(null);
    } else {
      setExpandedInstrument(instrumentId);
      if (!calibrationHistory[instrumentId]) {
        await fetchCalibrationHistory(instrumentId);
      }
    }
  };

  const getStatusBadge = (status) => {
    if (status === 'Current') {
      return <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs flex items-center gap-1">
        <CheckCircle className="w-3 h-3" /> Current
      </span>;
    } else if (status === 'Due Soon') {
      return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs flex items-center gap-1">
        <Clock className="w-3 h-3" /> Due Soon
      </span>;
    } else if (status === 'Overdue') {
      return <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs flex items-center gap-1">
        <AlertCircle className="w-3 h-3" /> Overdue
      </span>;
    }
    return null;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-AU');
  };

  // Handle print — native HTML print window using the audit-compliant <tfoot>
  // wrapper pattern (see utils/documentControl.js). This guarantees the Document
  // Control footer repeats on every page and never overlaps content rows.
  const handlePrint = async () => {
    try {
      const doc = await getControlledDocumentByModule('Calibration Schedule', { fallback: 'Calibration Schedule' });
      const footer = buildDocControlFooter(doc, {
        title: 'Calibration Schedule',
        owner: 'Quality Manager',
      });

      const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[c]);

      const statusBadge = (s) => {
        if (s === 'Current') return `<span class="badge ok">Current</span>`;
        if (s === 'Due Soon') return `<span class="badge warn">Due Soon</span>`;
        if (s === 'Overdue') return `<span class="badge err">Overdue</span>`;
        return esc(s || '-');
      };

      const rows = filteredInstruments.map((it) => `
        <tr>
          <td>${esc(it.instrument_name || '-')}</td>
          <td>${esc(it.ident_no || '-')}</td>
          <td>${esc(it.operator_name || '-')}</td>
          <td style="text-align:center;">${esc(it.calibration_frequency || '-')} months</td>
          <td style="text-align:center;">${esc(formatDate(it.last_calibration_date))}</td>
          <td style="text-align:center;">${esc(formatDate(it.next_calibration_due))}</td>
          <td style="text-align:center;">${statusBadge(it.status)}</td>
        </tr>
      `).join('');

      const m = dashboardMetrics || {};
      const total = (m.total_instruments != null) ? m.total_instruments : instruments.length;
      const current = m.current_count != null ? m.current_count : instruments.filter(i => i.status === 'Current').length;
      const dueSoon = m.due_soon_count != null ? m.due_soon_count : instruments.filter(i => i.status === 'Due Soon').length;
      const overdue = m.overdue_count != null ? m.overdue_count : instruments.filter(i => i.status === 'Overdue').length;

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Calibration Schedule</title>
<style>
  ${buildPrintFooterCss().replace('size: A4 portrait;', 'size: A4 landscape;')}
  body { font-family: Calibri, Arial, sans-serif; color: #000; font-size: 10pt; }
  h1 { font-size: 18pt; margin: 0 0 2px 0; color: #0f172a; }
  .subtitle { font-size: 10pt; color: #475569; margin-bottom: 10px; }
  .summary { display: flex; gap: 10px; margin: 10px 0 14px 0; }
  .stat { flex: 1; border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px 10px; }
  .stat .lbl { font-size: 9pt; color: #475569; }
  .stat .val { font-size: 16pt; font-weight: 700; }
  .stat.ok .val { color: #16a34a; }
  .stat.warn .val { color: #ca8a04; }
  .stat.err .val { color: #dc2626; }
  table.data { width: 100%; border-collapse: collapse; }
  table.data th, table.data td { border: 1px solid #94a3b8; padding: 5px 7px; font-size: 9.5pt; }
  table.data thead th { background: #f1f5f9; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 8.5pt; font-weight: 600; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .badge.ok { background: #dcfce7; color: #166534; }
  .badge.warn { background: #fef9c3; color: #854d0e; }
  .badge.err { background: #fee2e2; color: #991b1b; }
</style></head><body>${buildPrintBodyOpen(footer)}
  <h1>Calibration Schedule</h1>
  <div class="subtitle">Quality Management System — QMSF 07</div>
  <div class="summary">
    <div class="stat"><div class="lbl">Total Instruments</div><div class="val">${total}</div></div>
    <div class="stat ok"><div class="lbl">Current</div><div class="val">${current}</div></div>
    <div class="stat warn"><div class="lbl">Due Soon</div><div class="val">${dueSoon}</div></div>
    <div class="stat err"><div class="lbl">Overdue</div><div class="val">${overdue}</div></div>
  </div>
  <table class="data">
    <thead>
      <tr>
        <th style="text-align:left;">Instrument Name</th>
        <th style="text-align:left;">ID No.</th>
        <th style="text-align:left;">Operator</th>
        <th>Frequency</th>
        <th>Last Cal</th>
        <th>Next Due</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="7" style="text-align:center;padding:12px;">No instruments</td></tr>`}</tbody>
  </table>
  ${buildPrintBodyClose()}
</body></html>`;

      const w = window.open('', '_blank', 'width=1300,height=1400');
      if (!w) { alert('Pop-up blocked — please allow pop-ups to print.'); return; }
      w.document.write(html);
      w.document.close();
      setTimeout(() => { w.focus(); w.print(); }, 400);
    } catch (error) {
      console.error('Print Error:', error);
      alert('Error generating print: ' + error.message);
    }
  };

  // Filtered instruments for search
  const filteredInstruments = instruments.filter((instrument) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      (instrument.instrument_name && instrument.instrument_name.toLowerCase().includes(search)) ||
      (instrument.ident_no && instrument.ident_no.toLowerCase().includes(search)) ||
      (instrument.operator_name && instrument.operator_name.toLowerCase().includes(search))
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading calibration schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 print-section">
      {/* Header */}
      <div className="flex justify-between items-center no-print">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Calibration Schedule</h1>
          <p className="text-gray-600 mt-1">Manage instrument calibrations (QMSF 07)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />
            Print Schedule
          </Button>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="w-4 h-4 mr-2" />
            Add Instrument
          </Button>
        </div>
      </div>

      {/* PDF Content Container */}
      <div id="calibration-pdf-content">
        
        {/* Page Header for PDF */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Calibration Schedule</h1>
          <p className="text-gray-600 mt-1">Quality Management System - QMSF 07</p>
        </div>

      {/* Dashboard Metrics */}
      {dashboardMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Instruments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboardMetrics.total_instruments}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Current</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{dashboardMetrics.current}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Due Soon</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{dashboardMetrics.due_soon}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Overdue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{dashboardMetrics.overdue}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Instruments Table */}
      <Card>
        <CardHeader>
          <CardTitle>Instruments</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Search Bar */}
          <div className="mb-4">
            <div className="relative">
              <Input
                type="text"
                placeholder="Search by ID Number or Operator name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-4 pr-4"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              )}
            </div>
            {searchTerm && (
              <p className="text-sm text-gray-500 mt-1">
                Showing results for: "{searchTerm}"
              </p>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full calibration-schedule-table">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3">Instrument Name</th>
                  <th className="text-left p-3">ID No.</th>
                  <th className="text-left p-3">Operator</th>
                  <th className="text-center p-3">Frequency</th>
                  <th className="text-center p-3">Last Cal</th>
                  <th className="text-center p-3">Next Due</th>
                  <th className="text-center p-3">Status</th>
                  <th className="text-center p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInstruments.map((instrument) => (
                  <React.Fragment key={instrument.id}>
                    <tr className="border-b hover:bg-gray-50">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleHistory(instrument.id)}
                            title="View History"
                          >
                            {expandedInstrument === instrument.id ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </Button>
                          <span className="font-medium">{instrument.instrument_name}</span>
                        </div>
                      </td>
                      <td className="p-3">{instrument.ident_no}</td>
                      <td className="p-3">{instrument.operator_name || '-'}</td>
                      <td className="p-3 text-center">{instrument.calibration_frequency} months</td>
                      <td className="p-3 text-center">{formatDate(instrument.last_calibration_date)}</td>
                      <td className="p-3 text-center">{formatDate(instrument.next_calibration_due)}</td>
                      <td className="p-3 text-center">{getStatusBadge(instrument.status)}</td>
                      <td className="p-3 no-print">
                        <div className="flex gap-2 justify-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCreateRecord(instrument)}
                            title="Create Calibration Record"
                          >
                            <ClipboardCheck className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenDialog(instrument)}
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(instrument.id)}
                            title="Delete"
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    
                    {/* Expanded History Row */}
                    {expandedInstrument === instrument.id && (
                      <tr className="bg-blue-50">
                        <td colSpan="8" className="p-4">
                          <div className="space-y-3">
                            <h4 className="font-semibold flex items-center gap-2">
                              <History className="w-4 h-4" />
                              Last 3 Calibration Records
                            </h4>
                            {calibrationHistory[instrument.id] ? (
                              calibrationHistory[instrument.id].length > 0 ? (
                                <div className="space-y-2">
                                  {calibrationHistory[instrument.id].map((record, index) => (
                                    <Card key={record.id} className="bg-white">
                                      <CardContent className="p-3">
                                        <div className="grid grid-cols-5 gap-4 text-sm">
                                          <div>
                                            <span className="font-semibold">Record #:</span> {record.record_number}
                                          </div>
                                          <div>
                                            <span className="font-semibold">Date:</span> {formatDate(record.calibration_date)}
                                          </div>
                                          <div>
                                            <span className="font-semibold">Result:</span> 
                                            <span className={`ml-2 px-2 py-1 rounded text-xs ${
                                              record.result === 'Pass' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                            }`}>
                                              {record.result}
                                            </span>
                                          </div>
                                          <div>
                                            <span className="font-semibold">By:</span> {record.performed_by || '-'}
                                          </div>
                                          <div className="text-right">
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() => window.open(`/quality/calibration/print/${record.id}`, '_blank')}
                                              title="Print Record"
                                            >
                                              <Printer className="w-3 h-3 mr-1" />
                                              Print
                                            </Button>
                                          </div>
                                        </div>
                                        {record.measurements && record.measurements.length > 0 && (
                                          <div className="mt-2 pt-2 border-t">
                                            <div className="text-xs font-semibold mb-1">Measurements:</div>
                                            <div className="grid grid-cols-5 gap-2 text-xs">
                                              {record.measurements.map((m, idx) => (
                                                <div key={idx} className="flex gap-1">
                                                  <span>{m.ref_size}mm:</span>
                                                  <span className={`font-semibold ${
                                                    Math.abs(m.deviation) <= 0.05 ? 'text-green-600' : 'text-red-600'
                                                  }`}>
                                                    {m.measured_size}mm ({m.deviation > 0 ? '+' : ''}{m.deviation})
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </CardContent>
                                    </Card>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-gray-500 text-sm">No calibration records found for this instrument.</p>
                              )
                            ) : (
                              <p className="text-gray-500 text-sm">Loading history...</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            {instruments.length === 0 && !searchTerm && (
              <p className="text-center text-gray-500 py-8">No instruments found. Add your first instrument to get started.</p>
            )}
            {instruments.length > 0 && instruments.filter((instrument) => {
              if (!searchTerm) return true;
              const search = searchTerm.toLowerCase();
              return (
                (instrument.ident_no && instrument.ident_no.toLowerCase().includes(search)) ||
                (instrument.operator_name && instrument.operator_name.toLowerCase().includes(search))
              );
            }).length === 0 && (
              <p className="text-center text-gray-500 py-8">
                No instruments found matching "{searchTerm}". Try a different search term.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      {dialogOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>{editingInstrument ? 'Edit Instrument' : 'Add New Instrument'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Instrument Name *</Label>
                  <Input
                    value={formData.instrument_name}
                    onChange={(e) => setFormData({...formData, instrument_name: e.target.value})}
                    placeholder="e.g., Kincrome 150mm"
                  />
                </div>
                <div>
                  <Label>ID / Serial No. *</Label>
                  <Input
                    value={formData.ident_no}
                    onChange={(e) => setFormData({...formData, ident_no: e.target.value})}
                    placeholder="e.g., 91"
                  />
                </div>
                <div>
                  <Label>Operator Name</Label>
                  <Input
                    value={formData.operator_name}
                    onChange={(e) => setFormData({...formData, operator_name: e.target.value})}
                    placeholder="e.g., GORAN"
                  />
                </div>
                <div>
                  <Label>Location</Label>
                  <Input
                    value={formData.location}
                    onChange={(e) => setFormData({...formData, location: e.target.value})}
                    placeholder="e.g., Machine #8"
                  />
                </div>
                <div>
                  <Label>Calibration Frequency (months) *</Label>
                  <Input
                    type="number"
                    value={formData.calibration_frequency}
                    onChange={(e) => setFormData({...formData, calibration_frequency: parseInt(e.target.value)})}
                  />
                </div>
                <div>
                  <Label>Required Accuracy</Label>
                  <Input
                    value={formData.required_accuracy}
                    onChange={(e) => setFormData({...formData, required_accuracy: e.target.value})}
                    placeholder="e.g., +/- 0.05"
                  />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  rows={3}
                />
              </div>
              <div className="flex gap-2 pt-4">
                <Button onClick={handleSave} className="flex-1">
                  {editingInstrument ? 'Update' : 'Create'} Instrument
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      </div> {/* End PDF Content Container */}
      
      {/* ISO-compliant Print Footer - Simple and Working */}
      <div className="print-footer" style={{display: 'none'}}>
        <table style={{width: '100%', fontSize: '8pt', borderTop: '2px solid #000', paddingTop: '5px'}}>
          <tr>
            <td style={{width: '60%', verticalAlign: 'top'}}>
              <div style={{fontWeight: 'bold', marginBottom: '2mm'}}>
                QUALITY MANAGEMENT SYSTEM FORM
              </div>
              <div style={{marginBottom: '1mm'}}>
                Form No: QMSF 07 | Issue 4: November 2025
              </div>
              <div style={{fontSize: '7pt', color: '#666'}}>
                Quality Management System - ISO 9001:2015
              </div>
            </td>
            <td style={{width: '40%', textAlign: 'right', verticalAlign: 'top', fontSize: '7pt'}}>
              <div>Total Instruments: {filteredInstruments.length}</div>
              <div style={{marginTop: '2mm', color: '#666'}}>
                Generated: {new Date().toLocaleDateString('en-AU')}
              </div>
            </td>
          </tr>
          <tr>
            <td colSpan="2" style={{paddingTop: '2mm', fontSize: '7pt', color: '#666'}}>
              This schedule is maintained in accordance with Ultimate Laser Pty Ltd&apos;s documented procedures. Calibration Frequency: As specified per instrument.
            </td>
          </tr>
        </table>
      </div>
    </div>
  );
};

export default CalibrationSchedule;
