import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Plus, Search, Edit, Trash2, AlertCircle, UserPlus, Clock, Calendar, FileText, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import EmployeeComplianceModal from '../components/EmployeeComplianceModal';

const Employees = () => {
  const { currentUser } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState(null);
  const [editingEmployee, setEditingEmployee] = useState(null);
  // Compliance modal state
  const [complianceEmployee, setComplianceEmployee] = useState(null);
  
  // Available modules and roles
  const [availableModules, setAvailableModules] = useState([]);
  const availableRoles = ['Administrator', 'Manager', 'Employee', 'Read-Only'];
  const departments = ['Production', 'Quality', 'Admin', 'Dispatch', 'Sales'];
  const employmentTypes = ['Full-time', 'Part-time', 'Casual', 'Contractor'];
  
  // Form data
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: '',
    date_of_birth: '',
    role: '',
    department: '',
    employment_type: 'Full-time',
    start_date: '',
    status: 'Active',
    system_access_role: 'Employee',
    allowed_modules: [],
    username: '',
    password: '',
    emergency_contact_name: '',
    emergency_contact_relation: '',
    emergency_contact_phone: '',
    tfn: '',
    super_fund: '',
    bank_account: '',
    qualifications: '',
    annual_leave_balance: 0,
    sick_leave_balance: 0,
    notes: ''
  });

  useEffect(() => {
    fetchEmployees();
    fetchAvailableModules();
  }, []);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const response = await api.get('/employees');
      setEmployees(response.data);
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableModules = async () => {
    try {
      const response = await api.get('/employees/modules');
      setAvailableModules(response.data.modules || []);
    } catch (error) {
      console.error('Error fetching modules:', error);
    }
  };

  const handleCreateEmployee = async () => {
    try {
      const employeeData = {
        ...formData,
        qualifications: formData.qualifications ? formData.qualifications.split(',').map(q => q.trim()) : []
      };
      
      await api.post('/employees', employeeData);
      setCreateDialogOpen(false);
      resetForm();
      fetchEmployees();
      alert('Employee created successfully');
    } catch (error) {
      console.error('Error creating employee:', error);
      alert('Failed to create employee: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleEditEmployee = (employee) => {
    setEditingEmployee(employee);
    setFormData({
      first_name: employee.first_name,
      last_name: employee.last_name,
      email: employee.email,
      phone: employee.phone || '',
      address: employee.address || '',
      date_of_birth: employee.date_of_birth || '',
      role: employee.role,
      department: employee.department,
      employment_type: employee.employment_type,
      start_date: employee.start_date,
      status: employee.status,
      system_access_role: employee.system_access_role,
      allowed_modules: employee.allowed_modules || [],
      username: employee.username || '',
      password: '',
      emergency_contact_name: employee.emergency_contact_name || '',
      emergency_contact_relation: employee.emergency_contact_relation || '',
      emergency_contact_phone: employee.emergency_contact_phone || '',
      tfn: employee.tfn || '',
      super_fund: employee.super_fund || '',
      bank_account: employee.bank_account || '',
      qualifications: employee.qualifications?.join(', ') || '',
      annual_leave_balance: employee.annual_leave_balance || 0,
      sick_leave_balance: employee.sick_leave_balance || 0,
      notes: employee.notes || ''
    });
    setEditDialogOpen(true);
  };

  const handleUpdateEmployee = async () => {
    try {
      const updateData = {
        ...formData,
        qualifications: formData.qualifications ? formData.qualifications.split(',').map(q => q.trim()) : []
      };
      
      // Remove password if empty (don't update it)
      if (!updateData.password) {
        delete updateData.password;
      }
      
      await api.put(`/employees/${editingEmployee.id}`, updateData);
      setEditDialogOpen(false);
      resetForm();
      setEditingEmployee(null);
      fetchEmployees();
      alert('Employee updated successfully');
    } catch (error) {
      console.error('Error updating employee:', error);
      alert('Failed to update employee: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleDeleteEmployee = (employee) => {
    setEmployeeToDelete(employee);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteEmployee = async () => {
    if (!employeeToDelete) return;
    
    try {
      await api.delete(`/employees/${employeeToDelete.id}`);
      setDeleteDialogOpen(false);
      setEmployeeToDelete(null);
      fetchEmployees();
      alert('Employee deleted successfully');
    } catch (error) {
      console.error('Error deleting employee:', error);
      alert('Failed to delete employee: ' + (error.response?.data?.detail || error.message));
    }
  };

  const resetForm = () => {
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      address: '',
      date_of_birth: '',
      role: '',
      department: '',
      employment_type: 'Full-time',
      start_date: '',
      status: 'Active',
      system_access_role: 'Employee',
      allowed_modules: [],
      username: '',
      password: '',
      emergency_contact_name: '',
      emergency_contact_relation: '',
      emergency_contact_phone: '',
      tfn: '',
      super_fund: '',
      bank_account: '',
      qualifications: '',
      annual_leave_balance: 0,
      sick_leave_balance: 0,
      notes: ''
    });
  };

  const handleModuleToggle = (module) => {
    setFormData(prev => ({
      ...prev,
      allowed_modules: prev.allowed_modules.includes(module)
        ? prev.allowed_modules.filter(m => m !== module)
        : [...prev.allowed_modules, module]
    }));
  };

  const filteredEmployees = employees
    .filter(emp => {
      const searchLower = searchTerm.toLowerCase();
      return (
        emp.first_name.toLowerCase().includes(searchLower) ||
        emp.last_name.toLowerCase().includes(searchLower) ||
        emp.employee_number.toLowerCase().includes(searchLower) ||
        emp.email.toLowerCase().includes(searchLower) ||
        emp.role.toLowerCase().includes(searchLower)
      );
    })
    .sort((a, b) => {
      const an = `${a.last_name || ''} ${a.first_name || ''}`.toLowerCase().trim();
      const bn = `${b.last_name || ''} ${b.first_name || ''}`.toLowerCase().trim();
      return an.localeCompare(bn);
    });

  const getStatusColor = (status) => {
    const colors = {
      'Active': 'bg-green-100 text-green-800 border-green-300',
      'Terminated': 'bg-red-100 text-red-800 border-red-300',
      'On Leave': 'bg-yellow-100 text-yellow-800 border-yellow-300',
    };
    return colors[status] || 'bg-gray-100 text-gray-800 border-gray-300';
  };

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
          <h1 className="text-3xl font-bold text-slate-900">Employee Management</h1>
          <p className="text-slate-600 mt-1">Manage employee records, access, and system permissions</p>
        </div>
        {currentUser?.role === 'Administrator' && (
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Employee
          </Button>
        )}
      </div>

      {/* Search */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Search by name, employee #, email, or role..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Employee Table */}
      <Card>
        <CardHeader>
          <CardTitle>Employees ({filteredEmployees.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee #</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Employment Type</TableHead>
                <TableHead>System Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmployees.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell className="font-medium">{emp.employee_number}</TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{emp.first_name} {emp.last_name}</div>
                      <div className="text-sm text-slate-500">{emp.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>{emp.role}</TableCell>
                  <TableCell>{emp.department}</TableCell>
                  <TableCell>{emp.employment_type}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{emp.system_access_role}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(emp.status)}`}>
                      {emp.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setComplianceEmployee(emp)}
                        title="View Compliance Report"
                        className="text-blue-700 hover:bg-blue-50"
                        data-testid={`compliance-btn-${emp.id}`}
                      >
                        <ShieldCheck className="w-3 h-3" />
                      </Button>
                      {currentUser?.role === 'Administrator' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditEmployee(emp)}
                            title="Edit"
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteEmployee(emp)}
                            title="Delete"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredEmployees.length === 0 && (
            <div className="text-center py-12">
              <UserPlus className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 text-lg">No employees found</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Employee Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Employee</DialogTitle>
            <DialogDescription>Enter employee details and system access permissions</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Personal Information */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Personal Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>First Name *</Label>
                  <Input
                    value={formData.first_name}
                    onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Last Name *</Label>
                  <Input
                    value={formData.last_name}
                    onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Date of Birth</Label>
                  <Input
                    type="date"
                    value={formData.date_of_birth}
                    onChange={(e) => setFormData({...formData, date_of_birth: e.target.value})}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Address</Label>
                  <Input
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                  />
                </div>
              </div>
            </div>

            {/* Employment Details */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Employment Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Job Role *</Label>
                  <Input
                    placeholder="e.g., Press Brake Operator"
                    value={formData.role}
                    onChange={(e) => setFormData({...formData, role: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Department *</Label>
                  <select
                    className="w-full border rounded-md p-2"
                    value={formData.department}
                    onChange={(e) => setFormData({...formData, department: e.target.value})}
                  >
                    <option value="">Select Department</option>
                    {departments.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Employment Type *</Label>
                  <select
                    className="w-full border rounded-md p-2"
                    value={formData.employment_type}
                    onChange={(e) => setFormData({...formData, employment_type: e.target.value})}
                  >
                    {employmentTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Start Date *</Label>
                  <Input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                  />
                </div>
              </div>
            </div>

            {/* HR/Payroll Information */}
            <div>
              <h3 className="text-lg font-semibold mb-3">HR & Payroll Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tax File Number (TFN)</Label>
                  <Input
                    value={formData.tfn}
                    onChange={(e) => setFormData({...formData, tfn: e.target.value})}
                    placeholder="e.g., 123 456 789"
                  />
                </div>
                <div>
                  <Label>Superannuation Fund</Label>
                  <Input
                    value={formData.super_fund}
                    onChange={(e) => setFormData({...formData, super_fund: e.target.value})}
                    placeholder="e.g., AustralianSuper"
                  />
                </div>
                <div className="col-span-2">
                  <Label>Bank Account Details</Label>
                  <Input
                    value={formData.bank_account}
                    onChange={(e) => setFormData({...formData, bank_account: e.target.value})}
                    placeholder="BSB-Account Number or details"
                  />
                </div>
                <div>
                  <Label>Qualifications / Certifications</Label>
                  <Input
                    value={formData.qualifications}
                    onChange={(e) => setFormData({...formData, qualifications: e.target.value})}
                    placeholder="Separate with commas (e.g., Forklift Licence, First Aid)"
                  />
                  <p className="text-xs text-slate-500 mt-1">Separate multiple qualifications with commas</p>
                </div>
              </div>
            </div>

            {/* Leave Balances */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Leave Entitlements</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Annual Leave Balance (hours)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.annual_leave_balance}
                    onChange={(e) => setFormData({...formData, annual_leave_balance: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div>
                  <Label>Sick Leave Balance (hours)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.sick_leave_balance}
                    onChange={(e) => setFormData({...formData, sick_leave_balance: parseFloat(e.target.value) || 0})}
                  />
                </div>
              </div>
            </div>

            {/* System Access */}
            <div>
              <h3 className="text-lg font-semibold mb-3">System Access</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label>System Role *</Label>
                  <select
                    className="w-full border rounded-md p-2"
                    value={formData.system_access_role}
                    onChange={(e) => setFormData({...formData, system_access_role: e.target.value})}
                  >
                    {availableRoles.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Username</Label>
                  <Input
                    value={formData.username}
                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Module Access Permissions</Label>
                <div className="grid grid-cols-2 gap-2 border rounded-md p-4 bg-slate-50">
                  {availableModules.map(module => (
                    <label key={module} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.allowed_modules.includes(module)}
                        onChange={() => handleModuleToggle(module)}
                        className="rounded"
                      />
                      <span className="text-sm capitalize">{module.replace('-', ' ').replace('_', ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Emergency Contact */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Emergency Contact</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Contact Name</Label>
                  <Input
                    value={formData.emergency_contact_name}
                    onChange={(e) => setFormData({...formData, emergency_contact_name: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Relation</Label>
                  <Input
                    value={formData.emergency_contact_relation}
                    onChange={(e) => setFormData({...formData, emergency_contact_relation: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={formData.emergency_contact_phone}
                    onChange={(e) => setFormData({...formData, emergency_contact_phone: e.target.value})}
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                rows={3}
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
            <Button onClick={handleCreateEmployee}>
              <UserPlus className="w-4 h-4 mr-2" />
              Create Employee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Employee Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Employee</DialogTitle>
            <DialogDescription>Update employee details and permissions</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Personal Information */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Personal Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>First Name</Label>
                  <Input
                    value={formData.first_name}
                    onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input
                    value={formData.last_name}
                    onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Date of Birth</Label>
                  <Input
                    type="date"
                    value={formData.date_of_birth}
                    onChange={(e) => setFormData({...formData, date_of_birth: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <select
                    className="w-full border rounded-md p-2"
                    value={formData.status}
                    onChange={(e) => setFormData({...formData, status: e.target.value})}
                  >
                    <option value="Active">Active</option>
                    <option value="On Leave">On Leave</option>
                    <option value="Terminated">Terminated</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <Label>Address</Label>
                  <Input
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                  />
                </div>
              </div>
            </div>

            {/* Employment Details */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Employment Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Job Role</Label>
                  <Input
                    value={formData.role}
                    onChange={(e) => setFormData({...formData, role: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Department</Label>
                  <select
                    className="w-full border rounded-md p-2"
                    value={formData.department}
                    onChange={(e) => setFormData({...formData, department: e.target.value})}
                  >
                    <option value="">Select Department</option>
                    {departments.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Employment Type</Label>
                  <select
                    className="w-full border rounded-md p-2"
                    value={formData.employment_type}
                    onChange={(e) => setFormData({...formData, employment_type: e.target.value})}
                  >
                    {employmentTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                  />
                </div>
              </div>
            </div>

            {/* HR/Payroll Information */}
            <div>
              <h3 className="text-lg font-semibold mb-3">HR & Payroll Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tax File Number (TFN)</Label>
                  <Input
                    value={formData.tfn}
                    onChange={(e) => setFormData({...formData, tfn: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Superannuation Fund</Label>
                  <Input
                    value={formData.super_fund}
                    onChange={(e) => setFormData({...formData, super_fund: e.target.value})}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Bank Account Details</Label>
                  <Input
                    value={formData.bank_account}
                    onChange={(e) => setFormData({...formData, bank_account: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Qualifications</Label>
                  <Input
                    value={formData.qualifications}
                    onChange={(e) => setFormData({...formData, qualifications: e.target.value})}
                  />
                </div>
              </div>
            </div>

            {/* Leave Balances */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Leave Entitlements</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Annual Leave Balance (hours)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.annual_leave_balance}
                    onChange={(e) => setFormData({...formData, annual_leave_balance: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div>
                  <Label>Sick Leave Balance (hours)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.sick_leave_balance}
                    onChange={(e) => setFormData({...formData, sick_leave_balance: parseFloat(e.target.value) || 0})}
                  />
                </div>
              </div>
            </div>

            {/* Emergency Contact */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Emergency Contact</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Contact Name</Label>
                  <Input
                    value={formData.emergency_contact_name}
                    onChange={(e) => setFormData({...formData, emergency_contact_name: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Relation</Label>
                  <Input
                    value={formData.emergency_contact_relation}
                    onChange={(e) => setFormData({...formData, emergency_contact_relation: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={formData.emergency_contact_phone}
                    onChange={(e) => setFormData({...formData, emergency_contact_phone: e.target.value})}
                  />
                </div>
              </div>
            </div>

            {/* System Access */}
            <div>
              <h3 className="text-lg font-semibold mb-3">System Access</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label>System Role</Label>
                  <select
                    className="w-full border rounded-md p-2"
                    value={formData.system_access_role}
                    onChange={(e) => setFormData({...formData, system_access_role: e.target.value})}
                  >
                    {availableRoles.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Username</Label>
                  <Input
                    value={formData.username}
                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                  />
                </div>
                <div className="col-span-2">
                  <Label>New Password (leave blank to keep current)</Label>
                  <Input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    placeholder="Leave blank to keep current password"
                  />
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Module Access Permissions</Label>
                <div className="grid grid-cols-2 gap-2 border rounded-md p-4 bg-slate-50">
                  {availableModules.map(module => (
                    <label key={module} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.allowed_modules.includes(module)}
                        onChange={() => handleModuleToggle(module)}
                        className="rounded"
                      />
                      <span className="text-sm capitalize">{module.replace('-', ' ').replace('_', ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setEditDialogOpen(false);
              resetForm();
              setEditingEmployee(null);
            }}>
              Cancel
            </Button>
            <Button onClick={handleUpdateEmployee}>
              <Edit className="w-4 h-4 mr-2" />
              Update Employee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Confirm Delete
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this employee? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          {employeeToDelete && (
            <div className="bg-slate-50 p-4 rounded-lg space-y-2">
              <p><strong>Employee #:</strong> {employeeToDelete.employee_number}</p>
              <p><strong>Name:</strong> {employeeToDelete.first_name} {employeeToDelete.last_name}</p>
              <p><strong>Role:</strong> {employeeToDelete.role}</p>
              <p><strong>Department:</strong> {employeeToDelete.department}</p>
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setDeleteDialogOpen(false);
                setEmployeeToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDeleteEmployee}
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Employee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EmployeeComplianceModal
        employee={complianceEmployee}
        open={!!complianceEmployee}
        onOpenChange={(o) => { if (!o) setComplianceEmployee(null); }}
      />
    </div>
  );
};

export default Employees;
