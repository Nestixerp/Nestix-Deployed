import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Plus, Search, Eye, Package, Trash2, Printer, Mail, AlertCircle, Edit } from 'lucide-react';
import { toast } from '../hooks/use-toast';
import api from '../services/api';
import CreatePODialog from '../components/purchase-orders/CreatePODialog';
import EditPODialog from '../components/purchase-orders/EditPODialog';
import EmailPODialog from '../components/purchase-orders/EmailPODialog';
import PrintPO from '../components/purchase-orders/PrintPO';

const PO_TYPES = ['Stock', 'Job-Specific'];
const PO_STATUSES = ['Draft', 'Sent', 'Partial', 'Received', 'Closed', 'Cancelled'];

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
    minute: '2-digit',
    second: '2-digit'
  });
};

// Get today's date in YYYY-MM-DD format for input fields
const getTodayInputFormat = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getStatusColor = (status) => {
  const colors = {
    'Draft': 'bg-gray-500',
    'Sent': 'bg-blue-500',
    'Partial': 'bg-yellow-500',
    'Received': 'bg-green-500',
    'Closed': 'bg-slate-700',
    'Cancelled': 'bg-red-500'
  };
  return colors[status] || 'bg-gray-500';
};

const PurchaseOrders = () => {
  const [pos, setPos] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPO, setSelectedPO] = useState(null);
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [supplierContacts, setSupplierContacts] = useState([]);
  
  // Filters
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  
  // Dialogs
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isReceiveDialogOpen, setIsReceiveDialogOpen] = useState(false);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  
  // Receive form
  const [receiveForm, setReceiveForm] = useState({
    line_items: {}
  });

  useEffect(() => {
    fetchPOs();
    fetchSuppliers();
    fetchMaterials();
    fetchJobs();
  }, [showOverdueOnly]);

  const fetchPOs = async () => {
    try {
      setLoading(true);
      const params = showOverdueOnly ? { overdue: true } : {};
      const response = await api.get('/purchase-orders', { params });
      setPos(response.data);
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch purchase orders',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const response = await api.get('/suppliers');
      setSuppliers(response.data);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    }
  };

  const fetchMaterials = async () => {
    try {
      const response = await api.get('/materials');
      setMaterials(response.data);
    } catch (error) {
      console.error('Error fetching materials:', error);
    }
  };

  const fetchJobs = async () => {
    try {
      const response = await api.get('/quotes');
      setJobs(response.data || []);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      setJobs([]);
    }
  };

  const handleCreatePO = async (poData) => {
    try {
      await api.post('/purchase-orders', poData);
      toast({
        title: 'Success',
        description: 'Purchase order created successfully'
      });
      setIsCreateDialogOpen(false);
      fetchPOs();
    } catch (error) {
      console.error('Error creating PO:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.detail || 'Failed to create purchase order',
        variant: 'destructive'
      });
    }
  };

  const handleViewPO = async (po) => {
    setSelectedPO(po);
    setIsDetailDialogOpen(true);
  };

  const handleReceivePO = async (po) => {
    setSelectedPO(po);
    // Initialize receive form with line items
    const initialReceiveForm = {};
    po.line_items.forEach(item => {
      initialReceiveForm[item.id] = 0;
    });
    setReceiveForm({ line_items: initialReceiveForm });
    setIsReceiveDialogOpen(true);
  };

  const handleSubmitReceive = async () => {
    try {
      await api.post(`/purchase-orders/${selectedPO.id}/receive`, receiveForm);
      toast({
        title: 'Success',
        description: 'Purchase order received successfully'
      });
      setIsReceiveDialogOpen(false);
      fetchPOs();
    } catch (error) {
      console.error('Error receiving PO:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.detail || 'Failed to receive purchase order',
        variant: 'destructive'
      });
    }
  };

  const handleCancelPO = async (poId) => {
    if (!window.confirm('Are you sure you want to cancel this purchase order?')) return;

    try {
      await api.delete(`/purchase-orders/${poId}`);
      toast({
        title: 'Success',
        description: 'Purchase order cancelled'
      });
      fetchPOs();
    } catch (error) {
      console.error('Error cancelling PO:', error);
      toast({
        title: 'Error',
        description: 'Failed to cancel purchase order',
        variant: 'destructive'
      });
    }
  };

  const handleEditPO = (po) => {
    setSelectedPO(po);
    setIsEditDialogOpen(true);
  };

  const handleUpdatePO = async (poId, poData) => {
    try {
      await api.put(`/purchase-orders/${poId}`, poData);
      toast({
        title: 'Success',
        description: 'Purchase order updated successfully'
      });
      setIsEditDialogOpen(false);
      fetchPOs();
    } catch (error) {
      console.error('Error updating PO:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.detail || 'Failed to update purchase order',
        variant: 'destructive'
      });
    }
  };

  const handlePrintPO = (po) => {
    setSelectedPO(po);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const handleEmailPO = async (po) => {
    setSelectedPO(po);
    
    // Fetch supplier contacts
    try {
      const response = await api.get(`/suppliers/${po.supplier_id}`);
      setSupplierContacts(response.data.contacts || []);
      setIsEmailDialogOpen(true);
    } catch (error) {
      console.error('Error fetching supplier contacts:', error);
      toast({
        title: 'Error',
        description: 'Failed to load supplier contacts',
        variant: 'destructive'
      });
    }
  };

  const handleSendEmail = async (emailData) => {
    try {
      await api.post(`/purchase-orders/${selectedPO.id}/email`, emailData);
      toast({
        title: 'Success',
        description: 'Purchase order email sent successfully. Status updated to "Sent".'
      });
      setIsEmailDialogOpen(false);
      fetchPOs(); // Refresh to show updated status
    } catch (error) {
      console.error('Error sending email:', error);
      toast({
        title: 'Error',
        description: 'Failed to send email',
        variant: 'destructive'
      });
    }
  };

  const filteredPOs = pos.filter(po => {
    const matchesSearch = po.po_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         po.supplier_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSupplier = filterSupplier === 'all' || po.supplier_id === filterSupplier;
    const matchesStatus = filterStatus === 'all' || po.status === filterStatus;
    const matchesType = filterType === 'all' || po.po_type === filterType;
    return matchesSearch && matchesSupplier && matchesStatus && matchesType;
  });

  const calculateStats = () => {
    const totalPOs = pos.length;
    const totalValue = pos.reduce((sum, po) => sum + po.total, 0);
    const pendingPOs = pos.filter(po => ['Draft', 'Sent', 'Partial'].includes(po.status)).length;
    const receivedPOs = pos.filter(po => po.status === 'Received').length;
    const overduePOs = pos.filter(po => {
      if (['Draft', 'Sent', 'Partial'].includes(po.status)) {
        const expected = new Date(po.expected_delivery_date);
        return expected < new Date();
      }
      return false;
    }).length;
    
    return { totalPOs, totalValue, pendingPOs, receivedPOs, overduePOs };
  };

  const stats = calculateStats();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading purchase orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Purchase Orders</h1>
          <p className="text-slate-600 mt-1">Manage stock orders and supplier deliveries</p>
        </div>
        <Button 
          onClick={() => setIsCreateDialogOpen(true)}
          className="bg-slate-900 hover:bg-slate-800"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create PO
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total POs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPOs}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.totalValue.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingPOs}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Received</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.receivedPOs}</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => setShowOverdueOnly(!showOverdueOnly)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600 flex items-center">
              <AlertCircle className="h-4 w-4 mr-1" />
              Overdue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.overduePOs}</div>
            {showOverdueOnly && <p className="text-xs text-slate-500 mt-1">Showing overdue only</p>}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search POs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterSupplier} onValueChange={setFilterSupplier}>
              <SelectTrigger>
                <SelectValue placeholder="All Suppliers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Suppliers</SelectItem>
                {suppliers.map(supplier => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.company_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {PO_STATUSES.map(status => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger>
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {PO_TYPES.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              variant="outline" 
              onClick={() => {
                setSearchTerm('');
                setFilterSupplier('all');
                setFilterStatus('all');
                setFilterType('all');
              }}
            >
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* PO Table */}
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Number</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Expected Delivery</TableHead>
                <TableHead>Test Cert</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPOs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-slate-500 py-8">
                    {showOverdueOnly ? 'No overdue purchase orders' : 'No purchase orders found'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredPOs.map(po => (
                  <TableRow key={po.id}>
                    <TableCell className="font-medium">{po.po_number}</TableCell>
                    <TableCell>{po.supplier_name}</TableCell>
                    <TableCell>{po.po_type}</TableCell>
                    <TableCell>
                      <Badge className={`${getStatusColor(po.status)} text-white`}>
                        {po.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatAustralianDate(po.order_date)}</TableCell>
                    <TableCell>{formatAustralianDate(po.expected_delivery_date)}</TableCell>
                    <TableCell>{po.test_cert_required ? 'Yes' : 'No'}</TableCell>
                    <TableCell className="text-right">${po.total.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewPO(po)}
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {['Draft', 'Sent'].includes(po.status) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditPO(po)}
                            title="Edit PO"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePrintPO(po)}
                          title="Print PO"
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEmailPO(po)}
                          title="Email PO"
                        >
                          <Mail className="h-4 w-4" />
                        </Button>
                        {['Draft', 'Sent', 'Partial'].includes(po.status) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReceivePO(po)}
                            title="Receive Stock"
                          >
                            <Package className="h-4 w-4" />
                          </Button>
                        )}
                        {po.status === 'Draft' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCancelPO(po.id)}
                            title="Cancel PO"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create PO Dialog */}
      <CreatePODialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        suppliers={suppliers}
        materials={materials}
        jobs={jobs}
        onSubmit={handleCreatePO}
      />

      {/* Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedPO && (
            <>
              <DialogHeader>
                <DialogTitle>Purchase Order Details</DialogTitle>
                <DialogDescription>{selectedPO.po_number}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-slate-600">Supplier</Label>
                    <p className="font-medium">{selectedPO.supplier_name}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-600">Status</Label>
                    <div className="mt-1">
                      <Badge className={`${getStatusColor(selectedPO.status)} text-white`}>
                        {selectedPO.status}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs text-slate-600">PO Type</Label>
                    <p className="font-medium">{selectedPO.po_type}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-600">Order Date</Label>
                    <p className="font-medium">{formatAustralianDate(selectedPO.order_date)}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-600">Expected Delivery</Label>
                    <p className="font-medium">{formatAustralianDate(selectedPO.expected_delivery_date)}</p>
                  </div>
                </div>

                {selectedPO.actual_delivery_date && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-slate-600">Actual Delivery</Label>
                      <p className="font-medium">{formatAustralianDate(selectedPO.actual_delivery_date)}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">Days Late</Label>
                      <p className={`font-medium ${selectedPO.days_late > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {selectedPO.days_late > 0 ? `+${selectedPO.days_late}` : selectedPO.days_late} days
                      </p>
                    </div>
                  </div>
                )}

                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">Line Items</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material Specification</TableHead>
                        <TableHead>Dimensions</TableHead>
                        <TableHead>Ordered</TableHead>
                        <TableHead>Received</TableHead>
                        <TableHead>Backorder</TableHead>
                        <TableHead>Price/Unit</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedPO.line_items.map((item) => {
                        const backorder = item.quantity_ordered - item.quantity_received;
                        return (
                          <TableRow key={item.id}>
                            <TableCell>
                              <div className="font-medium">{item.material_type}</div>
                              <div className="text-xs text-slate-500">
                                {item.grade} | {item.finish} | {item.thickness}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{item.width} × {item.length} mm</TableCell>
                            <TableCell>{item.quantity_ordered}</TableCell>
                            <TableCell>{item.quantity_received}</TableCell>
                            <TableCell className={backorder > 0 ? 'text-orange-600 font-medium' : 'text-green-600'}>
                              {backorder}
                            </TableCell>
                            <TableCell>${item.price_per_unit.toFixed(2)}</TableCell>
                            <TableCell className="text-right">${item.line_total.toFixed(2)}</TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow>
                        <TableCell colSpan={6} className="text-right font-semibold">Total:</TableCell>
                        <TableCell className="text-right font-semibold">
                          ${selectedPO.total.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {selectedPO.notes && (
                  <div>
                    <Label className="text-xs text-slate-600">Notes</Label>
                    <p className="text-sm">{selectedPO.notes}</p>
                  </div>
                )}

                {selectedPO.internal_notes && (
                  <div>
                    <Label className="text-xs text-slate-600">Internal Notes</Label>
                    <p className="text-sm">{selectedPO.internal_notes}</p>
                  </div>
                )}

                <div>
                  <Label className="text-xs text-slate-600">Created By</Label>
                  <p className="text-sm">{selectedPO.created_by} on {formatAustralianDateTime(selectedPO.created_at)}</p>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Receive Dialog */}
      <Dialog open={isReceiveDialogOpen} onOpenChange={setIsReceiveDialogOpen}>
        <DialogContent className="max-w-2xl">
          {selectedPO && (
            <>
              <DialogHeader>
                <DialogTitle>Receive Purchase Order</DialogTitle>
                <DialogDescription>{selectedPO.po_number} - {selectedPO.supplier_name}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-slate-600">Enter the quantity received for each line item:</p>
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material Specification</TableHead>
                      <TableHead>Dimensions</TableHead>
                      <TableHead>Ordered</TableHead>
                      <TableHead>Already Received</TableHead>
                      <TableHead>Backorder</TableHead>
                      <TableHead>Receive Now</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPO.line_items.map((item) => {
                      const backorder = item.quantity_ordered - item.quantity_received;
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-medium text-sm">{item.material_type}</div>
                            <div className="text-xs text-slate-500">
                              {item.grade} | {item.finish} | {item.thickness}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{item.width} × {item.length}</TableCell>
                          <TableCell>{item.quantity_ordered}</TableCell>
                          <TableCell>{item.quantity_received}</TableCell>
                          <TableCell className="font-medium text-orange-600">{backorder}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              max={backorder}
                              value={receiveForm.line_items[item.id] || 0}
                              onChange={(e) => setReceiveForm({
                                line_items: {
                                  ...receiveForm.line_items,
                                  [item.id]: parseInt(e.target.value) || 0
                                }
                              })}
                              className="w-24"
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                <div className="flex gap-2 pt-4">
                  <Button 
                    variant="outline" 
                    className="flex-1" 
                    onClick={() => setIsReceiveDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    className="flex-1 bg-slate-900 hover:bg-slate-800" 
                    onClick={handleSubmitReceive}
                  >
                    Receive Stock
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit PO Dialog */}
      {selectedPO && (
        <EditPODialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          po={selectedPO}
          suppliers={suppliers}
          materials={materials}
          jobs={jobs}
          onSubmit={handleUpdatePO}
        />
      )}

      {/* Email PO Dialog */}
      {selectedPO && (
        <EmailPODialog
          open={isEmailDialogOpen}
          onOpenChange={setIsEmailDialogOpen}
          po={selectedPO}
          supplierContacts={supplierContacts}
          onSend={handleSendEmail}
        />
      )}

      {/* Print PO Component */}
      {selectedPO && <PrintPO po={selectedPO} />}
    </div>
  );
};

export default PurchaseOrders;
