import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Plus, Search, FileText, Printer, Mail, DollarSign, Filter, Eye, Trash2, AlertCircle, Edit } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const Invoices = () => {
  const { currentUser } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [poSearch, setPOSearch] = useState('');
  const [descriptionSearch, setDescriptionSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState(null);

  // Edit-line-items state (in View Invoice modal)
  const [editingPrices, setEditingPrices] = useState(false);
  const [editLineItems, setEditLineItems] = useState([]);
  const [savingPrices, setSavingPrices] = useState(false);
  
  // Create invoice states
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [poNumber, setPONumber] = useState('');
  const [packingSlips, setPackingSlips] = useState([]);
  const [selectedPSIds, setSelectedPSIds] = useState([]);
  const [paymentTerms, setPaymentTerms] = useState('');
  const [availableJobs, setAvailableJobs] = useState([]);
  const [showJobList, setShowJobList] = useState(true);
  
  // Payment form
  const [paymentForm, setPaymentForm] = useState({
    payment_amount: 0,
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'Bank Transfer',
    payment_reference: ''
  });

  useEffect(() => {
    fetchInvoices();
    fetchCustomers();
  }, []);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchTerm) params.append('customer', searchTerm);
      if (poSearch) params.append('po_number', poSearch);
      if (descriptionSearch) params.append('description', descriptionSearch);
      if (statusFilter) params.append('status_filter', statusFilter);
      
      const response = await api.get(`/invoices?${params.toString()}`);
      setInvoices(response.data);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      alert('Failed to fetch invoices');
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
    }
  };

  const handleSearchPackingSlips = async () => {
    if (!poNumber) {
      alert('Please enter a PO Number');
      return;
    }
    
    try {
      const response = await api.get(`/packing-slips/by-po?po_number=${poNumber}`);
      const psList = response.data;
      
      if (psList.length === 0) {
        alert('No completed packing slips found for this PO number');
        return;
      }
      
      // Filter out already invoiced packing slips
      const uninvoiced = psList.filter(ps => !ps.is_invoiced);
      
      if (uninvoiced.length === 0) {
        alert('All packing slips for this PO have already been invoiced');
        return;
      }
      
      setPackingSlips(uninvoiced);
      
      // Get customer info from first packing slip
      if (uninvoiced.length > 0) {
        const firstPS = uninvoiced[0];
        const psCustomerName = firstPS.customer_name;
        const psCustomerId = firstPS.customer_id;
        const psCustomerEmail = firstPS.customer_email || firstPS.email;
        
        console.log('Full Packing Slip Data:', firstPS);
        console.log('Packing Slip Customer Info:', { 
          customer_name: psCustomerName, 
          customer_id: psCustomerId,
          customer_email: psCustomerEmail 
        });
        
        // Try to find customer by ID first
        let customer = null;
        
        if (psCustomerId) {
          customer = customers.find(c => c.id === psCustomerId);
          console.log('Customer found by ID:', customer);
        }
        
        // If not found by ID, try by name (case-insensitive)
        // Check both customer_name and company_name fields
        if (!customer && psCustomerName) {
          customer = customers.find(c => 
            (c.customer_name && c.customer_name.toLowerCase() === psCustomerName.toLowerCase()) ||
            (c.company_name && c.company_name.toLowerCase() === psCustomerName.toLowerCase())
          );
          console.log('Customer found by name:', customer);
        }
        
        // If not found by name, try by email
        if (!customer && psCustomerEmail) {
          customer = customers.find(c => 
            c.email && 
            c.email.toLowerCase() === psCustomerEmail.toLowerCase()
          );
          console.log('Customer found by email:', customer);
        }
        
        if (customer) {
          // Use full customer record from customers list
          // Normalize: use company_name if exists, otherwise customer_name
          const displayName = customer.company_name || customer.customer_name || psCustomerName || 'Unknown Customer';
          setSelectedCustomer({
            ...customer,
            customer_name: displayName
          });
          setPaymentTerms(customer.payment_terms || '30 Days');
          console.log('Selected customer from list:', customer);
        } else {
          // Create customer object from packing slip data
          // Use customer_name if available, otherwise try to derive from job sheet
          const displayName = psCustomerName || 'Unknown Customer';
          const tempCustomer = {
            id: psCustomerId || 'temp-' + Date.now(),
            customer_name: displayName,
            email: psCustomerEmail || null,
            payment_terms: '30 Days'
          };
          setSelectedCustomer(tempCustomer);
          setPaymentTerms('30 Days');
          console.log('Created temp customer from packing slip:', tempCustomer);
          
          if (!psCustomerName) {
            console.warn('WARNING: Packing slip has no customer_name field populated');
          }
        }
      }
      
      // Pre-select all packing slips
      setSelectedPSIds(uninvoiced.map(ps => ps.id));
    } catch (error) {
      console.error('Error fetching packing slips:', error);
      alert('Failed to fetch packing slips: ' + error.message);
    }
  };

  const fetchAvailableJobs = async () => {
    try {
      // Fetch all completed packing slips that haven't been invoiced
      const response = await api.get('/packing-slips');
      const allPS = response.data;
      
      // Filter for completed and not invoiced
      const uninvoiced = allPS.filter(ps => !ps.is_invoiced && ps.status === 'Completed');
      
      // Group by Job Sheet Number (more accurate than PO)
      const groupedByJob = {};
      uninvoiced.forEach(ps => {
        const jobKey = ps.job_sheet_number || 'No Job';
        if (!groupedByJob[jobKey]) {
          groupedByJob[jobKey] = {
            po_number: ps.po_number,
            customer_name: ps.customer_name,
            customer_id: ps.customer_id,
            job_sheet_number: ps.job_sheet_number,
            packing_slips: [],
            total_items: 0
          };
        }
        groupedByJob[jobKey].packing_slips.push(ps);
        groupedByJob[jobKey].total_items += 1;
      });
      
      // Convert to array
      const jobsList = Object.values(groupedByJob);
      setAvailableJobs(jobsList);
      console.log('Available jobs for invoicing:', jobsList);
    } catch (error) {
      console.error('Error fetching available jobs:', error);
    }
  };

  const handleSelectJob = async (job) => {
    setPONumber(job.po_number || '');
    setShowJobList(false);
    
    // Load packing slips for this job
    setPackingSlips(job.packing_slips);
    
    console.log('Selected Job:', job);
    
    // Set customer info
    const customer = customers.find(c => 
      c.id === job.customer_id || 
      (c.customer_name && c.customer_name.toLowerCase() === job.customer_name?.toLowerCase()) ||
      (c.company_name && c.company_name.toLowerCase() === job.customer_name?.toLowerCase())
    );
    
    if (customer) {
      const displayName = customer.company_name || customer.customer_name || job.customer_name || 'Unknown Customer';
      setSelectedCustomer({
        ...customer,
        customer_name: displayName
      });
      setPaymentTerms(customer.payment_terms || '30 Days');
      console.log('Found customer:', customer);
    } else {
      // Create temp customer
      const displayName = job.customer_name || 'Unknown Customer';
      const tempCustomer = {
        id: job.customer_id || 'temp-' + Date.now(),
        customer_name: displayName,
        payment_terms: '30 Days'
      };
      setSelectedCustomer(tempCustomer);
      setPaymentTerms('30 Days');
      console.log('Created temp customer:', tempCustomer);
      
      if (!job.customer_name) {
        console.warn('WARNING: Job has no customer_name field populated');
      }
    }
    
    // Pre-select all packing slips
    setSelectedPSIds(job.packing_slips.map(ps => ps.id));
  };

  const handleCreateInvoice = async () => {
    if (!selectedCustomer) {
      alert('Customer information is required');
      return;
    }
    
    if (selectedPSIds.length === 0) {
      alert('Please select at least one packing slip');
      return;
    }
    
    try {
      console.log('Creating invoice with selectedCustomer:', selectedCustomer);
      
      // Validate customer_name is not empty
      if (!selectedCustomer || !selectedCustomer.customer_name || selectedCustomer.customer_name.trim() === '') {
        console.error('Customer validation failed:', selectedCustomer);
        alert('Customer name is required. Please ensure a valid customer is selected.');
        return;
      }
      
      const invoiceData = {
        customer_id: selectedCustomer.id,
        customer_name: selectedCustomer.customer_name.trim(),
        customer_email: selectedCustomer.email,
        purchase_order_number: poNumber,
        packing_slip_ids: selectedPSIds,
        payment_terms: paymentTerms,
        due_date: null  // Backend will calculate based on payment terms
      };
      
      console.log('Sending invoice data:', invoiceData);
      
      const response = await api.post('/invoices', invoiceData);
      alert(`Invoice ${response.data.invoice_number} created successfully!`);
      
      // Reset and close
      setCreateDialogOpen(false);
      setPONumber('');
      setPackingSlips([]);
      setSelectedPSIds([]);
      setSelectedCustomer(null);
      setShowJobList(true); // Reset to show job list on next open
      
      // Refresh both invoices and available jobs list
      fetchInvoices();
      fetchAvailableJobs();
    } catch (error) {
      console.error('Error creating invoice:', error);
      
      // Extract error message properly
      let errorMessage = 'Unknown error occurred';
      if (error.response?.data?.detail) {
        // If detail is an object, stringify it; otherwise use it directly
        errorMessage = typeof error.response.data.detail === 'object' 
          ? JSON.stringify(error.response.data.detail) 
          : error.response.data.detail;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      alert('Failed to create invoice: ' + errorMessage);
    }
  };

  const handleViewInvoice = async (invoice) => {
    setSelectedInvoice(invoice);
    setViewDialogOpen(true);
  };

  const handleDeleteInvoice = (invoice) => {
    setInvoiceToDelete(invoice);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteInvoice = async () => {
    if (!invoiceToDelete) return;
    
    try {
      await api.delete(`/invoices/${invoiceToDelete.id}`);
      setDeleteDialogOpen(false);
      setInvoiceToDelete(null);
      fetchInvoices();
      alert('Invoice deleted successfully');
    } catch (error) {
      console.error('Error deleting invoice:', error);
      const errorMessage = typeof error.response?.data?.detail === 'object' 
        ? JSON.stringify(error.response.data.detail) 
        : (error.response?.data?.detail || error.message);
      alert('Failed to delete invoice: ' + errorMessage);
    }
  };

  const handlePrintInvoice = async (invoice) => {
    try {
      // Update invoice status to "Sent" when printing (if currently Draft)
      if (invoice.status === 'Draft') {
        await api.patch(`/invoices/${invoice.id}`, { status: 'Sent' });
        console.log('Invoice status updated to Sent');
        // Refresh invoices list
        fetchInvoices();
      }
    } catch (error) {
      console.error('Error updating invoice status:', error);
      // Continue with print even if status update fails
    }
    
    const printWindow = window.open('', '_blank');
    
    const lineItemsHtml = invoice.line_items.map((item, index) => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${index + 1}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">
          <strong>${item.part_description}</strong>
          ${item.material_specification ? `<br><span style="font-size: 11px; color: #666;">${item.material_specification}</span>` : ''}
          <br><span style="font-size: 10px; color: #999;">Packing Slip: ${item.packing_slip_number}</span>
        </td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item.quantity_delivered}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">$${item.price_per_part_ex_gst.toFixed(2)}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right;"><strong>$${item.line_total_inc_gst.toFixed(2)}</strong></td>
      </tr>
    `).join('');
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Invoice ${invoice.invoice_number}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; max-width: 900px; margin: 0 auto; }
            h1 { color: #333; border-bottom: 3px solid #333; padding-bottom: 10px; }
            .header { margin-bottom: 30px; }
            .po-number { font-size: 18px; font-weight: bold; color: #000; margin: 15px 0; padding: 10px; background: #f0f0f0; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th { background-color: #f2f2f2; padding: 10px; border: 1px solid #ddd; text-align: left; }
            td { padding: 8px; border: 1px solid #ddd; }
            .totals { background: #f9f9f9; font-weight: bold; }
            .status-badge { display: inline-block; padding: 5px 15px; border-radius: 5px; font-size: 14px; }
            .status-paid { background: #4caf50; color: white; }
            .status-unpaid { background: #ff9800; color: white; }
            .status-partial { background: #2196f3; color: white; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>TAX INVOICE</h1>
            <div style="display: flex; justify-between;">
              <div>
                <div><strong>Invoice Number:</strong> ${invoice.invoice_number}</div>
                <div><strong>Invoice Date:</strong> ${new Date(invoice.invoice_date).toLocaleDateString('en-AU')}</div>
                <div><strong>Due Date:</strong> ${new Date(invoice.due_date).toLocaleDateString('en-AU')}</div>
                <div><strong>Payment Terms:</strong> ${invoice.payment_terms || 'N/A'}</div>
              </div>
              <div style="text-align: right;">
                <div class="status-badge status-${invoice.status.toLowerCase()}">${invoice.status.toUpperCase()}</div>
              </div>
            </div>
          </div>
          
          <div class="po-number">
            PURCHASE ORDER: ${invoice.purchase_order_number}
          </div>
          
          <div style="margin: 20px 0;">
            <strong>Bill To:</strong><br>
            ${invoice.customer_name}<br>
            ${invoice.customer_email || ''}
          </div>
          
          <table>
            <thead>
              <tr>
                <th style="width: 50px;">#</th>
                <th>Description</th>
                <th style="width: 100px; text-align: center;">Qty</th>
                <th style="width: 120px; text-align: right;">Price<br>(Ex GST)</th>
                <th style="width: 120px; text-align: right;">Total<br>(Inc GST)</th>
              </tr>
            </thead>
            <tbody>
              ${lineItemsHtml}
            </tbody>
            <tfoot>
              <tr class="totals">
                <td colspan="4" style="text-align: right;">SUBTOTAL (Ex GST):</td>
                <td style="text-align: right;">$${invoice.subtotal_ex_gst.toFixed(2)}</td>
              </tr>
              <tr class="totals">
                <td colspan="4" style="text-align: right;">GST (10%):</td>
                <td style="text-align: right;">$${invoice.gst_total.toFixed(2)}</td>
              </tr>
              <tr class="totals" style="font-size: 16px; background: #e0e0e0;">
                <td colspan="4" style="text-align: right;">TOTAL (Inc GST):</td>
                <td style="text-align: right;">$${invoice.total_inc_gst.toFixed(2)}</td>
              </tr>
              ${invoice.payment_received > 0 ? `
                <tr>
                  <td colspan="4" style="text-align: right; color: #4caf50;">Amount Paid:</td>
                  <td style="text-align: right; color: #4caf50;">-$${invoice.payment_received.toFixed(2)}</td>
                </tr>
                <tr class="totals" style="background: #fff3e0;">
                  <td colspan="4" style="text-align: right;">BALANCE DUE:</td>
                  <td style="text-align: right; color: ${invoice.balance_due > 0 ? '#ff5722' : '#4caf50'};">$${invoice.balance_due.toFixed(2)}</td>
                </tr>
              ` : ''}
            </tfoot>
          </table>
          
          ${invoice.notes ? `<div style="margin-top: 20px;"><strong>Notes:</strong><br>${invoice.notes}</div>` : ''}
          
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #666; font-size: 12px;">
            <p>Payment is due by ${new Date(invoice.due_date).toLocaleDateString('en-AU')}</p>
            <p>Please reference Invoice Number: ${invoice.invoice_number} with your payment</p>
          </div>
          
          <div style="margin-top: 20px; text-align: center;">
            <button onclick="window.print()" style="padding: 10px 20px; background: #333; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;">
              Print Invoice
            </button>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleEmailInvoice = async (invoice) => {
    try {
      // Update invoice status to "Sent" when emailing (if currently Draft)
      if (invoice.status === 'Draft') {
        await api.patch(`/invoices/${invoice.id}`, { status: 'Sent' });
        console.log('Invoice status updated to Sent');
        // Refresh invoices list
        fetchInvoices();
      }
      
      // Send email via API
      await api.post(`/invoices/${invoice.id}/email`);
      alert(`Invoice ${invoice.invoice_number} has been emailed to ${invoice.customer_email || 'customer'}`);
    } catch (error) {
      console.error('Error emailing invoice:', error);
      const errorMessage = typeof error.response?.data?.detail === 'object' 
        ? JSON.stringify(error.response.data.detail) 
        : (error.response?.data?.detail || error.message);
      alert('Failed to email invoice: ' + errorMessage);
    }
  };

  const handleOpenPaymentDialog = (invoice) => {
    setSelectedInvoice(invoice);
    setPaymentForm({
      payment_amount: invoice.balance_due,
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'Bank Transfer',
      payment_reference: ''
    });
    setPaymentDialogOpen(true);
  };

  const handleRecordPayment = async () => {
    if (paymentForm.payment_amount <= 0) {
      alert('Payment amount must be greater than 0');
      return;
    }
    
    try {
      const paymentData = {
        payment_amount: parseFloat(paymentForm.payment_amount),
        payment_date: new Date(paymentForm.payment_date).toISOString(),
        payment_method: paymentForm.payment_method,
        payment_reference: paymentForm.payment_reference
      };
      
      await api.post(`/invoices/${selectedInvoice.id}/payment`, paymentData);
      alert('Payment recorded successfully!');
      
      setPaymentDialogOpen(false);
      fetchInvoices();
    } catch (error) {
      console.error('Error recording payment:', error);
      const errorMessage = typeof error.response?.data?.detail === 'object' 
        ? JSON.stringify(error.response.data.detail) 
        : (error.response?.data?.detail || error.message);
      alert('Failed to record payment: ' + errorMessage);
    }
  };

  // ----- Edit Line Item Prices (in View Invoice modal) -----
  const startEditPrices = () => {
    setEditLineItems(
      selectedInvoice.line_items.map(li => ({
        ...li,
        price_per_part_ex_gst: Number(li.price_per_part_ex_gst || 0),
      }))
    );
    setEditingPrices(true);
  };

  const cancelEditPrices = () => {
    setEditingPrices(false);
    setEditLineItems([]);
  };

  const updateLineItemPrice = (idx, value) => {
    setEditLineItems(items => items.map((li, i) => i === idx ? {
      ...li,
      price_per_part_ex_gst: value === '' ? '' : Number(value),
    } : li));
  };

  const editedTotals = (() => {
    let subtotal = 0;
    editLineItems.forEach(li => {
      const qty = Number(li.quantity_delivered || 0);
      const price = Number(li.price_per_part_ex_gst || 0);
      subtotal += qty * price;
    });
    const gst = subtotal * 0.10;
    return { subtotal, gst, total: subtotal + gst };
  })();

  const saveEditedPrices = async () => {
    setSavingPrices(true);
    try {
      // Send only the necessary fields; backend recomputes line totals + invoice totals
      const payload = {
        line_items: editLineItems.map(li => ({
          id: li.id,
          packing_slip_id: li.packing_slip_id,
          packing_slip_number: li.packing_slip_number,
          part_description: li.part_description,
          material_specification: li.material_specification,
          quantity_delivered: Number(li.quantity_delivered || 0),
          price_per_part_ex_gst: Number(li.price_per_part_ex_gst || 0),
          line_total_ex_gst: 0,  // recomputed server-side
          gst_amount: 0,
          line_total_inc_gst: 0,
        })),
      };
      const res = await api.patch(`/invoices/${selectedInvoice.id}`, payload);
      setSelectedInvoice(res.data);
      setEditingPrices(false);
      setEditLineItems([]);
      fetchInvoices();
    } catch (error) {
      const msg = typeof error.response?.data?.detail === 'object'
        ? JSON.stringify(error.response.data.detail)
        : (error.response?.data?.detail || error.message);
      alert('Failed to save prices: ' + msg);
    } finally {
      setSavingPrices(false);
    }
  };

  const getStatusBadge = (status) => {
    const colors = {
      'Draft': 'bg-gray-100 text-gray-800',
      'Sent': 'bg-blue-100 text-blue-800',
      'Paid': 'bg-green-100 text-green-800',
      'Partial': 'bg-yellow-100 text-yellow-800',
      'Overdue': 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Invoices</h1>
          <p className="text-slate-600 mt-1">Manage customer invoices and payments</p>
        </div>
        <Button onClick={() => {
          setCreateDialogOpen(true);
          fetchAvailableJobs();
          setShowJobList(true);
          setPONumber('');
          setPackingSlips([]);
          setSelectedPSIds([]);
          setSelectedCustomer(null);
        }} className="bg-green-600 hover:bg-green-700">
          <Plus className="h-4 w-4 mr-2" />
          Create Invoice
        </Button>
      </div>

      {/* Search & Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-4 gap-4">
            <div>
              <Label htmlFor="customer-search">Customer</Label>
              <Input
                id="customer-search"
                placeholder="Search by customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="po-search">PO Number</Label>
              <Input
                id="po-search"
                placeholder="Search by PO..."
                value={poSearch}
                onChange={(e) => setPOSearch(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="desc-search">Description</Label>
              <Input
                id="desc-search"
                placeholder="Search by description..."
                value={descriptionSearch}
                onChange={(e) => setDescriptionSearch(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="status-filter">Status</Label>
              <select
                id="status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">All Statuses</option>
                <option value="Draft">Draft</option>
                <option value="Sent">Sent</option>
                <option value="Paid">Paid</option>
                <option value="Partial">Partial</option>
                <option value="Overdue">Overdue</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={fetchInvoices} variant="outline">
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Invoices List */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice List ({invoices.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading invoices...</div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No invoices found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-100 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Invoice #</th>
                    <th className="px-4 py-3 text-left font-semibold">Customer</th>
                    <th className="px-4 py-3 text-left font-semibold"><strong>PO Number</strong></th>
                    <th className="px-4 py-3 text-left font-semibold">Date</th>
                    <th className="px-4 py-3 text-left font-semibold">Due Date</th>
                    <th className="px-4 py-3 text-right font-semibold">Total</th>
                    <th className="px-4 py-3 text-right font-semibold">Balance</th>
                    <th className="px-4 py-3 text-center font-semibold">Status</th>
                    <th className="px-4 py-3 text-center font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{invoice.invoice_number}</td>
                      <td className="px-4 py-3">{invoice.customer_name}</td>
                      <td className="px-4 py-3"><strong>{invoice.purchase_order_number}</strong></td>
                      <td className="px-4 py-3">{new Date(invoice.invoice_date).toLocaleDateString('en-AU')}</td>
                      <td className="px-4 py-3">{new Date(invoice.due_date).toLocaleDateString('en-AU')}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(invoice.total_inc_gst)}</td>
                      <td className="px-4 py-3 text-right font-semibold" style={{color: invoice.balance_due > 0 ? '#ff5722' : '#4caf50'}}>
                        {formatCurrency(invoice.balance_due)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(invoice.status)}`}>
                          {invoice.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-center">
                          <Button size="sm" variant="outline" onClick={() => handleViewInvoice(invoice)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handlePrintInvoice(invoice)}>
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleEmailInvoice(invoice)} title="Email Invoice">
                            <Mail className="h-4 w-4" />
                          </Button>
                          {invoice.status !== 'Paid' && (
                            <Button size="sm" variant="outline" onClick={() => handleOpenPaymentDialog(invoice)}>
                              <DollarSign className="h-4 w-4" />
                            </Button>
                          )}
                          {currentUser?.role === 'Administrator' && (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => handleDeleteInvoice(invoice)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Invoice Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Invoice from Packing Slips</DialogTitle>
            <DialogDescription>
              Select a job from the list below or search by PO Number
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Toggle between Job List and PO Search */}
            {showJobList && availableJobs.length > 0 && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-lg">Available Jobs Ready to Invoice</h3>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowJobList(false)}
                  >
                    Search by PO Instead
                  </Button>
                </div>
                
                <div className="border rounded-lg max-h-96 overflow-y-auto">
                  {availableJobs.map((job, index) => (
                    <div 
                      key={index} 
                      className="p-4 border-b last:border-0 hover:bg-slate-50 cursor-pointer"
                      onClick={() => handleSelectJob(job)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold text-lg">
                            {job.po_number || 'No PO Number'}
                          </div>
                          <div className="text-sm text-gray-600">
                            Customer: {job.customer_name}
                          </div>
                          <div className="text-sm text-gray-600">
                            Job: {job.job_sheet_number}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded text-sm font-semibold">
                            {job.total_items} Packing Slip{job.total_items !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* PO Number Search (show when job list is hidden) */}
            {!showJobList && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-lg">Search by PO Number</h3>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setShowJobList(true);
                      setPONumber('');
                      setPackingSlips([]);
                      setSelectedPSIds([]);
                      setSelectedCustomer(null);
                    }}
                  >
                    Back to Job List
                  </Button>
                </div>
                
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label htmlFor="po-number">Purchase Order Number</Label>
                    <Input
                      id="po-number"
                      placeholder="Enter PO Number..."
                      value={poNumber}
                      onChange={(e) => setPONumber(e.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleSearchPackingSlips}>
                      <Search className="h-4 w-4 mr-2" />
                      Search
                    </Button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Customer Info */}
            {selectedCustomer && (
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="font-semibold">
                  Customer: {selectedCustomer.customer_name || selectedCustomer.company_name || 'Unknown Customer'}
                </div>
                <div className="text-sm text-gray-600">Email: {selectedCustomer.email || 'N/A'}</div>
                <div className="text-sm text-gray-600">Payment Terms: {paymentTerms}</div>
              </div>
            )}
            
            {/* Packing Slips Selection */}
            {packingSlips.length > 0 && (
              <div className="border rounded-lg">
                <div className="bg-slate-100 px-4 py-2 font-semibold">
                  Select Packing Slips ({selectedPSIds.length} selected)
                </div>
                <div className="p-4 space-y-2">
                  {packingSlips.map((ps) => (
                    <div key={ps.id} className="flex items-center gap-3 p-3 border rounded hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={selectedPSIds.includes(ps.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPSIds([...selectedPSIds, ps.id]);
                          } else {
                            setSelectedPSIds(selectedPSIds.filter(id => id !== ps.id));
                          }
                        }}
                        className="h-4 w-4"
                      />
                      <div className="flex-1">
                        <div className="font-medium">{ps.packing_slip_number}</div>
                        <div className="text-sm text-gray-600">
                          {(() => {
                            const items = Array.isArray(ps.items) && ps.items.length > 0 ? ps.items : null;
                            if (items) {
                              const totalQty = items.reduce((sum, it) => sum + (parseInt(it.qty_delivered) || 0), 0);
                              if (items.length === 1) {
                                return `${items[0].part_description || ps.part_description || ''} | Qty: ${totalQty}`;
                              }
                              return `${items.length} items | Total Qty: ${totalQty}`;
                            }
                            return `${ps.part_description || ''} | Qty: ${ps.quantity_delivered ?? 0}`;
                          })()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Payment Terms */}
            {packingSlips.length > 0 && (
              <div>
                <Label htmlFor="payment-terms">Payment Terms</Label>
                <select
                  id="payment-terms"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="Cash">Cash</option>
                  <option value="Credit Card">Credit Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="7 Days EOM">7 Days EOM</option>
                  <option value="14 Days EOM">14 Days EOM</option>
                  <option value="30 Days EOM">30 Days EOM</option>
                  <option value="30 Days">30 Days</option>
                  <option value="60 Days">60 Days</option>
                  <option value="90 Days">90 Days</option>
                </select>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateInvoice}
              disabled={selectedPSIds.length === 0}
              className="bg-green-600 hover:bg-green-700"
            >
              <FileText className="h-4 w-4 mr-2" />
              Create Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Invoice Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={(open) => {
        if (!open) { setEditingPrices(false); setEditLineItems([]); }
        setViewDialogOpen(open);
      }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invoice {selectedInvoice?.invoice_number}</DialogTitle>
          </DialogHeader>
          
          {selectedInvoice && (
            <div className="space-y-4">
              {/* Invoice Details */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg">
                <div>
                  <div className="text-sm text-gray-600">Customer</div>
                  <div className="font-semibold">{selectedInvoice.customer_name}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Purchase Order</div>
                  <div className="font-bold text-lg">{selectedInvoice.purchase_order_number}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Invoice Date</div>
                  <div>{new Date(selectedInvoice.invoice_date).toLocaleDateString('en-AU')}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Due Date</div>
                  <div>{new Date(selectedInvoice.due_date).toLocaleDateString('en-AU')}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Payment Terms</div>
                  <div>{selectedInvoice.payment_terms}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Status</div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(selectedInvoice.status)}`}>
                    {selectedInvoice.status}
                  </span>
                </div>
              </div>
              
              {/* Line Items Table */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">#</th>
                      <th className="px-3 py-2 text-left font-semibold">Description</th>
                      <th className="px-3 py-2 text-center font-semibold">Qty</th>
                      <th className="px-3 py-2 text-right font-semibold">Price (Ex GST)</th>
                      <th className="px-3 py-2 text-right font-semibold">Total (Inc GST)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(editingPrices ? editLineItems : selectedInvoice.line_items).map((item, index) => {
                      const qty = Number(item.quantity_delivered || 0);
                      const price = Number(item.price_per_part_ex_gst || 0);
                      const liveIncGst = qty * price * 1.10;
                      return (
                        <tr key={item.id} className="border-b">
                          <td className="px-3 py-3">{index + 1}</td>
                          <td className="px-3 py-3">
                            <div className="font-medium">{item.part_description}</div>
                            {item.material_specification && (
                              <div className="text-xs text-gray-600 mt-1">{item.material_specification}</div>
                            )}
                            <div className="text-xs text-gray-500 mt-1">PS: {item.packing_slip_number}</div>
                          </td>
                          <td className="px-3 py-3 text-center">{item.quantity_delivered}</td>
                          <td className="px-3 py-3 text-right">
                            {editingPrices ? (
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.price_per_part_ex_gst}
                                onChange={(e) => updateLineItemPrice(index, e.target.value)}
                                className="w-28 border rounded px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
                                data-testid={`invoice-edit-price-${index}`}
                              />
                            ) : (
                              formatCurrency(item.price_per_part_ex_gst)
                            )}
                          </td>
                          <td className="px-3 py-3 text-right font-semibold">
                            {editingPrices
                              ? formatCurrency(liveIncGst)
                              : formatCurrency(item.line_total_inc_gst)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-100 font-semibold">
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-right">Subtotal (Ex GST):</td>
                      <td className="px-3 py-2 text-right">
                        {formatCurrency(editingPrices ? editedTotals.subtotal : selectedInvoice.subtotal_ex_gst)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-right">GST (10%):</td>
                      <td className="px-3 py-2 text-right">
                        {formatCurrency(editingPrices ? editedTotals.gst : selectedInvoice.gst_total)}
                      </td>
                    </tr>
                    <tr className="text-lg">
                      <td colSpan={4} className="px-3 py-3 text-right">TOTAL (Inc GST):</td>
                      <td className="px-3 py-3 text-right">
                        {formatCurrency(editingPrices ? editedTotals.total : selectedInvoice.total_inc_gst)}
                      </td>
                    </tr>
                    {selectedInvoice.payment_received > 0 && (
                      <>
                        <tr className="text-green-700">
                          <td colSpan={4} className="px-3 py-2 text-right">Amount Paid:</td>
                          <td className="px-3 py-2 text-right">-{formatCurrency(selectedInvoice.payment_received)}</td>
                        </tr>
                        <tr className="text-red-700">
                          <td colSpan={4} className="px-3 py-2 text-right">Balance Due:</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(selectedInvoice.balance_due)}</td>
                        </tr>
                      </>
                    )}
                  </tfoot>
                </table>
              </div>
            </div>
          )}
          
          <DialogFooter>
            {editingPrices ? (
              <>
                <Button variant="outline" onClick={cancelEditPrices} disabled={savingPrices} data-testid="invoice-edit-cancel">
                  Cancel
                </Button>
                <Button onClick={saveEditedPrices} disabled={savingPrices} data-testid="invoice-edit-save">
                  {savingPrices ? 'Saving…' : 'Save Prices'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={startEditPrices} data-testid="invoice-edit-prices">
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Prices
                </Button>
                <Button variant="outline" onClick={() => handlePrintInvoice(selectedInvoice)}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
                {selectedInvoice?.status !== 'Paid' && (
                  <Button onClick={() => {
                    setViewDialogOpen(false);
                    handleOpenPaymentDialog(selectedInvoice);
                  }}>
                    <DollarSign className="h-4 w-4 mr-2" />
                    Record Payment
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Invoice: {selectedInvoice?.invoice_number} | Balance Due: {formatCurrency(selectedInvoice?.balance_due || 0)}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="payment-amount">Payment Amount</Label>
              <Input
                id="payment-amount"
                type="number"
                step="0.01"
                value={paymentForm.payment_amount}
                onChange={(e) => setPaymentForm({...paymentForm, payment_amount: e.target.value})}
              />
            </div>
            
            <div>
              <Label htmlFor="payment-date">Payment Date</Label>
              <Input
                id="payment-date"
                type="date"
                value={paymentForm.payment_date}
                onChange={(e) => setPaymentForm({...paymentForm, payment_date: e.target.value})}
              />
            </div>
            
            <div>
              <Label htmlFor="payment-method">Payment Method</Label>
              <select
                id="payment-method"
                value={paymentForm.payment_method}
                onChange={(e) => setPaymentForm({...paymentForm, payment_method: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="Cash">Cash</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
            
            <div>
              <Label htmlFor="payment-reference">Reference / Transaction ID</Label>
              <Input
                id="payment-reference"
                placeholder="Optional"
                value={paymentForm.payment_reference}
                onChange={(e) => setPaymentForm({...paymentForm, payment_reference: e.target.value})}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRecordPayment} className="bg-green-600 hover:bg-green-700">
              <DollarSign className="h-4 w-4 mr-2" />
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Invoice Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Confirm Delete
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this invoice? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          {invoiceToDelete && (
            <div className="bg-slate-50 p-4 rounded-lg space-y-2">
              <p><strong>Invoice #:</strong> {invoiceToDelete.invoice_number}</p>
              <p><strong>Customer:</strong> {invoiceToDelete.customer_name}</p>
              <p><strong>PO #:</strong> {invoiceToDelete.purchase_order_number}</p>
              <p><strong>Total:</strong> ${invoiceToDelete.total_amount?.toFixed(2) || '0.00'}</p>
              <p><strong>Status:</strong> {invoiceToDelete.status}</p>
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setDeleteDialogOpen(false);
                setInvoiceToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDeleteInvoice}
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Invoices;


