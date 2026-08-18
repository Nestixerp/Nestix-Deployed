import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Plus, Search, Edit, Eye, Building2, User, CreditCard, Truck, Settings, Filter, X, MapPin, Trash2, Star } from 'lucide-react';
import api from '../services/api';
import CustomerContacts from '../components/customers/CustomerContacts';

// Constants moved outside to prevent recreation
const customerGroups = ['Wholesale', 'Retail', 'Government', 'Premium', 'Other'];
const statuses = ['Active', 'Inactive', 'On Hold', 'Suspended'];
const pricingTiers = ['Standard', 'Bronze', 'Silver', 'Gold', 'Platinum'];
const paymentTermsOptions = ['Net 7', 'Net 14', 'Net 30', 'Net 60', 'Net 90', 'COD', '7 Days EOM', '14 Days EOM', '30 Days EOM', '60 Days EOM', '90 Days EOM'];
const currencies = ['AUD', 'USD', 'EUR', 'GBP', 'NZD'];
const australianStates = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'];

// Helper function to get credit utilization color
const getCreditUtilizationColor = (utilization) => {
  if (utilization >= 100) return 'text-red-600 font-bold';
  if (utilization >= 90) return 'text-orange-600 font-semibold';
  if (utilization >= 70) return 'text-yellow-600';
  return 'text-green-600';
};

// Helper function to format currency
const formatCurrency = (amount, currency = 'AUD') => {
  const symbol = currency === 'AUD' ? '$' : currency === 'USD' ? '$' : currency;
  return `${symbol}${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// CustomerFormFields component - MOVED OUTSIDE to prevent recreation on every render
const CustomerFormFields = React.memo(({ data, onChange, isEditing = false }) => (
  <Tabs defaultValue="company" className="w-full">
    <TabsList className="grid w-full grid-cols-5">
      <TabsTrigger value="company"><Building2 className="w-4 h-4 mr-2" />Company</TabsTrigger>
      <TabsTrigger value="contact"><User className="w-4 h-4 mr-2" />Contact</TabsTrigger>
      <TabsTrigger value="addresses"><MapPin className="w-4 h-4 mr-2" />Addresses</TabsTrigger>
      <TabsTrigger value="financial"><CreditCard className="w-4 h-4 mr-2" />Financial</TabsTrigger>
      <TabsTrigger value="operations"><Truck className="w-4 h-4 mr-2" />Operations</TabsTrigger>
    </TabsList>

    <TabsContent value="company" className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label>Company Name *</Label>
          <Input
            value={data.company_name}
            onChange={(e) => onChange('company_name', e.target.value)}
            placeholder="Enter company name"
            required
            autoComplete="off"
          />
        </div>
        <div>
          <Label>Trading Name</Label>
          <Input
            value={data.trading_name}
            onChange={(e) => onChange('trading_name', e.target.value)}
            placeholder="If different from company name"
            autoComplete="off"
          />
        </div>
        <div>
          <Label>ABN</Label>
          <Input
            value={data.abn}
            onChange={(e) => onChange('abn', e.target.value)}
            placeholder="12 345 678 901"
            autoComplete="off"
          />
        </div>
        <div className="col-span-2">
          <Label>Manufacturer</Label>
          <Input
            value={data.manufacturer}
            onChange={(e) => onChange('manufacturer', e.target.value)}
            placeholder="Manufacturer name"
            autoComplete="off"
          />
        </div>
        <div>
          <Label>Customer Group *</Label>
          <select
            className="w-full border rounded-md p-2"
            value={data.customer_group}
            onChange={(e) => onChange('customer_group', e.target.value)}
          >
            {customerGroups.map(group => (
              <option key={group} value={group}>{group}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Status *</Label>
          <select
            className="w-full border rounded-md p-2"
            value={data.status}
            onChange={(e) => onChange('status', e.target.value)}
          >
            {statuses.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <Label>Account Manager</Label>
          <Input
            value={data.account_manager}
            onChange={(e) => onChange('account_manager', e.target.value)}
            placeholder="Salesperson name"
            autoComplete="off"
          />
        </div>
      </div>
    </TabsContent>

    <TabsContent value="contact" className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label>Primary Contact Person</Label>
          <Input
            value={data.contact_person}
            onChange={(e) => onChange('contact_person', e.target.value)}
            placeholder="Primary contact name"
            autoComplete="off"
          />
        </div>
        <div>
          <Label>Email</Label>
          <Input
            type="email"
            value={data.email}
            onChange={(e) => onChange('email', e.target.value)}
            placeholder="email@example.com"
            autoComplete="off"
          />
        </div>
        <div>
          <Label>Phone</Label>
          <Input
            value={data.phone}
            onChange={(e) => onChange('phone', e.target.value)}
            placeholder="(03) 1234 5678"
            autoComplete="off"
          />
        </div>
        <div className="col-span-2">
          <Label>Mobile</Label>
          <Input
            value={data.mobile}
            onChange={(e) => onChange('mobile', e.target.value)}
            placeholder="0412 345 678"
            autoComplete="off"
          />
        </div>
        <div className="col-span-2">
          <Label>Address</Label>
          <Input
            value={data.address}
            onChange={(e) => onChange('address', e.target.value)}
            placeholder="Street address"
            autoComplete="off"
          />
        </div>
        <div>
          <Label>Suburb</Label>
          <Input
            value={data.suburb}
            onChange={(e) => onChange('suburb', e.target.value)}
            placeholder="Suburb"
            autoComplete="off"
          />
        </div>
        <div>
          <Label>State</Label>
          <select
            className="w-full border rounded-md p-2"
            value={data.state}
            onChange={(e) => onChange('state', e.target.value)}
          >
            {australianStates.map(state => (
              <option key={state} value={state}>{state}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Postcode</Label>
          <Input
            value={data.postcode}
            onChange={(e) => onChange('postcode', e.target.value)}
            placeholder="3000"
            autoComplete="off"
          />
        </div>
        <div>
          <Label>Country</Label>
          <Input
            value={data.country}
            onChange={(e) => onChange('country', e.target.value)}
            placeholder="Australia"
            autoComplete="off"
          />
        </div>
      </div>
    </TabsContent>


    <TabsContent value="addresses" className="space-y-4 mt-4">
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> Addresses are managed after customer creation. Save the customer first, then manage addresses from the customer view.
        </p>
      </div>
      {data.addresses && data.addresses.length > 0 ? (
        <div className="space-y-3">
          {data.addresses.map((addr, index) => (
            <div key={index} className="border rounded-md p-3 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge className={
                    addr.address_type === 'Billing' ? 'bg-green-100 text-green-800' :
                    addr.address_type === 'Shipping' ? 'bg-blue-100 text-blue-800' :
                    'bg-purple-100 text-purple-800'
                  }>
                    {addr.address_type}
                  </Badge>
                  {addr.is_default && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />}
                  {addr.address_label && <span className="text-sm font-medium">{addr.address_label}</span>}
                </div>
              </div>
              <p className="text-sm text-gray-700">{addr.street_address}</p>
              <p className="text-sm text-gray-600">{addr.suburb}, {addr.state} {addr.postcode}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <MapPin className="w-12 h-12 mx-auto mb-2 text-gray-300" />
          <p>No addresses added yet</p>
          <p className="text-sm">Addresses can be managed after creating the customer</p>
        </div>
      )}
    </TabsContent>

    <TabsContent value="financial" className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Payment Terms *</Label>
          <select
            className="w-full border rounded-md p-2"
            value={data.payment_terms}
            onChange={(e) => onChange('payment_terms', e.target.value)}
          >
            {paymentTermsOptions.map(term => (
              <option key={term} value={term}>{term}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Currency</Label>
          <select
            className="w-full border rounded-md p-2"
            value={data.currency}
            onChange={(e) => onChange('currency', e.target.value)}
          >
            {currencies.map(curr => (
              <option key={curr} value={curr}>{curr}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Credit Limit</Label>
          <Input
            type="number"
            value={data.credit_limit}
            onChange={(e) => onChange('credit_limit', parseFloat(e.target.value) || 0)}
            placeholder="0.00"
            autoComplete="off"
          />
        </div>
        <div className="flex items-center space-x-2 pt-6">
          <input
            type="checkbox"
            id="credit_hold"
            checked={data.credit_hold || false}
            onChange={(e) => onChange('credit_hold', e.target.checked)}
            className="w-4 h-4 text-red-600"
          />
          <Label htmlFor="credit_hold" className="cursor-pointer">
            Credit Hold (Prevent new orders)
          </Label>
        </div>
        <div>
          <Label>Pricing Tier</Label>
          <select
            className="w-full border rounded-md p-2"
            value={data.pricing_tier}
            onChange={(e) => onChange('pricing_tier', e.target.value)}
          >
            {pricingTiers.map(tier => (
              <option key={tier} value={tier}>{tier}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Default Discount %</Label>
          <Input
            type="number"
            value={data.discount_percentage}
            onChange={(e) => onChange('discount_percentage', parseFloat(e.target.value) || 0)}
            placeholder="0.00"
            step="0.01"
            autoComplete="off"
          />
        </div>
        <div className="col-span-2">
          <Label>Terms & Conditions</Label>
          <Textarea
            value={data.terms_conditions}
            onChange={(e) => onChange('terms_conditions', e.target.value)}
            placeholder="Custom terms and conditions for this customer..."
            rows={4}
          />
        </div>
      </div>
    </TabsContent>

    <TabsContent value="operations" className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Default Warehouse</Label>
          <Input
            value={data.default_warehouse}
            onChange={(e) => onChange('default_warehouse', e.target.value)}
            placeholder="Warehouse name or code"
            autoComplete="off"
          />
        </div>
        <div>
          <Label>Shipping Method</Label>
          <Input
            value={data.shipping_method}
            onChange={(e) => onChange('shipping_method', e.target.value)}
            placeholder="Preferred carrier"
            autoComplete="off"
          />
        </div>
        <div className="col-span-2">
          <Label>Delivery Instructions</Label>
          <Textarea
            value={data.delivery_instructions}
            onChange={(e) => onChange('delivery_instructions', e.target.value)}
            placeholder="Special delivery instructions, preferred times, etc..."
            rows={3}
          />
        </div>
        <div className="col-span-2">
          <Label>Internal Notes</Label>
          <Textarea
            value={data.notes}
            onChange={(e) => onChange('notes', e.target.value)}
            placeholder="Internal notes about this customer..."
            rows={4}
          />
        </div>
      </div>
    </TabsContent>
  </Tabs>
));

CustomerFormFields.displayName = 'CustomerFormFields';

const CustomersEnhanced = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAddressDialogOpen, setIsAddressDialogOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  
  // Filters
  const [filterGroup, setFilterGroup] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPricingTier, setFilterPricingTier] = useState('');

  // Address form data
  const [addressFormData, setAddressFormData] = useState({
    address_type: 'Billing',
    address_label: '',
    is_default: false,
    street_address: '',
    suburb: '',
    state: 'VIC',
    postcode: '',
    country: 'Australia',
    contact_person: '',
    phone: '',
    email: '',
    delivery_instructions: ''
  });

  // Ref for Google Places Autocomplete
  const autocompleteInputRef = useRef(null);
  const autocompleteRef = useRef(null);

  // Form data
  const [formData, setFormData] = useState({
    // Company Information
    company_name: '',
    trading_name: '',
    abn: '',
    manufacturer: '', // NEW FIELD
    
    // Primary Contact
    contact_person: '',
    email: '',
    phone: '',
    mobile: '',
    
    // Address
    address: '',
    suburb: '',
    state: 'VIC',
    postcode: '',
    country: 'Australia',
    
    // Multiple Addresses
    addresses: [],
    
    // Business Classification
    customer_group: 'Retail',
    account_manager: '',
    
    // Financial Settings
    payment_terms: 'Net 30',
    credit_limit: 0,
    credit_hold: false,
    currency: 'AUD',
    pricing_tier: 'Standard',
    discount_percentage: 0,
    
    // Operational Settings
    default_warehouse: '',
    delivery_instructions: '',
    shipping_method: '',
    
    // Status & Terms
    status: 'Active',
    terms_conditions: '',
    notes: ''
  });

  useEffect(() => {
    fetchCustomers();
  }, []);

  // Initialize Google Places Autocomplete
  useEffect(() => {
    if (!autocompleteInputRef.current || !window.google) return;

    const autocomplete = new window.google.maps.places.Autocomplete(
      autocompleteInputRef.current,
      {
        types: ['address'],
        componentRestrictions: { country: 'au' }
      }
    );

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      
      if (place && place.address_components) {
        let street = '';
        let suburb = '';
        let state = '';
        let postcode = '';
        let country = 'Australia';
        
        place.address_components.forEach((component) => {
          const types = component.types;
          
          if (types.includes('street_number')) {
            street = component.long_name + ' ';
          }
          if (types.includes('route')) {
            street += component.long_name;
          }
          if (types.includes('locality') || types.includes('postal_town')) {
            suburb = component.long_name;
          }
          if (types.includes('administrative_area_level_1')) {
            state = component.short_name;
          }
          if (types.includes('postal_code')) {
            postcode = component.long_name;
          }
          if (types.includes('country')) {
            country = component.long_name;
          }
        });
        
        setAddressFormData(prev => ({
          ...prev,
          street_address: street.trim(),
          suburb: suburb,
          state: state,
          postcode: postcode,
          country: country
        }));
      }
    });

    autocompleteRef.current = autocomplete;
  }, [isAddressDialogOpen]);


  const fetchCustomers = async () => {
    try {
      setLoading(true);
      // Fetch customers and their financial data
      const [customersResponse, financialsResponse] = await Promise.all([
        api.get('/customers'),
        api.get('/customers/all-financials')
      ]);
      
      // Merge financial data with customers
      const customersWithFinancials = customersResponse.data.map(customer => {
        const financial = financialsResponse.data.find(f => f.id === customer.id);
        return {
          ...customer,
          ...financial
        };
      });
      
      setCustomers(customersWithFinancials);
    } catch (error) {
      console.error('Error fetching customers:', error);
      // Fallback to just customers if financials fail
      try {
        const response = await api.get('/customers');
        setCustomers(response.data);
      } catch (err) {
        console.error('Error fetching customers fallback:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      await api.post('/customers', formData);
      setIsCreateDialogOpen(false);
      resetForm();
      fetchCustomers();
    } catch (error) {
      console.error('Error creating customer:', error);
      alert(error.response?.data?.detail || 'Failed to create customer');
    }
  };

  const handleInputChange = useCallback((field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const handleUpdate = async () => {
    try {
      await api.put(`/customers/${selectedCustomer.id}`, formData);
      setIsEditDialogOpen(false);
      resetForm();
      fetchCustomers();
    } catch (error) {
      console.error('Error updating customer:', error);
      alert(error.response?.data?.detail || 'Failed to update customer');
    }
  };

  const handleView = (customer) => {
    setSelectedCustomer(customer);
    setIsViewDialogOpen(true);
  };

  const handleEdit = (customer) => {
    setSelectedCustomer(customer);
    setFormData({
      company_name: customer.company_name || '',
      trading_name: customer.trading_name || '',
      abn: customer.abn || '',
      manufacturer: customer.manufacturer || '',
      contact_person: customer.contact_person || '',
      email: customer.email || '',
      phone: customer.phone || '',
      mobile: customer.mobile || '',
      address: customer.address || '',
      suburb: customer.suburb || '',
      state: customer.state || 'VIC',
      postcode: customer.postcode || '',
      country: customer.country || 'Australia',
      addresses: customer.addresses || [],
      customer_group: customer.customer_group || 'Retail',
      account_manager: customer.account_manager || '',
      payment_terms: customer.payment_terms || 'Net 30',
      credit_limit: customer.credit_limit || 0,
      credit_hold: customer.credit_hold || false,
      currency: customer.currency || 'AUD',
      pricing_tier: customer.pricing_tier || 'Standard',
      discount_percentage: customer.discount_percentage || 0,
      default_warehouse: customer.default_warehouse || '',
      delivery_instructions: customer.delivery_instructions || '',
      shipping_method: customer.shipping_method || '',
      status: customer.status || 'Active',
      terms_conditions: customer.terms_conditions || '',
      notes: customer.notes || ''
    });
    setIsEditDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      company_name: '',
      trading_name: '',
      abn: '',
      manufacturer: '',
      contact_person: '',
      email: '',
      phone: '',
      mobile: '',
      address: '',
      suburb: '',
      state: 'VIC',
      postcode: '',
      country: 'Australia',
      addresses: [],
      customer_group: 'Retail',
      account_manager: '',
      payment_terms: 'Net 30',
      credit_limit: 0,
      credit_hold: false,
      currency: 'AUD',
      pricing_tier: 'Standard',
      discount_percentage: 0,
      default_warehouse: '',
      delivery_instructions: '',
      shipping_method: '',
      status: 'Active',
      terms_conditions: '',
      notes: ''
    });
    setSelectedCustomer(null);
  };


  // Address Management Handlers
  const handleOpenAddAddressDialog = () => {
    setEditingAddress(null);
    setAddressFormData({
      address_type: 'Billing',
      address_label: '',
      is_default: false,
      street_address: '',
      suburb: '',
      state: 'VIC',
      postcode: '',
      country: 'Australia',
      contact_person: '',
      phone: '',
      email: '',
      delivery_instructions: ''
    });
    setIsAddressDialogOpen(true);
  };

  const handleOpenEditAddressDialog = (address) => {
    setEditingAddress(address);
    setAddressFormData({
      address_type: address.address_type || 'Billing',
      address_label: address.address_label || '',
      is_default: address.is_default || false,
      street_address: address.street_address || '',
      suburb: address.suburb || '',
      state: address.state || 'VIC',
      postcode: address.postcode || '',
      country: address.country || 'Australia',
      contact_person: address.contact_person || '',
      phone: address.phone || '',
      email: address.email || '',
      delivery_instructions: address.delivery_instructions || ''
    });
    setIsAddressDialogOpen(true);
  };

  const handleSaveAddress = async () => {
    try {
      if (!selectedCustomer) return;

      if (editingAddress) {
        // Update existing address
        await api.put(`/customers/${selectedCustomer.id}/addresses/${editingAddress.id}`, addressFormData);
      } else {
        // Add new address
        await api.post(`/customers/${selectedCustomer.id}/addresses`, addressFormData);
      }

      // Refresh customer data
      const response = await api.get(`/customers/${selectedCustomer.id}`);
      setSelectedCustomer(response.data);
      
      // Also refresh the customers list
      fetchCustomers();
      
      setIsAddressDialogOpen(false);
    } catch (error) {
      console.error('Error saving address:', error);
      alert(error.response?.data?.detail || 'Failed to save address');
    }
  };

  const handleDeleteAddress = async (addressId) => {
    if (!window.confirm('Are you sure you want to delete this address?')) return;
    
    try {
      await api.delete(`/customers/${selectedCustomer.id}/addresses/${addressId}`);
      
      // Refresh customer data
      const response = await api.get(`/customers/${selectedCustomer.id}`);
      setSelectedCustomer(response.data);
      fetchCustomers();
    } catch (error) {
      console.error('Error deleting address:', error);
      alert(error.response?.data?.detail || 'Failed to delete address');
    }
  };

  const handleSetDefaultAddress = async (addressId) => {
    try {
      await api.patch(`/customers/${selectedCustomer.id}/addresses/${addressId}/set-default`);
      
      // Refresh customer data
      const response = await api.get(`/customers/${selectedCustomer.id}`);
      setSelectedCustomer(response.data);
      fetchCustomers();
    } catch (error) {
      console.error('Error setting default address:', error);
      alert(error.response?.data?.detail || 'Failed to set default address');
    }
  };

  const handleAddressFormChange = (field, value) => {
    setAddressFormData(prev => ({ ...prev, [field]: value }));
  };

  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = !searchTerm || 
      customer.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.customer_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.contact_person?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.trading_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesGroup = !filterGroup || customer.customer_group === filterGroup;
    const matchesStatus = !filterStatus || customer.status === filterStatus;
    const matchesPricingTier = !filterPricingTier || customer.pricing_tier === filterPricingTier;
    
    return matchesSearch && matchesGroup && matchesStatus && matchesPricingTier;
  });

  const getStatusColor = (status) => {
    switch(status) {
      case 'Active': return 'bg-green-100 text-green-800';
      case 'Inactive': return 'bg-gray-100 text-gray-800';
      case 'On Hold': return 'bg-yellow-100 text-yellow-800';
      case 'Suspended': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTierColor = (tier) => {
    switch(tier) {
      case 'Platinum': return 'bg-purple-100 text-purple-800';
      case 'Gold': return 'bg-yellow-100 text-yellow-800';
      case 'Silver': return 'bg-gray-100 text-gray-800';
      case 'Bronze': return 'bg-orange-100 text-orange-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  const formatCurrency = (amount, currency = 'AUD') => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/4"></div>
          <div className="h-64 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Customer Management</h1>
          <p className="text-slate-600 mt-2">Manage your customer database and relationships</p>
        </div>
        <Button 
          className="bg-slate-900 hover:bg-slate-800"
          onClick={() => {
            resetForm();
            setIsCreateDialogOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          New Customer
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{customers.length}</div>
            <p className="text-xs text-slate-600 mt-1">Total Customers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
              {customers.filter(c => c.status === 'Active').length}
            </div>
            <p className="text-xs text-slate-600 mt-1">Active Customers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-purple-600">
              {customers.filter(c => ['Gold', 'Platinum'].includes(c.pricing_tier)).length}
            </div>
            <p className="text-xs text-slate-600 mt-1">Premium Tier</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(customers.reduce((sum, c) => sum + (c.lifetime_value || 0), 0))}
            </div>
            <p className="text-xs text-slate-600 mt-1">Total Lifetime Value</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Search by company name, code, contact, or email..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button variant="outline">
                <Filter className="w-4 h-4 mr-2" />
                Filters
              </Button>
            </div>
            
            <div className="flex gap-4">
              <div className="flex-1">
                <select
                  className="w-full border rounded-md p-2"
                  value={filterGroup}
                  onChange={(e) => setFilterGroup(e.target.value)}
                >
                  <option value="">All Groups</option>
                  {customerGroups.map(group => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <select
                  className="w-full border rounded-md p-2"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="">All Status</option>
                  {statuses.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <select
                  className="w-full border rounded-md p-2"
                  value={filterPricingTier}
                  onChange={(e) => setFilterPricingTier(e.target.value)}
                >
                  <option value="">All Pricing Tiers</option>
                  {pricingTiers.map(tier => (
                    <option key={tier} value={tier}>{tier}</option>
                  ))}
                </select>
              </div>
              {(filterGroup || filterStatus || filterPricingTier) && (
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setFilterGroup('');
                    setFilterStatus('');
                    setFilterPricingTier('');
                  }}
                >
                  <X className="w-4 h-4 mr-2" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Customers ({filteredCustomers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Company Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>This Month</TableHead>
                  <TableHead>YTD</TableHead>
                  <TableHead>Outstanding</TableHead>
                  <TableHead>Credit Limit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-slate-500">
                      No customers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCustomers.map((customer) => (
                    <TableRow key={customer.id} className="hover:bg-slate-50">
                      <TableCell className="font-mono text-sm">{customer.customer_code}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{customer.company_name}</p>
                          {customer.trading_name && (
                            <p className="text-xs text-slate-500">T/A: {customer.trading_name}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{customer.contact_person || '-'}</p>
                          <p className="text-xs text-slate-500">{customer.email || '-'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{customer.customer_group}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getTierColor(customer.pricing_tier)}>
                          {customer.pricing_tier}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatCurrency(customer.this_month_spend || 0, customer.currency)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatCurrency(customer.ytd_spend || 0, customer.currency)}
                      </TableCell>
                      <TableCell className={`text-sm ${getCreditUtilizationColor(customer.credit_utilization || 0)}`}>
                        {formatCurrency(customer.outstanding_balance || 0, customer.currency)}
                        {customer.credit_utilization >= 70 && (
                          <span className="ml-1 text-xs">({Math.round(customer.credit_utilization)}%)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatCurrency(customer.credit_limit, customer.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(customer.status)}>
                          {customer.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleView(customer)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(customer)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create Customer Dialog */}
      <Dialog 
        open={isCreateDialogOpen} 
        onOpenChange={setIsCreateDialogOpen}
        modal={true}
      >
        <DialogContent 
          className="max-w-3xl max-h-[90vh] overflow-y-auto" 
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Create New Customer</DialogTitle>
            <DialogDescription>
              Add a new customer to your database. Fields marked with * are required.
            </DialogDescription>
          </DialogHeader>
          <CustomerFormFields data={formData} onChange={handleInputChange} />
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsCreateDialogOpen(false);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button onClick={handleCreate}>Create Customer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog 
        open={isEditDialogOpen} 
        onOpenChange={setIsEditDialogOpen}
        modal={true}
      >
        <DialogContent 
          className="max-w-3xl max-h-[90vh] overflow-y-auto" 
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>
              Update customer information. Modified by: {selectedCustomer?.modified_by || 'N/A'}
            </DialogDescription>
          </DialogHeader>
          <CustomerFormFields data={formData} onChange={handleInputChange} isEditing={true} />
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsEditDialogOpen(false);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button onClick={handleUpdate}>Update Customer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Customer Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customer Details</DialogTitle>
            <DialogDescription>
              {selectedCustomer?.customer_code} - {selectedCustomer?.company_name}
            </DialogDescription>
          </DialogHeader>
          {selectedCustomer && (
            <div className="space-y-6">
              {/* Company Info */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center">
                  <Building2 className="w-5 h-5 mr-2" />
                  Company Information
                </h3>
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg">
                  <div>
                    <Label className="text-slate-600">Company Name</Label>
                    <p className="font-medium">{selectedCustomer.company_name}</p>
                  </div>
                  {selectedCustomer.trading_name && (
                    <div>
                      <Label className="text-slate-600">Trading Name</Label>
                      <p className="font-medium">{selectedCustomer.trading_name}</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-slate-600">ABN</Label>
                    <p className="font-medium">{selectedCustomer.abn || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-slate-600">Customer Group</Label>
                    <Badge variant="outline">{selectedCustomer.customer_group}</Badge>
                  </div>
                  <div>
                    <Label className="text-slate-600">Account Manager</Label>
                    <p className="font-medium">{selectedCustomer.account_manager || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-slate-600">Status</Label>
                    <Badge className={getStatusColor(selectedCustomer.status)}>
                      {selectedCustomer.status}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Contact Info */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center">
                  <User className="w-5 h-5 mr-2" />
                  Contact Information
                </h3>
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg">
                  <div>
                    <Label className="text-slate-600">Contact Person</Label>
                    <p className="font-medium">{selectedCustomer.contact_person || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-slate-600">Email</Label>
                    <p className="font-medium">{selectedCustomer.email || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-slate-600">Phone</Label>
                    <p className="font-medium">{selectedCustomer.phone || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-slate-600">Mobile</Label>
                    <p className="font-medium">{selectedCustomer.mobile || '-'}</p>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-slate-600">Address</Label>
                    <p className="font-medium">
                      {selectedCustomer.address && `${selectedCustomer.address}, `}
                      {selectedCustomer.suburb && `${selectedCustomer.suburb} `}
                      {selectedCustomer.state && `${selectedCustomer.state} `}
                      {selectedCustomer.postcode}
                      {selectedCustomer.country && `, ${selectedCustomer.country}`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Financial Info */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center">
                  <CreditCard className="w-5 h-5 mr-2" />
                  Financial Settings
                </h3>
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg">
                  <div>
                    <Label className="text-slate-600">Payment Terms</Label>
                    <p className="font-medium">{selectedCustomer.payment_terms}</p>
                  </div>
                  <div>
                    <Label className="text-slate-600">Currency</Label>
                    <p className="font-medium">{selectedCustomer.currency}</p>
                  </div>
                  <div>
                    <Label className="text-slate-600">Credit Limit</Label>
                    <p className="font-medium">{formatCurrency(selectedCustomer.credit_limit, selectedCustomer.currency)}</p>
                  </div>
                  <div>
                    <Label className="text-slate-600">Credit Hold</Label>
                    <Badge className={selectedCustomer.credit_hold ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}>
                      {selectedCustomer.credit_hold ? 'Yes - Orders Blocked' : 'No'}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-slate-600">Pricing Tier</Label>
                    <Badge className={getTierColor(selectedCustomer.pricing_tier)}>
                      {selectedCustomer.pricing_tier}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-slate-600">Default Discount</Label>
                    <p className="font-medium">{selectedCustomer.discount_percentage}%</p>
                  </div>
                  <div>
                    <Label className="text-slate-600">Outstanding Balance</Label>
                    <p className="font-medium text-red-600">
                      {formatCurrency(selectedCustomer.outstanding_balance || 0, selectedCustomer.currency)}


              {/* Addresses Management */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold flex items-center">
                    <MapPin className="w-5 h-5 mr-2" />
                    Addresses
                  </h3>
                  <Button
                    size="sm"
                    onClick={() => handleOpenAddAddressDialog()}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Address
                  </Button>
                </div>
                {selectedCustomer.addresses && selectedCustomer.addresses.length > 0 ? (
                  <div className="space-y-3">
                    {selectedCustomer.addresses.map((addr) => (
                      <div key={addr.id} className="border rounded-lg p-4 bg-white hover:bg-slate-50">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge className={
                              addr.address_type === 'Billing' ? 'bg-green-100 text-green-800' :
                              addr.address_type === 'Shipping' ? 'bg-blue-100 text-blue-800' :
                              'bg-purple-100 text-purple-800'
                            }>
                              {addr.address_type}
                            </Badge>
                            {addr.is_default && (
                              <Badge className="bg-yellow-100 text-yellow-800">
                                <Star className="w-3 h-3 mr-1 fill-yellow-600" />
                                Default
                              </Badge>
                            )}
                            {addr.address_label && (
                              <span className="text-sm font-medium text-slate-700">{addr.address_label}</span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {!addr.is_default && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSetDefaultAddress(addr.id)}
                              >
                                <Star className="w-3 h-3" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenEditAddressDialog(addr)}
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteAddress(addr.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <Label className="text-slate-600">Street Address</Label>
                            <p className="font-medium">{addr.street_address}</p>
                          </div>
                          <div>
                            <Label className="text-slate-600">Location</Label>
                            <p className="font-medium">{addr.suburb}, {addr.state} {addr.postcode}</p>
                          </div>
                          {addr.contact_person && (
                            <div>
                              <Label className="text-slate-600">Contact</Label>
                              <p className="font-medium">{addr.contact_person}</p>
                            </div>
                          )}
                          {addr.phone && (
                            <div>
                              <Label className="text-slate-600">Phone</Label>
                              <p className="font-medium">{addr.phone}</p>
                            </div>
                          )}
                          {addr.delivery_instructions && (
                            <div className="col-span-2">
                              <Label className="text-slate-600">Delivery Instructions</Label>
                              <p className="text-sm">{addr.delivery_instructions}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-slate-50 rounded-lg">
                    <MapPin className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                    <p className="text-slate-500">No addresses added yet</p>
                    <Button
                      size="sm"
                      onClick={() => handleOpenAddAddressDialog()}
                      className="mt-3"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add First Address
                    </Button>
                  </div>
                )}
              </div>

                    </p>
                  </div>
                </div>
              </div>

              {/* Operational Info */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center">
                  <Truck className="w-5 h-5 mr-2" />
                  Operational Settings
                </h3>
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg">
                  <div>
                    <Label className="text-slate-600">Default Warehouse</Label>
                    <p className="font-medium">{selectedCustomer.default_warehouse || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-slate-600">Shipping Method</Label>
                    <p className="font-medium">{selectedCustomer.shipping_method || '-'}</p>
                  </div>
                  {selectedCustomer.delivery_instructions && (
                    <div className="col-span-2">
                      <Label className="text-slate-600">Delivery Instructions</Label>
                      <p className="font-medium">{selectedCustomer.delivery_instructions}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              {(selectedCustomer.terms_conditions || selectedCustomer.notes) && (
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center">
                    <Settings className="w-5 h-5 mr-2" />
                    Additional Information
                  </h3>
                  <div className="space-y-4 bg-slate-50 p-4 rounded-lg">
                    {selectedCustomer.terms_conditions && (
                      <div>
                        <Label className="text-slate-600">Terms & Conditions</Label>
                        <p className="font-medium whitespace-pre-wrap">{selectedCustomer.terms_conditions}</p>
                      </div>
                    )}
                    {selectedCustomer.notes && (
                      <div>
                        <Label className="text-slate-600">Internal Notes</Label>
                        <p className="font-medium whitespace-pre-wrap">{selectedCustomer.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Customer Contacts Section */}
              <div className="border-t pt-4">
                <CustomerContacts customerId={selectedCustomer.id} />
              </div>

              {/* Audit Trail */}
              <div className="border-t pt-4">
                <div className="grid grid-cols-2 gap-4 text-sm text-slate-600">
                  <div>
                    <Label className="text-slate-500">Created By</Label>
                    <p>{selectedCustomer.created_by || '-'} on {new Date(selectedCustomer.created_at).toLocaleDateString('en-AU')}</p>
                  </div>
                  <div>
                    <Label className="text-slate-500">Last Modified By</Label>
                    <p>{selectedCustomer.modified_by || '-'} on {new Date(selectedCustomer.updated_at).toLocaleDateString('en-AU')}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => {
              setIsViewDialogOpen(false);
              handleEdit(selectedCustomer);
            }}>
              <Edit className="w-4 h-4 mr-2" />
              Edit Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Add/Edit Address Dialog */}
      <Dialog open={isAddressDialogOpen} onOpenChange={setIsAddressDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingAddress ? 'Edit Address' : 'Add New Address'}</DialogTitle>
            <DialogDescription>
              {editingAddress ? 'Update the address details below' : 'Add a new address for this customer'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Address Type *</Label>
                <select
                  className="w-full border rounded-md p-2"
                  value={addressFormData.address_type}
                  onChange={(e) => handleAddressFormChange('address_type', e.target.value)}
                >
                  <option value="Billing">Billing</option>
                  <option value="Shipping">Shipping</option>
                  <option value="Site">Site</option>
                </select>
              </div>
              <div>
                <Label>Address Label</Label>
                <Input
                  value={addressFormData.address_label}
                  onChange={(e) => handleAddressFormChange('address_label', e.target.value)}
                  placeholder="e.g., Head Office, Factory 1"
                />
              </div>
              <div className="col-span-2">
                <Label>Street Address *</Label>
                <Input
                  ref={autocompleteInputRef}
                  value={addressFormData.street_address}
                  onChange={(e) => handleAddressFormChange('street_address', e.target.value)}
                  placeholder="Start typing address..."
                  required
                />
              </div>
              <div>
                <Label>Suburb</Label>
                <Input
                  value={addressFormData.suburb}
                  onChange={(e) => handleAddressFormChange('suburb', e.target.value)}
                  placeholder="Melbourne"
                />
              </div>
              <div>
                <Label>State</Label>
                <select
                  className="w-full border rounded-md p-2"
                  value={addressFormData.state}
                  onChange={(e) => handleAddressFormChange('state', e.target.value)}
                >
                  {australianStates.map(state => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Postcode</Label>
                <Input
                  value={addressFormData.postcode}
                  onChange={(e) => handleAddressFormChange('postcode', e.target.value)}
                  placeholder="3000"
                />
              </div>
              <div>
                <Label>Country</Label>
                <Input
                  value={addressFormData.country}
                  onChange={(e) => handleAddressFormChange('country', e.target.value)}
                  placeholder="Australia"
                />
              </div>
              <div>
                <Label>Contact Person</Label>
                <Input
                  value={addressFormData.contact_person}
                  onChange={(e) => handleAddressFormChange('contact_person', e.target.value)}
                  placeholder="Contact at this address"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={addressFormData.phone}
                  onChange={(e) => handleAddressFormChange('phone', e.target.value)}
                  placeholder="(03) 1234 5678"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={addressFormData.email}
                  onChange={(e) => handleAddressFormChange('email', e.target.value)}
                  placeholder="email@example.com"
                />
              </div>
              <div className="col-span-2 flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_default"
                  checked={addressFormData.is_default}
                  onChange={(e) => handleAddressFormChange('is_default', e.target.checked)}
                  className="w-4 h-4"
                />
                <Label htmlFor="is_default" className="cursor-pointer">
                  Set as default address for this type
                </Label>
              </div>
              <div className="col-span-2">
                <Label>Delivery Instructions</Label>
                <Textarea
                  value={addressFormData.delivery_instructions}
                  onChange={(e) => handleAddressFormChange('delivery_instructions', e.target.value)}
                  placeholder="Special delivery instructions for this address..."
                  rows={3}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddressDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAddress}>
              {editingAddress ? 'Update Address' : 'Add Address'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default CustomersEnhanced;
