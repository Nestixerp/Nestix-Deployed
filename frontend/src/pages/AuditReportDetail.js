import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import HelpButton from '../components/audit/HelpButton';
import RichTextEditor from '../components/ui/RichTextEditor';
import { 
  ShieldCheck, Edit, Save, FileText, AlertTriangle, 
  CheckCircle, XCircle, Eye, Download, ArrowLeft 
} from 'lucide-react';
import api from '../services/api';
import { formatDate } from '../utils/dateFormatter';

const AuditReportDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [audit, setAudit] = useState(null);
  const [findings, setFindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [showFindingDialog, setShowFindingDialog] = useState(false);
  const [showEditAuditDialog, setShowEditAuditDialog] = useState(false);
  const [auditFormData, setAuditFormData] = useState({
    report_number: '',
    auditor_name: '',
    client_name: '',
    assessed_sites: '',
    scope_of_audit: '',
    exclusions: '',
    audit_start_date: '',
    audit_end_date: ''
  });
  const [findingFormData, setFindingFormData] = useState({
    evidence: '',
    findings: '',
    finding_type: 'Conformity',
    ofi_reference: '',
    ncr_number: '',
    ncr_date: '',
    ncr_customer_supplier: '',
    ncr_root_cause: '',
    ncr_action_taken: '',
    is_follow_up_required: false,
    status: '',
    risk_rating: '',
    records_checked: '',
    people_interviewed: '',
    area_inspected: '',
    documents_reviewed: '',
    evidence_adequate: null,
    repeat_issue: null,
    corrective_action_required: null,
    correction: '',
    corrective_action: '',
    responsible_person: '',
    due_date: '',
    completion_date: '',
    completion_evidence: '',
    effectiveness_verified_by: '',
    effectiveness_verification_date: ''
  });
  const [dialogTab, setDialogTab] = useState('finding');
  const [dialogSamples, setDialogSamples] = useState([]);
  const [newSample, setNewSample] = useState({ sample_type: 'Job', sample_id: '', name: '', location: '', result: '', notes: '' });
  const [showTrail, setShowTrail] = useState(false);
  const [trail, setTrail] = useState([]);
  const [showReopen, setShowReopen] = useState(false);
  const [reopenForm, setReopenForm] = useState({ reason: '', authorised_by: '' });

  const STATUS_OPTIONS = ['Not Started', 'In Progress', 'Conformity', 'Minor Nonconformity', 'Major Nonconformity',
    'Observation', 'Opportunity for Improvement', 'Correction Required', 'Not Applicable', 'Not Audited', 'Closed', 'Verified'];
  const SAMPLE_TYPES = ['Job', 'Quote', 'Purchase Order', 'Test Certificate', 'Supplier', 'Employee Training Record',
    'Calibration Item', 'Fire Extinguisher', 'Electrical Item', 'First Aid Kit', 'Spill Kit', 'NCR',
    'Customer Complaint', 'Environmental Record', 'OHS Incident', 'Management Review Action', 'Other'];

  useEffect(() => {
    if (id) {
      fetchAuditDetails();
      fetchFindings();
    }
  }, [id]);

  const fetchAuditDetails = async () => {
    try {
      const response = await api.get(`/audits/${id}`);
      setAudit(response.data);
    } catch (error) {
      console.error('Error fetching audit details:', error);
      alert('Failed to fetch audit details: ' + (error.response?.data?.detail || error.message));
    }
  };

  const fetchFindings = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/audits/${id}/findings`);
      setFindings(response.data);
    } catch (error) {
      console.error('Error fetching findings:', error);
      alert('Failed to fetch findings: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  const openFindingDialog = (finding) => {
    setSelectedFinding(finding);
    setFindingFormData({
      evidence: finding.evidence || '',
      findings: finding.findings || '',
      finding_type: finding.finding_type || 'Conformity',
      ofi_reference: finding.ofi_reference || '',
      ncr_number: finding.ncr_number || '',
      ncr_date: finding.ncr_date ? new Date(finding.ncr_date).toISOString().split('T')[0] : '',
      ncr_customer_supplier: finding.ncr_customer_supplier || '',
      ncr_root_cause: finding.ncr_root_cause || '',
      ncr_action_taken: finding.ncr_action_taken || '',
      is_follow_up_required: finding.is_follow_up_required || false,
      status: finding.status || '',
      risk_rating: finding.risk_rating || '',
      records_checked: finding.records_checked || '',
      people_interviewed: finding.people_interviewed || '',
      area_inspected: finding.area_inspected || '',
      documents_reviewed: finding.documents_reviewed || '',
      evidence_adequate: finding.evidence_adequate ?? null,
      repeat_issue: finding.repeat_issue ?? null,
      corrective_action_required: finding.corrective_action_required ?? null,
      correction: finding.correction || '',
      corrective_action: finding.corrective_action || '',
      responsible_person: finding.responsible_person || '',
      due_date: finding.due_date || '',
      completion_date: finding.completion_date || '',
      completion_evidence: finding.completion_evidence || '',
      effectiveness_verified_by: finding.effectiveness_verified_by || '',
      effectiveness_verification_date: finding.effectiveness_verification_date || ''
    });
    setDialogTab('finding');
    api.get(`/audits/${id}/samples`, { params: { finding_id: finding.id } }).then(r => setDialogSamples(r.data.items)).catch(() => setDialogSamples([]));
    setShowFindingDialog(true);
  };

  const addSample = async () => {
    if (!newSample.sample_id && !newSample.name) return alert('Enter a sample ID or name');
    try {
      await api.post(`/audits/${id}/samples`, { ...newSample, report_id: id, finding_id: selectedFinding.id });
      const r = await api.get(`/audits/${id}/samples`, { params: { finding_id: selectedFinding.id } });
      setDialogSamples(r.data.items);
      setNewSample({ sample_type: newSample.sample_type, sample_id: '', name: '', location: '', result: '', notes: '' });
    } catch (e) { alert('Failed: ' + (e?.response?.data?.detail || e.message)); }
  };
  const deleteSample = async (sid) => {
    await api.delete(`/audits/samples/${sid}`);
    setDialogSamples(s => s.filter(x => x.id !== sid));
  };

  const openTrail = async () => {
    const r = await api.get(`/audits/${id}/trail`);
    setTrail(r.data.items); setShowTrail(true);
  };
  const lockAudit = async () => {
    if (!window.confirm('Lock this audit? No further edits will be allowed until it is reopened with a reason and authorisation.')) return;
    await api.post(`/audits/${id}/lock`, {}); fetchAuditDetails();
  };
  const reopenAudit = async () => {
    if (!reopenForm.reason.trim() || !reopenForm.authorised_by.trim()) return alert('Reason and Authorised By are both required.');
    await api.post(`/audits/${id}/reopen`, reopenForm);
    setShowReopen(false); setReopenForm({ reason: '', authorised_by: '' }); fetchAuditDetails();
  };

  const saveFinding = async () => {
    if (!selectedFinding) return;

    // Conformity is not allowed when follow-up / correction is still required
    if (findingFormData.is_follow_up_required &&
        (findingFormData.finding_type === 'Conformity') &&
        (!findingFormData.status || findingFormData.status === 'Conformity')) {
      alert('A section with a required follow-up action cannot be classified as Conformity.\n\nUse "Correction Required", "Minor Nonconformity" or "Opportunity for Improvement" as appropriate.');
      return;
    }

    try {
      const updateData = {
        ...findingFormData,
        ncr_date: findingFormData.ncr_date ? new Date(findingFormData.ncr_date).toISOString() : null
      };

      await api.put(`/audits/findings/${selectedFinding.id}`, updateData);
      setShowFindingDialog(false);
      fetchFindings();
    } catch (error) {
      console.error('Error updating finding:', error);
      alert('Failed to update finding: ' + (error.response?.data?.detail || error.message));
    }
  };

  const downloadPDF = async () => {
    try {
      const response = await api.get(`/audits/${id}/pdf`, {
        responseType: 'blob'
      });
      
      // Create blob link to download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Audit_Report_${audit.report_number.replace(/ /g, '_')}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      alert('Failed to download PDF: ' + (error.response?.data?.detail || error.message));
    }
  };

  const openEditAuditDialog = () => {
    setAuditFormData({
      report_number: audit.report_number || '',
      auditor_name: audit.auditor_name || '',
      client_name: audit.client_name || '',
      assessed_sites: audit.assessed_sites || '',
      scope_of_audit: audit.scope_of_audit || '',
      exclusions: audit.exclusions || '',
      audit_start_date: audit.audit_start_date ? new Date(audit.audit_start_date).toISOString().split('T')[0] : '',
      audit_end_date: audit.audit_end_date ? new Date(audit.audit_end_date).toISOString().split('T')[0] : ''
    });
    setShowEditAuditDialog(true);
  };

  const saveAuditInfo = async () => {
    try {
      const updateData = {
        ...auditFormData,
        audit_start_date: auditFormData.audit_start_date ? new Date(auditFormData.audit_start_date).toISOString() : null,
        audit_end_date: auditFormData.audit_end_date ? new Date(auditFormData.audit_end_date).toISOString() : null
      };

      await api.put(`/audits/${id}`, updateData);
      setShowEditAuditDialog(false);
      fetchAuditDetails();
      alert('Audit information updated successfully');
    } catch (error) {
      console.error('Error updating audit:', error);
      alert('Failed to update audit: ' + (error.response?.data?.detail || error.message));
    }
  };

  const getFindingTypeColor = (type) => {
    switch (type) {
      case 'Conformity':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'OFI':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'Minor NCR':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'Major NCR':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getFindingIcon = (type) => {
    switch (type) {
      case 'Conformity':
        return <CheckCircle className="w-3 h-3" />;
      case 'OFI':
        return <Eye className="w-3 h-3" />;
      case 'Minor NCR':
        return <AlertTriangle className="w-3 h-3" />;
      case 'Major NCR':
        return <XCircle className="w-3 h-3" />;
      default:
        return <FileText className="w-3 h-3" />;
    }
  };

  if (loading) {
    return <div className="p-8">Loading audit report...</div>;
  }

  if (!audit) {
    return <div className="p-8">Audit report not found</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={() => navigate('/quality/audits')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Audits
              </Button>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="w-6 h-6 text-blue-600" />
                  {audit.report_number} - {audit.client_name}
                </CardTitle>
                <p className="text-sm text-slate-600 mt-1">
                  Internal Audit Report – IMS (Quality / Environmental / OHS)
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={openTrail} data-testid="audit-history-btn">History</Button>
              {audit.locked
                ? <Button variant="outline" size="sm" onClick={() => setShowReopen(true)} className="text-amber-700 border-amber-300" data-testid="audit-reopen-btn">Reopen Audit</Button>
                : <Button variant="outline" size="sm" onClick={lockAudit} data-testid="audit-lock-btn">Lock Audit</Button>}
              <Button variant="outline" onClick={openEditAuditDialog} disabled={audit.locked}>
                <Edit className="w-4 h-4 mr-2" />
                Edit Info
              </Button>
              <Button variant="outline" onClick={downloadPDF}>
                <Download className="w-4 h-4 mr-2" />
                Download PDF
              </Button>
            </div>
          </div>
          {audit.locked && (
            <div className="mt-3 bg-amber-50 border border-amber-300 text-amber-800 text-sm rounded px-3 py-2" data-testid="audit-locked-banner">
              🔒 This audit is locked{audit.locked_by ? ` by ${audit.locked_by}` : ''}. Reopening requires a reason and authorisation, which are recorded in the audit trail.
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Audit Information */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
            <div className="space-y-2">
              <div><strong>Auditor:</strong> {audit.auditor_name}</div>
              <div><strong>Report Date:</strong> {formatDate(audit.report_date)}</div>
              <div><strong>Client:</strong> {audit.client_name}</div>
            </div>
            <div className="space-y-2">
              <div><strong>Assessed Sites:</strong> {audit.assessed_sites}</div>
              <div><strong>Standards Audited:</strong></div>
              <div className="flex flex-wrap gap-1">
                {audit.standards_audited.map((standard) => (
                  <Badge key={standard} className="text-xs">{standard}</Badge>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <div><strong>Scope of Audit:</strong></div>
              <div className="text-slate-700">{audit.scope_of_audit}</div>
              {audit.exclusions && (
                <div><strong>Exclusions:</strong> {audit.exclusions}</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Clauses - Two Column Layout */}
      <Card>
        <CardHeader>
          <CardTitle>ISO Audit Clauses & Findings</CardTitle>
          <p className="text-sm text-slate-600">
            Click on any clause to add or edit Evidence and Findings
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {findings.map((finding) => (
              <div
                key={finding.id}
                className="grid grid-cols-12 gap-4 p-4 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                onClick={() => openFindingDialog(finding)}
              >
                {/* Left Column - Clause Info (4 cols) */}
                <div className="col-span-4">
                  <div className="flex items-start gap-3">
                    <div className="font-mono text-sm font-semibold text-blue-600 min-w-[60px]">
                      {finding.clause_number}
                    </div>
                    <div>
                      <div className="font-semibold text-sm flex items-center gap-1.5 flex-wrap">
                        {finding.clause_title}
                        <HelpButton section={finding.clause_title} size="xs" />
                      </div>
                      {finding.iso_clause_reference && (
                        <div className="text-xs text-slate-500 mt-1">
                          {finding.iso_clause_reference}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[11px] text-slate-500">
                        {finding.status && <span className={`px-1.5 py-0.5 rounded font-semibold ${
                          ['Minor Nonconformity', 'Major Nonconformity', 'Correction Required'].includes(finding.status) ? 'bg-red-100 text-red-700'
                          : ['Conformity', 'Closed', 'Verified'].includes(finding.status) ? 'bg-green-100 text-green-700'
                          : ['In Progress', 'Observation', 'Opportunity for Improvement'].includes(finding.status) ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-600'}`} data-testid={`clause-status-${finding.clause_number}`}>{finding.status}</span>}
                        {finding.risk_rating && <span className={`px-1.5 py-0.5 rounded font-semibold ${finding.risk_rating === 'Critical' || finding.risk_rating === 'High' ? 'bg-red-100 text-red-700' : finding.risk_rating === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>Risk: {finding.risk_rating}</span>}
                        {finding.corrective_action_required && <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-semibold">CA required</span>}
                        {finding.updated_at && <span>Updated {formatDate(finding.updated_at)}</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column - Finding Status & Content (8 cols) */}
                <div className="col-span-8">
                  <div className="flex items-start justify-between mb-2">
                    <Badge className={`text-xs ${getFindingTypeColor(finding.finding_type)}`}>
                      {getFindingIcon(finding.finding_type)}
                      <span className="ml-1">{finding.finding_type}</span>
                      {finding.ofi_reference && ` - ${finding.ofi_reference}`}
                      {finding.ncr_number && ` - ${finding.ncr_number}`}
                    </Badge>
                    <Edit className="w-4 h-4 text-slate-400" />
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    {finding.evidence && (
                      <div>
                        <span 
                          className="text-slate-600" 
                          dangerouslySetInnerHTML={{ 
                            __html: (finding.evidence || '').replace(/<[^>]*>/g, ' ').substring(0, 100) + '...' 
                          }}
                        />
                      </div>
                    )}
                    {finding.findings && (
                      <div>
                        <span 
                          className="text-slate-600"
                          dangerouslySetInnerHTML={{ 
                            __html: (finding.findings || '').replace(/<[^>]*>/g, ' ').substring(0, 100) + '...' 
                          }}
                        />
                      </div>
                    )}
                    {(!finding.evidence && !finding.findings) && (
                      <div className="text-slate-400 italic">Click to add evidence and findings</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Edit Audit Information Dialog */}
      <Dialog open={showEditAuditDialog} onOpenChange={setShowEditAuditDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Audit Information</DialogTitle>
            <DialogDescription>
              Update audit report details and header information
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="report_number">Report Number</Label>
                <Input
                  id="report_number"
                  value={auditFormData.report_number}
                  onChange={(e) => setAuditFormData({...auditFormData, report_number: e.target.value})}
                  placeholder="AR-2025-026"
                />
              </div>
              <div>
                <Label htmlFor="auditor_name">Auditor Name</Label>
                <Input
                  id="auditor_name"
                  value={auditFormData.auditor_name}
                  onChange={(e) => setAuditFormData({...auditFormData, auditor_name: e.target.value})}
                  placeholder="John Tsoukalas"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="client_name">Client Name</Label>
              <Input
                id="client_name"
                value={auditFormData.client_name}
                onChange={(e) => setAuditFormData({...auditFormData, client_name: e.target.value})}
                placeholder="Ultimate Laser Pty Ltd"
              />
            </div>

            <div>
              <Label htmlFor="assessed_sites">Assessed Site(s)</Label>
              <Textarea
                id="assessed_sites"
                value={auditFormData.assessed_sites}
                onChange={(e) => setAuditFormData({...auditFormData, assessed_sites: e.target.value})}
                placeholder="36-40 Micro Circuit, Dandenong, VIC 3175"
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="scope_of_audit">Scope of Audit</Label>
              <Textarea
                id="scope_of_audit"
                value={auditFormData.scope_of_audit}
                onChange={(e) => setAuditFormData({...auditFormData, scope_of_audit: e.target.value})}
                placeholder="The provision of services..."
                rows={4}
              />
            </div>

            <div>
              <Label htmlFor="exclusions">Exclusions</Label>
              <Textarea
                id="exclusions"
                value={auditFormData.exclusions}
                onChange={(e) => setAuditFormData({...auditFormData, exclusions: e.target.value})}
                placeholder="ISO 9001:2015 Section 8.3..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="audit_start_date">Audit Start Date</Label>
                <Input
                  id="audit_start_date"
                  type="date"
                  value={auditFormData.audit_start_date}
                  onChange={(e) => setAuditFormData({...auditFormData, audit_start_date: e.target.value})}
                />
              </div>
              <div>
                <Label htmlFor="audit_end_date">Audit End Date (Optional)</Label>
                <Input
                  id="audit_end_date"
                  type="date"
                  value={auditFormData.audit_end_date}
                  onChange={(e) => setAuditFormData({...auditFormData, audit_end_date: e.target.value})}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditAuditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveAuditInfo}>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Finding Detail Dialog */}
      <Dialog open={showFindingDialog} onOpenChange={setShowFindingDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              {selectedFinding?.clause_number} - {selectedFinding?.clause_title}
              {selectedFinding && <HelpButton section={selectedFinding.clause_title} />}
            </DialogTitle>
            <DialogDescription>
              {selectedFinding?.iso_clause_reference && (
                <span className="text-blue-600">{selectedFinding.iso_clause_reference}</span>
              )}
              {selectedFinding?.audit_prompt && (
                <span className="block text-xs text-slate-500 mt-1 italic">{selectedFinding.audit_prompt}</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-1 border-b -mt-2">
            {[['finding', 'Finding & Evidence'], ['details', 'Evidence Details'], ['ca', 'Corrective Action'], ['samples', `Samples (${dialogSamples.length})`]].map(([k, l]) => (
              <button key={k} onClick={() => setDialogTab(k)}
                className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px ${dialogTab === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                data-testid={`finding-tab-${k}`}>{l}</button>
            ))}
          </div>

          {dialogTab === 'details' && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Records / sample records checked</Label>
                  <Input value={findingFormData.records_checked} onChange={e => setFindingFormData({ ...findingFormData, records_checked: e.target.value })} placeholder="e.g. Job 10452, PO-2231, Cal ID VC-03" data-testid="finding-records-checked" /></div>
                <div className="space-y-2"><Label>People interviewed</Label>
                  <Input value={findingFormData.people_interviewed} onChange={e => setFindingFormData({ ...findingFormData, people_interviewed: e.target.value })} placeholder="Names and roles" data-testid="finding-people" /></div>
                <div className="space-y-2"><Label>Areas inspected</Label>
                  <Input value={findingFormData.area_inspected} onChange={e => setFindingFormData({ ...findingFormData, area_inspected: e.target.value })} placeholder="e.g. Laser bay, dispatch, chemical store" /></div>
                <div className="space-y-2"><Label>Documents reviewed</Label>
                  <Input value={findingFormData.documents_reviewed} onChange={e => setFindingFormData({ ...findingFormData, documents_reviewed: e.target.value })} placeholder="Document numbers / revisions" /></div>
                <div className="space-y-2"><Label>Evidence adequate?</Label>
                  <select className="w-full p-2 border rounded-md" value={findingFormData.evidence_adequate === true ? 'yes' : findingFormData.evidence_adequate === false ? 'no' : ''}
                    onChange={e => setFindingFormData({ ...findingFormData, evidence_adequate: e.target.value === 'yes' ? true : e.target.value === 'no' ? false : null })} data-testid="finding-evidence-adequate">
                    <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                  </select></div>
                <div className="space-y-2"><Label>Repeat issue?</Label>
                  <select className="w-full p-2 border rounded-md" value={findingFormData.repeat_issue === true ? 'yes' : findingFormData.repeat_issue === false ? 'no' : ''}
                    onChange={e => setFindingFormData({ ...findingFormData, repeat_issue: e.target.value === 'yes' ? true : e.target.value === 'no' ? false : null })}>
                    <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                  </select></div>
              </div>
            </div>
          )}

          {dialogTab === 'ca' && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Corrective action required?</Label>
                  <select className="w-full p-2 border rounded-md" value={findingFormData.corrective_action_required === true ? 'yes' : findingFormData.corrective_action_required === false ? 'no' : ''}
                    onChange={e => setFindingFormData({ ...findingFormData, corrective_action_required: e.target.value === 'yes' ? true : e.target.value === 'no' ? false : null })} data-testid="finding-ca-required">
                    <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                  </select></div>
                <div className="space-y-2"><Label>Responsible person</Label>
                  <Input value={findingFormData.responsible_person} onChange={e => setFindingFormData({ ...findingFormData, responsible_person: e.target.value })} data-testid="finding-responsible" /></div>
                <div className="space-y-2"><Label>Immediate correction</Label>
                  <Input value={findingFormData.correction} onChange={e => setFindingFormData({ ...findingFormData, correction: e.target.value })} placeholder="What was fixed immediately" /></div>
                <div className="space-y-2"><Label>Corrective action</Label>
                  <Input value={findingFormData.corrective_action} onChange={e => setFindingFormData({ ...findingFormData, corrective_action: e.target.value })} placeholder="Action to prevent recurrence" /></div>
                <div className="space-y-2"><Label>Due date</Label>
                  <Input type="date" value={findingFormData.due_date} onChange={e => setFindingFormData({ ...findingFormData, due_date: e.target.value })} data-testid="finding-due-date" /></div>
                <div className="space-y-2"><Label>Completion date</Label>
                  <Input type="date" value={findingFormData.completion_date} onChange={e => setFindingFormData({ ...findingFormData, completion_date: e.target.value })} /></div>
                <div className="space-y-2 md:col-span-2"><Label>Completion evidence</Label>
                  <Input value={findingFormData.completion_evidence} onChange={e => setFindingFormData({ ...findingFormData, completion_evidence: e.target.value })} /></div>
                <div className="space-y-2"><Label>Effectiveness verified by</Label>
                  <Input value={findingFormData.effectiveness_verified_by} onChange={e => setFindingFormData({ ...findingFormData, effectiveness_verified_by: e.target.value })} /></div>
                <div className="space-y-2"><Label>Effectiveness verification date</Label>
                  <Input type="date" value={findingFormData.effectiveness_verification_date} onChange={e => setFindingFormData({ ...findingFormData, effectiveness_verification_date: e.target.value })} /></div>
              </div>
            </div>
          )}

          {dialogTab === 'samples' && (
            <div className="space-y-4 py-4">
              <p className="text-xs text-slate-500">Record actual samples checked (jobs, POs, extinguishers, electrical items…). Samples appear in the printed report evidence.</p>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end bg-slate-50 border rounded p-3">
                <div><Label className="text-xs">Type</Label>
                  <select className="w-full p-2 border rounded-md text-sm h-9" value={newSample.sample_type} onChange={e => setNewSample(s => ({ ...s, sample_type: e.target.value }))} data-testid="sample-type-select">
                    {SAMPLE_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select></div>
                <div><Label className="text-xs">Sample ID / #</Label><Input className="h-9" value={newSample.sample_id} onChange={e => setNewSample(s => ({ ...s, sample_id: e.target.value }))} data-testid="sample-id-input" /></div>
                <div><Label className="text-xs">Name</Label><Input className="h-9" value={newSample.name} onChange={e => setNewSample(s => ({ ...s, name: e.target.value }))} /></div>
                <div><Label className="text-xs">Location</Label><Input className="h-9" value={newSample.location} onChange={e => setNewSample(s => ({ ...s, location: e.target.value }))} /></div>
                <div><Label className="text-xs">Result</Label>
                  <select className="w-full p-2 border rounded-md text-sm h-9" value={newSample.result} onChange={e => setNewSample(s => ({ ...s, result: e.target.value }))}>
                    <option value="">—</option><option>OK</option><option>Issue found</option><option>N/A</option>
                  </select></div>
                <Button size="sm" onClick={addSample} data-testid="sample-add-btn">Add Sample</Button>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50"><tr>{['Type', 'ID', 'Name', 'Location', 'Result', 'Notes', ''].map(h => <th key={h} className="text-left p-2 border">{h}</th>)}</tr></thead>
                <tbody>
                  {dialogSamples.map(s => (
                    <tr key={s.id}>
                      <td className="p-2 border text-xs">{s.sample_type}</td><td className="p-2 border font-mono text-xs">{s.sample_id}</td>
                      <td className="p-2 border text-xs">{s.name}</td><td className="p-2 border text-xs">{s.location}</td>
                      <td className={`p-2 border text-xs font-semibold ${s.result === 'Issue found' ? 'text-red-600' : 'text-green-700'}`}>{s.result}</td>
                      <td className="p-2 border text-xs">{s.notes}</td>
                      <td className="p-2 border"><button className="text-red-600 text-xs" onClick={() => deleteSample(s.id)}>✕</button></td>
                    </tr>
                  ))}
                  {dialogSamples.length === 0 && <tr><td colSpan={7} className="text-center text-gray-400 py-4 text-sm">No samples recorded for this section yet.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {dialogTab === 'finding' && (
          <div className="space-y-6 py-4">
            {/* Status / Risk / Finding Type */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Section Status</Label>
                <select className="w-full p-2 border rounded-md" value={findingFormData.status}
                  onChange={(e) => setFindingFormData({ ...findingFormData, status: e.target.value })} data-testid="finding-status-select">
                  <option value="">—</option>
                  {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Risk Rating</Label>
                <select className="w-full p-2 border rounded-md" value={findingFormData.risk_rating}
                  onChange={(e) => setFindingFormData({ ...findingFormData, risk_rating: e.target.value })} data-testid="finding-risk-select">
                  <option value="">—</option>
                  <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
                </select>
              </div>
            {/* Finding Type & References */}
              <div className="space-y-2">
                <Label htmlFor="finding-type">Finding Type</Label>
                <select
                  id="finding-type"
                  className="w-full p-2 border rounded-md"
                  value={findingFormData.finding_type}
                  onChange={(e) => setFindingFormData({...findingFormData, finding_type: e.target.value})}
                >
                  <option value="Conformity">Conformity</option>
                  <option value="OFI">OFI (Opportunity for Improvement)</option>
                  <option value="Minor NCR">Minor NCR</option>
                  <option value="Major NCR">Major NCR</option>
                </select>
              </div>

              {findingFormData.finding_type === 'OFI' && (
                <div className="space-y-2">
                  <Label htmlFor="ofi-ref">OFI Reference</Label>
                  <Input
                    id="ofi-ref"
                    placeholder="e.g., OFI 1"
                    value={findingFormData.ofi_reference}
                    onChange={(e) => setFindingFormData({...findingFormData, ofi_reference: e.target.value})}
                  />
                </div>
              )}

              {(findingFormData.finding_type === 'Minor NCR' || findingFormData.finding_type === 'Major NCR') && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="ncr-number">NCR Number</Label>
                    <Input
                      id="ncr-number"
                      placeholder="NCR Number"
                      value={findingFormData.ncr_number}
                      onChange={(e) => setFindingFormData({...findingFormData, ncr_number: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ncr-date">NCR Date</Label>
                    <Input
                      id="ncr-date"
                      type="date"
                      value={findingFormData.ncr_date}
                      onChange={(e) => setFindingFormData({...findingFormData, ncr_date: e.target.value})}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Evidence (no label, just input field) */}
            <div className="space-y-2">
              <Label htmlFor="evidence">Evidence (use toolbar for Bold and Bullet points)</Label>
              <RichTextEditor
                value={findingFormData.evidence}
                onChange={(content) => setFindingFormData({...findingFormData, evidence: content})}
                placeholder="Describe the evidence reviewed during the audit..."
                minHeight="150px"
              />
            </div>

            {/* Summary (renamed from Findings) */}
            <div className="space-y-2">
              <Label htmlFor="findings">Summary (use toolbar for Bold and Bullet points)</Label>
              <RichTextEditor
                value={findingFormData.findings}
                onChange={(content) => setFindingFormData({...findingFormData, findings: content})}
                placeholder="Describe the audit summary and observations..."
                minHeight="150px"
              />
            </div>

            {/* NCR Additional Fields */}
            {(findingFormData.finding_type === 'Minor NCR' || findingFormData.finding_type === 'Major NCR') && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="ncr-customer">Customer/Supplier</Label>
                  <Input
                    id="ncr-customer"
                    placeholder="Customer or Supplier affected"
                    value={findingFormData.ncr_customer_supplier}
                    onChange={(e) => setFindingFormData({...findingFormData, ncr_customer_supplier: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="root-cause">Root Cause Analysis (use toolbar for Bold and Bullet points)</Label>
                  <RichTextEditor
                    value={findingFormData.ncr_root_cause}
                    onChange={(content) => setFindingFormData({...findingFormData, ncr_root_cause: content})}
                    placeholder="Root cause analysis and investigation..."
                    minHeight="100px"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="action-taken">Corrective Action Taken (use toolbar for Bold and Bullet points)</Label>
                  <RichTextEditor
                    value={findingFormData.ncr_action_taken}
                    onChange={(content) => setFindingFormData({...findingFormData, ncr_action_taken: content})}
                    placeholder="Actions taken to address the non-conformity..."
                    minHeight="100px"
                  />
                </div>
              </>
            )}

            {/* Follow-up Required */}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="follow-up"
                checked={findingFormData.is_follow_up_required}
                onChange={(e) => setFindingFormData({...findingFormData, is_follow_up_required: e.target.checked})}
                className="w-4 h-4"
              />
              <Label htmlFor="follow-up">Follow-up required</Label>
            </div>
          </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFindingDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveFinding}>
              <Save className="w-4 h-4 mr-2" />
              Save Finding
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit Trail / History Dialog */}
      <Dialog open={showTrail} onOpenChange={setShowTrail}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Audit Trail — {audit?.report_number}</DialogTitle>
            <DialogDescription>Every material change is recorded: user, time, action, old and new values.</DialogDescription>
          </DialogHeader>
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr>{['When', 'User', 'Action', 'Detail', 'Old → New', 'Reason'].map(h => <th key={h} className="text-left p-2 border">{h}</th>)}</tr></thead>
            <tbody>
              {trail.map(t => (
                <tr key={t.id}>
                  <td className="p-2 border text-xs whitespace-nowrap">{(t.timestamp || '').slice(0, 16).replace('T', ' ')}</td>
                  <td className="p-2 border text-xs">{t.user}</td>
                  <td className="p-2 border text-xs font-semibold">{t.action}</td>
                  <td className="p-2 border text-xs">{t.summary || t.entity_type}</td>
                  <td className="p-2 border text-xs max-w-[220px] truncate" title={`${t.old_value || ''} → ${t.new_value || ''}`}>{t.old_value ? `${String(t.old_value).slice(0, 40)} → ` : ''}{String(t.new_value || '').slice(0, 60)}</td>
                  <td className="p-2 border text-xs">{t.reason || ''}</td>
                </tr>
              ))}
              {trail.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-4">No trail entries yet.</td></tr>}
            </tbody>
          </table>
        </DialogContent>
      </Dialog>

      {/* Reopen Dialog */}
      <Dialog open={showReopen} onOpenChange={setShowReopen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Reopen Locked Audit</DialogTitle>
            <DialogDescription>Reopening requires a reason and the name of the person authorising it. Both are recorded in the audit trail.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Reason for reopening *</Label>
              <Input value={reopenForm.reason} onChange={e => setReopenForm(f => ({ ...f, reason: e.target.value }))} data-testid="reopen-reason-input" /></div>
            <div><Label>Authorised by *</Label>
              <Input value={reopenForm.authorised_by} onChange={e => setReopenForm(f => ({ ...f, authorised_by: e.target.value }))} data-testid="reopen-authorised-input" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReopen(false)}>Cancel</Button>
            <Button onClick={reopenAudit} data-testid="reopen-confirm-btn">Reopen Audit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AuditReportDetail;