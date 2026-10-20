from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
import uuid

# Address Model (for Customer multiple addresses)
class Address(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    address_type: str  # "Billing", "Shipping", "Site"
    address_label: Optional[str] = None  # e.g., "Head Office", "Factory 1", etc.
    is_default: bool = False
    
    # Address Details
    street_address: str
    suburb: Optional[str] = None
    state: Optional[str] = None
    postcode: Optional[str] = None
    country: str = "Australia"
    
    # Contact at this address
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    
    # Delivery notes for this specific address
    delivery_instructions: Optional[str] = None

class AddressCreate(BaseModel):
    address_type: str
    address_label: Optional[str] = None
    is_default: bool = False
    street_address: str
    suburb: Optional[str] = None
    state: Optional[str] = None
    postcode: Optional[str] = None
    country: str = "Australia"
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    delivery_instructions: Optional[str] = None

class AddressUpdate(BaseModel):
    address_type: Optional[str] = None
    address_label: Optional[str] = None
    is_default: Optional[bool] = None
    street_address: Optional[str] = None
    suburb: Optional[str] = None
    state: Optional[str] = None
    postcode: Optional[str] = None
    country: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    delivery_instructions: Optional[str] = None

# Authentication Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    username: str
    email: str
    password_hash: str
    role: str
    modules: List[str]
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: str
    name: str
    username: str
    email: str
    role: str
    modules: List[str]

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

# Purchase Order Models
class PurchaseOrderLineItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    material_id: Optional[str] = None  # Only for stock materials from inventory
    
    # Material Specifications (always required)
    material_type: str  # e.g., "Mild Steel", "Stainless Steel"
    grade: str  # e.g., "HA3", "304", "316"
    finish: str  # e.g., "P&O", "2B", "Galv"
    thickness: str  # e.g., "5mm", "3mm"
    width: float  # in mm
    length: float  # in mm
    
    # Quantities
    quantity_ordered: int
    quantity_received: int = 0
    
    # Pricing
    price_per_unit: float
    line_total: float = 0.0  # Will be calculated as quantity_ordered * price_per_unit
    
    notes: Optional[str] = None

class PurchaseOrder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    po_number: str  # Auto-generated: PO-2025-0001
    supplier_id: str
    supplier_name: str  # For display
    supplier_code: str  # For display
    
    # PO Details
    po_type: str = "Stock"  # Stock / Job-Specific
    job_number: Optional[str] = None  # Required if job-specific
    test_cert_required: bool = False  # Test certificate required?
    
    # Line Items
    line_items: List[PurchaseOrderLineItem] = []
    
    # Dates
    order_date: datetime = Field(default_factory=datetime.utcnow)
    expected_delivery_date: datetime
    actual_delivery_date: Optional[datetime] = None
    
    # Status
    status: str = "Draft"  # Draft, Sent, Partial, Received, Closed, Cancelled
    
    # Totals
    subtotal: float = 0.0
    tax: float = 0.0
    total: float = 0.0
    
    # Performance Tracking (calculated on receipt)
    days_late: Optional[int] = None  # actual - expected (positive = late, negative = early)
    
    # Notes and Documents
    notes: Optional[str] = None
    internal_notes: Optional[str] = None
    document_urls: List[str] = []  # File attachments (test certs, etc.) - placeholder for now
    
    # Metadata
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class PurchaseOrderCreate(BaseModel):
    supplier_id: str
    po_type: str = "Stock"
    job_number: Optional[str] = None
    test_cert_required: bool = False
    expected_delivery_date: datetime
    line_items: List[dict]  # Will validate and create PurchaseOrderLineItem
    notes: Optional[str] = None
    internal_notes: Optional[str] = None

class PurchaseOrderUpdate(BaseModel):
    supplier_id: Optional[str] = None
    expected_delivery_date: Optional[datetime] = None
    status: Optional[str] = None
    line_items: Optional[List[dict]] = None
    notes: Optional[str] = None
    internal_notes: Optional[str] = None

# Material Models
class Material(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # Material Type (e.g., "Mild Steel")
    type: str  # Sheet/Plate/etc
    grade: str  # e.g., "HA3", "304", "316"
    finish: str  # e.g., "P&O", "2B", "Galv"
    thickness: str  # e.g., "5mm"
    weight_per_sheet: Optional[float] = 0.0  # Made optional for backward compatibility
    stock: int  # Current quantity in stock
    location: str  # Rack location
    width: int
    length: int
    supplier: str  # Primary supplier
    reorder_level: int
    
    # Cost Averaging Fields
    cost_average: float = 0.0  # Calculated weighted average cost
    selling_price: float = 0.0  # Cost average + markup
    markup_percentage: float = 15.0  # Default 15% markup
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class MaterialCreate(BaseModel):
    name: str
    type: str
    grade: str
    finish: str
    thickness: str
    weight_per_sheet: Optional[float] = 0.0  # Made optional for backward compatibility
    stock: int
    location: str
    width: int
    length: int
    supplier: str
    reorder_level: int
    markup_percentage: Optional[float] = 15.0

class MaterialUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    grade: Optional[str] = None
    finish: Optional[str] = None
    thickness: Optional[str] = None
    weight_per_sheet: Optional[float] = None
    stock: Optional[int] = None
    location: Optional[str] = None
    width: Optional[int] = None
    length: Optional[int] = None
    supplier: Optional[str] = None
    reorder_level: Optional[int] = None
    markup_percentage: Optional[float] = None
    selling_price: Optional[float] = None  # Allow manual override

# Lookup tables for adding new values
class MaterialAttribute(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    attribute_type: str  # "grade", "finish", "type", "thickness"
    value: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class MaterialAttributeCreate(BaseModel):
    attribute_type: str
    value: str

# Quote Models
class ProcessDetail(BaseModel):
    type: str  # "Laser Cutting", "Press Brake", "Outsource"
    is_outsource: bool = False
    # Laser Cutting fields
    cutting_time: Optional[float] = None
    programming_cost: Optional[float] = None
    setup_cost: Optional[float] = None
    cutting_cost_per_part: Optional[float] = None
    delivery_cost: Optional[float] = None
    # Press Brake fields
    bend_count: Optional[int] = None
    setup_time: Optional[float] = None
    cycle_time: Optional[float] = None
    # Outsource fields
    process_name: Optional[str] = None
    supplier_name: Optional[str] = None
    contact_person: Optional[str] = None
    phone_no: Optional[str] = None
    unit_cost: Optional[float] = None
    other_costs: Optional[float] = None
    transport_costs: Optional[float] = None
    total_costs: Optional[float] = None
    margin_percentage: Optional[float] = None
    actual_margin: Optional[float] = None
    sell_price: Optional[float] = None

class MaterialDetail(BaseModel):
    type: str
    thickness: str
    grade: str
    finish: str
    sheet_cost: Optional[float] = None
    usage: Optional[float] = None
    calculated_material_cost: Optional[float] = None
    sheet_weight: Optional[float] = None
    sheet_size: Optional[str] = None

# ============================================
# CUSTOMER MODULE MODELS
# ============================================

class Customer(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_code: str  # Auto-generated: CUST-0001, CUST-0002, etc.
    
    # Company Information
    company_name: str
    trading_name: Optional[str] = None  # Trading name if different from company name
    abn: Optional[str] = None
    manufacturer: Optional[str] = None  # Manufacturer name
    
    # Primary Contact
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    
    # Address (Legacy - kept for backward compatibility)
    address: Optional[str] = None
    suburb: Optional[str] = None
    state: Optional[str] = None
    postcode: Optional[str] = None
    country: str = "Australia"
    
    # Multiple Addresses (New)
    addresses: List[Address] = []
    
    # Business Classification
    customer_group: str = "Retail"  # Wholesale, Retail, Government, Premium, Other
    account_manager: Optional[str] = None  # Salesperson/Account Manager name
    
    # Financial Settings
    payment_terms: str = "Net 30"  # Net 7, Net 14, Net 30, Net 60, Net 90, COD
    credit_limit: float = 0.0
    credit_hold: bool = False  # Flag to prevent new orders if credit limit exceeded
    currency: str = "AUD"  # AUD, USD, EUR, etc.
    pricing_tier: str = "Standard"  # Standard, Bronze, Silver, Gold, Platinum
    discount_percentage: float = 0.0  # Default discount percentage
    
    # Operational Settings
    default_warehouse: Optional[str] = None  # Default warehouse/location for this customer
    delivery_instructions: Optional[str] = None  # General delivery preferences
    shipping_method: Optional[str] = None  # Preferred shipping method
    
    # Status & Terms
    status: str = "Active"  # Active, Inactive, On Hold, Suspended
    terms_conditions: Optional[str] = None  # Custom terms & conditions for this customer
    notes: Optional[str] = None  # Internal notes
    
    # Tracking (calculated)
    total_quotes: int = 0
    total_jobs: int = 0
    lifetime_value: float = 0.0
    fy_value: float = 0.0
    outstanding_balance: float = 0.0  # Current outstanding balance
    
    # Audit Trail
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None  # Username who created
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    modified_by: Optional[str] = None  # Username who last modified

class CustomerCreate(BaseModel):
    # Company Information
    company_name: str
    trading_name: Optional[str] = None
    abn: Optional[str] = None
    manufacturer: Optional[str] = None
    
    # Primary Contact
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    
    # Address (Legacy - can still use for quick setup)
    address: Optional[str] = None
    suburb: Optional[str] = None
    state: Optional[str] = None
    postcode: Optional[str] = None
    country: Optional[str] = "Australia"
    
    # Multiple Addresses (New)
    addresses: Optional[List[AddressCreate]] = []
    
    # Business Classification
    customer_group: Optional[str] = "Retail"
    account_manager: Optional[str] = None
    
    # Financial Settings
    payment_terms: Optional[str] = "Net 30"
    credit_limit: Optional[float] = 0.0
    credit_hold: Optional[bool] = False
    currency: Optional[str] = "AUD"
    pricing_tier: Optional[str] = "Standard"
    discount_percentage: Optional[float] = 0.0
    
    # Operational Settings
    default_warehouse: Optional[str] = None
    delivery_instructions: Optional[str] = None
    shipping_method: Optional[str] = None
    
    # Status & Terms
    status: Optional[str] = "Active"
    terms_conditions: Optional[str] = None
    notes: Optional[str] = None

class CustomerUpdate(BaseModel):
    # Company Information
    company_name: Optional[str] = None
    trading_name: Optional[str] = None
    abn: Optional[str] = None
    manufacturer: Optional[str] = None
    
    # Primary Contact
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    
    # Address (Legacy)
    address: Optional[str] = None
    suburb: Optional[str] = None
    state: Optional[str] = None
    postcode: Optional[str] = None
    country: Optional[str] = None
    
    # Multiple Addresses (New) - Note: addresses are managed via separate endpoints
    
    # Business Classification
    customer_group: Optional[str] = None
    account_manager: Optional[str] = None
    
    # Financial Settings
    payment_terms: Optional[str] = None
    credit_limit: Optional[float] = None
    credit_hold: Optional[bool] = None
    currency: Optional[str] = None
    pricing_tier: Optional[str] = None
    discount_percentage: Optional[float] = None
    
    # Operational Settings
    default_warehouse: Optional[str] = None
    delivery_instructions: Optional[str] = None
    shipping_method: Optional[str] = None
    
    # Status & Terms
    status: Optional[str] = None
    terms_conditions: Optional[str] = None
    notes: Optional[str] = None



# Customer Contact Models
class CustomerContact(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_id: str
    name: str
    job_title: Optional[str] = None
    role: str = "General"  # Primary Contact, Purchaser, Accounts Payable, Engineer, Manager, General
    email: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    is_primary: bool = False
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class CustomerContactCreate(BaseModel):
    name: str
    job_title: Optional[str] = None
    role: Optional[str] = "General"
    email: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    is_primary: Optional[bool] = False
    notes: Optional[str] = None

class CustomerContactUpdate(BaseModel):
    name: Optional[str] = None
    job_title: Optional[str] = None
    role: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    is_primary: Optional[bool] = None
    notes: Optional[str] = None


# Stock Adjustment Models
class StockAdjustment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    material_id: str
    type: str  # "add", "remove", "purchase", "usage", "adjustment"
    quantity: int
    note: Optional[str] = None
    reference: Optional[str] = None
    user: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class StockAdjustmentCreate(BaseModel):
    material_id: str
    type: str
    quantity: int
    note: Optional[str] = None
    reference: Optional[str] = None



# Supplier Models
class Supplier(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    supplier_code: str  # Auto-generated: SUP-0001, SUP-0002, etc.
    company_name: str
    abn: Optional[str] = None
    category: str  # Material / Outsourced Process / Freight / Consumables / Maintenance / Other
    address: Optional[str] = None
    suburb: Optional[str] = None
    state: Optional[str] = None
    postcode: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    payment_terms: Optional[str] = "30 Days EOM"
    iso_certified: bool = False
    insurance_expiry: Optional[datetime] = None
    status: str = "Active"  # Active / Inactive
    notes: Optional[str] = None
    
    # Contacts
    contacts: List[dict] = []  # List of supplier contacts
    
    # Performance Metrics (calculated, defaults to 0 until integrated)
    on_time_delivery: float = 0.0
    average_days_late: float = 0.0
    total_pos: int = 0
    total_received: int = 0
    lifetime_spend: float = 0.0
    fy_spend: float = 0.0
    ncr_count: int = 0
    open_ncrs: int = 0
    performance_rating: str = "N/A"  # Excellent / Good / Needs Improvement / Poor / N/A
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class SupplierCreate(BaseModel):
    company_name: str
    abn: Optional[str] = None
    category: str
    address: Optional[str] = None
    suburb: Optional[str] = None
    state: Optional[str] = None
    postcode: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    payment_terms: Optional[str] = "30 Days EOM"
    iso_certified: bool = False
    insurance_expiry: Optional[datetime] = None
    status: Optional[str] = "Active"
    notes: Optional[str] = None

class SupplierUpdate(BaseModel):
    supplier_code: Optional[str] = None
    company_name: Optional[str] = None
    abn: Optional[str] = None
    category: Optional[str] = None
    address: Optional[str] = None
    suburb: Optional[str] = None
    state: Optional[str] = None
    postcode: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    payment_terms: Optional[str] = None
    iso_certified: Optional[bool] = None
    status: Optional[str] = None
    notes: Optional[str] = None

# Supplier Contact Models
class SupplierContact(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    supplier_id: str
    name: str
    position: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: str = "Active"  # Active / Inactive
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class SupplierContactCreate(BaseModel):
    supplier_id: str
    name: str
    position: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = "Active"
    notes: Optional[str] = None

class SupplierContactUpdate(BaseModel):
    name: Optional[str] = None
    position: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None



# ============================================
# QUOTING MODULE MODELS
# ============================================

# Cutting Parameters (Feed Rates)
class CuttingParameter(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    material_type: str  # Mild Steel, Stainless Steel, Aluminium
    thickness: str  # 0.50mm, 1.00mm, etc.
    feed_rate: float  # mm/min
    pierce_time: float = 2.0  # seconds per hole
    setup_time: float = 5.0  # minutes



# ============================================
# QUOTE LINE ITEM MODEL (for Multi-Item Quotes)
# ============================================

class QuoteLineItem(BaseModel):
    """Individual line item in a multi-item quote"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    line_number: int  # 1, 2, 3, etc.
    
    # Part Details
    part_description: str
    part_number: Optional[str] = None  # Customer part number
    quantity: int = 1
    
    # Material & Nesting (Per Item)
    material_type: Optional[str] = ""
    grade: Optional[str] = ""
    finish: Optional[str] = ""
    thickness: Optional[str] = ""
    sheet_width: float = 1220  # mm
    sheet_length: float = 2440  # mm
    parts_per_sheet: int = 1
    sheets_required: float = 0.0
    material_usage_percent: float = 0.0
    
    # Material Costs (Per Item)
    buying_cost_per_sheet: float = 0.0
    selling_price_per_sheet: float = 0.0
    material_markup_percent: float = 0.0
    material_cost_per_part: float = 0.0
    hide_material_section: bool = False
    customer_supplied_material: bool = False
    
    # Geometry (Per Item)
    part_length: float = 0.0  # mm
    part_width: float = 0.0  # mm
    total_perimeter: float = 0.0  # mm
    total_area: float = 0.0  # mm²
    
    # Cutting (Per Item)
    cutting_time_minutes: float = 0.0
    cutting_cost_per_part: float = 0.0
    
    # Processes (Per Item) - Each item can have different processes
    processes: List[dict] = []
    total_process_cost: float = 0.0
    
    # Item Pricing
    cost_per_part_no_gst: float = 0.0
    cost_per_part_plus_gst: float = 0.0
    line_total_no_gst: float = 0.0  # quantity × cost_per_part_no_gst
    line_total_with_gst: float = 0.0  # quantity × cost_per_part_plus_gst
    total: float = 0.0  # Alias for line_total_with_gst (for compatibility)
    
    # Quantity Breaks (Per Item)
    quantity_breaks: List[dict] = []
    
    # Drawing (Per Item)
    drawing_url: Optional[str] = None
    drawing_filename: Optional[str] = None
    
    # Item Status
    approved: bool = False  # Whether this item is approved for production
    job_sheet_created: bool = False  # Whether job sheet was created for this item
    
    # Metadata
    notes: Optional[str] = None

# Quote Model
class Quote(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    quote_number: str  # Auto-generated: Auto-increments (1, 2, 3...)
    item_reference: str  # Same as quote_number
    drawing_number: str = ""  # Auto-generated: DRW-00001, DRW-00002...
    
    # Customer Info
    customer_id: Optional[str] = None
    customer_name: str
    contact_person: Optional[str] = None
    part_description: Optional[str] = None  # Optional for multi-item quotes
    quote_date: datetime = Field(default_factory=datetime.utcnow)
    
    # Material & Nesting (Optional for multi-item quotes)
    material_type: Optional[str] = None
    grade: Optional[str] = None
    finish: Optional[str] = None
    thickness: Optional[str] = None
    sheet_width: Optional[float] = None  # mm
    sheet_length: Optional[float] = None  # mm
    parts_per_sheet: int = 1
    sheets_required: float = 0.0
    material_usage_percent: float = 0.0
    buying_cost_per_sheet: float = 0.0  # Buying Cost of Material
    selling_price_per_sheet: float = 0.0  # Selling price of Material
    material_markup_percent: float = 0.0  # Markup percentage
    
    # Geometry
    part_length: float = 0.0  # mm
    part_width: float = 0.0  # mm
    total_perimeter: float = 0.0  # mm (Total Perimeter from M1)
    outside_total: float = 0.0  # mm (Outside Total from M1)
    inside_total: float = 0.0  # mm (Inside Total from M1)
    holes_quantity: int = 0
    holes_diameter: float = 0.0  # mm
    slots_quantity: int = 0
    slots_length: float = 0.0  # mm
    slots_width: float = 0.0  # mm
    total_area: float = 0.0  # mm²
    
    # Cutting Time Calculation & Geometry
    geometry_for_time_calculation: float = 0.0  # Geometry for Time Calculation (700 from M1)
    est_cutting_speed: float = 0.0  # Estimated cutting speed
    max_cutting_speed: float = 0.0  # Max cutting speed
    cutting_time_method: str = "manual"  # "manual" or "auto"
    cutting_time_minutes: float = 0.0
    feed_rate: float = 0.0  # mm/min (from cutting parameters)
    
    # Pricing & Cost Structure
    charge_rate_per_min: float = 0.0  # Charge Rate (min) - e.g., $2.75 from M1
    suggested_charge_rate: float = 0.0  # Suggested charge rate - e.g., $4.00 from M1
    hourly_rate: float = 0.0  # Hourly rate for setup/other costs
    quantity_required: int = 1  # Quantity required (applies to all processes)
    
    # Cost Breakdown (per part)
    material_cost_per_part: float = 0.0  # Material Cost / Part
    fixed_cost_per_part: float = 0.0  # Fixed Cost / Part (setup, programming, etc.)
    cutting_cost_per_part: float = 0.0  # Cutting Cost / Part
    programming_cost: float = 0.0  # Programming Cost
    setup_cost: float = 0.0  # Setup Cost
    laser_cleaning_cost: float = 0.0  # Laser/Cleaning Cost
    delivery_cost: float = 0.0  # Delivery Cost
    other_costs: float = 0.0  # Other costs
    
    # Process Costs
    processes: List[dict] = []  # Array of process objects with costs
    total_process_cost: float = 0.0  # Total cost from all processes
    
    # Total Costs & Pricing
    cost_per_part_no_gst: float = 0.0  # Cost / Part no GST
    total_job_cost: float = 0.0  # Total Job Cost
    cost_per_part_plus_gst: float = 0.0  # Cost / Part plus GST
    gst_value: float = 0.0  # GST Value
    quote_total: float = 0.0  # Final price to customer (with GST)
    
    # Profit Calculations
    net_profit: float = 0.0  # Net Profit
    gross_profit: float = 0.0  # Gross Profit
    profit_percent: float = 0.0  # Profit %
    break_even_value: float = 0.0  # Break Even Value
    
    # Press Brake Operation Fields
    press_brake_enabled: bool = False  # Whether press brake operation is included
    press_brake_in_house: bool = True  # In-House vs Outsource
    press_brake_setup_time: float = 0.0  # Setup time in minutes
    press_brake_setup_cost: float = 0.0  # One-time setup cost
    number_of_bends: int = 0  # Number of bends per part
    time_per_bend: float = 0.0  # Time value for each bend
    time_per_bend_unit: str = "sec per bend"  # "sec per bend" or "min per bend"
    packing_time_per_part: float = 0.0  # Packing time value per part
    packing_time_unit: str = "sec per part"  # "sec per part" or "min per part"
    efficiency_factor: float = 10.0  # Shop-floor inefficiency buffer % (default 10%)
    press_brake_hourly_rate: float = 0.0  # Hourly rate for press brake operations
    press_brake_cost_per_part: float = 0.0  # Calculated cost per part for press brake
    press_brake_total_cost: float = 0.0  # Total press brake cost for all parts
    bend_angles: Optional[str] = None  # e.g., "4 x 90° (2 Up / 2 Down)"
    tooling_required: Optional[str] = None  # e.g., "Punch: 11.049 (R8)  Die: V40"
    
    # Quantity Breaks (Price Tiers)
    quantity_breaks: List[dict] = []  # [{"quantity": 10, "price_per_part": 25.50, "total": 255.00}]
    
    # Drawing/File Upload
    drawing_url: Optional[str] = None  # URL/path to uploaded drawing file
    drawing_filename: Optional[str] = None  # Original filename of uploaded drawing
    
    # Multi-Item Quote Support
    is_multi_item: bool = False  # True if quote has multiple line items
    line_items: List[QuoteLineItem] = []  # Array of line items (empty for legacy single-item quotes)
    
    # Sales Adjustments (allow sales to override)
    sales_adjusted_cutting_time: Optional[float] = None  # Sales can adjust cutting time
    sales_adjusted_quote_total: Optional[float] = None  # Sales can adjust final quote total
    
    # Price Rounding Settings
    enable_rounding: bool = False  # Whether price rounding is enabled
    rounding_target: str = "total"  # "total" or "unit" - what to round
    rounding_to: float = 10  # Round to nearest X cents
    rounding_direction: str = "nearest"  # "nearest", "up", "down"
    manual_adjustment: float = 0  # Manual adjustment amount (+/-)
    original_total: Optional[float] = None  # Original total before rounding
    price_per_part: Optional[float] = None  # Price per part (may be rounded)
    
    # Quality Assurance (Q.A.) Inspection Items
    # Each item: {"id": "uuid", "type": "dimension"|"angle", "description": "Overall Length", "nominal_value": 150.5, "tolerance": "±0.5", "unit": "mm"|"°"}
    qa_inspection_items: List[dict] = []
    
    # Quote Notes (free-text notes to include on printed/downloaded quote)
    quote_notes: Optional[str] = ""
    
    # Status & Workflow
    status: str = "Draft"  # Draft / Sent / Accepted / Rejected / Job Created / Ready for Invoice
    
    # Metadata
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class QuoteCreate(BaseModel):
    customer_id: Optional[str] = None
    customer_name: str
    contact_person: Optional[str] = None
    is_draft: bool = False  # lenient validation for auto-saved unfinished quotes
    
    # Multi-item quote support
    is_multi_item: bool = False
    line_items: List[dict] = []  # For multi-item quotes
    
    # Legacy single-item fields (optional for multi-item quotes)
    part_description: Optional[str] = None
    material_type: Optional[str] = None
    grade: Optional[str] = None
    finish: Optional[str] = None
    thickness: Optional[str] = None
    sheet_width: Optional[float] = None
    sheet_length: Optional[float] = None
    parts_per_sheet: int = 1
    sheets_required: float = 0.0
    material_usage_percent: float = 0.0
    buying_cost_per_sheet: float = 0.0
    selling_price_per_sheet: float = 0.0
    material_markup_percent: float = 0.0
    part_length: float = 0.0
    part_width: float = 0.0
    total_perimeter: float = 0.0
    outside_total: float = 0.0
    inside_total: float = 0.0
    holes_quantity: int = 0
    holes_diameter: float = 0.0
    slots_quantity: int = 0
    slots_length: float = 0.0
    slots_width: float = 0.0
    total_area: float = 0.0
    geometry_for_time_calculation: float = 0.0
    est_cutting_speed: float = 0.0
    max_cutting_speed: float = 0.0
    cutting_time_method: str = "manual"
    cutting_time_minutes: float = 0.0
    charge_rate_per_min: float = 0.0
    suggested_charge_rate: float = 0.0
    hourly_rate: float = 0.0
    quantity_required: int = 1
    material_cost_per_part: float = 0.0
    fixed_cost_per_part: float = 0.0
    cutting_cost_per_part: float = 0.0
    programming_cost: float = 0.0
    setup_cost: float = 0.0
    laser_cleaning_cost: float = 0.0
    delivery_cost: float = 0.0
    other_costs: float = 0.0
    processes: List[dict] = []
    total_process_cost: float = 0.0
    cost_per_part_no_gst: float = 0.0
    total_job_cost: float = 0.0
    cost_per_part_plus_gst: float = 0.0
    gst_value: float = 0.0
    quote_total: float = 0.0
    net_profit: float = 0.0
    gross_profit: float = 0.0
    profit_percent: float = 0.0
    break_even_value: float = 0.0
    press_brake_enabled: bool = False
    press_brake_in_house: bool = True
    press_brake_setup_time: float = 0.0
    press_brake_setup_cost: float = 0.0
    number_of_bends: int = 0
    time_per_bend: float = 0.0
    time_per_bend_unit: str = "sec per bend"
    packing_time_per_part: float = 0.0
    packing_time_unit: str = "sec per part"
    press_brake_hourly_rate: float = 0.0
    press_brake_cost_per_part: float = 0.0
    press_brake_total_cost: float = 0.0
    bend_angles: Optional[str] = None
    tooling_required: Optional[str] = None
    quantity_breaks: List[dict] = []
    drawing_url: Optional[str] = None  # URL/path to uploaded drawing file
    drawing_filename: Optional[str] = None  # Original filename of uploaded drawing
    sales_adjusted_cutting_time: Optional[float] = None
    sales_adjusted_quote_total: Optional[float] = None
    quote_notes: Optional[str] = ""

class QuoteUpdate(BaseModel):
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    contact_person: Optional[str] = None
    part_description: Optional[str] = None
    material_type: Optional[str] = None
    grade: Optional[str] = None
    finish: Optional[str] = None
    thickness: Optional[str] = None
    sheet_width: Optional[float] = None
    sheet_length: Optional[float] = None
    parts_per_sheet: Optional[int] = None
    sheets_required: Optional[float] = None
    material_usage_percent: Optional[float] = None
    buying_cost_per_sheet: Optional[float] = None
    selling_price_per_sheet: Optional[float] = None
    material_markup_percent: Optional[float] = None
    part_length: Optional[float] = None
    part_width: Optional[float] = None
    total_perimeter: Optional[float] = None
    outside_total: Optional[float] = None
    inside_total: Optional[float] = None
    holes_quantity: Optional[int] = None
    holes_diameter: Optional[float] = None
    slots_quantity: Optional[int] = None
    slots_length: Optional[float] = None
    slots_width: Optional[float] = None
    total_area: Optional[float] = None
    geometry_for_time_calculation: Optional[float] = None
    est_cutting_speed: Optional[float] = None
    max_cutting_speed: Optional[float] = None
    cutting_time_method: Optional[str] = None
    cutting_time_minutes: Optional[float] = None
    charge_rate_per_min: Optional[float] = None
    suggested_charge_rate: Optional[float] = None
    hourly_rate: Optional[float] = None
    quantity_required: Optional[int] = None
    material_cost_per_part: Optional[float] = None
    fixed_cost_per_part: Optional[float] = None
    cutting_cost_per_part: Optional[float] = None
    programming_cost: Optional[float] = None
    setup_cost: Optional[float] = None
    laser_cleaning_cost: Optional[float] = None
    delivery_cost: Optional[float] = None
    other_costs: Optional[float] = None
    processes: Optional[List[dict]] = None
    total_process_cost: Optional[float] = None
    cost_per_part_no_gst: Optional[float] = None
    total_job_cost: Optional[float] = None
    cost_per_part_plus_gst: Optional[float] = None
    gst_value: Optional[float] = None
    quote_total: Optional[float] = None
    net_profit: Optional[float] = None
    gross_profit: Optional[float] = None
    profit_percent: Optional[float] = None
    break_even_value: Optional[float] = None
    press_brake_enabled: Optional[bool] = None
    press_brake_in_house: Optional[bool] = None
    press_brake_setup_time: Optional[float] = None
    press_brake_setup_cost: Optional[float] = None
    number_of_bends: Optional[int] = None
    time_per_bend: Optional[float] = None
    time_per_bend_unit: Optional[str] = None
    packing_time_per_part: Optional[float] = None
    packing_time_unit: Optional[str] = None
    press_brake_hourly_rate: Optional[float] = None
    press_brake_cost_per_part: Optional[float] = None
    press_brake_total_cost: Optional[float] = None
    bend_angles: Optional[str] = None
    tooling_required: Optional[str] = None
    quantity_breaks: Optional[List[dict]] = None
    drawing_url: Optional[str] = None  # URL/path to uploaded drawing file
    drawing_filename: Optional[str] = None  # Original filename of uploaded drawing
    sales_adjusted_cutting_time: Optional[float] = None
    sales_adjusted_quote_total: Optional[float] = None
    status: Optional[str] = None
    cutting_cost: Optional[float] = None
    setup_cost: Optional[float] = None
    delivery_cost: Optional[float] = None
    other_costs: Optional[float] = None
    total_job_cost: Optional[float] = None
    quote_total: Optional[float] = None
    net_profit: Optional[float] = None
    profit_percent: Optional[float] = None
    status: Optional[str] = None
    # Price Rounding Settings
    enable_rounding: Optional[bool] = None
    rounding_target: Optional[str] = None
    rounding_to: Optional[float] = None
    rounding_direction: Optional[str] = None
    manual_adjustment: Optional[float] = None
    original_total: Optional[float] = None
    price_per_part: Optional[float] = None
    # Quality Assurance Inspection Items
    qa_inspection_items: Optional[List[dict]] = None
    # Multi-item quote support
    is_multi_item: Optional[bool] = None
    line_items: Optional[List[dict]] = None
    # Quote Notes
    quote_notes: Optional[str] = None


# Job Sheet Models
class JobSheet(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_sheet_number: str  # e.g., "JS-001"
    quote_id: str  # Reference to the quote
    quote_number: str  # For display
    process_id: str  # Which process this job sheet is for
    process_name: str  # e.g., "Press Brake", "Laser Cutting"
    
    # Customer & Part Info
    customer_id: str
    customer_name: str
    part_description: str
    drawing_number: Optional[str] = None
    drawing_url: Optional[str] = None
    
    # Job Details (entered when creating job sheet)
    quantity: int  # Can be different from quote quantity
    purchase_order_number: Optional[str] = None
    due_date: Optional[datetime] = None
    
    # Process Details (from quote process)
    process_notes: Optional[str] = None  # From quote process notes
    setup_time: Optional[float] = None
    time_per_part: Optional[float] = None
    hourly_rate: Optional[float] = None
    
    # Press Brake specific (if applicable)
    material: Optional[str] = None
    thickness: Optional[str] = None
    # Full material specification from quote (for shop-floor cross-reference)
    material_type: Optional[str] = None
    grade: Optional[str] = None
    finish: Optional[str] = None
    number_of_bends: Optional[int] = None
    time_per_bend: Optional[float] = None
    packing_time: Optional[float] = None
    bend_length: Optional[float] = None
    vdie_size: Optional[float] = None
    tonnage: Optional[float] = None
    bend_angles: Optional[str] = None
    tooling_required: Optional[str] = None
    
    # Machine assignment (Press Brake)
    machine_id: Optional[str] = None
    machine_name: Optional[str] = None
    
    # Status tracking
    status: str = "Pending"  # Pending, In Progress, Completed, On Hold
    assigned_to: Optional[str] = None  # User/operator assigned
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    actual_time_taken: Optional[float] = None  # In minutes
    
    # NEW: Per-process time tracking (processes array)
    processes: List[dict] = []  # Each process has its own timing
    
    # NEW: Job efficiency metrics (calculated)
    estimated_hours: Optional[float] = None  # Total estimated from quote
    actual_hours: Optional[float] = None  # Total actual time taken
    hours_saved: Optional[float] = None  # Positive = saved, Negative = lost
    efficiency_percent: Optional[float] = None  # Percentage efficiency
    money_impact: Optional[float] = None  # $ saved (positive) or lost (negative)
    
    # Completion tracking
    operator_name: Optional[str] = None  # Operator who completed the job
    quantity_completed: Optional[int] = None  # Parts successfully completed
    quantity_rejected: Optional[int] = None  # Parts rejected
    reject_reason: Optional[str] = None  # Reason for rejection
    top_punch_used: Optional[str] = None  # Press Brake: top punch used (recorded on completion)
    v_die_used: Optional[str] = None  # Press Brake: V die used (recorded on completion)
    
    # Carried forward from the part's previous Press Brake run
    last_run_job_number: Optional[str] = None
    last_run_machine: Optional[str] = None
    last_used_top_punch: Optional[str] = None
    last_used_v_die: Optional[str] = None
    previous_production_notes: Optional[str] = None
    
    # Quality & Notes
    quality_check_passed: Optional[bool] = None
    quality_notes: Optional[str] = None
    production_notes: Optional[str] = None
    
    # Quality Assurance Inspection Settings
    inspection_interval: Optional[int] = None  # e.g., every 20 parts
    qa_inspection_items: List[dict] = []  # Copied from Quote Q.A. section
    
    # Metadata
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class JobSheetCreate(BaseModel):
    quote_id: str
    process_id: str  # Which process from the quote
    quantity: int
    purchase_order_number: Optional[str] = None
    due_date: Optional[datetime] = None
    # Multi-item quote support
    line_item_id: Optional[str] = None  # For multi-item quotes
    line_item_number: Optional[int] = None  # For display purposes
    part_description: Optional[str] = None  # Override part description for line items
    # Quality Assurance Inspection
    inspection_interval: Optional[int] = None  # e.g., every 20 parts
    # Machine assignment (Press Brake)
    machine_id: Optional[str] = None
    machine_name: Optional[str] = None

class JobSheetUpdate(BaseModel):
    quantity: Optional[int] = None
    purchase_order_number: Optional[str] = None
    due_date: Optional[datetime] = None
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    actual_time_taken: Optional[float] = None
    operator_name: Optional[str] = None
    quantity_completed: Optional[int] = None
    quantity_rejected: Optional[int] = None
    reject_reason: Optional[str] = None
    quality_check_passed: Optional[bool] = None
    quality_notes: Optional[str] = None
    production_notes: Optional[str] = None
    # Quality Assurance Inspection
    inspection_interval: Optional[int] = None
    qa_inspection_items: Optional[List[dict]] = None
    # Machine assignment (Press Brake)
    machine_id: Optional[str] = None
    machine_name: Optional[str] = None

class JobSheetComplete(BaseModel):
    """Model for completing a job sheet from shop floor"""
    operator_name: str
    quantity_completed: int
    quantity_rejected: int = 0
    reject_reason: Optional[str] = None
    start_time: Optional[datetime] = None  # When operator started
    end_time: datetime  # When operator finished
    production_notes: Optional[str] = None
    top_punch_used: Optional[str] = None  # Press Brake tooling
    v_die_used: Optional[str] = None  # Press Brake tooling



# ==================== PACKING SLIP MODELS ====================

class PackingSlipItem(BaseModel):
    """Individual item on a packing slip"""
    part_description: str
    material: Optional[str] = None
    thickness: Optional[str] = None
    qty_ordered: int
    qty_delivered: int
    qty_balance: int  # Remaining/Backorder

class PackingSlip(BaseModel):
    """Packing Slip for tracking partial/full deliveries"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    packing_slip_number: str  # PS-2025-0001
    
    # Link to Job Sheet
    job_sheet_id: str
    quote_id: str
    job_sheet_number: str
    
    # Multi-item quote support
    line_item_id: Optional[str] = None  # For multi-item quotes
    line_item_number: Optional[int] = None  # Line number in quote
    
    # Customer Information
    customer_id: Optional[str] = None  # Customer ID for lookups
    customer_name: str
    customer_address: Optional[str] = None
    customer_suburb: Optional[str] = None
    customer_state: Optional[str] = None
    customer_postcode: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_fax: Optional[str] = None
    customer_po_number: Optional[str] = None
    
    # Delivery Information
    delivery_address: Optional[str] = None
    delivery_suburb: Optional[str] = None
    delivery_state: Optional[str] = None
    delivery_postcode: Optional[str] = None
    delivery_phone: Optional[str] = None
    delivery_instructions: Optional[str] = None
    time_ready: Optional[str] = None  # e.g., "AM", "PM", specific time
    
    # Items
    items: List[PackingSlipItem] = []
    
    # Totals
    total_ordered: int
    total_delivered: int
    total_balance: int  # Backorder
    
    # Status
    status: str = "Pending"  # Pending, Shipped, Delivered, Invoiced
    
    # Dates
    created_at: datetime = Field(default_factory=datetime.utcnow)
    delivery_date: Optional[datetime] = None
    
    # Notes
    notes: Optional[str] = None
    
    # Tracking
    created_by: Optional[str] = None
    is_invoiced: bool = False  # True when invoice created from this packing slip

class PackingSlipCreate(BaseModel):
    """Create a packing slip from job sheet"""
    job_sheet_id: str
    
    # Items with quantities
    items: List[PackingSlipItem]
    
    # Customer PO
    customer_po_number: Optional[str] = None
    
    # Delivery details
    delivery_address: Optional[str] = None
    delivery_suburb: Optional[str] = None
    delivery_state: Optional[str] = None
    delivery_postcode: Optional[str] = None
    delivery_phone: Optional[str] = None
    delivery_instructions: Optional[str] = None
    time_ready: Optional[str] = None
    
    # Dates
    delivery_date: Optional[datetime] = None
    
    # Notes
    notes: Optional[str] = None

class PackingSlipUpdate(BaseModel):
    """Update packing slip details"""
    customer_po_number: Optional[str] = None
    delivery_address: Optional[str] = None
    delivery_suburb: Optional[str] = None
    delivery_state: Optional[str] = None
    delivery_postcode: Optional[str] = None
    delivery_phone: Optional[str] = None
    delivery_instructions: Optional[str] = None
    time_ready: Optional[str] = None
    delivery_date: Optional[datetime] = None
    status: Optional[str] = None
    notes: Optional[str] = None


# ===================================
# INVOICE MODELS
# ===================================

class InvoiceLineItem(BaseModel):
    """Individual line item on an invoice"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    packing_slip_id: str
    packing_slip_number: str
    part_description: str
    material_specification: Optional[str] = None  # e.g., "Mild Steel - 3mm - HA3 - P&O"
    quantity_delivered: int
    price_per_part_ex_gst: float
    line_total_ex_gst: float
    gst_amount: float
    line_total_inc_gst: float

class Invoice(BaseModel):
    """Invoice for customer - created from packing slips grouped by PO number"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_number: str  # e.g., "INV-001"
    
    # Customer Details
    customer_id: str
    customer_name: str
    customer_email: Optional[str] = None
    
    # Purchase Order
    purchase_order_number: Optional[str] = ""  # All line items must have same PO; empty allowed for jobs without PO
    
    # Dates
    invoice_date: datetime = Field(default_factory=lambda: datetime.now())
    due_date: Optional[datetime] = None
    payment_date: Optional[datetime] = None
    
    # Payment Terms
    payment_terms: Optional[str] = None  # e.g., "30 Days", "Cash", "Credit Card"
    
    # Line Items
    line_items: List[InvoiceLineItem] = Field(default_factory=list)
    
    # Totals
    subtotal_ex_gst: float = 0.0
    gst_total: float = 0.0
    total_inc_gst: float = 0.0
    
    # Payment Tracking
    status: str = "Draft"  # Draft, Sent, Paid, Partial, Overdue
    payment_received: float = 0.0
    balance_due: float = 0.0
    
    # Notes
    notes: Optional[str] = None
    internal_notes: Optional[str] = None
    
    # Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.now())
    created_by: str
    updated_at: datetime = Field(default_factory=lambda: datetime.now())
    sent_at: Optional[datetime] = None
    
class InvoiceCreate(BaseModel):
    """Create invoice from packing slips"""
    customer_id: str
    customer_name: str
    customer_email: Optional[str] = None
    purchase_order_number: Optional[str] = ""
    packing_slip_ids: List[str]  # List of packing slip IDs to include
    payment_terms: Optional[str] = None
    due_date: Optional[datetime] = None
    notes: Optional[str] = None
    internal_notes: Optional[str] = None

class InvoiceUpdate(BaseModel):
    """Update invoice details"""
    payment_terms: Optional[str] = None
    due_date: Optional[datetime] = None
    notes: Optional[str] = None
    internal_notes: Optional[str] = None
    status: Optional[str] = None
    line_items: Optional[List[InvoiceLineItem]] = None  # Allow updating line items with prices

class InvoicePayment(BaseModel):
    """Record payment for an invoice"""
    payment_amount: float
    payment_date: datetime
    payment_method: Optional[str] = None  # e.g., "Cash", "Credit Card", "Bank Transfer"
    payment_reference: Optional[str] = None


# ==================== EMPLOYEE MODELS ====================

class EmployeeCreate(BaseModel):
    """Model for creating a new employee"""
    # Personal Information
    first_name: str
    last_name: str
    date_of_birth: Optional[str] = None
    email: str
    phone: Optional[str] = None
    address: Optional[str] = None
    
    # Employment Details
    employee_number: Optional[str] = None  # Auto-generated if not provided
    role: str  # Job title: Press Brake Operator, Programmer, etc.
    department: str  # Production, Quality, Admin, Dispatch
    employment_type: str = "Full-time"  # Full-time, Part-time, Casual, Contractor
    start_date: str  # Employment start date
    status: str = "Active"  # Active, Terminated, On Leave
    
    # System Access
    system_access_role: str = "Employee"  # Administrator, Manager, Employee, Read-Only
    allowed_modules: List[str] = []  # List of module names they can access
    username: Optional[str] = None
    password: Optional[str] = None  # Will be hashed
    
    # Emergency Contact
    emergency_contact_name: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    
    # HR Information
    tfn: Optional[str] = None  # Tax File Number
    super_fund: Optional[str] = None
    bank_account: Optional[str] = None
    qualifications: Optional[List[str]] = []
    
    # Leave Balances (hours)
    annual_leave_balance: float = 0.0
    sick_leave_balance: float = 0.0
    
    # Profile
    profile_photo_url: Optional[str] = None
    notes: Optional[str] = None

class EmployeeUpdate(BaseModel):
    """Model for updating employee information"""
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    date_of_birth: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    employment_type: Optional[str] = None
    start_date: Optional[str] = None
    status: Optional[str] = None
    system_access_role: Optional[str] = None
    allowed_modules: Optional[List[str]] = None
    username: Optional[str] = None
    password: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    tfn: Optional[str] = None
    super_fund: Optional[str] = None
    bank_account: Optional[str] = None
    qualifications: Optional[List[str]] = None
    annual_leave_balance: Optional[float] = None
    sick_leave_balance: Optional[float] = None
    profile_photo_url: Optional[str] = None
    notes: Optional[str] = None

class Employee(BaseModel):
    """Complete employee record"""
    id: str
    employee_number: str
    first_name: str
    last_name: str
    date_of_birth: Optional[str] = None
    email: str
    phone: Optional[str] = None
    address: Optional[str] = None
    role: str
    department: str
    employment_type: str
    start_date: str
    status: str
    system_access_role: str
    allowed_modules: List[str]
    username: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    tfn: Optional[str] = None
    super_fund: Optional[str] = None
    bank_account: Optional[str] = None
    qualifications: Optional[List[str]] = []
    annual_leave_balance: float = 0.0
    sick_leave_balance: float = 0.0
    profile_photo_url: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

# Clock In/Out Models
class ClockEntry(BaseModel):
    """Clock in/out entry"""
    id: str
    employee_id: str
    employee_name: str
    date: str
    clock_in_time: Optional[str] = None
    clock_out_time: Optional[str] = None
    total_hours: Optional[float] = None
    break_duration: Optional[float] = None  # in minutes
    overtime_hours: Optional[float] = None
    status: str = "In Progress"  # In Progress, Completed, Approved
    notes: Optional[str] = None
    approved_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class ClockIn(BaseModel):
    """Model for clocking in"""
    employee_id: str

class ClockOut(BaseModel):
    """Model for clocking out"""
    employee_id: str
    break_duration: Optional[float] = None  # in minutes

# Leave Request Models
class LeaveRequestCreate(BaseModel):
    """Create a leave request"""
    employee_id: str
    leave_type: str  # Annual, Sick, Unpaid, RDO
    start_date: str
    end_date: str
    total_days: float
    reason: Optional[str] = None

class LeaveRequestUpdate(BaseModel):
    """Update leave request (for approval)"""
    status: str  # Pending, Approved, Rejected
    approved_by: Optional[str] = None
    approval_notes: Optional[str] = None

class LeaveRequest(BaseModel):
    """Leave request record"""
    id: str
    employee_id: str
    employee_name: str
    leave_type: str
    start_date: str
    end_date: str
    total_days: float
    reason: Optional[str] = None
    status: str = "Pending"
    approved_by: Optional[str] = None
    approval_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

# =====================================================
# COMPANY SETTINGS MODELS
# =====================================================

class CompanySettings(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    
    # Company Information
    company_name: str = "Your Company Name"
    company_abn: Optional[str] = None
    company_email: Optional[str] = None
    company_phone: Optional[str] = None
    company_website: Optional[str] = None
    company_logo_url: Optional[str] = None  # Path to uploaded logo
    company_tagline: Optional[str] = None
    
    # Company Address
    street_address: Optional[str] = None
    suburb: Optional[str] = None
    state: Optional[str] = "VIC"
    postcode: Optional[str] = None
    country: str = "Australia"
    
    # Regional Settings
    timezone: str = "Australia/Melbourne"  # AEST/AEDT
    currency: str = "AUD"
    currency_symbol: str = "$"
    date_format: str = "DD/MM/YYYY"  # Australian standard
    time_format: str = "24"  # 24-hour or 12-hour
    
    # Business Settings
    gst_rate: float = 10.0  # GST percentage (10% for Australia)
    default_payment_terms: str = "Net 30"
    quote_validity_days: int = 30
    default_markup_percentage: float = 0.0
    
    # Bank Details (for invoices)
    bank_name: Optional[str] = None
    bank_account_name: Optional[str] = None
    bank_bsb: Optional[str] = None
    bank_account_number: Optional[str] = None
    
    # Email Settings
    email_signature: Optional[str] = None
    email_footer: Optional[str] = None
    
    # Display Settings
    show_logo_on_quotes: bool = True
    show_logo_on_invoices: bool = True
    show_logo_on_job_sheets: bool = True
    
    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_by: Optional[str] = None

class CompanySettingsCreate(BaseModel):
    company_name: str
    company_abn: Optional[str] = None
    company_email: Optional[str] = None
    company_phone: Optional[str] = None
    company_website: Optional[str] = None
    company_logo_url: Optional[str] = None
    company_tagline: Optional[str] = None
    street_address: Optional[str] = None
    suburb: Optional[str] = None
    state: Optional[str] = "VIC"
    postcode: Optional[str] = None
    country: str = "Australia"
    timezone: str = "Australia/Melbourne"
    currency: str = "AUD"
    currency_symbol: str = "$"
    date_format: str = "DD/MM/YYYY"
    time_format: str = "24"
    gst_rate: float = 10.0
    default_payment_terms: str = "Net 30"
    quote_validity_days: int = 30
    default_markup_percentage: float = 0.0
    bank_name: Optional[str] = None
    bank_account_name: Optional[str] = None
    bank_bsb: Optional[str] = None
    bank_account_number: Optional[str] = None
    email_signature: Optional[str] = None
    email_footer: Optional[str] = None
    show_logo_on_quotes: bool = True
    show_logo_on_invoices: bool = True
    show_logo_on_job_sheets: bool = True

class CompanySettingsUpdate(BaseModel):
    company_name: Optional[str] = None
    company_abn: Optional[str] = None
    company_email: Optional[str] = None
    company_phone: Optional[str] = None
    company_website: Optional[str] = None
    company_logo_url: Optional[str] = None
    company_tagline: Optional[str] = None
    street_address: Optional[str] = None
    suburb: Optional[str] = None
    state: Optional[str] = None
    postcode: Optional[str] = None
    country: Optional[str] = None
    timezone: Optional[str] = None
    currency: Optional[str] = None
    currency_symbol: Optional[str] = None
    date_format: Optional[str] = None
    time_format: Optional[str] = None
    gst_rate: Optional[float] = None
    default_payment_terms: Optional[str] = None
    quote_validity_days: Optional[int] = None
    default_markup_percentage: Optional[float] = None
    bank_name: Optional[str] = None
    bank_account_name: Optional[str] = None
    bank_bsb: Optional[str] = None
    bank_account_number: Optional[str] = None
    email_signature: Optional[str] = None
    email_footer: Optional[str] = None
    show_logo_on_quotes: Optional[bool] = None
    show_logo_on_invoices: Optional[bool] = None
    show_logo_on_job_sheets: Optional[bool] = None



# Machine Models (for Job Scheduling)
class Machine(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    machine_name: str
    machine_number: Optional[str] = None
    machine_type: Optional[str] = None  # e.g., "Press Brake", "Laser Cutter", "CNC"
    tooling_system: Optional[str] = None  # e.g., "Wila", "Euro" (press brake tooling family)
    status: str = "Active"  # Active, Inactive, Maintenance
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MachineCreate(BaseModel):
    machine_name: str
    machine_number: Optional[str] = None
    machine_type: Optional[str] = None
    tooling_system: Optional[str] = None
    status: str = "Active"
    notes: Optional[str] = None

class MachineUpdate(BaseModel):
    machine_name: Optional[str] = None
    machine_number: Optional[str] = None
    machine_type: Optional[str] = None
    tooling_system: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

# Working Hours Models
class ShiftTime(BaseModel):
    shift_name: str  # "Morning", "Afternoon", "Night"
    start_time: str  # "08:00"
    end_time: str    # "16:00"
    break_times: List[dict] = []  # [{"name": "Lunch", "start": "12:00", "duration": 30}]

class DaySchedule(BaseModel):
    day_of_week: str  # "Monday", "Tuesday", etc.
    is_working_day: bool = True
    shifts: List[ShiftTime] = []

class WorkingHours(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    schedule_name: str  # e.g., "Standard Week", "Summer Hours"
    is_active: bool = True
    schedule: List[DaySchedule] = []  # One entry for each day
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class WorkingHoursCreate(BaseModel):
    schedule_name: str
    is_active: bool = True
    schedule: List[DaySchedule]

class WorkingHoursUpdate(BaseModel):
    schedule_name: Optional[str] = None
    is_active: Optional[bool] = None
    schedule: Optional[List[DaySchedule]] = None

# Audit Management Models
class AuditReport(BaseModel):
    id: str = Field(default_factory=lambda: str(datetime.now().timestamp()).replace('.', ''))
    report_number: str
    auditor_name: str
    report_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    report_type: str = "INTERNAL AUDIT REPORT – IMS (QUALITY / ENVIRONMENTAL / OHS)"
    client_name: str
    assessed_sites: str
    standards_audited: List[str] = ["ISO 9001:2015", "ISO 14001:2015", "ISO 45001:2018"]
    scope_of_audit: str
    exclusions: Optional[str] = None
    conclusion: Optional[str] = None
    overall_recommendation: Optional[str] = None
    audit_start_date: Optional[datetime] = None
    audit_end_date: Optional[datetime] = None
    locked: Optional[bool] = False
    locked_by: Optional[str] = None
    locked_at: Optional[str] = None
    reopened_by: Optional[str] = None
    reopen_reason: Optional[str] = None
    reopen_authorised_by: Optional[str] = None
    reopened_at: Optional[str] = None
    template_id: Optional[str] = None
    template_name: Optional[str] = None
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AuditReportCreate(BaseModel):
    report_number: str
    auditor_name: str
    client_name: str
    assessed_sites: str
    standards_audited: List[str] = ["ISO 9001:2015", "ISO 14001:2015", "ISO 45001:2018"]
    scope_of_audit: str
    exclusions: Optional[str] = None
    audit_start_date: Optional[datetime] = None
    audit_end_date: Optional[datetime] = None

class AuditReportUpdate(BaseModel):
    auditor_name: Optional[str] = None
    client_name: Optional[str] = None
    assessed_sites: Optional[str] = None
    standards_audited: Optional[List[str]] = None
    scope_of_audit: Optional[str] = None
    exclusions: Optional[str] = None
    conclusion: Optional[str] = None
    overall_recommendation: Optional[str] = None
    audit_start_date: Optional[datetime] = None
    audit_end_date: Optional[datetime] = None

class AuditFinding(BaseModel):
    id: str = Field(default_factory=lambda: str(datetime.now().timestamp()).replace('.', ''))
    report_id: str
    clause_number: str  # e.g., "1.0", "2.1", "2.20"
    clause_title: str   # e.g., "Management of Previous Audit Issues"
    iso_clause_reference: Optional[str] = None  # e.g., "ISO 9001:2015 7.5"
    evidence: Optional[str] = None
    findings: Optional[str] = None
    finding_type: str = "Conformity"  # Conformity, OFI, Minor NCR, Major NCR
    ofi_reference: Optional[str] = None  # e.g., "OFI 1"
    ncr_number: Optional[str] = None
    ncr_date: Optional[datetime] = None
    ncr_customer_supplier: Optional[str] = None
    ncr_root_cause: Optional[str] = None
    ncr_action_taken: Optional[str] = None
    is_follow_up_required: bool = False
    # ── IMS framework extensions (all optional — legacy findings unaffected) ──
    status: Optional[str] = None                # Not Started … Closed / Verified
    risk_rating: Optional[str] = None           # Low / Medium / High / Critical
    audit_prompt: Optional[str] = None
    evidence_requirements: Optional[str] = None
    clause_summary: Optional[str] = None
    audit_question: Optional[str] = None
    process_audited: Optional[str] = None
    department: Optional[str] = None
    site_location: Optional[str] = None
    auditor: Optional[str] = None
    auditee: Optional[str] = None
    audit_date: Optional[str] = None
    objective_evidence: Optional[str] = None
    records_checked: Optional[str] = None
    sample_records_checked: Optional[str] = None
    people_interviewed: Optional[str] = None
    area_inspected: Optional[str] = None
    documents_reviewed: Optional[str] = None
    evidence_adequate: Optional[bool] = None
    clause_breached: Optional[str] = None
    repeat_issue: Optional[bool] = None
    immediate_correction_required: Optional[bool] = None
    corrective_action_required: Optional[bool] = None
    ncr_required: Optional[bool] = None
    correction: Optional[str] = None
    corrective_action: Optional[str] = None
    responsible_person: Optional[str] = None
    due_date: Optional[str] = None
    completion_date: Optional[str] = None
    completion_evidence: Optional[str] = None
    effectiveness_verification_required: Optional[bool] = None
    effectiveness_verified_by: Optional[str] = None
    effectiveness_verification_date: Optional[str] = None
    final_status: Optional[str] = None
    mandatory: Optional[bool] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AuditFindingCreate(BaseModel):
    report_id: str
    clause_number: str
    clause_title: str
    iso_clause_reference: Optional[str] = None
    evidence: Optional[str] = None
    findings: Optional[str] = None
    finding_type: str = "Conformity"
    ofi_reference: Optional[str] = None
    ncr_number: Optional[str] = None
    ncr_date: Optional[datetime] = None
    ncr_customer_supplier: Optional[str] = None
    ncr_root_cause: Optional[str] = None
    ncr_action_taken: Optional[str] = None
    is_follow_up_required: bool = False

class AuditFindingUpdate(BaseModel):
    clause_number: Optional[str] = None
    clause_title: Optional[str] = None
    iso_clause_reference: Optional[str] = None
    evidence: Optional[str] = None
    findings: Optional[str] = None
    finding_type: Optional[str] = None
    ofi_reference: Optional[str] = None
    ncr_number: Optional[str] = None
    ncr_date: Optional[datetime] = None
    ncr_customer_supplier: Optional[str] = None
    ncr_root_cause: Optional[str] = None
    ncr_action_taken: Optional[str] = None
    is_follow_up_required: Optional[bool] = None
    # ── IMS framework extensions ──
    status: Optional[str] = None
    risk_rating: Optional[str] = None
    audit_prompt: Optional[str] = None
    evidence_requirements: Optional[str] = None
    clause_summary: Optional[str] = None
    audit_question: Optional[str] = None
    process_audited: Optional[str] = None
    department: Optional[str] = None
    site_location: Optional[str] = None
    auditor: Optional[str] = None
    auditee: Optional[str] = None
    audit_date: Optional[str] = None
    objective_evidence: Optional[str] = None
    records_checked: Optional[str] = None
    sample_records_checked: Optional[str] = None
    people_interviewed: Optional[str] = None
    area_inspected: Optional[str] = None
    documents_reviewed: Optional[str] = None
    evidence_adequate: Optional[bool] = None
    clause_breached: Optional[str] = None
    repeat_issue: Optional[bool] = None
    immediate_correction_required: Optional[bool] = None
    corrective_action_required: Optional[bool] = None
    ncr_required: Optional[bool] = None
    correction: Optional[str] = None
    corrective_action: Optional[str] = None
    responsible_person: Optional[str] = None
    due_date: Optional[str] = None
    completion_date: Optional[str] = None
    completion_evidence: Optional[str] = None
    effectiveness_verification_required: Optional[bool] = None
    effectiveness_verified_by: Optional[str] = None
    effectiveness_verification_date: Optional[str] = None
    final_status: Optional[str] = None

class FollowUpItem(BaseModel):
    id: str = Field(default_factory=lambda: str(datetime.now().timestamp()).replace('.', ''))
    report_id: str
    finding_id: Optional[str] = None
    description: str
    status: str = "Open"  # Open, Closed, In Progress
    due_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FollowUpItemCreate(BaseModel):
    report_id: str
    finding_id: Optional[str] = None
    description: str
    status: str = "Open"
    due_date: Optional[datetime] = None

class FollowUpItemUpdate(BaseModel):
    description: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[datetime] = None

# Job Schedule Models
class JobSchedule(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_sheet_id: str
    job_sheet_number: str
    machine_id: str
    machine_name: str
    scheduled_start: datetime
    scheduled_end: datetime
    estimated_duration_minutes: float
    status: str = "Scheduled"  # Scheduled, In Progress, Completed, Cancelled
    job_status: Optional[str] = None  # Actual job sheet status (from job_sheets table)
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class JobScheduleCreate(BaseModel):
    job_sheet_id: str
    machine_id: str
    scheduled_start: str  # ISO format
    notes: Optional[str] = None

class JobScheduleUpdate(BaseModel):
    machine_id: Optional[str] = None
    scheduled_start: Optional[str] = None
    scheduled_end: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None



# Calibration Management Models
class Instrument(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    instrument_name: str
    ident_no: str  # Identification number
    operator_name: Optional[str] = None
    location: Optional[str] = None
    calibration_frequency: int = 12  # months
    required_accuracy: Optional[str] = None  # e.g., "+/- 0.05"
    last_calibration_date: Optional[datetime] = None
    next_calibration_due: Optional[datetime] = None
    status: str = "Current"  # Current, Due Soon, Overdue
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class InstrumentCreate(BaseModel):
    instrument_name: str
    ident_no: str
    operator_name: Optional[str] = None
    location: Optional[str] = None
    calibration_frequency: int = 12
    required_accuracy: Optional[str] = None
    notes: Optional[str] = None

class InstrumentUpdate(BaseModel):
    instrument_name: Optional[str] = None
    ident_no: Optional[str] = None
    operator_name: Optional[str] = None
    location: Optional[str] = None
    calibration_frequency: Optional[int] = None
    required_accuracy: Optional[str] = None
    notes: Optional[str] = None

class CalibrationMeasurement(BaseModel):
    ref_size: float  # Reference instrument size (e.g., 25.00)
    measured_size: Optional[float] = None  # Actual measured size
    deviation: Optional[float] = None  # Calculated: measured - ref

class CalibrationRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    record_number: str  # CAL-2025-001
    instrument_id: str
    instrument_name: str
    instrument_serial: str
    operator_name: Optional[str] = None
    calibration_date: datetime
    next_due_date: datetime
    required_accuracy: Optional[str] = None
    
    # Reference Instrument
    ref_instrument_name: Optional[str] = None
    ref_instrument_serial: Optional[str] = None
    ref_valid_until: Optional[datetime] = None
    ref_accuracy: Optional[str] = None
    
    # Measurements
    measurements: List[CalibrationMeasurement] = []
    
    # Result
    result: str = "Pending"  # Pass, Fail, Pending
    performed_by: Optional[str] = None
    temperature: Optional[float] = None  # Temperature in °C
    humidity: Optional[float] = None  # Humidity in %
    comments: Optional[str] = None
    
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CalibrationRecordCreate(BaseModel):
    instrument_id: str
    calibration_date: str  # ISO format
    next_calibration_due: Optional[str] = None  # ISO format
    ref_instrument_name: Optional[str] = None
    ref_instrument_serial: Optional[str] = None
    ref_valid_until: Optional[str] = None
    ref_accuracy: Optional[str] = None
    measurements: List[CalibrationMeasurement] = []
    result: str = "Pass"
    performed_by: Optional[str] = None
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    comments: Optional[str] = None

class CalibrationRecordUpdate(BaseModel):
    calibration_date: Optional[str] = None
    ref_instrument_name: Optional[str] = None
    ref_instrument_serial: Optional[str] = None
    ref_valid_until: Optional[str] = None
    ref_accuracy: Optional[str] = None
    measurements: Optional[List[CalibrationMeasurement]] = None
    result: Optional[str] = None
    performed_by: Optional[str] = None
    comments: Optional[str] = None



# Environmental Monitoring Models (ISO/IMS)
class EnvironmentalData(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    data_type: str  # "electricity" or "recycled_metal"
    year: int
    
    # For Electricity: 3 metrics (dollars, emissions, kwh)
    # For Recycled Metal: 1 metric (tonnes)
    january: Optional[float] = 0
    february: Optional[float] = 0
    march: Optional[float] = 0
    april: Optional[float] = 0
    may: Optional[float] = 0
    june: Optional[float] = 0
    july: Optional[float] = 0
    august: Optional[float] = 0
    september: Optional[float] = 0
    october: Optional[float] = 0
    november: Optional[float] = 0
    december: Optional[float] = 0
    total: Optional[float] = 0  # Sum of all months
    
    # Metric type for electricity (dollars, emissions, kwh)
    metric_type: Optional[str] = None  # "dollars", "emissions", "kwh", or None for recycled_metal
    
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class EnvironmentalDataCreate(BaseModel):
    data_type: str  # "electricity" or "recycled_metal"
    year: int
    january: Optional[float] = 0
    february: Optional[float] = 0
    march: Optional[float] = 0
    april: Optional[float] = 0
    may: Optional[float] = 0
    june: Optional[float] = 0
    july: Optional[float] = 0
    august: Optional[float] = 0
    september: Optional[float] = 0
    october: Optional[float] = 0
    november: Optional[float] = 0
    december: Optional[float] = 0
    metric_type: Optional[str] = None  # "dollars", "emissions", "kwh"

class EnvironmentalDataUpdate(BaseModel):
    january: Optional[float] = None
    february: Optional[float] = None
    march: Optional[float] = None
    april: Optional[float] = None
    may: Optional[float] = None
    june: Optional[float] = None
    july: Optional[float] = None
    august: Optional[float] = None
    september: Optional[float] = None
    october: Optional[float] = None
    november: Optional[float] = None
    december: Optional[float] = None


# ==================== Shop Floor Time Entry Models ====================

class TimeEntryNote(BaseModel):
    """Notes captured during time entry"""
    category: str  # "tooling", "quality_issues", "material_issues", "machine_problems", "setup_notes", "general"
    note: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class TimeEntryPause(BaseModel):
    """Track pause periods"""
    pause_start: str
    pause_end: Optional[str] = None
    reason: Optional[str] = None

class TimeEntry(BaseModel):
    """Shop floor time tracking for job sheets"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    
    # Job and Process Information
    job_sheet_id: str
    job_sheet_number: str
    process_id: Optional[str] = None
    process_name: str  # "Laser Cutting", "Press Brake", etc.
    
    # Operator Information
    operator_id: str
    operator_name: str
    
    # Time Tracking
    start_time: str
    end_time: Optional[str] = None
    pauses: List[TimeEntryPause] = []
    
    # Status
    status: str = "active"  # "active", "paused", "completed"
    
    # Notes by Category
    notes: List[TimeEntryNote] = []
    
    # Calculated Fields
    actual_duration_minutes: Optional[float] = None  # Excluding pause time
    total_pause_minutes: Optional[float] = 0
    
    # Metadata
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class TimeEntryCreate(BaseModel):
    """Create a new time entry"""
    job_sheet_id: str
    job_sheet_number: str
    process_id: Optional[str] = None
    process_name: str
    operator_id: str
    operator_name: str

class TimeEntryUpdate(BaseModel):
    """Update time entry"""
    end_time: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[List[TimeEntryNote]] = None
    actual_duration_minutes: Optional[float] = None
    total_pause_minutes: Optional[float] = None

class TimeEntryPauseRequest(BaseModel):
    """Request to pause a time entry"""
    reason: Optional[str] = None

class TimeEntryNoteRequest(BaseModel):
    """Add a note to time entry"""
    category: str  # "tooling", "quality_issues", "material_issues", "machine_problems", "setup_notes", "general"
    note: str


# ==================== JSA (Job Safety Analysis) Models ====================

class JSAHazardRow(BaseModel):
    """Individual hazard/task row in JSA"""
    activity: str  # Task being analyzed
    hazards: str  # Potential hazards identified
    risk_control_measures: str  # How to eliminate/minimize risk
    who_is_responsible: str  # Person/role responsible
    risk_consequence: int = Field(ge=1, le=5)  # 1=Negligible, 5=Catastrophic
    risk_likelihood: str = Field(pattern="^[A-E]$")  # A=Frequent, E=Rare
    risk_level: str  # Calculated: e.g., "Medium-4", "High Risk"

class JSAHazardRowCreate(BaseModel):
    activity: str
    hazards: str
    risk_control_measures: str
    who_is_responsible: str
    risk_consequence: int = Field(ge=1, le=5)
    risk_likelihood: str = Field(pattern="^[A-E]$")

class JSA(BaseModel):
    """Job Safety Analysis"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    jsa_number: str  # JSA-001, JSA-002, etc. (auto-generated)
    
    # Header Information
    company_name: str = "Ultimate Laser Pty Ltd"
    date_created: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    works_location: str  # e.g., "Maintenance"
    
    # Activity/Process Description
    machine_process: str  # e.g., "Welding Materials (gas metal welder)"
    activity_description: str  # Detailed description of the task
    
    # Approval
    approved_by: Optional[str] = None  # Username of approver
    approved_by_name: Optional[str] = None  # Full name
    approved_date: Optional[datetime] = None
    approval_status: str = "Draft"  # Draft, Approved, Rejected
    
    # Hazard Analysis Table
    hazard_rows: List[JSAHazardRow] = []
    
    # Review Tracking
    last_reviewed_date: Optional[datetime] = None
    next_review_date: Optional[datetime] = None  # Auto-calculated: last_reviewed + 12 months
    review_history: List[dict] = []  # [{reviewed_by, reviewed_date, notes}]
    
    # Attachments (future)
    attachments: List[dict] = []  # [{filename, file_url, uploaded_date}]
    
    # Metadata
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class JSACreate(BaseModel):
    """Create new JSA"""
    works_location: str
    machine_process: str
    activity_description: str
    hazard_rows: List[JSAHazardRowCreate]

class JSAUpdate(BaseModel):
    """Update existing JSA"""
    works_location: Optional[str] = None
    machine_process: Optional[str] = None
    activity_description: Optional[str] = None
    hazard_rows: Optional[List[JSAHazardRowCreate]] = None
    approval_status: Optional[str] = None

class JSAReviewRequest(BaseModel):
    """Mark JSA as reviewed"""
    notes: Optional[str] = None

