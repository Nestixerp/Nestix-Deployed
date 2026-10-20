import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { FileText, Edit, Printer, Search, Plus, Calendar, Package, PackageCheck, Trash2, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown, RotateCcw, Play, Square } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { formatDate, formatDateTime } from '../utils/dateFormatter';

const ToolingPicker = ({ label, options, value, onChange, testid, placeholder }) => {
  const [custom, setCustom] = useState(false);
  const inList = options.some(o => o.name === value);
  return (
    <div>
      <Label>{label}</Label>
      <select
        className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
        value={custom ? '__custom__' : (inList ? value : (value ? '__custom__' : ''))}
        onChange={(e) => {
          if (e.target.value === '__custom__') { setCustom(true); onChange(''); }
          else { setCustom(false); onChange(e.target.value); }
        }}
        data-testid={`${testid}-select`}
      >
        <option value="">— Select —</option>
        {options.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
        <option value="__custom__">+ Add new…</option>
      </select>
      {(custom || (value && !inList)) && (
        <Input
          className="mt-1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          data-testid={`${testid}-custom-input`}
        />
      )}
    </div>
  );
};

const JobSheets = () => {
  const { currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobSheets, setJobSheets] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' = soonest first, 'desc' = latest first
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedJobSheet, setSelectedJobSheet] = useState(null);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [jobSheetToDelete, setJobSheetToDelete] = useState(null);
  const [activeTimers, setActiveTimers] = useState({}); // Track which jobs have active timers
  const [editFormData, setEditFormData] = useState({
    due_date: '',
    purchase_order_number: '',
    quantity: 0
  });
  const [completionData, setCompletionData] = useState({
    operator_name: '',
    quantity_completed: 0,
    quantity_rejected: 0,
    reject_reason: '',
    start_time: '',
    end_time: '',
    production_notes: '',
    top_punch_used: '',
    v_die_used: ''
  });
  const [toolingOptions, setToolingOptions] = useState({ top_punch: [], v_die: [] });
  const [jobToolingSystem, setJobToolingSystem] = useState(null);
  const [timeFromShopFloor, setTimeFromShopFloor] = useState(false); // Track if time was auto-populated
  
  // Packing Slip States
  const [packingSlipDialogOpen, setPackingSlipDialogOpen] = useState(false);
  const [packingSlips, setPackingSlips] = useState([]);
  const [packingSlipFormData, setPackingSlipFormData] = useState({
    quantity_to_deliver: 0,
    customer_po_number: '',
    delivery_address: '',
    delivery_suburb: '',
    delivery_state: '',
    delivery_postcode: '',
    delivery_phone: '',
    delivery_instructions: '',
    time_ready: '',
    delivery_date: '',
    notes: ''
  });

  // Format date as "12 NOV 2025"
  const formatDueDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const day = date.getDate();
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  useEffect(() => {
    fetchJobSheets();
    fetchMetrics();
    fetchActiveTimers();
    
    // Refresh active timers every 30 seconds
    const interval = setInterval(fetchActiveTimers, 30000);
    return () => clearInterval(interval);
  }, []);

  // Check for 'view' query parameter to auto-open a job sheet
  useEffect(() => {
    const viewJobId = searchParams.get('view');
    if (viewJobId && jobSheets.length > 0 && !loading) {
      const jobToView = jobSheets.find(js => js.id === viewJobId);
      if (jobToView) {
        handleViewJobSheet(jobToView);
        // Clear the query parameter after opening
        setSearchParams({});
      }
    }
  }, [jobSheets, loading, searchParams]);

  const fetchJobSheets = async () => {
    try {
      const response = await api.get('/job-sheets');
      setJobSheets(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching job sheets:', error);
      setLoading(false);
    }
  };

  const fetchMetrics = async () => {
    try {
      const response = await api.get('/dashboard/metrics');
      setMetrics(response.data);
    } catch (error) {
      console.error('Error fetching metrics:', error);
    }
  };

  // Fetch active timers for all job sheets
  const fetchActiveTimers = async () => {
    try {
      const response = await api.get('/shop-floor/time-entries/active');
      const timers = {};
      response.data.forEach(entry => {
        timers[entry.job_sheet_id] = entry;
      });
      setActiveTimers(timers);
    } catch (error) {
      console.error('Error fetching active timers:', error);
    }
  };

  // Start timer for a job sheet
  const handleStartTimer = async (jobSheet) => {
    try {
      if (!currentUser?.id || !currentUser?.name) {
        alert('Error: Please log out and log in again to start a timer.');
        return;
      }

      const processName = jobSheet.process_name || 'General';
      
      await api.post('/shop-floor/time-entries', {
        job_sheet_id: jobSheet.id,
        job_sheet_number: jobSheet.job_sheet_number,
        process_id: jobSheet.process_id || null,
        process_name: processName,
        operator_id: currentUser.id,
        operator_name: currentUser.name
      });

      alert(`✓ Timer started for ${jobSheet.job_sheet_number}!`);
      fetchActiveTimers();
    } catch (error) {
      console.error('Error starting timer:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to start timer';
      alert(`Failed to start timer: ${errorMsg}`);
    }
  };

  // Stop timer for a job sheet
  const handleStopTimer = async (jobSheet) => {
    try {
      const activeTimer = activeTimers[jobSheet.id];
      if (!activeTimer) {
        alert('No active timer found for this job.');
        return;
      }

      await api.post(`/shop-floor/time-entries/${activeTimer.id}/stop`);
      alert(`✓ Timer stopped for ${jobSheet.job_sheet_number}!`);
      fetchActiveTimers();
    } catch (error) {
      console.error('Error stopping timer:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to stop timer';
      alert(`Failed to stop timer: ${errorMsg}`);
    }
  };

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  const handleViewJobSheet = (jobSheet) => {
    setSelectedJobSheet(jobSheet);
    setViewDialogOpen(true);
  };

  const handleEditJobSheet = (jobSheet) => {
    setSelectedJobSheet(jobSheet);
    setEditFormData({
      due_date: jobSheet.due_date ? jobSheet.due_date.split('T')[0] : '', // Format for input type="date"
      purchase_order_number: jobSheet.purchase_order_number || '',
      quantity: jobSheet.quantity || 0
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedJobSheet) return;

    try {
      await api.put(`/job-sheets/${selectedJobSheet.id}`, editFormData);
      setEditDialogOpen(false);
      setSelectedJobSheet(null);
      fetchJobSheets(); // Refresh the list
      alert('Job Sheet updated successfully');
    } catch (error) {
      console.error('Error updating job sheet:', error);
      alert('Failed to update job sheet: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleOpenCompleteDialog = async (jobSheet) => {
    if (/press|brake|fold/i.test(jobSheet.process_name || '')) {
      Promise.all([api.get('/tooling'), api.get('/machines')]).then(([tr, mr]) => {
        const machinesList = mr.data || [];
        const machine = machinesList.find(m => m.id === jobSheet.machine_id) ||
                        machinesList.find(m => m.machine_name === jobSheet.machine_name);
        const system = machine?.tooling_system || null;
        setJobToolingSystem(system);
        const items = (tr.data || []).filter(t => t.status === 'Active' && (!system || t.tooling_system === system));
        setToolingOptions({
          top_punch: items.filter(t => t.tooling_type === 'top_punch'),
          v_die: items.filter(t => t.tooling_type === 'v_die')
        });
      }).catch(() => {});
    }
    setSelectedJobSheet(jobSheet);
    
    // Initialize with default values
    let initialData = {
      operator_name: '',
      quantity_completed: jobSheet.quantity,
      quantity_rejected: 0,
      reject_reason: '',
      start_time: '',
      end_time: new Date().toISOString().slice(0, 16), // Current time in local format
      production_notes: '',
      top_punch_used: '',
      v_die_used: ''
    };
    
    // Try to fetch time entries from Shop Floor Entry to auto-populate
    try {
      const response = await api.get(`/shop-floor/time-entries/job-sheet/${jobSheet.id}`);
      const timeEntries = response.data;
      
      if (timeEntries && timeEntries.length > 0) {
        // Sort by start_time to get first and last entries
        const sortedEntries = [...timeEntries].sort((a, b) => 
          new Date(a.start_time) - new Date(b.start_time)
        );
        
        // Get the first entry's start time
        const firstEntry = sortedEntries[0];
        const firstStartTime = new Date(firstEntry.start_time);
        
        // Get the last entry's end time (or current time if still active)
        const lastEntry = sortedEntries[sortedEntries.length - 1];
        let lastEndTime;
        if (lastEntry.end_time) {
          lastEndTime = new Date(lastEntry.end_time);
        } else {
          lastEndTime = new Date(); // Use current time if not completed
        }
        
        // Format for datetime-local input (YYYY-MM-DDTHH:MM)
        const formatForInput = (date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          return `${year}-${month}-${day}T${hours}:${minutes}`;
        };
        
        // Get operator names from time entries
        const operators = [...new Set(timeEntries.map(e => e.operator_name).filter(Boolean))];
        const operatorName = operators.join(', ');
        
        // Calculate total actual time from completed entries
        const completedEntries = timeEntries.filter(e => e.status === 'completed');
        const totalActualMinutes = completedEntries.reduce((sum, e) => 
          sum + (e.actual_duration_minutes || 0), 0
        );
        
        // Collect notes from time entries
        const allNotes = timeEntries
          .flatMap(e => e.notes || [])
          .map(n => `[${n.category}] ${n.note}`)
          .join('\n');
        
        initialData = {
          ...initialData,
          operator_name: operatorName,
          start_time: formatForInput(firstStartTime),
          end_time: formatForInput(lastEndTime),
          production_notes: allNotes || ''
        };
        
        console.log('Auto-populated from Shop Floor Entry:', {
          operator: operatorName,
          start: formatForInput(firstStartTime),
          end: formatForInput(lastEndTime),
          totalMinutes: totalActualMinutes,
          entriesCount: timeEntries.length
        });
        
        setTimeFromShopFloor(true);
      } else {
        setTimeFromShopFloor(false);
      }
    } catch (error) {
      console.log('No Shop Floor time entries found for this job, using manual entry:', error.message);
      setTimeFromShopFloor(false);
    }
    
    setCompletionData(initialData);
    setCompleteDialogOpen(true);
  };

  const handleDeleteJobSheet = (jobSheet) => {
    setJobSheetToDelete(jobSheet);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteJobSheet = async () => {
    if (!jobSheetToDelete) return;
    
    try {
      await api.delete(`/job-sheets/${jobSheetToDelete.id}`);
      setDeleteDialogOpen(false);
      setJobSheetToDelete(null);
      fetchJobSheets(); // Refresh the list
      alert('Job Sheet deleted successfully');
    } catch (error) {
      console.error('Error deleting job sheet:', error);
      alert('Failed to delete job sheet: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleCompleteJobSheet = async () => {
    try {
      // Validate
      if (!completionData.operator_name) {
        alert('Please enter operator name');
        return;
      }
      if (!completionData.end_time) {
        alert('Please enter end time');
        return;
      }
      // Only validate that quantity completed doesn't exceed job quantity
      // Allow total (completed + rejected) to exceed if needed (e.g., 50 good + 1 reject = 51 total for 50 qty job)
      if (completionData.quantity_completed > selectedJobSheet.quantity) {
        alert(`Quantity completed (${completionData.quantity_completed}) cannot exceed job quantity (${selectedJobSheet.quantity})`);
        return;
      }

      // Prepare data for API
      const apiData = {
        operator_name: completionData.operator_name,
        quantity_completed: parseInt(completionData.quantity_completed),
        quantity_rejected: parseInt(completionData.quantity_rejected),
        reject_reason: completionData.reject_reason || null,
        start_time: completionData.start_time ? new Date(completionData.start_time).toISOString() : null,
        end_time: new Date(completionData.end_time).toISOString(),
        production_notes: completionData.production_notes || null,
        top_punch_used: completionData.top_punch_used || null,
        v_die_used: completionData.v_die_used || null
      };
      
      // Grow the tooling library with any newly typed tooling
      const saveNewTooling = (type, val, list) => {
        if (val && !list.some(o => o.name.toLowerCase() === val.toLowerCase())) {
          api.post('/tooling', { tooling_type: type, tooling_system: jobToolingSystem, name: val }).catch(() => {});
        }
      };
      saveNewTooling('top_punch', apiData.top_punch_used, toolingOptions.top_punch);
      saveNewTooling('v_die', apiData.v_die_used, toolingOptions.v_die);

      const response = await api.post(`/job-sheets/${selectedJobSheet.id}/complete`, apiData);
      
      alert(response.data.message);
      
      // Refresh job sheets list
      await fetchJobSheets();
      
      // Close dialog
      setCompleteDialogOpen(false);
      setSelectedJobSheet(null);
    } catch (error) {
      console.error('Error completing job sheet:', error);
      alert('Failed to complete job sheet: ' + (error.response?.data?.detail || error.message));
    }
  };


  // Packing Slip Handlers
  const handleOpenPackingSlipDialog = async (jobSheet) => {
    setSelectedJobSheet(jobSheet);
    
    // Fetch existing packing slips for this job sheet
    let existingSlips = [];
    let previouslyDelivered = 0;
    try {
      const slipsResponse = await api.get(`/packing-slips?job_sheet_id=${jobSheet.id}`);
      existingSlips = slipsResponse.data || [];
      previouslyDelivered = existingSlips.reduce((sum, slip) => sum + (slip.total_delivered || 0), 0);
      setPackingSlips(existingSlips);
    } catch (error) {
      console.error('Error fetching existing packing slips:', error);
    }
    
    // Fetch customer details to auto-populate delivery info
    let customerData = null;
    try {
      const response = await api.get(`/customers/${jobSheet.customer_id}`);
      customerData = response.data;
    } catch (error) {
      console.error('Error fetching customer data:', error);
    }
    
    // Calculate remaining quantity to deliver
    const completedQty = jobSheet.quantity_completed || jobSheet.quantity;
    const remainingToDeliver = completedQty - previouslyDelivered;
    
    // Set initial form data with job sheet info and customer delivery details
    setPackingSlipFormData({
      quantity_to_deliver: Math.max(0, remainingToDeliver),
      customer_po_number: jobSheet.purchase_order_number || '',
      delivery_address: customerData?.address || '',
      delivery_suburb: customerData?.suburb || '',
      delivery_state: customerData?.state || '',
      delivery_postcode: customerData?.postcode || '',
      delivery_phone: customerData?.phone || '',
      delivery_instructions: '',
      time_ready: '',
      delivery_date: new Date().toISOString().slice(0, 10), // Today's date
      notes: ''
    });
    
    setPackingSlipDialogOpen(true);
  };

  const handleCreatePackingSlip = async () => {
    try {
      // Validate
      if (!packingSlipFormData.quantity_to_deliver || packingSlipFormData.quantity_to_deliver <= 0) {
        alert('Please enter a valid quantity to deliver');
        return;
      }

      const maxQuantity = selectedJobSheet.quantity_completed || selectedJobSheet.quantity;
      if (packingSlipFormData.quantity_to_deliver > maxQuantity) {
        alert(`Quantity to deliver cannot exceed ${maxQuantity} pieces`);
        return;
      }

      // Fetch existing packing slips for this job sheet to calculate previously delivered quantity
      let previouslyDelivered = 0;
      try {
        const response = await api.get(`/packing-slips?job_sheet_id=${selectedJobSheet.id}`);
        const existingSlips = response.data || [];
        previouslyDelivered = existingSlips.reduce((sum, slip) => sum + (slip.total_delivered || 0), 0);
      } catch (error) {
        console.error('Error fetching existing packing slips:', error);
        // Continue anyway - better to create slip than fail completely
      }

      // Calculate correct balance: total ordered - (previously delivered + current delivery)
      const currentDelivery = parseInt(packingSlipFormData.quantity_to_deliver);
      const totalDelivered = previouslyDelivered + currentDelivery;
      const correctBalance = selectedJobSheet.quantity - totalDelivered;

      // Prepare packing slip data
      const packingSlipData = {
        job_sheet_id: selectedJobSheet.id,
        customer_po_number: packingSlipFormData.customer_po_number,
        delivery_address: packingSlipFormData.delivery_address,
        delivery_suburb: packingSlipFormData.delivery_suburb,
        delivery_state: packingSlipFormData.delivery_state,
        delivery_postcode: packingSlipFormData.delivery_postcode,
        delivery_phone: packingSlipFormData.delivery_phone,
        delivery_instructions: packingSlipFormData.delivery_instructions,
        time_ready: packingSlipFormData.time_ready,
        delivery_date: packingSlipFormData.delivery_date ? new Date(packingSlipFormData.delivery_date).toISOString() : null,
        notes: packingSlipFormData.notes,
        items: [
          {
            part_description: selectedJobSheet.part_description,
            material: selectedJobSheet.material || null,
            thickness: selectedJobSheet.thickness || null,
            qty_ordered: selectedJobSheet.quantity,
            qty_delivered: currentDelivery,
            qty_balance: correctBalance
          }
        ]
      };

      const response = await api.post('/packing-slips', packingSlipData);
      
      alert(`Packing slip ${response.data.packing_slip_number} created successfully!`);
      
      // Close dialog
      setPackingSlipDialogOpen(false);
      setSelectedJobSheet(null);
      
      // Refresh job sheets
      await fetchJobSheets();
    } catch (error) {
      console.error('Error creating packing slip:', error);
      alert('Failed to create packing slip: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleReopenJobSheet = async (jobSheetId) => {
    try {
      // Update job sheet status from 'Completed' to 'In Progress'
      await api.put(`/job-sheets/${jobSheetId}`, {
        status: 'In Progress'
      });
      
      alert('Job sheet reopened successfully');
      
      // Refresh the job sheets list
      await fetchJobSheets();
    } catch (error) {
      console.error('Error reopening job sheet:', error);
      alert('Failed to reopen job sheet: ' + (error.response?.data?.detail || error.message));
    }
  };


  const handleSyncFromQuote = async (jobSheet) => {
    try {
      const response = await api.post(`/job-sheets/${jobSheet.id}/sync-from-quote`);
      const updated = response.data;
      setJobSheets(prev => prev.map(j => (j.id === updated.id ? { ...j, ...updated } : j)));
      alert(`✓ ${jobSheet.job_sheet_number} updated from quote:\nMaterial: ${updated.material_type || '-'} | Thickness: ${updated.thickness || '-'} | Grade: ${updated.grade || '-'} | Finish: ${updated.finish || '-'}\n\nYou can now reprint the job sheet.`);
    } catch (error) {
      alert('Failed to sync from quote: ' + (error?.response?.data?.detail || error.message));
    }
  };

  const handlePrintJobSheet = async (jobSheet) => {
    // If job sheet is in "Pending" status, automatically update to "In Progress" when printing
    if (jobSheet.status === 'Pending') {
      try {
        await api.put(`/job-sheets/${jobSheet.id}`, {
          status: 'In Progress'
        });
        // Refresh the job sheets list to reflect the status change
        await fetchJobSheets();
        // Update the local jobSheet object for printing
        jobSheet = { ...jobSheet, status: 'In Progress' };
      } catch (error) {
        console.error('Error updating job sheet status:', error);
        // Continue with printing even if status update fails
      }
    }
    
    // Fetch Q.A. items from the linked quote if not on job sheet
    // This handles job sheets created before Q.A. items were added to the quote
    let qaInspectionItems = jobSheet.qa_inspection_items || [];
    let inspectionInterval = jobSheet.inspection_interval;
    
    if (qaInspectionItems.length === 0 && jobSheet.quote_id) {
      try {
        const quoteResponse = await api.get(`/quotes/${jobSheet.quote_id}`);
        const quote = quoteResponse.data;
        if (quote.qa_inspection_items && quote.qa_inspection_items.length > 0) {
          qaInspectionItems = quote.qa_inspection_items;
          // Update the job sheet with Q.A. items for future prints
          await api.put(`/job-sheets/${jobSheet.id}`, {
            qa_inspection_items: qaInspectionItems
          });
        }
      } catch (error) {
        console.error('Error fetching quote Q.A. items:', error);
      }
    }
    
    // Format due date as "28 NOV 2025"
    const formatDueDateForPrint = (dateString) => {
      if (!dateString) return 'N/A';
      const date = new Date(dateString);
      const day = date.getDate();
      const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const month = monthNames[date.getMonth()];
      const year = date.getFullYear();
      return `${day} ${month} ${year}`;
    };
    
    // Calculate total time for the job
    const numberOfBends = jobSheet.number_of_bends || 0;
    const secondsPerBend = jobSheet.time_per_bend || 30;
    const packingTime = jobSheet.packing_time || 0;
    const quantity = jobSheet.quantity || 1;
    const setupTimeMinutes = jobSheet.setup_time || 0;
    
    // Total bend time in minutes
    const totalBendTimeMinutes = (numberOfBends * secondsPerBend * quantity) / 60;
    // Total packing time in minutes
    const totalPackingTimeMinutes = (packingTime * quantity) / 60;
    // Total job time in minutes
    const totalJobTimeMinutes = setupTimeMinutes + totalBendTimeMinutes + totalPackingTimeMinutes;
    // Convert to hours and minutes
    const totalJobHours = Math.floor(totalJobTimeMinutes / 60);
    const totalJobMinutes = Math.round(totalJobTimeMinutes % 60);
    
    const printWindow = window.open('', '_blank');
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Job Sheet ${jobSheet.job_sheet_number}</title>
          <style>
            @page {
              size: A4;
              margin: 6mm;
            }
            body {
              font-family: Arial, sans-serif;
              padding: 0;
              margin: 0;
              font-size: 9pt;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #333;
              padding-bottom: 5px;
              margin-bottom: 10px;
              position: relative;
            }
            .header h1 {
              margin: 0;
              font-size: 16pt;
              color: #333;
            }
            .header h2 {
              color: #666;
              margin: 3px 0;
              font-size: 12pt;
            }
            .qr-code {
              position: absolute;
              top: 0;
              right: 0;
              text-align: center;
            }
            .qr-code img {
              width: 80px;
              height: 80px;
            }
            .qr-code-label {
              font-size: 7pt;
              color: #666;
              margin-top: 2px;
            }
            .section {
              margin-bottom: 8px;
              border: 1px solid #ddd;
              padding: 6px;
              border-radius: 3px;
              page-break-inside: avoid;
            }
            .section h2 {
              margin: 0 0 4px 0;
              color: #555;
              border-bottom: 1px solid #ddd;
              padding-bottom: 3px;
              font-size: 10pt;
            }
            .info-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 5px;
              font-size: 8.5pt;
            }
            .info-item {
              padding: 2px 0;
            }
            .label {
              font-weight: bold;
              color: #666;
            }
            .notes-box {
              background: #f9f9f9;
              border: 1px solid #ddd;
              padding: 6px;
              border-radius: 3px;
              min-height: 30px;
              font-size: 8.5pt;
            }
            .status-badge {
              display: inline-block;
              padding: 3px 10px;
              border-radius: 10px;
              font-weight: bold;
              font-size: 9pt;
            }
            .status-pending { background: #fef3c7; color: #92400e; }
            .status-in-progress { background: #dbeafe; color: #1e40af; }
            .status-completed { background: #d1fae5; color: #065f46; }
            .status-on-hold { background: #fee2e2; color: #991b1b; }
            .compact-grid {
              display: grid;
              grid-template-columns: 1fr 1fr 1fr;
              gap: 5px;
              font-size: 8.5pt;
            }
            .bullet-list {
              margin: 5px 0 5px 15px;
              padding: 0;
              font-size: 8.5pt;
              line-height: 1.4;
            }
            .bullet-list li {
              margin-bottom: 3px;
            }
            table.form-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 8.5pt;
            }
            table.form-table td {
              border: 1px solid #ddd;
              padding: 4px;
            }
            .underline-field {
              border-bottom: 1px solid #333;
              display: inline-block;
              min-width: 100px;
            }
            .highlight-box {
              background: #fef3c7;
              border: 2px solid #f59e0b;
              padding: 8px;
              margin: 8px 0;
              border-radius: 5px;
              text-align: center;
            }
            .highlight-box .big-field {
              font-size: 18pt;
              font-weight: bold;
              margin: 3px 0;
              color: #333;
            }
            .highlight-box .label-big {
              font-size: 9pt;
              color: #666;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .key-info-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 8px;
              margin: 8px 0;
            }
            .key-info-item {
              background: #f0f9ff;
              border: 2px solid #3b82f6;
              padding: 6px;
              border-radius: 4px;
              text-align: center;
            }
            .key-info-item .label-med {
              font-size: 8pt;
              color: #1e40af;
              font-weight: bold;
              text-transform: uppercase;
            }
            .key-info-item .value-med {
              font-size: 14pt;
              font-weight: bold;
              color: #1e3a8a;
              margin-top: 3px;
            }
            .part-box {
              background: #f8fafc;
              border: 2px solid #cbd5e1;
              padding: 6px;
              border-radius: 4px;
              margin-bottom: 8px;
            }
            .part-box .part-label {
              font-weight: bold;
              font-size: 8pt;
              color: #475569;
              margin-bottom: 3px;
            }
            .part-box .part-value {
              font-size: 11pt;
              font-weight: bold;
              color: #1e293b;
            }
            @page {
              size: A4;
              margin: 0;
            }
            @media print {
              button { display: none; }
              body { 
                print-color-adjust: exact; 
                -webkit-print-color-adjust: exact;
                zoom: 102%;
                -moz-transform: scale(1.02);
                -moz-transform-origin: 0 0;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="qr-code">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(jobSheet.job_sheet_number)}" alt="QR Code" />
              <div class="qr-code-label">Scan to Complete</div>
            </div>
            <h1>JOB SHEET</h1>
            <h2>${jobSheet.job_sheet_number}</h2>
            <span class="status-badge status-${jobSheet.status.toLowerCase().replace(' ', '-')}">${jobSheet.status}</span>
          </div>

          <!-- PROMINENT KEY INFORMATION -->
          <div class="highlight-box">
            <div class="label-big">Quantity Required</div>
            <div class="big-field" style="color: #16a34a;">${jobSheet.quantity} PARTS</div>
          </div>

          <div class="key-info-grid">
            <div class="key-info-item">
              <div class="label-med">Process</div>
              <div class="value-med">${jobSheet.process_name}</div>
            </div>
            ${jobSheet.machine_name ? `
            <div class="key-info-item" style="background: #f3e8ff; border-color: #9333ea;">
              <div class="label-med" style="color: #6b21a8;">Machine</div>
              <div class="value-med" style="color: #6b21a8; font-weight: 900;">${jobSheet.machine_name}</div>
            </div>` : ''}
            <div class="key-info-item" style="background: #fef3c7; border-color: #f59e0b;">
              <div class="label-med" style="color: #92400e;">Due Date</div>
              <div class="value-med" style="color: #92400e;">${formatDueDateForPrint(jobSheet.due_date)}</div>
            </div>
          </div>

          <div class="part-box">
            <div class="part-label">PART DESCRIPTION:</div>
            <div class="part-value">${jobSheet.part_description}</div>
          </div>

          <div class="section">
            <h2>📋 Job Information</h2>
            <div class="info-grid">
              <div class="info-item"><span class="label">Quote:</span> ${jobSheet.quote_number}</div>
              <div class="info-item"><span class="label">Customer:</span> ${jobSheet.customer_name}</div>
              <div class="info-item"><span class="label">PO #:</span> ${jobSheet.purchase_order_number || 'N/A'}</div>
              <div class="info-item"><span class="label">Drawing:</span> ${jobSheet.drawing_number || 'N/A'}</div>
            </div>
          </div>

          <div class="section" style="background: #fff8dc; border: 2px solid #d4a017; padding: 10px; border-radius: 4px;">
            <h2 style="color: #8b6914; margin-top: 0;">🧱 MATERIAL SPECIFICATION — VERIFY BEFORE FOLDING</h2>
            <table class="form-table" style="font-size: 13px;">
              <tr>
                <td style="width: 50%;"><span class="label">Material Type:</span> <strong>${jobSheet.material_type || jobSheet.material || 'N/A'}</strong></td>
                <td><span class="label">Grade:</span> <strong>${jobSheet.grade || 'N/A'}</strong></td>
              </tr>
              <tr>
                <td><span class="label">Thickness:</span> <strong>${jobSheet.thickness || 'N/A'}</strong></td>
                <td><span class="label">Finish:</span> <strong>${jobSheet.finish || 'N/A'}</strong></td>
              </tr>
            </table>
          </div>

          ${(jobSheet.processes && jobSheet.processes.length > 0) || jobSheet.setup_time || jobSheet.number_of_bends ? `
          <div class="section">
            <h2>🔧 Press Brake Specifications</h2>
            
            ${(jobSheet.last_used_top_punch || jobSheet.last_used_v_die) ? `
            <div style="background: #f3e8ff; border: 2px solid #9333ea; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px;">
              <div style="font-weight: 900; color: #6b21a8; font-size: 13px;">🔧 TOOLING — AS USED ON LAST RUN (${jobSheet.last_run_job_number || 'previous job'}${jobSheet.last_run_machine ? ` — ${jobSheet.last_run_machine}` : ''})</div>
              <div style="font-weight: 800; color: #111; font-size: 14px; margin-top: 2px;">Top Punch: ${jobSheet.last_used_top_punch || '—'} &nbsp;|&nbsp; V Die: ${jobSheet.last_used_v_die || '—'}</div>
              <div style="font-size: 10px; color: #6b21a8;">Supersedes quote tooling if different.</div>
            </div>` : ''}
            
            ${jobSheet.processes && jobSheet.processes.length > 0 ? `
              ${jobSheet.processes.map((process, index) => `
                <div style="margin-bottom: 20px; ${index > 0 ? 'border-top: 1px solid #ddd; padding-top: 15px;' : ''}">
                  <h3 style="margin-bottom: 10px; color: #2563EB;">Process ${index + 1}: ${process.process_name || 'Press Brake'}</h3>
                  <table class="form-table">
                    <tr>
                      <td style="width: 50%;"><span class="label">Setup Time (min):</span> ${process.setup_time || 'N/A'}</td>
                      <td><span class="label">Material:</span> ${process.material || jobSheet.material || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td><span class="label">Thickness (mm):</span> ${process.thickness || 'N/A'}</td>
                      <td><span class="label">No. of Bends:</span> ${process.number_of_bends || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td colspan="2"><span class="label">🔧 Tooling Required:</span> <strong>${(jobSheet.last_used_top_punch || jobSheet.last_used_v_die) ? `${[jobSheet.last_used_top_punch ? `Top Punch: ${jobSheet.last_used_top_punch}` : '', jobSheet.last_used_v_die ? `V Die: ${jobSheet.last_used_v_die}` : ''].filter(Boolean).join(' | ')} (as used on ${jobSheet.last_run_job_number})` : (process.tooling_required || 'Not specified')}</strong></td>
                    </tr>
                    <tr>
                      <td><span class="label">Bend Angles:</span> ${process.bend_angles || '___________________________'}</td>
                      <td><span class="label">Tonnage:</span> ${process.tonnage || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td><span class="label">Time per Part (sec):</span> ${process.time_per_part || 'N/A'}</td>
                      <td><span class="label">Bend Length (mm):</span> ${process.bend_length || 'N/A'}</td>
                    </tr>
                  </table>
                </div>
              `).join('')}
            ` : `
              <table class="form-table">
                <tr>
                  <td style="width: 50%;"><span class="label">Setup Time (min):</span> ${setupTimeMinutes}</td>
                  <td><span class="label">Material Type:</span> ${jobSheet.material}</td>
                </tr>
                <tr>
                  <td><span class="label">🔧 Tooling Required:</span> <strong>${(jobSheet.last_used_top_punch || jobSheet.last_used_v_die) ? `${[jobSheet.last_used_top_punch ? `Top Punch: ${jobSheet.last_used_top_punch}` : '', jobSheet.last_used_v_die ? `V Die: ${jobSheet.last_used_v_die}` : ''].filter(Boolean).join(' | ')} (as used on ${jobSheet.last_run_job_number})` : (jobSheet.tooling_required || 'Not specified')}</strong></td>
                  <td><span class="label">No. of Bends:</span> ${numberOfBends}</td>
                </tr>
                <tr>
                  <td><span class="label">Bend Angles:</span> ${jobSheet.bend_angles || '___________________________'}</td>
                  <td><span class="label">Tonnage:</span> ${jobSheet.tonnage || 'N/A'}</td>
                </tr>
              </table>
            `}
          </div>

          ${jobSheet.previous_production_notes ? `
          <div class="section">
            <h2>📝 Notes From Previous Runs</h2>
            <div style="border: 2px solid #f59e0b; background: #fffbeb; border-radius: 6px; padding: 8px 12px; white-space: pre-wrap; font-size: 12px; font-weight: 600;">${jobSheet.previous_production_notes}</div>
          </div>` : ''}

          <div class="section">
            <h2>⏱️ Time Tracking</h2>
            <table class="form-table">
              <tr>
                <td><span class="label">Setup Time:</span> ${setupTimeMinutes} min</td>
                <td><span class="label">Total Job Time:</span> ${totalJobHours}h ${totalJobMinutes}m (Est.)</td>
              </tr>
              <tr>
                <td><span class="label">Started:</span> <span class="underline-field"></span></td>
                <td><span class="label">Finished:</span> <span class="underline-field"></span></td>
              </tr>
              <tr>
                <td colspan="2"><span class="label">Operator:</span> <span class="underline-field" style="min-width: 300px;"></span></td>
              </tr>
            </table>
          </div>
          ` : `
          <div class="section">
            <h2>⏱️ Time Tracking</h2>
            <table class="form-table">
              <tr>
                <td><span class="label">Setup Time:</span> ${setupTimeMinutes} min</td>
                <td><span class="label">Total Job Time:</span> ${totalJobHours}h ${totalJobMinutes}m (Est.)</td>
              </tr>
              <tr>
                <td><span class="label">Started:</span> <span class="underline-field"></span></td>
                <td><span class="label">Finished:</span> <span class="underline-field"></span></td>
              </tr>
              <tr>
                <td colspan="2"><span class="label">Operator:</span> <span class="underline-field" style="min-width: 300px;"></span></td>
              </tr>
            </table>
          </div>
          `}

          ${jobSheet.process_notes ? `
          <div class="section">
            <h2>📝 Operator Awareness / Special Instructions</h2>
            <ul class="bullet-list">
              ${jobSheet.process_notes.split('\\n').map(note => note.trim()).filter(note => note).map(note => `<li>${note}</li>`).join('')}
            </ul>
          </div>
          ` : ''}

          <div class="section">
            <h2>📦 Packing / Handling</h2>
            <table class="form-table">
              <tr>
                <td style="width: 40%;"><span class="label">Pack Quantity:</span> <span class="underline-field"></span></td>
                <td><span class="label">Protection:</span> <span class="underline-field"></span></td>
              </tr>
              <tr>
                <td><span class="label">Pallet / Box No:</span> <span class="underline-field"></span></td>
                <td><span class="label">Packed By:</span> <span class="underline-field"></span></td>
              </tr>
            </table>
          </div>

          <div class="section">
            <h2>✅ Quality Check & Rejects</h2>
            <table class="form-table">
              <tr>
                <td style="width: 50%;"><strong>☐ Passed  ☐ Failed</strong> &nbsp; Inspector: <span class="underline-field"></span></td>
                <td><span class="label">Date:</span> <span class="underline-field"></span></td>
              </tr>
              <tr>
                <td><span class="label">Parts Produced:</span> <span class="underline-field"></span></td>
                <td><span class="label">Rejects / Scrap:</span> <span class="underline-field"></span></td>
              </tr>
              <tr>
                <td colspan="2"><span class="label">Reject Reason:</span> <span class="underline-field" style="min-width: 400px;"></span></td>
              </tr>
            </table>
          </div>

          <div class="section">
            <h2>🖊️ Sign-Off</h2>
            <table class="form-table">
              <tr>
                <td style="width: 50%;"><span class="label">Completed By:</span> <span class="underline-field" style="min-width: 200px;"></span></td>
                <td><span class="label">Date:</span> <span class="underline-field"></span></td>
              </tr>
              <tr>
                <td colspan="2"><span class="label">Signature:</span> <span class="underline-field" style="min-width: 300px;"></span></td>
              </tr>
            </table>
          </div>

          ${/* PAGE 2: Dimensional Inspection Checklist - Only shown if Q.A. items exist */
          qaInspectionItems && qaInspectionItems.length > 0 ? `
          <div class="page-break" style="page-break-before: always;"></div>
          
          <!-- PAGE 2: DIMENSIONAL INSPECTION CHECKLIST -->
          <div class="header" style="margin-top: 10px;">
            <h1>DIMENSIONAL INSPECTION CHECKLIST</h1>
            <h2>Page 2 of Job Sheet ${jobSheet.job_sheet_number}</h2>
          </div>
          
          <div class="section">
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
              <tr>
                <td style="width: 50%; padding: 4px;"><span class="label">Job Number:</span> <strong>${jobSheet.job_sheet_number}</strong></td>
                <td style="width: 50%; padding: 4px;"><span class="label">Drawing Number:</span> <strong>${jobSheet.drawing_number || 'N/A'}</strong></td>
              </tr>
              <tr>
                <td style="padding: 4px;"><span class="label">Customer:</span> <strong>${jobSheet.customer_name}</strong></td>
                <td style="padding: 4px;"><span class="label">Part Number:</span> <strong>${jobSheet.part_description || 'N/A'}</strong></td>
              </tr>
              <tr>
                <td style="padding: 4px;"><span class="label">Total Quantity:</span> <strong>${jobSheet.quantity}</strong></td>
                <td style="padding: 4px;"><span class="label">Inspection Interval:</span> <strong>${inspectionInterval ? `Every ${inspectionInterval} parts` : 'Not specified'}</strong></td>
              </tr>
            </table>
          </div>
          
          <div class="section">
            <h2 style="margin: 0 0 8px 0; font-size: 11pt; color: #333;">Inspection Record</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: #f3f4f6;">
                  <th style="border: 1px solid #333; padding: 6px; text-align: left; font-size: 9pt;">Check Item</th>
                  <th style="border: 1px solid #333; padding: 6px; text-align: center; font-size: 9pt; width: 60px;">Nominal</th>
                  <th style="border: 1px solid #333; padding: 6px; text-align: center; font-size: 9pt; width: 55px;">Tol.</th>
                  <th style="border: 1px solid #333; padding: 6px; text-align: center; font-size: 9pt; width: 60px; background: #fef3c7;">Min</th>
                  <th style="border: 1px solid #333; padding: 6px; text-align: center; font-size: 9pt; width: 60px; background: #fef3c7;">Max</th>
                  ${(() => {
                    const qty = jobSheet.quantity || 1;
                    const interval = inspectionInterval || Math.ceil(qty / 5);
                    const checkpoints = ['1st Off'];
                    for (let i = interval; i < qty; i += interval) {
                      checkpoints.push(i);
                    }
                    if (qty > 1) {
                      checkpoints.push(qty);
                    }
                    return checkpoints.map(cp => `<th style="border: 1px solid #333; padding: 6px; text-align: center; font-size: 9pt; width: 55px;">${cp === '1st Off' ? cp : 'Qty ' + cp}</th>`).join('');
                  })()}
                </tr>
              </thead>
              <tbody>
                ${qaInspectionItems.map(item => {
                  const tolStr = String(item.tolerance ?? '');
                  const tolMatch = tolStr.match(/[-+]?\d*\.?\d+/);
                  const tolNum = tolMatch ? Math.abs(parseFloat(tolMatch[0])) : 0;
                  const nominal = parseFloat(item.nominal_value) || 0;
                  const minVal = nominal - tolNum;
                  const maxVal = nominal + tolNum;
                  const unit = item.type === 'angle' ? '°' : ' mm';
                  const fmt = (n) => Number.isFinite(n) ? (Number.isInteger(n) ? n : Number(n.toFixed(3))) : '—';
                  return `
                  <tr>
                    <td style="border: 1px solid #333; padding: 6px; font-size: 9pt;">
                      ${item.type === 'angle' ? '∠' : '↔'} ${item.description || 'Unnamed'}
                    </td>
                    <td style="border: 1px solid #333; padding: 6px; text-align: center; font-size: 9pt;">
                      ${item.nominal_value}${unit}
                    </td>
                    <td style="border: 1px solid #333; padding: 6px; text-align: center; font-size: 8pt;">
                      ${item.tolerance || '±0.5'}
                    </td>
                    <td style="border: 1px solid #333; padding: 6px; text-align: center; font-size: 9pt; background: #fefce8; font-weight: bold;">
                      ${fmt(minVal)}${unit}
                    </td>
                    <td style="border: 1px solid #333; padding: 6px; text-align: center; font-size: 9pt; background: #fefce8; font-weight: bold;">
                      ${fmt(maxVal)}${unit}
                    </td>
                    ${(() => {
                      const qty = jobSheet.quantity || 1;
                      const interval = inspectionInterval || Math.ceil(qty / 5);
                      const checkpoints = ['1st Off'];
                      for (let i = interval; i < qty; i += interval) {
                        checkpoints.push(i);
                      }
                      if (qty > 1) {
                        checkpoints.push(qty);
                      }
                      return checkpoints.map(() => `<td style="border: 1px solid #333; padding: 6px; text-align: center; min-height: 25px;"></td>`).join('');
                    })()}
                  </tr>
                `;
                }).join('')}
              </tbody>
            </table>
          </div>
          
          <div class="section" style="margin-top: 15px;">
            <h2 style="margin: 0 0 8px 0; font-size: 11pt; color: #333;">Operator Sign-Off</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px; width: 33%;"><span class="label">Inspector Name:</span> <span class="underline-field" style="min-width: 150px;"></span></td>
                <td style="padding: 6px; width: 33%;"><span class="label">Date:</span> <span class="underline-field" style="min-width: 100px;"></span></td>
                <td style="padding: 6px; width: 34%;"><span class="label">Signature:</span> <span class="underline-field" style="min-width: 150px;"></span></td>
              </tr>
            </table>
            <div style="margin-top: 10px; padding: 8px; background: #fef3c7; border: 1px solid #d97706; border-radius: 4px;">
              <p style="margin: 0; font-size: 8pt; color: #92400e;">
                <strong>Instructions:</strong> Record actual measurements at each quantity checkpoint. 
                All dimensions in mm, angles in degrees (°). 
                If any measurement is out of tolerance, stop production and notify supervisor immediately.
              </p>
            </div>
          </div>
          ` : ''}

          <div style="margin-top: 10px; text-align: center;">
            <button onclick="window.print()" style="padding: 8px 24px; background: #333; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11pt;">
              🖨️ Print${qaInspectionItems && qaInspectionItems.length > 0 ? ' (2 Pages)' : ''}
            </button>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const getStatusColor = (status) => {
    const colors = {
      'Pending': 'bg-yellow-100 text-yellow-800',
      'In Progress': 'bg-blue-100 text-blue-800',
      'Completed': 'bg-green-100 text-green-800',
      'On Hold': 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const filteredJobSheets = jobSheets.filter(js => {
    const matchesSearch = !searchTerm || 
      js.job_sheet_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      js.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      js.part_description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (js.purchase_order_number && js.purchase_order_number.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = !statusFilter || js.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
    // Sort by due date
    if (a.due_date && b.due_date) {
      const dateA = new Date(a.due_date);
      const dateB = new Date(b.due_date);
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    } else if (a.due_date) {
      return -1; // a has date, b doesn't - put a first
    } else if (b.due_date) {
      return 1; // b has date, a doesn't - put b first
    }
    return 0; // neither has date
  });

  if (loading) {
    return <div className="p-8">Loading job sheets...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Metrics Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Active Work Hours */}
        <div className="p-4 border border-slate-200 bg-white rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-700">Active Work</p>
              <p className="text-sm text-slate-500 mt-1">In-progress & pending job sheets</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-green-600">
                ${(metrics?.active_work_value || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {metrics?.hours_active_work?.toFixed(1) || '0.0'} hours
              </p>
            </div>
          </div>
        </div>

        {/* Active Jobs Count */}
        <div className="p-4 border border-slate-200 bg-white rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-700">Active Jobs</p>
              <p className="text-sm text-slate-500 mt-1">In-progress & pending</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-blue-600">
                {jobSheets.filter(js => js.status === 'In Progress' || js.status === 'Pending').length}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                of {jobSheets.length} total
              </p>
            </div>
          </div>
        </div>

        {/* Jobs Entered Today */}
        <div className="p-4 border border-slate-200 bg-white rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-700">Jobs Entered Today</p>
              <p className="text-sm text-slate-500 mt-1">New job sheets created</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-purple-600">
                {metrics?.jobs_entered_today || 0}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {(metrics?.jobs_entered_today_hours || 0).toFixed(1)} hours
              </p>
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="w-6 h-6" />
              Job Sheets
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search job sheets..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border rounded-md"
            >
              <option value="">All Status</option>
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="On Hold">On Hold</option>
            </select>
          </div>

          {/* Job Sheets Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job Sheet #</TableHead>
                <TableHead>Quote #</TableHead>
                <TableHead>Process</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Part</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>PO #</TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-slate-50 select-none"
                  onClick={toggleSortOrder}
                >
                  <div className="flex items-center gap-2">
                    Due Date
                    {sortOrder === 'asc' ? (
                      <ArrowUp className="w-4 h-4 text-blue-600" />
                    ) : (
                      <ArrowDown className="w-4 h-4 text-blue-600" />
                    )}
                  </div>
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredJobSheets.map((js) => (
                <TableRow key={js.id}>
                  <TableCell className="font-medium">{js.job_sheet_number}</TableCell>
                  <TableCell>{js.quote_number}</TableCell>
                  <TableCell>
                    <div className="font-bold text-blue-700 text-lg">{js.process_name}</div>
                  </TableCell>
                  <TableCell>{js.customer_name}</TableCell>
                  <TableCell>
                    <div className="font-semibold text-gray-900 text-base">{js.part_description}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-bold text-green-700 text-xl">{js.quantity}</div>
                    <div className="text-xs text-gray-500">parts</div>
                  </TableCell>
                  <TableCell>{js.purchase_order_number || '-'}</TableCell>
                  <TableCell>
                    <div className="font-bold text-orange-600 text-base whitespace-nowrap">
                      {formatDueDate(js.due_date)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(js.status)}>{js.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewJobSheet(js)}
                        title="View"
                      >
                        <FileText className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditJobSheet(js)}
                        title="Edit"
                        className="text-blue-600 hover:text-blue-700"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSyncFromQuote(js)}
                        title="Sync material specs from Quote (then reprint)"
                        className="text-purple-600 hover:text-purple-700"
                        data-testid={`sync-job-sheet-${js.job_sheet_number}`}
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePrintJobSheet(js)}
                        title="Print"
                      >
                        <Printer className="w-4 h-4" />
                      </Button>
                      {js.status !== 'Completed' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenCompleteDialog(js)}
                          title="Complete Job"
                          className="text-green-600 hover:text-green-700"
                        >
                          <Package className="w-4 h-4" />
                        </Button>
                      )}
                      {js.status === 'Completed' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenPackingSlipDialog(js)}
                            title="Create Packing Slip"
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <PackageCheck className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReopenJobSheet(js.id)}
                            title="Reopen Job Sheet (for additional production)"
                            className="text-orange-600 hover:text-orange-700"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      {currentUser?.role === 'Administrator' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteJobSheet(js)}
                          title="Delete"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
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

          {filteredJobSheets.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No job sheets found. Create one from a quote process.
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Job Sheet Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Job Sheet {selectedJobSheet?.job_sheet_number}</DialogTitle>
          </DialogHeader>
          {selectedJobSheet && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><strong>Quote:</strong> {selectedJobSheet.quote_number}</div>
                <div><strong>Process:</strong> {selectedJobSheet.process_name}</div>
                {selectedJobSheet.machine_name && (
                  <div><strong>Machine:</strong> <span className="font-bold text-purple-800">{selectedJobSheet.machine_name}</span></div>
                )}
                {selectedJobSheet.top_punch_used && (
                  <div><strong>Top Punch Used:</strong> {selectedJobSheet.top_punch_used}</div>
                )}
                {selectedJobSheet.v_die_used && (
                  <div><strong>V Die Used:</strong> {selectedJobSheet.v_die_used}</div>
                )}
                {(selectedJobSheet.last_used_top_punch || selectedJobSheet.last_used_v_die) && (
                  <div data-testid="last-run-tooling">
                    <strong>Last Run Tooling ({selectedJobSheet.last_run_job_number}):</strong>{' '}
                    Top Punch {selectedJobSheet.last_used_top_punch || '—'}, V Die {selectedJobSheet.last_used_v_die || '—'}
                    {selectedJobSheet.last_run_machine ? ` — on ${selectedJobSheet.last_run_machine}` : ''}
                  </div>
                )}
                {selectedJobSheet.previous_production_notes && (
                  <div data-testid="previous-run-notes">
                    <strong>Previous Run Notes:</strong>{' '}
                    <span className="whitespace-pre-wrap">{selectedJobSheet.previous_production_notes}</span>
                  </div>
                )}
                <div><strong>Customer:</strong> {selectedJobSheet.customer_name}</div>
                <div><strong>Part:</strong> {selectedJobSheet.part_description}</div>
                <div><strong>Quantity:</strong> {selectedJobSheet.quantity}</div>
                <div><strong>PO Number:</strong> {selectedJobSheet.purchase_order_number || 'N/A'}</div>
                <div><strong>Due Date:</strong> {formatDate(selectedJobSheet.due_date)}</div>
                <div><strong>Status:</strong> <Badge className={getStatusColor(selectedJobSheet.status)}>{selectedJobSheet.status}</Badge></div>
              </div>

              {selectedJobSheet.process_notes && (
                <div>
                  <h3 className="font-semibold mb-2">Process Notes</h3>
                  <div className="bg-gray-50 p-3 rounded whitespace-pre-wrap">
                    {selectedJobSheet.process_notes}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
            <Button onClick={() => handlePrintJobSheet(selectedJobSheet)}>
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Job Sheet Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Job Sheet {selectedJobSheet?.job_sheet_number}</DialogTitle>
            <DialogDescription>
              Update due date, purchase order number, or quantity
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-due-date">Due Date</Label>
              <Input
                id="edit-due-date"
                type="date"
                value={editFormData.due_date}
                onChange={(e) => setEditFormData({ ...editFormData, due_date: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-po-number">Purchase Order Number</Label>
              <Input
                id="edit-po-number"
                type="text"
                placeholder="Enter PO Number"
                value={editFormData.purchase_order_number}
                onChange={(e) => setEditFormData({ ...editFormData, purchase_order_number: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-quantity">Quantity</Label>
              <Input
                id="edit-quantity"
                type="number"
                min="1"
                value={editFormData.quantity}
                onChange={(e) => setEditFormData({ ...editFormData, quantity: parseInt(e.target.value) || 0 })}
              />
            </div>

            {selectedJobSheet && (
              <div className="bg-slate-50 p-3 rounded-lg text-sm">
                <p className="font-semibold mb-1">Current Values:</p>
                <p><strong>Due Date:</strong> {formatDate(selectedJobSheet.due_date)}</p>
                <p><strong>PO Number:</strong> {selectedJobSheet.purchase_order_number || 'N/A'}</p>
                <p><strong>Quantity:</strong> {selectedJobSheet.quantity}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Complete Job Sheet Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Complete Job Sheet</DialogTitle>
            <DialogDescription>
              Job Sheet: {selectedJobSheet?.job_sheet_number} | Job Quantity: {selectedJobSheet?.quantity}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Shop Floor Entry Data Indicator */}
            {timeFromShopFloor && (
              <div className="bg-green-50 border border-green-200 p-3 rounded-lg text-sm flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-green-600" />
                <span className="text-green-800">
                  <strong>Time data auto-populated from Shop Floor Entry.</strong> You can adjust if needed.
                </span>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Operator Name *</Label>
                <Input
                  value={completionData.operator_name}
                  onChange={(e) => setCompletionData({...completionData, operator_name: e.target.value})}
                  placeholder="Enter operator name"
                />
              </div>
              <div>
                <Label>Quantity Completed * (Max: {selectedJobSheet?.quantity})</Label>
                <Input
                  type="number"
                  value={completionData.quantity_completed}
                  onChange={(e) => setCompletionData({...completionData, quantity_completed: e.target.value})}
                  min="0"
                  max={selectedJobSheet?.quantity}
                  placeholder="Enter completed quantity"
                />
                <p className="text-xs text-gray-500 mt-1">Can complete partial quantity</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantity Rejected</Label>
                <Input
                  type="number"
                  value={completionData.quantity_rejected}
                  onChange={(e) => setCompletionData({...completionData, quantity_rejected: e.target.value})}
                  min="0"
                />
              </div>
              <div>
                <Label>Reject Reason</Label>
                <Input
                  value={completionData.reject_reason}
                  onChange={(e) => setCompletionData({...completionData, reject_reason: e.target.value})}
                  placeholder="If any parts rejected"
                  disabled={completionData.quantity_rejected == 0}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="flex items-center gap-2">
                  Start Time {timeFromShopFloor ? '' : '(Optional)'}
                  {timeFromShopFloor && completionData.start_time && (
                    <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">From Shop Floor</Badge>
                  )}
                </Label>
                <Input
                  type="datetime-local"
                  value={completionData.start_time}
                  onChange={(e) => setCompletionData({...completionData, start_time: e.target.value})}
                />
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  End Time *
                  {timeFromShopFloor && completionData.end_time && (
                    <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">From Shop Floor</Badge>
                  )}
                </Label>
                <Input
                  type="datetime-local"
                  value={completionData.end_time}
                  onChange={(e) => setCompletionData({...completionData, end_time: e.target.value})}
                />
              </div>
            </div>
            
            <div>
              <Label>Production Notes</Label>
              <Textarea
                value={completionData.production_notes}
                onChange={(e) => setCompletionData({...completionData, production_notes: e.target.value})}
                placeholder="Any additional notes about the job"
                rows={3}
              />
            </div>
            
            {/* Press Brake tooling used */}
            {/press|brake|fold/i.test(selectedJobSheet?.process_name || '') && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3" data-testid="pb-tooling-section">
                <div className="font-semibold text-sm text-purple-900 mb-2">
                  🔧 Press Brake Tooling Used{jobToolingSystem ? ` — ${jobToolingSystem === 'Wila' ? 'Wila Library' : 'Euro Type Tooling'}` : ''}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <ToolingPicker
                    label="Top Punch Used"
                    options={toolingOptions.top_punch}
                    value={completionData.top_punch_used}
                    onChange={(v) => setCompletionData({...completionData, top_punch_used: v})}
                    testid="top-punch"
                    placeholder="e.g. 11.049 (R8)"
                  />
                  <ToolingPicker
                    label="V Die Used"
                    options={toolingOptions.v_die}
                    value={completionData.v_die_used}
                    onChange={(v) => setCompletionData({...completionData, v_die_used: v})}
                    testid="v-die"
                    placeholder="e.g. V40"
                  />
                </div>
                <p className="text-xs text-purple-600 mt-1">Pick from the tooling library, or choose &quot;+ Add new…&quot; to type it — new tooling is saved to the library automatically. Manage the library on the Machines page.</p>
              </div>
            )}
            
            {/* Validation Summary */}
            <div className="bg-blue-50 p-3 rounded text-sm">
              <strong>Summary:</strong><br/>
              Completed: {parseInt(completionData.quantity_completed || 0)} parts (Job: {selectedJobSheet?.quantity})<br/>
              Rejected: {parseInt(completionData.quantity_rejected || 0)} parts<br/>
              Total Processed: {parseInt(completionData.quantity_completed || 0) + parseInt(completionData.quantity_rejected || 0)} parts
              {parseInt(completionData.quantity_completed || 0) > (selectedJobSheet?.quantity || 0) && (
                <div className="text-red-600 mt-1">⚠️ Completed quantity exceeds job quantity!</div>
              )}
              {parseInt(completionData.quantity_completed || 0) < (selectedJobSheet?.quantity || 0) && parseInt(completionData.quantity_rejected || 0) === 0 && (
                <div className="text-gray-600 mt-1">ℹ️ Partial completion (no rejects)</div>
              )}
              {parseInt(completionData.quantity_rejected || 0) > 0 && (
                <div className="text-orange-600 mt-1">⚠️ {parseInt(completionData.quantity_rejected || 0)} part(s) rejected</div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCompleteJobSheet} className="bg-green-600 hover:bg-green-700">
              Complete Job Sheet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Job Sheet Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Confirm Delete
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this job sheet? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          {jobSheetToDelete && (
            <div className="bg-slate-50 p-4 rounded-lg space-y-2">
              <p><strong>Job Sheet #:</strong> {jobSheetToDelete.job_sheet_number}</p>
              <p><strong>Customer:</strong> {jobSheetToDelete.customer_name}</p>
              <p><strong>Part:</strong> {jobSheetToDelete.part_description}</p>
              <p><strong>Status:</strong> {jobSheetToDelete.status}</p>
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setDeleteDialogOpen(false);
                setJobSheetToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDeleteJobSheet}
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Job Sheet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Packing Slip Dialog */}
      <Dialog open={packingSlipDialogOpen} onOpenChange={setPackingSlipDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Packing Slip</DialogTitle>
            <DialogDescription>
              {selectedJobSheet && `Job Sheet: ${selectedJobSheet.job_sheet_number} - ${selectedJobSheet.part_description}`}
            </DialogDescription>
          </DialogHeader>

          {selectedJobSheet && (
            <div className="space-y-4">
              {/* Job Summary */}
              <div className="bg-blue-50 p-4 rounded-md">
                <h3 className="font-semibold mb-2">Job Information</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="font-medium">Customer:</span> {selectedJobSheet.customer_name}</div>
                  <div><span className="font-medium">PO Number:</span> {selectedJobSheet.purchase_order_number || 'N/A'}</div>
                  <div><span className="font-medium">Total Quantity:</span> {selectedJobSheet.quantity} pieces</div>
                  <div><span className="font-medium">Completed:</span> {selectedJobSheet.quantity_completed || selectedJobSheet.quantity} pieces</div>
                </div>
              </div>

              {/* Delivery Quantity */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Quantity to Deliver *</Label>
                  <Input
                    type="number"
                    value={packingSlipFormData.quantity_to_deliver}
                    onChange={(e) => setPackingSlipFormData(prev => ({ ...prev, quantity_to_deliver: parseInt(e.target.value) || 0 }))}
                    placeholder="Enter quantity"
                    min="1"
                    max={selectedJobSheet.quantity_completed || selectedJobSheet.quantity}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Backorder: {(() => {
                      const previouslyDelivered = packingSlips.reduce((sum, slip) => sum + (slip.total_delivered || 0), 0);
                      const currentDelivery = packingSlipFormData.quantity_to_deliver || 0;
                      return Math.max(0, selectedJobSheet.quantity - previouslyDelivered - currentDelivery);
                    })()} pieces
                  </p>
                </div>
                <div>
                  <Label>Customer PO Number</Label>
                  <Input
                    value={packingSlipFormData.customer_po_number}
                    onChange={(e) => setPackingSlipFormData(prev => ({ ...prev, customer_po_number: e.target.value }))}
                    placeholder="PO number"
                  />
                </div>
              </div>

              {/* Delivery Address */}
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Delivery Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>Delivery Address</Label>
                    <Input
                      value={packingSlipFormData.delivery_address}
                      onChange={(e) => setPackingSlipFormData(prev => ({ ...prev, delivery_address: e.target.value }))}
                      placeholder="Street address"
                    />
                  </div>
                  <div>
                    <Label>Suburb</Label>
                    <Input
                      value={packingSlipFormData.delivery_suburb}
                      onChange={(e) => setPackingSlipFormData(prev => ({ ...prev, delivery_suburb: e.target.value }))}
                      placeholder="Suburb"
                    />
                  </div>
                  <div>
                    <Label>State</Label>
                    <select
                      className="w-full border rounded-md p-2"
                      value={packingSlipFormData.delivery_state}
                      onChange={(e) => setPackingSlipFormData(prev => ({ ...prev, delivery_state: e.target.value }))}
                    >
                      <option value="">Select state</option>
                      <option value="NSW">NSW</option>
                      <option value="VIC">VIC</option>
                      <option value="QLD">QLD</option>
                      <option value="SA">SA</option>
                      <option value="WA">WA</option>
                      <option value="TAS">TAS</option>
                      <option value="ACT">ACT</option>
                      <option value="NT">NT</option>
                    </select>
                  </div>
                  <div>
                    <Label>Postcode</Label>
                    <Input
                      value={packingSlipFormData.delivery_postcode}
                      onChange={(e) => setPackingSlipFormData(prev => ({ ...prev, delivery_postcode: e.target.value }))}
                      placeholder="Postcode"
                    />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input
                      value={packingSlipFormData.delivery_phone}
                      onChange={(e) => setPackingSlipFormData(prev => ({ ...prev, delivery_phone: e.target.value }))}
                      placeholder="Contact phone"
                    />
                  </div>
                  <div>
                    <Label>Time Ready</Label>
                    <Input
                      value={packingSlipFormData.time_ready}
                      onChange={(e) => setPackingSlipFormData(prev => ({ ...prev, time_ready: e.target.value }))}
                      placeholder="e.g., AM, PM, 2:00 PM"
                    />
                  </div>
                  <div>
                    <Label>Delivery Date</Label>
                    <Input
                      type="date"
                      value={packingSlipFormData.delivery_date}
                      onChange={(e) => setPackingSlipFormData(prev => ({ ...prev, delivery_date: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Delivery Instructions & Notes */}
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label>Delivery Instructions</Label>
                  <Textarea
                    value={packingSlipFormData.delivery_instructions}
                    onChange={(e) => setPackingSlipFormData(prev => ({ ...prev, delivery_instructions: e.target.value }))}
                    placeholder="Special delivery instructions..."
                    rows={2}
                  />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea
                    value={packingSlipFormData.notes}
                    onChange={(e) => setPackingSlipFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Additional notes..."
                    rows={2}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPackingSlipDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreatePackingSlip} className="bg-blue-600 hover:bg-blue-700">
              <PackageCheck className="w-4 h-4 mr-2" />
              Create Packing Slip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default JobSheets;
