import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Plus, Search, FileText, Edit, Trash2, AlertCircle, DollarSign, Package, UserPlus, X, Printer, Send, ChevronDown, ChevronUp, Download, CheckCircle, Copy, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { formatDate, formatDateTime, getCurrentDateInSystemTimezone } from '../utils/dateFormatter';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const Quotes = () => {
  const { currentUser } = useAuth();
  const [quotes, setQuotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [materialTypeFilter, setMaterialTypeFilter] = useState('');
  const [materialThicknessFilter, setMaterialThicknessFilter] = useState('');
  const [materialGradeFilter, setMaterialGradeFilter] = useState('');
  const [customerContacts, setCustomerContacts] = useState([]); // Add customer contacts state
  const [customMaterials, setCustomMaterials] = useState(() => {
    // Load custom materials from localStorage
    const saved = localStorage.getItem('customMaterials');
    return saved ? JSON.parse(saved) : [];
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const savingDraftRef = React.useRef(false);

  // --- Server-side draft save: unfinished quotes keep their quote number ---
  const hasDraftContent = () =>
    !!(formData.customer_name || formData.part_description || lineItems.length > 0);

  const saveDraftQuote = async () => {
    if (savingDraftRef.current) return null;
    savingDraftRef.current = true;
    try {
      const payload = {
        ...formData,
        customer_name: formData.customer_name || '(Draft — no customer yet)',
        processes: formData.processes || [],
        is_multi_item: lineItems.length > 0,
        line_items: lineItems,
        quantity_breaks: formData.quantity_breaks || [],
        qa_inspection_items: formData.qa_inspection_items || [],
        is_draft: true,
        created_by: 'admin'
      };
      const res = await api.post('/quotes', payload);
      localStorage.removeItem('quote_draft');
      fetchQuotes();
      return res.data;
    } catch (e) {
      console.error('Draft save failed:', e);
      return null;
    } finally {
      savingDraftRef.current = false;
    }
  };

  const saveDraftOnLeave = async () => {
    if (!editingQuote && hasDraftContent()) {
      const d = await saveDraftQuote();
      if (d) {
        alert(`Your unfinished quote was saved as Draft Quote #${d.quote_number}.\nOpen it from the quotes list (Edit) to continue where you left off.`);
      }
      return d;
    }
    return null;
  };
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [jobSheetDialogOpen, setJobSheetDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [quoteToDelete, setQuoteToDelete] = useState(null);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [editingQuote, setEditingQuote] = useState(null);
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [settings, setSettings] = useState({ quote_validity_days: 30 }); // Default to 30 days
  
  // Multi-Item Quote Support
  const [isMultiItem, setIsMultiItem] = useState(false);
  const [lineItems, setLineItems] = useState([]);
  const [activeLineItem, setActiveLineItem] = useState(null); // Currently editing line item
  const [expandedLineItems, setExpandedLineItems] = useState({}); // Track which line items are expanded
  
  // Multi-Item Job Sheet Generation
  const [multiItemJobSheetDialogOpen, setMultiItemJobSheetDialogOpen] = useState(false);
  const [selectedLineItemsForJobSheet, setSelectedLineItemsForJobSheet] = useState([]);
  const [existingJobSheetsForQuote, setExistingJobSheetsForQuote] = useState([]);
  // Per-line-item overrides for Generate Job Sheets dialog: {[lineIndex]: { quantity, unit_price_ex_gst }}
  const [lineJobOverrides, setLineJobOverrides] = useState({});
  const [multiItemJobSheetData, setMultiItemJobSheetData] = useState({
    purchase_order_number: '',
    due_date: ''
  });
  
  const [jobSheetFormData, setJobSheetFormData] = useState({
    quantity: 0,
    purchase_order_number: '',
    due_date: '',
    inspection_interval: '',  // Q.A. inspection interval (e.g., every 20 parts)
    unit_price: 0,  // Unit price (can be adjusted)
    unit_price_ex_gst: 0,  // Unit price ex GST
    machine_id: ''  // Press Brake machine selection
  });
  
  // Press Brake machine selection + previous-run part history
  const [pressBrakeMachines, setPressBrakeMachines] = useState([]);
  // Tooling-on-quote: library pickers for estimators
  const [toolingLib, setToolingLib] = useState([]);
  const [toolingMachines, setToolingMachines] = useState([]);
  const [processToolingSel, setProcessToolingSel] = useState({});
  useEffect(() => {
    api.get('/tooling').then(r => setToolingLib((r.data || []).filter(t => t.status === 'Active'))).catch(() => {});
    api.get('/machines').then(r => setToolingMachines((r.data || []).filter(m => /press/i.test(m.machine_type || '')))).catch(() => {});
  }, []);
  const toolingSystemLabel = (sys) => {
    const names = toolingMachines.filter(m => m.tooling_system === sys).map(m => m.machine_name);
    return names.length ? ` (${names.join(', ')})` : '';
  };
  const updateToolingSel = (pid, patch) => {
    const cur = { ...(processToolingSel[pid] || {}), ...patch };
    setProcessToolingSel(prev => ({ ...prev, [pid]: cur }));
    const parts = [];
    if (cur.punch) parts.push(`Punch: ${cur.punch}`);
    if (cur.die) parts.push(`Die: ${cur.die}`);
    if (parts.length) handleProcessChange(pid, 'tooling_required', parts.join('  '));
  };
  const [partHistory, setPartHistory] = useState([]);
  const [partHistoryOpen, setPartHistoryOpen] = useState(false);
  const loadPressBrakeMachines = async () => {
    try {
      const [mr, wr] = await Promise.all([
        api.get('/machines'),
        api.get('/job-sheets/machine-workload/summary').catch(() => ({ data: { machines: [] } }))
      ]);
      const counts = {};
      (wr.data.machines || []).forEach(w => { counts[w.machine_id] = w.open_jobs; });
      setPressBrakeMachines(
        (mr.data || [])
          .filter(m => m.status === 'Active')
          .map(m => ({ ...m, open_jobs: counts[m.id] || 0 }))
      );
    } catch { setPressBrakeMachines([]); }
  };
  // Machines whose type/name matches the process (e.g. "Laser Cutting" -> Laser machines); all if no match
  const machinesForProcess = (processName) => {
    const words = (processName || '').toLowerCase().split(/[^a-z]+/).filter(w => w.length > 2);
    const matches = pressBrakeMachines.filter(m => {
      const hay = `${m.machine_type || ''} ${m.machine_name || ''}`.toLowerCase();
      return words.some(w => hay.includes(w));
    });
    return matches.length ? matches : pressBrakeMachines;
  };
  const fetchPartHistoryFor = async (drawingNumber, partDescription, customerId) => {
    try {
      const params = {};
      if (drawingNumber) params.drawing_number = drawingNumber;
      if (partDescription) params.part_description = partDescription;
      if (customerId) params.customer_id = customerId;
      const res = await api.get('/job-sheets/part-history/lookup', { params });
      return res.data || [];
    } catch { return []; }
  };
  const [emailFormData, setEmailFormData] = useState({
    to: '',
    subject: '',
    message: ''
  });
  
  // Initial form data structure
  const initialFormData = {
    // Part Specifics
    customer_id: '',
    customer_name: '',
    contact_person: '',
    quote_date: getCurrentDateInSystemTimezone(),
    part_description: '',
    quantity_required: 1,
    drawing_file: null, // Drawing file upload
    drawing_filename: '', // Name of uploaded file
    drawing_url: null, // URL from backend after upload
    hide_material_section: false, // Toggle to hide material section for press brake only
    
    // Quantity Breaks
    quantity_breaks: [],
    show_quantity_breaks: false,
    
    // Price Rounding
    enable_rounding: false,
    rounding_target: 'total', // 'total' or 'unit' - what to round
    rounding_to: 10, // Round to nearest $10 by default
    rounding_direction: 'nearest', // 'up', 'down', or 'nearest'
    manual_adjustment: 0, // Manual price adjustment
    saved_quote_total: 0, // Saved quote total (for editing)
    saved_original_total: 0, // Saved original total before rounding
    saved_price_per_part: 0, // Saved price per part (for editing)
    
    // Quality Assurance (Q.A.) Inspection Items
    // Each item: {id, type: 'dimension'|'angle', description, nominal_value, tolerance, unit}
    qa_inspection_items: [],
    
    // Quote Notes (free-text notes appearing on printed / downloaded quote)
    quote_notes: '',
    
    // Material
    material_source: 'manual',
    material_id: '',
    material_type: 'Mild Steel',
    grade: 'HA3',
    finish: 'P&O',
    thickness: '3mm',
    sheet_width: 1220,
    sheet_length: 2440,
    customer_supplied_material: false,
    buying_cost_per_sheet: 0,
    selling_price_per_sheet: 0,
    material_markup_percent: 10,
    
    // Nesting Calculator
    border_x: 10,
    border_y: 10,
    part_width: 0,
    part_height: 0,
    space_between_parts: 5,
    parts_per_sheet: 0,
    sheets_required: 0,
    
    // Processes (start empty - user adds from dropdown)
    processes: []
  };
  
  const [formData, setFormData] = useState(initialFormData);
  
  // One-time cleanup: Clear old localStorage draft data (v1.1 migration)
  useEffect(() => {
    const migrationVersion = localStorage.getItem('quote_draft_version');
    if (!migrationVersion || migrationVersion !== '1.1') {
      // Clear old draft data that might cause cross-contamination
      localStorage.removeItem('quote_draft');
      localStorage.setItem('quote_draft_version', '1.1');
      console.log('Quote draft migrated to v1.1 - old data cleared');
    }
  }, []); // Run once on mount
  
  // Session Persistence - Auto-save draft quote
  useEffect(() => {
    // Load saved draft ONLY when creating a new quote (not editing)
    const savedDraft = localStorage.getItem('quote_draft');
    if (savedDraft && createDialogOpen && !editingQuote) {
      try {
        const parsed = JSON.parse(savedDraft);
        setFormData(parsed);
      } catch (e) {
        console.error('Failed to load quote draft:', e);
      }
    }
  }, [createDialogOpen, editingQuote]);
  
  useEffect(() => {
    // Auto-save draft ONLY when creating a new quote (not editing)
    if (createDialogOpen && !editingQuote) {
      const timer = setTimeout(() => {
        localStorage.setItem('quote_draft', JSON.stringify(formData));
      }, 1000); // Debounce 1 second
      
      return () => clearTimeout(timer);
    }
  }, [formData, createDialogOpen, editingQuote]);
  
  // Stats
  const [stats, setStats] = useState({
    totalQuotes: 0,
    totalValue: 0,
    draft: 0,
    sent: 0,
    todayCount: 0,
    todayValue: 0,
    weekCount: 0,
    weekValue: 0,
    monthCount: 0,
    monthValue: 0
  });

  useEffect(() => {
    fetchQuotes();
    fetchCustomers();
    fetchMaterials();
    fetchSettings();
    fetchDashboardMetrics(); // Fetch metrics from backend like Dashboard does
  }, []);

  const fetchDashboardMetrics = async () => {
    try {
      const response = await api.get('/dashboard/metrics');
      if (response.data) {
        // Extract quote metrics from dashboard API
        setStats({
          totalQuotes: quotes.length, // Keep local count
          totalValue: quotes.reduce((sum, q) => sum + (q.quote_total || 0), 0),
          draft: quotes.filter(q => q.status === 'Draft').length,
          sent: quotes.filter(q => q.status === 'Sent').length,
          todayCount: response.data.quotes_today_count || 0,
          todayValue: response.data.quotes_today_value || 0,
          weekCount: response.data.quotes_week_count || 0,
          weekValue: response.data.quotes_week_value || 0,
          monthCount: response.data.quotes_month_count || 0,
          monthValue: response.data.quotes_month_value || 0
        });
      }
    } catch (error) {
      console.error('Error fetching dashboard metrics:', error);
    }
  };

  const fetchQuotes = async () => {
    try {
      setLoading(true);
      const response = await api.get('/quotes');
      
      // Sort quotes by quote number (newest first: Q-0048, Q-0047, Q-0046...)
      const sortedQuotes = response.data.sort((a, b) => {
        const numA = parseInt(a.quote_number.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.quote_number.replace(/\D/g, '')) || 0;
        return numB - numA; // Descending order (newest first)
      });
      
      setQuotes(sortedQuotes);
      
      // Calculate local stats (total, draft, sent) but fetch today/week/month from backend
      const localStats = {
        totalQuotes: response.data.length,
        totalValue: response.data.reduce((sum, q) => sum + (q.quote_total || 0), 0),
        draft: response.data.filter(q => q.status === 'Draft').length,
        sent: response.data.filter(q => q.status === 'Sent').length
      };
      
      // Fetch time-based metrics from backend API (same as Dashboard)
      const metricsResponse = await api.get('/dashboard/metrics');
      if (metricsResponse.data) {
        setStats({
          ...localStats,
          todayCount: metricsResponse.data.quotes_today_count || 0,
          todayValue: metricsResponse.data.quotes_today_value || 0,
          weekCount: metricsResponse.data.quotes_week_count || 0,
          weekValue: metricsResponse.data.quotes_week_value || 0,
          monthCount: metricsResponse.data.quotes_month_count || 0,
          monthValue: metricsResponse.data.quotes_month_value || 0
        });
      } else {
        setStats(localStats);
      }
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
      // Sort materials alphabetically by material_type
      const sortedMaterials = response.data.sort((a, b) => {
        const nameA = (a.material_type || '').toLowerCase();
        const nameB = (b.material_type || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
      setMaterials(sortedMaterials);
    } catch (error) {
      console.error('Error fetching materials:', error);
      setMaterials([]);
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await api.get('/settings');
      setSettings(response.data);
    } catch (error) {
      console.error('Error fetching settings:', error);
      // Keep default value of 30 days if fetch fails
    }
  };

  // calculateStats function removed - now using backend metrics from fetchDashboardMetrics

  // Helper function for consistent rounding to 2 decimal places
  const roundTo2Decimals = (num) => {
    return Math.round(num * 100) / 100;
  };

  const calculateNesting = () => {
    const usableWidth = formData.sheet_width - (2 * formData.border_x);
    const usableLength = formData.sheet_length - (2 * formData.border_y);
    
    const partWidthWithSpace = formData.part_width + formData.space_between_parts;
    const partHeightWithSpace = formData.part_height + formData.space_between_parts;
    
    // If dimensions are missing or zero, but we have a stored parts_per_sheet, use that
    if ((partWidthWithSpace <= 0 || partHeightWithSpace <= 0)) {
      // Use stored value if available (for quotes created before dimension tracking)
      if (formData.parts_per_sheet > 0) {
        const sheetsRequired = Math.ceil(formData.quantity_required / formData.parts_per_sheet);
        return { partsPerSheet: formData.parts_per_sheet, sheetsRequired };
      }
      return { partsPerSheet: 0, sheetsRequired: 0 };
    }
    
    const partsAcross = Math.floor(usableWidth / partWidthWithSpace);
    const partsDown = Math.floor(usableLength / partHeightWithSpace);
    const partsPerSheet = partsAcross * partsDown;
    
    const sheetsRequired = partsPerSheet > 0 
      ? Math.ceil(formData.quantity_required / partsPerSheet)
      : 0;
    
    return { partsPerSheet, sheetsRequired };
  };

  // Press Brake Calculations
  const calculatePressBrakeSpecs = (process) => {
    if (!process.name || !process.name.toLowerCase().includes('press brake')) {
      return null;
    }
    
    const thickness = parseFloat(process.thickness) || 0;
    const materialType = process.material_type || 'Mild Steel';
    const bendLengthMm = parseFloat(process.bend_length) || 1000; // Now in mm
    const bendLengthM = bendLengthMm / 1000; // Convert to meters for calculation
    const manualVDie = process.manual_v_die || false;
    const vDieOverride = parseFloat(process.v_die_override) || 0;
    
    // Material tensile strengths in kg/mm² (for tonnage calculation)
    // Reference: https://intermach.com.au/press-brake-tonnage-calculation/
    const tensileStrengths = {
      'Mild Steel': 45,    // 450 MPa = 45 kg/mm²
      'Stainless Steel': 57, // 570 MPa = 57 kg/mm² (Intermach standard)
      'Aluminium': 19,     // 190 MPa = 19 kg/mm² (Intermach standard)
      'Copper': 22         // 220 MPa = 22 kg/mm²
    };
    
    const tensileStrength = tensileStrengths[materialType] || 45;
    
    // V-Die size: Use manual override if enabled, otherwise calculate
    const vDie = manualVDie && vDieOverride > 0 ? vDieOverride : thickness * 8;
    
    // Min Flange Length: V-Die × 0.7 (industry standard)
    const minFlange = vDie * 0.7;
    
    // Tonnage: Industry standard formula matching Intermach calculator
    // F = (T² × L × TS) / (V × 700)
    // T = thickness in mm
    // TS = tensile strength in kg/mm²
    // L = bend length in mm
    // V = V-die in mm
    // Result is in tonnes
    const totalTonnage = vDie > 0 ? (Math.pow(thickness, 2) * bendLengthMm * tensileStrength) / (vDie * 704) : 0;
    
    return {
      vDie: vDie.toFixed(1),
      minFlange: minFlange.toFixed(1),
      tonnage: totalTonnage.toFixed(1),
      bendLength: bendLengthMm.toFixed(0), // Display in mm
      isManualVDie: manualVDie
    };
  };

  const calculateProcessCost = (process, overrideQty = null) => {
    if (process.type === 'outsource') {
      // Outsource calculation
      const costPerPart = parseFloat(process.price_per_part) || 0;
      const transportTo = parseFloat(process.transport_cost_to) || 0;
      const transportReturn = parseFloat(process.transport_cost_return) || 0;
      const totalTransport = transportTo + transportReturn;
      const qty = overrideQty !== null ? overrideQty : (formData.quantity_required || 1);
      const totalCost = (costPerPart * qty) + totalTransport;
      
      return {
        setupCost: totalTransport,
        costPerPart: costPerPart,
        totalCost: totalCost
      };
    } else {
      // In-house calculation - Your exact formula
      // Formula: Total Price = Setup Cost + (Bend Time per Part × Qty × Hourly Rate) + (Packing Time × Rate)
      //          Unit Price = Total Price / Qty
      
      const qty = overrideQty !== null ? overrideQty : (formData.quantity_required || 1);
      const hourlyRate = parseFloat(process.hourly_rate) || 0;
      const isPressBrake = process.name && (process.name.toLowerCase().includes('press brake') || process.name.toLowerCase().includes('fold'));
      
      // 1. Calculate Setup Cost = Setup Time × Hourly Rate
      let setupTimeInHours = 0;
      const setupTimeUnit = process.setup_time_unit || 'min'; // Default to minutes
      if (setupTimeUnit === 'min') {
        setupTimeInHours = (process.setup_time || 0) / 60;
      } else if (setupTimeUnit === 'sec') {
        setupTimeInHours = (process.setup_time || 0) / 3600;
      } else if (setupTimeUnit === 'hr') {
        setupTimeInHours = process.setup_time || 0;
      } else {
        // Default: assume minutes if unit is not recognized
        setupTimeInHours = (process.setup_time || 0) / 60;
      }
      const setupCost = setupTimeInHours * hourlyRate;
      
      // 2. Calculate Time per Part (in seconds first, then convert)
      let timePerPartInSeconds = 0;
      
      if (isPressBrake) {
        // Check for seconds_override first
        const hasOverride = process.seconds_override !== null && process.seconds_override !== undefined && process.seconds_override !== '' && parseFloat(process.seconds_override) > 0;
        
        if (hasOverride) {
          // Use the override value directly (already in seconds)
          timePerPartInSeconds = parseFloat(process.seconds_override);
        } else {
          // === ENHANCED PRESS BRAKE CALCULATION (mirrors UI display exactly) ===
          const bendLength = process.bend_length || 0;
          const numBends = process.number_of_bends || 0;
          const thickness = process.thickness || 3;
          const weight = process.part_weight || 0;
          const flipsPerPart = process.flips_per_part || 0;
          const difficultyLevel = process.difficulty_level || 'simple';
          
          // 1. Base Bend Time (based on bend length)
          let baseBendTime = 15; // default <=500mm
          if (bendLength > 2000) baseBendTime = 45;
          else if (bendLength > 1000) baseBendTime = 30;
          else if (bendLength > 500) baseBendTime = 20;
          
          // 2. Thickness Modifier
          let thicknessFactor = 1.0;
          if (thickness > 10) thicknessFactor = 1.50;
          else if (thickness > 6) thicknessFactor = 1.30;
          else if (thickness > 2) thicknessFactor = 1.15;
          
          // 3. V-Die Calculation & Modifier
          const calculatedVDie = thickness * 8;
          const vDie = process.manual_v_die && process.v_die_override > 0 
            ? process.v_die_override 
            : calculatedVDie;
          
          let vDieFactor = 1.0;
          if (vDie > 40) vDieFactor = 1.35;
          else if (vDie > 24) vDieFactor = 1.20;
          else if (vDie > 12) vDieFactor = 1.10;
          
          // 4. Bend Time (with modifiers)
          const bendTime = baseBendTime * thicknessFactor * vDieFactor;
          
          // 5. Forming Time
          const formingTime = bendTime * numBends;
          
          // 6. Weight Handling Adjustment
          let handlingTime = 0;
          if (weight > 25) handlingTime = 30;
          else if (weight > 15) handlingTime = 20;
          else if (weight > 10) handlingTime = 10;
          else if (weight > 5) handlingTime = 5;
          
          // 7. Flip Time (based on bend length)
          let flipTimePerFlip = 3; // <=500mm
          if (bendLength > 2000) flipTimePerFlip = 12;
          else if (bendLength > 1200) flipTimePerFlip = 8;
          else if (bendLength > 500) flipTimePerFlip = 5;
          const flipTime = flipsPerPart * flipTimePerFlip;
          
          // 8. Geometry Type
          const geometryType = process.geometry_type || 'flange';
          
          // 9. Last Bend Box Penalty
          const isBox = geometryType === 'box' || geometryType === 'complex';
          const lastBendPenalty = isBox ? bendTime * 0.5 : 0;
          
          // 10. Part Time
          const partTime = formingTime + handlingTime + flipTime + lastBendPenalty;
          
          // 11. Difficulty Factor
          let difficultyFactor = 1.0;
          if (difficultyLevel === 'moderate') difficultyFactor = 1.2;
          else if (difficultyLevel === 'complex') difficultyFactor = 1.5;
          
          const adjustedTime = partTime * difficultyFactor;
          
          // 12. Second Operator Rule
          const needsSecondOperator = weight > 15 || bendLength > 2000;
          const operatorMultiplier = needsSecondOperator ? 2 : 1;
          
          const totalLabourTime = adjustedTime * operatorMultiplier;
          
          // Add packing time
          const packingTime = process.packing_time || 0;
          const totalWithPacking = totalLabourTime + packingTime;
          
          // Apply efficiency factor
          const efficiencyFactor = (process.efficiency_factor !== undefined ? process.efficiency_factor : 10) / 100;
          timePerPartInSeconds = totalWithPacking * (1 + efficiencyFactor);
        }
      } else {
        // Standard process: use time_per_part with time_unit
        if (process.time_unit === 'min' || process.time_unit === 'min per part') {
          timePerPartInSeconds = (process.time_per_part || 0) * 60;
        } else if (process.time_unit === 'sec' || process.time_unit === 'sec per part') {
          timePerPartInSeconds = process.time_per_part || 0;
        } else if (process.time_unit === 'hr' || process.time_unit === 'hr per part') {
          timePerPartInSeconds = (process.time_per_part || 0) * 3600;
        }
      }
      
      // Convert to hours for cost calculation
      let adjustedTimePerPart = timePerPartInSeconds / 3600;
      
      // For non-Press Brake processes, apply efficiency factor if set
      if (!isPressBrake && process.efficiency_factor > 0) {
        adjustedTimePerPart = adjustedTimePerPart * (1 + process.efficiency_factor / 100);
      }
      
      // 5. Calculate Base Total Price = Setup Cost + (Adjusted Time per Part × Qty × Hourly Rate)
      let totalCost = setupCost + (adjustedTimePerPart * qty * hourlyRate);
      
      // 5. Apply Optional Adjustments (Markups) - Press Brake only
      let adjustmentPercent = 0;
      if (isPressBrake) {
        if (process.adjust_stainless) adjustmentPercent += 15; // +15% for stainless
        if (process.adjust_complex) adjustmentPercent += 10; // +10% for complex bends
        if (process.adjust_multi_setup) adjustmentPercent += 15; // +15% for multiple setups
        if (process.adjust_tight_tolerance) adjustmentPercent += 10; // +10% for tight tolerance
      }
      
      if (adjustmentPercent > 0) {
        totalCost = totalCost * (1 + adjustmentPercent / 100);
      }
      
      // 7. Calculate Unit Price (ex GST) = Total Price / Qty
      // This includes setup cost distributed across all parts
      const costPerPart = roundTo2Decimals(totalCost / qty);
      
      // Recalculate totalCost from rounded values to ensure consistency
      // This prevents rounding errors where 10 × $6.00 ≠ $60.00
      const recalculatedTotal = roundTo2Decimals(costPerPart * qty);
      
      return {
        setupCost: roundTo2Decimals(setupCost), // Setup cost shown for transparency
        costPerPart, // Unit price (ex GST) - includes distributed setup cost
        totalCost: recalculatedTotal, // Total price (ex GST) = costPerPart × qty
        adjustmentPercent // For display purposes
      };
    }
  };

  const calculateMaterialCostPerPart = () => {
    // If customer supplied material, cost is zero
    if (formData.customer_supplied_material) return 0;
    
    // CRITICAL BUSINESS RULE: If only folding/press brake (no cutting), material cost is $0
    // Check if there are any processes that involve cutting (Laser Cutting, Plasma, etc.)
    const hasCuttingProcess = formData.processes.some(p => 
      p.name && (
        p.name.toLowerCase().includes('laser') ||
        p.name.toLowerCase().includes('cutting') ||
        p.name.toLowerCase().includes('plasma') ||
        p.name.toLowerCase().includes('waterjet')
      )
    );
    
    // If no cutting process, material cost is zero (customer supplies material for folding-only)
    if (!hasCuttingProcess && formData.processes.length > 0) {
      return 0;
    }
    
    const nesting = calculateNesting();
    if (nesting.partsPerSheet === 0) return 0;
    
    // Material cost per part = Selling price per sheet / Parts per sheet
    return roundTo2Decimals(formData.selling_price_per_sheet / nesting.partsPerSheet);
  };

  const calculateTotalMaterialCost = () => {
    // If customer supplied material, cost is zero
    if (formData.customer_supplied_material) return 0;
    
    // CRITICAL BUSINESS RULE: If only folding/press brake (no cutting), material cost is $0
    const hasCuttingProcess = formData.processes.some(p => 
      p.name && (
        p.name.toLowerCase().includes('laser') ||
        p.name.toLowerCase().includes('cutting') ||
        p.name.toLowerCase().includes('plasma') ||
        p.name.toLowerCase().includes('waterjet')
      )
    );
    
    if (!hasCuttingProcess && formData.processes.length > 0) {
      return 0;
    }
    
    // Total material cost = Material cost per part × Quantity required
    return calculateMaterialCostPerPart() * formData.quantity_required;
  };

  // Helper function to get material specification
  // For Press Brake only quotes, get material from first process
  // Otherwise use the generic material fields
  const getDerivedMaterial = (quote) => {
    // Check if this is a Press Brake only quote (no laser cutting)
    const hasLaserCutting = quote.processes?.some(p => 
      p.name?.toLowerCase().includes('laser') || 
      p.name?.toLowerCase().includes('cutting')
    );
    
    // If no laser cutting and has Press Brake process, use Press Brake material
    if (!hasLaserCutting && quote.processes && quote.processes.length > 0) {
      const firstProcess = quote.processes[0];
      if (firstProcess.material_type && firstProcess.thickness) {
        // Build material string from process: "Material Type - Thickness"
        // e.g., "Galvanized - 2.5mm"
        const material = firstProcess.material_type || '';
        const thickness = firstProcess.thickness ? `${firstProcess.thickness}mm` : '';
        return `${material}${thickness ? ' - ' + thickness : ''}`;
      }
    }
    
    // Otherwise use generic material fields
    const parts = [];
    if (quote.material_type) parts.push(quote.material_type);
    if (quote.grade) parts.push(quote.grade);
    if (quote.finish) parts.push(quote.finish);
    if (quote.thickness) parts.push(quote.thickness);
    return parts.join(' - ');
  };


  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        // Upload file to server
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await api.post('/upload/drawing', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
        
        // Store the URL and filename from server response
        setFormData(prev => ({
          ...prev,
          drawing_file: file,
          drawing_filename: response.data.filename,
          drawing_url: response.data.url
        }));
        
        alert('File uploaded successfully!');
      } catch (error) {
        console.error('Error uploading file:', error);
        alert('Failed to upload file: ' + (error.response?.data?.detail || error.message));
      }
    }
  };

  const handleCustomerChange = async (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      setFormData(prev => ({
        ...prev,
        customer_id: customer.id,
        customer_name: customer.company_name,
        contact_person: customer.contact_person || ''
      }));
      
      // Fetch customer contacts
      try {
        const response = await api.get(`/customers/${customerId}/contacts`);
        setCustomerContacts(response.data || []);
      } catch (error) {
        console.error('Error fetching customer contacts:', error);
        setCustomerContacts([]);
      }
    }
  };

  const handleMaterialChange = (materialId) => {
    const material = materials.find(m => m.id === materialId);
    if (material) {
      const costAverage = material.cost_average || 0;
      const markup = formData.material_markup_percent || 10;
      const sellingPrice = costAverage * (1 + markup / 100);
      
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
        selling_price_per_sheet: sellingPrice
      }));
    }
  };

  const handleMarkupChange = (markup) => {
    const buyingCost = formData.buying_cost_per_sheet || 0;
    const sellingPrice = buyingCost * (1 + markup / 100);
    
    setFormData(prev => ({
      ...prev,
      material_markup_percent: markup,
      selling_price_per_sheet: sellingPrice
    }));
  };

  const handleBuyingCostChange = (cost) => {
    const markup = formData.material_markup_percent || 10;
    const sellingPrice = cost * (1 + markup / 100);
    
    setFormData(prev => ({
      ...prev,
      buying_cost_per_sheet: cost,
      selling_price_per_sheet: sellingPrice
    }));
  };

  const handleProcessMaterialChange = (processId, value) => {
    console.log('handleProcessMaterialChange called:', { processId, value });
    
    if (value === '___ADD_NEW___') {
      // Prompt for new material
      console.log('Showing prompt for new material...');
      const newMaterial = prompt('Enter new material name:');
      console.log('User entered:', newMaterial);
      
      if (newMaterial && newMaterial.trim()) {
        const trimmedMaterial = newMaterial.trim();
        // Add to custom materials if not already exists
        if (!customMaterials.includes(trimmedMaterial)) {
          const updatedMaterials = [...customMaterials, trimmedMaterial].sort();
          setCustomMaterials(updatedMaterials);
          // Save to localStorage
          localStorage.setItem('customMaterials', JSON.stringify(updatedMaterials));
          console.log('Material added to custom materials:', trimmedMaterial);
        }
        // Set the new material
        handleProcessChange(processId, 'material_type', trimmedMaterial);
      } else {
        console.log('User cancelled or entered empty material');
        // Reset dropdown to previous value if user cancels
        const process = formData.processes.find(p => p.id === processId);
        if (process) {
          // Force re-render by not changing the value
          return;
        }
      }
    } else {
      // Regular material selection
      handleProcessChange(processId, 'material_type', value);
    }
  };

  const getAllMaterials = () => {
    const baseMaterials = ['Aluminium', 'Copper', 'Mild Steel', 'Stainless Steel'];
    const allMaterials = [...baseMaterials, ...customMaterials];
    // Remove duplicates and sort alphabetically
    return [...new Set(allMaterials)].sort();
  };

  // Material densities in kg/m³ for weight calculation
  const getMaterialDensity = (materialType) => {
    const densities = {
      'Mild Steel': 7850,
      'Stainless Steel': 8000,
      'Aluminium': 2700,
      'Aluminum': 2700,
      'Copper': 8960,
      'Brass': 8500,
      'Zinc': 7140,
      'Galvanised Steel': 7850,
      'Zincanneal': 7850,
      'Colorbond': 7850,
      'Titanium': 4500
    };
    // Default to mild steel density if unknown
    return densities[materialType] || 7850;
  };

  // Calculate part weight from dimensions (in kg)
  // Length and Width in mm, Thickness in mm
  const calculatePartWeight = (materialType, thickness, partLength, partWidth) => {
    if (!partLength || !partWidth || !thickness) return 0;
    
    // Convert mm to meters for volume calculation
    const lengthM = partLength / 1000;
    const widthM = partWidth / 1000;
    const thicknessM = thickness / 1000;
    
    // Volume in m³
    const volumeM3 = lengthM * widthM * thicknessM;
    
    // Get density in kg/m³
    const density = getMaterialDensity(materialType);
    
    // Weight in kg
    const weightKg = volumeM3 * density;
    
    // Round to 3 decimal places
    return Math.round(weightKg * 1000) / 1000;
  };

  // Handle part dimension changes and auto-calculate weight
  const handlePartDimensionChange = (processId, field, value) => {
    setFormData(prev => {
      const updatedProcesses = prev.processes.map(p => {
        if (p.id === processId) {
          const updatedProcess = { ...p, [field]: value };
          
          // Auto-calculate weight if we have all dimensions
          const partLength = field === 'part_length' ? value : p.part_length;
          const partWidth = field === 'part_width' ? value : p.part_width;
          const thickness = p.thickness;
          const materialType = p.material_type;
          
          if (partLength > 0 && partWidth > 0 && thickness > 0) {
            updatedProcess.part_weight = calculatePartWeight(materialType, thickness, partLength, partWidth);
          }
          
          return updatedProcess;
        }
        return p;
      });
      return { ...prev, processes: updatedProcesses };
    });
  };

  // Get unique material types from inventory
  const getUniqueMaterialTypes = () => {
    const types = [...new Set(materials.map(m => m.name))];
    return types.sort();
  };

  // Get unique thicknesses for selected material type
  const getUniqueThicknesses = (materialType) => {
    if (!materialType) return [];
    const thicknesses = materials
      .filter(m => m.name === materialType)
      .map(m => m.thickness);
    return [...new Set(thicknesses)].sort((a, b) => a - b);
  };

  // Get unique grades for selected material type and thickness
  const getUniqueGrades = (materialType, thickness) => {
    if (!materialType || !thickness) return [];
    
    // Parse thickness - handle both numeric and string with "mm"
    let thicknessValue = thickness;
    if (typeof thickness === 'string' && thickness.includes('mm')) {
      thicknessValue = parseFloat(thickness.replace('mm', ''));
    } else {
      thicknessValue = parseFloat(thickness);
    }
    
    const filteredMaterials = materials.filter(m => {
      const materialThickness = typeof m.thickness === 'string' ? parseFloat(m.thickness.replace('mm', '')) : parseFloat(m.thickness);
      return m.name === materialType && materialThickness === thicknessValue;
    });
    
    const grades = filteredMaterials
      .map(m => m.grade)
      .filter(g => g && g !== ''); // Only show actual grades, not empty ones
    
    const uniqueGrades = [...new Set(grades)];
    
    // If no grades, return empty array (not "No Grade")
    return uniqueGrades.sort();
  };

  // Filter materials based on selected filters
  const getFilteredMaterials = () => {
    let filtered = materials;
    
    if (materialTypeFilter) {
      filtered = filtered.filter(m => m.name === materialTypeFilter);
    }
    
    if (materialThicknessFilter) {
      // Parse thickness - handle both numeric and string with "mm"
      let thicknessValue = materialThicknessFilter;
      if (typeof materialThicknessFilter === 'string' && materialThicknessFilter.includes('mm')) {
        thicknessValue = parseFloat(materialThicknessFilter.replace('mm', ''));
      } else {
        thicknessValue = parseFloat(materialThicknessFilter);
      }
      
      filtered = filtered.filter(m => {
        const materialThickness = typeof m.thickness === 'string' ? parseFloat(m.thickness.replace('mm', '')) : parseFloat(m.thickness);
        return materialThickness === thicknessValue;
      });
    }
    
    if (materialGradeFilter) {
      filtered = filtered.filter(m => m.grade === materialGradeFilter);
    }
    
    return filtered;
  };

  // Reset dependent filters when parent filter changes
  const handleMaterialTypeFilterChange = (value) => {
    setMaterialTypeFilter(value);
    setMaterialThicknessFilter(''); // Reset thickness when type changes
    setMaterialGradeFilter(''); // Reset grade when type changes
  };

  const handleMaterialThicknessFilterChange = (value) => {
    setMaterialThicknessFilter(value);
    setMaterialGradeFilter(''); // Reset grade when thickness changes
  };

  const handleProcessChange = (processId, field, value) => {
    setFormData(prev => {
      const updatedProcesses = prev.processes.map(p => {
        if (p.id === processId) {
          const updatedProcess = { ...p, [field]: value };
          
          // Auto-recalculate weight when material_type or thickness changes
          if (field === 'material_type' || field === 'thickness') {
            const partLength = p.part_length;
            const partWidth = p.part_width;
            const thickness = field === 'thickness' ? value : p.thickness;
            const materialType = field === 'material_type' ? value : p.material_type;
            
            if (partLength > 0 && partWidth > 0 && thickness > 0) {
              updatedProcess.part_weight = calculatePartWeight(materialType, thickness, partLength, partWidth);
            }
          }
          
          return updatedProcess;
        }
        return p;
      });
      return { ...prev, processes: updatedProcesses };
    });
  };

  const addProcess = (templateName = 'Custom') => {
    const processTemplates = {
      'Laser Cutting': {
        name: 'Laser Cutting',
        setup_time: 15,
        time_per_part: 2.5,
        hourly_rate: 240,
        material_type: 'Mild Steel'
      },
      'Press Brake': {
        name: 'Press Brake',
        setup_time: 45,
        time_per_part: 0, // Not used for Press Brake
        hourly_rate: 100,
        material_type: 'Mild Steel',
        thickness: 3.0,
        number_of_bends: 1,
        time_per_bend: 30, // seconds per bend (manual entry)
        packing_time: 15, // seconds per part for packing/handling
        bend_length: 1000, // millimeters (length of the part for tonnage calculation)
        part_length: 0, // millimeters (for weight calculation)
        part_width: 0, // millimeters (for weight calculation)
        part_weight: 0, // kg (auto-calculated or manual)
        flips_per_part: 0, // number of times part needs to be repositioned/flipped
        geometry_type: 'flange', // flange, channel, box, complex
        bend_angles: '', // e.g., "4 x 90° (2 Up / 2 Down)"
        tooling_required: '' // e.g., "Punch: 11.049 (R8)  Die: V40"
      },
      'Welding': {
        name: 'Welding',
        setup_time: 5,
        time_per_part: 3,
        hourly_rate: 150,
        material_type: 'Mild Steel'
      },
      'Powder Coating': {
        name: 'Powder Coating',
        type: 'outsource',
        price_per_part: 5.00
      },
      'Custom': {
        name: 'New Process',
        setup_time: 0,
        time_per_part: 0,
        hourly_rate: 100,
        material_type: 'Mild Steel'
      }
    };
    
    const template = processTemplates[templateName] || processTemplates['Custom'];
    
    const newProcess = {
      id: Date.now().toString(),
      type: template.type || 'in-house',
      name: template.name,
      expanded: true,
      setup_time: template.setup_time || 0,
      setup_time_unit: 'min',
      time_per_part: template.time_per_part || 0,
      time_unit: 'min',
      hourly_rate: template.hourly_rate || 100,
      // Press Brake fields
      material_type: template.material_type || 'Mild Steel',
      thickness: template.thickness || 0,
      number_of_bends: template.number_of_bends || 0,
      time_per_bend: template.time_per_bend || 30, // seconds per bend
      packing_time: template.packing_time || 0, // seconds per part for Press Brake
      efficiency_factor: template.efficiency_factor !== undefined ? template.efficiency_factor : 10, // % inefficiency buffer (default 10%)
      bend_angles: template.bend_angles || '', // e.g., "4 x 90° (2 Up / 2 Down)"
      tooling_required: template.tooling_required || '', // e.g., "Punch: 11.049 (R8)  Die: V40"
      bend_length: template.bend_length || 1000, // mm - for tonnage calculation
      part_length: template.part_length || 0, // mm - for weight calculation
      part_width: template.part_width || 0, // mm - for weight calculation
      part_weight: template.part_weight || 0, // kg - auto-calculated or manual
      flips_per_part: template.flips_per_part || 0, // number of flips/repositions per part
      geometry_type: template.geometry_type || 'flange', // flange, channel, box, complex
      seconds_override: null, // Manual override for calculated seconds per part
      manual_v_die: false, // Enable manual V-Die override
      v_die_override: 0, // Manual V-Die size in mm
      // Optional adjustments
      adjust_stainless: false,
      adjust_complex: false,
      adjust_multi_setup: false,
      adjust_tight_tolerance: false,
      process_notes: '',
      // Outsource fields
      price_per_part: template.price_per_part || 0,
      transport_cost_to: 0,
      transport_cost_return: 0,
      setup_cost: 0,
      cost_per_part: 0,
      total_cost: 0
    };
    
    setFormData(prev => ({
      ...prev,
      processes: [...prev.processes, newProcess]
    }));
  };

  const toggleProcessExpand = (processId) => {
    setFormData(prev => ({
      ...prev,
      processes: prev.processes.map(p => 
        p.id === processId ? { ...p, expanded: !p.expanded } : p
      )
    }));
  };

  const removeProcess = (processId) => {
    setFormData(prev => ({
      ...prev,
      processes: prev.processes.filter(p => p.id !== processId)
    }));
  };

  const addQuantityBreak = () => {
    const newBreak = {
      id: Date.now().toString(),
      quantity: 0,
      price_per_part: 0,
      total: 0
    };
    setFormData(prev => ({
      ...prev,
      quantity_breaks: [...prev.quantity_breaks, newBreak]
    }));
  };

  const removeQuantityBreak = (breakId) => {
    setFormData(prev => ({
      ...prev,
      quantity_breaks: prev.quantity_breaks.filter(b => b.id !== breakId)
    }));
  };

  const handleQuantityBreakChange = (breakId, field, value) => {
    setFormData(prev => ({
      ...prev,
      quantity_breaks: prev.quantity_breaks.map(b => 
        b.id === breakId ? { ...b, [field]: value } : b
      )
    }));
  };

  const calculateRoundedPrice = (originalPrice, isUnitPrice = false) => {
    const data = formData;
    
    // If rounding is not enabled, return original price
    if (!data.enable_rounding) {
      return originalPrice;
    }
    
    // Determine what we're rounding
    const qty = data.quantity_required || 1;
    let priceToRound = originalPrice;
    
    // If rounding target is 'unit' and we're given a total price, convert to unit price
    if (data.rounding_target === 'unit' && !isUnitPrice) {
      priceToRound = originalPrice / qty; // Convert total to per-part price
    }
    // If rounding target is 'total' and we're given a unit price, convert to total
    else if (data.rounding_target === 'total' && isUnitPrice) {
      priceToRound = originalPrice * qty; // Convert per-part to total
    }
    
    let roundedPrice = priceToRound;
    
    // Apply automatic rounding to nearest specified amount (if not 0)
    if (data.rounding_to > 0) {
      const roundTo = parseFloat(data.rounding_to);
      
      if (data.rounding_direction === 'up') {
        roundedPrice = Math.ceil(priceToRound / roundTo) * roundTo;
      } else if (data.rounding_direction === 'down') {
        roundedPrice = Math.floor(priceToRound / roundTo) * roundTo;
      } else { // 'nearest'
        roundedPrice = Math.round(priceToRound / roundTo) * roundTo;
      }
    }
    // If rounding_to is 0, skip automatic rounding (manual adjustment only)
    
    // Apply manual adjustment if any (works with or without automatic rounding)
    if (data.manual_adjustment) {
      roundedPrice += parseFloat(data.manual_adjustment) || 0;
    }
    
    // Convert back to total if we rounded unit price but need total
    if (data.rounding_target === 'unit' && !isUnitPrice) {
      roundedPrice = roundedPrice * qty; // Convert back to total
    }
    // Convert back to unit if we rounded total but need unit
    else if (data.rounding_target === 'total' && isUnitPrice) {
      roundedPrice = roundedPrice / qty; // Convert back to per-part
    }
    
    // Round to 2 decimal places to avoid floating point precision issues
    return Math.round(roundedPrice * 100) / 100;
  };

  const calculateQuantityBreakPricing = (qty, quoteData = null) => {
    // Use provided quote data or formData
    const data = quoteData || formData;
    
    // Temporarily set quantity to calculate pricing for this break
    const tempFormData = { ...data, quantity_required: qty };
    
    // Calculate nesting with this quantity
    const usableWidth = tempFormData.sheet_width - (2 * tempFormData.border_x);
    const usableLength = tempFormData.sheet_length - (2 * tempFormData.border_y);
    const partWidthWithSpace = tempFormData.part_width + tempFormData.space_between_parts;
    const partHeightWithSpace = tempFormData.part_height + tempFormData.space_between_parts;
    
    if (partWidthWithSpace <= 0 || partHeightWithSpace <= 0) {
      return { pricePerPart: 0, pricePerPartExGST: 0, total: 0, totalExGST: 0 };
    }
    
    const partsAcross = Math.floor(usableWidth / partWidthWithSpace);
    const partsDown = Math.floor(usableLength / partHeightWithSpace);
    const partsPerSheet = partsAcross * partsDown;
    
    const materialCostPerPart = partsPerSheet > 0 ? tempFormData.selling_price_per_sheet / partsPerSheet : 0;
    let totalMaterialCost = materialCostPerPart * qty;
    
    // Apply material adjustments if checked (same as main quote)
    if (tempFormData.adjustments?.material_offcut_fee) {
      totalMaterialCost += (tempFormData.material_offcut_amount || 0);
    }
    if (tempFormData.adjustments?.primer) {
      totalMaterialCost += (tempFormData.primer_amount || 0);
    }
    if (tempFormData.adjustments?.setup) {
      totalMaterialCost += (tempFormData.setup_amount || 0);
    }
    if (tempFormData.adjustments?.freight) {
      totalMaterialCost += (tempFormData.freight_amount || 0);
    }
    
    // Calculate process costs for this quantity using the SAME logic as calculateProcessCost
    const totalProcessCost = tempFormData.processes.reduce((sum, p) => {
      const costs = calculateProcessCost(p, qty); // Use the main calculation function with this quantity
      return sum + (costs.totalCost || 0);
    }, 0);
    
    // Total before GST
    const totalCostBeforeGST = totalMaterialCost + totalProcessCost;
    
    // Apply rounding to Ex GST total if enabled (same as main quote)
    const roundedTotalExGST = calculateRoundedPrice(totalCostBeforeGST);
    
    // Add GST (10%) after rounding
    const gstValue = roundedTotalExGST * 0.10;
    const totalIncGST = roundedTotalExGST + gstValue;
    
    // Price per part - both Ex GST and Inc GST
    const pricePerPartExGST = qty > 0 ? roundedTotalExGST / qty : 0;
    const pricePerPartIncGST = qty > 0 ? totalIncGST / qty : 0;
    
    return {
      pricePerPart: pricePerPartIncGST,
      pricePerPartExGST: pricePerPartExGST,
      total: totalIncGST,
      totalExGST: roundedTotalExGST,
      originalTotal: totalCostBeforeGST // Store original for reference
    };
  };

  // Multi-Item Quote Handlers
  const handleAddLineItem = () => {
    // Validate required fields
    if (!formData.part_description || !formData.quantity_required) {
      alert('Please fill in Part Description and Quantity before adding item');
      return;
    }
    
    // Calculate costs for this line item
    const nesting = calculateNesting();
    let totalProcessCost = 0;
    
    const processesWithCosts = formData.processes.map(process => {
      const costs = calculateProcessCost(process);
      totalProcessCost += costs.totalCost || 0;
      
      return {
        ...process,
        setup_cost: costs.setupCost || 0,
        cost_per_part: costs.costPerPart || 0,
        total_cost: costs.totalCost || 0
      };
    });
    
    const materialCostPerPart = formData.customer_supplied_material ? 0 : calculateMaterialCostPerPart();
    const totalMaterialCost = materialCostPerPart * formData.quantity_required;
    const totalCostBeforeGST = totalMaterialCost + totalProcessCost;
    const gstValue = totalCostBeforeGST * 0.10;
    const quoteTotal = totalCostBeforeGST + gstValue;
    const pricePerPart = quoteTotal / (formData.quantity_required || 1);
    
    // Create line item
    const lineItem = {
      id: Date.now().toString(), // Temporary ID
      line_number: lineItems.length + 1, // Line number (1, 2, 3, ...)
      part_description: formData.part_description,
      quantity: formData.quantity_required,
      material_type: formData.material_type,
      thickness: formData.thickness,
      grade: formData.grade,
      finish: formData.finish,
      sheet_width: formData.sheet_width,
      sheet_length: formData.sheet_length,
      buying_cost_per_sheet: formData.buying_cost_per_sheet,
      selling_price_per_sheet: formData.selling_price_per_sheet,
      customer_supplied_material: formData.customer_supplied_material,
      parts_per_sheet: nesting.partsPerSheet,
      sheets_required: nesting.sheetsRequired,
      processes: processesWithCosts,
      material_cost_per_part: materialCostPerPart,
      total_material_cost: totalMaterialCost,
      total_process_cost: totalProcessCost,
      cost_per_part_no_gst: (totalCostBeforeGST / formData.quantity_required),
      gst_value: gstValue,
      price_per_part: pricePerPart,
      total: quoteTotal,
      drawing_url: formData.drawing_url,
      drawing_filename: formData.drawing_filename,
      quantity_breaks: formData.quantity_breaks || [],
      // Additional fields
      border_x: formData.border_x,
      border_y: formData.border_y,
      part_width: formData.part_width,
      part_height: formData.part_height,
      space_between_parts: formData.space_between_parts
    };
    
    setLineItems(prev => {
      // If we were editing a specific line item (activeLineItem index set), re-insert at original position
      if (activeLineItem !== null && activeLineItem >= 0 && activeLineItem <= prev.length) {
        const next = [...prev];
        next.splice(activeLineItem, 0, { ...lineItem, line_number: activeLineItem + 1 });
        // Re-number subsequent lines
        return next.map((li, idx) => ({ ...li, line_number: idx + 1 }));
      }
      return [...prev, lineItem];
    });
    setActiveLineItem(null);
    setExpandedLineItems({...expandedLineItems, [lineItem.id]: false});
    
    // Reset form but keep customer info and quantity breaks (quote-level data)
    setFormData({
      ...initialFormData,
      customer_id: formData.customer_id,
      customer_name: formData.customer_name,
      contact_person: formData.contact_person,
      quote_date: formData.quote_date,
      quantity_breaks: formData.quantity_breaks,
      show_quantity_breaks: formData.show_quantity_breaks
    });
    
    alert(`Line Item #${lineItems.length + 1} added successfully!`);
  };
  
  const handleEditLineItem = (index) => {
    const item = lineItems[index];
    
    // Load line item data back into form (with safe defaults so downstream rendering doesn't crash on undefined fields)
    setFormData({
      ...formData,
      part_description: item.part_description || '',
      quantity_required: item.quantity || 1,
      material_type: item.material_type || '',
      thickness: item.thickness || '',
      grade: item.grade || '',
      finish: item.finish || '',
      sheet_width: item.sheet_width || 0,
      sheet_length: item.sheet_length || 0,
      buying_cost_per_sheet: item.buying_cost_per_sheet || 0,
      selling_price_per_sheet: item.selling_price_per_sheet || 0,
      customer_supplied_material: !!item.customer_supplied_material,
      parts_per_sheet: item.parts_per_sheet || 0,
      processes: Array.isArray(item.processes) ? item.processes : [],
      drawing_url: item.drawing_url || null,
      drawing_filename: item.drawing_filename || '',
      quantity_breaks: Array.isArray(item.quantity_breaks) ? item.quantity_breaks : [],
      border_x: item.border_x || 0,
      border_y: item.border_y || 0,
      part_width: item.part_width || 0,
      part_height: item.part_height || 0,
      space_between_parts: item.space_between_parts || 0,
      qa_inspection_items: Array.isArray(item.qa_inspection_items) ? item.qa_inspection_items : (formData.qa_inspection_items || [])
    });
    
    // Remove the item from line items (will be re-added when user saves)
    const updatedLineItems = lineItems.filter((_, i) => i !== index);
    setLineItems(updatedLineItems);
    setActiveLineItem(index);

    // Scroll the edit dialog back to the top so user sees the populated form
    setTimeout(() => {
      const dlg = document.querySelector('[role="dialog"]');
      if (dlg) dlg.scrollTop = 0;
    }, 50);
  };
  
  const handleDeleteLineItem = (index) => {
    if (window.confirm('Are you sure you want to delete this line item?')) {
      const updatedLineItems = lineItems.filter((_, i) => i !== index);
      setLineItems(updatedLineItems);
    }
  };
  
  const toggleLineItemExpanded = (itemId) => {
    setExpandedLineItems({
      ...expandedLineItems,
      [itemId]: !expandedLineItems[itemId]
    });
  };

  const handleCreateQuote = async () => {
    try {
      // DEBUG: Log QA items at start
      console.log('=== CREATE QUOTE DEBUG ===');
      console.log('formData.qa_inspection_items:', JSON.stringify(formData.qa_inspection_items));
      
      if (!formData.customer_name) {
        alert('Please select or enter a customer');
        return;
      }
      
      // Calculate nesting
      const nesting = calculateNesting();
      
      // Calculate process costs locally (frontend)
      let totalProcessSetupCost = 0;
      let totalProcessCostPerPart = 0;
      let totalProcessCost = 0;
      
      const processesWithCosts = formData.processes.map(process => {
        const costs = calculateProcessCost(process);
        totalProcessSetupCost += costs.setupCost || 0;
        totalProcessCostPerPart += costs.costPerPart || 0;
        totalProcessCost += costs.totalCost || 0;
        
        return {
          ...process,
          setup_cost: costs.setupCost || 0,
          cost_per_part: costs.costPerPart || 0,
          total_cost: costs.totalCost || 0
        };
      });
      
      // Calculate material costs
      const materialCostPerPart = formData.customer_supplied_material ? 0 : calculateMaterialCostPerPart();
      const totalMaterialCost = materialCostPerPart * formData.quantity_required;
      
      // Total before GST
      const totalCostBeforeGST = totalMaterialCost + totalProcessCost;
      
      // GST (10%)
      const gstValue = totalCostBeforeGST * 0.10;
      
      // Quote total (including GST)
      const quoteTotal = totalCostBeforeGST + gstValue;
      
      // Price per part (including GST)
      const pricePerPart = quoteTotal / (formData.quantity_required || 1);
      
      // Check if this is a multi-item quote
      const isMultiItemQuote = lineItems.length > 0;
      
      // Prepare quote data
      let quoteData = {};
      
      if (isMultiItemQuote) {
        // Multi-item quote: Include all line items
        const allLineItems = [...lineItems];
        
        // If current form has data, add it as the last line item
        if (formData.part_description && formData.quantity_required) {
          const currentItem = {
            id: Date.now().toString(),
            line_number: allLineItems.length + 1, // Line number based on position
            part_description: formData.part_description,
            quantity: formData.quantity_required,
            material_type: formData.material_type,
            thickness: formData.thickness,
            grade: formData.grade,
            finish: formData.finish,
            sheet_width: formData.sheet_width,
            sheet_length: formData.sheet_length,
            buying_cost_per_sheet: formData.buying_cost_per_sheet,
            selling_price_per_sheet: formData.selling_price_per_sheet,
            customer_supplied_material: formData.customer_supplied_material,
            parts_per_sheet: nesting.partsPerSheet,
            sheets_required: nesting.sheetsRequired,
            processes: processesWithCosts,
            material_cost_per_part: materialCostPerPart,
            total_material_cost: totalMaterialCost,
            total_process_cost: totalProcessCost,
            cost_per_part_no_gst: (totalCostBeforeGST / formData.quantity_required),
            gst_value: gstValue,
            price_per_part: pricePerPart,
            total: quoteTotal,
            drawing_url: formData.drawing_url,
            drawing_filename: formData.drawing_filename,
            quantity_breaks: formData.quantity_breaks || []
          };
          allLineItems.push(currentItem);
        }
        
        // Renumber all line items sequentially (1, 2, 3, ...)
        const numberedLineItems = allLineItems.map((item, index) => ({
          ...item,
          line_number: index + 1
        }));
        
        // Calculate quote-level totals from all line items
        const quoteLevelTotal = numberedLineItems.reduce((sum, item) => sum + (item.total || 0), 0);
        const finalQuoteLevelTotal = calculateRoundedPrice(quoteLevelTotal);
        
        quoteData = {
          customer_id: formData.customer_id,
          customer_name: formData.customer_name,
          contact_person: formData.contact_person,
          quote_date: formData.quote_date,
          is_multi_item: true,
          line_items: numberedLineItems,
          quote_total: finalQuoteLevelTotal,
          original_total: quoteLevelTotal,
          enable_rounding: formData.enable_rounding,
          rounding_target: formData.rounding_target,
          rounding_to: formData.rounding_to,
          rounding_direction: formData.rounding_direction,
          manual_adjustment: formData.manual_adjustment,
          // Quantity Breaks
          quantity_breaks: formData.quantity_breaks || [],
          show_quantity_breaks: formData.show_quantity_breaks || false,
          // QA Inspection Items
          qa_inspection_items: formData.qa_inspection_items || [],
          // Quote Notes
          quote_notes: formData.quote_notes || '',
          created_by: 'admin'
        };
      } else {
        // Single-item quote: Original logic with rounding
        const qty = formData.quantity_required || 1;
        let finalQuoteTotal, finalPricePerPart;
        
        if (formData.enable_rounding && formData.rounding_target === 'unit') {
          // Round unit price first, then calculate total
          finalPricePerPart = calculateRoundedPrice(pricePerPart, true);
          finalQuoteTotal = finalPricePerPart * qty;
        } else {
          // Round total (default behavior)
          finalQuoteTotal = calculateRoundedPrice(quoteTotal);
          finalPricePerPart = finalQuoteTotal / qty;
        }
        
        quoteData = {
          ...formData,
          parts_per_sheet: nesting.partsPerSheet,
          sheets_required: nesting.sheetsRequired,
          customer_supplied_material: formData.customer_supplied_material || false,
          // Material costs
          material_cost_per_part: materialCostPerPart,
          total_material_cost: totalMaterialCost,
          // Process costs
          processes: processesWithCosts,
          total_process_cost: totalProcessCost,
          // Totals
          cost_per_part_no_gst: (totalCostBeforeGST / formData.quantity_required),
          total_job_cost: totalCostBeforeGST,
          gst_value: gstValue,
          cost_per_part_plus_gst: finalPricePerPart,
          quote_total: finalQuoteTotal,
          original_total: quoteTotal,
          price_per_part: finalPricePerPart,
          // Quantity breaks
          quantity_breaks: formData.quantity_breaks || [],
          is_multi_item: false,
          // QA Inspection Items - explicitly include
          qa_inspection_items: formData.qa_inspection_items || [],
          // Metadata
          created_by: 'admin'
        };
      }
      
      // DEBUG: Log what we're sending
      console.log('quoteData.qa_inspection_items being sent:', JSON.stringify(quoteData.qa_inspection_items));
      
      const response = await api.post('/quotes', quoteData);
      setQuotes([response.data, ...quotes]);
      setCreateDialogOpen(false);
      
      const successMsg = isMultiItemQuote 
        ? `Multi-item quote created successfully with ${lineItems.length + (formData.part_description ? 1 : 0)} items! Quote #${response.data.quote_number}`
        : `Quote created successfully! Quote #${response.data.quote_number}`;
      alert(successMsg);
      
      // Clear saved draft after successful save
      localStorage.removeItem('quote_draft');
      
      // Reset everything
      setFormData(initialFormData);
      setLineItems([]);
      setExpandedLineItems({});
      setActiveLineItem(null);
    } catch (error) {
      console.error('Error creating quote:', error);
      alert('Failed to create quote: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleViewQuote = async (quote) => {
    try {
      // Fetch full quote details to ensure we have line_items
      const response = await api.get(`/quotes/${quote.id}`);
      setSelectedQuote(response.data);
      setViewDialogOpen(true);
    } catch (error) {
      console.error('Error fetching quote details:', error);
      // Fallback to using the quote from the list
      setSelectedQuote(quote);
      setViewDialogOpen(true);
    }
  };

  // Admin helper: recompute quote_total from line_items (multi-item quotes where total shows $0.00)
  const handleRecomputeTotal = async (quote, e) => {
    if (e) e.stopPropagation();
    try {
      // Re-send line_items via PUT — backend now recomputes quote_total automatically
      const lineItemsPayload = (quote.line_items || []).map((li, idx) => ({
        ...li,
        line_number: li.line_number || idx + 1
      }));
      if (!lineItemsPayload.length) {
        alert('This quote has no line items to sum.');
        return;
      }
      const res = await api.put(`/quotes/${quote.id}`, {
        is_multi_item: true,
        line_items: lineItemsPayload
      });
      const newTotal = res.data?.quote_total ?? 0;
      alert(`Quote total recomputed: ${formatCurrency(newTotal)}`);
      fetchQuotes();
    } catch (err) {
      alert('Recompute failed: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleEditQuote = async (quote) => {
    // If a new quote is in progress, save it as a Draft before jumping into another quote
    if (createDialogOpen && !editingQuote && hasDraftContent()) {
      await saveDraftOnLeave();
    }
    // CRITICAL: Close dialog first and clear all state to prevent contamination
    setCreateDialogOpen(false);
    
    // Wait for dialog to close and state to clear
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Safely handle processes array
    let processes = [];
    if (quote.processes && Array.isArray(quote.processes) && quote.processes.length > 0) {
      processes = quote.processes.map(p => ({
        id: p.id || Date.now().toString(),
        type: p.type || 'in-house',
        name: p.name || 'Process',
        setup_time: p.setup_time || 0,
        setup_time_unit: p.setup_time_unit || 'min',
        time_per_part: p.time_per_part || 0,
        time_unit: p.time_unit || 'min',
        hourly_rate: p.hourly_rate || 240,
        price_per_part: p.price_per_part || 0,
        transport_cost_to: p.transport_cost_to || 0,
        transport_cost_return: p.transport_cost_return || 0,
        // Press Brake specific fields
        number_of_bends: p.number_of_bends || 0,
        time_per_bend: p.time_per_bend || 30,
        packing_time: p.packing_time || 0,
        efficiency_factor: p.efficiency_factor !== undefined ? p.efficiency_factor : 10,
        bend_angles: p.bend_angles || '',
        tooling_required: p.tooling_required || '',
        material: p.material || p.material_type || 'Mild Steel',
        material_type: p.material_type || p.material || 'Mild Steel',
        thickness: p.thickness || '',
        bend_length: p.bend_length || 0,
        tensile_strength: p.tensile_strength || 450,
        // Part dimensions + weight (needed for handling time + cost calc on reopen)
        part_length: p.part_length || 0,
        part_width: p.part_width || 0,
        part_weight: p.part_weight || 0,
        // Press-brake parametrics that drive cost/time multipliers
        geometry_type: p.geometry_type || 'flange',
        difficulty_level: p.difficulty_level || 'simple',
        flips_per_part: p.flips_per_part || 0,
        space_between_parts: p.space_between_parts !== undefined ? p.space_between_parts : 0,
        // Calculated fields
        tonnage: p.tonnage || 0,
        min_flange: p.min_flange || 0,
        vdie_size: p.vdie_size || 0,
        manual_v_die: p.manual_v_die || p.manual_vdie_override || false,
        v_die_override: p.v_die_override || p.manual_vdie_size || 0,
        // Optional adjustments - use adjust_* field names to match form
        adjust_stainless: !!(p.adjustment_stainless || p.adjust_stainless),
        adjust_complex: !!(p.adjustment_complex_bends || p.adjust_complex),
        adjust_multi_setup: !!(p.adjustment_multiple_setups || p.adjust_multi_setup),
        adjust_tight_tolerance: !!(p.adjustment_tight_tolerance || p.adjust_tight_tolerance),
        // Preserve stored cost fields
        setup_cost: p.setup_cost || 0,
        cost_per_part: p.cost_per_part || 0,
        total_cost: p.total_cost || 0,
        // Notes
        process_notes: p.process_notes || p.notes || ''
      }));
    } else {
      // Start with empty processes array (user can add)
      processes = [];
    }
    
    // Safely handle quantity breaks (fallback to line-item breaks for multi-item quotes)
    let quantityBreaks = quote.quantity_breaks && Array.isArray(quote.quantity_breaks) 
      ? quote.quantity_breaks 
      : [];
    if (quantityBreaks.length === 0 && quote.is_multi_item && Array.isArray(quote.line_items)) {
      const lineWithBreaks = quote.line_items.find(li => li.quantity_breaks && li.quantity_breaks.length > 0);
      if (lineWithBreaks) quantityBreaks = lineWithBreaks.quantity_breaks;
    }
    
    // Build complete form data from quote (not from initialFormData)
    const newFormData = {
      customer_id: quote.customer_id || '',
      customer_name: quote.customer_name || '',
      contact_person: quote.contact_person || '',
      quote_date: quote.quote_date ? new Date(quote.quote_date).toISOString().split('T')[0] : getCurrentDateInSystemTimezone(),
      part_description: quote.part_description || '',
      quantity_required: quote.quantity_required || 1,
      drawing_file: null,  // Cannot restore file object, user can re-upload if needed
      drawing_url: quote.drawing_url || null,
      drawing_filename: quote.drawing_filename || '',
      hide_material_section: quote.hide_material_section || false,
      material_source: quote.material_id ? 'inventory' : 'manual',
      material_id: quote.material_id || '',
      material_type: quote.material_type || 'Mild Steel',
      grade: quote.grade || 'HA3',
      finish: quote.finish || 'P&O',
      thickness: quote.thickness || '3mm',
      sheet_width: quote.sheet_width || 1220,
      sheet_length: quote.sheet_length || 2440,
      customer_supplied_material: quote.customer_supplied_material || false,
      buying_cost_per_sheet: quote.buying_cost_per_sheet || 0,
      selling_price_per_sheet: quote.selling_price_per_sheet || 0,
      material_markup_percent: quote.material_markup_percent || 10,
      border_x: quote.border_x || 10,
      border_y: quote.border_y || 10,
      part_width: quote.part_width || 0,
      part_height: quote.part_height || 0,
      space_between_parts: quote.space_between_parts || 5,
      parts_per_sheet: quote.parts_per_sheet || 0,
      sheets_required: quote.sheets_required || 0,
      processes: processes,
      quantity_breaks: quantityBreaks,
      show_quantity_breaks: quantityBreaks.length > 0,
      // Price rounding settings
      enable_rounding: quote.enable_rounding || false,
      rounding_target: quote.rounding_target || 'total',
      rounding_to: quote.rounding_to || 10,
      rounding_direction: quote.rounding_direction || 'nearest',
      manual_adjustment: quote.manual_adjustment || 0,
      // Saved price values (for rounding)
      saved_quote_total: quote.quote_total || 0,
      saved_original_total: quote.original_total || 0,
      saved_price_per_part: quote.price_per_part || 0,
      // Quality Assurance Inspection Items
      qa_inspection_items: quote.qa_inspection_items || [],
      // Quote Notes
      quote_notes: quote.quote_notes || ''
    };
    
    // Set editing quote
    setEditingQuote(quote);
    
    // Set form data
    setFormData(newFormData);
    
    // Handle multi-item quotes: restore line items and multi-item mode
    if (quote.is_multi_item && quote.line_items && quote.line_items.length > 0) {
      setIsMultiItem(true);
      const restoredLineItems = quote.line_items.map((item, idx) => ({
        id: item.id || (Date.now().toString() + idx),
        line_number: item.line_number || idx + 1,
        part_description: item.part_description || '',
        quantity: item.quantity || 1,
        material_type: item.material_type || '',
        thickness: item.thickness || '',
        grade: item.grade || '',
        finish: item.finish || '',
        drawing_number: item.drawing_number || '',
        processes: (item.processes || []).map(p => ({
          id: p.id || Date.now().toString() + Math.random().toString(36).substr(2, 5),
          type: p.type || 'in-house',
          name: p.name || 'Process',
          setup_time: p.setup_time || 0,
          setup_time_unit: p.setup_time_unit || 'min',
          time_per_part: p.time_per_part || 0,
          time_unit: p.time_unit || 'min',
          hourly_rate: p.hourly_rate || 240,
          price_per_part: p.price_per_part || 0,
          transport_cost_to: p.transport_cost_to || 0,
          transport_cost_return: p.transport_cost_return || 0,
          number_of_bends: p.number_of_bends || 0,
          time_per_bend: p.time_per_bend || 30,
          packing_time: p.packing_time || 0,
          efficiency_factor: p.efficiency_factor !== undefined ? p.efficiency_factor : 10,
          bend_angles: p.bend_angles || '',
          tooling_required: p.tooling_required || '',
          material: p.material || p.material_type || 'Mild Steel',
          material_type: p.material_type || p.material || 'Mild Steel',
          thickness: p.thickness || '',
          bend_length: p.bend_length || 0,
          tensile_strength: p.tensile_strength || 450,
          tonnage: p.tonnage || 0,
          min_flange: p.min_flange || 0,
          vdie_size: p.vdie_size || 0,
          manual_v_die: p.manual_v_die || false,
          v_die_override: p.v_die_override || 0,
          adjust_stainless: !!(p.adjustment_stainless || p.adjust_stainless),
          adjust_complex: !!(p.adjustment_complex_bends || p.adjust_complex),
          adjust_multi_setup: !!(p.adjustment_multiple_setups || p.adjust_multi_setup),
          adjust_tight_tolerance: !!(p.adjustment_tight_tolerance || p.adjust_tight_tolerance),
          setup_cost: p.setup_cost || 0,
          cost_per_part: p.cost_per_part || 0,
          total_cost: p.total_cost || 0,
          process_notes: p.process_notes || p.notes || '',
          seconds_override: p.seconds_override || null,
          part_length: p.part_length || 0,
          part_width: p.part_width || 0,
          part_weight: p.part_weight || 0,
          flips_per_part: p.flips_per_part || 0,
          geometry_type: p.geometry_type || 'flange',
          difficulty_level: p.difficulty_level || 'simple',
        })),
        total: item.total || 0,
        hide_material_section: item.hide_material_section || false,
        customer_supplied_material: item.customer_supplied_material || false,
        buying_cost_per_sheet: item.buying_cost_per_sheet || 0,
        selling_price_per_sheet: item.selling_price_per_sheet || 0,
        material_markup_percent: item.material_markup_percent || 10,
        sheet_width: item.sheet_width || 1220,
        sheet_length: item.sheet_length || 2440,
        border_x: item.border_x || 10,
        border_y: item.border_y || 10,
        part_width: item.part_width || 0,
        part_height: item.part_height || 0,
        space_between_parts: item.space_between_parts || 5,
        parts_per_sheet: item.parts_per_sheet || 0,
        sheets_required: item.sheets_required || 0,
      }));
      setLineItems(restoredLineItems);
      
      // Set expanded state for all line items
      const expandedState = {};
      restoredLineItems.forEach(item => { expandedState[item.id] = false; });
      setExpandedLineItems(expandedState);
    } else {
      setIsMultiItem(false);
      setLineItems([]);
    }
    
    // Fetch customer contacts for the selected customer
    if (quote.customer_id) {
      try {
        const response = await api.get(`/customers/${quote.customer_id}/contacts`);
        setCustomerContacts(response.data || []);
      } catch (error) {
        console.error('Error fetching customer contacts:', error);
        setCustomerContacts([]);
      }
    }
    
    // Open dialog AFTER all state is set
    setCreateDialogOpen(true);
  };

  const handleDuplicateQuote = async (quote) => {
    // Close dialog first and clear state
    setCreateDialogOpen(false);
    await new Promise(resolve => setTimeout(resolve, 100));

    // Reuse the same process mapping as edit
    let processes = [];
    if (quote.processes && Array.isArray(quote.processes) && quote.processes.length > 0) {
      processes = quote.processes.map(p => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        type: p.type || 'in-house',
        name: p.name || 'Process',
        setup_time: p.setup_time || 0,
        setup_time_unit: p.setup_time_unit || 'min',
        time_per_part: p.time_per_part || 0,
        time_unit: p.time_unit || 'min',
        hourly_rate: p.hourly_rate || 240,
        price_per_part: p.price_per_part || 0,
        transport_cost_to: p.transport_cost_to || 0,
        transport_cost_return: p.transport_cost_return || 0,
        number_of_bends: p.number_of_bends || 0,
        time_per_bend: p.time_per_bend || 30,
        packing_time: p.packing_time || 0,
        efficiency_factor: p.efficiency_factor !== undefined ? p.efficiency_factor : 10,
        bend_angles: p.bend_angles || '',
        tooling_required: p.tooling_required || '',
        material: p.material || p.material_type || 'Mild Steel',
        material_type: p.material_type || p.material || 'Mild Steel',
        thickness: p.thickness || '',
        bend_length: p.bend_length || 0,
        tensile_strength: p.tensile_strength || 450,
        tonnage: p.tonnage || 0,
        min_flange: p.min_flange || 0,
        vdie_size: p.vdie_size || 0,
        manual_v_die: p.manual_v_die || p.manual_vdie_override || false,
        v_die_override: p.v_die_override || p.manual_vdie_size || 0,
        adjust_stainless: !!(p.adjustment_stainless || p.adjust_stainless),
        adjust_complex: !!(p.adjustment_complex_bends || p.adjust_complex),
        adjust_multi_setup: !!(p.adjustment_multiple_setups || p.adjust_multi_setup),
        adjust_tight_tolerance: !!(p.adjustment_tight_tolerance || p.adjust_tight_tolerance),
        setup_cost: p.setup_cost || 0,
        cost_per_part: p.cost_per_part || 0,
        total_cost: p.total_cost || 0,
        process_notes: p.process_notes || p.notes || '',
        // Enhanced fields
        seconds_override: p.seconds_override || null,
        part_length: p.part_length || 0,
        part_width: p.part_width || 0,
        part_weight: p.part_weight || 0,
        flips_per_part: p.flips_per_part || 0,
        geometry_type: p.geometry_type || 'flange',
        difficulty_level: p.difficulty_level || 'simple',
      }));
    }

    const quantityBreaks = quote.quantity_breaks && Array.isArray(quote.quantity_breaks)
      ? quote.quantity_breaks.map(qb => ({ ...qb, id: Date.now().toString() + Math.random().toString(36).substr(2, 5) }))
      : [];

    const newFormData = {
      customer_id: quote.customer_id || '',
      customer_name: quote.customer_name || '',
      contact_person: quote.contact_person || '',
      quote_date: getCurrentDateInSystemTimezone(),
      part_description: quote.part_description || '',
      quantity_required: quote.quantity_required || 1,
      drawing_file: null,
      drawing_url: quote.drawing_url || null,
      drawing_filename: quote.drawing_filename || '',
      hide_material_section: quote.hide_material_section || false,
      material_source: quote.material_id ? 'inventory' : 'manual',
      material_id: quote.material_id || '',
      material_type: quote.material_type || 'Mild Steel',
      grade: quote.grade || 'HA3',
      finish: quote.finish || 'P&O',
      thickness: quote.thickness || '3mm',
      sheet_width: quote.sheet_width || 1220,
      sheet_length: quote.sheet_length || 2440,
      customer_supplied_material: quote.customer_supplied_material || false,
      buying_cost_per_sheet: quote.buying_cost_per_sheet || 0,
      selling_price_per_sheet: quote.selling_price_per_sheet || 0,
      material_markup_percent: quote.material_markup_percent || 10,
      border_x: quote.border_x || 10,
      border_y: quote.border_y || 10,
      part_width: quote.part_width || 0,
      part_height: quote.part_height || 0,
      space_between_parts: quote.space_between_parts || 5,
      parts_per_sheet: quote.parts_per_sheet || 0,
      sheets_required: quote.sheets_required || 0,
      processes: processes,
      quantity_breaks: quantityBreaks,
      show_quantity_breaks: quantityBreaks.length > 0,
      enable_rounding: quote.enable_rounding || false,
      rounding_target: quote.rounding_target || 'total',
      rounding_to: quote.rounding_to || 10,
      rounding_direction: quote.rounding_direction || 'nearest',
      manual_adjustment: quote.manual_adjustment || 0,
      saved_quote_total: 0,
      saved_original_total: 0,
      saved_price_per_part: 0,
      qa_inspection_items: quote.qa_inspection_items || [],
      quote_notes: quote.quote_notes || ''
    };

    // Key difference from edit: DO NOT set editingQuote — this creates a new quote
    setEditingQuote(null);
    setFormData(newFormData);

    if (quote.customer_id) {
      try {
        const response = await api.get(`/customers/${quote.customer_id}/contacts`);
        setCustomerContacts(response.data || []);
      } catch (error) {
        setCustomerContacts([]);
      }
    }

    setCreateDialogOpen(true);
  };

  const handleUpdateQuote = async () => {
    try {
      // DEBUG: Log formData at the START of save
      console.log('=== SAVE QUOTE DEBUG ===');
      console.log('formData.qa_inspection_items at START:', JSON.stringify(formData.qa_inspection_items));
      
      // Calculate process costs
      const processesWithCosts = formData.processes.map(process => {
        const costs = calculateProcessCost(process);
        return {
          ...process,
          setup_cost: costs.setupCost || 0,
          cost_per_part: costs.costPerPart || 0,
          total_cost: costs.totalCost || 0
        };
      });
      
      // Calculate totals
      const materialCostPerPart = formData.customer_supplied_material ? 0 : calculateMaterialCostPerPart();
      const totalMaterialCost = materialCostPerPart * formData.quantity_required;
      const totalProcessCost = processesWithCosts.reduce((sum, p) => sum + (p.total_cost || 0), 0);
      const totalCostBeforeGST = totalMaterialCost + totalProcessCost;
      const gstValue = totalCostBeforeGST * 0.10;
      const quoteTotal = totalCostBeforeGST + gstValue;
      
      // Apply rounding based on rounding_target
      const qty = formData.quantity_required || 1;
      let finalQuoteTotal, finalPricePerPart;
      
      if (formData.enable_rounding && formData.rounding_target === 'unit') {
        // Round unit price first, then calculate total
        const pricePerPart = quoteTotal / qty;
        finalPricePerPart = calculateRoundedPrice(pricePerPart, true);
        finalQuoteTotal = finalPricePerPart * qty;
      } else {
        // Round total (default behavior)
        finalQuoteTotal = calculateRoundedPrice(quoteTotal);
        finalPricePerPart = finalQuoteTotal / qty;
      }
      
      const isMultiItemUpdate = (editingQuote?.is_multi_item || lineItems.length > 0);

      // SAFETY GUARD: if user is in the middle of editing a line item (clicked pencil → form populated)
      // and forgets to click "Save Line Item", auto-restore the pending form data into lineItems
      // so we never drop a line item silently.
      let lineItemsForSave = lineItems;
      const hasPendingLineEdit = isMultiItemUpdate
        && activeLineItem !== null
        && formData.part_description
        && formData.quantity_required;
      if (hasPendingLineEdit) {
        const proceed = window.confirm(
          'You have unsaved changes to a line item. Apply those changes before saving the quote?\n\n' +
          'OK = include your edits\nCancel = discard edits and save with the remaining lines as-is'
        );
        if (proceed) {
          const restored = [...lineItems];
          const restoredItem = {
            id: Date.now().toString(),
            part_description: formData.part_description,
            quantity: formData.quantity_required,
            material_type: formData.material_type,
            thickness: formData.thickness,
            grade: formData.grade,
            finish: formData.finish,
            sheet_width: formData.sheet_width,
            sheet_length: formData.sheet_length,
            buying_cost_per_sheet: formData.buying_cost_per_sheet,
            selling_price_per_sheet: formData.selling_price_per_sheet,
            customer_supplied_material: formData.customer_supplied_material,
            parts_per_sheet: formData.parts_per_sheet || 0,
            processes: processesWithCosts,
            drawing_url: formData.drawing_url,
            drawing_filename: formData.drawing_filename,
            quantity_breaks: formData.quantity_breaks || [],
            qa_inspection_items: formData.qa_inspection_items || [],
            total: finalQuoteTotal
          };
          const insertAt = (activeLineItem !== null && activeLineItem >= 0 && activeLineItem <= restored.length) ? activeLineItem : restored.length;
          restored.splice(insertAt, 0, restoredItem);
          lineItemsForSave = restored.map((li, idx) => ({ ...li, line_number: idx + 1 }));
        }
      }

      const updateData = {
        ...formData,
        // Remove internal tracking fields
        saved_quote_total: undefined,
        saved_original_total: undefined,
        saved_price_per_part: undefined,
        // Add calculated values
        processes: processesWithCosts,
        total_process_cost: totalProcessCost,
        total_material_cost: totalMaterialCost,
        quote_total: finalQuoteTotal,
        original_total: quoteTotal,
        price_per_part: finalPricePerPart,
        gst_value: gstValue,
        // Explicitly include QA items
        qa_inspection_items: formData.qa_inspection_items || []
      };

      // MULTI-ITEM: override total with sum of line items, and include line_items array
      if (isMultiItemUpdate) {
        updateData.is_multi_item = true;
        updateData.line_items = lineItemsForSave;
        const multiTotal = lineItemsForSave.reduce((sum, li) => sum + (parseFloat(li.total) || 0), 0);
        updateData.quote_total = multiTotal;
        updateData.original_total = multiTotal;
        updateData.price_per_part = 0; // not applicable for multi-item
      }
      
      // Debug log
      console.log('Saving quote with QA items:', formData.qa_inspection_items);
      console.log('Update data qa_inspection_items:', updateData.qa_inspection_items);
      
      // Remove undefined fields before sending
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });
      
      const response = await api.put(`/quotes/${editingQuote.id}`, updateData);
      
      // Update quotes list
      setQuotes(quotes.map(q => q.id === editingQuote.id ? response.data : q));
      
      setCreateDialogOpen(false);
      setEditingQuote(null);
      setFormData(initialFormData);
      alert('Quote updated successfully!');
    } catch (error) {
      console.error('Error updating quote:', error);
      alert('Failed to update quote: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleDeleteQuote = (quote) => {
    setQuoteToDelete(quote);
    setDeleteDialogOpen(true);
  };

  const handleMarkReadyToInvoice = async (quote) => {
    if (!window.confirm(`Mark Quote ${quote.quote_number} as Ready to Invoice?\n\nUse this when packing slips are completed but status didn't auto-update.`)) {
      return;
    }
    
    try {
      const response = await api.post(`/quotes/${quote.id}/mark-ready-to-invoice`);
      alert(response.data.message);
      
      // Refresh quotes list
      fetchQuotes();
    } catch (error) {
      console.error('Error marking quote as ready to invoice:', error);
      alert('Failed to update quote status: ' + (error.response?.data?.detail || error.message));
    }
  };

  const confirmDeleteQuote = async () => {
    if (!quoteToDelete) return;
    
    try {
      await api.delete(`/quotes/${quoteToDelete.id}`);
      setDeleteDialogOpen(false);
      setQuoteToDelete(null);
      fetchQuotes(); // Refresh the list
      alert('Quote deleted successfully');
    } catch (error) {
      console.error('Error deleting quote:', error);
      alert('Failed to delete quote: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleDownloadDrawing = async (quote) => {
    if (quote.drawing_url) {
      try {
        // Remove /api prefix if present since api.get() will add it
        const url = quote.drawing_url.replace(/^\/api\//, '/');
        
        // Fetch the file from the server
        const response = await api.get(url, {
          responseType: 'blob'
        });
        
        // Create a download link
        const downloadUrl = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.setAttribute('download', quote.drawing_filename || 'drawing');
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);
      } catch (error) {
        console.error('Error downloading file:', error);
        alert('Failed to download file: ' + (error.response?.data?.detail || error.message));
      }
    } else if (quote.drawing_filename) {
      // Filename exists but no URL - file was uploaded but not stored on server
      alert(`Drawing file noted: ${quote.drawing_filename}\n\nNote: File was recorded before file storage was implemented. Please re-upload the file.`);
    } else {
      alert('No drawing file available for this quote.');
    }
  };

  const handlePrintQuote = async (quote) => {
    try {
      // Fetch company settings for logo
      let companySettings = null;
      try {
        const settingsResponse = await api.get('/settings/');
        companySettings = settingsResponse.data;
      } catch (error) {
        console.log('Could not fetch company settings for logo');
      }
      
      // Fetch full quote details to ensure we have line_items
      const fullQuote = await api.get(`/quotes/${quote.id}`);
      const quoteData = fullQuote.data;
      
      // Update quote status to "Sent" (only if currently Draft)
      if (quoteData.status === 'Draft') {
        await api.patch(`/quotes/${quote.id}/status`, { status: 'Sent' });
        fetchQuotes();
      }
      
      // Check if multi-item quote
      const isMultiItem = quoteData.is_multi_item && quoteData.line_items && quoteData.line_items.length > 0;

      // Detect if any process is Press Brake / Folding — used to show the grain-direction warning
      const _hasFolding = (() => {
        const checkProcs = (procs) => Array.isArray(procs) && procs.some(p => {
          const n = (p?.name || '').toLowerCase();
          return n.includes('press brake') || n.includes('fold');
        });
        if (checkProcs(quoteData.processes)) return true;
        if (isMultiItem) {
          return (quoteData.line_items || []).some(li => checkProcs(li?.processes));
        }
        return false;
      })();
      const grainNoteHtml = _hasFolding ? `
        <div style="margin: 16px 0; padding: 14px 18px; background: #fff3cd; border: 3px solid #d97706; border-left: 8px solid #b45309; border-radius: 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.08); text-align: center;">
          <div style="font-size: 18px; font-weight: 900; color: #7c2d12; text-transform: uppercase; letter-spacing: 0.5px;">
            ⚠ Important Note — Folding Required
          </div>
          <div style="font-size: 16px; font-weight: 800; color: #7c2d12; margin-top: 6px;">
            Please ensure all parts are nested in the same grain direction.
          </div>
        </div>
      ` : '';

      // Quote Notes (user-entered) — printed on the quote if provided
      const _escapeHtml = (str) => String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      const quoteNotesHtml = quoteData.quote_notes && quoteData.quote_notes.trim() ? `
        <div class="section" style="margin: 16px 0; padding: 12px 16px; background: #fffbeb; border: 1px solid #f59e0b; border-left: 6px solid #d97706; border-radius: 6px; page-break-inside: avoid;">
          <div style="font-size: 13px; font-weight: 700; color: #92400e; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
            Notes
          </div>
          <div style="font-size: 12px; color: #1f2937; white-space: pre-wrap; line-height: 1.5;">${_escapeHtml(quoteData.quote_notes)}</div>
        </div>
      ` : '';

      let contentHtml = '';
      
      if (isMultiItem) {
        // MULTI-ITEM QUOTE PRINT FORMAT
        contentHtml = `
          <div class="section">
            <h3 style="background: #e3f2fd; padding: 10px; border-radius: 5px;">Multi-Item Quote - ${quoteData.line_items.length} Line Items</h3>
          </div>
          
          <div class="section">
            <table style="font-size: 11px;">
              <thead>
                <tr style="background: #f2f2f2;">
                  <th style="text-align: left; padding: 8px;">Item Ref No.</th>
                  <th style="text-align: left; padding: 8px;">Part Description</th>
                  <th style="text-align: left; padding: 8px;">Material</th>
                  <th style="text-align: left; padding: 8px;">Thick</th>
                  <th style="text-align: left; padding: 8px;">Grade</th>
                  <th style="text-align: left; padding: 8px;">Finish</th>
                  <th style="text-align: right; padding: 8px;">Qty</th>
                  <th style="text-align: right; padding: 8px;">Price<br/>(ex GST)</th>
                  <th style="text-align: right; padding: 8px;">Total<br/>(incl. GST)</th>
                </tr>
              </thead>
              <tbody>
                ${quoteData.line_items.map((item, index) => {
                  const priceExGST = (item.total || item.line_total_with_gst || 0) / 1.10;
                  const pricePerPartExGST = priceExGST / (item.quantity || 1);
                  return `
                    <tr>
                      <td style="padding: 8px; vertical-align: top;">${item.line_number || index + 1}</td>
                      <td style="padding: 8px; vertical-align: top;">
                        <strong>${item.part_description}</strong>
                        ${item.processes && item.processes.length > 0 ? `
                          <div style="font-size: 9px; color: #666; margin-top: 3px;">
                            Processes: ${item.processes.map(p => p.name).join(', ')}
                          </div>
                        ` : ''}
                        ${item.drawing_filename ? `
                          <div style="font-size: 9px; color: #0066cc; margin-top: 3px;">
                            📎 ${item.drawing_filename}
                          </div>
                        ` : ''}
                      </td>
                      <td style="padding: 8px; vertical-align: top;">${item.material_type}</td>
                      <td style="padding: 8px; vertical-align: top;">${item.thickness}</td>
                      <td style="padding: 8px; vertical-align: top;">${item.grade}</td>
                      <td style="padding: 8px; vertical-align: top;">${item.finish}</td>
                      <td style="padding: 8px; text-align: right; vertical-align: top;">${item.quantity}</td>
                      <td style="padding: 8px; text-align: right; vertical-align: top;">${formatCurrency(pricePerPartExGST)}</td>
                      <td style="padding: 8px; text-align: right; vertical-align: top; font-weight: bold;">${formatCurrency(item.total || item.line_total_with_gst || 0)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
              <tfoot style="background: #f2f2f2; font-weight: bold; font-size: 14px;">
                <tr>
                  <td colspan="8" style="padding: 12px; text-align: right;">TOTAL PRICE (incl. GST):</td>
                  <td style="padding: 12px; text-align: right; font-size: 16px;">${formatCurrency(quoteData.quote_total || 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          
          <div style="margin-top: 20px; padding: 10px; background: #f9f9f9; border-radius: 5px; font-size: 11px; color: #666;">
            <strong>Note:</strong> This quotation includes ${quoteData.line_items.length} separate line items as detailed above.
          </div>
          ${(() => {
            // Merge unique break quantities from quote level + every line item
            const seenQ = new Set();
            let effectiveBreaks = [];
            const addBreaks = (arr) => (arr || []).forEach(qb => {
              const q = Number(qb.quantity);
              if (q > 0 && !seenQ.has(q)) { seenQ.add(q); effectiveBreaks.push({ quantity: q }); }
            });
            addBreaks(quoteData.quantity_breaks);
            (quoteData.line_items || []).forEach(li => addBreaks(li.quantity_breaks));
            effectiveBreaks.sort((a, b) => a.quantity - b.quantity);
            if (effectiveBreaks.length === 0) return '';
            let breaksHtml = '<div class="section" style="margin-top: 20px;"><h3 style="background: #e8f5e9; padding: 10px; border-radius: 5px;">Quantity Breaks - Price per Quantity</h3>';
            effectiveBreaks.forEach(qb => {
              let breakTotal = 0;
              let breakTotalEx = 0;
              let rowsHtml = '';
              quoteData.line_items.forEach((item, index) => {
                const itemProcessCost = (item.processes || []).reduce((sum, p) => {
                  const costs = calculateProcessCost(p, qb.quantity);
                  return sum + (costs.totalCost || 0);
                }, 0);
                const origQty = item.quantity || 1;
                const origTotal = (item.total || 0) / 1.10;
                const origProcessCost = (item.processes || []).reduce((sum, p) => sum + (p.total_cost || 0), 0);
                const materialTotal = Math.max(0, origTotal - origProcessCost);
                const materialScaled = origQty > 0 ? (materialTotal / origQty) * qb.quantity : 0;
                const lineExGST = itemProcessCost + materialScaled;
                const lineInclGST = lineExGST * 1.10;
                breakTotal += lineInclGST;
                breakTotalEx += lineExGST;
                rowsHtml += '<tr>' +
                  '<td style="padding: 6px 8px;">' + (item.line_number || index + 1) + '</td>' +
                  '<td style="padding: 6px 8px;">' + item.part_description + '</td>' +
                  '<td style="padding: 6px 8px; text-align: right;">' + qb.quantity + '</td>' +
                  '<td style="padding: 6px 8px; text-align: right;">' + formatCurrency(lineExGST / qb.quantity) + '</td>' +
                  '<td style="padding: 6px 8px; text-align: right; font-weight: bold;">' + formatCurrency(lineInclGST) + '</td>' +
                  '</tr>';
              });
              breaksHtml += '<div style="margin-top: 10px;">' +
                '<div style="font-weight: bold; font-size: 12px; margin-bottom: 5px; color: #2e7d32;">Qty: ' + qb.quantity + ' per item</div>' +
                '<table style="font-size: 11px; width: 100%;"><thead><tr style="background: #e8f5e9;">' +
                '<th style="text-align: left; padding: 6px 8px;">Item</th>' +
                '<th style="text-align: left; padding: 6px 8px;">Description</th>' +
                '<th style="text-align: right; padding: 6px 8px;">Qty</th>' +
                '<th style="text-align: right; padding: 6px 8px;">Price/Part (ex GST)</th>' +
                '<th style="text-align: right; padding: 6px 8px;">Total (incl. GST)</th>' +
                '</tr></thead><tbody>' + rowsHtml + '</tbody>' +
                '<tfoot><tr style="font-weight: bold;">' +
                '<td colspan="4" style="padding: 8px; text-align: right;">TOTAL (Ex GST):</td>' +
                '<td style="padding: 8px; text-align: right;">' + formatCurrency(breakTotalEx) + '</td>' +
                '</tr><tr style="background: #e8f5e9; font-weight: bold;">' +
                '<td colspan="4" style="padding: 8px; text-align: right;">TOTAL (incl. GST):</td>' +
                '<td style="padding: 8px; text-align: right; font-size: 13px;">' + formatCurrency(breakTotal) + '</td>' +
                '</tr></tfoot></table></div>';
            });
            breaksHtml += '</div>';
            return breaksHtml;
          })()}
        `;
      } else {
        // SINGLE-ITEM QUOTE PRINT FORMAT (Original)
        const materialSpec = getDerivedMaterial(quoteData);
        const quantityBreaksHtml = quoteData.quantity_breaks && quoteData.quantity_breaks.length > 0 ? `
          <div class="section">
            <h3>Quantity Breaks - Price per Quantity (Ex GST)</h3>
            <table>
              <tr>
                <th>Quantity</th>
                <th>Price per Part (Ex GST)</th>
                <th>Total Price (Ex GST)</th>
              </tr>
              ${quoteData.quantity_breaks.map(qb => {
                const pricing = calculateQuantityBreakPricing(qb.quantity, quoteData);
                return `
                  <tr>
                    <td>${qb.quantity} parts</td>
                    <td>${formatCurrency(pricing.pricePerPartExGST)}</td>
                    <td>${formatCurrency(pricing.totalExGST)}</td>
                  </tr>
                `;
              }).join('')}
            </table>
          </div>
        ` : '';
        
        contentHtml = `
          <div class="section compact-section">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
              <div>
                <h3 style="margin-bottom: 8px;">Part Details</h3>
                <div class="info-line"><strong>Description:</strong> ${quoteData.part_description}</div>
                <div class="info-line"><strong>Quantity:</strong> ${quoteData.quantity_required} parts</div>
              </div>
              <div>
                <h3 style="margin-bottom: 8px;">Material Specification</h3>
                <div class="info-line"><strong>Material:</strong> ${materialSpec}</div>
              </div>
            </div>
          </div>
          
          <div class="section">
            <h3>Quote Summary</h3>
            <table>
              <tr>
                <th>Item</th>
                <th>Description</th>
                <th>Material</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: right;">Price/Part<br/>(Ex GST)</th>
                <th style="text-align: right;">Total<br/>(Inc GST)</th>
              </tr>
              <tr>
                <td>1</td>
                <td>${quoteData.part_description || ''}</td>
                <td style="font-size: 12px; color: #666;">${materialSpec || ''}</td>
                <td style="text-align: center; font-weight: bold;">${quoteData.quantity_required}</td>
                <td style="text-align: right;">${formatCurrency(((quoteData.quote_total || 0) / 1.10) / (quoteData.quantity_required || 1))}</td>
                <td style="text-align: right; font-weight: bold;">${formatCurrency(quoteData.quote_total || 0)}</td>
              </tr>
              <tr style="border-top: 2px solid #333; font-weight: bold;">
                <td colspan="5" style="text-align: right; padding-right: 10px;">TOTAL (Ex GST):</td>
                <td style="text-align: right; font-size: 16px;">${formatCurrency((quoteData.quote_total || 0) / 1.10)}</td>
              </tr>
              <tr class="total" style="font-weight: bold; font-size: 16px;">
                <td colspan="5" style="text-align: right; padding-right: 10px;">TOTAL (Inc GST):</td>
                <td style="text-align: right;">${formatCurrency(quoteData.quote_total || 0)}</td>
              </tr>
            </table>
          </div>
          
          ${quantityBreaksHtml}
        `;
      }
      
      // Create print window with common structure
      const printWindow = window.open('', '_blank');
      
      // Build logo HTML if settings allow and logo exists
      const logoHtml = companySettings && companySettings.show_logo_on_quotes && companySettings.company_logo_url ? `
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="${companySettings.company_logo_url}" alt="Company Logo" style="max-height: 100px; max-width: 300px;" />
        </div>
      ` : '';
      
      // Build company info HTML
      const companyInfoHtml = companySettings ? `
        <div style="text-align: right; margin-bottom: 20px; font-size: 12px; color: #666;">
          ${companySettings.company_name ? `<div><strong>${companySettings.company_name}</strong></div>` : ''}
          ${companySettings.company_abn ? `<div>ABN: ${companySettings.company_abn}</div>` : ''}
          ${companySettings.street_address ? `<div>${companySettings.street_address}</div>` : ''}
          ${companySettings.suburb ? `<div>${companySettings.suburb}, ${companySettings.state} ${companySettings.postcode}</div>` : ''}
          ${companySettings.company_phone ? `<div>Phone: ${companySettings.company_phone}</div>` : ''}
          ${companySettings.company_email ? `<div>Email: ${companySettings.company_email}</div>` : ''}
        </div>
      ` : '';
      
      printWindow.document.write(`
        <html>
          <head>
            <title>Quote #${quoteData.quote_number}</title>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                padding: 15px; 
                max-width: 1000px; 
                margin: 0 auto;
                background: #f5f5f5;
                font-size: 13px;
                line-height: 1.4;
              }
              h1 { 
                color: #1e3a8a; 
                border-bottom: 3px solid #1e3a8a; 
                padding-bottom: 8px;
                margin-bottom: 12px;
                font-size: 24px;
                letter-spacing: -0.5px;
              }
              h3 { 
                color: #334155; 
                margin-top: 0; 
                border-bottom: 2px solid #cbd5e1; 
                padding-bottom: 5px;
                font-size: 15px;
                background: linear-gradient(to right, #f1f5f9, transparent);
                padding-left: 8px;
                margin-bottom: 8px;
              }
              table { 
                width: 100%; 
                border-collapse: collapse; 
                margin: 15px 0;
                background: white;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
              }
              th, td { 
                border: 1px solid #e2e8f0; 
                padding: 12px; 
                text-align: left;
              }
              th { 
                background: linear-gradient(to bottom, #f8fafc, #e2e8f0);
                font-weight: 600;
                color: #1e293b;
                font-size: 13px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
              }
              tr:hover { background-color: #f8fafc; }
              .header { 
                margin-bottom: 12px;
                padding: 12px;
                background: white;
                border-radius: 6px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
              }
              .info-line { 
                margin: 5px 0;
                padding: 3px 0;
                font-size: 13px;
                color: #475569;
              }
              .info-line strong {
                color: #1e293b;
                min-width: 110px;
                display: inline-block;
                font-size: 13px;
              }
              .total { 
                font-size: 18px; 
                font-weight: bold; 
                background: linear-gradient(to right, #d1fae5, #a7f3d0) !important;
                color: #065f46;
              }
              .section { 
                margin: 12px 0;
                padding: 12px;
                background: white;
                border-radius: 6px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
              }
              .compact-section {
                margin: 8px 0;
                padding: 10px;
              }
              button {
                padding: 12px 24px;
                background: linear-gradient(to bottom, #1e3a8a, #1e40af);
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 16px;
                font-weight: 600;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                transition: all 0.2s;
              }
              button:hover {
                background: linear-gradient(to bottom, #1e40af, #2563eb);
                transform: translateY(-1px);
                box-shadow: 0 4px 6px rgba(0,0,0,0.3);
              }
              @page {
                size: A4;
                margin: 10mm;
              }
              @media print {
                body { 
                  padding: 5px;
                  background: white;
                  zoom: 100%;
                  font-size: 12px;
                }
                button { display: none; }
                .section, .header, .compact-section { 
                  box-shadow: none;
                  page-break-inside: avoid;
                  margin: 6px 0;
                  padding: 8px;
                }
                h1 { font-size: 20px; margin-bottom: 8px; padding-bottom: 6px; }
                h3 { font-size: 14px; margin-top: 0; margin-bottom: 6px; padding-bottom: 4px; }
                table { page-break-inside: auto; margin: 6px 0; }
                tr { page-break-inside: avoid; }
                th, td { padding: 6px; font-size: 12px; }
                .info-line { margin: 3px 0; padding: 2px 0; font-size: 12px; }
              }
            </style>
          </head>
          <body>
            ${logoHtml}
            ${companyInfoHtml}
            
            <div class="header">
              <h1>QUOTATION #${quoteData.quote_number}</h1>
              <div class="info-line"><strong>Drawing Number:</strong> ${quoteData.drawing_number || 'N/A'}</div>
              <div class="info-line"><strong>Date:</strong> ${formatDate(quoteData.quote_date)}</div>
            </div>
            
            <div class="section">
              <h3>Customer Information</h3>
              <div class="info-line"><strong>Customer:</strong> ${quoteData.customer_name}</div>
              <div class="info-line"><strong>Contact Person:</strong> ${quoteData.contact_person || 'N/A'}</div>
            </div>
            
            ${contentHtml}

            ${grainNoteHtml}

            ${quoteNotesHtml}

            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #666; font-size: 12px;">
              <p>This quotation is valid for ${companySettings?.quote_validity_days || 30} days from the date of issue.</p>
              <p>Terms and conditions apply.</p>
            </div>
            
            <div style="margin-top: 20px; text-align: center;">
              <button onclick="window.print()" style="padding: 10px 20px; background: #333; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;">
                Print Quote
              </button>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (error) {
      console.error('Error printing quote:', error);
      alert('Failed to generate print preview: ' + error.message);
    }
  };

  const handleDownloadPDF = async (quote) => {
    try {
      // Fetch company settings
      let companySettings = null;
      try {
        const settingsResponse = await api.get('/settings/');
        companySettings = settingsResponse.data;
      } catch (error) {
        console.log('Could not fetch company settings');
      }
      
      // Fetch full quote details
      const fullQuote = await api.get(`/quotes/${quote.id}`);
      const quoteData = fullQuote.data;
      
      const isMultiItem = quoteData.is_multi_item && quoteData.line_items && quoteData.line_items.length > 0;

      // Detect if any process is Press Brake / Folding — used to show the grain-direction warning
      const _hasFolding = (() => {
        const checkProcs = (procs) => Array.isArray(procs) && procs.some(p => {
          const n = (p?.name || '').toLowerCase();
          return n.includes('press brake') || n.includes('fold');
        });
        if (checkProcs(quoteData.processes)) return true;
        if (isMultiItem) {
          return (quoteData.line_items || []).some(li => checkProcs(li?.processes));
        }
        return false;
      })();
      const grainNoteHtml = _hasFolding ? `
        <div style="margin: 12px 0; padding: 12px 16px; background: #fff3cd; border: 3px solid #d97706; border-left: 8px solid #b45309; border-radius: 6px; text-align: center;">
          <div style="font-size: 16px; font-weight: 900; color: #7c2d12; text-transform: uppercase; letter-spacing: 0.5px;">
            ⚠ Important Note — Folding Required
          </div>
          <div style="font-size: 14px; font-weight: 800; color: #7c2d12; margin-top: 4px;">
            Please ensure all parts are nested in the same grain direction.
          </div>
        </div>
      ` : '';

      // Quote Notes (user-entered) for PDF download
      const _escapeHtmlPdf = (str) => String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      const quoteNotesHtml = quoteData.quote_notes && quoteData.quote_notes.trim() ? `
        <div style="margin: 12px 0; padding: 12px 16px; background: #fffbeb; border: 1px solid #f59e0b; border-left: 6px solid #d97706; border-radius: 6px;">
          <div style="font-size: 12px; font-weight: 700; color: #92400e; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
            Notes
          </div>
          <div style="font-size: 11px; color: #1f2937; white-space: pre-wrap; line-height: 1.5;">${_escapeHtmlPdf(quoteData.quote_notes)}</div>
        </div>
      ` : '';

      // Build content based on quote type (same as print)
      let contentHtml = '';
      
      if (isMultiItem) {
        contentHtml = `
          <div style="margin-bottom: 15px; background: white; border-radius: 5px; padding: 12px;">
            <h3 style="background: #e3f2fd; padding: 10px; border-radius: 5px; margin: 0 0 10px 0;">Multi-Item Quote - ${quoteData.line_items.length} Line Items</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
              <tr style="background: #f2f2f2;">
                <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Item</th>
                <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Description</th>
                <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Material</th>
                <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Qty</th>
                <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Price (ex GST)</th>
                <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Total (incl. GST)</th>
              </tr>
              ${quoteData.line_items.map((item, index) => {
                const priceExGST = (item.total || 0) / 1.10;
                const pricePerPartExGST = priceExGST / (item.quantity || 1);
                return `
                  <tr>
                    <td style="border: 1px solid #ddd; padding: 8px;">${item.line_number || index + 1}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${item.part_description}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${item.material_type} ${item.thickness} ${item.grade}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${item.quantity}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatCurrency(pricePerPartExGST)}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-weight: bold;">${formatCurrency(item.total || 0)}</td>
                  </tr>
                `;
              }).join('')}
              <tr style="background: #f2f2f2; font-weight: bold;">
                <td colspan="5" style="border: 1px solid #ddd; padding: 8px; text-align: right;">TOTAL (Ex GST):</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatCurrency((quoteData.quote_total || 0) / 1.10)}</td>
              </tr>
              <tr style="background: #10b981; color: white; font-weight: bold;">
                <td colspan="5" style="border: 1px solid #ddd; padding: 8px; text-align: right;">TOTAL (Inc GST):</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 14px;">${formatCurrency(quoteData.quote_total || 0)}</td>
              </tr>
            </table>
          </div>
          ${(() => {
            // Merge unique break quantities from quote level + every line item
            const seenQ = new Set();
            let effectiveBreaks = [];
            const addBreaks = (arr) => (arr || []).forEach(qb => {
              const q = Number(qb.quantity);
              if (q > 0 && !seenQ.has(q)) { seenQ.add(q); effectiveBreaks.push({ quantity: q }); }
            });
            addBreaks(quoteData.quantity_breaks);
            (quoteData.line_items || []).forEach(li => addBreaks(li.quantity_breaks));
            effectiveBreaks.sort((a, b) => a.quantity - b.quantity);
            if (effectiveBreaks.length === 0) return '';
            let breaksHtml = '<div style="margin-bottom: 15px; background: white; border-radius: 5px; padding: 12px;">' +
              '<h3 style="color: #2e7d32; border-bottom: 2px solid #a5d6a7; padding-bottom: 5px; margin: 0 0 10px 0; font-size: 14px;">Quantity Breaks - Price per Quantity</h3>';
            effectiveBreaks.forEach(qb => {
              let breakTotal = 0;
              let breakTotalEx = 0;
              let rowsHtml = '';
              quoteData.line_items.forEach((item, index) => {
                const itemProcessCost = (item.processes || []).reduce((sum, p) => {
                  const costs = calculateProcessCost(p, qb.quantity);
                  return sum + (costs.totalCost || 0);
                }, 0);
                const origQty = item.quantity || 1;
                const origTotal = (item.total || 0) / 1.10;
                const origProcessCost = (item.processes || []).reduce((sum, p) => sum + (p.total_cost || 0), 0);
                const materialTotal = Math.max(0, origTotal - origProcessCost);
                const materialScaled = origQty > 0 ? (materialTotal / origQty) * qb.quantity : 0;
                const lineExGST = itemProcessCost + materialScaled;
                const lineInclGST = lineExGST * 1.10;
                breakTotal += lineInclGST;
                breakTotalEx += lineExGST;
                rowsHtml += '<tr>' +
                  '<td style="border: 1px solid #e2e8f0; padding: 6px 8px;">' + (item.line_number || index + 1) + '</td>' +
                  '<td style="border: 1px solid #e2e8f0; padding: 6px 8px;">' + item.part_description + '</td>' +
                  '<td style="border: 1px solid #e2e8f0; padding: 6px 8px; text-align: right;">' + qb.quantity + '</td>' +
                  '<td style="border: 1px solid #e2e8f0; padding: 6px 8px; text-align: right;">' + formatCurrency(lineExGST / qb.quantity) + '</td>' +
                  '<td style="border: 1px solid #e2e8f0; padding: 6px 8px; text-align: right; font-weight: bold;">' + formatCurrency(lineInclGST) + '</td>' +
                  '</tr>';
              });
              breaksHtml += '<div style="margin-bottom: 10px;">' +
                '<div style="font-weight: bold; font-size: 12px; margin-bottom: 5px; color: #2e7d32;">Qty: ' + qb.quantity + ' per item</div>' +
                '<table style="width: 100%; border-collapse: collapse; font-size: 11px;">' +
                '<tr style="background: #e8f5e9;">' +
                '<th style="border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left;">Item</th>' +
                '<th style="border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left;">Description</th>' +
                '<th style="border: 1px solid #e2e8f0; padding: 6px 8px; text-align: right;">Qty</th>' +
                '<th style="border: 1px solid #e2e8f0; padding: 6px 8px; text-align: right;">Price/Part (ex GST)</th>' +
                '<th style="border: 1px solid #e2e8f0; padding: 6px 8px; text-align: right;">Total (incl. GST)</th>' +
                '</tr>' + rowsHtml +
                '<tr style="font-weight: bold;">' +
                '<td colspan="4" style="border: 1px solid #e2e8f0; padding: 8px; text-align: right;">TOTAL (Ex GST):</td>' +
                '<td style="border: 1px solid #e2e8f0; padding: 8px; text-align: right;">' + formatCurrency(breakTotalEx) + '</td>' +
                '</tr><tr style="background: #e8f5e9; font-weight: bold;">' +
                '<td colspan="4" style="border: 1px solid #e2e8f0; padding: 8px; text-align: right;">TOTAL (incl. GST):</td>' +
                '<td style="border: 1px solid #e2e8f0; padding: 8px; text-align: right; font-size: 13px;">' + formatCurrency(breakTotal) + '</td>' +
                '</tr></table></div>';
            });
            breaksHtml += '</div>';
            return breaksHtml;
          })()}
        `;
      } else {
        const materialSpec = [quoteData.material_type, quoteData.thickness, quoteData.grade, quoteData.finish].filter(Boolean).join(' | ');
        contentHtml = `
          <div style="margin-bottom: 15px; background: white; border-radius: 5px; padding: 12px;">
            <div style="display: flex; gap: 20px; margin-bottom: 15px;">
              <div style="flex: 1;">
                <h3 style="color: #334155; border-bottom: 2px solid #cbd5e1; padding-bottom: 5px; margin: 0 0 8px 0;">Part Details</h3>
                <div style="font-size: 12px;"><strong>Description:</strong> ${quoteData.part_description}</div>
                <div style="font-size: 12px;"><strong>Quantity:</strong> ${quoteData.quantity_required} parts</div>
              </div>
              <div style="flex: 1;">
                <h3 style="color: #334155; border-bottom: 2px solid #cbd5e1; padding-bottom: 5px; margin: 0 0 8px 0;">Material Specification</h3>
                <div style="font-size: 12px;"><strong>Material:</strong> ${materialSpec}</div>
              </div>
            </div>
            <h3 style="color: #334155; border-bottom: 2px solid #cbd5e1; padding-bottom: 5px; margin: 0 0 8px 0;">Quote Summary</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
              <tr style="background: #f1f5f9;">
                <th style="border: 1px solid #e2e8f0; padding: 8px; text-align: left;">Item</th>
                <th style="border: 1px solid #e2e8f0; padding: 8px; text-align: left;">Description</th>
                <th style="border: 1px solid #e2e8f0; padding: 8px; text-align: left;">Material</th>
                <th style="border: 1px solid #e2e8f0; padding: 8px; text-align: center;">Qty</th>
                <th style="border: 1px solid #e2e8f0; padding: 8px; text-align: right;">Price/Part (Ex GST)</th>
                <th style="border: 1px solid #e2e8f0; padding: 8px; text-align: right;">Total (Inc GST)</th>
              </tr>
              <tr>
                <td style="border: 1px solid #e2e8f0; padding: 8px;">1</td>
                <td style="border: 1px solid #e2e8f0; padding: 8px;">${quoteData.part_description || ''}</td>
                <td style="border: 1px solid #e2e8f0; padding: 8px; color: #666;">${materialSpec || ''}</td>
                <td style="border: 1px solid #e2e8f0; padding: 8px; text-align: center; font-weight: bold;">${quoteData.quantity_required}</td>
                <td style="border: 1px solid #e2e8f0; padding: 8px; text-align: right;">${formatCurrency(((quoteData.quote_total || 0) / 1.10) / (quoteData.quantity_required || 1))}</td>
                <td style="border: 1px solid #e2e8f0; padding: 8px; text-align: right; font-weight: bold;">${formatCurrency(quoteData.quote_total || 0)}</td>
              </tr>
              <tr style="border-top: 2px solid #333; font-weight: bold;">
                <td colspan="5" style="border: 1px solid #e2e8f0; padding: 8px; text-align: right;">TOTAL (Ex GST):</td>
                <td style="border: 1px solid #e2e8f0; padding: 8px; text-align: right; font-size: 14px;">${formatCurrency((quoteData.quote_total || 0) / 1.10)}</td>
              </tr>
              <tr style="background: #10b981; color: white; font-weight: bold;">
                <td colspan="5" style="border: 1px solid #e2e8f0; padding: 8px; text-align: right;">TOTAL (Inc GST):</td>
                <td style="border: 1px solid #e2e8f0; padding: 8px; text-align: right; font-size: 16px;">${formatCurrency(quoteData.quote_total || 0)}</td>
              </tr>
            </table>
          </div>
          ${quoteData.quantity_breaks && quoteData.quantity_breaks.length > 0 ? `
          <div style="margin-bottom: 15px; background: white; border-radius: 5px; padding: 12px;">
            <h3 style="color: #334155; border-bottom: 2px solid #cbd5e1; padding-bottom: 5px; margin: 0 0 8px 0; font-size: 14px;">Quantity Breaks - Price per Quantity (Ex GST)</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
              <tr style="background: #f1f5f9;">
                <th style="border: 1px solid #e2e8f0; padding: 8px; text-align: left;">Quantity</th>
                <th style="border: 1px solid #e2e8f0; padding: 8px; text-align: right;">Price per Part (Ex GST)</th>
                <th style="border: 1px solid #e2e8f0; padding: 8px; text-align: right;">Total Price (Ex GST)</th>
              </tr>
              ${quoteData.quantity_breaks.map(qb => {
                const pricing = calculateQuantityBreakPricing(qb.quantity, quoteData);
                return `
                  <tr>
                    <td style="border: 1px solid #e2e8f0; padding: 8px;">${qb.quantity} parts</td>
                    <td style="border: 1px solid #e2e8f0; padding: 8px; text-align: right;">${formatCurrency(pricing.pricePerPartExGST)}</td>
                    <td style="border: 1px solid #e2e8f0; padding: 8px; text-align: right;">${formatCurrency(pricing.totalExGST)}</td>
                  </tr>
                `;
              }).join('')}
            </table>
          </div>
          ` : ''}
        `;
      }
      
      // Create container for PDF
      const container = document.createElement('div');
      container.id = 'pdf-container';
      container.style.cssText = 'position: fixed; left: 0; top: 0; width: 794px; padding: 20px; background: #f5f5f5; font-family: Arial, sans-serif; z-index: -9999;';
      
      container.innerHTML = `
        ${companySettings?.show_logo_on_quotes && companySettings?.company_logo_url ? 
          `<div style="text-align: center; margin-bottom: 15px;">
            <img src="${companySettings.company_logo_url}" style="max-height: 80px; max-width: 250px;" crossorigin="anonymous" />
          </div>` : ''}
        
        <div style="text-align: right; font-size: 11px; color: #666; margin-bottom: 10px;">
          ${companySettings?.company_name ? `<div><strong>${companySettings.company_name}</strong></div>` : ''}
          ${companySettings?.company_abn ? `<div>ABN: ${companySettings.company_abn}</div>` : ''}
          ${companySettings?.street_address ? `<div>${companySettings.street_address}</div>` : ''}
          ${companySettings?.suburb ? `<div>${companySettings.suburb}, ${companySettings.state} ${companySettings.postcode}</div>` : ''}
          ${companySettings?.company_phone ? `<div>Phone: ${companySettings.company_phone}</div>` : ''}
          ${companySettings?.company_email ? `<div>Email: ${companySettings.company_email}</div>` : ''}
        </div>
        
        <h1 style="color: #1e3a8a; border-bottom: 3px solid #1e3a8a; padding-bottom: 8px; margin: 0 0 15px 0; font-size: 22px;">
          QUOTATION #${quoteData.quote_number}
        </h1>
        
        <div style="display: flex; gap: 20px; margin-bottom: 15px;">
          <div style="flex: 1; background: white; padding: 10px; border-radius: 5px;">
            <div style="font-size: 11px;"><strong>Drawing Number:</strong> ${quoteData.drawing_number || 'N/A'}</div>
            <div style="font-size: 11px;"><strong>Date:</strong> ${formatDate(quoteData.quote_date || quoteData.created_at)}</div>
          </div>
        </div>
        
        <div style="background: white; border-radius: 5px; padding: 12px; margin-bottom: 15px;">
          <h3 style="color: #334155; border-bottom: 2px solid #cbd5e1; padding-bottom: 5px; margin: 0 0 8px 0; font-size: 14px;">Customer Information</h3>
          <div style="display: flex; gap: 20px;">
            <div style="font-size: 12px;"><strong>Customer:</strong> ${quoteData.customer_name}</div>
            <div style="font-size: 12px;"><strong>Contact:</strong> ${quoteData.contact_person || '-'}</div>
          </div>
        </div>
        
        ${contentHtml}

        ${grainNoteHtml}

        ${quoteNotesHtml}

        <div style="margin-top: 15px; padding: 10px; background: white; border-radius: 5px; font-size: 10px; color: #666;">
          <strong>Terms & Conditions:</strong> Quote valid for 30 days. Prices include GST unless stated otherwise.
        </div>
      `;
      
      document.body.appendChild(container);
      
      // Wait for images to load
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Generate canvas
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#f5f5f5',
        logging: false,
        width: 794,
        windowWidth: 794
      });
      
      document.body.removeChild(container);
      
      // Create PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;
      
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= 297;
      
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= 297;
      }
      
      pdf.save(`Quote_${quoteData.quote_number}.pdf`);
      
      // Update status if Draft
      if (quoteData.status === 'Draft') {
        await api.patch(`/quotes/${quote.id}/status`, { status: 'Sent' });
        fetchQuotes();
      }
      
    } catch (error) {
      console.error('PDF generation error:', error);
      // Fallback to print dialog
      alert('PDF download failed. Opening print dialog instead - select "Save as PDF" to download.');
      handlePrintQuote(quote);
    }
  };

  const handleSendEmail = async () => {
    try {
      // In a real app, this would call an email API endpoint
      alert(`Email would be sent to: ${emailFormData.to}\nSubject: ${emailFormData.subject}\n\nThis is a placeholder. Implement email sending in backend.`);
      setEmailDialogOpen(false);
      setEmailFormData({ to: '', subject: '', message: '' });
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Failed to send email');
    }
  };

  const handleOpenJobSheetDialog = (quote, process) => {
    console.log('Opening job sheet dialog');
    console.log('Quote:', quote);
    console.log('Quote ID:', quote?.id);
    console.log('Process:', process);
    console.log('Process ID:', process?.id);
    
    if (!quote?.id) {
      alert('Error: Quote ID is missing. Cannot create job sheet.');
      return;
    }
    
    if (!process?.id) {
      alert('Error: Process ID is missing. Cannot create job sheet.');
      return;
    }
    
    setSelectedQuote(quote);
    setSelectedProcess(process);
    
    // Calculate unit price from the quote
    const unitPriceIncGst = quote.price_per_part || quote.cost_per_part_plus_gst || 0;
    const unitPriceExGst = unitPriceIncGst / 1.10;
    
    setJobSheetFormData({
      quantity: quote.quantity_required,
      purchase_order_number: '',
      due_date: '',
      inspection_interval: '',
      unit_price: unitPriceIncGst.toFixed(2),
      unit_price_ex_gst: unitPriceExGst.toFixed(2),
      machine_id: ''
    });
    setJobSheetDialogOpen(true);
    
    // Load machines + warn if this part was run before (any machine type)
    loadPressBrakeMachines();
    fetchPartHistoryFor(quote.drawing_number, quote.part_description, quote.customer_id).then(entries => {
      if (entries.length > 0) {
        setPartHistory([{ part: quote.part_description, entries }]);
        setPartHistoryOpen(true);
      }
    });
  };

  const handleCreateJobSheet = async () => {
    try {
      const jobSheetData = {
        quote_id: selectedQuote.id,
        process_id: selectedProcess.id,
        quantity: parseInt(jobSheetFormData.quantity),
        purchase_order_number: jobSheetFormData.purchase_order_number || null,
        due_date: jobSheetFormData.due_date ? new Date(jobSheetFormData.due_date).toISOString() : null,
        inspection_interval: jobSheetFormData.inspection_interval ? parseInt(jobSheetFormData.inspection_interval) : null,
        // Include adjusted unit price (compute total from ex-GST to avoid GST rounding loss)
        unit_price: parseFloat(jobSheetFormData.unit_price) || 0,
        unit_price_ex_gst: parseFloat(jobSheetFormData.unit_price_ex_gst) || 0,
        total_value: ((parseFloat(jobSheetFormData.unit_price_ex_gst) || 0) * (parseInt(jobSheetFormData.quantity) || 0)) * 1.10,
        machine_id: jobSheetFormData.machine_id || null,
        machine_name: jobSheetFormData.machine_id
          ? (pressBrakeMachines.find(m => m.id === jobSheetFormData.machine_id)?.machine_name || null)
          : null
      };

      console.log('Creating job sheet with data:', jobSheetData);
      console.log('Selected Quote:', selectedQuote);
      console.log('Selected Process:', selectedProcess);

      await api.post('/job-sheets', jobSheetData);
      
      // Update quote status to "Job Created"
      try {
        await api.patch(`/quotes/${selectedQuote.id}/status`, { status: 'Job Created' });
        // Refresh quotes list
        fetchQuotes();
      } catch (statusError) {
        console.error('Error updating quote status:', statusError);
        // Job sheet was created successfully, just status update failed
      }
      
      alert('Job Sheet created successfully!');
      setJobSheetDialogOpen(false);
      setJobSheetFormData({ quantity: 0, purchase_order_number: '', due_date: '', inspection_interval: '', unit_price: 0, unit_price_ex_gst: 0, machine_id: '' });
    } catch (error) {
      console.error('Error creating job sheet:', error);
      console.error('Error response:', error.response);
      alert('Failed to create job sheet: ' + (error.response?.data?.detail || error.message));
    }
  };

  // Multi-Item Job Sheet Handlers
  const handleOpenMultiItemJobSheetDialog = async (quote) => {
    if (!quote?.id) {
      alert('Error: Quote ID is missing.');
      return;
    }
    
    if (!quote.line_items || quote.line_items.length === 0) {
      alert('No line items found in this quote.');
      return;
    }
    
    setSelectedQuote(quote);
    // Fetch job sheets already created for this quote so items can be released one at a time
    let existing = [];
    try {
      const res = await api.get(`/job-sheets/quote/${quote.id}`);
      existing = res.data || [];
    } catch (e) { /* no existing job sheets */ }
    setExistingJobSheetsForQuote(existing);
    // Pre-select only items that do NOT already have a job sheet
    const hasJS = (item) => existing.some(js => (js.part_description || '') === (item.part_description || ''));
    setSelectedLineItemsForJobSheet(
      quote.line_items.map((item, index) => (hasJS(item) ? null : index)).filter(i => i !== null)
    );
    setMultiItemJobSheetData({
      purchase_order_number: '',
      due_date: ''
    });
    setMultiItemJobSheetDialogOpen(true);
    
    // Load machines + warn about previously-run parts (any machine type)
    loadPressBrakeMachines();
    const allLines = quote.line_items || [];
    if (allLines.length > 0) {
      Promise.all(allLines.map(async (li) => ({
        part: li.part_description,
        entries: await fetchPartHistoryFor(li.drawing_number, li.part_description, quote.customer_id)
      }))).then(groups => {
        const withHist = groups.filter(g => g.entries.length > 0);
        if (withHist.length > 0) {
          setPartHistory(withHist);
          setPartHistoryOpen(true);
        }
      });
    }
  };
  
  const handleToggleLineItemSelection = (index) => {
    if (selectedLineItemsForJobSheet.includes(index)) {
      setSelectedLineItemsForJobSheet(selectedLineItemsForJobSheet.filter(i => i !== index));
    } else {
      setSelectedLineItemsForJobSheet([...selectedLineItemsForJobSheet, index]);
    }
  };
  
  const handleCreateMultiItemJobSheets = async () => {
    try {
      if (selectedLineItemsForJobSheet.length === 0) {
        alert('Please select at least one line item to create job sheets.');
        return;
      }
      
      const jobSheetsCreated = [];
      const errors = [];
      
      // Create job sheets for each selected line item
      for (const itemIndex of selectedLineItemsForJobSheet) {
        const lineItem = selectedQuote.line_items[itemIndex];
        const override = lineJobOverrides[itemIndex] || {};
        const defaultUnitEx = (parseFloat(lineItem.total) || 0) / Math.max(parseInt(lineItem.quantity) || 1, 1);
        const qtyOverride = override.quantity != null && override.quantity !== '' ? parseInt(override.quantity) : parseInt(lineItem.quantity);
        const unitExOverride = override.unit_price_ex_gst != null && override.unit_price_ex_gst !== '' ? parseFloat(override.unit_price_ex_gst) : defaultUnitEx;
        const unitInc = unitExOverride * 1.10;
        const totalValue = unitExOverride * qtyOverride * 1.10;
        
        // For each process in the line item
        if (lineItem.processes && lineItem.processes.length > 0) {
          for (const process of lineItem.processes) {
            try {
              const mId = (override.machines || {})[process.id] || null;
              const jobSheetData = {
                quote_id: selectedQuote.id,
                line_item_id: lineItem.id,
                line_item_number: lineItem.line_number || itemIndex + 1,
                part_description: lineItem.part_description,
                process_id: process.id,
                quantity: qtyOverride,
                unit_price: parseFloat(unitInc.toFixed(4)),
                unit_price_ex_gst: parseFloat(unitExOverride.toFixed(4)),
                total_value: parseFloat(totalValue.toFixed(2)),
                purchase_order_number: multiItemJobSheetData.purchase_order_number || null,
                due_date: multiItemJobSheetData.due_date ? new Date(multiItemJobSheetData.due_date).toISOString() : null,
                machine_id: mId,
                machine_name: mId ? (pressBrakeMachines.find(m => m.id === mId)?.machine_name || null) : null
              };
              
              await api.post('/job-sheets', jobSheetData);
              jobSheetsCreated.push(`Line ${lineItem.line_number}: ${process.name}`);
            } catch (error) {
              console.error('Error creating job sheet:', error);
              errors.push(`Line ${lineItem.line_number} - ${process.name}: ${error.response?.data?.detail || error.message}`);
            }
          }
        }
      }
      
      // Update quote status to "Job Created"
      try {
        await api.patch(`/quotes/${selectedQuote.id}/status`, { status: 'Job Created' });
        fetchQuotes();
      } catch (statusError) {
        console.error('Error updating quote status:', statusError);
      }
      
      // Show results
      if (jobSheetsCreated.length > 0 && errors.length === 0) {
        alert(`Successfully created ${jobSheetsCreated.length} job sheet(s):\n\n${jobSheetsCreated.join('\n')}`);
        setMultiItemJobSheetDialogOpen(false);
        setSelectedLineItemsForJobSheet([]);
        setLineJobOverrides({});
      } else if (jobSheetsCreated.length > 0 && errors.length > 0) {
        alert(`Created ${jobSheetsCreated.length} job sheet(s) with ${errors.length} error(s):\n\nSuccessful:\n${jobSheetsCreated.join('\n')}\n\nErrors:\n${errors.join('\n')}`);
      } else {
        alert(`Failed to create job sheets:\n\n${errors.join('\n')}`);
      }
    } catch (error) {
      console.error('Error in multi-item job sheet creation:', error);
      alert('Failed to create job sheets: ' + error.message);
    }
  };
  
  const handleDownloadLineItemDrawing = async (lineItem) => {
    if (!lineItem.drawing_url) {
      alert('No drawing file available for this line item.');
      return;
    }
    
    try {
      const response = await api.get(`/files/download?file_path=${encodeURIComponent(lineItem.drawing_url)}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', lineItem.drawing_filename || 'drawing.pdf');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading drawing:', error);
      alert('Failed to download drawing: ' + error.message);
    }
  };


  const getStatusBadge = (status) => {
    const colors = {
      'Draft': 'bg-gray-100 text-gray-800',
      'Sent': 'bg-blue-100 text-blue-800',
      'Accepted': 'bg-green-100 text-green-800',
      'Rejected': 'bg-red-100 text-red-800',
      'Job Created': 'bg-purple-100 text-purple-800',
      'Ready for Invoice': 'bg-orange-100 text-orange-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const filteredQuotes = quotes
    .filter(quote => {
      const q = (searchTerm || '').toLowerCase();
      if (!q) return !statusFilter || quote.status === statusFilter;
      const lineItemMatch = Array.isArray(quote.line_items) && quote.line_items.some(li =>
        (li.part_description || '').toLowerCase().includes(q) ||
        (li.item_ref_no || '').toString().toLowerCase().includes(q)
      );
      const matchesSearch =
        (quote.customer_name || '').toLowerCase().includes(q) ||
        (quote.quote_number || '').toString().toLowerCase().includes(q) ||
        (quote.part_description || '').toLowerCase().includes(q) ||
        (quote.drawing_number || '').toLowerCase().includes(q) ||
        lineItemMatch;
      const matchesStatus = !statusFilter || quote.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      // Sort by quote_number in descending order (newest first)
      // Extract numeric part from quote number (e.g., "Q-23" -> 23)
      const numA = parseInt(a.quote_number.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.quote_number.replace(/\D/g, '')) || 0;
      return numB - numA; // Descending order (highest number first)
    });

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD'
    }).format(value || 0);
  };

  // formatDate function now imported from centralized utility

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
            setEditingQuote(null);
            setIsMultiItem(false);
            setLineItems([]);
            setActiveLineItem(null);
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

      {/* Quote Period Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Quotes Today */}
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-600">Quotes Today</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.todayCount}</h3>
                <p className="text-sm text-blue-600 mt-1">{formatCurrency(stats.todayValue)}</p>
              </div>
              <div className="bg-blue-500 w-12 h-12 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quotes This Week */}
        <Card className="bg-gradient-to-br from-green-50 to-green-100">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-600">Quotes This Week</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.weekCount}</h3>
                <p className="text-sm text-green-600 mt-1">{formatCurrency(stats.weekValue)}</p>
              </div>
              <div className="bg-green-500 w-12 h-12 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quotes This Month */}
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-600">Quotes This Month</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.monthCount}</h3>
                <p className="text-sm text-purple-600 mt-1">{formatCurrency(stats.monthValue)}</p>
              </div>
              <div className="bg-purple-500 w-12 h-12 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
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
              <option value="Ready for Invoice">Ready for Invoice</option>
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
                  <TableHead>Customer</TableHead>
                  <TableHead>Part Description</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Quote Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuotes.map((quote) => (
                  <TableRow key={quote.id}>
                    <TableCell className="font-medium">{quote.quote_number}</TableCell>
                    <TableCell>{quote.customer_name}</TableCell>
                    <TableCell className="max-w-xs truncate">{quote.part_description}</TableCell>
                    <TableCell>{quote.quantity_required}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(quote.quote_total)}</TableCell>
                    <TableCell>
                      <Badge className={getStatusBadge(quote.status)}>
                        {quote.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(quote.quote_date)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewQuote(quote)}
                          title="View"
                        >
                          <FileText className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditQuote(quote)}
                          title="Edit"
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDuplicateQuote(quote)}
                          title="Duplicate Quote"
                          data-testid={`duplicate-quote-${quote.quote_number}`}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                        {quote.is_multi_item && (quote.line_items?.length || 0) > 0 && (!quote.quote_total || quote.quote_total <= 0) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => handleRecomputeTotal(quote, e)}
                            title="Total shows $0.00 — recompute from line items"
                            className="bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100"
                            data-testid={`recompute-quote-${quote.quote_number}`}
                          >
                            <RefreshCw className="w-3 h-3" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePrintQuote(quote)}
                          title="Print"
                        >
                          <Printer className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownloadPDF(quote)}
                          title="Download PDF"
                        >
                          <Download className="w-3 h-3" />
                        </Button>
                        {currentUser?.role === 'Administrator' && quote.status !== 'ready-to-invoice' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleMarkReadyToInvoice(quote)}
                            title="Override: Mark Ready to Invoice"
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                          >
                            <CheckCircle className="w-3 h-3" />
                          </Button>
                        )}
                        {currentUser?.role === 'Administrator' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteQuote(quote)}
                            title="Delete"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
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
      <Dialog open={createDialogOpen} onOpenChange={(open) => {
        if (!open) {
          // Save unfinished new quote as a server-side Draft (keeps its quote number)
          saveDraftOnLeave();
        }
        setCreateDialogOpen(open);
        if (!open) {
          // Clear all state when dialog closes
          setFormData(initialFormData);
          setEditingQuote(null);
          setIsMultiItem(false);
          setLineItems([]);
          setActiveLineItem(null);
        }
      }}>
        <DialogContent 
          className="max-w-[95vw] w-[95vw] max-h-[95vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{editingQuote ? `Edit Quote #${editingQuote.quote_number}` : 'Create New Quote'}</DialogTitle>
            <DialogDescription>
              {editingQuote ? `Editing Quote #${editingQuote.quote_number}` : 'Enter quote details. Quote Number will be auto-generated.'}
            </DialogDescription>
          </DialogHeader>
          
          {/* Sticky floating price bar */}
          <div className="sticky top-0 z-20 bg-slate-900 text-white rounded-lg px-4 py-2.5 flex items-center justify-between shadow-lg" data-testid="sticky-price-bar">
            <div className="flex items-center gap-4">
              {editingQuote && (
                <span className="bg-white/20 text-white text-sm font-bold px-3 py-1 rounded">
                  Quote #{editingQuote.quote_number}
                </span>
              )}
              <span className="text-sm text-slate-300">
                {formData.part_description || 'New Quote'} {formData.quantity_required ? `× ${formData.quantity_required}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-5">
              {(() => {
                const materialTotal = calculateTotalMaterialCost();
                const processTotal = formData.processes.reduce((sum, p) => sum + calculateProcessCost(p).totalCost, 0);
                const liveTotal = materialTotal + processTotal;
                const qty = formData.quantity_required || 1;
                const livePricePerPart = liveTotal / qty;
                const materialPerPart = materialTotal / qty;
                const processPerPart = processTotal / qty;
                let displayPrice = livePricePerPart;
                if (editingQuote && formData.enable_rounding && formData.saved_price_per_part > 0) {
                  displayPrice = formData.saved_price_per_part;
                } else if (formData.enable_rounding) {
                  if (formData.rounding_target === 'unit') {
                    displayPrice = calculateRoundedPrice(livePricePerPart, true);
                  } else {
                    displayPrice = calculateRoundedPrice(liveTotal, false) / qty;
                  }
                }
                return (
                  <>
                    {materialTotal > 0 && (
                      <div className="text-right border-r border-white/20 pr-4">
                        <div className="text-xs text-slate-400">Material/Part</div>
                        <div className="text-sm font-semibold text-slate-300">{formatCurrency(materialPerPart)}</div>
                      </div>
                    )}
                    {processTotal > 0 && (
                      <div className="text-right border-r border-white/20 pr-4">
                        <div className="text-xs text-slate-400">Labour/Part</div>
                        <div className="text-sm font-semibold text-slate-300">{formatCurrency(processPerPart)}</div>
                      </div>
                    )}
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Unit Price</div>
                      <div className="text-lg font-bold text-emerald-400">{formatCurrency(displayPrice)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Total</div>
                      <div className="text-lg font-bold text-white">{formatCurrency(liveTotal)}</div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
          
          <div className="space-y-6">
            {/* PART SPECIFICS */}
            <Card>
              <CardHeader className="bg-slate-50">
                <CardTitle className="text-lg">Part Specifics</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Item Reference</Label>
                    <Input value="Auto-generated" readOnly className="bg-gray-100" />
                  </div>
                  <div>
                    <Label>Customer *</Label>
                    <select
                      className="w-full border rounded-md px-3 py-2"
                      value={formData.customer_id}
                      onChange={(e) => handleCustomerChange(e.target.value)}
                    >
                      <option value="">Select customer...</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.customer_code} - {c.company_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Contact Person</Label>
                    <select
                      className="w-full border rounded-md px-3 py-2"
                      value={formData.contact_person}
                      onChange={(e) => handleInputChange('contact_person', e.target.value)}
                    >
                      <option value="">Select contact...</option>
                      {customerContacts.length > 0 ? (
                        customerContacts.map(contact => (
                          <option key={contact.id} value={contact.name}>
                            {contact.name} - {contact.role}
                          </option>
                        ))
                      ) : (
                        <option value="" disabled>No contacts available</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={formData.quote_date}
                      onChange={(e) => handleInputChange('quote_date', e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Part Description *</Label>
                    <Textarea
                      value={formData.part_description}
                      onChange={(e) => handleInputChange('part_description', e.target.value)}
                      rows={2}
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
                  <div className="col-span-2">
                    <Label>Upload Drawing (PDF, DWG, DXF, PNG, JPG)</Label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="file"
                        accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg"
                        onChange={handleFileUpload}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                      {formData.drawing_filename && (
                        <span className="text-sm text-green-600">✓ {formData.drawing_filename}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Upload part drawing for reference when job becomes active</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* MATERIAL SECTION */}
            <Card>
              <CardHeader className="bg-blue-50">
                <CardTitle className="text-lg">Material</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {/* Customer Supplied Material Checkbox */}
                  <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.customer_supplied_material}
                        onChange={(e) => handleInputChange('customer_supplied_material', e.target.checked)}
                        className="w-5 h-5"
                      />
                      <div>
                        <span className="font-semibold text-amber-900">Customer Supplied Material</span>
                        <p className="text-xs text-amber-700 mt-1">Check this if customer is providing their own material (no material cost will be charged)</p>
                      </div>
                    </label>
                  </div>

                  {!formData.customer_supplied_material && (
                    <>
                      <div className="flex gap-4 mb-4">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="material_source"
                            value="inventory"
                            checked={formData.material_source === 'inventory'}
                            onChange={(e) => handleInputChange('material_source', e.target.value)}
                          />
                          <span>Import from Inventory</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="material_source"
                            value="manual"
                            checked={formData.material_source === 'manual'}
                            onChange={(e) => handleInputChange('material_source', e.target.value)}
                          />
                          <span>Manual Entry</span>
                        </label>
                      </div>

                      {formData.material_source === 'inventory' ? (
                        <>
                          {/* Material Filters */}
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <Label>1. Filter by Material Type</Label>
                              <select
                                className="w-full border rounded-md px-3 py-2"
                                value={materialTypeFilter}
                                onChange={(e) => handleMaterialTypeFilterChange(e.target.value)}
                              >
                                <option value="">Select Material Type...</option>
                                {getUniqueMaterialTypes().map(type => (
                                  <option key={type} value={type}>{type}</option>
                                ))}
                              </select>
                            </div>
                            
                            <div>
                              <Label>2. Filter by Thickness</Label>
                              <select
                                className="w-full border rounded-md px-3 py-2"
                                value={materialThicknessFilter}
                                onChange={(e) => handleMaterialThicknessFilterChange(e.target.value)}
                                disabled={!materialTypeFilter}
                              >
                                <option value="">Select Thickness...</option>
                                {getUniqueThicknesses(materialTypeFilter).map(thickness => (
                                  <option key={thickness} value={thickness}>{thickness}</option>
                                ))}
                              </select>
                            </div>
                            
                            <div>
                              <Label>3. Filter by Grade (Optional)</Label>
                              <select
                                className="w-full border rounded-md px-3 py-2"
                                value={materialGradeFilter}
                                onChange={(e) => setMaterialGradeFilter(e.target.value)}
                                disabled={!materialTypeFilter || !materialThicknessFilter}
                              >
                                <option value="">All Grades</option>
                                {getUniqueGrades(materialTypeFilter, materialThicknessFilter).map(grade => (
                                  <option key={grade} value={grade}>{grade}</option>
                                ))}
                              </select>
                              {materialTypeFilter && materialThicknessFilter && getUniqueGrades(materialTypeFilter, materialThicknessFilter).length === 0 && (
                                <p className="text-xs text-gray-500 mt-1">No grades specified for this material</p>
                              )}
                            </div>
                          </div>
                          
                          {/* Material Selection */}
                          <div>
                            <Label>4. Select Material from Inventory</Label>
                            <select
                              className="w-full border rounded-md px-3 py-2"
                              value={formData.material_id}
                              onChange={(e) => handleMaterialChange(e.target.value)}
                              disabled={!materialTypeFilter || !materialThicknessFilter}
                            >
                              <option value="">Select material...</option>
                              {getFilteredMaterials().map(m => (
                                <option key={m.id} value={m.id}>
                                  {m.name} - {m.thickness} - {m.grade || 'No Grade'} - {m.finish}
                                </option>
                              ))}
                            </select>
                            
                            {getFilteredMaterials().length === 0 && materialTypeFilter && materialThicknessFilter && (
                              <p className="text-sm text-orange-600 mt-2">
                                ⚠️ No materials found with selected filters. Check your inventory or try different filters.
                              </p>
                            )}
                            
                            {materialTypeFilter && materialThicknessFilter && getFilteredMaterials().length > 0 && (
                              <p className="text-sm text-blue-600 mt-2">
                                📦 {getFilteredMaterials().length} material{getFilteredMaterials().length > 1 ? 's' : ''} available
                              </p>
                            )}
                            
                            {!materialTypeFilter && (
                              <p className="text-sm text-gray-500 mt-2">
                                💡 Start by selecting Material Type above
                              </p>
                            )}
                            
                            {formData.material_id && (
                              <p className="text-sm text-green-600 mt-2">
                                ✓ Material imported from inventory. Selling price auto-calculated with {formData.material_markup_percent}% markup.
                              </p>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="grid grid-cols-4 gap-4">
                            <div>
                              <Label>Material Type</Label>
                              <Input
                                value={formData.material_type}
                                onChange={(e) => handleInputChange('material_type', e.target.value)}
                              />
                            </div>
                            <div>
                              <Label>Grade</Label>
                              <Input
                                value={formData.grade}
                                onChange={(e) => handleInputChange('grade', e.target.value)}
                              />
                            </div>
                            <div>
                              <Label>Finish</Label>
                              <Input
                                value={formData.finish}
                                onChange={(e) => handleInputChange('finish', e.target.value)}
                              />
                            </div>
                            <div>
                              <Label>Thickness</Label>
                              <Input
                                value={formData.thickness}
                                onChange={(e) => handleInputChange('thickness', e.target.value)}
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-4">
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
                  </div>

                  {!formData.customer_supplied_material && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-semibold text-blue-900 mb-3">Material Pricing</h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label>Buying Cost/Sheet ($) *</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={formData.buying_cost_per_sheet}
                            onChange={(e) => handleBuyingCostChange(parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div>
                          <Label>Markup % *</Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={formData.material_markup_percent}
                            onChange={(e) => handleMarkupChange(parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div>
                          <Label>Selling Price/Sheet (Auto) *</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={formData.selling_price_per_sheet}
                            readOnly
                            className="bg-green-100 font-semibold"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-blue-700 mt-2">
                        💡 Selling Price = Buying Cost × (1 + Markup%). Example: $100 × 1.10 = $110
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* NESTING CALCULATOR */}
            <Card>
              <CardHeader className="bg-green-50">
                <CardTitle className="text-lg">Nesting Calculator</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid grid-cols-5 gap-4">
                  <div>
                    <Label>Border X (mm)</Label>
                    <Input
                      type="number"
                      value={formData.border_x}
                      onChange={(e) => handleInputChange('border_x', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label>Border Y (mm)</Label>
                    <Input
                      type="number"
                      value={formData.border_y}
                      onChange={(e) => handleInputChange('border_y', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label>Part Width (mm)</Label>
                    <Input
                      type="number"
                      value={formData.part_width}
                      onChange={(e) => handleInputChange('part_width', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label>Part Height (mm)</Label>
                    <Input
                      type="number"
                      value={formData.part_height}
                      onChange={(e) => handleInputChange('part_height', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label>Space Between (mm)</Label>
                    <Input
                      type="number"
                      value={formData.space_between_parts}
                      onChange={(e) => handleInputChange('space_between_parts', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
                
                <div className="mt-4 bg-green-100 border border-green-300 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <p className="text-sm text-green-700">Parts per Sheet</p>
                      <p className="text-3xl font-bold text-green-900">{calculateNesting().partsPerSheet}</p>
                    </div>
                    <div>
                      <p className="text-sm text-green-700">Sheets Required</p>
                      <p className="text-3xl font-bold text-green-900">{calculateNesting().sheetsRequired}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* PROCESSES */}
            <Card>
              <CardHeader className="bg-yellow-50 flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Processes</CardTitle>
                <div className="flex gap-2">
                  <select
                    className="border rounded-md px-3 py-2 text-sm"
                    onChange={(e) => {
                      if (e.target.value) {
                        addProcess(e.target.value);
                        e.target.value = ''; // Reset
                      }
                    }}
                    defaultValue=""
                  >
                    <option value="">Add Process...</option>
                    <option value="Laser Cutting">➕ Laser Cutting</option>
                    <option value="Press Brake">➕ Press Brake (Folding)</option>
                    <option value="Welding">➕ Welding</option>
                    <option value="Powder Coating">➕ Powder Coating</option>
                    <option value="Custom">➕ Custom Process</option>
                  </select>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {formData.processes.map((process) => (
                    <div key={process.id} className="border rounded-lg bg-white">
                      {/* Process Header - Always Visible */}
                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-t-lg">
                        <div className="flex gap-4 items-center flex-1">
                          <Input
                            value={process.name}
                            onChange={(e) => handleProcessChange(process.id, 'name', e.target.value)}
                            className="font-semibold max-w-xs"
                            placeholder="Process name"
                          />
                          <div className="flex gap-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`type-${process.id}`}
                                value="in-house"
                                checked={process.type === 'in-house'}
                                onChange={(e) => handleProcessChange(process.id, 'type', e.target.value)}
                                className="w-4 h-4"
                              />
                              <span className="text-sm">In-House</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`type-${process.id}`}
                                value="outsource"
                                checked={process.type === 'outsource'}
                                onChange={(e) => handleProcessChange(process.id, 'type', e.target.value)}
                                className="w-4 h-4"
                              />
                              <span className="text-sm">Outsource</span>
                            </label>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right mr-4">
                            <div className="text-xs text-gray-500">Total Cost</div>
                            <div className="text-lg font-bold text-green-700">
                              {formatCurrency(calculateProcessCost(process).totalCost)}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleProcessExpand(process.id)}
                          >
                            {process.expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeProcess(process.id)}
                            disabled={formData.processes.length === 1}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      
                      {/* Process Details - Collapsible */}
                      {process.expanded && (
                        <div className="p-4 border-t">
                      
                      {process.type === 'in-house' ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <Label>Setup Time</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={process.setup_time}
                                onChange={(e) => handleProcessChange(process.id, 'setup_time', parseFloat(e.target.value) || 0)}
                              />
                            </div>
                            <div>
                              <Label>Setup Unit</Label>
                              <select
                                className="w-full border rounded-md px-3 py-2"
                                value={process.setup_time_unit}
                                onChange={(e) => handleProcessChange(process.id, 'setup_time_unit', e.target.value)}
                              >
                                <option value="min">Minutes</option>
                                <option value="sec">Seconds</option>
                              </select>
                            </div>
                            {/* Setup cost is now absorbed into cost per part, don't show separately */}
                            {calculateProcessCost(process).setupCost > 0 && (
                              <div>
                                <Label>Setup Cost (One-time)</Label>
                                <Input
                                  value={formatCurrency(calculateProcessCost(process).setupCost)}
                                  readOnly
                                  className="bg-blue-50 font-semibold"
                                />
                              </div>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-4 gap-4">
                            <div>
                              <Label>Time per Part</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={process.time_per_part}
                                onChange={(e) => handleProcessChange(process.id, 'time_per_part', parseFloat(e.target.value) || 0)}
                              />
                            </div>
                            <div>
                              <Label>Unit</Label>
                              <select
                                className="w-full border rounded-md px-3 py-2"
                                value={process.time_unit}
                                onChange={(e) => handleProcessChange(process.id, 'time_unit', e.target.value)}
                              >
                                <option value="min">Min per Part</option>
                                <option value="sec">Sec per Part</option>
                              </select>
                            </div>
                            <div>
                              <Label>Hourly Rate ($)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={process.hourly_rate}
                                onChange={(e) => handleProcessChange(process.id, 'hourly_rate', parseFloat(e.target.value) || 0)}
                              />
                            </div>
                            <div>
                              <Label>Cost per Part</Label>
                              <Input
                                value={formatCurrency(calculateProcessCost(process).costPerPart)}
                                readOnly
                                className="bg-yellow-50 font-semibold"
                              />
                            </div>
                          </div>
                          
                          
                          {/* Press Brake Specific Fields */}
                          {(process.name && (process.name.toLowerCase().includes('press brake') || process.name.toLowerCase().includes('fold'))) && (
                            <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 space-y-3">
                              <div className="flex justify-between items-center mb-2">
                                <h4 className="font-semibold text-amber-900">🔧 Press Brake Configuration</h4>
                                
                                {/* Drawing Upload Button */}
                                <div className="flex gap-2">
                                  <input
                                    type="file"
                                    id={`drawing-upload-${process.id}`}
                                    accept=".dxf,.pdf,.step,.stp"
                                    className="hidden"
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      
                                      // Show loading state
                                      handleProcessChange(process.id, 'analyzing_drawing', true);
                                      
                                      try {
                                        const formData = new FormData();
                                        formData.append('file', file);
                                        
                                        // Use the same API base as other calls
                                        const backendUrl = api.defaults.baseURL.replace('/api', '');
                                        const response = await fetch(`${backendUrl}/api/drawing-analysis/analyze`, {
                                          method: 'POST',
                                          body: formData
                                        });
                                        
                                        if (!response.ok) {
                                          const errorData = await response.json().catch(() => ({}));
                                          throw new Error(errorData.detail || 'Analysis failed');
                                        }
                                        
                                        const result = await response.json();
                                        
                                        // Auto-populate detected values
                                        if (result.bend_count > 0) {
                                          handleProcessChange(process.id, 'number_of_bends', result.bend_count);
                                        }
                                        if (result.longest_bend_length > 0) {
                                          handleProcessChange(process.id, 'bend_length', result.longest_bend_length);
                                        }
                                        if (result.thickness) {
                                          handleProcessChange(process.id, 'thickness', result.thickness);
                                        }
                                        if (result.material_type) {
                                          handleProcessChange(process.id, 'material_type', result.material_type);
                                        }
                                        if (result.part_length) {
                                          handlePartDimensionChange(process.id, 'part_length', result.part_length);
                                        }
                                        if (result.part_width) {
                                          handlePartDimensionChange(process.id, 'part_width', result.part_width);
                                        }
                                        if (result.part_weight) {
                                          handleProcessChange(process.id, 'part_weight', result.part_weight);
                                        }
                                        if (result.estimated_flips > 0) {
                                          handleProcessChange(process.id, 'flips_per_part', result.estimated_flips);
                                        }
                                        if (result.difficulty_level) {
                                          handleProcessChange(process.id, 'difficulty_level', result.difficulty_level);
                                        }
                                        if (result.geometry_type) {
                                          handleProcessChange(process.id, 'geometry_type', result.geometry_type);
                                        }
                                        
                                        // Store analysis result for display
                                        handleProcessChange(process.id, 'drawing_analysis', result);
                                        
                                        alert(`✅ Drawing analyzed!\n\nDetected:\n- ${result.bend_count} bends\n- Longest bend: ${result.longest_bend_length}mm\n- Geometry: ${result.geometry_type}\n- Confidence: ${result.detection_confidence}\n\n${result.detection_notes.join('\n')}`);
                                        
                                      } catch (error) {
                                        console.error('Drawing analysis error:', error);
                                        // Try to get more details from the response
                                        let errorMsg = 'Unknown error';
                                        if (error.message) errorMsg = error.message;
                                        alert(`❌ Failed to analyze drawing.\n\nError: ${errorMsg}\n\nPlease ensure:\n1. File is a valid DXF or PDF\n2. File is not corrupted\n3. File size is reasonable`);
                                      } finally {
                                        handleProcessChange(process.id, 'analyzing_drawing', false);
                                        e.target.value = ''; // Reset file input
                                      }
                                    }}
                                  />
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => document.getElementById(`drawing-upload-${process.id}`).click()}
                                    disabled={process.analyzing_drawing}
                                    className="bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
                                  >
                                    {process.analyzing_drawing ? (
                                      <>⏳ Analyzing...</>
                                    ) : (
                                      <>📐 Upload Drawing (DXF/PDF)</>
                                    )}
                                  </Button>
                                  {process.drawing_analysis && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleProcessChange(process.id, 'drawing_analysis', null)}
                                      className="text-gray-500"
                                    >
                                      ✕ Clear
                                    </Button>
                                  )}
                                </div>
                              </div>
                              
                              {/* Drawing Analysis Result Banner */}
                              {process.drawing_analysis && (
                                <div className="bg-blue-100 border border-blue-300 rounded-lg p-3 mb-3">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <div className="font-semibold text-blue-800">
                                        📄 {process.drawing_analysis.file_name} - {process.drawing_analysis.file_type}
                                      </div>
                                      <div className="text-sm text-blue-700 mt-1">
                                        <span className={`px-2 py-0.5 rounded text-xs ${
                                          process.drawing_analysis.detection_confidence === 'high' ? 'bg-green-200 text-green-800' :
                                          process.drawing_analysis.detection_confidence === 'medium' ? 'bg-yellow-200 text-yellow-800' :
                                          'bg-red-200 text-red-800'
                                        }`}>
                                          {process.drawing_analysis.detection_confidence.toUpperCase()} CONFIDENCE
                                        </span>
                                        <span className="ml-2">
                                          Detected: {process.drawing_analysis.bend_count} bends, 
                                          {process.drawing_analysis.geometry_type} geometry
                                        </span>
                                      </div>
                                      {process.drawing_analysis.detection_notes?.length > 0 && (
                                        <div className="text-xs text-blue-600 mt-1">
                                          {process.drawing_analysis.detection_notes.slice(0, 3).join(' • ')}
                                        </div>
                                      )}
                                    </div>
                                    <div className="text-xs text-blue-600">
                                      All values are editable below ↓
                                    </div>
                                  </div>
                                </div>
                              )}
                              
                              <div className="grid grid-cols-5 gap-4">
                                <div>
                                  <Label>Material</Label>
                                  <select
                                    className="w-full border rounded-md px-3 py-2"
                                    value={process.material_type}
                                    onChange={(e) => handleProcessMaterialChange(process.id, e.target.value)}
                                  >
                                    {getAllMaterials().map(material => (
                                      <option key={material} value={material}>{material}</option>
                                    ))}
                                    <option value="___ADD_NEW___">➕ Add New Material...</option>
                                  </select>
                                </div>
                                <div>
                                  <Label>Thickness (mm)</Label>
                                  <Input
                                    type="number"
                                    step="0.1"
                                    value={process.thickness}
                                    onChange={(e) => handleProcessChange(process.id, 'thickness', parseFloat(e.target.value) || 0)}
                                    placeholder="3.0"
                                  />
                                </div>
                                <div>
                                  <Label>Bend Length (mm) *</Label>
                                  <Input
                                    type="number"
                                    step="1"
                                    value={process.bend_length}
                                    onChange={(e) => handleProcessChange(process.id, 'bend_length', parseFloat(e.target.value) || 0)}
                                    placeholder="1000"
                                  />
                                  <p className="text-xs text-gray-500 mt-1">Longest bend</p>
                                </div>
                                <div>
                                  <Label>Number of Bends *</Label>
                                  <Input
                                    type="number"
                                    value={process.number_of_bends}
                                    onChange={(e) => handleProcessChange(process.id, 'number_of_bends', parseInt(e.target.value) || 0)}
                                    placeholder="1"
                                  />
                                </div>
                                <div>
                                  <Label>Flips per Part</Label>
                                  <Input
                                    type="number"
                                    value={process.flips_per_part || 0}
                                    onChange={(e) => handleProcessChange(process.id, 'flips_per_part', parseInt(e.target.value) || 0)}
                                    placeholder="0"
                                  />
                                  <p className="text-xs text-gray-500 mt-1">Repositions</p>
                                </div>
                              </div>
                              
                              {/* Part Dimensions Row - for auto weight calculation */}
                              <div className="grid grid-cols-5 gap-4">
                                <div>
                                  <Label>Part Length (mm)</Label>
                                  <Input
                                    type="number"
                                    step="1"
                                    value={process.part_length || ''}
                                    onChange={(e) => handlePartDimensionChange(process.id, 'part_length', parseFloat(e.target.value) || 0)}
                                    placeholder="500"
                                  />
                                  <p className="text-xs text-gray-500 mt-1">For weight calc</p>
                                </div>
                                <div>
                                  <Label>Part Width (mm)</Label>
                                  <Input
                                    type="number"
                                    step="1"
                                    value={process.part_width || ''}
                                    onChange={(e) => handlePartDimensionChange(process.id, 'part_width', parseFloat(e.target.value) || 0)}
                                    placeholder="300"
                                  />
                                  <p className="text-xs text-gray-500 mt-1">For weight calc</p>
                                </div>
                                <div>
                                  <Label>Part Weight (kg)</Label>
                                  <Input
                                    type="number"
                                    step="0.001"
                                    value={process.part_weight || ''}
                                    onChange={(e) => handleProcessChange(process.id, 'part_weight', parseFloat(e.target.value) || 0)}
                                    placeholder="Auto-calculated"
                                    className={process.part_length > 0 && process.part_width > 0 ? 'bg-green-50' : ''}
                                  />
                                  <p className="text-xs text-gray-500 mt-1">
                                    {process.part_length > 0 && process.part_width > 0 ? '✓ Auto-calculated' : 'Or enter manually'}
                                  </p>
                                </div>
                                <div>
                                  <Label>Geometry Type *</Label>
                                  <select
                                    className="w-full border rounded-md px-3 py-2"
                                    value={process.geometry_type || 'flange'}
                                    onChange={(e) => handleProcessChange(process.id, 'geometry_type', e.target.value)}
                                  >
                                    <option value="flange">Simple Flange</option>
                                    <option value="channel">Channel</option>
                                    <option value="box">Box</option>
                                    <option value="complex">Complex</option>
                                  </select>
                                  <p className="text-xs text-gray-500 mt-1">Box = last bend penalty</p>
                                </div>
                                <div>
                                  <Label>Difficulty Level *</Label>
                                  <select
                                    className="w-full border rounded-md px-3 py-2"
                                    value={process.difficulty_level || 'simple'}
                                    onChange={(e) => handleProcessChange(process.id, 'difficulty_level', e.target.value)}
                                  >
                                    <option value="simple">Simple (×1.0)</option>
                                    <option value="moderate">Moderate (×1.2)</option>
                                    <option value="complex">Complex (×1.5)</option>
                                  </select>
                                  <p className="text-xs text-gray-500 mt-1">Part complexity</p>
                                </div>
                              </div>
                              
                              {/* Packing & Efficiency Row */}
                              <div className="grid grid-cols-4 gap-4">
                                <div>
                                  <Label>Packing Sec Per Part</Label>
                                  <Input
                                    type="number"
                                    step="0.1"
                                    value={process.packing_time || 0}
                                    onChange={(e) => handleProcessChange(process.id, 'packing_time', parseFloat(e.target.value) || 0)}
                                    placeholder="15"
                                  />
                                  <p className="text-xs text-gray-500 mt-1">Pack/handle time</p>
                                </div>
                                <div>
                                  <Label>Efficiency Factor (%)</Label>
                                  <Input
                                    type="number"
                                    step="1"
                                    value={process.efficiency_factor !== undefined ? process.efficiency_factor : 10}
                                    onChange={(e) => handleProcessChange(process.id, 'efficiency_factor', parseFloat(e.target.value) || 0)}
                                    placeholder="10"
                                  />
                                  <p className="text-xs text-gray-500 mt-1">Shop-floor buffer</p>
                                </div>
                              </div>
                              
                              {/* Press Brake Labour Time Calculation - ENHANCED ENGINE */}
                              {(() => {
                                // === INPUTS ===
                                const bendLength = process.bend_length || 0;
                                const numBends = process.number_of_bends || 0;
                                const thickness = process.thickness || 3;
                                const weight = process.part_weight || 0;
                                const flipsPerPart = process.flips_per_part || 0;
                                const difficultyLevel = process.difficulty_level || 'simple';
                                
                                // === 1. BASE BEND TIME (based on bend length) ===
                                let baseBendTime = 15; // default ≤500mm
                                if (bendLength > 2000) baseBendTime = 45;
                                else if (bendLength > 1000) baseBendTime = 30;
                                else if (bendLength > 500) baseBendTime = 20;
                                
                                // === 2. THICKNESS MODIFIER ===
                                let thicknessFactor = 1.0;
                                let thicknessLabel = '≤2mm';
                                if (thickness > 10) { thicknessFactor = 1.50; thicknessLabel = '>10mm'; }
                                else if (thickness > 6) { thicknessFactor = 1.30; thicknessLabel = '6-10mm'; }
                                else if (thickness > 2) { thicknessFactor = 1.15; thicknessLabel = '2-6mm'; }
                                
                                // === 3. V-DIE CALCULATION & MODIFIER ===
                                // V-Die rule: V = thickness × 8 (standard rule)
                                const calculatedVDie = thickness * 8;
                                const vDie = process.manual_v_die && process.v_die_override > 0 
                                  ? process.v_die_override 
                                  : calculatedVDie;
                                
                                let vDieFactor = 1.0;
                                let vDieLabel = '≤12V';
                                if (vDie > 40) { vDieFactor = 1.35; vDieLabel = '>40V'; }
                                else if (vDie > 24) { vDieFactor = 1.20; vDieLabel = '24-40V'; }
                                else if (vDie > 12) { vDieFactor = 1.10; vDieLabel = '12-24V'; }
                                
                                // === 4. BEND TIME (with modifiers) ===
                                const bendTime = baseBendTime * thicknessFactor * vDieFactor;
                                
                                // === 5. FORMING TIME ===
                                const formingTime = bendTime * numBends;
                                
                                // === 6. WEIGHT HANDLING ADJUSTMENT ===
                                let handlingTime = 0;
                                if (weight > 25) handlingTime = 30;
                                else if (weight > 15) handlingTime = 20;
                                else if (weight > 10) handlingTime = 10;
                                else if (weight > 5) handlingTime = 5;
                                
                                // === 7. FLIP TIME (based on bend length per spec) ===
                                let flipTimePerFlip = 3; // ≤500mm
                                if (bendLength > 2000) flipTimePerFlip = 12;
                                else if (bendLength > 1200) flipTimePerFlip = 8;
                                else if (bendLength > 500) flipTimePerFlip = 5;
                                const flipTime = flipsPerPart * flipTimePerFlip;
                                
                                // === 8. GEOMETRY TYPE (user-selected or default) ===
                                const geometryType = process.geometry_type || 'flange';
                                
                                // === 9. LAST BEND BOX PENALTY ===
                                // Applies only to box or complex geometries
                                const isBox = geometryType === 'box' || geometryType === 'complex';
                                const lastBendPenalty = isBox ? bendTime * 0.5 : 0;
                                
                                // === 10. PART TIME (before difficulty & operators) ===
                                const partTime = formingTime + handlingTime + flipTime + lastBendPenalty;
                                
                                // === 11. DIFFICULTY FACTOR ===
                                let difficultyFactor = 1.0;
                                if (difficultyLevel === 'moderate') difficultyFactor = 1.2;
                                else if (difficultyLevel === 'complex') difficultyFactor = 1.5;
                                
                                const adjustedTime = partTime * difficultyFactor;
                                
                                // === 12. SECOND OPERATOR RULE ===
                                const needsSecondOperator = weight > 15 || bendLength > 2000;
                                const operatorMultiplier = needsSecondOperator ? 2 : 1;
                                
                                const totalLabourTime = adjustedTime * operatorMultiplier;
                                const totalLabourMinutes = totalLabourTime / 60;
                                
                                // Add packing time
                                const packingTime = process.packing_time || 0;
                                const totalWithPacking = totalLabourTime + packingTime;
                                
                                // Apply efficiency factor
                                const efficiencyFactor = (process.efficiency_factor !== undefined ? process.efficiency_factor : 10) / 100;
                                const calculatedTimePerPart = totalWithPacking * (1 + efficiencyFactor);
                                
                                // Check for manual override
                                const hasOverride = process.seconds_override !== null && process.seconds_override !== undefined && process.seconds_override !== '' && parseFloat(process.seconds_override) > 0;
                                const finalTimePerPart = hasOverride ? parseFloat(process.seconds_override) : calculatedTimePerPart;
                                
                                return (
                                  <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
                                    <h4 className="font-semibold text-green-900 mb-3">⏱️ Press Brake Labour Time Calculation (Enhanced)</h4>
                                    
                                    {/* Geometry & Modifiers Info */}
                                    <div className="grid grid-cols-4 gap-2 mb-3">
                                      <div className="bg-white rounded p-2 text-center border">
                                        <div className="text-xs text-gray-500">Geometry</div>
                                        <div className="font-semibold text-purple-700 capitalize">{geometryType}</div>
                                      </div>
                                      <div className="bg-white rounded p-2 text-center border">
                                        <div className="text-xs text-gray-500">V-Die</div>
                                        <div className="font-semibold text-blue-700">{vDie.toFixed(0)}V</div>
                                      </div>
                                      <div className="bg-white rounded p-2 text-center border">
                                        <div className="text-xs text-gray-500">Thickness Factor</div>
                                        <div className="font-semibold text-orange-700">×{thicknessFactor.toFixed(2)}</div>
                                        <div className="text-xs text-gray-400">{thicknessLabel}</div>
                                      </div>
                                      <div className="bg-white rounded p-2 text-center border">
                                        <div className="text-xs text-gray-500">V-Die Factor</div>
                                        <div className="font-semibold text-orange-700">×{vDieFactor.toFixed(2)}</div>
                                        <div className="text-xs text-gray-400">{vDieLabel}</div>
                                      </div>
                                    </div>
                                    
                                    {/* Calculation Breakdown */}
                                    <div className="bg-white rounded p-3 mb-3 text-sm space-y-1">
                                      <div className="flex justify-between text-gray-600">
                                        <span>Base Bend Time ({bendLength}mm):</span>
                                        <span className="font-mono">{baseBendTime} sec</span>
                                      </div>
                                      <div className="flex justify-between text-orange-600">
                                        <span>× Thickness ({thicknessLabel}) × V-Die ({vDieLabel}):</span>
                                        <span className="font-mono">×{(thicknessFactor * vDieFactor).toFixed(2)}</span>
                                      </div>
                                      <div className="flex justify-between border-t pt-1">
                                        <span>= Bend Time per Bend:</span>
                                        <span className="font-mono">{bendTime.toFixed(1)} sec</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>× Number of Bends ({numBends}):</span>
                                        <span className="font-mono">{formingTime.toFixed(1)} sec</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>+ Handling Time ({weight.toFixed(1)}kg):</span>
                                        <span className="font-mono">{handlingTime} sec</span>
                                      </div>
                                      {flipsPerPart > 0 && (
                                        <div className="flex justify-between text-purple-700">
                                          <span>+ Flip Time ({flipsPerPart} × {flipTimePerFlip}s):</span>
                                          <span className="font-mono">{flipTime} sec</span>
                                        </div>
                                      )}
                                      {lastBendPenalty > 0 && (
                                        <div className="flex justify-between text-red-600">
                                          <span>+ Box Last Bend Penalty:</span>
                                          <span className="font-mono">{lastBendPenalty.toFixed(1)} sec</span>
                                        </div>
                                      )}
                                      <div className="flex justify-between border-t pt-1">
                                        <span>= Part Time:</span>
                                        <span className="font-mono">{partTime.toFixed(1)} sec</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>× Difficulty ({difficultyLevel}: ×{difficultyFactor}):</span>
                                        <span className="font-mono">{adjustedTime.toFixed(1)} sec</span>
                                      </div>
                                      {needsSecondOperator && (
                                        <div className="flex justify-between text-red-600">
                                          <span>× 2 Operators Required:</span>
                                          <span className="font-mono">{totalLabourTime.toFixed(1)} sec</span>
                                        </div>
                                      )}
                                      <div className="flex justify-between">
                                        <span>+ Packing:</span>
                                        <span className="font-mono">{packingTime} sec</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>+ Efficiency ({process.efficiency_factor || 10}%):</span>
                                        <span className="font-mono">{(totalWithPacking * efficiencyFactor).toFixed(1)} sec</span>
                                      </div>
                                      <div className={`flex justify-between border-t pt-1 font-bold ${hasOverride ? 'text-orange-600 line-through' : 'text-green-800'}`}>
                                        <span>= Calculated Labour per Part:</span>
                                        <span className="font-mono">{calculatedTimePerPart.toFixed(1)} sec ({(calculatedTimePerPart/60).toFixed(2)} min)</span>
                                      </div>
                                      {hasOverride && (
                                        <div className="flex justify-between font-bold text-blue-800 bg-blue-50 p-1 rounded">
                                          <span>⚡ OVERRIDE Applied:</span>
                                          <span className="font-mono">{finalTimePerPart.toFixed(1)} sec ({(finalTimePerPart/60).toFixed(2)} min)</span>
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* Override Input */}
                                    <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3">
                                      <div className="flex items-center gap-4">
                                        <div className="flex-1">
                                          <Label className="text-blue-800 font-semibold">⚡ Override Seconds per Part</Label>
                                          <p className="text-xs text-blue-600 mb-2">Leave empty to use calculated value, or enter custom seconds</p>
                                          <Input
                                            type="number"
                                            step="0.1"
                                            value={process.seconds_override || ''}
                                            onChange={(e) => handleProcessChange(process.id, 'seconds_override', e.target.value === '' ? null : parseFloat(e.target.value))}
                                            placeholder={`Calculated: ${calculatedTimePerPart.toFixed(1)} sec`}
                                            className={hasOverride ? 'border-blue-500 bg-blue-100' : ''}
                                          />
                                        </div>
                                        {hasOverride && (
                                          <Button 
                                            variant="outline" 
                                            size="sm"
                                            onClick={() => handleProcessChange(process.id, 'seconds_override', null)}
                                            className="text-red-600 border-red-300 hover:bg-red-50"
                                          >
                                            Clear Override
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                    
                                    {/* Summary Cards - All Required Outputs */}
                                    <div className="grid grid-cols-5 gap-3">
                                      <div className="bg-gray-100 rounded p-3 text-center">
                                        <div className="text-xs text-gray-600 mb-1">Sec/Bend</div>
                                        <div className="text-xl font-bold text-gray-700">{bendTime.toFixed(1)}</div>
                                      </div>
                                      <div className={`rounded p-3 text-center ${hasOverride ? 'bg-blue-100 border-2 border-blue-400' : 'bg-white'}`}>
                                        <div className="text-xs text-gray-600 mb-1">Sec/Part {hasOverride && '⚡'}</div>
                                        <div className={`text-xl font-bold ${hasOverride ? 'text-blue-700' : 'text-green-700'}`}>{finalTimePerPart.toFixed(0)}</div>
                                      </div>
                                      <div className={`rounded p-3 text-center ${hasOverride ? 'bg-blue-100 border-2 border-blue-400' : 'bg-white'}`}>
                                        <div className="text-xs text-gray-600 mb-1">Min/Part {hasOverride && '⚡'}</div>
                                        <div className={`text-xl font-bold ${hasOverride ? 'text-blue-700' : 'text-blue-700'}`}>{(finalTimePerPart/60).toFixed(2)}</div>
                                      </div>
                                      <div className={`rounded p-3 text-center ${needsSecondOperator ? 'bg-red-100' : 'bg-white'}`}>
                                        <div className="text-xs text-gray-600 mb-1">Operators</div>
                                        <div className={`text-xl font-bold ${needsSecondOperator ? 'text-red-700' : 'text-gray-700'}`}>
                                          {operatorMultiplier} {needsSecondOperator && '⚠️'}
                                        </div>
                                      </div>
                                      <div className="bg-amber-100 rounded p-3 text-center">
                                        <div className="text-xs text-gray-600 mb-1">Total Hours</div>
                                        <div className="text-xl font-bold text-amber-700">
                                          {((finalTimePerPart * (formData.quantity_required || 1))/3600).toFixed(2)}
                                        </div>
                                        <div className="text-xs text-amber-600">({formData.quantity_required || 1} pcs)</div>
                                      </div>
                                    </div>
                                    
                                    {needsSecondOperator && (
                                      <div className="mt-3 p-2 bg-red-100 border border-red-300 rounded text-sm text-red-800">
                                        ⚠️ <strong>Second Operator Required:</strong> {weight > 15 ? `Part weight (${weight}kg) > 15kg` : ''} 
                                        {weight > 15 && bendLength > 2000 ? ' AND ' : ''}
                                        {bendLength > 2000 ? `Bend length (${bendLength}mm) > 2000mm` : ''}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                              
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label>Bend Angles</Label>
                                  <Input
                                    value={process.bend_angles || ''}
                                    onChange={(e) => handleProcessChange(process.id, 'bend_angles', e.target.value)}
                                    placeholder="4 x 90° (2 Up / 2 Down)"
                                  />
                                  <p className="text-xs text-gray-500 mt-1">e.g., &quot;4 x 90° (2 Up / 2 Down)&quot;</p>
                                </div>
                                <div>
                                  <Label>Tooling Required</Label>
                                  <div className="grid grid-cols-3 gap-1 mb-1">
                                    <select
                                      className="h-8 text-xs border rounded px-1 bg-white"
                                      value={(processToolingSel[process.id] || {}).system || ''}
                                      onChange={(e) => updateToolingSel(process.id, { system: e.target.value, punch: '', die: '' })}
                                      data-testid={`quote-tooling-system-${process.id}`}
                                    >
                                      <option value="">Library…</option>
                                      <option value="Wila">Willa Tooling Library{toolingSystemLabel('Wila')}</option>
                                      <option value="Euro">Euro Style Tooling Library{toolingSystemLabel('Euro')}</option>
                                    </select>
                                    <select
                                      className="h-8 text-xs border rounded px-1 bg-white"
                                      value={(processToolingSel[process.id] || {}).punch || ''}
                                      onChange={(e) => updateToolingSel(process.id, { punch: e.target.value })}
                                      disabled={!(processToolingSel[process.id] || {}).system}
                                      data-testid={`quote-tooling-punch-${process.id}`}
                                    >
                                      <option value="">Top Punch…</option>
                                      {toolingLib
                                        .filter(t => t.tooling_type === 'top_punch' && t.tooling_system === (processToolingSel[process.id] || {}).system)
                                        .map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                                    </select>
                                    <select
                                      className="h-8 text-xs border rounded px-1 bg-white"
                                      value={(processToolingSel[process.id] || {}).die || ''}
                                      onChange={(e) => updateToolingSel(process.id, { die: e.target.value })}
                                      disabled={!(processToolingSel[process.id] || {}).system}
                                      data-testid={`quote-tooling-die-${process.id}`}
                                    >
                                      <option value="">V Die…</option>
                                      {toolingLib
                                        .filter(t => t.tooling_type === 'v_die' && t.tooling_system === (processToolingSel[process.id] || {}).system)
                                        .map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                                    </select>
                                  </div>
                                  <Input
                                    value={process.tooling_required || ''}
                                    onChange={(e) => handleProcessChange(process.id, 'tooling_required', e.target.value)}
                                    placeholder="Punch: 11.049 (R8)  Die: V40"
                                    data-testid={`quote-tooling-required-${process.id}`}
                                  />
                                  <p className="text-xs text-gray-500 mt-1">Pick a machine&apos;s library then its punch &amp; die — or type manually. Manage lists on the Machines page.</p>
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label>Process Notes</Label>
                                  <Textarea
                                    value={process.process_notes || ''}
                                    onChange={(e) => handleProcessChange(process.id, 'process_notes', e.target.value)}
                                    placeholder="Tooling requirements, safety notes, special instructions..."
                                    rows={3}
                                    className="resize-y"
                                  />
                                </div>
                              </div>
                              
                              {/* Manual V-Die Override */}
                              <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
                                <div className="flex items-center gap-3 mb-3">
                                  <input
                                    type="checkbox"
                                    id={`manual_v_die_${process.id}`}
                                    checked={process.manual_v_die || false}
                                    onChange={(e) => handleProcessChange(process.id, 'manual_v_die', e.target.checked)}
                                    className="w-4 h-4"
                                  />
                                  <Label htmlFor={`manual_v_die_${process.id}`} className="cursor-pointer font-semibold text-yellow-900">
                                    🔧 Manual V-Die Override (if standard size not available)
                                  </Label>
                                </div>
                                {process.manual_v_die && (
                                  <div className="mt-2">
                                    <Label>Enter V-Die Size (mm)</Label>
                                    <Input
                                      type="number"
                                      step="0.1"
                                      value={process.v_die_override || ''}
                                      onChange={(e) => handleProcessChange(process.id, 'v_die_override', parseFloat(e.target.value) || 0)}
                                      placeholder="24.0"
                                      className="w-48"
                                    />
                                    <p className="text-xs text-yellow-700 mt-1">
                                      Override calculated V-Die size with your actual tooling
                                    </p>
                                  </div>
                                )}
                              </div>
                              
                              {/* Live Press Brake Calculations */}
                              {(() => {
                                const specs = calculatePressBrakeSpecs(process);
                                return specs && (
                                  <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
                                    <h4 className="font-semibold text-blue-900 mb-3">📊 Tooling Calculations</h4>
                                    <div className="grid grid-cols-3 gap-4">
                                      <div className="bg-white rounded p-3 text-center">
                                        <div className="text-xs text-gray-600 mb-1">V-Die Size {specs.isManualVDie && '(Manual)'}</div>
                                        <div className={`text-2xl font-bold ${specs.isManualVDie ? 'text-yellow-700' : 'text-blue-700'}`}>
                                          {specs.vDie} mm
                                        </div>
                                      </div>
                                      <div className="bg-white rounded p-3 text-center">
                                        <div className="text-xs text-gray-600 mb-1">Min Flange</div>
                                        <div className="text-2xl font-bold text-green-700">{specs.minFlange} mm</div>
                                      </div>
                                      <div className="bg-white rounded p-3 text-center">
                                        <div className="text-xs text-gray-600 mb-1">Tonnage</div>
                                        <div className="text-2xl font-bold text-orange-700">{specs.tonnage} T</div>
                                      </div>
                                    </div>
                                    <p className="text-xs text-gray-600 mt-2">
                                      Based on {process.material_type}, {process.thickness}mm thickness, {specs.bendLength}mm bend length
                                      {specs.isManualVDie && <span className="text-yellow-700 font-semibold"> (Using manual V-Die override)</span>}
                                    </p>
                                  </div>
                                );
                              })()}
                              
                              {/* Optional Adjustments */}
                              <div className="bg-white border border-amber-200 rounded p-3">
                                <Label className="block mb-2 font-semibold">Optional Adjustments (Markups)</Label>
                                <div className="grid grid-cols-2 gap-2">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={process.adjust_stainless || false}
                                      onChange={(e) => handleProcessChange(process.id, 'adjust_stainless', e.target.checked)}
                                      className="w-4 h-4"
                                    />
                                    <span className="text-sm">Stainless Steel (+15%)</span>
                                  </label>
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={process.adjust_complex || false}
                                      onChange={(e) => handleProcessChange(process.id, 'adjust_complex', e.target.checked)}
                                      className="w-4 h-4"
                                    />
                                    <span className="text-sm">Complex Bends (+10%)</span>
                                  </label>
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={process.adjust_multi_setup || false}
                                      onChange={(e) => handleProcessChange(process.id, 'adjust_multi_setup', e.target.checked)}
                                      className="w-4 h-4"
                                    />
                                    <span className="text-sm">Multiple Setups (+15%)</span>
                                  </label>
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={process.adjust_tight_tolerance || false}
                                      onChange={(e) => handleProcessChange(process.id, 'adjust_tight_tolerance', e.target.checked)}
                                      className="w-4 h-4"
                                    />
                                    <span className="text-sm">Tight Tolerance (+10%)</span>
                                  </label>
                                </div>
                                {(process.adjust_stainless || process.adjust_complex || process.adjust_multi_setup || process.adjust_tight_tolerance) && (
                                  <div className="mt-2 text-xs text-amber-700 font-semibold">
                                    Total Adjustment: +{calculateProcessCost(process).adjustmentPercent || 0}%
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          <div className="bg-green-50 border border-green-200 rounded p-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-medium">Total Process Cost:</span>
                              <span className="text-lg font-bold text-green-700">{formatCurrency(calculateProcessCost(process).totalCost)}</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="bg-orange-50 border border-orange-200 rounded p-3 mb-3">
                            <p className="text-sm text-orange-800 font-medium">Outsource Process (Powder Coating, Plating, Etching, etc.)</p>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <Label>Price per Part ($)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={process.price_per_part}
                                onChange={(e) => handleProcessChange(process.id, 'price_per_part', parseFloat(e.target.value) || 0)}
                                placeholder="Fixed price per part"
                              />
                            </div>
                            <div>
                              <Label>Transport Cost (To) ($)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={process.transport_cost_to}
                                onChange={(e) => handleProcessChange(process.id, 'transport_cost_to', parseFloat(e.target.value) || 0)}
                                placeholder="Cost to send parts"
                              />
                            </div>
                            <div>
                              <Label>Transport Cost (Return) ($)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={process.transport_cost_return}
                                onChange={(e) => handleProcessChange(process.id, 'transport_cost_return', parseFloat(e.target.value) || 0)}
                                placeholder="Cost to return parts"
                              />
                            </div>
                          </div>
                          
                          <div className="bg-blue-50 border border-blue-200 rounded p-3">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="flex justify-between">
                                <span>Parts Cost:</span>
                                <span className="font-medium">{formData.quantity_required} × {formatCurrency(process.price_per_part || 0)} = {formatCurrency((process.price_per_part || 0) * formData.quantity_required)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Total Transport:</span>
                                <span className="font-medium">{formatCurrency((process.transport_cost_to || 0) + (process.transport_cost_return || 0))}</span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="bg-green-50 border border-green-200 rounded p-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-medium">Total Outsource Cost:</span>
                              <span className="text-lg font-bold text-green-700">{formatCurrency(calculateProcessCost(process).totalCost)}</span>
                            </div>
                          </div>
                        </div>
                      )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* QUANTITY BREAKS */}
            <Card>
              <CardHeader className="bg-indigo-50 flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Quantity Breaks (Optional)</CardTitle>
                <Button size="sm" onClick={addQuantityBreak}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Qty Break
                </Button>
              </CardHeader>
              <CardContent className="pt-6">
                {formData.quantity_breaks.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No quantity breaks added. Click &quot;Add Qty Break&quot; to create pricing tiers.</p>
                ) : (
                  <div className="space-y-3">
                    {formData.quantity_breaks.map((qtyBreak) => {
                      const pricing = calculateQuantityBreakPricing(qtyBreak.quantity);
                      const isRounded = formData.enable_rounding && pricing.originalTotal !== pricing.totalExGST;
                      return (
                        <div key={qtyBreak.id} className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                          <div className="flex items-center gap-4">
                            <div className="flex-1 grid grid-cols-3 gap-4">
                              <div>
                                <Label>Quantity</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  value={qtyBreak.quantity}
                                  onChange={(e) => handleQuantityBreakChange(qtyBreak.id, 'quantity', parseInt(e.target.value) || 0)}
                                  placeholder="e.g., 50"
                                />
                              </div>
                              <div>
                                <Label>Price per Part (Ex GST){isRounded && <span className="text-xs ml-1 text-indigo-600">(Rounded)</span>}</Label>
                                <Input
                                  value={formatCurrency(pricing.pricePerPartExGST)}
                                  readOnly
                                  className="bg-white font-semibold"
                                />
                                {isRounded && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    Original: {formatCurrency(pricing.originalTotal / qtyBreak.quantity)}
                                  </p>
                                )}
                              </div>
                              <div>
                                <Label>Total (Ex GST){isRounded && <span className="text-xs ml-1 text-indigo-600">(Rounded)</span>}</Label>
                                <Input
                                  value={formatCurrency(pricing.totalExGST)}
                                  readOnly
                                  className="bg-white font-semibold"
                                />
                                {isRounded && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    Original: {formatCurrency(pricing.originalTotal)}
                                  </p>
                                )}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeQuantityBreak(qtyBreak.id)}
                              className="mt-6"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {formData.quantity_breaks.length > 0 && (
                  <div className="mt-4 bg-blue-50 border border-blue-200 rounded p-3">
                    <p className="text-sm text-blue-800">
                      <strong>Tip:</strong> Quantity breaks automatically calculate pricing based on your material, nesting, and process costs. Larger quantities typically have lower per-part costs due to setup cost distribution.
                      {formData.enable_rounding && (
                        <span className="block mt-1">
                          <strong>Rounding Active:</strong> Prices are being rounded {formData.rounding_direction} to nearest ${formData.rounding_to}.
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* QUALITY ASSURANCE (Q.A.) INSPECTION SECTION */}
            <Card className="border-teal-300">
              <CardHeader className="bg-teal-50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <span>🔬</span> Quality Assurance (Q.A.)
                  </CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newItem = {
                        id: `qa-${Date.now()}`,
                        type: 'dimension',
                        description: '',
                        nominal_value: 0,
                        tolerance: '±0.5',
                        unit: 'mm'
                      };
                      setFormData({
                        ...formData,
                        qa_inspection_items: [...formData.qa_inspection_items, newItem]
                      });
                    }}
                    className="border-teal-400 text-teal-700 hover:bg-teal-100"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Add Dimension / Angle
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {formData.qa_inspection_items.length === 0 ? (
                  <div className="text-center py-6 text-gray-500">
                    <p className="text-sm">No inspection items defined.</p>
                    <p className="text-xs mt-1">Add dimensions and angles that require inspection during production.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-teal-800 pb-2 border-b border-teal-200">
                      <div className="col-span-2">Type</div>
                      <div className="col-span-3">Check Item</div>
                      <div className="col-span-1">Nominal</div>
                      <div className="col-span-1">Tolerance</div>
                      <div className="col-span-2 text-center">Minimum</div>
                      <div className="col-span-2 text-center">Maximum</div>
                      <div className="col-span-1"></div>
                    </div>
                    {formData.qa_inspection_items.map((item, index) => {
                      // Parse tolerance to numeric portion (handles "±0.5", "1", "0.5°", "+/-1", "0.2 mm")
                      const tolStr = String(item.tolerance ?? '');
                      const tolMatch = tolStr.match(/[-+]?\d*\.?\d+/);
                      const tolNum = tolMatch ? parseFloat(tolMatch[0]) : 0;
                      const nominal = parseFloat(item.nominal_value) || 0;
                      const minVal = nominal - Math.abs(tolNum);
                      const maxVal = nominal + Math.abs(tolNum);
                      const unit = item.type === 'angle' ? '°' : 'mm';
                      const fmt = (n) => Number.isFinite(n) ? (Number.isInteger(n) ? n : Number(n.toFixed(3))) : '—';
                      return (
                      <div key={item.id} className="grid grid-cols-12 gap-2 items-center bg-teal-50 p-2 rounded">
                        <div className="col-span-2">
                          <select
                            value={item.type}
                            onChange={(e) => {
                              const updated = [...formData.qa_inspection_items];
                              updated[index] = {
                                ...updated[index],
                                type: e.target.value,
                                unit: e.target.value === 'angle' ? '°' : 'mm'
                              };
                              setFormData({...formData, qa_inspection_items: updated});
                            }}
                            className="w-full text-sm border rounded px-2 py-1"
                          >
                            <option value="dimension">Dimension</option>
                            <option value="angle">Angle</option>
                          </select>
                        </div>
                        <div className="col-span-3">
                          <Input
                            type="text"
                            value={item.description}
                            onChange={(e) => {
                              const updated = [...formData.qa_inspection_items];
                              updated[index] = {...updated[index], description: e.target.value};
                              setFormData({...formData, qa_inspection_items: updated});
                            }}
                            placeholder={item.type === 'angle' ? 'e.g., Fold Angle' : 'e.g., Overall Length'}
                            className="text-sm"
                          />
                        </div>
                        <div className="col-span-1">
                          <Input
                            type="number"
                            step="0.01"
                            value={item.nominal_value}
                            onChange={(e) => {
                              const updated = [...formData.qa_inspection_items];
                              updated[index] = {...updated[index], nominal_value: parseFloat(e.target.value) || 0};
                              setFormData({...formData, qa_inspection_items: updated});
                            }}
                            placeholder={item.type === 'angle' ? '90' : '150'}
                            className="text-sm"
                          />
                        </div>
                        <div className="col-span-1">
                          <Input
                            type="text"
                            value={item.tolerance}
                            onChange={(e) => {
                              const updated = [...formData.qa_inspection_items];
                              updated[index] = {...updated[index], tolerance: e.target.value};
                              setFormData({...formData, qa_inspection_items: updated});
                            }}
                            placeholder="±0.5"
                            className="text-sm"
                          />
                        </div>
                        <div className="col-span-2 text-center">
                          <span className="inline-block bg-white border border-teal-300 rounded px-2 py-1 text-sm font-mono font-semibold text-slate-700 min-w-[3rem]">
                            {fmt(minVal)}{unit}
                          </span>
                        </div>
                        <div className="col-span-2 text-center">
                          <span className="inline-block bg-white border border-teal-300 rounded px-2 py-1 text-sm font-mono font-semibold text-slate-700 min-w-[3rem]">
                            {fmt(maxVal)}{unit}
                          </span>
                        </div>
                        <div className="col-span-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setFormData({
                                ...formData,
                                qa_inspection_items: formData.qa_inspection_items.filter(i => i.id !== item.id)
                              });
                            }}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
                {formData.qa_inspection_items.length > 0 && (
                  <div className="mt-4 bg-teal-100 border border-teal-300 rounded p-3">
                    <p className="text-sm text-teal-800">
                      <strong>ℹ️ Note:</strong> These inspection items will automatically appear on the Dimensional Inspection Checklist (Page 2) when a Job Sheet is generated. The operator will record actual measurements at each inspection interval.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* QUOTE NOTES */}
            <Card>
              <CardHeader className="bg-amber-50">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Quote Notes
                </CardTitle>
                <p className="text-xs text-slate-600 mt-1">
                  These notes will be printed on the Quote print-out and PDF download.
                </p>
              </CardHeader>
              <CardContent className="pt-4">
                <Label htmlFor="quote-notes-input">Notes / Special Instructions</Label>
                <Textarea
                  id="quote-notes-input"
                  data-testid="quote-notes-textarea"
                  value={formData.quote_notes || ''}
                  onChange={(e) => handleInputChange('quote_notes', e.target.value)}
                  placeholder="e.g. Lead time 3-4 weeks. Prices subject to material availability. Freight included Melbourne metro..."
                  rows={4}
                  className="mt-2 font-mono text-sm"
                />
                <p className="text-xs text-slate-500 mt-2">
                  Line breaks are preserved on the print-out.
                </p>
              </CardContent>
            </Card>

            {/* SUMMARY */}
            <Card>
              <CardHeader className="bg-purple-50">
                <CardTitle className="text-lg">Quote Summary (Quantity: {formData.quantity_required})</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  {/* Material Costs */}
                  <div className={`rounded p-3 space-y-1 ${formData.customer_supplied_material ? 'bg-amber-50 border border-amber-300' : 'bg-blue-50'}`}>
                    <h4 className={`font-semibold mb-2 ${formData.customer_supplied_material ? 'text-amber-900' : 'text-blue-900'}`}>
                      Material Costs {formData.customer_supplied_material && '(Customer Supplied - $0)'}
                    </h4>
                    {formData.customer_supplied_material ? (
                      <div className="text-sm text-amber-700">
                        ✓ Customer is supplying material - No material cost charged
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between text-sm">
                          <span>Parts per Sheet:</span>
                          <span className="font-medium">{calculateNesting().partsPerSheet}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Selling Price per Sheet:</span>
                          <span className="font-medium">{formatCurrency(formData.selling_price_per_sheet)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Material Cost per Part:</span>
                          <span className="font-medium">{formatCurrency(calculateMaterialCostPerPart())}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Quantity Required:</span>
                          <span className="font-medium">{formData.quantity_required}</span>
                        </div>
                        <div className="flex justify-between border-t border-blue-200 pt-2 mt-2">
                          <span className="font-semibold">Total Material Cost:</span>
                          <span className="font-bold text-blue-700">{formatCurrency(calculateTotalMaterialCost())}</span>
                        </div>
                      </>
                    )}
                  </div>
                  
                  {/* Process Costs */}
                  {formData.processes.map(p => {
                    const costs = calculateProcessCost(p);
                    return (
                      <div key={p.id} className={`rounded p-3 space-y-1 ${p.type === 'outsource' ? 'bg-orange-50' : 'bg-yellow-50'}`}>
                        <h4 className={`font-semibold mb-2 ${p.type === 'outsource' ? 'text-orange-900' : 'text-yellow-900'}`}>
                          {p.name} {p.type === 'outsource' && <span className="text-xs">(Outsourced)</span>}
                        </h4>
                        {p.type === 'in-house' ? (
                          <>
                            {/* Setup cost is now absorbed into cost per part, don't show if it's 0 */}
                            {costs.setupCost > 0 && (
                              <div className="flex justify-between text-sm">
                                <span>Setup Cost (One-time):</span>
                                <span className="font-medium">{formatCurrency(costs.setupCost)}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-sm">
                              <span>Cost per Part:</span>
                              <span className="font-medium">{formatCurrency(costs.costPerPart)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span>Quantity:</span>
                              <span className="font-medium">{formData.quantity_required}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex justify-between text-sm">
                              <span>Price per Part:</span>
                              <span className="font-medium">{formatCurrency(costs.costPerPart)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span>Transport (To + Return):</span>
                              <span className="font-medium">{formatCurrency(costs.setupCost)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span>Quantity:</span>
                              <span className="font-medium">{formData.quantity_required}</span>
                            </div>
                          </>
                        )}
                        <div className={`flex justify-between border-t pt-2 mt-2 ${p.type === 'outsource' ? 'border-orange-200' : 'border-yellow-200'}`}>
                          <span className="font-semibold">Total {p.name} Cost:</span>
                          <span className={`font-bold ${p.type === 'outsource' ? 'text-orange-700' : 'text-yellow-700'}`}>{formatCurrency(costs.totalCost)}</span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Process Price Summary (internal — estimator only, customer quote shows one combined price) */}
                  {formData.processes.length > 0 && (
                    <div className="bg-slate-100 rounded p-3 border border-slate-300" data-testid="process-price-summary">
                      <h4 className="font-semibold text-slate-800 mb-2">Process Price Summary <span className="text-xs font-normal text-slate-500">(internal — combined on customer quote)</span></h4>
                      {formData.processes.map(p => (
                        <div key={p.id} className="flex justify-between text-sm">
                          <span>{p.name}{p.type === 'outsource' ? ' (Outsourced)' : ''}</span>
                          <span className="font-medium">{formatCurrency(calculateProcessCost(p).totalCost)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between border-t border-slate-300 pt-2 mt-2">
                        <span className="font-semibold">Combined Process Total:</span>
                        <span className="font-bold text-slate-900" data-testid="combined-process-total">
                          {formatCurrency(formData.processes.reduce((sum, p) => sum + calculateProcessCost(p).totalCost, 0))}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {/* Price per Part */}
                  <div className="bg-green-50 rounded p-3 border-2 border-green-300">
                    {(() => {
                      const liveTotal = calculateTotalMaterialCost() + formData.processes.reduce((sum, p) => sum + calculateProcessCost(p).totalCost, 0);
                      const qty = formData.quantity_required || 1;
                      const livePricePerPart = liveTotal / qty;
                      
                      // Check if editing with saved rounding values
                      const isEditingWithSavedRounding = editingQuote && formData.enable_rounding && formData.saved_price_per_part > 0;
                      
                      let displayPricePerPart, originalPricePerPart;
                      let showRoundingIndicator = false;
                      
                      if (isEditingWithSavedRounding) {
                        // Use saved values when editing
                        displayPricePerPart = formData.saved_price_per_part;
                        originalPricePerPart = formData.saved_original_total ? formData.saved_original_total / qty : livePricePerPart;
                        showRoundingIndicator = displayPricePerPart !== originalPricePerPart;
                      } else if (formData.enable_rounding) {
                        originalPricePerPart = livePricePerPart;
                        if (formData.rounding_target === 'unit') {
                          // Round the unit price directly
                          displayPricePerPart = calculateRoundedPrice(livePricePerPart, true);
                          showRoundingIndicator = displayPricePerPart !== livePricePerPart;
                        } else {
                          // Round the total, then derive unit price
                          const roundedTotal = calculateRoundedPrice(liveTotal, false);
                          displayPricePerPart = roundedTotal / qty;
                          showRoundingIndicator = roundedTotal !== liveTotal;
                        }
                      } else {
                        // No rounding, use live values
                        displayPricePerPart = livePricePerPart;
                        originalPricePerPart = livePricePerPart;
                      }
                      
                      return (
                        <>
                          {showRoundingIndicator && (
                            <div className="flex justify-between items-center text-sm text-green-700 mb-2 pb-2 border-b border-green-300">
                              <span>Original Price per Part:</span>
                              <span className="line-through">{formatCurrency(originalPricePerPart)}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-green-900 text-lg">
                              PRICE PER PART:{showRoundingIndicator && <span className="text-sm ml-2">(Rounded)</span>}
                            </span>
                            <span className="font-bold text-green-700 text-2xl">
                              {formatCurrency(displayPricePerPart)}
                            </span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  
                  {/* Price Rounding Section */}
                  <Card className="bg-blue-50 border-2 border-blue-300">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Price Rounding & Adjustment</CardTitle>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.enable_rounding}
                            onChange={(e) => setFormData({...formData, enable_rounding: e.target.checked, saved_quote_total: 0, saved_price_per_part: 0, saved_original_total: 0})}
                            className="w-4 h-4"
                          />
                          <span className="text-sm">Enable</span>
                        </label>
                      </div>
                    </CardHeader>
                    {formData.enable_rounding && (
                      <CardContent className="space-y-3 pt-0">
                        {/* Rounding Target Selection */}
                        <div className="bg-yellow-50 border border-yellow-300 rounded p-3">
                          <Label className="text-xs font-semibold text-yellow-900 mb-2 block">What to Round?</Label>
                          <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="rounding_target"
                                value="unit"
                                checked={formData.rounding_target === 'unit'}
                                onChange={(e) => setFormData({...formData, rounding_target: e.target.value, saved_quote_total: 0, saved_price_per_part: 0, saved_original_total: 0})}
                                className="w-4 h-4"
                              />
                              <span className="text-sm font-medium">Unit Price (per part) - Recommended</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="rounding_target"
                                value="total"
                                checked={formData.rounding_target === 'total'}
                                onChange={(e) => setFormData({...formData, rounding_target: e.target.value, saved_quote_total: 0, saved_price_per_part: 0, saved_original_total: 0})}
                                className="w-4 h-4"
                              />
                              <span className="text-sm font-medium">Overall Total</span>
                            </label>
                          </div>
                          <p className="text-xs text-yellow-800 mt-2">
                            💡 <strong>Unit Price:</strong> Consistent price per part regardless of quantity (best for quantity breaks)<br/>
                            <strong>Overall Total:</strong> Rounds the total price (per-part price varies with quantity)
                          </p>
                        </div>
                        
                        {/* Option 1: Automatic Rounding */}
                        <div className="bg-white rounded p-3 border border-blue-200">
                          <Label className="text-xs font-semibold text-blue-900 mb-2 block">Option 1: Automatic Rounding</Label>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs">Round To</Label>
                              <select
                                className="w-full p-2 border rounded text-sm"
                                value={formData.rounding_to}
                                onChange={(e) => setFormData({...formData, rounding_to: parseFloat(e.target.value)})}
                              >
                                <option value="0">None (Manual Only)</option>
                                <option value="0.05">Nearest $0.05</option>
                                <option value="0.10">Nearest $0.10</option>
                                <option value="1">Nearest $1</option>
                                <option value="5">Nearest $5</option>
                                <option value="10">Nearest $10</option>
                                <option value="50">Nearest $50</option>
                                <option value="100">Nearest $100</option>
                              </select>
                            </div>
                            <div>
                              <Label className="text-xs">Direction</Label>
                              <select
                                className="w-full p-2 border rounded text-sm"
                                value={formData.rounding_direction}
                                onChange={(e) => setFormData({...formData, rounding_direction: e.target.value})}
                                disabled={formData.rounding_to === 0}
                              >
                                <option value="nearest">Nearest</option>
                                <option value="up">Round Up</option>
                                <option value="down">Round Down</option>
                              </select>
                            </div>
                          </div>
                        </div>
                        
                        {/* Option 2: Manual Adjustment */}
                        <div className="bg-white rounded p-3 border border-green-200">
                          <Label className="text-xs font-semibold text-green-900 mb-2 block">Option 2: Manual Fine-Tuning</Label>
                          <div>
                            <Label className="text-xs">Add or Subtract Amount</Label>
                            <Input
                              type="text"
                              value={formData.manual_adjustment}
                              onChange={(e) => {
                                const value = e.target.value;
                                // Allow empty string, minus sign, decimals, and valid numbers
                                if (value === '' || value === '-' || value === '.' || value === '-.' || /^-?\d*\.?\d*$/.test(value)) {
                                  setFormData({...formData, manual_adjustment: value});
                                }
                              }}
                              onBlur={(e) => {
                                // Convert to number on blur for calculations
                                const value = e.target.value;
                                const numValue = value === '' || value === '-' || value === '.' || value === '-.' ? 0 : parseFloat(value);
                                setFormData({...formData, manual_adjustment: isNaN(numValue) ? 0 : numValue});
                              }}
                              placeholder="e.g., 0.04 or -0.01"
                              className="text-sm"
                            />
                            <p className="text-xs text-gray-600 mt-1">
                              Tip: Use positive numbers to round UP (e.g., 0.04) or negative numbers to round DOWN (e.g., -0.05)
                            </p>
                            <div className="mt-2 text-xs text-green-800 bg-green-50 p-2 rounded">
                              <strong>Examples:</strong>
                              <div className="mt-1 space-y-1">
                                <div>• $29.81 + 0.04 = <strong>$29.85</strong> (round up)</div>
                                <div>• $29.81 + 0.19 = <strong>$30.00</strong> (round up)</div>
                                <div>• $30.05 - 0.05 = <strong>$30.00</strong> (round down)</div>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="bg-blue-100 rounded p-2 text-xs text-blue-900">
                          <strong>💡 Tip:</strong> You can combine both! Auto-round to $10, then fine-tune with +/- adjustment.
                        </div>
                      </CardContent>
                    )}
                  </Card>
                  
                  {/* Total Quote */}
                  <div className="bg-purple-100 rounded p-4 border-2 border-purple-400">
                    {(() => {
                      // Calculate the live total from current form data
                      const liveTotal = calculateTotalMaterialCost() + formData.processes.reduce((sum, p) => sum + calculateProcessCost(p).totalCost, 0);
                      
                      // Determine which total to use as the base
                      // If editing with rounding enabled and we have saved values, use those
                      // Otherwise use live calculation
                      const isEditingWithSavedRounding = editingQuote && formData.enable_rounding && formData.saved_quote_total > 0;
                      
                      let displayTotal, originalTotal;
                      
                      if (isEditingWithSavedRounding) {
                        // Use saved values when editing a quote with saved rounding
                        displayTotal = formData.saved_quote_total;
                        originalTotal = formData.saved_original_total || liveTotal;
                      } else {
                        // Use live calculation with rounding
                        originalTotal = liveTotal;
                        displayTotal = calculateRoundedPrice(liveTotal);
                      }
                      
                      const showRounding = formData.enable_rounding && originalTotal !== displayTotal;
                      
                      return (
                        <>
                          {showRounding && (
                            <div className="flex justify-between items-center text-sm text-purple-700 mb-2 pb-2 border-b border-purple-300">
                              <span>Original Total:</span>
                              <span className="line-through">{formatCurrency(originalTotal)}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-purple-900 text-xl">
                              TOTAL QUOTE:{showRounding && <span className="text-sm ml-2">(Rounded)</span>}
                            </span>
                            <span className="font-bold text-purple-700 text-3xl">
                              {formatCurrency(displayTotal)}
                            </span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Line Items Section - Display completed line items */}
          {lineItems.length > 0 && (
            <Card className="mt-6">
              <CardHeader className="bg-green-50">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Line Items ({lineItems.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-3">
                  {lineItems.map((item, index) => (
                    <div key={item.id} className="border rounded-lg overflow-hidden">
                      {/* Collapsed View */}
                      <div 
                        className="bg-slate-50 p-3 flex justify-between items-center cursor-pointer hover:bg-slate-100"
                        onClick={() => toggleLineItemExpanded(item.id)}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-slate-700">Line #{index + 1}</span>
                            <span className="text-sm">{item.part_description}</span>
                          </div>
                          <div className="text-xs text-slate-600 mt-1 flex gap-4">
                            <span>Qty: {item.quantity}</span>
                            <span>{item.material_type} {item.thickness}</span>
                            <span className="font-semibold text-green-700">{formatCurrency(item.total)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditLineItem(index);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteLineItem(index);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                          {expandedLineItems[item.id] ? (
                            <ChevronUp className="h-5 w-5 text-slate-400" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-slate-400" />
                          )}
                        </div>
                      </div>
                      
                      {/* Expanded View */}
                      {expandedLineItems[item.id] && (
                        <div className="p-4 bg-white border-t space-y-3">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="font-semibold">Part Description:</span>
                              <p className="text-slate-600">{item.part_description}</p>
                            </div>
                            <div>
                              <span className="font-semibold">Quantity:</span>
                              <p className="text-slate-600">{item.quantity}</p>
                            </div>
                            <div>
                              <span className="font-semibold">Material:</span>
                              <p className="text-slate-600">
                                {item.material_type} - {item.thickness} - {item.grade} - {item.finish}
                              </p>
                            </div>
                            <div>
                              <span className="font-semibold">Sheet Size:</span>
                              <p className="text-slate-600">{item.sheet_width}mm x {item.sheet_length}mm</p>
                            </div>
                            {item.drawing_filename && (
                              <div className="col-span-2">
                                <span className="font-semibold">Drawing:</span>
                                <p className="text-slate-600 flex items-center gap-2">
                                  <FileText className="h-4 w-4" />
                                  {item.drawing_filename}
                                </p>
                              </div>
                            )}
                          </div>
                          
                          <div className="border-t pt-3">
                            <div className="font-semibold mb-2">Processes:</div>
                            {item.processes && item.processes.length > 0 ? (
                              <div className="space-y-2">
                                {item.processes.map((p, pIndex) => (
                                  <div key={pIndex} className="text-sm bg-slate-50 p-2 rounded">
                                    <span className="font-medium">{p.name}</span>
                                    <span className="ml-2 text-slate-600">
                                      ({p.type === 'in-house' ? 'In-house' : 'Outsourced'})
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-slate-500">No processes added</p>
                            )}
                          </div>
                          
                          <div className="border-t pt-3 bg-green-50 rounded p-3">
                            <div className="flex justify-between items-center">
                              <span className="font-semibold">Line Item Total:</span>
                              <span className="text-lg font-bold text-green-700">
                                {formatCurrency(item.total)}
                              </span>
                            </div>
                            <div className="text-xs text-slate-600 mt-1">
                              Price per part: {formatCurrency(item.price_per_part)} (inc GST)
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                
                {/* Quote Level Total */}
                <div className="mt-4 p-4 bg-purple-50 rounded-lg border-2 border-purple-300">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-purple-900 text-lg">TOTAL QUOTE VALUE:</span>
                    <span className="font-bold text-purple-700 text-2xl">
                      {formatCurrency(lineItems.reduce((sum, item) => sum + item.total, 0))}
                    </span>
                  </div>
                  <p className="text-xs text-purple-700 mt-1">Sum of {lineItems.length} line items</p>
                </div>
              </CardContent>
            </Card>
          )}
          
          <div className="flex justify-between gap-2 mt-6">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => {
                setCreateDialogOpen(false);
                setEditingQuote(null);
                setFormData(initialFormData);
                setLineItems([]);
                setExpandedLineItems({});
                setActiveLineItem(null);
              }}>
                Cancel
              </Button>
            </div>
            <div className="flex gap-2">
              {/* Show "Save / Add Line Item" button when form has data and either creating OR editing a multi-item quote */}
              {formData.part_description && formData.quantity_required && (
                (!editingQuote || editingQuote.is_multi_item || lineItems.length > 0) && (
                  <Button 
                    onClick={handleAddLineItem}
                    className="bg-blue-600 hover:bg-blue-700"
                    data-testid="add-line-item-btn"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {editingQuote && (editingQuote.is_multi_item || lineItems.length > 0)
                      ? 'Save Line Item'
                      : 'Add Another Item'}
                  </Button>
                )
              )}
              <Button onClick={editingQuote ? handleUpdateQuote : handleCreateQuote} className="bg-slate-900 hover:bg-slate-800">
                {editingQuote ? 'Update Quote' : (lineItems.length > 0 ? 'Create Multi-Item Quote' : 'Create Quote')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Quote Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Quote #{selectedQuote?.quote_number}</DialogTitle>
          </DialogHeader>
          {selectedQuote && (
            <div className="space-y-4">
              {/* Customer Info */}
              <div className="grid grid-cols-2 gap-4 border-b pb-4">
                <div><strong>Drawing Number:</strong> {selectedQuote.drawing_number || 'N/A'}</div>
                <div><strong>Customer:</strong> {selectedQuote.customer_name}</div>
                <div><strong>Contact:</strong> {selectedQuote.contact_person || 'N/A'}</div>
                <div><strong>Date:</strong> {formatDate(selectedQuote.quote_date)}</div>
              </div>
              
              {/* Check if Multi-Item Quote */}
              {selectedQuote.is_multi_item && selectedQuote.line_items && selectedQuote.line_items.length > 0 ? (
                // MULTI-ITEM QUOTE VIEW - TABLE FORMAT (M1 ERP Style)
                <div className="space-y-4">
                  <div className="bg-blue-50 p-3 rounded border border-blue-200">
                    <div className="flex items-center gap-2">
                      <Package className="h-5 w-5 text-blue-600" />
                      <h3 className="font-semibold text-blue-900">Multi-Item Quote - {selectedQuote.line_items.length} Line Items</h3>
                    </div>
                  </div>
                  
                  {/* Line Items Table */}
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100 border-b">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Item Ref No.</th>
                          <th className="px-3 py-2 text-left font-semibold">Part Description</th>
                          <th className="px-3 py-2 text-left font-semibold">Material</th>
                          <th className="px-3 py-2 text-left font-semibold">Thick</th>
                          <th className="px-3 py-2 text-left font-semibold">Grade</th>
                          <th className="px-3 py-2 text-left font-semibold">Finish</th>
                          <th className="px-3 py-2 text-right font-semibold">Qty</th>
                          <th className="px-3 py-2 text-right font-semibold">
                            Price
                            <br />
                            (ex GST)
                          </th>
                          <th className="px-3 py-2 text-right font-semibold">
                            Total
                            <br />
                            (incl. GST)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedQuote.line_items.map((item, index) => {
                          const priceExGST = (item.total || item.line_total_with_gst || 0) / 1.10;
                          const pricePerPartExGST = priceExGST / (item.quantity || 1);
                          return (
                            <tr key={index} className="border-b hover:bg-slate-50">
                              <td className="px-3 py-3 align-top">{item.line_number || index + 1}</td>
                              <td className="px-3 py-3 align-top">
                                <div className="font-medium">{item.part_description}</div>
                                {item.processes && item.processes.length > 0 && (
                                  <div className="text-xs text-gray-600 mt-1">
                                    Processes: {item.processes.map(p => p.name).join(', ')}
                                  </div>
                                )}
                                {item.drawing_filename && (
                                  <div className="text-xs mt-1 flex items-center gap-2">
                                    <span className="text-blue-600">📎 {item.drawing_filename}</span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleDownloadLineItemDrawing(item)}
                                      className="h-6 px-2 text-xs"
                                    >
                                      <Download className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-3 align-top">{item.material_type}</td>
                              <td className="px-3 py-3 align-top">{item.thickness}</td>
                              <td className="px-3 py-3 align-top">{item.grade}</td>
                              <td className="px-3 py-3 align-top">{item.finish}</td>
                              <td className="px-3 py-3 text-right align-top">{item.quantity}</td>
                              <td className="px-3 py-3 text-right align-top">{formatCurrency(pricePerPartExGST)}</td>
                              <td className="px-3 py-3 text-right align-top font-semibold">{formatCurrency(item.total || item.line_total_with_gst || 0)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-100 font-bold">
                        <tr>
                          <td colSpan={8} className="px-3 py-3 text-right">TOTAL PRICE (incl. GST):</td>
                          <td className="px-3 py-3 text-right text-lg">{formatCurrency(selectedQuote.quote_total || 0)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  
                  {/* Additional Info */}
                  <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                    <p><strong>Note:</strong> This quotation includes {selectedQuote.line_items.length} separate line items as detailed above.</p>
                  </div>
                </div>
              ) : (
                // SINGLE-ITEM QUOTE VIEW (Original)
                <div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><strong>Part:</strong> {selectedQuote.part_description}</div>
                    <div><strong>Quantity:</strong> {selectedQuote.quantity_required}</div>
                    <div className="col-span-2"><strong>Material:</strong> {getDerivedMaterial(selectedQuote)}</div>
                    {selectedQuote.drawing_filename && (
                      <div className="col-span-2">
                        <strong>Drawing File:</strong> 
                        <span className="ml-2 text-blue-600">{selectedQuote.drawing_filename}</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Processes Details */}
                  {selectedQuote.processes && selectedQuote.processes.length > 0 && (
                    <div className="border-t pt-4">
                      <h3 className="font-semibold mb-2">Process Details</h3>
                      <div className="space-y-3">
                        {selectedQuote.processes.map((p, idx) => (
                          <div key={idx} className="bg-gray-50 p-3 rounded text-sm">
                            <div className="flex justify-between items-start mb-1">
                              <div className="font-medium">{p.name} {p.type === 'outsource' ? '(Outsourced)' : '(In-House)'}</div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenJobSheetDialog(selectedQuote, p)}
                                className="text-xs"
                              >
                                Generate Job Sheet
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                              {p.setup_time > 0 && (
                                <div>Setup: {p.setup_time} {p.setup_time_unit || 'min'}</div>
                              )}
                              {p.time_per_part > 0 && (
                                <div>Time per Part: {p.time_per_part} {p.time_unit || 'min'}</div>
                              )}
                              {p.hourly_rate > 0 && (
                                <div>Hourly Rate: ${p.hourly_rate}/hr</div>
                              )}
                              {p.setup_cost > 0 && (
                                <div>Setup Cost: {formatCurrency(p.setup_cost)}</div>
                              )}
                              {p.cost_per_part > 0 && (
                                <div>Cost per Part: {formatCurrency(p.cost_per_part)}</div>
                              )}
                              {p.total_cost > 0 && (
                                <div className="font-medium">Total: {formatCurrency(p.total_cost)}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Cost Breakdown */}
                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-2">Cost Breakdown</h3>
                    <div className="space-y-1 text-sm">
                      {selectedQuote.total_material_cost > 0 && (
                        <div className="flex justify-between">
                          <span>Material Cost</span>
                          <span>{formatCurrency(selectedQuote.total_material_cost)}</span>
                        </div>
                      )}
                      {(selectedQuote.processes || []).map((p, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>{p.name} {p.type === 'outsource' ? '(Outsourced)' : ''}</span>
                          <span>{formatCurrency(p.total_cost || 0)}</span>
                        </div>
                      ))}
                      {(() => {
                        // Calculate correct totals from process costs
                        const processCosts = (selectedQuote.processes || []).reduce((sum, p) => sum + (p.total_cost || 0), 0);
                        const materialCost = selectedQuote.total_material_cost || 0;
                        const subtotalExGST = processCosts + materialCost;
                        const gstAmount = subtotalExGST * 0.10;
                        const totalInclGST = subtotalExGST + gstAmount;
                        
                        // Use saved price_per_part if available (includes rounding), otherwise calculate
                        const savedPricePerPart = selectedQuote.price_per_part;
                        const savedQuoteTotal = selectedQuote.quote_total;
                        
                        // If rounding was applied, use the saved values which already include rounding
                        let displayPricePerPartInclGST, displayTotal;
                        if (selectedQuote.enable_rounding && savedPricePerPart && savedQuoteTotal) {
                          displayPricePerPartInclGST = savedPricePerPart;
                          displayTotal = savedQuoteTotal;
                        } else {
                          displayPricePerPartInclGST = totalInclGST / (selectedQuote.quantity_required || 1);
                          displayTotal = totalInclGST;
                        }
                        
                        const pricePerPartExGST = subtotalExGST / (selectedQuote.quantity_required || 1);
                        
                        return (
                          <>
                            <div className="border-t pt-2 mt-2 flex justify-between font-semibold">
                              <span>Subtotal (Ex GST)</span>
                              <span>{formatCurrency(subtotalExGST)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>GST (10%)</span>
                              <span>{formatCurrency(gstAmount)}</span>
                            </div>
                            <div className="border-t pt-2 mt-2 flex justify-between font-bold text-lg">
                              <span>TOTAL (Incl. GST){selectedQuote.enable_rounding && ' (Rounded)'}</span>
                              <span>{formatCurrency(displayTotal)}</span>
                            </div>
                            <div className="flex justify-between text-gray-600">
                              <span>Price per Part (Ex GST)</span>
                              <span>{formatCurrency(pricePerPartExGST)}</span>
                            </div>
                            <div className="flex justify-between text-gray-600">
                              <span>Price per Part (Incl. GST){selectedQuote.enable_rounding && ' (Rounded)'}</span>
                              <span>{formatCurrency(displayPricePerPartInclGST)}</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
              {selectedQuote.quote_notes && selectedQuote.quote_notes.trim() && (
                <div className="border-t pt-4" data-testid="view-quote-notes">
                  <h3 className="font-semibold mb-2 text-amber-900">Notes</h3>
                  <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-slate-800 whitespace-pre-wrap font-mono">
                    {selectedQuote.quote_notes}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <div className="flex justify-between w-full">
              <div className="flex gap-2">
                {selectedQuote?.drawing_filename && !selectedQuote?.is_multi_item && (
                  <Button 
                    variant="outline" 
                    onClick={() => handleDownloadDrawing(selectedQuote)}
                  >
                    Download Drawing
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {selectedQuote?.is_multi_item && selectedQuote?.line_items && selectedQuote?.line_items.length > 0 && (
                  <Button 
                    variant="outline"
                    onClick={() => handleOpenMultiItemJobSheetDialog(selectedQuote)}
                    className="bg-purple-600 text-white hover:bg-purple-700"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Generate Job Sheets
                  </Button>
                )}
                <Button onClick={() => handlePrintQuote(selectedQuote)}>Print Quote</Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Quote Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Quote #{editingQuote?.quote_number}</DialogTitle>
            <DialogDescription>
              Update quote details. All costs will be recalculated.
            </DialogDescription>
          </DialogHeader>
          
          <div className="text-sm bg-blue-50 p-3 rounded mb-4">
            <strong>Drawing Number:</strong> {editingQuote?.drawing_number || 'N/A'}
          </div>
          
          {/* Note: In production, you'd extract this into a shared component */}
          {/* For now, just show key fields that can be edited */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="bg-slate-50">
                <CardTitle className="text-sm">Quick Edit - Key Fields</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Customer</Label>
                    <Input
                      value={formData.customer_name}
                      onChange={(e) => handleInputChange('customer_name', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Part Description</Label>
                    <Input
                      value={formData.part_description}
                      onChange={(e) => handleInputChange('part_description', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      value={formData.quantity_required}
                      onChange={(e) => handleInputChange('quantity_required', parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div>
                    <Label>Material Type</Label>
                    <Input
                      value={formData.material_type}
                      onChange={(e) => handleInputChange('material_type', e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded">
                  <p className="text-sm text-amber-800">
                    <strong>Note:</strong> Full edit with all sections (Material, Nesting, Processes) coming soon. 
                    For now, you can edit key fields. To make extensive changes, consider creating a new quote.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => {
              setEditDialogOpen(false);
              setFormData(initialFormData);
              setEditingQuote(null);
            }}>
              Cancel
            </Button>
            <Button onClick={handleUpdateQuote} className="bg-slate-900 hover:bg-slate-800">
              Update Quote
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Email Quote Dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Email Quote #{selectedQuote?.quote_number}</DialogTitle>
            <DialogDescription>
              Send quote to customer via email
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>To (Email Address) *</Label>
              <Input
                type="email"
                value={emailFormData.to}
                onChange={(e) => setEmailFormData({...emailFormData, to: e.target.value})}
                placeholder="customer@example.com"
              />
            </div>
            
            <div>
              <Label>Subject *</Label>
              <Input
                value={emailFormData.subject}
                onChange={(e) => setEmailFormData({...emailFormData, subject: e.target.value})}
              />
            </div>
            
            <div>
              <Label>Message *</Label>
              <Textarea
                value={emailFormData.message}
                onChange={(e) => setEmailFormData({...emailFormData, message: e.target.value})}
                rows={8}
              />
            </div>
            
            <div className="bg-blue-50 p-3 rounded text-sm">
              <p><strong>Quote Details:</strong></p>
              <p>Quote #: {selectedQuote?.quote_number}</p>
              <p>Drawing #: {selectedQuote?.drawing_number}</p>
              <p>Total: {formatCurrency(selectedQuote?.quote_total || 0)}</p>
            </div>
          </div>
          
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => {
              setEmailDialogOpen(false);
              setEmailFormData({ to: '', subject: '', message: '' });
            }}>
              Cancel
            </Button>
            <Button onClick={handleSendEmail} className="bg-slate-900 hover:bg-slate-800">
              <Send className="w-4 h-4 mr-2" />
              Send Email
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Quote Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Confirm Delete
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this quote? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          {quoteToDelete && (
            <div className="bg-slate-50 p-4 rounded-lg space-y-2">
              <p><strong>Quote #:</strong> {quoteToDelete.quote_number}</p>
              <p><strong>Customer:</strong> {quoteToDelete.customer_name}</p>
              <p><strong>Part:</strong> {quoteToDelete.part_description}</p>
              <p><strong>Total:</strong> {formatCurrency(quoteToDelete.quote_total || 0)}</p>
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setDeleteDialogOpen(false);
                setQuoteToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDeleteQuote}
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Job Sheet Dialog */}
      <Dialog open={jobSheetDialogOpen} onOpenChange={setJobSheetDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>✅ Convert Quote to Job Sheet</DialogTitle>
            <DialogDescription>
              Creating job sheet for <strong>{selectedProcess?.name}</strong> process
            </DialogDescription>
          </DialogHeader>
          
          {/* Quote Summary - Read Only */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 space-y-2">
            <h4 className="font-semibold text-blue-900">Quote Information (Auto-Filled)</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-600">Customer:</span>
                <div className="font-medium">{selectedQuote?.customer_name}</div>
              </div>
              <div>
                <span className="text-gray-600">Part Description:</span>
                <div className="font-medium">{selectedQuote?.part_description}</div>
              </div>
              <div>
                <span className="text-gray-600">Material:</span>
                <div className="font-medium">{selectedQuote?.material}</div>
              </div>
              <div>
                <span className="text-gray-600">Quoted Quantity:</span>
                <div className="font-medium">{selectedQuote?.quantity_required}</div>
              </div>
            </div>
          </div>

          {/* Price Breakdown Section - For comparison with PO */}
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <h4 className="font-semibold text-green-900 mb-3">💰 Price Breakdown (Compare with PO)</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-green-300">
                    <th className="text-left py-2 px-2">Item</th>
                    <th className="text-right py-2 px-2">Unit (Ex GST)</th>
                    <th className="text-right py-2 px-2">Unit (Inc GST)</th>
                    <th className="text-right py-2 px-2">Qty</th>
                    <th className="text-right py-2 px-2">Total (Inc GST)</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedQuote?.processes?.map((proc, idx) => {
                    const procUnitExGst = (proc.total_cost || 0) / (selectedQuote.quantity_required || 1);
                    const procUnitIncGst = procUnitExGst * 1.10;
                    const procTotal = procUnitIncGst * (selectedQuote.quantity_required || 1);
                    return (
                      <tr key={idx} className="border-b border-green-200">
                        <td className="py-2 px-2">{proc.name}</td>
                        <td className="py-2 px-2 text-right">{formatCurrency(procUnitExGst)}</td>
                        <td className="py-2 px-2 text-right">{formatCurrency(procUnitIncGst)}</td>
                        <td className="py-2 px-2 text-right">{selectedQuote.quantity_required}</td>
                        <td className="py-2 px-2 text-right">{formatCurrency(procTotal)}</td>
                      </tr>
                    );
                  })}
                  {selectedQuote?.total_material_cost > 0 && (
                    <tr className="border-b border-green-200">
                      <td className="py-2 px-2">Material</td>
                      <td className="py-2 px-2 text-right">{formatCurrency((selectedQuote.total_material_cost || 0) / (selectedQuote.quantity_required || 1))}</td>
                      <td className="py-2 px-2 text-right">{formatCurrency((selectedQuote.total_material_cost || 0) / (selectedQuote.quantity_required || 1) * 1.10)}</td>
                      <td className="py-2 px-2 text-right">{selectedQuote.quantity_required}</td>
                      <td className="py-2 px-2 text-right">{formatCurrency((selectedQuote.total_material_cost || 0) * 1.10)}</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-green-100 font-semibold">
                    <td className="py-2 px-2">QUOTE TOTAL</td>
                    <td className="py-2 px-2 text-right">{formatCurrency((selectedQuote?.quote_total || 0) / 1.10 / (selectedQuote?.quantity_required || 1))}</td>
                    <td className="py-2 px-2 text-right">{formatCurrency((selectedQuote?.quote_total || 0) / (selectedQuote?.quantity_required || 1))}</td>
                    <td className="py-2 px-2 text-right">{selectedQuote?.quantity_required}</td>
                    <td className="py-2 px-2 text-right text-lg">{formatCurrency(selectedQuote?.quote_total || 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Editable Fields */}
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="js_quantity" className="text-base">
                  <span className="text-red-500">*</span> Actual Quantity to Produce
                </Label>
                <Input
                  id="js_quantity"
                  type="number"
                  value={jobSheetFormData.quantity}
                  onChange={(e) => setJobSheetFormData(prev => ({ ...prev, quantity: e.target.value }))}
                  placeholder="Enter actual quantity"
                  className="text-lg"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Can be different from quoted quantity
                </p>
              </div>
              
              <div>
                <Label htmlFor="js_po_number" className="text-base">
                  <span className="text-red-500">*</span> Purchase Order Number
                </Label>
                <Input
                  id="js_po_number"
                  value={jobSheetFormData.purchase_order_number}
                  onChange={(e) => setJobSheetFormData(prev => ({ ...prev, purchase_order_number: e.target.value }))}
                  placeholder="Enter customer PO number"
                  className="text-lg"
                />
              </div>
            </div>
            
            {/* Quote Price Breaks — show so the user can verify PO price against quoted price */}
            {(() => {
              const qBreaks = (selectedQuote?.quantity_breaks && selectedQuote.quantity_breaks.length > 0)
                ? selectedQuote.quantity_breaks
                : (() => {
                    const li = (selectedQuote?.line_items || []).find(li => li.quantity_breaks && li.quantity_breaks.length > 0);
                    return li ? li.quantity_breaks : [];
                  })();
              if (!qBreaks || qBreaks.length === 0) return null;
              const enteredQty = parseInt(jobSheetFormData.quantity) || 0;
              return (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200" data-testid="quote-price-breaks">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-semibold text-blue-900">📊 Quoted Price Breaks</h4>
                    <span className="text-xs text-blue-700">Click a row to apply that price</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-blue-200">
                        <th className="py-1 px-2">Qty</th>
                        <th className="py-1 px-2 text-right">Price/Part (Inc GST)</th>
                        <th className="py-1 px-2 text-right">Price/Part (Ex GST)</th>
                        <th className="py-1 px-2 text-right">Line Total (Inc GST)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...qBreaks]
                        .sort((a, b) => (parseFloat(a.quantity) || 0) - (parseFloat(b.quantity) || 0))
                        .map((qb) => {
                          const qty = parseFloat(qb.quantity) || 0;
                          const priceInc = parseFloat(qb.price_per_part) || 0;
                          const priceEx = priceInc / 1.10;
                          const isMatch = enteredQty && qty === enteredQty;
                          return (
                            <tr
                              key={qb.id || qty}
                              onClick={() => {
                                setJobSheetFormData(prev => ({
                                  ...prev,
                                  unit_price: priceInc.toFixed(2),
                                  unit_price_ex_gst: priceEx.toFixed(2),
                                }));
                              }}
                              className={`cursor-pointer hover:bg-blue-100 border-b border-blue-100 ${isMatch ? 'bg-amber-100 font-semibold' : ''}`}
                              data-testid={`price-break-row-${qty}`}
                              title="Click to apply this break price"
                            >
                              <td className="py-1 px-2">{qty}{isMatch && ' ← matches PO qty'}</td>
                              <td className="py-1 px-2 text-right">{formatCurrency(priceInc)}</td>
                              <td className="py-1 px-2 text-right">{formatCurrency(priceEx)}</td>
                              <td className="py-1 px-2 text-right">{formatCurrency(priceInc * qty)}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                  <p className="text-xs text-blue-700 mt-2">
                    Compare these quoted prices with the customer&apos;s PO before creating the job sheet. Clicking a row auto-fills the Unit Price fields below.
                  </p>
                </div>
              );
            })()}
            
            <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
              <h4 className="font-semibold text-amber-900 mb-3">💵 Adjustable Unit Price</h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="js_unit_price_ex" className="text-sm">Unit Price (Ex GST)</Label>
                  <Input
                    id="js_unit_price_ex"
                    type="number"
                    step="0.01"
                    value={jobSheetFormData.unit_price_ex_gst}
                    onChange={(e) => {
                      const exGst = parseFloat(e.target.value) || 0;
                      const incGst = exGst * 1.10;
                      setJobSheetFormData(prev => ({ 
                        ...prev, 
                        unit_price_ex_gst: e.target.value,
                        unit_price: incGst.toFixed(2)
                      }));
                    }}
                    className="text-lg"
                  />
                </div>
                <div>
                  <Label htmlFor="js_unit_price" className="text-sm">Unit Price (Inc GST)</Label>
                  <Input
                    id="js_unit_price"
                    type="number"
                    step="0.01"
                    value={jobSheetFormData.unit_price}
                    onChange={(e) => {
                      const incGst = parseFloat(e.target.value) || 0;
                      const exGst = incGst / 1.10;
                      setJobSheetFormData(prev => ({ 
                        ...prev, 
                        unit_price: e.target.value,
                        unit_price_ex_gst: exGst.toFixed(2)
                      }));
                    }}
                    className="text-lg"
                  />
                </div>
                <div>
                  <Label className="text-sm">Job Total (Inc GST)</Label>
                  <div className="text-2xl font-bold text-amber-800 mt-1">
                    {formatCurrency(((parseFloat(jobSheetFormData.unit_price_ex_gst) || 0) * (parseInt(jobSheetFormData.quantity) || 0)) * 1.10)}
                  </div>
                </div>
              </div>
              <p className="text-xs text-amber-600 mt-2">
                Adjust if PO price differs from quote. This price will be used for invoicing.
              </p>
            </div>
            
            <div>
              <Label htmlFor="js_due_date" className="text-base">
                <span className="text-red-500">*</span> Due Date
              </Label>
              <Input
                id="js_due_date"
                type="date"
                value={jobSheetFormData.due_date}
                onChange={(e) => setJobSheetFormData(prev => ({ ...prev, due_date: e.target.value }))}
                className="text-lg"
              />
            </div>

            {/* Machine Selection (any machine type) */}
            {pressBrakeMachines.length > 0 && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4" data-testid="js-machine-section">
                <Label htmlFor="js_machine" className="text-base text-purple-900 font-semibold">
                  🏭 Machine
                </Label>
                <select
                  id="js_machine"
                  data-testid="js-machine-select"
                  className="flex h-10 w-full rounded-md border border-purple-300 bg-white px-3 py-2 text-sm mt-1"
                  value={jobSheetFormData.machine_id || ''}
                  onChange={(e) => setJobSheetFormData(prev => ({ ...prev, machine_id: e.target.value }))}
                >
                  <option value="">— Select machine —</option>
                  {machinesForProcess(selectedProcess?.name).map(m => (
                    <option key={m.id} value={m.id}>
                      {m.machine_name}{m.machine_number ? ` (#${m.machine_number})` : ''} — {m.open_jobs || 0} open job{(m.open_jobs || 0) === 1 ? '' : 's'}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-purple-600 mt-1">The machine name will print bold on the job sheet. Open job counts help you balance workload.</p>
              </div>
            )}

            {/* Q.A. Inspection Interval - Only show if quote has inspection items */}
            {selectedQuote?.qa_inspection_items?.length > 0 && (
              <div className="bg-teal-50 border border-teal-200 rounded p-4">
                <Label htmlFor="js_inspection_interval" className="text-base text-teal-800 flex items-center gap-2">
                  <span>🔬</span> Inspection Interval (Q.A.)
                </Label>
                <p className="text-sm text-teal-600 mb-2">
                  This quote has {selectedQuote.qa_inspection_items.length} inspection item(s) defined. 
                  Specify how often measurements should be taken.
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-sm">Every</span>
                  <Input
                    id="js_inspection_interval"
                    type="number"
                    min="1"
                    value={jobSheetFormData.inspection_interval}
                    onChange={(e) => setJobSheetFormData(prev => ({ ...prev, inspection_interval: e.target.value }))}
                    className="w-24"
                    placeholder="20"
                  />
                  <span className="text-sm">parts</span>
                </div>
                <p className="text-xs text-teal-500 mt-2">
                  Example: If quantity is 100 and interval is 20, checkpoints will be at: 1st Off, 20, 40, 60, 80, 100
                </p>
              </div>
            )}

            {selectedProcess?.process_notes && (
              <div>
                <Label>Process Notes (from Quote)</Label>
                <div className="bg-gray-50 p-3 rounded text-sm whitespace-pre-wrap border">
                  {selectedProcess.process_notes}
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setJobSheetDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateJobSheet} 
              className="bg-blue-600 hover:bg-blue-700"
              disabled={!jobSheetFormData.quantity || !jobSheetFormData.purchase_order_number || !jobSheetFormData.due_date}
            >
              🚀 Create Job Sheet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Multi-Item Job Sheet Generation Dialog */}
      <Dialog open={multiItemJobSheetDialogOpen} onOpenChange={setMultiItemJobSheetDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate Job Sheets for Multi-Item Quote</DialogTitle>
            <DialogDescription>
              Select the line items you want to create job sheets for. Job sheets will be created for all processes in each selected line item.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Common Job Sheet Details */}
            <div className="grid grid-cols-2 gap-4 bg-blue-50 p-4 rounded-lg">
              <div>
                <Label htmlFor="multi_po_number">Purchase Order Number</Label>
                <Input
                  id="multi_po_number"
                  placeholder="Optional"
                  value={multiItemJobSheetData.purchase_order_number}
                  onChange={(e) => setMultiItemJobSheetData(prev => ({ ...prev, purchase_order_number: e.target.value }))}
                />
              </div>
              
              <div>
                <Label htmlFor="multi_due_date">Due Date</Label>
                <Input
                  id="multi_due_date"
                  type="date"
                  value={multiItemJobSheetData.due_date}
                  onChange={(e) => setMultiItemJobSheetData(prev => ({ ...prev, due_date: e.target.value }))}
                />
              </div>
            </div>
            
            {/* Line Items Selection */}
            <div className="border rounded-lg">
              <div className="bg-slate-100 px-4 py-2 font-semibold border-b flex items-center justify-between">
                <span>Select Line Items ({selectedLineItemsForJobSheet.length} selected)</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="js-select-all-btn"
                    onClick={() => setSelectedLineItemsForJobSheet((selectedQuote?.line_items || []).map((_, i) => i))}>
                    Select All
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="js-clear-all-btn"
                    onClick={() => setSelectedLineItemsForJobSheet([])}>
                    Clear All
                  </Button>
                </div>
              </div>
              <div className="p-4 space-y-3">
                {selectedQuote?.line_items?.map((item, index) => {
                  const isSelected = selectedLineItemsForJobSheet.includes(index);
                  const existingJS = existingJobSheetsForQuote.filter(js => (js.part_description || '') === (item.part_description || ''));
                  const defaultUnitEx = (parseFloat(item.total) || 0) / Math.max(parseInt(item.quantity) || 1, 1);
                  const override = lineJobOverrides[index] || {};
                  const qty = override.quantity != null ? override.quantity : (item.quantity || 0);
                  const unitEx = override.unit_price_ex_gst != null ? override.unit_price_ex_gst : defaultUnitEx;
                  const qtyNum = parseFloat(qty) || 0;
                  const unitExNum = parseFloat(unitEx) || 0;
                  const jobTotalInc = qtyNum * unitExNum * 1.10;
                  return (
                  <div key={index} className={`flex items-start gap-3 p-3 border rounded ${isSelected ? 'bg-blue-50 border-blue-300' : 'hover:bg-slate-50'}`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleLineItemSelection(index)}
                      className="mt-1 h-4 w-4"
                    />
                    <div className="flex-1">
                      <div className="font-medium">
                        Line #{item.line_number || index + 1}: {item.part_description}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        Material: {item.material_type} {item.thickness}
                      </div>
                      {existingJS.length > 0 && (
                        <div className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1 inline-block" data-testid={`js-existing-badge-${index}`}>
                          ⚠ Already released: {existingJS.map(js => js.job_sheet_number).join(', ')} — tick again only if re-issuing
                        </div>
                      )}
                      {item.processes && item.processes.length > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          Processes: {item.processes.map(p => p.name).join(', ')} 
                          <span className="text-gray-400"> ({item.processes.length} job sheet{item.processes.length > 1 ? 's' : ''} will be created)</span>
                        </div>
                      )}
                      {(!item.processes || item.processes.length === 0) && (
                        <div className="text-xs text-red-500 mt-1">
                          ⚠️ No processes defined for this line item
                        </div>
                      )}
                      {isSelected && (
                        <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-blue-200">
                          <div>
                            <Label className="text-xs">Quantity</Label>
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              value={qty}
                              onChange={(e) => setLineJobOverrides(prev => ({
                                ...prev,
                                [index]: { ...(prev[index] || { unit_price_ex_gst: defaultUnitEx }), quantity: e.target.value }
                              }))}
                              className="h-8 text-sm"
                              data-testid={`multi-js-qty-${index}`}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Unit Price (Ex GST)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={Number.isFinite(unitExNum) ? unitEx : ''}
                              onChange={(e) => setLineJobOverrides(prev => ({
                                ...prev,
                                [index]: { ...(prev[index] || { quantity: item.quantity }), unit_price_ex_gst: e.target.value }
                              }))}
                              className="h-8 text-sm"
                              data-testid={`multi-js-price-${index}`}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Job Total (Inc GST)</Label>
                            <div className="text-base font-bold text-green-700 mt-1" data-testid={`multi-js-total-${index}`}>
                              {formatCurrency(jobTotalInc)}
                            </div>
                          </div>
                          {(item.processes || []).length > 0 && (
                            <div className="col-span-3 space-y-1">
                              {(item.processes || []).map(p => (
                                <div key={p.id} className="flex items-center gap-2">
                                  <Label className="text-xs text-purple-900 w-44 shrink-0">🏭 {p.name} machine</Label>
                                  <select
                                    data-testid={`multi-js-machine-${index}-${p.id}`}
                                    className="flex h-8 w-full rounded-md border border-purple-300 bg-white px-2 text-sm"
                                    value={(override.machines || {})[p.id] || ''}
                                    onChange={(e) => setLineJobOverrides(prev => ({
                                      ...prev,
                                      [index]: {
                                        ...(prev[index] || {}),
                                        machines: { ...((prev[index] || {}).machines || {}), [p.id]: e.target.value }
                                      }
                                    }))}
                                  >
                                    <option value="">— Select machine —</option>
                                    {machinesForProcess(p.name).map(m => (
                                      <option key={m.id} value={m.id}>
                                        {m.machine_name}{m.machine_number ? ` (#${m.machine_number})` : ''} — {m.open_jobs || 0} open job{(m.open_jobs || 0) === 1 ? '' : 's'}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
            
            {selectedLineItemsForJobSheet.length > 0 && (
              <div className="bg-green-50 p-3 rounded text-sm">
                <strong>Summary:</strong> {
                  selectedQuote?.line_items
                    ?.filter((_, idx) => selectedLineItemsForJobSheet.includes(idx))
                    .reduce((sum, item) => sum + (item.processes?.length || 0), 0)
                } job sheet(s) will be created for {selectedLineItemsForJobSheet.length} selected line item(s).
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setMultiItemJobSheetDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateMultiItemJobSheets} 
              className="bg-purple-600 hover:bg-purple-700"
              disabled={selectedLineItemsForJobSheet.length === 0}
            >
              <FileText className="h-4 w-4 mr-2" />
              Generate Job Sheets
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Press Brake Part History Popup */}
      <Dialog open={partHistoryOpen} onOpenChange={setPartHistoryOpen}>
        <DialogContent className="max-w-2xl" data-testid="part-history-dialog">
          <DialogHeader>
            <DialogTitle>⚠️ This Part Has Been Run Before</DialogTitle>
            <DialogDescription>
              Previous job(s) found for this part — check which machine and tooling were used last time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[50vh] overflow-y-auto">
            {partHistory.map((grp, gi) => (
              <div key={gi}>
                <div className="font-semibold text-sm text-slate-800 mb-1">{grp.part}</div>
                <table className="w-full text-xs border border-slate-300">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="text-left px-2 py-1 border">Job #</th>
                      <th className="text-left px-2 py-1 border">Process</th>
                      <th className="text-left px-2 py-1 border">Machine Used</th>
                      <th className="text-left px-2 py-1 border">Top Punch</th>
                      <th className="text-left px-2 py-1 border">V Die</th>
                      <th className="text-left px-2 py-1 border">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grp.entries.map((e, ei) => (
                      <tr key={ei} className="border-t">
                        <td className="px-2 py-1 border font-semibold">{e.job_sheet_number}</td>
                        <td className="px-2 py-1 border">{e.process_name || '—'}</td>
                        <td className="px-2 py-1 border font-bold text-purple-800">{e.machine_name || '—'}</td>
                        <td className="px-2 py-1 border">{e.top_punch_used || '—'}</td>
                        <td className="px-2 py-1 border">{e.v_die_used || '—'}</td>
                        <td className="px-2 py-1 border">{e.completed_at ? new Date(e.completed_at).toLocaleDateString('en-AU') : e.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setPartHistoryOpen(false)} data-testid="part-history-ok-btn">Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Quotes;
