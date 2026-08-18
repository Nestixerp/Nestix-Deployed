import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { Plus, Search, FileText, Edit, Trash2, CheckCircle, Printer, AlertCircle, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { formatDate } from '../utils/dateFormatter';
import {
  getControlledDocumentByModule,
  buildDocControlFooter,
  buildPrintFooterCss,
  buildPrintBodyOpen,
  buildPrintBodyClose,
} from '../utils/documentControl';
import { useNavigate } from 'react-router-dom';

const MODULE_NAME = 'JSA Register';

const JSARegister = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [jsas, setJSAs] = useState([]);
  const [filteredJSAs, setFilteredJSAs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedJSA, setSelectedJSA] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [docInfo, setDocInfo] = useState(null);
  
  useEffect(() => {
    fetchJSAs();
    getControlledDocumentByModule(MODULE_NAME, { fallback: 'JSA', docType: 'Register' }).then(setDocInfo);
  }, []);
  
  useEffect(() => {
    // Filter JSAs based on search and status
    let filtered = jsas;
    
    if (searchTerm) {
      filtered = filtered.filter(jsa =>
        jsa.jsa_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        jsa.machine_process.toLowerCase().includes(searchTerm.toLowerCase()) ||
        jsa.works_location.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (statusFilter) {
      filtered = filtered.filter(jsa => jsa.approval_status === statusFilter);
    }
    
    setFilteredJSAs(filtered);
  }, [jsas, searchTerm, statusFilter]);
  
  const fetchJSAs = async () => {
    try {
      const response = await api.get('/jsas');
      setJSAs(response.data);
      setFilteredJSAs(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching JSAs:', error);
      setLoading(false);
    }
  };
  
  const handleCreateNew = () => {
    navigate('/jsa/new');
  };
  
  const handleViewJSA = (jsa) => {
    navigate(`/jsa/${jsa.id}`);
  };
  
  const handleEditJSA = (jsa) => {
    navigate(`/jsa/${jsa.id}/edit`);
  };
  
  const handleMarkReviewed = (jsa) => {
    setSelectedJSA(jsa);
    setReviewDialogOpen(true);
  };
  
  const handleSubmitReview = async () => {
    try {
      await api.post(`/jsas/${selectedJSA.id}/review`, {
        notes: reviewNotes
      });
      
      alert(`JSA ${selectedJSA.jsa_number} marked as reviewed successfully!`);
      setReviewDialogOpen(false);
      setReviewNotes('');
      fetchJSAs();
    } catch (error) {
      console.error('Error marking JSA as reviewed:', error);
      alert('Failed to mark JSA as reviewed: ' + (error.response?.data?.detail || error.message));
    }
  };
  
  const handlePrintRegister = async () => {
    const doc = await getControlledDocumentByModule(MODULE_NAME, { fallback: 'JSA', docType: 'Register' });
    const footer = buildDocControlFooter(doc, {
      title: 'JSA Register / Index',
    });

    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);

    const rows = filteredJSAs.map(jsa => {
      const needsReview = needsReviewCheck(jsa);
      const isApproved = (jsa.approval_status || '').toLowerCase() === 'approved';
      const approvedBy = isApproved
        ? (jsa.approved_by_name || jsa.approved_by || 'Approved')
        : esc(jsa.approval_status || '—');
      return `
        <tr class="${needsReview ? 'needs-review' : ''}">
          <td>${esc(jsa.jsa_number)}</td>
          <td>${esc(jsa.machine_process)}</td>
          <td>${esc(formatDate(jsa.date_created))}</td>
          <td>${esc(jsa.last_reviewed_date ? formatDate(jsa.last_reviewed_date) : '-')}</td>
          <td>${esc(jsa.next_review_date ? formatDate(jsa.next_review_date) : '-')}</td>
          <td class="${isApproved ? 'status-approved' : 'status-draft'}">${esc(approvedBy)}</td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<title>JSA Register</title>
<style>
  ${buildPrintFooterCss()}
  @page { size: A4 landscape; }
  body { color: #111; }
  h1 { text-align: center; margin: 0 0 2mm 0; font-size: 16pt; }
  h2 { text-align: center; margin: 0 0 5mm 0; font-size: 12pt; color: #555; font-weight: normal; }
  table.reg { width: 100%; border-collapse: collapse; margin-top: 3mm; font-size: 9.5pt; }
  table.reg th, table.reg td { border: 1px solid #333; padding: 5px 6px; text-align: left; }
  table.reg th { background: #f3f4f6; font-weight: bold; }
  .status-approved { color: #15803d; font-weight: bold; }
  .status-draft { color: #c2410c; font-weight: bold; }
  .needs-review { background: #fff3cd; }
  .meta { font-size: 9pt; color: #555; margin-top: 4mm; display: flex; justify-content: space-between; }
</style></head>
<body>
${buildPrintBodyOpen(footer)}
  <h1>ULTIMATE LASER PTY LTD</h1>
  <h2>JSA (Job Safety Analysis) Register / Index</h2>
  <table class="reg">
    <thead>
      <tr>
        <th style="width: 10%;">JSA #</th>
        <th style="width: 35%;">Machine / Process</th>
        <th style="width: 13%;">Date Created</th>
        <th style="width: 13%;">Last Reviewed</th>
        <th style="width: 14%;">Next Review</th>
        <th style="width: 15%;">Approved By</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="meta">
    <span>Generated: ${esc(formatDate(new Date().toISOString()))}</span>
    <span>Total JSAs: ${filteredJSAs.length}</span>
  </div>
${buildPrintBodyClose()}
</body></html>`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
      try { printWindow.focus(); printWindow.print(); } catch (_) { /* blocked */ }
    }, 300);
  };
  
  const needsReviewCheck = (jsa) => {
    if (!jsa.last_reviewed_date) return true;
    
    const lastReview = new Date(jsa.last_reviewed_date);
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    
    return lastReview < twelveMonthsAgo;
  };
  
  const canManageJSAs = currentUser?.role === 'Administrator' || currentUser?.role === 'Quality Manager';
  
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-2xl">JSA Register</CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                Job Safety Analysis Index{' '}
                <span className="ml-2 inline-block text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-mono" data-testid="jsa-register-form-no">
                  {docInfo?.form_no || '—'}
                </span>
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handlePrintRegister} variant="outline">
                <Printer className="w-4 h-4 mr-2" />
                Print Register
              </Button>
              {canManageJSAs && (
                <Button onClick={handleCreateNew}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create New JSA
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {/* Filters */}
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search by JSA #, Machine, or Location..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border rounded-md"
            >
              <option value="">All Status</option>
              <option value="Draft">Draft</option>
              <option value="Approved">Approved</option>
            </select>
          </div>
          
          {/* Table */}
          {loading ? (
            <div className="text-center py-8">Loading JSAs...</div>
          ) : filteredJSAs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No JSAs found. {canManageJSAs && 'Click "Create New JSA" to get started.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>JSA #</TableHead>
                    <TableHead>Machine / Process</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Date Created</TableHead>
                    <TableHead>Last Reviewed</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Approved By</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJSAs.map((jsa) => {
                    const needsReview = needsReviewCheck(jsa);
                    
                    return (
                      <TableRow key={jsa.id} className={needsReview ? 'bg-yellow-50' : ''}>
                        <TableCell className="font-medium">{jsa.jsa_number}</TableCell>
                        <TableCell>{jsa.machine_process}</TableCell>
                        <TableCell>{jsa.works_location}</TableCell>
                        <TableCell>{formatDate(jsa.date_created)}</TableCell>
                        <TableCell>
                          {jsa.last_reviewed_date ? (
                            <span className={needsReview ? 'text-orange-600 font-semibold' : 'text-green-600'}>
                              {formatDate(jsa.last_reviewed_date)}
                              {needsReview && (
                                <AlertCircle className="inline-block w-4 h-4 ml-1" />
                              )}
                            </span>
                          ) : (
                            <span className="text-red-600 font-semibold">Not Reviewed</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={jsa.approval_status === 'Approved' ? 'default' : 'secondary'}>
                            {jsa.approval_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {jsa.approval_status === 'Approved'
                            ? <span className="text-green-700 font-medium">{jsa.approved_by_name || jsa.approved_by || '—'}</span>
                            : <span className="text-gray-400">—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleViewJSA(jsa)}
                              title="View JSA"
                            >
                              <FileText className="w-4 h-4" />
                            </Button>
                            
                            {canManageJSAs && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEditJSA(jsa)}
                                  title="Edit JSA"
                                  className="text-blue-600 hover:text-blue-700"
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleMarkReviewed(jsa)}
                                  title="Mark as Reviewed"
                                  className="text-green-600 hover:text-green-700"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark JSA as Reviewed</DialogTitle>
            <DialogDescription>
              Mark {selectedJSA?.jsa_number} as reviewed. This will set the review date to today and schedule the next review in 12 months.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Review Notes (Optional)</label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Add any notes about this review..."
                className="w-full px-3 py-2 border rounded-md"
                rows="3"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitReview} className="bg-green-600 hover:bg-green-700">
              <CheckCircle className="w-4 h-4 mr-2" />
              Mark as Reviewed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default JSARegister;
