from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path

# Import routes
from routes import auth_routes, quote_routes, material_routes, purchase_order_routes, supplier_routes, customer_routes, customer_contact_routes, dashboard_routes, job_sheet_routes, file_upload_routes, packing_slip_routes, invoice_routes, employee_routes, settings_routes, machine_routes, working_hours_routes, job_schedule_routes, audit_routes, efficiency_routes, calibration_routes, environmental_routes, customer_financial_routes, email_routes, seed_routes, shop_floor_routes, production_dashboard_routes, notification_routes, data_migration_routes, jsa_routes, drawing_analysis_routes, part_history_routes, legal_requirements_routes, supplier_review_routes, environmental_risk_routes, msds_routes, evacuation_routes, training_matrix_routes, document_control_routes, customer_satisfaction_routes, iso_modules_routes, employment_applications_routes, injury_register_routes, management_review_routes, outstanding_actions_routes, ohs_meetings_routes, housekeeping_audits_routes, injury_graph_routes, audit_schedule_routes, ncr_routes, compliance_registers_routes, plant_hazard_checks_routes, near_miss_routes, training_appraisal_routes, leave_of_absence_routes, risk_opportunities_routes, courier_kpi_routes, standards_library_routes, audit_templates_routes, asset_registers_routes, menu_config_routes, ims_manual_routes, policies_routes

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="Nestix ERP API", version="1.0.0")

# Create a router with the /api prefix for health check
api_router = APIRouter(prefix="/api")

@api_router.get("/")
async def root():
    return {"message": "Nestix ERP API - v1.0.0", "status": "running"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "database": "connected"}

# Include the basic router
app.include_router(api_router)

# Include feature routers
app.include_router(auth_routes.router)
app.include_router(quote_routes.router)
app.include_router(material_routes.router)
app.include_router(purchase_order_routes.router)
app.include_router(supplier_routes.router)
app.include_router(customer_financial_routes.router)
app.include_router(customer_routes.router)
app.include_router(customer_contact_routes.router)
app.include_router(dashboard_routes.router)
app.include_router(job_sheet_routes.router)
app.include_router(file_upload_routes.router)
app.include_router(packing_slip_routes.router)
app.include_router(invoice_routes.router)
app.include_router(employee_routes.router)
app.include_router(settings_routes.router)
app.include_router(machine_routes.router)
app.include_router(working_hours_routes.router)
app.include_router(job_schedule_routes.router)
app.include_router(audit_routes.router)
app.include_router(efficiency_routes.router)
app.include_router(calibration_routes.router)
app.include_router(environmental_routes.router)
app.include_router(email_routes.router)
app.include_router(seed_routes.router)
app.include_router(shop_floor_routes.router)
app.include_router(production_dashboard_routes.router)
app.include_router(notification_routes.router)
app.include_router(data_migration_routes.router)
app.include_router(jsa_routes.router)
app.include_router(drawing_analysis_routes.router)
app.include_router(part_history_routes.router)
app.include_router(legal_requirements_routes.router)
app.include_router(supplier_review_routes.router)
app.include_router(environmental_risk_routes.router)
app.include_router(msds_routes.router)
app.include_router(evacuation_routes.router)
app.include_router(training_matrix_routes.router)
app.include_router(document_control_routes.router)
app.include_router(customer_satisfaction_routes.router)
app.include_router(iso_modules_routes.router)
app.include_router(employment_applications_routes.router)
app.include_router(injury_register_routes.router)
app.include_router(management_review_routes.router)
app.include_router(outstanding_actions_routes.router)
app.include_router(ohs_meetings_routes.router)
app.include_router(housekeeping_audits_routes.router)
app.include_router(injury_graph_routes.router)
app.include_router(audit_schedule_routes.router)
app.include_router(ncr_routes.router)
app.include_router(compliance_registers_routes.router)
app.include_router(plant_hazard_checks_routes.router)
app.include_router(near_miss_routes.router)
app.include_router(training_appraisal_routes.router)
app.include_router(leave_of_absence_routes.router)
app.include_router(risk_opportunities_routes.router)
app.include_router(courier_kpi_routes.router)
app.include_router(standards_library_routes.router)
app.include_router(audit_templates_routes.router)
app.include_router(asset_registers_routes.router)
app.include_router(menu_config_routes.router)
app.include_router(ims_manual_routes.router)
app.include_router(policies_routes.router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def seed_reference_data():
    """Idempotent seed of IMS Standards Library + Audit Templates.
    Runs on every startup (incl. fresh production deployments) — creates only missing records."""
    try:
        created = await standards_library_routes.ensure_seed()
        tpl_created = await audit_templates_routes.ensure_seed()
        manual_created = await ims_manual_routes.ensure_manual_seed()
        policies_created = await policies_routes.ensure_policies_seed()
        logger.info(f"IMS seed check: {created}, templates created: {tpl_created}, manual sections created: {manual_created}, policies created: {policies_created}")
    except Exception as e:
        logger.error(f"IMS seed failed: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()