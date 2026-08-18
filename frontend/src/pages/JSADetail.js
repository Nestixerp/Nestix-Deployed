import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ArrowLeft, Edit, Printer, CheckCircle, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { useNavigate, useParams } from 'react-router-dom';
import { formatDate } from '../utils/dateFormatter';
import { getControlledDocumentByModule, buildDocControlFooter, buildPrintFooterCss, buildPrintFooterHtml, buildPrintBodyOpen, buildPrintBodyClose, invalidateDocControlCache } from '../utils/documentControl';

const escapeHtml = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[c]);

const JSADetail = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const [jsa, setJSA] = useState(null);
  const [loading, setLoading] = useState(true);
  const [docControl, setDocControl] = useState(null);

  useEffect(() => {
    fetchJSA();
    // Preload the Document Control entry so Print can stamp the audit footer.
    (async () => {
      invalidateDocControlCache();
      const doc = await getControlledDocumentByModule('JSA Form', { fallback: 'JSA', docType: 'Form' });
      setDocControl(doc);
    })();
  }, [id]);

  const fetchJSA = async () => {
    try {
      const response = await api.get(`/jsas/${id}`);
      setJSA(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching JSA:', error);
      alert('Failed to load JSA');
      setLoading(false);
    }
  };

  const buildPrintHtml = () => {
    if (!jsa) return '';
    const footer = buildDocControlFooter(docControl, {
      title: 'Job Safety Analysis',
      owner: 'Quality Manager'
    });

    const riskClass = (lvl = '') => {
      const s = String(lvl);
      if (s.includes('High')) return 'risk-high';
      if (s.includes('Medium')) return 'risk-med';
      return 'risk-low';
    };

    const rows = (jsa.hazard_rows || []).map((row, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${escapeHtml(row.activity)}</td>
        <td>${escapeHtml(row.hazards)}</td>
        <td>${escapeHtml(row.risk_control_measures)}</td>
        <td>${escapeHtml(row.who_is_responsible)}</td>
        <td class="risk-cell">
          <span class="risk-pill ${riskClass(row.risk_level)}">${escapeHtml(row.risk_level)}</span>
          <div class="risk-cl">C:${escapeHtml(row.risk_consequence)} L:${escapeHtml(row.risk_likelihood)}</div>
        </td>
      </tr>
    `).join('');

    const reviewBlock = (jsa.review_history && jsa.review_history.length) ? `
      <h3 class="section-h">Review History</h3>
      <table class="review-tbl">
        <thead><tr>
          <th style="width:28%;">Reviewer</th>
          <th style="width:18%;">Date</th>
          <th>Notes</th>
        </tr></thead>
        <tbody>
          ${jsa.review_history.map((r) => `
            <tr>
              <td>${escapeHtml(r.reviewed_by_name || r.reviewed_by || '')}</td>
              <td>${escapeHtml(formatDate(r.reviewed_date))}</td>
              <td>${escapeHtml(r.notes || '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '';

    const approvedBlock = jsa.approval_status === 'Approved' ? `
      <div class="meta-cell">
        <div class="meta-label">Approved By</div>
        <div class="meta-value">${escapeHtml(jsa.approved_by_name || jsa.approved_by || '')}</div>
        <div class="meta-sub">${escapeHtml(formatDate(jsa.approved_date))}</div>
      </div>` : '';

    const reviewedBlock = jsa.last_reviewed_date ? `
      <div class="meta-cell">
        <div class="meta-label">Last Reviewed</div>
        <div class="meta-value">${escapeHtml(formatDate(jsa.last_reviewed_date))}</div>
        ${jsa.next_review_date ? `<div class="meta-sub">Next Review: ${escapeHtml(formatDate(jsa.next_review_date))}</div>` : ''}
      </div>` : '';

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>JSA ${escapeHtml(jsa.jsa_number || '')}</title>
<style>
  ${buildPrintFooterCss()}
  * { box-sizing: border-box; }
  body { font-family: Calibri, Arial, sans-serif; color: #111; font-size: 10.5pt; }
  .doc-head { text-align: center; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 12px; }
  .doc-head h1 { font-size: 18pt; margin: 0; letter-spacing: 0.5px; }
  .doc-head h2 { font-size: 13pt; margin: 4px 0 0 0; color: #1e3a8a; }
  .doc-meta-bar { display: flex; justify-content: space-between; font-size: 10pt; margin-top: 8px; }
  .status-badge { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 9pt; font-weight: bold; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .status-Approved { background: #dcfce7; color: #166534; border: 1px solid #16a34a; }
  .status-Draft { background: #fef9c3; color: #854d0e; border: 1px solid #ca8a04; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 22px; margin: 10px 0 14px 0; padding-bottom: 10px; border-bottom: 1px solid #ddd; }
  .meta-cell { font-size: 10pt; }
  .meta-label { font-weight: bold; color: #374151; }
  .meta-value { margin-top: 2px; }
  .meta-sub { color: #6b7280; font-size: 9pt; }
  .section-h { font-size: 12pt; margin: 14px 0 6px 0; color: #111; border-bottom: 1px solid #999; padding-bottom: 3px; }
  .activity-box { border: 1px solid #999; padding: 8px 10px; background: #fafafa; font-size: 10pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table.haz-tbl, table.review-tbl { width: 100%; border-collapse: collapse; margin-top: 4px; }
  table.haz-tbl th, table.haz-tbl td,
  table.review-tbl th, table.review-tbl td {
    border: 1px solid #444; padding: 6px 7px; vertical-align: top; font-size: 9.5pt;
  }
  table.haz-tbl thead th, table.review-tbl thead th {
    background: #1e3a8a; color: #fff; font-weight: bold; text-align: left; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  table.haz-tbl thead { display: table-header-group; }
  table.haz-tbl tfoot { display: table-footer-group; }
  table.haz-tbl tr, table.review-tbl tr { page-break-inside: avoid; break-inside: avoid; }
  table.haz-tbl td.num { width: 28px; text-align: center; font-weight: bold; }
  table.haz-tbl td.risk-cell { text-align: center; width: 86px; }
  .risk-pill { display: inline-block; padding: 2px 8px; border-radius: 8px; font-size: 8.5pt; font-weight: bold; border: 1px solid; }
  .risk-high { background: #fee2e2; color: #991b1b; border-color: #dc2626; }
  .risk-med { background: #fef3c7; color: #92400e; border-color: #d97706; }
  .risk-low { background: #dcfce7; color: #166534; border-color: #16a34a; }
  .risk-cl { font-size: 8pt; color: #555; margin-top: 2px; }
  .sign-grid { margin-top: 22px; display: grid; grid-template-columns: 1fr 1fr; gap: 30px; page-break-inside: avoid; }
  .sign-block { border-top: 1px solid #000; padding-top: 4px; font-size: 9.5pt; min-height: 50px; }
  .sign-label { color: #6b7280; font-size: 8.5pt; }
  .audit-line { margin-top: 10px; font-size: 8.5pt; color: #6b7280; text-align: center; }
  @media print { .no-print { display: none !important; } }
</style></head><body>${buildPrintBodyOpen(footer)}

  <div class="doc-head">
    <h1>ULTIMATE LASER PTY LTD</h1>
    <h2>JOB SAFETY ANALYSIS (JSA)</h2>
    <div class="doc-meta-bar">
      <div><strong>JSA No:</strong> ${escapeHtml(jsa.jsa_number || '')}</div>
      <div><span class="status-badge status-${escapeHtml(jsa.approval_status || 'Draft')}">${escapeHtml(jsa.approval_status || 'Draft')}</span></div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-cell">
      <div class="meta-label">Company Name</div>
      <div class="meta-value">${escapeHtml(jsa.company_name || '')}</div>
    </div>
    <div class="meta-cell">
      <div class="meta-label">Machine / Process</div>
      <div class="meta-value">${escapeHtml(jsa.machine_process || '')}</div>
    </div>
    <div class="meta-cell">
      <div class="meta-label">Date</div>
      <div class="meta-value">${escapeHtml(formatDate(jsa.date_created))}</div>
    </div>
    <div class="meta-cell">
      <div class="meta-label">Works Location</div>
      <div class="meta-value">${escapeHtml(jsa.works_location || '')}</div>
    </div>
    ${approvedBlock}
    ${reviewedBlock}
  </div>

  <h3 class="section-h">Activity Description</h3>
  <div class="activity-box">${escapeHtml(jsa.activity_description || '').replace(/\n/g, '<br/>')}</div>

  <h3 class="section-h">Hazard Analysis</h3>
  <table class="haz-tbl">
    <thead>
      <tr>
        <th style="width:28px;">#</th>
        <th style="width:18%;">Activity / Task Step</th>
        <th style="width:22%;">Hazards</th>
        <th>Risk Control Measures</th>
        <th style="width:14%;">Responsible</th>
        <th style="width:86px;">Risk</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="6" style="text-align:center; padding:12px; color:#666;">No hazards recorded</td></tr>`}
    </tbody>
  </table>

  ${reviewBlock}

  <div class="sign-grid">
    <div>
      <div class="sign-block">${escapeHtml(jsa.approved_by_name || jsa.approved_by || '')}</div>
      <div class="sign-label">Approved By (Name &amp; Signature)</div>
      <div class="sign-label">Date: ${escapeHtml(jsa.approval_status === 'Approved' ? formatDate(jsa.approved_date) : '')}</div>
    </div>
    <div>
      <div class="sign-block"></div>
      <div class="sign-label">Acknowledged By Operator (Name &amp; Signature)</div>
      <div class="sign-label">Date:</div>
    </div>
  </div>

  <div class="audit-line">
    Created by: ${escapeHtml(jsa.created_by || '')} on ${escapeHtml(formatDate(jsa.created_at))}
    ${jsa.updated_at && formatDate(jsa.updated_at) !== formatDate(jsa.created_at) ? ` &nbsp;|&nbsp; Last updated: ${escapeHtml(formatDate(jsa.updated_at))}` : ''}
  </div>

  ${buildPrintBodyClose()}
</body></html>`;
  };

  const handlePrint = () => {
    if (!jsa) return;
    const w = window.open('', '_blank', 'width=1100,height=1400');
    if (!w) {
      alert('Pop-up blocked. Please allow pop-ups to print the JSA.');
      return;
    }
    w.document.write(buildPrintHtml());
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };

  const handleApprove = async () => {
    try {
      await api.post(`/jsas/${id}/approve`);
      alert('JSA approved successfully!');
      fetchJSA();
    } catch (error) {
      console.error('Error approving JSA:', error);
      alert('Failed to approve JSA: ' + (error.response?.data?.detail || error.message));
    }
  };

  const getRiskColor = (riskLevel) => {
    if (riskLevel.includes('High')) return 'bg-red-100 text-red-800 border-red-300';
    if (riskLevel.includes('Medium')) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-green-100 text-green-800 border-green-300';
  };

  const canManageJSAs = currentUser?.role === 'Administrator' || currentUser?.role === 'Quality Manager';

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center py-8">Loading JSA...</div>
      </div>
    );
  }

  if (!jsa) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center py-8">JSA not found</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* No Print Buttons */}
      <div className="no-print mb-4 flex justify-between items-center">
        <Button variant="outline" onClick={() => navigate('/quality/jsa')} data-testid="back-to-register-btn">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Register
        </Button>

        <div className="flex gap-2">
          {canManageJSAs && jsa.approval_status === 'Draft' && (
            <>
              <Button
                variant="outline"
                onClick={() => navigate(`/jsa/${id}/edit`)}
                data-testid="edit-jsa-btn"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>

              <Button
                onClick={handleApprove}
                className="bg-green-600 hover:bg-green-700"
                data-testid="approve-jsa-btn"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Approve JSA
              </Button>
            </>
          )}

          <Button onClick={handlePrint} data-testid="print-jsa-btn">
            <Printer className="w-4 h-4 mr-2" />
            Print
          </Button>
        </div>
      </div>

      {/* JSA Content */}
      <Card className="jsa-print-content" data-testid="jsa-detail-card">
        <CardHeader className="border-b">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold">ULTIMATE LASER PTY LTD</h1>
            <h2 className="text-xl font-semibold">JOB SAFETY ANALYSIS (JSA)</h2>
            <div className="flex justify-between items-center mt-4 text-sm">
              <div>
                <strong>JSA Number:</strong> {jsa.jsa_number}
              </div>
              <div>
                <Badge variant={jsa.approval_status === 'Approved' ? 'default' : 'secondary'}>
                  {jsa.approval_status}
                </Badge>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          {/* Header Information */}
          <div className="grid grid-cols-2 gap-6 mb-6 pb-6 border-b">
            <div>
              <div className="mb-3">
                <span className="font-semibold">Company Name:</span>
                <p className="mt-1">{jsa.company_name}</p>
              </div>

              <div className="mb-3">
                <span className="font-semibold">Date:</span>
                <p className="mt-1">{formatDate(jsa.date_created)}</p>
              </div>

              <div className="mb-3">
                <span className="font-semibold">Works Location:</span>
                <p className="mt-1">{jsa.works_location}</p>
              </div>
            </div>

            <div>
              <div className="mb-3">
                <span className="font-semibold">Machine/Process:</span>
                <p className="mt-1">{jsa.machine_process}</p>
              </div>

              {jsa.approval_status === 'Approved' && (
                <div className="mb-3">
                  <span className="font-semibold">Approved By:</span>
                  <p className="mt-1">{jsa.approved_by_name || jsa.approved_by}</p>
                  <p className="text-sm text-gray-600">{formatDate(jsa.approved_date)}</p>
                </div>
              )}

              {jsa.last_reviewed_date && (
                <div className="mb-3">
                  <span className="font-semibold">Last Reviewed:</span>
                  <p className="mt-1">{formatDate(jsa.last_reviewed_date)}</p>
                  <p className="text-sm text-gray-600">
                    Next Review: {formatDate(jsa.next_review_date)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Activity Description */}
          <div className="mb-6 pb-6 border-b">
            <h3 className="font-semibold text-lg mb-2">Activity Description</h3>
            <p className="text-gray-700">{jsa.activity_description}</p>
          </div>

          {/* Hazard Analysis Table */}
          <div>
            <h3 className="font-semibold text-lg mb-4">Hazard Analysis</h3>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-semibold">Activity</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-semibold">Hazards</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-semibold">Risk Control Measures</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-semibold">Responsible</th>
                    <th className="border border-gray-300 px-3 py-2 text-center text-sm font-semibold">Risk Level</th>
                  </tr>
                </thead>
                <tbody>
                  {jsa.hazard_rows.map((row, index) => (
                    <tr key={index}>
                      <td className="border border-gray-300 px-3 py-2 text-sm align-top">
                        {row.activity}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-sm align-top">
                        {row.hazards}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-sm align-top">
                        {row.risk_control_measures}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-sm align-top">
                        {row.who_is_responsible}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-sm text-center align-top">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`px-2 py-1 rounded text-xs font-semibold border ${getRiskColor(row.risk_level)}`}>
                            {row.risk_level}
                          </span>
                          <span className="text-xs text-gray-600">
                            C:{row.risk_consequence} L:{row.risk_likelihood}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Review History */}
          {jsa.review_history && jsa.review_history.length > 0 && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="font-semibold text-lg mb-3">Review History</h3>
              <div className="space-y-2">
                {jsa.review_history.map((review, index) => (
                  <div key={index} className="flex items-start gap-3 text-sm bg-gray-50 p-3 rounded">
                    <Clock className="w-4 h-4 text-gray-500 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium">
                        {review.reviewed_by_name || review.reviewed_by}
                      </div>
                      <div className="text-gray-600">
                        {formatDate(review.reviewed_date)}
                      </div>
                      {review.notes && (
                        <div className="mt-1 text-gray-700">{review.notes}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 pt-6 border-t text-sm text-gray-600 text-center">
            <p>Created by: {jsa.created_by} on {formatDate(jsa.created_at)}</p>
            {jsa.updated_at && formatDate(jsa.updated_at) !== formatDate(jsa.created_at) && (
              <p>Last updated: {formatDate(jsa.updated_at)}</p>
            )}
            {docControl && (
              <p className="mt-2 text-xs text-gray-500" data-testid="doc-control-stamp">
                Form No: {docControl.form_no || '—'} &nbsp;|&nbsp;
                Issue: {docControl.issue || '—'} &nbsp;|&nbsp;
                Revision Date: {docControl.revision_date ? formatDate(docControl.revision_date) : '—'}
                {docControl.owner ? ` | Owner: ${docControl.owner}` : ''}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default JSADetail;
