/**
 * Central menu registry — the single source of truth for sidebar modules.
 *
 * IMPORTANT RULE: the module `id` (internal key), `path` (route) and any database
 * references are STABLE and must never change. Admins may rename the display
 * label, reorder and hide modules via Settings → Menu Configuration; this never
 * affects routes, permissions or saved data.
 */
import {
  FileText, Users, Truck, Package, UserCog, ShieldCheck, LayoutDashboard, Receipt,
  ClipboardList, ShoppingCart, PackageCheck, AlertTriangle, Settings as SettingsIcon,
  Calendar, Clock, TrendingUp, Activity, Database, Scale, Star, Leaf, FlaskConical,
  Siren, GraduationCap, FolderArchive, FileBadge2, Smile, HeartPulse, HardHat,
  ClipboardCheck, BarChart3, CalendarCheck, AlertOctagon, HeartHandshake, Wrench,
  AlertCircle, CalendarOff, BookOpen, Target, ListTree
} from 'lucide-react';

// id → { label (default display name), path, icon, help, flags }
export const MODULES = {
  dashboard: { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, alwaysShow: true, help: 'Main system dashboard with company-wide KPIs.' },
  // IMS
  ims_manual: { label: 'IMS Manual', path: '/ims/manual', icon: BookOpen, alwaysShow: true, pinFirst: true, help: 'Live, editable Quality/Environmental/OHS manual with revision history, approvals, clause mapping and PDF export.' },
  audit_dashboard: { label: 'IMS Dashboard', path: '/quality/audit-dashboard', icon: ShieldCheck, alwaysShow: true, help: 'Audit coverage, open/overdue findings, corrective action closure, transition progress and asset compliance.' },
  standards_library: { label: 'Standards Library', path: '/quality/standards-library', icon: FileBadge2, alwaysShow: true, help: 'Admin-editable standards, clauses, 2015→2026 mappings, help content and transition readiness.' },
  legal_requirements: { label: 'Legal Requirements', path: '/quality/legal-requirements', icon: Scale, alwaysShow: true, help: 'Legal & compliance obligations across quality, safety, environment, employment and plant.' },
  quality_audits: { label: 'Internal System Audits', path: '/quality/audits', icon: ShieldCheck, alwaysShow: true, help: 'Internal audits against ISO 9001, ISO 14001, ISO 45001 and IMS requirements.' },
  audit_schedule: { label: 'Audit Schedule', path: '/quality/audit-schedule', icon: CalendarCheck, alwaysShow: true, help: 'Annual audit programme and schedule.' },
  audit_templates: { label: 'Audit Templates', path: '/quality/audit-templates', icon: ClipboardList, alwaysShow: true, help: 'Create audits from pre-built IMS framework templates.' },
  management_review: { label: 'Management Review', path: '/quality/management-review', icon: ClipboardList, alwaysShow: true, help: 'Management review meetings, inputs, outputs and actions.' },
  document_control: { label: 'Document Control', path: '/quality/document-control', icon: FolderArchive, alwaysShow: true, help: 'Controlled documents register — form numbers, issues, revision dates used on print footers.' },
  policies: { label: 'Policies', path: '/quality/policies', icon: FileText, alwaysShow: true, help: 'Write and print controlled company policies with a Word-style editor (Calibri, logo header, policy footer).' },
  forms_library: { label: 'Forms', path: '/quality/forms', icon: FileBadge2, alwaysShow: true, help: 'Controlled forms library.' },
  risk_opportunities: { label: 'Risk & Opportunities', path: '/ims/risk-opportunities', icon: Target, alwaysShow: true, help: 'Risk & opportunity register (ISO clause 6.1).' },
  ncr_register: { label: 'NCR Register', path: '/quality/ncr', icon: AlertOctagon, alwaysShow: true, help: 'Nonconformance reports, root cause and corrective actions.' },
  supplier_reviews: { label: 'Supplier Reviews', path: '/quality/supplier-reviews', icon: Star, alwaysShow: true, help: 'Top 10 supplier performance reviews with NCR-rate grading and C/D escalation.' },
  customer_satisfaction: { label: 'Customer Satisfaction', path: '/quality/customer-satisfaction', icon: Smile, alwaysShow: true, help: 'Customer satisfaction surveys and analysis (ISO 9.1.2).' },
  // Sales
  quotes: { label: 'Quoting', path: '/quotes', icon: FileText, help: 'Customer quotes and estimating.' },
  part_history: { label: 'Part History', path: '/part-history', icon: Clock, alwaysShow: true, help: 'Historical part pricing and quoting history.' },
  invoices: { label: 'Invoices', path: '/invoices', icon: Receipt, help: 'Customer invoicing.' },
  customers: { label: 'Customers', path: '/customers', icon: Users, help: 'Customer register.' },
  suppliers: { label: 'Suppliers', path: '/suppliers', icon: Truck, help: 'Approved supplier register.' },
  purchase_orders: { label: 'Purchase Orders', path: '/purchase-orders', icon: ShoppingCart, help: 'Purchasing and supplier orders.' },
  rfqs: { label: 'Material RFQs', path: '/rfqs', icon: ClipboardList, alwaysShow: true, help: 'Send material pricing enquiries to suppliers via a public link — suppliers enter prices and alternative sizes online.' },
  // Production
  job_sheets: { label: 'Job Sheets', path: '/jobsheets', icon: ClipboardList, help: 'Production job sheets.' },
  shop_floor: { label: 'Shop Floor Entry', path: '/shop-floor', icon: Clock, alwaysShow: true, help: 'Shop floor time and job entry.' },
  production_dashboard: { label: 'Production Dashboard', path: '/production-dashboard', icon: Activity, alwaysShow: true, help: 'Live production status.' },
  overdue_jobs: { label: 'Overdue Jobs', path: '/overdue-jobs', icon: AlertTriangle, help: 'Jobs past due date.' },
  scheduling: { label: 'Job Scheduling', path: '/scheduling', icon: Calendar, help: 'Production scheduling.' },
  time_clock: { label: 'Time Clock', path: '/time-clock', icon: Clock, help: 'Employee time clock.' },
  efficiency: { label: 'Efficiency Reports', path: '/efficiency-reports', icon: TrendingUp, alwaysShow: true, help: 'Machine and labour efficiency.' },
  packing_slips: { label: 'Packing Slips', path: '/packing-slips', icon: PackageCheck, help: 'Dispatch packing slips.' },
  inventory: { label: 'Inventory', path: '/inventory', icon: Package, help: 'Material and stock inventory.' },
  // Safety
  jsa: { label: 'JSA Register', path: '/quality/jsa', icon: AlertTriangle, alwaysShow: true, help: 'Job Safety Analysis register.' },
  plant_hazard_checks: { label: 'Plant Hazard Checks', path: '/safety/plant-hazard-checks', icon: Wrench, alwaysShow: true, help: 'Plant hazard checklists / machine risk assessments, incl. decommissioned machines.' },
  near_miss: { label: 'Near Miss / Hazard', path: '/safety/near-miss', icon: AlertCircle, alwaysShow: true, help: 'Near miss and hazard reporting.' },
  injury_register: { label: 'Injury Register', path: '/safety/injury-register', icon: HeartPulse, alwaysShow: true, help: 'Workplace injury register.' },
  injury_graph: { label: 'Injury Graph (LTI/MTI)', path: '/safety/injury-graph', icon: BarChart3, alwaysShow: true, help: 'Lost time / medical treatment injury trends.' },
  ohs_meetings: { label: 'OHS Meetings', path: '/safety/ohs-meetings', icon: HardHat, alwaysShow: true, help: 'OHS committee and toolbox meetings.' },
  training_appraisals: { label: 'Training Appraisals', path: '/safety/training-appraisals', icon: BookOpen, alwaysShow: true, help: 'Employee training appraisals.' },
  training_matrix: { label: 'Training Matrix', path: '/safety/training-matrix', icon: GraduationCap, alwaysShow: true, help: 'Skills and competency matrix.' },
  forklift_register: { label: 'Forklift Licences', path: '/safety/forklift-register', icon: Truck, alwaysShow: true, help: 'Forklift licences and expiry tracking.' },
  first_aid_register: { label: 'First Aid Register', path: '/safety/first-aid-register', icon: HeartHandshake, alwaysShow: true, help: 'First aid officers and kits.' },
  evacuation_drills: { label: 'Evacuation Drills', path: '/quality/evacuation', icon: Siren, alwaysShow: true, help: 'Evacuation drill records.' },
  housekeeping_audits: { label: 'Housekeeping Audits', path: '/safety/housekeeping-audits', icon: ClipboardCheck, alwaysShow: true, help: 'Workplace housekeeping inspections.' },
  // Environment
  environmental_risk: { label: 'Environmental Risk', path: '/quality/environmental-risk', icon: Leaf, alwaysShow: true, help: 'Environmental aspects and risk assessments.' },
  electricity: { label: 'Electricity Usage', path: '/quality/electricity', icon: Activity, alwaysShow: true, help: 'Electricity consumption and emissions tracking.' },
  recycled_metal: { label: 'Recycled Metal', path: '/quality/recycled-metal', icon: Package, alwaysShow: true, help: 'Scrap and recycling records.' },
  msds_register: { label: 'SDS Register', path: '/quality/msds', icon: FlaskConical, alwaysShow: true, help: 'Safety Data Sheets for chemicals on site (current SDS terminology).' },
  // Equipment
  calibration: { label: 'Calibration', path: '/quality/calibration', icon: SettingsIcon, alwaysShow: true, help: 'Measuring equipment calibration schedule and records.' },
  asset_registers: { label: 'Asset Registers', path: '/quality/asset-registers', icon: ClipboardCheck, alwaysShow: true, help: 'Fire equipment, test & tag, first aid and spill kit registers with due-date tracking.' },
  // Operations
  courier_kpi: { label: 'Courier KPI', path: '/operations/courier-kpi', icon: Truck, alwaysShow: true, help: 'Courier on-time delivery KPIs (3hr / 4hr).' },
  // HR
  employees: { label: 'Employees', path: '/employees', icon: UserCog, help: 'Employee register.' },
  clock_in_out: { label: 'Clock In/Out', path: '/clock-in-out', icon: ClipboardList, help: 'Clock in/out records.' },
  leave_of_absence: { label: 'Leave of Absence', path: '/hr/leave-of-absence', icon: CalendarOff, alwaysShow: true, help: 'Leave of absence applications.' },
  leave_management: { label: 'Leave Management', path: '/leave-management', icon: FileText, help: 'Leave balances and approvals.' },
  // Shortcuts (point to the SAME module & data — never duplicated registers)
  sc_training_matrix: { label: 'Training Matrix ↗', path: '/safety/training-matrix', icon: GraduationCap, alwaysShow: true, shortcut: true, moduleId: 'training_matrix', help: 'Shortcut to the Training Matrix under Safety — same register, no duplicate data.' },
  sc_training_appraisals: { label: 'Training Appraisals ↗', path: '/safety/training-appraisals', icon: BookOpen, alwaysShow: true, shortcut: true, moduleId: 'training_appraisals', help: 'Shortcut to Training Appraisals under Safety — same register, no duplicate data.' },
  // System
  settings: { label: 'Settings', path: '/settings', icon: SettingsIcon, requiresAdmin: true, alwaysShow: true, help: 'Company settings.' },
  menu_config: { label: 'Menu Configuration', path: '/settings/menu', icon: ListTree, requiresAdmin: true, alwaysShow: true, help: 'Reorder, rename and hide sidebar sections and modules (admin only).' },
  user_management: { label: 'User Management', path: '/settings/users', icon: SettingsIcon, requiresAdmin: true, alwaysShow: true, help: 'Users, roles and module access.' },
  data_migration: { label: 'Data Migration', path: '/data-migration', icon: Database, requiresAdmin: true, alwaysShow: true, help: 'Data import/export tools.' },
};

// Default IMS menu structure (section id + default label + ordered module ids)
export const DEFAULT_SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', standalone: true, items: ['dashboard'] },
  { id: 'ims', label: 'IMS', items: [
    'ims_manual', 'audit_dashboard', 'standards_library', 'legal_requirements', 'quality_audits',
    'audit_schedule', 'audit_templates', 'management_review', 'document_control',
    'policies', 'forms_library', 'risk_opportunities', 'ncr_register', 'supplier_reviews',
    'customer_satisfaction'] },
  { id: 'sales', label: 'SALES', items: ['quotes', 'part_history', 'invoices', 'customers', 'suppliers', 'purchase_orders', 'rfqs'] },
  { id: 'production', label: 'PRODUCTION', items: ['job_sheets', 'shop_floor', 'production_dashboard', 'overdue_jobs', 'scheduling', 'time_clock', 'efficiency', 'packing_slips', 'inventory'] },
  { id: 'safety', label: 'SAFETY', items: [
    'jsa', 'plant_hazard_checks', 'near_miss', 'injury_register', 'injury_graph',
    'ohs_meetings', 'training_appraisals', 'training_matrix', 'forklift_register',
    'first_aid_register', 'evacuation_drills', 'housekeeping_audits'] },
  { id: 'environment', label: 'ENVIRONMENT', items: ['environmental_risk', 'electricity', 'recycled_metal', 'msds_register'] },
  { id: 'equipment', label: 'EQUIPMENT', items: ['calibration', 'asset_registers'] },
  { id: 'operations', label: 'OPERATIONS', items: ['courier_kpi'] },
  { id: 'hr', label: 'HR', items: ['employees', 'clock_in_out', 'leave_of_absence', 'leave_management', 'sc_training_matrix', 'sc_training_appraisals'] },
  { id: 'system', label: 'SYSTEM', items: ['settings', 'menu_config', 'user_management', 'data_migration'] },
];

/**
 * Merge a saved config ({sections:[{id,label,hidden,items:[{id,label,hidden}]}]})
 * with the defaults. Stable ids resolve paths/icons/permissions; unknown ids are
 * dropped; new modules not present in the saved config are appended to their
 * default section, so future modules appear without breaking saved layouts.
 */
export function mergeMenu(saved) {
  const defaults = DEFAULT_SECTIONS;
  if (!saved || !Array.isArray(saved.sections) || saved.sections.length === 0) {
    return defaults.map((s) => ({
      ...s,
      items: s.items.map((id) => ({ id, label: MODULES[id].label, hidden: false })),
    }));
  }
  const defaultSectionOf = {};
  defaults.forEach((s) => s.items.forEach((id) => { defaultSectionOf[id] = s.id; }));
  const seen = new Set();
  const out = [];
  for (const sec of saved.sections) {
    const def = defaults.find((d) => d.id === sec.id);
    if (!def) continue; // unknown section id
    const items = (sec.items || [])
      .filter((it) => MODULES[it.id])
      .map((it) => { seen.add(it.id); return { id: it.id, label: it.label || MODULES[it.id].label, hidden: !!it.hidden }; });
    out.push({ id: def.id, label: sec.label || def.label, standalone: def.standalone, hidden: !!sec.hidden, items });
  }
  // Append default sections missing from the saved config
  for (const def of defaults) {
    if (!out.find((s) => s.id === def.id)) {
      out.push({ ...def, items: def.items.map((id) => { seen.add(id); return { id, label: MODULES[id].label, hidden: false }; }) });
    }
  }
  // Append new modules that appeared since the config was saved
  for (const [id, mod] of Object.entries(MODULES)) {
    if (!seen.has(id)) {
      const target = out.find((s) => s.id === defaultSectionOf[id]);
      if (target) {
        const entry = { id, label: mod.label, hidden: false };
        if (mod.pinFirst) target.items.unshift(entry); else target.items.push(entry);
      }
    }
  }
  return out;
}
