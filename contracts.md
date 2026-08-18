# ERP System - Frontend & Backend Integration Contracts

## Overview
This document outlines the API contracts, data structures, and integration plan for the Manufacturing ERP system.

## Current Implementation Status
✅ **Frontend (Mock Data)**: Fully implemented with mock data
⏳ **Backend**: To be implemented
⏳ **Database**: MongoDB schemas to be created
⏳ **Integration**: Frontend-Backend connection to be established

---

## 1. Authentication Module

### API Endpoints

#### POST /api/auth/login
**Request:**
```json
{
  "username": "admin",
  "password": "password123"
}
```
**Response:**
```json
{
  "success": true,
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "name": "Admin User",
    "username": "admin",
    "email": "admin@erp.com",
    "role": "Administrator",
    "modules": ["quotes", "customers", "suppliers", "inventory", "employees", "iso"]
  }
}
```

#### POST /api/auth/logout
**Request:** Bearer token in header
**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### Database Schema: `users`
```javascript
{
  _id: ObjectId,
  name: String,
  username: String (unique),
  email: String (unique),
  password: String (hashed),
  role: String,
  modules: [String],
  createdAt: Date,
  updatedAt: Date
}
```

### Mock Data Location
- File: `/app/frontend/src/mock/mockData.js`
- Variable: `mockEmployees`
- Lines to replace: Authentication context in `/app/frontend/src/context/AuthContext.js`

---

## 2. Customer Module

### API Endpoints

#### GET /api/customers
**Response:**
```json
{
  "customers": [
    {
      "id": "customer_id",
      "companyName": "Competition Engines",
      "contactName": "Elias Thompson",
      "email": "elias@competitionengines.com",
      "phone": "9548 5116",
      "address": "123 Industrial Park Drive",
      "suburb": "Melbourne",
      "state": "VIC",
      "postcode": "3000",
      "totalSpend": 125000,
      "orders": 45,
      "lastOrderDate": "2025-07-15"
    }
  ]
}
```

#### POST /api/customers
**Request:**
```json
{
  "companyName": "New Company",
  "contactName": "John Doe",
  "email": "john@company.com",
  "phone": "1234567890",
  "address": "Street Address",
  "suburb": "City",
  "state": "State",
  "postcode": "0000"
}
```

#### GET /api/customers/:id
#### PUT /api/customers/:id
#### DELETE /api/customers/:id

### Database Schema: `customers`
```javascript
{
  _id: ObjectId,
  companyName: String,
  contactName: String,
  email: String,
  phone: String,
  address: String,
  suburb: String,
  state: String,
  postcode: String,
  totalSpend: Number (default: 0),
  orders: Number (default: 0),
  lastOrderDate: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### Mock Data Location
- File: `/app/frontend/src/mock/mockData.js`
- Variable: `mockCustomers`
- Component: `/app/frontend/src/pages/Customers.js`

---

## 3. Supplier Module

### API Endpoints

#### GET /api/suppliers
#### POST /api/suppliers
#### GET /api/suppliers/:id
#### PUT /api/suppliers/:id
#### DELETE /api/suppliers/:id

### Database Schema: `suppliers`
```javascript
{
  _id: ObjectId,
  companyName: String,
  contactName: String,
  contactPosition: String,
  email: String,
  phone: String,
  mobile: String,
  fax: String,
  address: String,
  suburb: String,
  state: String,
  postcode: String,
  website: String,
  supplierOf: String,
  abn: String,
  accountNumber: String,
  deliveryCharge: Number,
  palletCharge: Number,
  testCertCharge: Number,
  notes: String,
  createdAt: Date,
  updatedAt: Date
}
```

### Mock Data Location
- File: `/app/frontend/src/mock/mockData.js`
- Variable: `mockSuppliers`
- Component: `/app/frontend/src/pages/Suppliers.js`

---

## 4. Quoting Module (Core Feature)

### API Endpoints

#### GET /api/quotes
**Response:**
```json
{
  "quotes": [
    {
      "id": "Q-786398",
      "customer": "Competition Engines",
      "contactPerson": "Elias",
      "partDescription": "CE100003V CE100001V CE100002V",
      "itemRef": "786398",
      "status": "Active",
      "dateCreated": "2025-07-19",
      "quotedPrice": 617.00,
      "material": {...},
      "processes": [...]
    }
  ]
}
```

#### POST /api/quotes
**Request:**
```json
{
  "customer": "customer_id",
  "contactPerson": "Contact Name",
  "itemRef": "Item Reference",
  "partDescription": "Description",
  "material": {
    "type": "Mild Steel",
    "thickness": "5mm",
    "grade": "H45",
    "finish": "PKZN"
  },
  "geometry": {
    "length": 100,
    "width": 50,
    "diameter": 110,
    "pierceCount": 1,
    "totalPerimeter": 440,
    "totalArea": 9503
  },
  "processes": [
    {
      "type": "Laser Cutting",
      "isOutsource": false,
      "cuttingTime": 4.00,
      "programmingCost": 9.95,
      "setupCost": 1.90,
      "cuttingCostPerPart": 8.40,
      "deliveryCost": 0
    },
    {
      "type": "Outsource",
      "isOutsource": true,
      "processName": "Powder Coating",
      "supplierName": "ABC Coating",
      "contactPerson": "John",
      "phoneNo": "1234567890",
      "unitCost": 50,
      "otherCosts": 10,
      "transportCosts": 5,
      "totalCosts": 65,
      "marginPercentage": 25,
      "actualMargin": 16.25,
      "sellPrice": 81.25
    }
  ],
  "sellingPrice": 617.00,
  "buyingCost": 30.38,
  "markup": "auto",
  "status": "Active"
}
```

#### GET /api/quotes/:id
#### PUT /api/quotes/:id
#### DELETE /api/quotes/:id
#### GET /api/quotes/:id/pdf (Generate PDF)

### Database Schema: `quotes`
```javascript
{
  _id: ObjectId,
  quoteNumber: String (unique, auto-generated),
  customer: ObjectId (ref: customers),
  contactPerson: String,
  itemRef: String,
  partDescription: String,
  dateCreated: Date,
  material: {
    type: String,
    thickness: String,
    grade: String,
    finish: String
  },
  geometry: {
    length: Number,
    width: Number,
    diameter: Number,
    pierceCount: Number,
    totalPerimeter: Number,
    totalArea: Number
  },
  processes: [{
    type: String,
    isOutsource: Boolean,
    // Laser Cutting fields
    cuttingTime: Number,
    programmingCost: Number,
    setupCost: Number,
    cuttingCostPerPart: Number,
    deliveryCost: Number,
    // Press Brake fields
    bendCount: Number,
    setupTime: Number,
    cycleTime: Number,
    // Outsource fields
    processName: String,
    supplierName: String,
    contactPerson: String,
    phoneNo: String,
    unitCost: Number,
    otherCosts: Number,
    transportCosts: Number,
    totalCosts: Number,
    marginPercentage: Number,
    actualMargin: Number,
    sellPrice: Number
  }],
  sellingPrice: Number,
  buyingCost: Number,
  markup: String,
  quotedPrice: Number,
  status: String (enum: Active, Pending, Approved, Declined),
  createdAt: Date,
  updatedAt: Date
}
```

### Mock Data Location
- File: `/app/frontend/src/mock/mockData.js`
- Variable: `mockQuotes`
- Components: 
  - `/app/frontend/src/pages/Quotes.js`
  - `/app/frontend/src/pages/QuoteDetail.js`

---

## 5. Material/Inventory Module

### API Endpoints

#### GET /api/materials
#### POST /api/materials
#### GET /api/materials/:id
#### PUT /api/materials/:id
#### DELETE /api/materials/:id

### Database Schema: `materials`
```javascript
{
  _id: ObjectId,
  name: String,
  type: String,
  grade: String,
  finish: String,
  thickness: String,
  costPerKg: Number,
  stock: Number,
  location: String,
  createdAt: Date,
  updatedAt: Date
}
```

### Mock Data Location
- File: `/app/frontend/src/mock/mockData.js`
- Variable: `mockMaterials`

---

## 6. Frontend-Backend Integration Plan

### Step 1: Backend Setup
1. Create FastAPI routes for all modules
2. Implement MongoDB schemas using Motor
3. Add JWT authentication middleware
4. Create CRUD operations for each module

### Step 2: API Integration
1. Replace mock data calls with axios API calls
2. Update AuthContext to use real authentication endpoints
3. Add error handling and loading states
4. Implement token storage and refresh

### Step 3: Data Migration
1. Seed database with initial data
2. Test all CRUD operations
3. Verify calculations in quote module
4. Test PDF generation

### Step 4: Testing
1. Test authentication flow
2. Test role-based module access
3. Test dynamic process addition in quotes
4. Test all CRUD operations
5. Verify data persistence

---

## 7. Additional Features to Implement

### PDF Generation
- Library: ReportLab or WeasyPrint
- Endpoint: GET /api/quotes/:id/pdf
- Features: Professional quote layout with company branding

### Calculations
- Auto-calculate geometry (perimeter, area)
- Auto-calculate process costs
- Auto-calculate margins and totals
- Real-time updates in frontend

### Security
- JWT token authentication
- Password hashing (bcrypt)
- Role-based access control
- Input validation
- CORS configuration

### Employee Management
- CRUD operations for employees
- Module assignment interface
- Role management

### ISO/IMS Module
- Document management
- Audit trails
- Compliance tracking
- Quality management features

---

## 8. Environment Variables

### Backend (.env)
```
MONGO_URL=mongodb://localhost:27017/
DB_NAME=erp_system
JWT_SECRET=your_secret_key_here
JWT_EXPIRY=24h
```

### Frontend (.env)
```
REACT_APP_BACKEND_URL=http://localhost:8001
```

---

## Next Steps

1. **User Confirmation**: Get approval to proceed with backend development
2. **Backend Implementation**: Create all API endpoints and database schemas
3. **Integration**: Connect frontend to backend APIs
4. **Testing**: Comprehensive testing of all features
5. **Enhancement**: Add remaining modules (Inventory, Employees, ISO)
