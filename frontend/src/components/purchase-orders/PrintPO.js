import React from 'react';

// Utility function for Australian date format
const formatAustralianDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

// Utility function for Australian date-time format
const formatAustralianDateTime = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleString('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const PrintPO = ({ po }) => {
  if (!po) return null;

  const printStyles = `
    @media print {
      body * {
        visibility: hidden;
      }
      #printable-po, #printable-po * {
        visibility: visible;
      }
      #printable-po {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
      }
    }
  `;

  return (
    <>
      <style>{printStyles}</style>
      <div id="printable-po" className="hidden print:block p-8 bg-white">
        {/* Header */}
        <div className="border-b-2 border-slate-900 pb-4 mb-6">
          <h1 className="text-3xl font-bold text-slate-900">PURCHASE ORDER</h1>
          <p className="text-sm text-slate-600 mt-1">Nestix Manufacturing</p>
        </div>

        {/* PO Info Grid */}
        <div className="grid grid-cols-2 gap-8 mb-6">
          <div>
            <h3 className="font-semibold text-slate-900 mb-2">Supplier:</h3>
            <p className="font-bold">{po.supplier_name}</p>
            <p className="text-sm text-slate-600">Code: {po.supplier_code}</p>
          </div>
          <div>
            <div className="bg-slate-100 p-4 rounded">
              <div className="flex justify-between mb-2">
                <span className="font-semibold">PO Number:</span>
                <span className="font-bold">{po.po_number}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="font-semibold">Date:</span>
                <span>{formatAustralianDate(po.order_date)}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="font-semibold">Expected Delivery:</span>
                <span>{formatAustralianDate(po.expected_delivery_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">Status:</span>
                <span className="font-bold">{po.status}</span>
              </div>
            </div>
          </div>
        </div>

        {/* PO Type and Job Info */}
        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-semibold">PO Type:</span>
            <span className="px-3 py-1 bg-slate-200 rounded">{po.po_type}</span>
          </div>
          {po.job_number && (
            <div className="flex items-center gap-2">
              <span className="font-semibold">Job Number:</span>
              <span className="px-3 py-1 bg-blue-100 rounded">{po.job_number}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="font-semibold">Test Certificate Required:</span>
            <span className={`px-3 py-1 rounded ${po.test_cert_required ? 'bg-green-100 text-green-800' : 'bg-slate-100'}`}>
              {po.test_cert_required ? 'Yes' : 'No'}
            </span>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="mb-6">
          <h3 className="font-semibold text-slate-900 mb-3">Line Items:</h3>
          <table className="w-full border-collapse border border-slate-300">
            <thead className="bg-slate-100">
              <tr>
                <th className="border border-slate-300 px-3 py-2 text-left">Item</th>
                <th className="border border-slate-300 px-3 py-2 text-left">Material Specification</th>
                <th className="border border-slate-300 px-3 py-2 text-left">Dimensions</th>
                <th className="border border-slate-300 px-3 py-2 text-center">Qty</th>
                <th className="border border-slate-300 px-3 py-2 text-right">Price/Unit</th>
                <th className="border border-slate-300 px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {po.line_items.map((item, index) => (
                <tr key={item.id}>
                  <td className="border border-slate-300 px-3 py-2">{index + 1}</td>
                  <td className="border border-slate-300 px-3 py-2">
                    <div className="font-medium">{item.material_type}</div>
                    <div className="text-xs text-slate-600">
                      {item.grade} | {item.finish} | {item.thickness}
                    </div>
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-sm">
                    {item.width} × {item.length} mm
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-center">{item.quantity_ordered}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right">${item.price_per_unit.toFixed(2)}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right">${item.line_total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50">
              <tr>
                <td colSpan="5" className="border border-slate-300 px-3 py-2 text-right font-semibold">
                  Subtotal:
                </td>
                <td className="border border-slate-300 px-3 py-2 text-right font-semibold">
                  ${po.subtotal.toFixed(2)}
                </td>
              </tr>
              <tr>
                <td colSpan="5" className="border border-slate-300 px-3 py-2 text-right font-bold">
                  Total:
                </td>
                <td className="border border-slate-300 px-3 py-2 text-right font-bold text-lg">
                  ${po.total.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Notes */}
        {po.notes && (
          <div className="mb-4">
            <h3 className="font-semibold text-slate-900 mb-2">Notes:</h3>
            <div className="border border-slate-300 p-3 rounded bg-slate-50">
              <p className="text-sm whitespace-pre-wrap">{po.notes}</p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-slate-300 text-sm text-slate-600">
          <p>Please confirm receipt of this purchase order and expected delivery date.</p>
          <p className="mt-2">For any queries, please contact our procurement team.</p>
          <p className="mt-4 text-xs">Created by: {po.created_by} on {formatAustralianDateTime(po.created_at)}</p>
        </div>
      </div>
    </>
  );
};

export default PrintPO;
