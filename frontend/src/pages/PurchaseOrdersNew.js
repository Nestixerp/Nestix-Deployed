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
import { Plus, Search, Eye, Package, Trash2, X, Printer, Mail, AlertCircle } from 'lucide-react';
import { toast } from '../hooks/use-toast';
import api from '../services/api';

const PO_TYPES = ['Stock', 'Job-Specific'];
const PO_STATUSES = ['Draft', 'Sent', 'Partial', 'Received', 'Closed', 'Cancelled'];

// Material attribute options (same as Inventory module)
const MATERIAL_TYPES = ['Mild Steel', 'Stainless Steel', 'Aluminium', 'Galvanized Steel'];
const GRADES = ['HA3', '304', '316', 'Grade 250', 'Grade 350', '5005', '5052', '6061', 'G300', 'G450', 'G550'];
const FINISHES = ['P&O', '2B', 'Galv', 'Mill Finish', 'Anodized', 'Powder Coated'];
const THICKNESSES = ['1mm', '1.2mm', '1.6mm', '2mm', '2.5mm', '3mm', '4mm', '5mm', '6mm', '8mm', '10mm', '12mm'];

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
    test_cert_required: false,
    expected_delivery_date: '',
    line_items: [],
    notes: '',
    internal_notes: ''
  });
  
  // Line item form
  const [lineItemForm, setLineItemForm] = useState({
    material_id: '',
    material_type: '',
    grade: '',
    finish: '',
    thickness: '',
    width: '',
    length: '',
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
      // TODO: Replace with actual jobs/quotes endpoint when available
      const response = await api.get('/quotes');
      setJobs(response.data || []);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      setJobs([]);
    }
  };

  const handleAddLineItem = () => {
    if (!lineItemForm.material_type || !lineItemForm.grade || !lineItemForm.finish || 
        !lineItemForm.thickness || !lineItemForm.quantity_ordered || !lineItemForm.price_per_unit) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive'
      });
      return;
    }

    const newLineItem = {
      material_id: lineItemForm.material_id || null,
      material_type: lineItemForm.material_type,
      grade: lineItemForm.grade,
      finish: lineItemForm.finish,
      thickness: lineItemForm.thickness,
      width: parseFloat(lineItemForm.width) || 0,
      length: parseFloat(lineItemForm.length) || 0,
      quantity_ordered: parseInt(lineItemForm.quantity_ordered),
      price_per_unit: parseFloat(lineItemForm.price_per_unit)
    };

    setPOForm({
      ...poForm,
      line_items: [...poForm.line_items, newLineItem]
    });

    setLineItemForm({
      material_id: '',
      material_type: '',
      grade: '',
      finish: '',
      thickness: '',
      width: '',
      length: '',
      quantity_ordered: '',
      price_per_unit: ''
    });
  };

  const handleSelectStockMaterial = (materialId) => {
    const material = materials.find(m => m.id === materialId);
    if (material) {
      setLineItemForm({
        ...lineItemForm,
        material_id: materialId,
        material_type: material.type || material.name,
        grade: material.grade,
        finish: material.finish,
        thickness: material.thickness,
        width: material.width || 1220,
        length: material.length || 2440
      });
    }
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

    if (poForm.po_type === 'Job-Specific' && !poForm.job_number) {
      toast({
        title: 'Validation Error',
        description: 'Job number is required for Job-Specific POs',
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

  const handlePrintPO = (po) => {
    toast({
      title: 'Print',
      description: 'Print functionality will be implemented'
    });
  };

  const handleEmailPO = (po) => {
    toast({
      title: 'Email',
      description: 'Email functionality will be implemented'
    });
  };

  const resetPOForm = () => {
    setPOForm({
      supplier_id: '',
      po_type: 'Stock',
      job_number: '',
      test_cert_required: false,
      expected_delivery_date: '',
      line_items: [],
      notes: '',
      internal_notes: ''
    });
    setLineItemForm({
      material_id: '',
      material_type: '',
      grade: '',
      finish: '',
      thickness: '',
      width: '',
      length: '',
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
                setShowOverdueOnly(false);
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
                    <TableCell>{new Date(po.order_date).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(po.expected_delivery_date).toLocaleDateString()}</TableCell>
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

      {/* Create PO Dialog - TO BE CONTINUED IN NEXT FILE DUE TO LENGTH */}
    </div>
  );
};

export default PurchaseOrders;
