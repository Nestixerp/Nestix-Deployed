import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Plus, Search, Edit, Users, Building2, Mail, Phone, MapPin, TrendingUp, FileText, Loader2, UserPlus, UserMinus } from 'lucide-react';
import { toast } from '../hooks/use-toast';
import api from '../services/api';

const CATEGORIES = [
  'Material',
  'Outsourced Process',
  'Freight',
  'Consumables',
  'Maintenance',
  'Other'
];

const STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'];

const PAYMENT_TERMS = [
  '7 Days',
  '14 Days',
  '30 Days',
  '30 Days EOM',
  'Net 30 Days from EOM',
  '60 Days EOM',
  'COD',
  'On Delivery',
  'Custom'
];

// Supplier Form Dialog Component (moved outside to access constants)
const SupplierFormDialog = ({ open, onOpenChange, supplierForm, setSupplierForm, onSave, title, description, showSupplierCode = false }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          {showSupplierCode && (
            <div><Label>Supplier Code *</Label><Input value={supplierForm.supplier_code || ''} onChange={(e) => setSupplierForm({...supplierForm, supplier_code: e.target.value})} placeholder="SUP-0001" /></div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Company Name *</Label><Input value={supplierForm.company_name} onChange={(e) => setSupplierForm({...supplierForm, company_name: e.target.value})} placeholder="Company name" /></div>
            <div><Label>Category *</Label><Select value={supplierForm.category} onValueChange={(value) => setSupplierForm({...supplierForm, category: value})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>ABN</Label><Input value={supplierForm.abn} onChange={(e) => setSupplierForm({...supplierForm, abn: e.target.value})} placeholder="ABN" /></div>
            <div><Label>Payment Terms</Label><Select value={supplierForm.payment_terms} onValueChange={(value) => setSupplierForm({...supplierForm, payment_terms: value})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_TERMS.map(term => <SelectItem key={term} value={term}>{term}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div><Label>Address</Label><Input value={supplierForm.address} onChange={(e) => setSupplierForm({...supplierForm, address: e.target.value})} placeholder="Street address" /></div>
          <div className="grid grid-cols-3 gap-4">
            <div><Label>Suburb</Label><Input value={supplierForm.suburb} onChange={(e) => setSupplierForm({...supplierForm, suburb: e.target.value})} placeholder="Suburb" /></div>
            <div><Label>State</Label><Select value={supplierForm.state} onValueChange={(value) => setSupplierForm({...supplierForm, state: value})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATES.map(state => <SelectItem key={state} value={state}>{state}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Postcode</Label><Input value={supplierForm.postcode} onChange={(e) => setSupplierForm({...supplierForm, postcode: e.target.value})} placeholder="Postcode" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Phone</Label><Input type="tel" value={supplierForm.phone} onChange={(e) => setSupplierForm({...supplierForm, phone: e.target.value})} placeholder="Phone number" /></div>
            <div><Label>Email</Label><Input type="email" value={supplierForm.email} onChange={(e) => setSupplierForm({...supplierForm, email: e.target.value})} placeholder="email@example.com" /></div>
          </div>
          <div><Label>Website</Label><Input value={supplierForm.website} onChange={(e) => setSupplierForm({...supplierForm, website: e.target.value})} placeholder="https://www.example.com" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>ISO Certified</Label><Select value={supplierForm.iso_certified ? 'true' : 'false'} onValueChange={(value) => setSupplierForm({...supplierForm, iso_certified: value === 'true'})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="false">No</SelectItem><SelectItem value="true">Yes</SelectItem></SelectContent></Select></div>
            <div><Label>Status</Label><Select value={supplierForm.status} onValueChange={(value) => setSupplierForm({...supplierForm, status: value})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Active">Active</SelectItem><SelectItem value="Inactive">Inactive</SelectItem></SelectContent></Select></div>
          </div>
          <div><Label>Notes</Label><Textarea value={supplierForm.notes} onChange={(e) => setSupplierForm({...supplierForm, notes: e.target.value})} placeholder="Additional notes about this supplier" rows={4} /></div>
          <div className="flex gap-2 pt-4"><Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button><Button className="flex-1 bg-slate-900 hover:bg-slate-800" onClick={onSave}>{title.includes('Edit') ? 'Update' : 'Add'} Supplier</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Suppliers = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isContactDialogOpen, setIsContactDialogOpen] = useState(false);
  const [isEditContactDialogOpen, setIsEditContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  
  // Filters
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Form state
  const [supplierForm, setSupplierForm] = useState({
    company_name: '',
    category: 'Material',
    abn: '',
    address: '',
    suburb: '',
    state: 'VIC',
    postcode: '',
    phone: '',
    email: '',
    website: '',
    payment_terms: '30 Days EOM',
    iso_certified: false,
    insurance_expiry: '',
    status: 'Active',
    notes: ''
  });

  // Contact form state
  const [contactForm, setContactForm] = useState({
    name: '',
    position: '',
    email: '',
    phone: '',
    status: 'Active',
    notes: ''
  });

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/suppliers');
      console.log('Suppliers fetched successfully:', response.data);
      setSuppliers(response.data);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      console.error('Error details:', error.response?.data);
      console.error('Error status:', error.response?.status);
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to load suppliers';
      toast({ title: 'Error', description: errorMsg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const fetchContacts = async (supplierId) => {
    try {
      setLoadingContacts(true);
      const response = await api.get(`/suppliers/${supplierId}/contacts`);
      setContacts(response.data);
    } catch (error) {
      console.error('Error fetching contacts:', error);
      toast({ title: 'Error', description: 'Failed to load contacts', variant: 'destructive' });
    } finally {
      setLoadingContacts(false);
    }
  };

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(supplier => {
      const matchesSearch = supplier.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           supplier.supplier_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (supplier.email && supplier.email.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory = filterCategory === 'all' || supplier.category === filterCategory;
      const matchesStatus = filterStatus === 'all' || supplier.status === filterStatus;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [suppliers, searchTerm, filterCategory, filterStatus]);

  const handleAddSupplier = async () => {
    try {
      if (!supplierForm.company_name || !supplierForm.category) {
        toast({ title: 'Validation Error', description: 'Company name and category are required', variant: 'destructive' });
        return;
      }
      console.log('Adding supplier with data:', supplierForm);
      const response = await api.post('/suppliers', supplierForm);
      console.log('Supplier added successfully:', response.data);
      toast({ title: 'Success', description: 'Supplier added successfully' });
      setIsAddDialogOpen(false);
      resetForm();
      await fetchSuppliers();
    } catch (error) {
      console.error('Error adding supplier:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      // Handle validation errors properly
      let errorMessage = 'Failed to add supplier';
      if (error.response?.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          errorMessage = error.response.data.detail.map(err => err.msg || JSON.stringify(err)).join(', ');
        } else if (typeof error.response.data.detail === 'string') {
          errorMessage = error.response.data.detail;
        }
      }
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    }
  };

  const handleEditSupplier = async () => {
    try {
      if (!supplierForm.company_name || !supplierForm.category) {
        toast({ title: 'Validation Error', description: 'Company name and category are required', variant: 'destructive' });
        return;
      }
      await api.put(`/suppliers/${selectedSupplier.id}`, supplierForm);
      toast({ title: 'Success', description: 'Supplier updated successfully' });
      setIsEditDialogOpen(false);
      resetForm();
      await fetchSuppliers();
    } catch (error) {
      console.error('Error updating supplier:', error);
      // Handle validation errors properly
      let errorMessage = 'Failed to update supplier';
      if (error.response?.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          errorMessage = error.response.data.detail.map(err => err.msg || JSON.stringify(err)).join(', ');
        } else if (typeof error.response.data.detail === 'string') {
          errorMessage = error.response.data.detail;
        }
      }
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    }
  };

  const handleAddContact = async () => {
    try {
      if (!contactForm.name) {
        toast({ title: 'Validation Error', description: 'Contact name is required', variant: 'destructive' });
        return;
      }
      await api.post(`/suppliers/${selectedSupplier.id}/contacts`, { ...contactForm, supplier_id: selectedSupplier.id });
      toast({ title: 'Success', description: 'Contact added successfully' });
      setIsContactDialogOpen(false);
      resetContactForm();
      await fetchContacts(selectedSupplier.id);
    } catch (error) {
      console.error('Error adding contact:', error);
      toast({ title: 'Error', description: error.response?.data?.detail || 'Failed to add contact', variant: 'destructive' });
    }
  };

  const handleEditContact = (contact) => {
    setEditingContact(contact);
    setContactForm({
      name: contact.name,
      position: contact.position || '',
      email: contact.email || '',
      phone: contact.phone || '',
      status: contact.status,
      notes: contact.notes || ''
    });
    setIsEditContactDialogOpen(true);
  };

  const handleUpdateContact = async () => {
    try {
      if (!contactForm.name) {
        toast({ title: 'Validation Error', description: 'Contact name is required', variant: 'destructive' });
        return;
      }
      await api.put(`/suppliers/contacts/${editingContact.id}`, contactForm);
      toast({ title: 'Success', description: 'Contact updated successfully' });
      setIsEditContactDialogOpen(false);
      resetContactForm();
      setEditingContact(null);
      await fetchContacts(selectedSupplier.id);
    } catch (error) {
      console.error('Error updating contact:', error);
      toast({ title: 'Error', description: error.response?.data?.detail || 'Failed to update contact', variant: 'destructive' });
    }
  };

  const handleToggleContactStatus = async (contactId, currentStatus) => {
    try {
      const newStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
      await api.put(`/suppliers/contacts/${contactId}`, { status: newStatus });
      toast({ title: 'Success', description: `Contact marked as ${newStatus}` });
      await fetchContacts(selectedSupplier.id);
    } catch (error) {
      console.error('Error updating contact:', error);
      toast({ title: 'Error', description: 'Failed to update contact', variant: 'destructive' });
    }
  };

  const openEditDialog = (supplier) => {
    setSelectedSupplier(supplier);
    setSupplierForm({
      supplier_code: supplier.supplier_code,
      company_name: supplier.company_name,
      category: supplier.category,
      abn: supplier.abn || '',
      address: supplier.address || '',
      suburb: supplier.suburb || '',
      state: supplier.state || 'VIC',
      postcode: supplier.postcode || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      website: supplier.website || '',
      payment_terms: supplier.payment_terms || '30 Days EOM',
      iso_certified: supplier.iso_certified || false,
      status: supplier.status || 'Active',
      notes: supplier.notes || ''
    });
    setIsEditDialogOpen(true);
  };

  const openDetailDialog = async (supplier) => {
    setSelectedSupplier(supplier);
    setIsDetailDialogOpen(true);
    await fetchContacts(supplier.id);
  };

  const resetForm = () => {
    setSupplierForm({
      company_name: '',
      category: 'Material',
      abn: '',
      address: '',
      suburb: '',
      state: 'VIC',
      postcode: '',
      phone: '',
      email: '',
      website: '',
      payment_terms: '30 Days EOM',
      iso_certified: false,
      insurance_expiry: '',
      status: 'Active',
      notes: ''
    });
  };

  const resetContactForm = () => {
    setContactForm({
      name: '',
      position: '',
      email: '',
      phone: '',
      status: 'Active',
      notes: ''
    });
  };

  const getPerformanceColor = (rating) => {
    switch(rating) {
      case 'Excellent': return 'bg-green-100 text-green-800';
      case 'Good': return 'bg-blue-100 text-blue-800';
      case 'Needs Improvement': return 'bg-orange-100 text-orange-800';
      case 'Poor': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Suppliers</h1>
          <p className="text-slate-600 mt-2">Manage your supplier relationships and performance</p>
        </div>
        <Button className="bg-slate-900 hover:bg-slate-800" onClick={() => { resetForm(); setIsAddDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Add Supplier
        </Button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-slate-600">Total Suppliers</p><h3 className="text-2xl font-bold text-slate-900 mt-2">{suppliers.length}</h3></div><div className="bg-blue-500 p-3 rounded-lg"><Building2 className="w-6 h-6 text-white" /></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-slate-600">Active Suppliers</p><h3 className="text-2xl font-bold text-slate-900 mt-2">{suppliers.filter(s => s.status === 'Active').length}</h3></div><div className="bg-green-500 p-3 rounded-lg"><Users className="w-6 h-6 text-white" /></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-slate-600">Categories</p><h3 className="text-2xl font-bold text-slate-900 mt-2">{new Set(suppliers.map(s => s.category)).size}</h3></div><div className="bg-purple-500 p-3 rounded-lg"><FileText className="w-6 h-6 text-white" /></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-slate-600">FY Spend</p><h3 className="text-2xl font-bold text-slate-900 mt-2">${suppliers.reduce((sum, s) => sum + s.fy_spend, 0).toLocaleString()}</h3></div><div className="bg-orange-500 p-3 rounded-lg"><TrendingUp className="w-6 h-6 text-white" /></div></div></CardContent></Card>
      </div>

      {/* Filters */}
      <Card className="mb-6"><CardHeader><div className="flex items-center justify-between"><CardTitle className="text-base">Filter Suppliers</CardTitle><Button variant="ghost" size="sm" onClick={() => { setFilterCategory('all'); setFilterStatus('all'); setSearchTerm(''); }}>Clear Filters</Button></div></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="relative"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" /><Input placeholder="Search by name, code, or email..." className="pl-10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
            <Select value={filterCategory} onValueChange={setFilterCategory}><SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger><SelectContent><SelectItem value="all">All Categories</SelectItem>{CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}</SelectContent></Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="Active">Active</SelectItem><SelectItem value="Inactive">Inactive</SelectItem></SelectContent></Select>
          </div>
        </CardContent>
      </Card>

      {/* Suppliers Table */}
      <Card><CardHeader><CardTitle>Supplier List ({filteredSuppliers.length} suppliers)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Supplier Code</TableHead><TableHead>Company Name</TableHead><TableHead>Category</TableHead><TableHead>Contact</TableHead><TableHead>Location</TableHead><TableHead>On-Time %</TableHead><TableHead>FY Spend</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {filteredSuppliers.map((supplier) => (
                <TableRow key={supplier.id} className="cursor-pointer hover:bg-slate-50">
                  <TableCell className="font-mono text-sm">{supplier.supplier_code}</TableCell>
                  <TableCell className="font-medium">{supplier.company_name}</TableCell>
                  <TableCell><span className="inline-block px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">{supplier.category}</span></TableCell>
                  <TableCell><div className="text-sm">{supplier.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{supplier.phone}</div>}{supplier.email && <div className="flex items-center gap-1"><Mail className="w-3 h-3" />{supplier.email}</div>}</div></TableCell>
                  <TableCell className="text-sm">{supplier.suburb && supplier.state ? `${supplier.suburb}, ${supplier.state}` : '-'}</TableCell>
                  <TableCell><div className="flex items-center gap-2"><span className="font-semibold">{supplier.on_time_delivery}%</span><span className={`px-2 py-1 text-xs rounded-full ${getPerformanceColor(supplier.performance_rating)}`}>{supplier.performance_rating}</span></div></TableCell>
                  <TableCell className="font-medium">${supplier.fy_spend.toLocaleString()}</TableCell>
                  <TableCell><span className={`inline-block px-2 py-1 text-xs rounded-full ${supplier.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{supplier.status}</span></TableCell>
                  <TableCell><div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => openEditDialog(supplier)} title="Edit Supplier"><Edit className="w-4 h-4 text-blue-600" /></Button><Button variant="ghost" size="sm" onClick={() => openDetailDialog(supplier)} title="View Details"><Users className="w-4 h-4 text-green-600" /></Button></div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Supplier Dialog - Moved to separate component below due to length */}
      <SupplierFormDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        supplierForm={supplierForm}
        setSupplierForm={setSupplierForm}
        onSave={handleAddSupplier}
        title="Add New Supplier"
        description="Add a new supplier to your system"
      />

      <SupplierFormDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        supplierForm={supplierForm}
        setSupplierForm={setSupplierForm}
        onSave={handleEditSupplier}
        title="Edit Supplier"
        description="Update supplier information"
        showSupplierCode={true}
      />

      {/* Supplier Detail Dialog with Contacts */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Supplier Details - {selectedSupplier?.company_name}</DialogTitle>
            <DialogDescription>View supplier information and manage contacts</DialogDescription>
          </DialogHeader>
          {selectedSupplier && (
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="details">Details</TabsTrigger><TabsTrigger value="contacts">Contacts ({contacts.length})</TabsTrigger><TabsTrigger value="performance">Performance</TabsTrigger></TabsList>
              <TabsContent value="details" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-6">
                  <Card><CardHeader><CardTitle className="text-base">Company Information</CardTitle></CardHeader><CardContent className="space-y-3"><div><Label className="text-xs text-slate-600">Supplier Code</Label><p className="font-mono font-medium">{selectedSupplier.supplier_code}</p></div><div><Label className="text-xs text-slate-600">Company Name</Label><p className="font-medium">{selectedSupplier.company_name}</p></div><div><Label className="text-xs text-slate-600">Category</Label><p className="font-medium">{selectedSupplier.category}</p></div><div><Label className="text-xs text-slate-600">ABN</Label><p className="font-medium">{selectedSupplier.abn || '-'}</p></div><div><Label className="text-xs text-slate-600">Payment Terms</Label><p className="font-medium">{selectedSupplier.payment_terms}</p></div><div><Label className="text-xs text-slate-600">ISO Certified</Label><p className="font-medium">{selectedSupplier.iso_certified ? 'Yes' : 'No'}</p></div></CardContent></Card>
                  <Card><CardHeader><CardTitle className="text-base">Contact Information</CardTitle></CardHeader><CardContent className="space-y-3"><div><Label className="text-xs text-slate-600">Address</Label><p className="font-medium">{selectedSupplier.address || '-'}</p><p className="text-sm">{selectedSupplier.suburb && selectedSupplier.state ? `${selectedSupplier.suburb}, ${selectedSupplier.state} ${selectedSupplier.postcode}` : ''}</p></div><div><Label className="text-xs text-slate-600">Phone</Label><p className="font-medium">{selectedSupplier.phone || '-'}</p></div><div><Label className="text-xs text-slate-600">Email</Label><p className="font-medium">{selectedSupplier.email || '-'}</p></div><div><Label className="text-xs text-slate-600">Website</Label><p className="font-medium">{selectedSupplier.website || '-'}</p></div></CardContent></Card>
                </div>
                {selectedSupplier.notes && (<Card><CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader><CardContent><p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedSupplier.notes}</p></CardContent></Card>)}
              </TabsContent>
              <TabsContent value="contacts" className="mt-4">
                <div className="mb-4 flex justify-end"><Button onClick={() => { resetContactForm(); setIsContactDialogOpen(true); }} size="sm"><UserPlus className="w-4 h-4 mr-2" />Add Contact</Button></div>
                <Card>
                  <CardContent className="pt-4">
                    {loadingContacts ? (<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>) : contacts.length === 0 ? (<p className="text-center text-slate-500 py-8">No contacts added yet</p>) : (
                      <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Position</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {contacts.map((contact) => (<TableRow key={contact.id}><TableCell className="font-medium">{contact.name}</TableCell><TableCell>{contact.position || '-'}</TableCell><TableCell>{contact.email || '-'}</TableCell><TableCell>{contact.phone || '-'}</TableCell><TableCell><span className={`inline-block px-2 py-1 text-xs rounded-full ${contact.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{contact.status}</span></TableCell><TableCell><div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => handleEditContact(contact)} title="Edit Contact"><Edit className="w-4 h-4 text-blue-600" /></Button><Button variant="ghost" size="sm" onClick={() => handleToggleContactStatus(contact.id, contact.status)} title={contact.status === 'Active' ? 'Deactivate' : 'Activate'}>{contact.status === 'Active' ? <UserMinus className="w-4 h-4 text-red-600" /> : <UserPlus className="w-4 h-4 text-green-600" />}</Button></div></TableCell></TableRow>))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="performance" className="mt-4">
                <div className="grid grid-cols-2 gap-6">
                  <Card><CardHeader><CardTitle className="text-base">Delivery Performance</CardTitle></CardHeader><CardContent className="space-y-3"><div><Label className="text-xs text-slate-600">On-Time Delivery %</Label><p className="text-2xl font-bold text-slate-900">{selectedSupplier.on_time_delivery}%</p></div><div><Label className="text-xs text-slate-600">Average Days Late</Label><p className="text-lg font-semibold">{selectedSupplier.average_days_late} days</p></div><div><Label className="text-xs text-slate-600">Performance Rating</Label><span className={`inline-block px-3 py-1 text-sm rounded-full ${getPerformanceColor(selectedSupplier.performance_rating)}`}>{selectedSupplier.performance_rating}</span></div></CardContent></Card>
                  <Card><CardHeader><CardTitle className="text-base">Order Statistics</CardTitle></CardHeader><CardContent className="space-y-3"><div><Label className="text-xs text-slate-600">Total POs</Label><p className="text-2xl font-bold text-slate-900">{selectedSupplier.total_pos}</p></div><div><Label className="text-xs text-slate-600">Total Received</Label><p className="text-lg font-semibold">{selectedSupplier.total_received}</p></div><div><Label className="text-xs text-slate-600">NCR Count</Label><p className="text-lg font-semibold text-red-600">{selectedSupplier.ncr_count}</p></div></CardContent></Card>
                </div>
                <div className="grid grid-cols-2 gap-6 mt-6">
                  <Card><CardHeader><CardTitle className="text-base">Financial Summary</CardTitle></CardHeader><CardContent className="space-y-3"><div><Label className="text-xs text-slate-600">FY Spend</Label><p className="text-2xl font-bold text-green-600">${selectedSupplier.fy_spend.toLocaleString()}</p></div><div><Label className="text-xs text-slate-600">Lifetime Spend</Label><p className="text-lg font-semibold">${selectedSupplier.lifetime_spend.toLocaleString()}</p></div></CardContent></Card>
                  <Card><CardHeader><CardTitle className="text-base">Status</CardTitle></CardHeader><CardContent className="space-y-3"><div><Label className="text-xs text-slate-600">Current Status</Label><span className={`inline-block px-3 py-1 text-sm rounded-full ${selectedSupplier.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{selectedSupplier.status}</span></div><div><Label className="text-xs text-slate-600">ISO Certified</Label><p className="font-medium">{selectedSupplier.iso_certified ? 'Yes' : 'No'}</p></div></CardContent></Card>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Contact Dialog */}
      <Dialog open={isContactDialogOpen} onOpenChange={setIsContactDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Contact</DialogTitle><DialogDescription>Add a new contact for {selectedSupplier?.company_name}</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={contactForm.name} onChange={(e) => setContactForm({...contactForm, name: e.target.value})} placeholder="Contact name" /></div>
            <div><Label>Position</Label><Input value={contactForm.position} onChange={(e) => setContactForm({...contactForm, position: e.target.value})} placeholder="e.g., Sales Manager" /></div>
            <div><Label>Email</Label><Input type="email" value={contactForm.email} onChange={(e) => setContactForm({...contactForm, email: e.target.value})} placeholder="email@example.com" /></div>
            <div><Label>Phone</Label><Input type="tel" value={contactForm.phone} onChange={(e) => setContactForm({...contactForm, phone: e.target.value})} placeholder="Phone number" /></div>
            <div><Label>Notes</Label><Textarea value={contactForm.notes} onChange={(e) => setContactForm({...contactForm, notes: e.target.value})} placeholder="Additional notes" rows={3} /></div>
            <div className="flex gap-2 pt-4"><Button variant="outline" className="flex-1" onClick={() => setIsContactDialogOpen(false)}>Cancel</Button><Button className="flex-1 bg-slate-900 hover:bg-slate-800" onClick={handleAddContact}>Add Contact</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Contact Dialog */}
      <Dialog open={isEditContactDialogOpen} onOpenChange={setIsEditContactDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Contact</DialogTitle><DialogDescription>Update contact information for {selectedSupplier?.company_name}</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={contactForm.name} onChange={(e) => setContactForm({...contactForm, name: e.target.value})} placeholder="Contact name" /></div>
            <div><Label>Position</Label><Input value={contactForm.position} onChange={(e) => setContactForm({...contactForm, position: e.target.value})} placeholder="e.g., Sales Manager" /></div>
            <div><Label>Email</Label><Input type="email" value={contactForm.email} onChange={(e) => setContactForm({...contactForm, email: e.target.value})} placeholder="email@example.com" /></div>
            <div><Label>Phone</Label><Input type="tel" value={contactForm.phone} onChange={(e) => setContactForm({...contactForm, phone: e.target.value})} placeholder="Phone number" /></div>
            <div><Label>Status</Label><Select value={contactForm.status} onValueChange={(value) => setContactForm({...contactForm, status: value})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Active">Active</SelectItem><SelectItem value="Inactive">Inactive</SelectItem></SelectContent></Select></div>
            <div><Label>Notes</Label><Textarea value={contactForm.notes} onChange={(e) => setContactForm({...contactForm, notes: e.target.value})} placeholder="Additional notes" rows={3} /></div>
            <div className="flex gap-2 pt-4"><Button variant="outline" className="flex-1" onClick={() => setIsEditContactDialogOpen(false)}>Cancel</Button><Button className="flex-1 bg-slate-900 hover:bg-slate-800" onClick={handleUpdateContact}>Update Contact</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Suppliers;