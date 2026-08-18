import React from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { Toaster } from "./components/ui/toaster";
import { Toaster as SonnerToaster } from "./components/ui/sonner";
import Login from "./components/auth/Login";
import DashboardLayout from "./components/layout/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Quotes from "./pages/Quotes";
import QuoteDetail from "./pages/QuoteDetail";
import CustomersEnhanced from "./pages/CustomersEnhanced";
import Suppliers from "./pages/Suppliers";
import SupplierDashboard from "./pages/SupplierDashboard";
import Inventory from "./pages/Inventory";
import Invoices from "./pages/Invoices";
import PurchaseOrders from "./pages/PurchaseOrders";
import Employees from "./pages/Employees";
import ClockInOut from "./pages/ClockInOut";
import LeaveManagement from "./pages/LeaveManagement";
import JobSheets from "./pages/JobSheets";
import PackingSlips from "./pages/PackingSlips";
import OverdueJobs from "./pages/OverdueJobs";
import Settings from "./pages/Settings";
import Scheduling from "./pages/Scheduling";
import Machines from "./pages/Machines";
import WorkingHours from "./pages/WorkingHours";
import GanttScheduler from "./pages/GanttScheduler";
import TimeClock from "./pages/TimeClock";
import EfficiencyReports from "./pages/EfficiencyReports";
import ISOAudits from "./pages/ISOAudits";
import AuditReportDetail from "./pages/AuditReportDetail";
import CalibrationSchedule from "./pages/CalibrationSchedule";
import CalibrationRecord from "./pages/CalibrationRecord";
import PrintCalibrationRecord from "./pages/PrintCalibrationRecord";
import ElectricityUsage from "./pages/ElectricityUsage";
import RecycledMetal from "./pages/RecycledMetal";
import LegalRequirements from "./pages/LegalRequirements";
import SupplierReviews from "./pages/SupplierReviews";
import EnvironmentalRiskAssessment from "./pages/EnvironmentalRiskAssessment";
import MSDSRegister from "./pages/MSDSRegister";
import EvacuationDrills from "./pages/EvacuationDrills";
import TrainingMatrix from "./pages/TrainingMatrix";
import DocumentControl from "./pages/DocumentControl";
import CustomerSatisfaction from "./pages/CustomerSatisfaction";
import CustomerSatisfactionPublicSurvey from "./pages/CustomerSatisfactionPublicSurvey";
import FormsLibrary from "./pages/FormsLibrary";
import EmploymentApplicationForm from "./pages/EmploymentApplicationForm";
import EmploymentApplicationSubmissions from "./pages/EmploymentApplicationSubmissions";
import InjuryRegister from "./pages/InjuryRegister";
import InjuryRegisterForm from "./pages/InjuryRegisterForm";
import InjuryGraph from "./pages/InjuryGraph";
import CourierKPI from "./pages/CourierKPI";
import AuditSchedule from "./pages/AuditSchedule";
import StandardsLibrary from "./pages/StandardsLibrary";
import AuditTemplates from "./pages/AuditTemplates";
import AssetRegisters from "./pages/AssetRegisters";
import AuditDashboard from "./pages/AuditDashboard";
import IMSManual from "./pages/IMSManual";
import Policies from "./pages/Policies";
import RFQs from "./pages/RFQs";
import PublicRFQ from "./pages/PublicRFQ";
import MenuConfig from "./pages/MenuConfig";
import NCRRegister from "./pages/NCRRegister";
import NCRForm from "./pages/NCRForm";
import CreditRequestsLog from "./pages/CreditRequestsLog";
import ForkliftRegister from "./pages/ForkliftRegister";
import FirstAidRegister from "./pages/FirstAidRegister";
import ManagementReview from "./pages/ManagementReview";
import ManagementReviewForm from "./pages/ManagementReviewForm";
import OHSMeetings from "./pages/OHSMeetings";
import OHSMeetingForm from "./pages/OHSMeetingForm";
import { HousekeepingAudits, HousekeepingAuditForm } from "./pages/HousekeepingAudits";
import ShopFloorEntry from "./pages/ShopFloorEntry";
import ProductionDashboard from "./pages/ProductionDashboard";
import DataMigration from "./pages/DataMigration";
import JSARegister from "./pages/JSARegister";
import JSAForm from "./pages/JSAForm";
import JSADetail from "./pages/JSADetail";
import PartHistory from "./pages/PartHistory";
import PlantHazardChecks from "./pages/PlantHazardChecks";
import NearMissRegister from "./pages/NearMissRegister";
import TrainingAppraisal from "./pages/TrainingAppraisal";
import LeaveOfAbsence from "./pages/LeaveOfAbsence";
import RiskOpportunities from "./pages/RiskOpportunities";
import UserManagement from "./pages/UserManagement";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          
          <Route path="/dashboard" element={<DashboardLayout><Dashboard /></DashboardLayout>} />
          <Route path="/quotes" element={<DashboardLayout><Quotes /></DashboardLayout>} />
          <Route path="/quotes/:id" element={<DashboardLayout><QuoteDetail /></DashboardLayout>} />
          <Route path="/part-history" element={<DashboardLayout><PartHistory /></DashboardLayout>} />
          <Route path="/customers" element={<DashboardLayout><CustomersEnhanced /></DashboardLayout>} />
          <Route path="/suppliers" element={<DashboardLayout><Suppliers /></DashboardLayout>} />
          <Route path="/supplier-dashboard" element={<DashboardLayout><SupplierDashboard /></DashboardLayout>} />
          
          {/* Inventory Module */}
          <Route path="/inventory" element={<DashboardLayout><Inventory /></DashboardLayout>} />
          <Route path="/purchase-orders" element={<DashboardLayout><PurchaseOrders /></DashboardLayout>} />
          <Route path="/invoices" element={<DashboardLayout><Invoices /></DashboardLayout>} />
          <Route path="/jobsheets" element={<DashboardLayout><JobSheets /></DashboardLayout>} />
          <Route path="/job-sheets" element={<DashboardLayout><JobSheets /></DashboardLayout>} />
          <Route path="/overdue-jobs" element={<DashboardLayout><OverdueJobs /></DashboardLayout>} />
          <Route path="/scheduling" element={<DashboardLayout><Scheduling /></DashboardLayout>} />
          <Route path="/machines" element={<DashboardLayout><Machines /></DashboardLayout>} />
          <Route path="/working-hours" element={<DashboardLayout><WorkingHours /></DashboardLayout>} />
          <Route path="/gantt-scheduler" element={<DashboardLayout><GanttScheduler /></DashboardLayout>} />
          <Route path="/time-clock" element={<DashboardLayout><TimeClock /></DashboardLayout>} />
          <Route path="/efficiency-reports" element={<DashboardLayout><EfficiencyReports /></DashboardLayout>} />
          <Route path="/quality/audits" element={<DashboardLayout><ISOAudits /></DashboardLayout>} />
          <Route path="/quality/audits/:id" element={<DashboardLayout><AuditReportDetail /></DashboardLayout>} />
          <Route path="/quality/audit-schedule" element={<DashboardLayout><AuditSchedule /></DashboardLayout>} />
          <Route path="/quality/standards-library" element={<DashboardLayout><StandardsLibrary /></DashboardLayout>} />
          <Route path="/quality/audit-templates" element={<DashboardLayout><AuditTemplates /></DashboardLayout>} />
          <Route path="/quality/asset-registers" element={<DashboardLayout><AssetRegisters /></DashboardLayout>} />
          <Route path="/quality/audit-dashboard" element={<DashboardLayout><AuditDashboard /></DashboardLayout>} />
          <Route path="/ims/manual" element={<DashboardLayout><IMSManual /></DashboardLayout>} />
          <Route path="/quality/policies" element={<DashboardLayout><Policies /></DashboardLayout>} />
          <Route path="/rfqs" element={<DashboardLayout><RFQs /></DashboardLayout>} />
          <Route path="/rfq/:token" element={<PublicRFQ />} />
          <Route path="/settings/menu" element={<DashboardLayout><MenuConfig /></DashboardLayout>} />
          <Route path="/quality/ncr" element={<DashboardLayout><NCRRegister /></DashboardLayout>} />
          <Route path="/quality/ncr/new" element={<DashboardLayout><NCRForm /></DashboardLayout>} />
          <Route path="/quality/ncr/:id" element={<DashboardLayout><NCRForm /></DashboardLayout>} />
          <Route path="/quality/credit-requests" element={<DashboardLayout><CreditRequestsLog /></DashboardLayout>} />
          <Route path="/quality/calibration" element={<DashboardLayout><CalibrationSchedule /></DashboardLayout>} />
          <Route path="/quality/calibration/record/new" element={<DashboardLayout><CalibrationRecord /></DashboardLayout>} />
          <Route path="/quality/calibration/print/:recordId" element={<PrintCalibrationRecord />} />
          <Route path="/quality/electricity" element={<DashboardLayout><ElectricityUsage /></DashboardLayout>} />
          <Route path="/quality/recycled-metal" element={<DashboardLayout><RecycledMetal /></DashboardLayout>} />
          <Route path="/quality/jsa" element={<DashboardLayout><JSARegister /></DashboardLayout>} />
          <Route path="/quality/legal-requirements" element={<DashboardLayout><LegalRequirements /></DashboardLayout>} />
          <Route path="/quality/supplier-reviews" element={<DashboardLayout><SupplierReviews /></DashboardLayout>} />
          <Route path="/quality/environmental-risk" element={<DashboardLayout><EnvironmentalRiskAssessment /></DashboardLayout>} />
          <Route path="/quality/msds" element={<DashboardLayout><MSDSRegister /></DashboardLayout>} />
          <Route path="/quality/evacuation" element={<DashboardLayout><EvacuationDrills /></DashboardLayout>} />
          <Route path="/safety/training-matrix" element={<DashboardLayout><TrainingMatrix /></DashboardLayout>} />
          <Route path="/safety/injury-register" element={<DashboardLayout><InjuryRegister /></DashboardLayout>} />
          <Route path="/safety/injury-register/new" element={<DashboardLayout><InjuryRegisterForm /></DashboardLayout>} />
          <Route path="/safety/injury-register/:id" element={<DashboardLayout><InjuryRegisterForm /></DashboardLayout>} />
          <Route path="/safety/injury-graph" element={<DashboardLayout><InjuryGraph /></DashboardLayout>} />
          <Route path="/operations/courier-kpi" element={<DashboardLayout><CourierKPI /></DashboardLayout>} />
          <Route path="/safety/forklift-register" element={<DashboardLayout><ForkliftRegister /></DashboardLayout>} />
          <Route path="/safety/first-aid-register" element={<DashboardLayout><FirstAidRegister /></DashboardLayout>} />
          <Route path="/quality/management-review" element={<DashboardLayout><ManagementReview /></DashboardLayout>} />
          <Route path="/quality/management-review/new" element={<DashboardLayout><ManagementReviewForm /></DashboardLayout>} />
          <Route path="/quality/management-review/:id" element={<DashboardLayout><ManagementReviewForm /></DashboardLayout>} />
          <Route path="/safety/ohs-meetings" element={<DashboardLayout><OHSMeetings /></DashboardLayout>} />
          <Route path="/safety/ohs-meetings/new" element={<DashboardLayout><OHSMeetingForm /></DashboardLayout>} />
          <Route path="/safety/ohs-meetings/:id" element={<DashboardLayout><OHSMeetingForm /></DashboardLayout>} />
          <Route path="/safety/housekeeping-audits" element={<DashboardLayout><HousekeepingAudits /></DashboardLayout>} />
          <Route path="/safety/housekeeping-audits/new" element={<DashboardLayout><HousekeepingAuditForm /></DashboardLayout>} />
          <Route path="/safety/housekeeping-audits/:id" element={<DashboardLayout><HousekeepingAuditForm /></DashboardLayout>} />
          <Route path="/safety/plant-hazard-checks" element={<DashboardLayout><PlantHazardChecks /></DashboardLayout>} />
          <Route path="/safety/near-miss" element={<DashboardLayout><NearMissRegister /></DashboardLayout>} />
          <Route path="/safety/training-appraisals" element={<DashboardLayout><TrainingAppraisal /></DashboardLayout>} />
          <Route path="/hr/leave-of-absence" element={<DashboardLayout><LeaveOfAbsence /></DashboardLayout>} />
          <Route path="/ims/risk-opportunities" element={<DashboardLayout><RiskOpportunities /></DashboardLayout>} />
          <Route path="/settings/users" element={<DashboardLayout><UserManagement /></DashboardLayout>} />
          <Route path="/quality/document-control" element={<DashboardLayout><DocumentControl /></DashboardLayout>} />
          <Route path="/quality/customer-satisfaction" element={<DashboardLayout><CustomerSatisfaction /></DashboardLayout>} />
          <Route path="/quality/forms" element={<DashboardLayout><FormsLibrary /></DashboardLayout>} />
          <Route path="/quality/forms/employment-application" element={<DashboardLayout><EmploymentApplicationForm /></DashboardLayout>} />
          <Route path="/quality/forms/employment-application/submissions" element={<DashboardLayout><EmploymentApplicationSubmissions /></DashboardLayout>} />
          <Route path="/apply/employment-application" element={<EmploymentApplicationForm publicMode />} />
          <Route path="/survey/customer-satisfaction/:token" element={<CustomerSatisfactionPublicSurvey />} />
          <Route path="/jsa/new" element={<DashboardLayout><JSAForm /></DashboardLayout>} />
          <Route path="/jsa/:id" element={<DashboardLayout><JSADetail /></DashboardLayout>} />
          <Route path="/jsa/:id/edit" element={<DashboardLayout><JSAForm /></DashboardLayout>} />
          <Route path="/shop-floor" element={<DashboardLayout><ShopFloorEntry /></DashboardLayout>} />
          <Route path="/production-dashboard" element={<DashboardLayout><ProductionDashboard /></DashboardLayout>} />
          <Route path="/data-migration" element={<DashboardLayout><DataMigration /></DashboardLayout>} />
          <Route path="/packing-slips" element={<DashboardLayout><PackingSlips /></DashboardLayout>} />
          <Route path="/employees" element={<DashboardLayout><Employees /></DashboardLayout>} />
          <Route path="/clock-in-out" element={<DashboardLayout><ClockInOut /></DashboardLayout>} />
          <Route path="/leave-management" element={<DashboardLayout><LeaveManagement /></DashboardLayout>} />
          <Route path="/settings" element={<DashboardLayout><Settings /></DashboardLayout>} />
          <Route path="/iso" element={<DashboardLayout><div className="p-8"><h1 className="text-3xl font-bold">ISO/IMS Module</h1><p className="text-slate-600 mt-2">Coming soon...</p></div></DashboardLayout>} />
        </Routes>
      </BrowserRouter>
      <Toaster />
      <SonnerToaster position="top-right" richColors />
    </AuthProvider>
  );
}

export default App;
