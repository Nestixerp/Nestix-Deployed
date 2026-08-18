import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Plus, Search, FileText, Edit, Trash2, AlertCircle, DollarSign, Package, UserPlus, Download } from 'lucide-react';
import api from '../services/api';

const Quotes = () => {
  const [quotes, setQuotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [addCustomerDialogOpen, setAddCustomerDialogOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [editingQuote, setEditingQuote] = useState(null);
  const [activeTab, setActiveTab] = useState('info');
  
  // Form data for new/edit quote
  const initialFormData = {
    customer_id: '',
    customer_name: '',
    contact_person: '',
    part_description: '',
    material_source: 'manual', // 'inventory' or 'manual'
    material_id: '',
    material_type: 'Mild Steel',
    grade: 'HA3',
    finish: 'P&O',
    thickness: '3mm',
    sheet_width: 1220,
    sheet_length: 2440,
    parts_per_sheet: 1,
    quantity_required: 1,
    buying_cost_per_sheet: 0,
    selling_price_per_sheet: 0,
    material_markup_percent: 10,
    part_length: 0,
    part_width: 0,
    total_perimeter: 0,
    outside_total: 0,
    inside_total: 0,
    holes_quantity: 0,
    geometry_for_time_calculation: 0,
    cutting_time_method: 'manual',
    cutting_time_minutes: 0,
    charge_rate_per_min: 2.75,
    suggested_charge_rate: 4.00,
    setup_cost: 0,
    programming_cost: 0,
    laser_cleaning_cost: 0,
    delivery_cost: 0,
    other_costs: 0
  };
  
  const [formData, setFormData] = useState(initialFormData);
  
  // Customer form data
  const [customerFormData, setCustomerFormData] = useState({
    company_name: '',
    contact_person: '',
    email: '',
    phone: '',
    mobile: '',
    address: '',
    suburb: '',
    state: '',
    postcode: '',
    payment_terms: '30 Days EOM',
    notes: ''
  });
  
  // Stats
  const [stats, setStats] = useState({
    totalQuotes: 0,
    totalValue: 0,
    draft: 0,
    sent: 0
  });

  useEffect(() => {
    fetchQuotes();
    fetchCustomers();
    fetchMaterials();
  }, []);

  const fetchQuotes = async () => {
    try {
      setLoading(true);
      const response = await api.get('/quotes');
      setQuotes(response.data);
      calculateStats(response.data);
    } catch (error) {
      console.error('Error fetching quotes:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const response = await api.get('/customers');
      setCustomers(response.data);
    } catch (error) {
      console.error('Error fetching customers:', error);
      setCustomers([]);
    }
  };

  const fetchMaterials = async () => {
    try {
      const response = await api.get('/materials');
      setMaterials(response.data);
    } catch (error) {
      console.error('Error fetching materials:', error);
      setMaterials([]);
    }
  };

  const calculateStats = (quotesData) => {
    const stats = {
      totalQuotes: quotesData.length,
      totalValue: quotesData.reduce((sum, q) => sum + (q.quote_total || 0), 0),
      draft: quotesData.filter(q => q.status === 'Draft').length,
      sent: quotesData.filter(q => q.status === 'Sent').length
    };
    setStats(stats);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => {
      const updated = {
        ...prev,
        [field]: value
      };
      
      // Auto-calculate perimeter when length or width changes
      if (field === 'part_length' || field === 'part_width') {
        const length = field === 'part_length' ? value : prev.part_length;
        const width = field === 'part_width' ? value : prev.part_width;
        updated.total_perimeter = 2 * (parseFloat(length) + parseFloat(width)) || 0;
      }
      
      return updated;
    });
  };

  const handleCustomerChange = (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      setFormData(prev => ({
        ...prev,
        customer_id: customer.id,
        customer_name: customer.company_name,
        contact_person: customer.contact_person || ''
      }));
    }
  };

  const handleMaterialChange = (materialId) => {
    const material = materials.find(m => m.id === materialId);
    if (material) {
      // Calculate markup percentage
      const costAverage = material.cost_average || 0;
      const sellingPrice = material.selling_price || 0;
      const markup = costAverage > 0 ? ((sellingPrice - costAverage) / costAverage) * 100 : 0;
      
      setFormData(prev => ({
        ...prev,
        material_id: material.id,
        material_type: material.name,
        grade: material.grade,
        finish: material.finish,
        thickness: material.thickness,
        sheet_width: material.width,
        sheet_length: material.length,
        buying_cost_per_sheet: costAverage,
        selling_price_per_sheet: sellingPrice,
        material_markup_percent: markup
      }));
    }
  };

  const handleCreateQuote = async () => {
    try {
      if (!formData.customer_name) {
        alert('Please select or enter a customer');
        return;
      }
      
      const response = await api.post('/quotes', formData);
      setQuotes([response.data, ...quotes]);
      calculateStats([response.data, ...quotes]);
      setCreateDialogOpen(false);
      alert('Quote created successfully! Quote #' + response.data.quote_number);
      setFormData(initialFormData);
      setActiveTab('info');
    } catch (error) {
      console.error('Error creating quote:', error);
      alert('Failed to create quote: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleEditQuote = (quote) => {
    setEditingQuote(quote);
    setFormData({
      customer_id: quote.customer_id || '',
      customer_name: quote.customer_name,
      contact_person: quote.contact_person || '',
      part_description: quote.part_description,
      material_source: quote.material_id ? 'inventory' : 'manual',
      material_id: quote.material_id || '',
      material_type: quote.material_type,
      grade: quote.grade,
      finish: quote.finish,
      thickness: quote.thickness,
      sheet_width: quote.sheet_width,
      sheet_length: quote.sheet_length,
      parts_per_sheet: quote.parts_per_sheet,
      quantity_required: quote.quantity_required,
      buying_cost_per_sheet: quote.buying_cost_per_sheet,
      selling_price_per_sheet: quote.selling_price_per_sheet,
      material_markup_percent: quote.material_markup_percent,
      part_length: quote.part_length || 0,
      part_width: quote.part_width || 0,
      total_perimeter: quote.total_perimeter,
      outside_total: quote.outside_total,
      inside_total: quote.inside_total,
      holes_quantity: quote.holes_quantity,
      geometry_for_time_calculation: quote.geometry_for_time_calculation,
      cutting_time_method: quote.cutting_time_method,
      cutting_time_minutes: quote.cutting_time_minutes,
      charge_rate_per_min: quote.charge_rate_per_min,
      suggested_charge_rate: quote.suggested_charge_rate,
      setup_cost: quote.setup_cost,
      programming_cost: quote.programming_cost,
      laser_cleaning_cost: quote.laser_cleaning_cost,
      delivery_cost: quote.delivery_cost,
      other_costs: quote.other_costs
    });
    setActiveTab('info');
    setEditDialogOpen(true);
  };

  const handleUpdateQuote = async () => {
    try {
      if (!formData.customer_name) {
        alert('Please select or enter a customer');
        return;
      }
      
      const response = await api.put(`/quotes/${editingQuote.id}`, formData);
      const updatedQuotes = quotes.map(q => q.id === editingQuote.id ? response.data : q);
      setQuotes(updatedQuotes);
      calculateStats(updatedQuotes);
      setEditDialogOpen(false);
      alert('Quote updated successfully!');
      setFormData(initialFormData);
      setEditingQuote(null);
      setActiveTab('info');
    } catch (error) {
      console.error('Error updating quote:', error);
      alert('Failed to update quote: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleViewQuote = (quote) => {
    setSelectedQuote(quote);
    setViewDialogOpen(true);
  };

  const handleAddCustomer = async () => {
    try {
      if (!customerFormData.company_name) {
        alert('Please enter company name');
        return;
      }
      
      const response = await api.post('/customers', customerFormData);
      setCustomers([...customers, response.data]);
      setAddCustomerDialogOpen(false);
      alert('Customer added successfully! Customer Code: ' + response.data.customer_code);
      
      // Auto-select the new customer in the form
      setFormData(prev => ({
        ...prev,
        customer_id: response.data.id,
        customer_name: response.data.company_name,
        contact_person: response.data.contact_person || ''
      }));
      
      // Reset customer form
      setCustomerFormData({
        company_name: '',
        contact_person: '',
        email: '',
        phone: '',
        mobile: '',
        address: '',
        suburb: '',
        state: '',
        postcode: '',
        payment_terms: '30 Days EOM',
        notes: ''
      });
    } catch (error) {
      console.error('Error adding customer:', error);
      alert('Failed to add customer: ' + (error.response?.data?.detail || error.message));
    }
  };

  const getStatusBadge = (status) => {
    const colors = {
      'Draft': 'bg-gray-100 text-gray-800',
      'Sent': 'bg-blue-100 text-blue-800',
      'Accepted': 'bg-green-100 text-green-800',
      'Rejected': 'bg-red-100 text-red-800',
      'Job Created': 'bg-purple-100 text-purple-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const filteredQuotes = quotes.filter(quote => {
    const matchesSearch = quote.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         quote.quote_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         quote.part_description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = !statusFilter || quote.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD'
    }).format(value || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-AU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // Quote Form Component (reusable for create and edit)
  const QuoteFormTabs = ({ isEdit = false }) => (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="info">Quote Information</TabsTrigger>
        <TabsTrigger value="material">Material</TabsTrigger>
        <TabsTrigger value="geometry">Geometry</TabsTrigger>
        <TabsTrigger value="pricing">Pricing</TabsTrigger>
      </TabsList>
      
      {/* Tab 1: Quote Information */}
      <TabsContent value="info" className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Customer *</Label>
            <div className="flex gap-2">
              <select
                className="flex-1 border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900"
                value={formData.customer_id}
                onChange={(e) => handleCustomerChange(e.target.value)}
              >
                <option value="">Select a customer...</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.customer_code} - {customer.company_name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddCustomerDialogOpen(true)}
              >
                <UserPlus className="w-4 h-4" />
              </Button>
            </div>
            {!formData.customer_id && formData.customer_name && (
              <p className="text-sm text-amber-600 mt-1">
                Manual entry: "{formData.customer_name}" (not linked to customer database)
              </p>
            )}
          </div>
          <div>
            <Label>Customer Name (Manual Entry)</Label>
            <Input
              value={formData.customer_name}
              onChange={(e) => handleInputChange('customer_name', e.target.value)}
              placeholder="Or enter manually..."
              disabled={!!formData.customer_id}
            />
          </div>
          <div>
            <Label>Contact Person</Label>
            <Input
              value={formData.contact_person}
              onChange={(e) => handleInputChange('contact_person', e.target.value)}
              placeholder="Enter contact name"
            />
          </div>
        </div>
        
        <div>
          <Label>Part Description *</Label>
          <Textarea
            value={formData.part_description}
            onChange={(e) => handleInputChange('part_description', e.target.value)}
            placeholder="Enter part description"
            rows={3}
          />
        </div>
        
        <div>
          <Label>Quantity Required *</Label>
          <Input
            type="number"
            value={formData.quantity_required}
            onChange={(e) => handleInputChange('quantity_required', parseInt(e.target.value) || 1)}
            min="1"
          />
        </div>
      </TabsContent>
      
      {/* Tab 2: Material */}
      <TabsContent value="material" className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <Label className="font-semibold text-blue-900 mb-2 block">Material Source</Label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="material_source"
                value="inventory"
                checked={formData.material_source === 'inventory'}
                onChange={(e) => handleInputChange('material_source', e.target.value)}
                className="w-4 h-4"
              />
              <span>Import from Inventory (Cost Average + Markup)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="material_source"
                value="manual"
                checked={formData.material_source === 'manual'}
                onChange={(e) => handleInputChange('material_source', e.target.value)}
                className="w-4 h-4"
              />
              <span>Manual Entry</span>
            </label>
          </div>
        </div>

        {formData.material_source === 'inventory' ? (
          <>
            <div>
              <Label>Select Material from Inventory *</Label>
              <div className="flex gap-2 items-center">
                <select
                  className="flex-1 border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  value={formData.material_id}
                  onChange={(e) => handleMaterialChange(e.target.value)}
                >
                  <option value="">Select a material...</option>
                  {materials.map(material => (
                    <option key={material.id} value={material.id}>
                      {material.name} - {material.thickness} - {material.grade} - {material.finish} (Stock: {material.stock})
                    </option>
                  ))}
                </select>
                <Download className="w-5 h-5 text-blue-600" />
              </div>
              {formData.material_id && (
                <p className="text-sm text-green-600 mt-1">
                  ✓ Material imported with cost average and markup from inventory
                </p>
              )}
            </div>
            
            {formData.material_id && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-semibold text-green-900 mb-2">Imported Material Details</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="font-medium">Type:</span> {formData.material_type}</div>
                  <div><span className="font-medium">Grade:</span> {formData.grade}</div>
                  <div><span className="font-medium">Finish:</span> {formData.finish}</div>
                  <div><span className="font-medium">Thickness:</span> {formData.thickness}</div>
                  <div><span className="font-medium">Cost Average:</span> {formatCurrency(formData.buying_cost_per_sheet)}</div>
                  <div><span className="font-medium">Selling Price:</span> {formatCurrency(formData.selling_price_per_sheet)}</div>
                  <div><span className="font-medium">Markup:</span> {formData.material_markup_percent.toFixed(2)}%</div>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Material Type *</Label>
                <select
                  className="w-full border rounded-md px-3 py-2"
                  value={formData.material_type}
                  onChange={(e) => handleInputChange('material_type', e.target.value)}
                >
                  <option>Mild Steel</option>
                  <option>Stainless Steel</option>
                  <option>Aluminium</option>
                </select>
              </div>
              <div>
                <Label>Grade *</Label>
                <Input
                  value={formData.grade}
                  onChange={(e) => handleInputChange('grade', e.target.value)}
                />
              </div>
              <div>
                <Label>Finish *</Label>
                <Input
                  value={formData.finish}
                  onChange={(e) => handleInputChange('finish', e.target.value)}
                />
              </div>
              <div>
                <Label>Thickness *</Label>
                <Input
                  value={formData.thickness}
                  onChange={(e) => handleInputChange('thickness', e.target.value)}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Sheet Width (mm)</Label>
                <Input
                  type="number"
                  value={formData.sheet_width}
                  onChange={(e) => handleInputChange('sheet_width', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <Label>Sheet Length (mm)</Label>
                <Input
                  type="number"
                  value={formData.sheet_length}
                  onChange={(e) => handleInputChange('sheet_length', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <Label>Parts per Sheet</Label>
                <Input
                  type="number"
                  value={formData.parts_per_sheet}
                  onChange={(e) => handleInputChange('parts_per_sheet', parseInt(e.target.value) || 1)}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Buying Cost per Sheet ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.buying_cost_per_sheet}
                  onChange={(e) => handleInputChange('buying_cost_per_sheet', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <Label>Selling Price per Sheet ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.selling_price_per_sheet}
                  onChange={(e) => handleInputChange('selling_price_per_sheet', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <Label>Markup %</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.material_markup_percent}
                  onChange={(e) => handleInputChange('material_markup_percent', parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
          </>
        )}
      </TabsContent>
      
      {/* Tab 3: Geometry */}
      <TabsContent value="geometry" className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 className="font-semibold text-green-900 mb-3">Part Dimensions (Auto-calculate Perimeter)</h4>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Part Length (mm) *</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.part_length}
                onChange={(e) => handleInputChange('part_length', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>Part Width (mm) *</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.part_width}
                onChange={(e) => handleInputChange('part_width', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>Perimeter (mm) - Auto</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.total_perimeter}
                readOnly
                className="bg-green-100 font-semibold"
              />
            </div>
          </div>
          <p className="text-xs text-green-700 mt-2">
            ✓ Perimeter = 2 × (Length + Width) = 2 × ({formData.part_length} + {formData.part_width}) = {formData.total_perimeter.toFixed(2)} mm
          </p>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Outside Total (mm)</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.outside_total}
              onChange={(e) => handleInputChange('outside_total', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label>Inside Total (mm)</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.inside_total}
              onChange={(e) => handleInputChange('inside_total', parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Holes Quantity</Label>
            <Input
              type="number"
              value={formData.holes_quantity}
              onChange={(e) => handleInputChange('holes_quantity', parseInt(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label>Geometry for Time Calculation (mm)</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.geometry_for_time_calculation}
              onChange={(e) => handleInputChange('geometry_for_time_calculation', parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 mb-2">Cutting Time</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Cutting Time Method</Label>
              <select
                className="w-full border rounded-md px-3 py-2"
                value={formData.cutting_time_method}
                onChange={(e) => handleInputChange('cutting_time_method', e.target.value)}
              >
                <option value="manual">Manual</option>
                <option value="auto">Auto-Calculate</option>
              </select>
            </div>
            <div>
              <Label>Cutting Time (minutes)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.cutting_time_minutes}
                onChange={(e) => handleInputChange('cutting_time_minutes', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>
      </TabsContent>
      
      {/* Tab 4: Pricing */}
      <TabsContent value="pricing" className="space-y-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 className="font-semibold text-yellow-900 mb-2">⚡ Charge Rates</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Charge Rate ($/min)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.charge_rate_per_min}
                onChange={(e) => handleInputChange('charge_rate_per_min', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>Suggested Charge Rate ($/min)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.suggested_charge_rate}
                onChange={(e) => handleInputChange('suggested_charge_rate', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Setup Cost ($)</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.setup_cost}
              onChange={(e) => handleInputChange('setup_cost', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label>Programming Cost ($)</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.programming_cost}
              onChange={(e) => handleInputChange('programming_cost', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label>Laser/Cleaning Cost ($)</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.laser_cleaning_cost}
              onChange={(e) => handleInputChange('laser_cleaning_cost', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label>Delivery Cost ($)</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.delivery_cost}
              onChange={(e) => handleInputChange('delivery_cost', parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
        
        <div>
          <Label>Other Costs ($)</Label>
          <Input
            type="number"
            step="0.01"
            value={formData.other_costs}
            onChange={(e) => handleInputChange('other_costs', parseFloat(e.target.value) || 0)}
          />
        </div>
      </TabsContent>
    </Tabs>
  );

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Quotes</h1>
          <p className="text-slate-600 mt-2">Create and manage customer quotes</p>
        </div>
        <Button 
          className="bg-slate-900 hover:bg-slate-800"
          onClick={() => {
            setFormData(initialFormData);
            setActiveTab('info');
            setCreateDialogOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          New Quote
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Total Quotes</p>
                <p className="text-2xl font-bold mt-1">{stats.totalQuotes}</p>
              </div>
              <FileText className="w-8 h-8 text-slate-400" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Total Value</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(stats.totalValue)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Draft Quotes</p>
                <p className="text-2xl font-bold mt-1">{stats.draft}</p>
              </div>
              <Edit className="w-8 h-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Sent Quotes</p>
                <p className="text-2xl font-bold mt-1">{stats.sent}</p>
              </div>
              <Package className="w-8 h-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search quotes by customer, quote number, or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              className="border rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Status</option>
              <option value="Draft">Draft</option>
              <option value="Sent">Sent</option>
              <option value="Accepted">Accepted</option>
              <option value="Rejected">Rejected</option>
              <option value="Job Created">Job Created</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Quotes Table */}
      <Card>
        <CardHeader>
          <CardTitle>Quotes List</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading quotes...</div>
          ) : filteredQuotes.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No quotes found. Create your first quote to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quote #</TableHead>
                  <TableHead>Item Ref</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Part Description</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Quote Total</TableHead>
                  <TableHead>Net Profit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuotes.map((quote) => (
                  <TableRow key={quote.id}>
                    <TableCell className="font-medium">{quote.quote_number}</TableCell>
                    <TableCell>{quote.item_reference}</TableCell>
                    <TableCell>{quote.customer_name}</TableCell>
                    <TableCell className="max-w-xs truncate">{quote.part_description}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{quote.material_type}</div>
                        <div className="text-slate-500">{quote.thickness} {quote.grade}</div>
                      </div>
                    </TableCell>
                    <TableCell>{quote.quantity_required}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(quote.quote_total)}</TableCell>
                    <TableCell>
                      <span className={quote.net_profit < 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>
                        {formatCurrency(quote.net_profit)}
                        {quote.net_profit < 0 && ' ⚠️'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusBadge(quote.status)}>
                        {quote.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(quote.quote_date)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewQuote(quote)}
                        >
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditQuote(quote)}
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Quote Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Quote</DialogTitle>
            <DialogDescription>
              Enter quote details. Quote Number and Item Reference will be auto-generated.
            </DialogDescription>
          </DialogHeader>
          
          <QuoteFormTabs isEdit={false} />
          
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => {
              setCreateDialogOpen(false);
              setFormData(initialFormData);
              setActiveTab('info');
            }}>
              Cancel
            </Button>
            <Button onClick={handleCreateQuote} className="bg-slate-900 hover:bg-slate-800">
              Create Quote
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Quote Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Quote #{editingQuote?.quote_number}</DialogTitle>
            <DialogDescription>
              Update quote details. All costs will be recalculated automatically.
            </DialogDescription>
          </DialogHeader>
          
          <QuoteFormTabs isEdit={true} />
          
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => {
              setEditDialogOpen(false);
              setFormData(initialFormData);
              setEditingQuote(null);
              setActiveTab('info');
            }}>
              Cancel
            </Button>
            <Button onClick={handleUpdateQuote} className="bg-slate-900 hover:bg-slate-800">
              Update Quote
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Customer Dialog */}
      <Dialog open={addCustomerDialogOpen} onOpenChange={setAddCustomerDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>
              Create a new customer. Customer code will be auto-generated.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Company Name *</Label>
                <Input
                  value={customerFormData.company_name}
                  onChange={(e) => setCustomerFormData({...customerFormData, company_name: e.target.value})}
                  placeholder="Enter company name"
                />
              </div>
              <div>
                <Label>Contact Person</Label>
                <Input
                  value={customerFormData.contact_person}
                  onChange={(e) => setCustomerFormData({...customerFormData, contact_person: e.target.value})}
                  placeholder="Enter contact name"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={customerFormData.email}
                  onChange={(e) => setCustomerFormData({...customerFormData, email: e.target.value})}
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={customerFormData.phone}
                  onChange={(e) => setCustomerFormData({...customerFormData, phone: e.target.value})}
                  placeholder="Phone number"
                />
              </div>
              <div>
                <Label>Mobile</Label>
                <Input
                  value={customerFormData.mobile}
                  onChange={(e) => setCustomerFormData({...customerFormData, mobile: e.target.value})}
                  placeholder="Mobile number"
                />
              </div>
              <div className="col-span-2">
                <Label>Address</Label>
                <Input
                  value={customerFormData.address}
                  onChange={(e) => setCustomerFormData({...customerFormData, address: e.target.value})}
                  placeholder="Street address"
                />
              </div>
              <div>
                <Label>Suburb</Label>
                <Input
                  value={customerFormData.suburb}
                  onChange={(e) => setCustomerFormData({...customerFormData, suburb: e.target.value})}
                  placeholder="Suburb"
                />
              </div>
              <div>
                <Label>State</Label>
                <select
                  className="w-full border rounded-md px-3 py-2"
                  value={customerFormData.state}
                  onChange={(e) => setCustomerFormData({...customerFormData, state: e.target.value})}
                >
                  <option value="">Select state...</option>
                  <option value="NSW">NSW</option>
                  <option value="VIC">VIC</option>
                  <option value="QLD">QLD</option>
                  <option value="SA">SA</option>
                  <option value="WA">WA</option>
                  <option value="TAS">TAS</option>
                  <option value="NT">NT</option>
                  <option value="ACT">ACT</option>
                </select>
              </div>
              <div>
                <Label>Postcode</Label>
                <Input
                  value={customerFormData.postcode}
                  onChange={(e) => setCustomerFormData({...customerFormData, postcode: e.target.value})}
                  placeholder="Postcode"
                />
              </div>
              <div>
                <Label>Payment Terms</Label>
                <Input
                  value={customerFormData.payment_terms}
                  onChange={(e) => setCustomerFormData({...customerFormData, payment_terms: e.target.value})}
                  placeholder="e.g., 30 Days EOM"
                />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={customerFormData.notes}
                  onChange={(e) => setCustomerFormData({...customerFormData, notes: e.target.value})}
                  placeholder="Additional notes..."
                  rows={3}
                />
              </div>
            </div>
          </div>
          
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => {
              setAddCustomerDialogOpen(false);
              setCustomerFormData({
                company_name: '',
                contact_person: '',
                email: '',
                phone: '',
                mobile: '',
                address: '',
                suburb: '',
                state: '',
                postcode: '',
                payment_terms: '30 Days EOM',
                notes: ''
              });
            }}>
              Cancel
            </Button>
            <Button onClick={handleAddCustomer} className="bg-slate-900 hover:bg-slate-800">
              Add Customer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Quote Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Quote Details - #{selectedQuote?.quote_number}</DialogTitle>
          </DialogHeader>
          
          {selectedQuote && (
            <div className="space-y-6">
              {/* Customer Info */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold mb-2">Customer Information</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="font-medium">Customer:</span> {selectedQuote.customer_name}</div>
                  <div><span className="font-medium">Contact:</span> {selectedQuote.contact_person || 'N/A'}</div>
                  <div><span className="font-medium">Quote #:</span> {selectedQuote.quote_number}</div>
                  <div><span className="font-medium">Item Ref:</span> {selectedQuote.item_reference}</div>
                  <div className="col-span-2"><span className="font-medium">Part:</span> {selectedQuote.part_description}</div>
                </div>
              </div>
              
              {/* Material Info */}
              <div className="bg-blue-50 rounded-lg p-4">
                <h3 className="font-semibold mb-2">Material Information</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="font-medium">Type:</span> {selectedQuote.material_type}</div>
                  <div><span className="font-medium">Grade:</span> {selectedQuote.grade}</div>
                  <div><span className="font-medium">Finish:</span> {selectedQuote.finish}</div>
                  <div><span className="font-medium">Thickness:</span> {selectedQuote.thickness}</div>
                  <div><span className="font-medium">Sheet Size:</span> {selectedQuote.sheet_width}×{selectedQuote.sheet_length}mm</div>
                  <div><span className="font-medium">Parts/Sheet:</span> {selectedQuote.parts_per_sheet}</div>
                  <div><span className="font-medium">Buying Cost:</span> {formatCurrency(selectedQuote.buying_cost_per_sheet)}</div>
                  <div><span className="font-medium">Selling Price:</span> {formatCurrency(selectedQuote.selling_price_per_sheet)}</div>
                </div>
              </div>
              
              {/* Geometry Info */}
              <div className="bg-purple-50 rounded-lg p-4">
                <h3 className="font-semibold mb-2">Geometry</h3>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div><span className="font-medium">Part Length:</span> {selectedQuote.part_length || 0} mm</div>
                  <div><span className="font-medium">Part Width:</span> {selectedQuote.part_width || 0} mm</div>
                  <div><span className="font-medium">Perimeter:</span> {selectedQuote.total_perimeter} mm</div>
                </div>
              </div>
              
              {/* Cost Breakdown */}
              <div className="bg-green-50 rounded-lg p-4">
                <h3 className="font-semibold mb-2">Cost Breakdown</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="font-medium">Material Cost/Part:</span> {formatCurrency(selectedQuote.material_cost_per_part)}</div>
                  <div><span className="font-medium">Cutting Cost/Part:</span> {formatCurrency(selectedQuote.cutting_cost_per_part)}</div>
                  <div><span className="font-medium">Fixed Cost/Part:</span> {formatCurrency(selectedQuote.fixed_cost_per_part)}</div>
                  <div><span className="font-medium">Cost/Part (no GST):</span> {formatCurrency(selectedQuote.cost_per_part_no_gst)}</div>
                  <div><span className="font-medium">Total Job Cost:</span> {formatCurrency(selectedQuote.total_job_cost)}</div>
                  <div><span className="font-medium">GST:</span> {formatCurrency(selectedQuote.gst_value)}</div>
                  <div><span className="font-medium">Cost/Part (+ GST):</span> {formatCurrency(selectedQuote.cost_per_part_plus_gst)}</div>
                  <div><span className="font-medium">Quote Total:</span> <span className="text-lg font-bold">{formatCurrency(selectedQuote.quote_total)}</span></div>
                </div>
              </div>
              
              {/* Profit Analysis */}
              <div className={`rounded-lg p-4 ${selectedQuote.net_profit < 0 ? 'bg-red-50 border-2 border-red-300' : 'bg-green-50'}`}>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  Profit Analysis
                  {selectedQuote.net_profit < 0 && (
                    <Badge className="bg-red-500 text-white">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Negative Profit Alert!
                    </Badge>
                  )}
                </h3>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div><span className="font-medium">Net Profit:</span> <span className={selectedQuote.net_profit < 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}>{formatCurrency(selectedQuote.net_profit)}</span></div>
                  <div><span className="font-medium">Gross Profit:</span> {formatCurrency(selectedQuote.gross_profit)}</div>
                  <div><span className="font-medium">Profit %:</span> {selectedQuote.profit_percent}%</div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Quotes;
