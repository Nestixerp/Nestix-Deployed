import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import { getControlledDocumentByModule } from '../utils/documentControl';

const PrintCalibrationRecord = () => {
  const { recordId } = useParams();
  const [record, setRecord] = useState(null);
  const [instrument, setInstrument] = useState(null);
  const [settings, setSettings] = useState(null);
  const [docInfo, setDocInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [recordId]);

  const fetchData = async () => {
    try {
      // Fetch calibration record
      const recordResponse = await api.get(`/calibration/records/${recordId}`);
      setRecord(recordResponse.data);

      // Fetch instrument details
      const instrumentResponse = await api.get(`/calibration/instruments/${recordResponse.data.instrument_id}`);
      setInstrument(instrumentResponse.data);
    } catch (error) {
      console.error('Error fetching record/instrument:', error);
    }

    // Independent: settings (may fail due to mixed-content on some envs — don't let it block the rest)
    try {
      const settingsResponse = await api.get('/settings/');
      setSettings(settingsResponse.data);
    } catch (error) {
      console.warn('Settings fetch failed, continuing:', error?.message);
    }

    // Independent: Document Control lookup — pulls QMSF#/Issue/Revision Date live
    try {
      const doc = await getControlledDocumentByModule('Calibration Records', {
        fallback: 'Calibration Records', docType: 'Form',
      });
      setDocInfo(doc);
    } catch (error) {
      console.warn('Doc-control lookup failed:', error?.message);
    }

    setLoading(false);
    // Auto-print after data loads
    setTimeout(() => window.print(), 700);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-AU');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">Loading calibration record...</div>
      </div>
    );
  }

  if (!record || !instrument) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl text-red-600">Record not found</div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-4xl mx-auto bg-white" id="calibration-print-root">
      <style>
        {`
          @media print {
            html, body {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
              margin: 0 !important;
            }
            @page {
              size: A4 portrait;
              margin: 10mm 12mm 18mm 12mm;
            }
            /* Hide any iframe (commonly used by third-party widgets) */
            iframe { display: none !important; }
            .no-print { display: none !important; }
            .page-break { page-break-after: always; }
            /* Tighten the calibration print layout to fit a single A4 page */
            #calibration-print-root { padding: 4mm !important; max-width: none !important; }
            #calibration-print-root .section-h { font-size: 10pt !important; padding: 3px 5px !important; margin-bottom: 4px !important; }
            #calibration-print-root .compact-row { font-size: 9pt !important; }
            #calibration-print-root table th, #calibration-print-root table td { padding: 2px 4px !important; font-size: 9pt !important; }
            #calibration-print-root h1 { font-size: 15pt !important; }
            #calibration-print-root .sig-area { margin-top: 6mm !important; padding-top: 4mm !important; }
            #calibration-print-root .sig-area .sig-line { padding-bottom: 8mm !important; }
            /* Anchor Document Control footer to the bottom of every printed page */
            #calibration-print-root .dc-print-footer {
              position: fixed;
              left: 12mm; right: 12mm; bottom: 6mm;
              border-top: 1.2px solid #111;
              padding-top: 2mm;
              background: #fff;
              font-family: Calibri, Arial, sans-serif;
              font-size: 8pt;
              line-height: 1.3;
              color: #111;
              display: flex;
              justify-content: space-between;
              gap: 8px;
            }
            #calibration-print-root .dc-print-footer strong { color: #000; }
          }
          /* Hide the bottom-anchored footer on screen — only show in print */
          .dc-print-footer { display: none; }
          @media print { .dc-print-footer { display: flex; } }
        `}
      </style>

      {/* Header */}
      <div className="border-b-4 border-blue-600 pb-2 mb-3">
        <div className="flex justify-between items-start">
          <div>
            {settings?.company_logo && (
              <img src={settings.company_logo} alt="Company Logo" className="h-12 mb-1" />
            )}
            <h1 className="text-2xl font-bold text-gray-900">
              {settings?.company_name || 'Company Name'}
            </h1>
            <p className="text-sm text-gray-600">Calibration Certificate</p>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold">Record #: {record.record_number}</div>
            <div className="text-sm text-gray-600">Date: {formatDate(record.calibration_date)}</div>
          </div>
        </div>
      </div>

      {/* Instrument Information */}
      <div className="mb-3">
        <h2 className="section-h text-base font-semibold mb-2 bg-gray-100 p-2">Instrument Details</h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm compact-row">
          <div><span className="font-semibold">Instrument Name:</span> {instrument.instrument_name}</div>
          <div><span className="font-semibold">Identification No:</span> {instrument.ident_no}</div>
          <div><span className="font-semibold">Operator:</span> {instrument.operator_name || '-'}</div>
          <div><span className="font-semibold">Location:</span> {instrument.location || '-'}</div>
          <div><span className="font-semibold">Calibration Frequency:</span> {instrument.calibration_frequency} months</div>
          <div><span className="font-semibold">Required Accuracy:</span> {instrument.required_accuracy || '-'}</div>
        </div>
      </div>

      {/* Calibration Information */}
      <div className="mb-3">
        <h2 className="section-h text-base font-semibold mb-2 bg-gray-100 p-2">Calibration Details</h2>
        <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm compact-row">
          <div><span className="font-semibold">Calibration Date:</span> {formatDate(record.calibration_date)}</div>
          <div><span className="font-semibold">Next Calibration Due:</span> {formatDate(record.next_calibration_due)}</div>
          <div><span className="font-semibold">Performed By:</span> {record.performed_by || '-'}</div>
          <div><span className="font-semibold">Temperature:</span> {record.temperature || '-'}°C</div>
          <div><span className="font-semibold">Humidity:</span> {record.humidity || '-'}%</div>
          <div>
            <span className="font-semibold">Result:</span>
            <span className={`ml-2 px-2 py-1 rounded text-xs font-bold ${
              record.result === 'Pass' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {record.result}
            </span>
          </div>
        </div>
      </div>

      {/* Measurements */}
      {record.measurements && record.measurements.length > 0 && (
        <div className="mb-3">
          <h2 className="section-h text-base font-semibold mb-2 bg-gray-100 p-2">Measurement Results</h2>
          <table className="w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-200">
                <th className="border border-gray-300 p-1.5 text-left">Reference Size (mm)</th>
                <th className="border border-gray-300 p-1.5 text-left">Measured Size (mm)</th>
                <th className="border border-gray-300 p-1.5 text-left">Deviation (mm)</th>
                <th className="border border-gray-300 p-1.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {record.measurements.map((measurement, index) => {
                const isPass = Math.abs(measurement.deviation) <= 0.05;
                return (
                  <tr key={index}>
                    <td className="border border-gray-300 p-1.5">
                      {measurement.label || `${measurement.ref_size.toFixed(2)}`}
                    </td>
                    <td className="border border-gray-300 p-1.5">{measurement.measured_size.toFixed(3)}</td>
                    <td className="border border-gray-300 p-1.5">
                      <span className={isPass ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                        {measurement.deviation > 0 ? '+' : ''}{measurement.deviation.toFixed(3)}
                      </span>
                    </td>
                    <td className="border border-gray-300 p-1.5 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        isPass ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {isPass ? 'PASS' : 'FAIL'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Notes */}
      {record.notes && (
        <div className="mb-3">
          <h2 className="section-h text-base font-semibold mb-2 bg-gray-100 p-2">Notes</h2>
          <p className="text-sm compact-row">{record.notes}</p>
        </div>
      )}

      {/* Signature Section */}
      <div className="sig-area mb-3 pt-4 border-t-2 border-gray-300">
        <div className="grid grid-cols-2 gap-8">
          <div>
            <div className="sig-line border-b border-gray-400 mb-2 pb-6"></div>
            <div className="text-sm font-semibold">Calibrated By</div>
            <div className="text-xs text-gray-600">Name: {record.performed_by || '_________________'}</div>
            <div className="text-xs text-gray-600">Date: {formatDate(record.calibration_date)}</div>
          </div>
          <div>
            <div className="sig-line border-b border-gray-400 mb-2 pb-6"></div>
            <div className="text-sm font-semibold">Verified By</div>
            <div className="text-xs text-gray-600">Name: _________________</div>
            <div className="text-xs text-gray-600">Date: _________________</div>
          </div>
        </div>
      </div>

      {/* ISO-Compliant Document Control Footer — bottom of every printed page */}
      <div className="dc-print-footer">
        <div style={{flex: 1, minWidth: 0}}>
          <strong>Form No:</strong> {docInfo?.form_no || '—'}
          &nbsp;|&nbsp; <strong>Issue:</strong> {docInfo?.issue || '—'}
          &nbsp;|&nbsp; <strong>Revision Date:</strong>{' '}
          {docInfo?.revision_date ? formatDate(docInfo.revision_date) : '—'}
          &nbsp;|&nbsp; <strong>Owner:</strong> {docInfo?.owner || '—'}
          &nbsp;|&nbsp; <strong>Title:</strong> {docInfo?.title || 'Calibration Record'}
        </div>
        <div style={{whiteSpace: 'nowrap', color: '#555'}}>
          Record No: {record.record_number || record.id}
        </div>
      </div>

      {/* Print Button - Hidden when printing */}
      <div className="no-print text-center mt-8">
        <button 
          onClick={() => window.print()} 
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Print Certificate
        </button>
        <button 
          onClick={() => window.close()} 
          className="ml-4 px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default PrintCalibrationRecord;
