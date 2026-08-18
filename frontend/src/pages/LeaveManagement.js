import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { Calendar, Plus, Check, X, Search, Filter, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const LeaveManagement = () => {
  const { currentUser } = useAuth();
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  const [formData, setFormData] = useState({
    employee_id: '',
    leave_type: 'Annual',
    start_date: '',
    end_date: '',
    total_days: 0,
    reason: ''
  });

  const [approvalData, setApprovalData] = useState({
    status: 'Approved',
    approval_notes: ''
  });

  const leaveTypes = ['Annual', 'Sick', 'Unpaid', 'RDO'];

  useEffect(() => {
    fetchLeaveRequests();
    fetchEmployees();
  }, []);

  const fetchLeaveRequests = async () => {
    try {
      setLoading(true);
      const response = await api.get('/employees/leave-requests');
      setLeaveRequests(response.data);
    } catch (error) {
      console.error('Error fetching leave requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const response = await api.get('/employees');
      const activeEmployees = response.data.filter(emp => emp.status === 'Active');
      setEmployees(activeEmployees);
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const calculateDays = () => {
    if (!formData.start_date || !formData.end_date) return;
    
    const start = new Date(formData.start_date);
    const end = new Date(formData.end_date);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both days
    
    setFormData(prev => ({ ...prev, total_days: diffDays }));
  };

  useEffect(() => {
    calculateDays();
  }, [formData.start_date, formData.end_date]);

  const handleCreateRequest = async () => {
    if (!formData.employee_id || !formData.start_date || !formData.end_date) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      await api.post('/employees/leave-requests', formData);
      setCreateDialogOpen(false);
      resetForm();
      fetchLeaveRequests();
      alert('Leave request created successfully');
    } catch (error) {
      console.error('Error creating leave request:', error);
      alert('Failed to create leave request: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleOpenApproval = (request) => {
    setSelectedRequest(request);
    setApprovalData({
      status: 'Approved',
      approved_by: currentUser?.username || currentUser?.email || 'Admin',
      approval_notes: ''
    });
    setApprovalDialogOpen(true);
  };

  const handleApproveReject = async () => {
    if (!selectedRequest) return;

    try {
      await api.put(`/employees/leave-requests/${selectedRequest.id}`, {
        ...approvalData,
        approved_by: currentUser?.username || currentUser?.email || 'Admin'
      });
      
      setApprovalDialogOpen(false);
      setSelectedRequest(null);
      fetchLeaveRequests();
      alert(`Leave request ${approvalData.status.toLowerCase()} successfully`);
    } catch (error) {
      console.error('Error updating leave request:', error);
      alert('Failed to update leave request: ' + (error.response?.data?.detail || error.message));
    }
  };

  const resetForm = () => {
    setFormData({
      employee_id: '',
      leave_type: 'Annual',
      start_date: '',
      end_date: '',
      total_days: 0,
      reason: ''
    });
  };

  const getStatusColor = (status) => {
    const colors = {
      'Pending': 'bg-yellow-100 text-yellow-800 border-yellow-300',
      'Approved': 'bg-green-100 text-green-800 border-green-300',
      'Rejected': 'bg-red-100 text-red-800 border-red-300',
    };
    return colors[status] || 'bg-gray-100 text-gray-800 border-gray-300';
  };

  const getLeaveTypeColor = (type) => {
    const colors = {
      'Annual': 'bg-blue-100 text-blue-800',
      'Sick': 'bg-orange-100 text-orange-800',
      'Unpaid': 'bg-slate-100 text-slate-800',
      'RDO': 'bg-purple-100 text-purple-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-AU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const filteredRequests = leaveRequests.filter(req => {
    const matchesSearch = req.employee_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || req.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingCount = leaveRequests.filter(r => r.status === 'Pending').length;
  const approvedCount = leaveRequests.filter(r => r.status === 'Approved').length;

  const canApprove = currentUser?.role === 'Administrator' || currentUser?.role === 'Manager';

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-8 h-8 text-blue-600" />
            Leave Management
          </h1>
          <p className="text-slate-600 mt-1">Manage employee leave requests and approvals</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Leave Request
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Pending Requests</p>
                <h3 className="text-3xl font-bold text-yellow-600 mt-1">{pendingCount}</h3>
              </div>
              <div className="bg-yellow-500 p-3 rounded-lg">
                <Clock className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Approved This Month</p>
                <h3 className="text-3xl font-bold text-green-600 mt-1">{approvedCount}</h3>
              </div>
              <div className="bg-green-500 p-3 rounded-lg">
                <Check className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Total Requests</p>
                <h3 className="text-3xl font-bold text-slate-900 mt-1">{leaveRequests.length}</h3>
              </div>
              <div className="bg-slate-500 p-3 rounded-lg">
                <Calendar className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search by employee name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <select
                className="w-full border rounded-md p-2 pl-10"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Leave Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle>Leave Requests ({filteredRequests.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Leave Type</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRequests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>
                    <div className="font-medium">{request.employee_name}</div>
                  </TableCell>
                  <TableCell>
                    <Badge className={getLeaveTypeColor(request.leave_type)}>
                      {request.leave_type}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(request.start_date)}</TableCell>
                  <TableCell>{formatDate(request.end_date)}</TableCell>
                  <TableCell className="font-semibold">{request.total_days}</TableCell>
                  <TableCell className="max-w-xs truncate">
                    {request.reason || 'N/A'}
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(request.status)}`}>
                      {request.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    {request.status === 'Pending' && canApprove && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenApproval(request)}
                      >
                        Review
                      </Button>
                    )}
                    {request.status === 'Approved' && request.approved_by && (
                      <span className="text-xs text-slate-500">
                        By: {request.approved_by}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredRequests.length === 0 && (
            <div className="text-center py-12">
              <Calendar className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 text-lg">No leave requests found</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Leave Request Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Leave Request</DialogTitle>
            <DialogDescription>Create a leave request for an employee</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Employee *</Label>
              <select
                className="w-full border rounded-md p-2"
                value={formData.employee_id}
                onChange={(e) => setFormData({...formData, employee_id: e.target.value})}
              >
                <option value="">Select Employee</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.employee_number} - {emp.first_name} {emp.last_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Leave Type *</Label>
              <select
                className="w-full border rounded-md p-2"
                value={formData.leave_type}
                onChange={(e) => setFormData({...formData, leave_type: e.target.value})}
              >
                {leaveTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date *</Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                />
              </div>
              <div>
                <Label>End Date *</Label>
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({...formData, end_date: e.target.value})}
                />
              </div>
            </div>

            <div>
              <Label>Total Days</Label>
              <Input
                type="number"
                value={formData.total_days}
                readOnly
                className="bg-slate-50"
              />
            </div>

            <div>
              <Label>Reason</Label>
              <Textarea
                value={formData.reason}
                onChange={(e) => setFormData({...formData, reason: e.target.value})}
                rows={3}
                placeholder="Optional reason for leave..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setCreateDialogOpen(false);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button onClick={handleCreateRequest}>
              <Plus className="w-4 h-4 mr-2" />
              Create Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approval Dialog */}
      <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Leave Request</DialogTitle>
            <DialogDescription>Approve or reject this leave request</DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-lg space-y-2">
                <p><strong>Employee:</strong> {selectedRequest.employee_name}</p>
                <p><strong>Leave Type:</strong> {selectedRequest.leave_type}</p>
                <p><strong>Period:</strong> {formatDate(selectedRequest.start_date)} to {formatDate(selectedRequest.end_date)}</p>
                <p><strong>Days:</strong> {selectedRequest.total_days}</p>
                <p><strong>Reason:</strong> {selectedRequest.reason || 'N/A'}</p>
              </div>

              <div>
                <Label>Decision *</Label>
                <select
                  className="w-full border rounded-md p-2"
                  value={approvalData.status}
                  onChange={(e) => setApprovalData({...approvalData, status: e.target.value})}
                >
                  <option value="Approved">Approve</option>
                  <option value="Rejected">Reject</option>
                </select>
              </div>

              <div>
                <Label>Notes (Optional)</Label>
                <Textarea
                  value={approvalData.approval_notes}
                  onChange={(e) => setApprovalData({...approvalData, approval_notes: e.target.value})}
                  rows={3}
                  placeholder="Add notes about this decision..."
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setApprovalDialogOpen(false);
              setSelectedRequest(null);
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleApproveReject}
              className={approvalData.status === 'Approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              {approvalData.status === 'Approved' ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Approve
                </>
              ) : (
                <>
                  <X className="w-4 h-4 mr-2" />
                  Reject
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeaveManagement;
