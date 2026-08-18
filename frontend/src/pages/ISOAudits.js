import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { 
  ShieldCheck, Plus, Eye, Edit, Trash2, FileText, 
  CheckCircle, AlertTriangle, XCircle, Download 
} from 'lucide-react';
import api from '../services/api';
import { formatDate } from '../utils/dateFormatter';

const ISOAudits = () => {
  const navigate = useNavigate();
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedAudit, setSelectedAudit] = useState(null);
  const [formData, setFormData] = useState({
    report_number: '',
    auditor_name: '',
    client_name: '',
    assessed_sites: '',
    standards_audited: ['ISO 9001:2015', 'ISO 14001:2015', 'ISO 45001:2018'],
    scope_of_audit: '',
    exclusions: '',
    audit_start_date: '',
    audit_end_date: ''
  });

  useEffect(() => {
    fetchAudits();
  }, []);

  const fetchAudits = async () => {
    try {
      setLoading(true);
      const response = await api.get('/audits');
      setAudits(response.data);
    } catch (error) {
      console.error('Error fetching audits:', error);
      alert('Failed to fetch audits: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAudit = async () => {
    if (!formData.report_number || !formData.auditor_name || !formData.client_name) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const auditData = {
        ...formData,
        audit_start_date: formData.audit_start_date ? new Date(formData.audit_start_date).toISOString() : null,
        audit_end_date: formData.audit_end_date ? new Date(formData.audit_end_date).toISOString() : null
      };

      await api.post('/audits', auditData);
      setShowCreateDialog(false);
      resetForm();
      fetchAudits();
      alert('Audit report created successfully with default ISO clauses!');
    } catch (error) {
      console.error('Error creating audit:', error);
      alert('Failed to create audit: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleDeleteAudit = async (auditId, reportNumber) => {
    if (!window.confirm(`Are you sure you want to delete audit report ${reportNumber}? This will also delete all findings and follow-up items.`)) {
      return;
    }

    try {
      await api.delete(`/audits/${auditId}`);
      fetchAudits();
      alert('Audit report deleted successfully');
    } catch (error) {
      console.error('Error deleting audit:', error);
      alert('Failed to delete audit: ' + (error.response?.data?.detail || error.message));
    }
  };

  const resetForm = () => {
    setFormData({
      report_number: '',
      auditor_name: '',
      client_name: '',
      assessed_sites: '',
      standards_audited: ['ISO 9001:2015', 'ISO 14001:2015', 'ISO 45001:2018'],
      scope_of_audit: '',
      exclusions: '',
      audit_start_date: '',
      audit_end_date: ''
    });
  };

  const getAuditStatusBadge = (audit) => {
    // Simple status logic based on whether audit has conclusion
    if (audit.conclusion && audit.overall_recommendation) {
      return <Badge className="bg-green-100 text-green-800 border-green-300"><CheckCircle className="w-3 h-3 mr-1" />Complete</Badge>;
    } else if (audit.audit_end_date) {
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300"><AlertTriangle className="w-3 h-3 mr-1" />In Review</Badge>;
    } else {
      return <Badge className="bg-blue-100 text-blue-800 border-blue-300"><FileText className="w-3 h-3 mr-1" />In Progress</Badge>;
    }
  };

  if (loading) {
    return <div className="p-8">Loading audit reports...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-blue-600" />
              ISO Audit Reports - IMS (Quality / Environmental / OHS)
            </span>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create New Audit
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {audits.length === 0 ? (
            <div className="text-center py-12">
              <ShieldCheck className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 text-lg mb-4">No audit reports found</p>
              <p className="text-sm text-slate-400 mb-4">Create your first ISO audit report to get started with compliance management</p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Audit
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {audits.map((audit) => (
                <Card key={audit.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Link to={`/quality/audits/${audit.id}`} className="text-lg font-semibold text-slate-900 hover:text-blue-700 hover:underline" data-testid={`audit-open-${audit.id}`}>{audit.report_number}</Link>
                          {getAuditStatusBadge(audit)}
                          {audit.locked && <span className="text-[10px] font-bold bg-gray-200 text-gray-600 border border-gray-400 px-1.5 py-0.5 rounded">🔒 LOCKED</span>}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-600">
                          <div>
                            <div><strong>Client:</strong> {audit.client_name}</div>
                            <div><strong>Auditor:</strong> {audit.auditor_name}</div>
                            <div><strong>Report Date:</strong> {formatDate(audit.report_date)}</div>
                          </div>
                          <div>
                            <div><strong>Assessed Sites:</strong> {audit.assessed_sites}</div>
                            <div><strong>Standards:</strong> {audit.standards_audited.join(', ')}</div>
                            <div><strong>Created by:</strong> {audit.created_by}</div>
                          </div>
                        </div>
                        <div className="mt-3">
                          <div className="text-sm"><strong>Scope:</strong> {audit.scope_of_audit}</div>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/quality/audits/${audit.id}`)}
                          className="text-blue-600 hover:text-blue-700"
                          data-testid={`audit-view-${audit.id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(`/quality/audits/${audit.id}/print`, '_blank')}
                          className="text-green-600 hover:text-green-700"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteAudit(audit.id, audit.report_number)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Audit Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New ISO Audit Report</DialogTitle>
            <DialogDescription>
              Create a new Internal Audit Report for ISO 9001:2015, ISO 14001:2015, and ISO 45001:2018 standards
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="report-number">Report Number *</Label>
                <Input
                  id="report-number"
                  placeholder="e.g., AR-2025-001"
                  value={formData.report_number}
                  onChange={(e) => setFormData({...formData, report_number: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="auditor-name">Auditor Name *</Label>
                <Input
                  id="auditor-name"
                  placeholder="Lead Auditor Name"
                  value={formData.auditor_name}
                  onChange={(e) => setFormData({...formData, auditor_name: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-name">Client Name *</Label>
              <Input
                id="client-name"
                placeholder="Organization/Company Name"
                value={formData.client_name}
                onChange={(e) => setFormData({...formData, client_name: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="assessed-sites">Assessed Sites</Label>
              <Input
                id="assessed-sites"
                placeholder="Sites/Locations assessed"
                value={formData.assessed_sites}
                onChange={(e) => setFormData({...formData, assessed_sites: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="scope">Scope of Audit</Label>
              <Input
                id="scope"
                placeholder="Manufacturing, Quality Management, Environmental Management..."
                value={formData.scope_of_audit}
                onChange={(e) => setFormData({...formData, scope_of_audit: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="exclusions">Exclusions (if any)</Label>
              <Input
                id="exclusions"
                placeholder="Any excluded processes or requirements"
                value={formData.exclusions}
                onChange={(e) => setFormData({...formData, exclusions: e.target.value})}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-date">Audit Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={formData.audit_start_date}
                  onChange={(e) => setFormData({...formData, audit_start_date: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date">Audit End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={formData.audit_end_date}
                  onChange={(e) => setFormData({...formData, audit_end_date: e.target.value})}
                />
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> This will create an audit report with all default ISO clauses (1.0-4.0) 
                covering Quality, Environmental, and OHS management systems. You can then add evidence and 
                findings for each clause.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleCreateAudit}>
              Create Audit Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ISOAudits;