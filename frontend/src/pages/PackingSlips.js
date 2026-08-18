import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { PackageCheck, Printer, Eye, Search, Trash2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const PackingSlips = () => {
  const { currentUser } = useAuth();
  const [packingSlips, setPackingSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [slipToDelete, setSlipToDelete] = useState(null);
  const [companySettings, setCompanySettings] = useState(null);

  useEffect(() => {
    fetchPackingSlips();
    fetchCompanySettings();
  }, []);

  const fetchCompanySettings = async () => {
    try {
      const response = await api.get('/settings');
      setCompanySettings(response.data);
    } catch (error) {
      console.error('Error fetching company settings:', error);
      // Continue without settings if fetch fails
    }
  };

  const fetchPackingSlips = async () => {
    try {
      const response = await api.get('/packing-slips');
      setPackingSlips(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching packing slips:', error);
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Pending': return 'bg-yellow-100 text-yellow-800';
      case 'Shipped': return 'bg-blue-100 text-blue-800';
      case 'Delivered': return 'bg-green-100 text-green-800';
      case 'Invoiced': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredPackingSlips = packingSlips.filter(slip => {
    const matchesSearch = slip.packing_slip_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         slip.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         slip.job_sheet_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = !statusFilter || slip.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleDeleteSlip = (slip) => {
    setSlipToDelete(slip);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteSlip = async () => {
    if (!slipToDelete) return;
    
    try {
      await api.delete(`/packing-slips/${slipToDelete.id}`);
      setDeleteDialogOpen(false);
      setSlipToDelete(null);
      fetchPackingSlips();
      alert('Packing Slip deleted successfully');
    } catch (error) {
      console.error('Error deleting packing slip:', error);
      alert('Failed to delete packing slip: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handlePrint = async (packingSlip) => {
    try {
      // Update status to Completed when printing
      await api.patch(`/packing-slips/${packingSlip.id}/status`, { status: 'Completed' });
      
      // Refresh the list
      fetchPackingSlips();
    } catch (error) {
      console.error('Error updating packing slip status:', error);
      // Continue with print even if status update fails
    }
    
    // Create print window with dual-copy layout
    const printWindow = window.open('', '_blank');
    
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Packing Slip - ${packingSlip.packing_slip_number}</title>
        <style>
          @page {
            size: A4;
            margin: 0;
          }
          
          @media print {
            body {
              zoom: 93%;
              -moz-transform: scale(0.93);
              -moz-transform-origin: 0 0;
            }
          }
          
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: Arial, sans-serif;
            font-size: 11px;
            line-height: 1.3;
          }
          
          .page {
            width: 210mm;
            height: 297mm;
            padding: 0;
            display: flex;
            flex-direction: column;
          }
          
          .copy {
            width: 100%;
            height: 148.5mm;
            padding: 10mm;
            position: relative;
            page-break-after: avoid;
          }
          
          .cut-line {
            width: 100%;
            height: 0;
            border-top: 1px dashed #999;
            position: relative;
            text-align: center;
          }
          
          .cut-line::before {
            content: "✂ CUT HERE ✂";
            background: white;
            padding: 0 10px;
            position: relative;
            top: -8px;
            font-size: 9px;
            color: #999;
          }
          
          .header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 15px;
            border-bottom: 2px solid #000;
            padding-bottom: 8px;
          }
          
          .company-info {
            flex: 1;
          }
          
          .company-name {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 3px;
          }
          
          .company-details {
            font-size: 10px;
            line-height: 1.4;
          }
          
          .slip-info {
            text-align: right;
          }
          
          .slip-title {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 3px;
          }
          
          .slip-number {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 2px;
          }
          
          .copy-label {
            font-size: 11px;
            font-weight: bold;
            padding: 2px 8px;
            background: #000;
            color: #fff;
            display: inline-block;
            margin-top: 3px;
          }
          
          .details-section {
            display: flex;
            gap: 15px;
            margin-bottom: 15px;
          }
          
          .details-box {
            flex: 1;
            border: 1px solid #000;
            padding: 8px;
          }
          
          .details-title {
            font-weight: bold;
            font-size: 11px;
            margin-bottom: 5px;
            border-bottom: 1px solid #000;
            padding-bottom: 3px;
          }
          
          .details-row {
            display: flex;
            margin-bottom: 3px;
          }
          
          .details-label {
            font-weight: bold;
            min-width: 80px;
          }
          
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
          }
          
          .items-table th {
            background: #000;
            color: #fff;
            padding: 6px;
            text-align: left;
            font-size: 10px;
            font-weight: bold;
          }
          
          .items-table td {
            border: 1px solid #000;
            padding: 6px;
            font-size: 10px;
          }
          
          .items-table tbody tr:nth-child(odd) {
            background: #f5f5f5;
          }
          
          .qty-box {
            display: flex;
            justify-content: space-around;
            margin-top: 10px;
            padding: 8px;
            border: 2px solid #000;
            background: #f9f9f9;
          }
          
          .qty-item {
            text-align: center;
          }
          
          .qty-label {
            font-size: 9px;
            margin-bottom: 3px;
          }
          
          .qty-value {
            font-size: 16px;
            font-weight: bold;
          }
          
          .qty-backorder {
            color: ${packingSlip.total_balance > 0 ? '#d32f2f' : '#000'};
          }
          
          .notes-section {
            margin-top: 10px;
            padding: 8px;
            border: 1px solid #ccc;
            background: #f9f9f9;
            min-height: 40px;
          }
          
          .notes-title {
            font-weight: bold;
            margin-bottom: 5px;
          }
          
          .footer {
            margin-top: auto;
            padding-top: 10px;
            border-top: 1px solid #ccc;
            font-size: 9px;
            color: #666;
          }
          
          @media print {
            .cut-line {
              page-break-after: avoid;
            }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <!-- COMPANY COPY -->
          <div class="copy">
            <div class="header">
              <div class="company-info">
                ${companySettings?.logo_url ? `<img src="${companySettings.logo_url}" alt="Company Logo" style="max-height: 60px; max-width: 200px; margin-bottom: 8px;">` : ''}
                <div class="company-name">${companySettings?.company_name || 'NESTIX'}</div>
                <div class="company-details">
                  ${companySettings?.address || '123 Manufacturing Street'}, ${companySettings?.suburb || 'Melbourne'} ${companySettings?.state || 'VIC'} ${companySettings?.postcode || '3000'}<br>
                  ${companySettings?.phone ? `Phone: ${companySettings.phone}` : 'Phone: (03) 1234 5678'}${companySettings?.fax ? ` | Fax: ${companySettings.fax}` : ''}<br>
                  ${companySettings?.email ? `Email: ${companySettings.email}` : 'Email: info@nestix.com.au'}${companySettings?.website ? ` | ${companySettings.website}` : ''}
                </div>
              </div>
              <div class="slip-info">
                <div class="slip-title">PACKING SLIP</div>
                <div class="slip-number">${packingSlip.packing_slip_number}</div>
                <div>Date: ${new Date(packingSlip.created_at).toLocaleDateString()}</div>
                <div class="copy-label">COMPANY COPY</div>
              </div>
            </div>
            
            <div class="details-section">
              <div class="details-box">
                <div class="details-title">CUSTOMER DETAILS</div>
                <div class="details-row">
                  <span class="details-label">Name:</span>
                  <span>${packingSlip.customer_name}</span>
                </div>
                <div class="details-row">
                  <span class="details-label">Address:</span>
                  <span>${packingSlip.customer_address || ''}</span>
                </div>
                <div class="details-row">
                  <span class="details-label">Suburb:</span>
                  <span>${packingSlip.customer_suburb || ''} ${packingSlip.customer_state || ''} ${packingSlip.customer_postcode || ''}</span>
                </div>
                <div class="details-row">
                  <span class="details-label">Phone:</span>
                  <span>${packingSlip.customer_phone || 'N/A'}</span>
                </div>
                <div class="details-row">
                  <span class="details-label">PO Number:</span>
                  <span><strong>${packingSlip.customer_po_number || 'N/A'}</strong></span>
                </div>
              </div>
              
              <div class="details-box">
                <div class="details-title">DELIVERY DETAILS</div>
                <div class="details-row">
                  <span class="details-label">Address:</span>
                  <span>${packingSlip.delivery_address || packingSlip.customer_address || ''}</span>
                </div>
                <div class="details-row">
                  <span class="details-label">Suburb:</span>
                  <span>${packingSlip.delivery_suburb || packingSlip.customer_suburb || ''} ${packingSlip.delivery_state || packingSlip.customer_state || ''} ${packingSlip.delivery_postcode || packingSlip.customer_postcode || ''}</span>
                </div>
                <div class="details-row">
                  <span class="details-label">Phone:</span>
                  <span>${packingSlip.delivery_phone || packingSlip.customer_phone || 'N/A'}</span>
                </div>
                <div class="details-row">
                  <span class="details-label">Time Ready:</span>
                  <span>${packingSlip.time_ready || 'N/A'}</span>
                </div>
                <div class="details-row">
                  <span class="details-label">Job Sheet:</span>
                  <span>${packingSlip.job_sheet_number}</span>
                </div>
              </div>
            </div>
            
            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 50%;">PART DESCRIPTION</th>
                  <th style="width: 20%;">MATERIAL</th>
                  <th style="width: 10%;">QTY ORDER</th>
                  <th style="width: 10%;">QTY DELIV</th>
                  <th style="width: 10%;">BALANCE</th>
                </tr>
              </thead>
              <tbody>
                ${packingSlip.items.map(item => `
                  <tr>
                    <td>${item.part_description}</td>
                    <td>${item.material || 'N/A'} ${item.thickness ? item.thickness + 'mm' : ''}</td>
                    <td style="text-align: center;"><strong>${item.qty_ordered}</strong></td>
                    <td style="text-align: center;"><strong>${item.qty_delivered}</strong></td>
                    <td style="text-align: center;"><strong>${item.qty_balance}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <div class="qty-box">
              <div class="qty-item">
                <div class="qty-label">TOTAL ORDERED</div>
                <div class="qty-value">${packingSlip.total_ordered}</div>
              </div>
              <div class="qty-item">
                <div class="qty-label">TOTAL DELIVERED</div>
                <div class="qty-value">${packingSlip.total_delivered}</div>
              </div>
              <div class="qty-item qty-backorder">
                <div class="qty-label">BACKORDER</div>
                <div class="qty-value">${packingSlip.total_balance}</div>
              </div>
            </div>
            
            ${packingSlip.delivery_instructions || packingSlip.notes ? `
              <div class="notes-section">
                <div class="notes-title">DELIVERY INSTRUCTIONS / NOTES:</div>
                <div>${packingSlip.delivery_instructions || ''}</div>
                ${packingSlip.notes ? `<div style="margin-top: 5px;">${packingSlip.notes}</div>` : ''}
              </div>
            ` : ''}
            
            <div class="footer">
              Printed: ${new Date().toLocaleString()} | Status: ${packingSlip.status}
            </div>
          </div>
          
          <!-- CUT LINE -->
          <div class="cut-line"></div>
          
          <!-- CUSTOMER COPY -->
          <div class="copy">
            <div class="header">
              <div class="company-info">
                ${companySettings?.logo_url ? `<img src="${companySettings.logo_url}" alt="Company Logo" style="max-height: 60px; max-width: 200px; margin-bottom: 8px;">` : ''}
                <div class="company-name">${companySettings?.company_name || 'NESTIX'}</div>
                <div class="company-details">
                  ${companySettings?.address || '123 Manufacturing Street'}, ${companySettings?.suburb || 'Melbourne'} ${companySettings?.state || 'VIC'} ${companySettings?.postcode || '3000'}<br>
                  ${companySettings?.phone ? `Phone: ${companySettings.phone}` : 'Phone: (03) 1234 5678'}${companySettings?.fax ? ` | Fax: ${companySettings.fax}` : ''}<br>
                  ${companySettings?.email ? `Email: ${companySettings.email}` : 'Email: info@nestix.com.au'}${companySettings?.website ? ` | ${companySettings.website}` : ''}
                </div>
              </div>
              <div class="slip-info">
                <div class="slip-title">PACKING SLIP</div>
                <div class="slip-number">${packingSlip.packing_slip_number}</div>
                <div>Date: ${new Date(packingSlip.created_at).toLocaleDateString()}</div>
                <div class="copy-label">CUSTOMER COPY</div>
              </div>
            </div>
            
            <div class="details-section">
              <div class="details-box">
                <div class="details-title">CUSTOMER DETAILS</div>
                <div class="details-row">
                  <span class="details-label">Name:</span>
                  <span>${packingSlip.customer_name}</span>
                </div>
                <div class="details-row">
                  <span class="details-label">Address:</span>
                  <span>${packingSlip.customer_address || ''}</span>
                </div>
                <div class="details-row">
                  <span class="details-label">Suburb:</span>
                  <span>${packingSlip.customer_suburb || ''} ${packingSlip.customer_state || ''} ${packingSlip.customer_postcode || ''}</span>
                </div>
                <div class="details-row">
                  <span class="details-label">Phone:</span>
                  <span>${packingSlip.customer_phone || 'N/A'}</span>
                </div>
                <div class="details-row">
                  <span class="details-label">PO Number:</span>
                  <span><strong>${packingSlip.customer_po_number || 'N/A'}</strong></span>
                </div>
              </div>
              
              <div class="details-box">
                <div class="details-title">DELIVERY DETAILS</div>
                <div class="details-row">
                  <span class="details-label">Address:</span>
                  <span>${packingSlip.delivery_address || packingSlip.customer_address || ''}</span>
                </div>
                <div class="details-row">
                  <span class="details-label">Suburb:</span>
                  <span>${packingSlip.delivery_suburb || packingSlip.customer_suburb || ''} ${packingSlip.delivery_state || packingSlip.customer_state || ''} ${packingSlip.delivery_postcode || packingSlip.customer_postcode || ''}</span>
                </div>
                <div class="details-row">
                  <span class="details-label">Phone:</span>
                  <span>${packingSlip.delivery_phone || packingSlip.customer_phone || 'N/A'}</span>
                </div>
                <div class="details-row">
                  <span class="details-label">Time Ready:</span>
                  <span>${packingSlip.time_ready || 'N/A'}</span>
                </div>
                <div class="details-row">
                  <span class="details-label">Job Sheet:</span>
                  <span>${packingSlip.job_sheet_number}</span>
                </div>
              </div>
            </div>
            
            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 50%;">PART DESCRIPTION</th>
                  <th style="width: 20%;">MATERIAL</th>
                  <th style="width: 10%;">QTY ORDER</th>
                  <th style="width: 10%;">QTY DELIV</th>
                  <th style="width: 10%;">BALANCE</th>
                </tr>
              </thead>
              <tbody>
                ${packingSlip.items.map(item => `
                  <tr>
                    <td>${item.part_description}</td>
                    <td>${item.material || 'N/A'} ${item.thickness ? item.thickness + 'mm' : ''}</td>
                    <td style="text-align: center;"><strong>${item.qty_ordered}</strong></td>
                    <td style="text-align: center;"><strong>${item.qty_delivered}</strong></td>
                    <td style="text-align: center;"><strong>${item.qty_balance}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <div class="qty-box">
              <div class="qty-item">
                <div class="qty-label">TOTAL ORDERED</div>
                <div class="qty-value">${packingSlip.total_ordered}</div>
              </div>
              <div class="qty-item">
                <div class="qty-label">TOTAL DELIVERED</div>
                <div class="qty-value">${packingSlip.total_delivered}</div>
              </div>
              <div class="qty-item qty-backorder">
                <div class="qty-label">BACKORDER</div>
                <div class="qty-value">${packingSlip.total_balance}</div>
              </div>
            </div>
            
            ${packingSlip.delivery_instructions || packingSlip.notes ? `
              <div class="notes-section">
                <div class="notes-title">DELIVERY INSTRUCTIONS / NOTES:</div>
                <div>${packingSlip.delivery_instructions || ''}</div>
                ${packingSlip.notes ? `<div style="margin-top: 5px;">${packingSlip.notes}</div>` : ''}
              </div>
            ` : ''}
            
            <div class="footer">
              Printed: ${new Date().toLocaleString()} | Status: ${packingSlip.status}
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
    
    printWindow.document.write(printContent);
    printWindow.document.close();
    
    // Wait for content to load then print
    printWindow.onload = function() {
      setTimeout(() => {
        printWindow.print();
      }, 250);
    };
  };

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <PackageCheck className="w-8 h-8 text-blue-600" />
              <div>
                <CardTitle className="text-2xl">Packing Slips</CardTitle>
                <p className="text-sm text-gray-500 mt-1">Track deliveries and backorders</p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by packing slip #, customer, or job sheet..."
                  className="w-full pl-10 pr-4 py-2 border rounded-md"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <select
              className="border rounded-md px-4 py-2"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Shipped">Shipped</option>
              <option value="Delivered">Delivered</option>
              <option value="Invoiced">Invoiced</option>
            </select>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Total Packing Slips</p>
              <p className="text-2xl font-bold">{packingSlips.length}</p>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Pending</p>
              <p className="text-2xl font-bold">{packingSlips.filter(s => s.status === 'Pending').length}</p>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Shipped</p>
              <p className="text-2xl font-bold">{packingSlips.filter(s => s.status === 'Shipped').length}</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">To Invoice</p>
              <p className="text-2xl font-bold">{packingSlips.filter(s => !s.invoiced && s.status === 'Delivered').length}</p>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-500">Loading packing slips...</p>
            </div>
          ) : filteredPackingSlips.length === 0 ? (
            <div className="text-center py-12">
              <PackageCheck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No packing slips found</p>
              <p className="text-sm text-gray-400 mt-2">Create packing slips from Job Sheets</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Packing Slip #</TableHead>
                    <TableHead>Job Sheet #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Customer PO</TableHead>
                    <TableHead>Delivered</TableHead>
                    <TableHead>Backorder</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPackingSlips.map((slip) => (
                    <TableRow key={slip.id}>
                      <TableCell className="font-medium">{slip.packing_slip_number}</TableCell>
                      <TableCell>{slip.job_sheet_number}</TableCell>
                      <TableCell>{slip.customer_name}</TableCell>
                      <TableCell>{slip.customer_po_number || '-'}</TableCell>
                      <TableCell>
                        <span className="font-semibold text-green-600">{slip.total_delivered}</span>
                      </TableCell>
                      <TableCell>
                        <span className={`font-semibold ${slip.total_balance > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                          {slip.total_balance}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          <Badge className={getStatusColor(slip.status)}>
                            {slip.status}
                          </Badge>
                          {slip.invoiced && (
                            <Badge className="bg-purple-100 text-purple-800 border-purple-300">
                              ✓ Invoiced
                            </Badge>
                          )}
                          {!slip.invoiced && slip.status === 'Completed' && (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                              Ready to Invoice
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {new Date(slip.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => handlePrint(slip)}>
                            <Printer className="w-4 h-4" />
                          </Button>
                          {currentUser?.role === 'Administrator' && (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => handleDeleteSlip(slip)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Packing Slip Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Confirm Delete
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this packing slip? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          {slipToDelete && (
            <div className="bg-slate-50 p-4 rounded-lg space-y-2">
              <p><strong>Packing Slip #:</strong> {slipToDelete.packing_slip_number}</p>
              <p><strong>Customer:</strong> {slipToDelete.customer_name}</p>
              <p><strong>Quantity:</strong> {slipToDelete.quantity_delivered}</p>
              <p><strong>Status:</strong> {slipToDelete.status}</p>
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setDeleteDialogOpen(false);
                setSlipToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDeleteSlip}
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Packing Slip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PackingSlips;
