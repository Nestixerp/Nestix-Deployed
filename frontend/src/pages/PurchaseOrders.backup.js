import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Plus, Search, Eye, FileText, Package, Trash2, X } from 'lucide-react';
import { toast } from '../hooks/use-toast';
import api from '../services/api';

const PO_TYPES = ['Stock', 'Job-Specific', 'Subcontract'];
const PO_STATUSES = ['Draft', 'Sent', 'Partial', 'Received', 'Closed', 'Cancelled'];

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
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPO, setSelectedPO] = useState(null);
  
  // Filters
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  
  // Dialogs
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isReceiveDialogOpen, setIsReceiveDialogOpen] = useState(false);
  
  // Form state
  const [poForm, setPOForm] = useState({
    supplier_id: '',
    po_type: 'Stock',
    job_number: '',
    expected_delivery_date: '',
    line_items: [],
    notes: '',
    internal_notes: ''
  });
  
  // Line item form
  const [lineItemForm, setLineItemForm] = useState({
    material_id: '',
    quantity_ordered: '',
    price_per_unit: ''
  });
  
  // Receive form
  const [receiveForm, setReceiveForm] = useState({
    line_items: {}
  });

  useEffect(() => {
    fetchPOs();
    fetchSuppliers();
    fetchMaterials();
  }, []);

  const fetchPOs = async () => {
    try {
      setLoading(true);
      const response = await api.get('/purchase-orders');
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

  const handleAddLineItem = () => {
    if (!lineItemForm.material_id || !lineItemForm.quantity_ordered || !lineItemForm.price_per_unit) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all line item fields',
        variant: 'destructive'
      });
      return;
    }

    const material = materials.find(m => m.id === lineItemForm.material_id);
    if (!material) return;

    const newLineItem = {
      material_id: lineItemForm.material_id,
      material_name: material.name,
      quantity_ordered: parseInt(lineItemForm.quantity_ordered),
      price_per_unit: parseFloat(lineItemForm.price_per_unit),
      notes: ''
    };

    setPOForm({
      ...poForm,
      line_items: [...poForm.line_items, newLineItem]
    });

    setLineItemForm({
      material_id: '',
      quantity_ordered: '',
      price_per_unit: ''
    });
  };

  const handleRemoveLineItem = (index) => {
    setPOForm({
      ...poForm,
      line_items: poForm.line_items.filter((_, i) => i !== index)
    });
  };

  const handleCreatePO = async () => {
    if (!poForm.supplier_id || !poForm.expected_delivery_date || poForm.line_items.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in supplier, delivery date, and add at least one line item',
        variant: 'destructive'
      });
      return;
    }

    try {
      await api.post('/purchase-orders', poForm);
      toast({
        title: 'Success',
        description: 'Purchase order created successfully'
      });
      setIsCreateDialogOpen(false);
      resetPOForm();
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

  const resetPOForm = () => {
    setPOForm({
      supplier_id: '',
      po_type: 'Stock',
      job_number: '',
      expected_delivery_date: '',
      line_items: [],
      notes: '',
      internal_notes: ''
    });
    setLineItemForm({
      material_id: '',
      quantity_ordered: '',
      price_per_unit: ''
    });
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
    
    return { totalPOs, totalValue, pendingPOs, receivedPOs };
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPOs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-slate-500 py-8">
                    No purchase orders found
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
                    <TableCell>{new Date(po.order_date).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(po.expected_delivery_date).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">${po.total.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewPO(po)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {['Draft', 'Sent', 'Partial'].includes(po.status) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReceivePO(po)}
                          >
                            <Package className="h-4 w-4" />
                          </Button>
                        )}
                        {po.status === 'Draft' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCancelPO(po.id)}
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
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Purchase Order</DialogTitle>
            <DialogDescription>Add a new purchase order for stock or job-specific materials</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Supplier *</Label>
                <Select 
                  value={poForm.supplier_id} 
                  onValueChange={(value) => setPOForm({...poForm, supplier_id: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(supplier => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.company_name} ({supplier.supplier_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>PO Type *</Label>
                <Select 
                  value={poForm.po_type} 
                  onValueChange={(value) => setPOForm({...poForm, po_type: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PO_TYPES.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {poForm.po_type === 'Job-Specific' && (
                <div>
                  <Label>Job Number</Label>
                  <Input
                    value={poForm.job_number}
                    onChange={(e) => setPOForm({...poForm, job_number: e.target.value})}
                    placeholder="JOB-001"
                  />
                </div>
              )}
              <div>
                <Label>Expected Delivery Date *</Label>
                <Input
                  type="date"
                  value={poForm.expected_delivery_date}
                  onChange={(e) => setPOForm({...poForm, expected_delivery_date: e.target.value})}
                />
              </div>
            </div>

            {/* Line Items */}
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">Line Items</h3>
              
              {/* Add Line Item Form */}
              <div className="bg-slate-50 p-4 rounded-lg mb-4">
                <div className="grid grid-cols-4 gap-3">
                  <div className="col-span-2">
                    <Label className="text-xs">Material</Label>
                    <Select 
                      value={lineItemForm.material_id} 
                      onValueChange={(value) => setLineItemForm({...lineItemForm, material_id: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select material" />
                      </SelectTrigger>
                      <SelectContent>
                        {materials.map(material => (
                          <SelectItem key={material.id} value={material.id}>
                            {material.name} - {material.thickness}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Quantity</Label>
                    <Input
                      type="number"
                      value={lineItemForm.quantity_ordered}
                      onChange={(e) => setLineItemForm({...lineItemForm, quantity_ordered: e.target.value})}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Price/Unit</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={lineItemForm.price_per_unit}
                      onChange={(e) => setLineItemForm({...lineItemForm, price_per_unit: e.target.value})}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <Button 
                  size="sm" 
                  onClick={handleAddLineItem}
                  className="mt-3 bg-slate-900 hover:bg-slate-800"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Line Item
                </Button>
              </div>

              {/* Line Items List */}
              {poForm.line_items.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Price/Unit</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {poForm.line_items.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>{item.material_name}</TableCell>
                          <TableCell>{item.quantity_ordered}</TableCell>
                          <TableCell>${item.price_per_unit.toFixed(2)}</TableCell>
                          <TableCell className="text-right">
                            ${(item.quantity_ordered * item.price_per_unit).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemoveLineItem(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell colSpan={3} className="text-right font-semibold">Total:</TableCell>
                        <TableCell className="text-right font-semibold">
                          ${poForm.line_items.reduce((sum, item) => 
                            sum + (item.quantity_ordered * item.price_per_unit), 0
                          ).toFixed(2)}
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                value={poForm.notes}
                onChange={(e) => setPOForm({...poForm, notes: e.target.value})}
                placeholder="Supplier-visible notes"
                rows={2}
              />
            </div>

            <div>
              <Label>Internal Notes</Label>
              <Textarea
                value={poForm.internal_notes}
                onChange={(e) => setPOForm({...poForm, internal_notes: e.target.value})}
                placeholder="Internal notes (not visible to supplier)"
                rows={2}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button 
                variant="outline" 
                className="flex-1" 
                onClick={() => {
                  setIsCreateDialogOpen(false);
                  resetPOForm();
                }}
              >
                Cancel
              </Button>
              <Button 
                className="flex-1 bg-slate-900 hover:bg-slate-800" 
                onClick={handleCreatePO}
              >
                Create Purchase Order
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                    <p className="font-medium">{new Date(selectedPO.order_date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-600">Expected Delivery</Label>
                    <p className="font-medium">{new Date(selectedPO.expected_delivery_date).toLocaleDateString()}</p>
                  </div>
                </div>

                {selectedPO.actual_delivery_date && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-slate-600">Actual Delivery</Label>
                      <p className="font-medium">{new Date(selectedPO.actual_delivery_date).toLocaleDateString()}</p>
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
                        <TableHead>Material</TableHead>
                        <TableHead>Ordered</TableHead>
                        <TableHead>Received</TableHead>
                        <TableHead>Price/Unit</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedPO.line_items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.material_name}</TableCell>
                          <TableCell>{item.quantity_ordered}</TableCell>
                          <TableCell>{item.quantity_received}</TableCell>
                          <TableCell>${item.price_per_unit.toFixed(2)}</TableCell>
                          <TableCell className="text-right">${item.line_total.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell colSpan={4} className="text-right font-semibold">Total:</TableCell>
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
                  <p className="text-sm">{selectedPO.created_by} on {new Date(selectedPO.created_at).toLocaleString()}</p>
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
                      <TableHead>Material</TableHead>
                      <TableHead>Ordered</TableHead>
                      <TableHead>Already Received</TableHead>
                      <TableHead>Receive Now</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPO.line_items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.material_name}</TableCell>
                        <TableCell>{item.quantity_ordered}</TableCell>
                        <TableCell>{item.quantity_received}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            max={item.quantity_ordered - item.quantity_received}
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
                    ))}
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
    </div>
  );
};

export default PurchaseOrders;
