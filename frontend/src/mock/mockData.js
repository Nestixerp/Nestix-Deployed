// Mock data for ERP system

export const mockCustomers = [
  {
    id: '1',
    companyName: 'Competition Engines',
    contactName: 'Elias Thompson',
    email: 'elias@competitionengines.com',
    phone: '9548 5116',
    address: '123 Industrial Park Drive',
    suburb: 'Melbourne',
    state: 'VIC',
    postcode: '3000',
    totalSpend: 125000,
    orders: 45,
    lastOrderDate: '2025-07-15'
  },
  {
    id: '2',
    companyName: 'Precision Manufacturing',
    contactName: 'Sarah Williams',
    email: 'sarah@precisionmfg.com',
    phone: '9548 7890',
    address: '456 Factory Road',
    suburb: 'Sydney',
    state: 'NSW',
    postcode: '2000',
    totalSpend: 89500,
    orders: 32,
    lastOrderDate: '2025-07-10'
  }
];

export const mockSuppliers = [
  {
    id: '1',
    companyName: 'Impact Steel',
    contactName: 'David Southwell',
    contactPosition: 'Sales',
    email: 'David.Southwell@bluescopesteel.com',
    phone: '03 8903 0286',
    mobile: '0419 373 053',
    fax: '03 9293 5180',
    address: '16-24 Westall Road',
    suburb: 'Clayton South',
    state: 'VIC',
    postcode: '3169',
    website: 'www.impactsteel.com.au',
    supplierOf: 'Materials',
    abn: '38 096 350 068',
    accountNumber: '44965',
    deliveryCharge: 0,
    palletCharge: 0,
    testCertCharge: 0,
    notes: 'Main steel supplier. Contact Peter Tannous 5268 4511',
    monthlySpend: [
      { month: '2025-07', spent: 28450.60, orders: 8 },
      { month: '2025-06', spent: 35200.00, orders: 12 },
      { month: '2025-05', spent: 29240.60, orders: 10 },
      { month: '2025-04', spent: 22100.00, orders: 7 },
      { month: '2025-03', spent: 31500.00, orders: 9 }
    ],
    currentMonthSpend: 28450.60,
    totalSpend: 146491.20
  },
  {
    id: '2',
    companyName: 'Precision Coating Co',
    contactName: 'Michael Chen',
    contactPosition: 'Operations Manager',
    email: 'michael@precisioncoating.com.au',
    phone: '03 9876 5432',
    mobile: '0412 345 678',
    fax: '03 9876 5433',
    address: '45 Industrial Drive',
    suburb: 'Dandenong',
    state: 'VIC',
    postcode: '3175',
    website: 'www.precisioncoating.com.au',
    supplierOf: 'Powder Coating',
    abn: '45 123 456 789',
    accountNumber: '78945',
    deliveryCharge: 50,
    palletCharge: 0,
    testCertCharge: 0,
    notes: 'Outsource powder coating supplier',
    monthlySpend: [
      { month: '2025-07', spent: 8920.00, orders: 15 },
      { month: '2025-06', spent: 12400.00, orders: 20 },
      { month: '2025-05', spent: 9800.00, orders: 16 },
      { month: '2025-04', spent: 7500.00, orders: 12 },
      { month: '2025-03', spent: 10200.00, orders: 18 }
    ],
    currentMonthSpend: 8920.00,
    totalSpend: 48820.00
  }
];

export const mockMaterials = [
  {
    id: '1',
    name: 'Mild Steel',
    type: 'Sheet',
    grade: 'HA3',
    finish: 'P&O',
    thickness: '5mm',
    costPerSheet: 85.00,
    weightPerSheet: 74.48,
    stock: 35,
    location: 'Rack A-12',
    width: 1220,
    length: 2440,
    supplier: 'Impact Steel',
    reorderLevel: 10,
    monthlyUsage: [
      { month: '2025-07', used: 8 },
      { month: '2025-06', used: 12 },
      { month: '2025-05', used: 15 },
      { month: '2025-04', used: 10 },
      { month: '2025-03', used: 11 }
    ]
  },
  {
    id: '2',
    name: 'Stainless Steel',
    type: 'Sheet',
    grade: '304',
    finish: '2B',
    thickness: '3mm',
    costPerSheet: 190.00,
    weightPerSheet: 22.34,
    stock: 28,
    location: 'Rack B-05',
    width: 1220,
    length: 2440,
    supplier: 'Impact Steel',
    reorderLevel: 8,
    monthlyUsage: [
      { month: '2025-07', used: 5 },
      { month: '2025-06', used: 7 },
      { month: '2025-05', used: 6 },
      { month: '2025-04', used: 4 },
      { month: '2025-03', used: 8 }
    ]
  },
  {
    id: '3',
    name: 'Mild Steel',
    type: 'Sheet',
    grade: 'HA3',
    finish: 'Galv',
    thickness: '2mm',
    costPerSheet: 56.50,
    weightPerSheet: 29.79,
    stock: 42,
    location: 'Rack A-14',
    width: 1220,
    length: 2440,
    supplier: 'Impact Steel',
    reorderLevel: 12,
    monthlyUsage: [
      { month: '2025-07', used: 9 },
      { month: '2025-06', used: 11 },
      { month: '2025-05', used: 13 },
      { month: '2025-04', used: 10 },
      { month: '2025-03', used: 12 }
    ]
  },
  {
    id: '4',
    name: 'Aluminium',
    type: 'Sheet',
    grade: '5005',
    finish: 'Mill',
    thickness: '3mm',
    costPerSheet: 102.00,
    weightPerSheet: 8.16,
    stock: 22,
    location: 'Rack C-08',
    width: 1220,
    length: 2440,
    supplier: 'Impact Steel',
    reorderLevel: 6,
    monthlyUsage: [
      { month: '2025-07', used: 4 },
      { month: '2025-06', used: 5 },
      { month: '2025-05', used: 6 },
      { month: '2025-04', used: 3 },
      { month: '2025-03', used: 5 }
    ]
  },
  {
    id: '5',
    name: 'Mild Steel',
    type: 'Sheet',
    grade: 'HA3',
    finish: 'P&O',
    thickness: '10mm',
    costPerSheet: 168.00,
    weightPerSheet: 148.96,
    stock: 18,
    location: 'Rack A-18',
    width: 1220,
    length: 2440,
    supplier: 'Impact Steel',
    reorderLevel: 5,
    monthlyUsage: [
      { month: '2025-07', used: 3 },
      { month: '2025-06', used: 4 },
      { month: '2025-05', used: 5 },
      { month: '2025-04', used: 3 },
      { month: '2025-03', used: 4 }
    ]
  },
  {
    id: '6',
    name: 'Stainless Steel',
    type: 'Sheet',
    grade: '316',
    finish: '2B',
    thickness: '5mm',
    costPerSheet: 380.00,
    weightPerSheet: 37.24,
    stock: 15,
    location: 'Rack B-12',
    width: 1220,
    length: 2440,
    supplier: 'Impact Steel',
    reorderLevel: 4,
    monthlyUsage: [
      { month: '2025-07', used: 2 },
      { month: '2025-06', used: 3 },
      { month: '2025-05', used: 3 },
      { month: '2025-04', used: 2 },
      { month: '2025-03', used: 4 }
    ]
  },
  {
    id: '7',
    name: 'Mild Steel',
    type: 'Sheet',
    grade: 'HA3',
    finish: 'P&O',
    thickness: '8mm',
    costPerSheet: 132.00,
    weightPerSheet: 119.17,
    stock: 25,
    location: 'Rack A-16',
    width: 1220,
    length: 2440,
    supplier: 'Impact Steel',
    reorderLevel: 7,
    monthlyUsage: [
      { month: '2025-07', used: 4 },
      { month: '2025-06', used: 5 },
      { month: '2025-05', used: 6 },
      { month: '2025-04', used: 4 },
      { month: '2025-03', used: 5 }
    ]
  },
  {
    id: '8',
    name: 'Aluminium',
    type: 'Sheet',
    grade: '5005',
    finish: 'Anodised',
    thickness: '5mm',
    costPerSheet: 190.00,
    weightPerSheet: 13.60,
    stock: 12,
    location: 'Rack C-12',
    width: 1220,
    length: 2440,
    supplier: 'Impact Steel',
    reorderLevel: 3,
    monthlyUsage: [
      { month: '2025-07', used: 2 },
      { month: '2025-06', used: 2 },
      { month: '2025-05', used: 3 },
      { month: '2025-04', used: 1 },
      { month: '2025-03', used: 2 }
    ]
  }
];

export const mockProcesses = [
  {
    id: 'laser',
    name: 'Laser Cutting',
    type: 'internal',
    hourlyRate: 120,
    setupCost: 50
  },
  {
    id: 'press',
    name: 'Press Brake',
    type: 'internal',
    hourlyRate: 85,
    setupCost: 30
  },
  {
    id: 'powder',
    name: 'Powder Coating',
    type: 'outsource',
    defaultMarkup: 25
  },
  {
    id: 'folding',
    name: 'Folding',
    type: 'internal',
    hourlyRate: 75,
    setupCost: 25
  }
];

export const mockQuotes = [
  {
    id: 'Q-786398',
    customer: 'Competition Engines',
    contactPerson: 'Elias',
    partDescription: 'CE100003V CE100001V CE100002V',
    itemRef: '786398',
    status: 'Active',
    dateCreated: '2025-07-19',
    quotedPrice: 617.00,
    material: {
      type: 'Mild Steel',
      thickness: '5mm',
      grade: 'HA3',
      finish: 'P&O'
    },
    processes: [
      {
        type: 'Laser Cutting',
        cuttingTime: 4.00,
        programmingCost: 9.95,
        setupCost: 1.90,
        cuttingCost: 8.40,
        deliveryCost: 0
      }
    ]
  }
];

export const mockEmployees = [
  {
    id: '1',
    name: 'Admin User',
    username: 'admin',
    email: 'admin@erp.com',
    role: 'Administrator',
    modules: ['quotes', 'jobsheets', 'invoices', 'customers', 'suppliers', 'inventory', 'employees', 'iso']
  },
  {
    id: '2',
    name: 'Peter Jones',
    username: 'peter',
    email: 'peter@erp.com',
    role: 'Sales Manager',
    modules: ['quotes', 'invoices', 'customers']
  },
  {
    id: '3',
    name: 'Sarah Chen',
    username: 'sarah',
    email: 'sarah@erp.com',
    role: 'Production Manager',
    modules: ['quotes', 'jobsheets', 'inventory', 'suppliers']
  }
];

export const mockInvoices = [
  {
    id: 'INV-2025001',
    quoteId: 'Q-786398',
    customer: 'Competition Engines',
    contactPerson: 'Elias',
    dateIssued: '2025-07-20',
    dueDate: '2025-08-20',
    amount: 617.00,
    status: 'Paid',
    paymentDate: '2025-07-25'
  },
  {
    id: 'INV-2025002',
    quoteId: 'Q-786210',
    customer: 'Precision Manufacturing',
    contactPerson: 'Sarah',
    dateIssued: '2025-07-18',
    dueDate: '2025-08-18',
    amount: 1250.00,
    status: 'Pending',
    paymentDate: null
  }
];

export const mockJobSheets = [
  {
    id: 'JS-001',
    quoteId: 'Q-786398',
    customer: 'Competition Engines',
    partDescription: 'CE100003V CE100001V CE100002V',
    status: 'In Progress',
    startDate: '2025-07-21',
    dueDate: '2025-07-28',
    processes: ['Laser Cutting', 'Press Brake', 'Powder Coating']
  }
];

export const availableModules = [
  { id: 'quotes', name: 'Quoting', icon: 'FileText' },
  { id: 'customers', name: 'Customers', icon: 'Users' },
  { id: 'suppliers', name: 'Suppliers', icon: 'Truck' },
  { id: 'inventory', name: 'Inventory', icon: 'Package' },
  { id: 'invoices', name: 'Invoices', icon: 'Receipt' },
  { id: 'jobsheets', name: 'Job Sheets', icon: 'ClipboardList' },
  { id: 'employees', name: 'Employees', icon: 'UserCog' },
  { id: 'iso', name: 'ISO/IMS', icon: 'ShieldCheck' }
];
