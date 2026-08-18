# Nestix ERP - Product Requirements Document

## Overview
Nestix ERP is a comprehensive full-stack ERP application built for manufacturing/laser cutting businesses. Built with React frontend, FastAPI backend, and MongoDB database.

## Core Modules
1. **Quoting** - Create and manage customer quotes with material/process cost calculations
2. **Job Sheets** - Production tracking from quote to completion
3. **Invoicing** - Generate invoices from completed packing slips
4. **Packing Slips** - Delivery documentation with back-order support
5. **Customers/Suppliers** - CRM functionality
6. **Inventory** - Material stock management
7. **Purchase Orders** - Supplier ordering system
8. **JSA (Job Safety Analysis)** - Safety compliance documentation
9. **Time Clock** - Employee time tracking
10. **Production Dashboard** - Real-time production monitoring
11. **Quality Audits** - ISO compliance and calibration tracking

## Recent Updates (February 2026)

### Completed ✅


#### Session: Mar 01, 2026 — Courier KPI Module (new)
- **Request**: "Keep Records Of Courier KPI's. We record 3 Hrs on time and 4 Hrs on time deliveries. Use 3 Courier companies. Comparison of all 3 together." User choices: monthly aggregate numbers; manageable courier list; both calendar year & rolling 12 months; ISO footer enabled; both overlay + side-by-side comparison charts.
- **Backend** (`backend/routes/courier_kpi_routes.py`):
  - Two collections: `couriers` (manageable, soft-delete preserves history) and `courier_kpi_entries` (idempotent upsert keyed by courier_id + month).
  - Endpoints under `/api/courier-kpi/*`: couriers CRUD, entries CRUD, aggregated `/data` returning 12 months with null-safe averages.
  - Percentage validation (0–100) and month key validation (YYYY-MM).
  - Registered in `iso_modules_routes.py` under group "Operations" (default QMSF 40) → available in Document Control Register dropdown for ISO footer wiring.
- **Frontend** (`frontend/src/pages/CourierKPI.js` + Sidebar + App.js):
  - Tabbed page: one tab per courier (3HR + 4HR line charts + monthly data-entry table), Comparison tab (overlay line + side-by-side bar for both KPIs + averages summary table), Manage Couriers tab.
  - New "OPERATIONS" sidebar section with Truck icon at `/operations/courier-kpi`.
  - Period selector: Rolling 12 Months (default) or Calendar Year.
  - **Offscreen print stage** — dedicated hidden 900px-wide container that mounts ALL charts at fixed dimensions when Print is clicked, so canvas.toDataURL() always returns filled PNGs regardless of which tab the user was viewing. Torn down in `finally` block.
  - Chart data-labels via `chartjs-plugin-datalabels` (installed via yarn).
- **Tests**:
  - **Backend pytest 15/15 PASS** (`test_courier_kpi_iter19.py` + `test_courier_kpi_iter20.py`) — CRUD, upsert idempotency, validation, soft-delete, exclude_unset PUT.
  - **Frontend Playwright 100% PASS** across iter-19/20/21 — empty state, add courier, KPI entry, period switching, comparison charts (all 3 couriers as distinct lines/bars), Manage tab CRUD, DialogDescription a11y, print from every entry point yields 10/10 non-blank chart images.


#### Session: Mar 01, 2026 — Quotes: Free-text Notes on Print & Download
- **Request**: "On Quotes, I want a section where I type notes that go onto the Quote print out or Quote Download Page."
- **Backend** (`backend/models.py`):
  - Added `quote_notes: Optional[str] = ""` to the `Quote` document model.
  - Added `quote_notes: Optional[str] = ""` to `QuoteCreate` and `quote_notes: Optional[str] = None` to `QuoteUpdate` so PUT/POST flow the field through.
- **Frontend** (`frontend/src/pages/Quotes.js`):
  - `initialFormData` now includes `quote_notes: ''`.
  - `editQuote` and `duplicateQuote` handlers restore `quote_notes` from the loaded quote.
  - Multi-item create payload explicitly passes `quote_notes`; single-item create already inherits it via `{...formData}` spread.
  - New amber-themed "Quote Notes" card placed between the Q.A. Inspection section and the Quote Summary section, containing a `<Textarea data-testid="quote-notes-textarea">`.
  - `handlePrintQuote()` injects a NOTES block (amber card, `<pre>`-preserving whitespace, HTML-escaped) between the grain-direction warning and the terms footer.
  - `handleDownloadPDF()` injects the same NOTES block into the html2canvas PDF output.
  - `viewDialog` renders the notes under a "Notes" heading (`data-testid="view-quote-notes"`) when present.
- **Tests (iter-18, 100 % PASS)**:
  - Backend pytest at `/app/backend/tests/test_quote_notes_iter18.py` — 4/4 (POST persist, PUT patch, empty accepted, edit-load regression for part_width / part_length / adjust_* still valid).
  - Frontend Playwright — textarea appears, save/reload round-trip works, `<hello>` is escaped in Print HTML, View dialog renders the amber Notes card.


#### Session: Feb 28, 2026 (refinement) — Leave of Absence: one-click Approve / Decline / Revert
- **Request**: User asked how to mark a Pending leave request as Approved — the only path was to open the editor, change the Status dropdown, then save. Wanted a faster workflow.
- **Fix** in `pages/LeaveOfAbsence.js`:
  - Added `setStatus(it, newStatus)` helper that calls `PUT /leave-of-absence/{id}` with the merged record and the new status — uses an initial `GET` to fetch the full payload so nothing else is wiped.
  - Inline row actions now include:
    - **Pending row** → ✅ green Approve (CheckCircle2) + ❌ red Decline (XCircle) buttons.
    - **Approved / Declined row** → 🔄 amber "Revert to Pending" button (RotateCcw).
    - Existing Print / Edit / Delete buttons preserved.
  - Toast notification confirms the status change.
  - Data-testids: `loa-approve-{id}`, `loa-decline-{id}`, `loa-revert-{id}`.
- **No backend change** — the PUT endpoint and status enum (`Pending | Approved | Declined | Completed`) already existed.



#### Session: Feb 28, 2026 (refinement) — Electricity Usage & Recycled Metal: PDF footers pulled from Doc Control
- **Request**: User noted both environmental graph PDFs were emitting a hardcoded footer ("ELECTRICITY USAGE / ISSUE: 3 November 2025" or "RECYCLED METAL / ISSUE: 3 November 2025"). They wanted the footers to pull from the Document Control register like every other module.
- **Note**: Unlike the rest of the app (which uses browser `window.print()` + `<tfoot>`), these two pages use **jsPDF + html2canvas** to export multi-page PDFs. The fix is in the `handlePrintAllCharts()` Python-style PDF builder.
- **Fix** in `pages/ElectricityUsage.js` and `pages/RecycledMetal.js`:
  - Imported `getControlledDocumentByModule`.
  - At the start of `handlePrintAllCharts`, fetch the controlled document by module key (`'Electricity Usage'` / `'Recycled Metal'`, both already in `ISO_MODULES` under Environment).
  - Format `revision_date` ISO → `DD/MM/YYYY` for AU readers.
  - Footer line replaced with the standard format: `Form No: X | Issue: Y | Revision Date: Z | Owner: W | Title: T`, plus `Page X of Y` on the right. Falls back to `—` for any missing field so user immediately sees what hasn't been linked yet.
- **For user**: redeploy → in Document Control pick "Electricity Usage" and "Recycled Metal" from the Environment group, set the QMSF#/Issue/Revision Date/Owner you want. Next PDF will pull them.



#### Session: Feb 28, 2026 (refinement) — Injury Graph: added to dropdown, footer pulls from registry
- **Request**: User noticed there was no "Injury Graph" option in the Document Control "Related Module" dropdown, so they couldn't register a QMSF# for the Injury Graph LTI/MTI report and have its footer pulled.
- **Fix #1** — `backend/routes/iso_modules_routes.py`: Added `{"name": "Injury Graph", "group": "Safety", "default_form_no": "QMSF 27"}` to the `ISO_MODULES` canonical list. Backend restarted; dropdown now lists "Injury Graph" under the Safety group between "Injury Report Form" and "Evacuation Drill Register".
- **Fix #2** — `frontend/src/pages/InjuryGraph.js`: Changed `MODULE_NAME` from `'Injury Register'` to `'Injury Graph'` so it now looks up its own dedicated register entry. Strict primary match with fallback to legacy `'Injury Graph'` short name. The print already used the standard `buildPrintBodyOpen(footer)` / `buildPrintBodyClose()` wrapper, so the Form No / Issue / Revision Date / Owner / Title in the footer will be pulled live from whatever the user enters in the Document Control register.
- **For the user**: Create a new Document Control entry with `Related Module = "Injury Graph"` and assign your desired QMSF# / Issue / Revision Date / Owner. Once redeployed to production, the next "Print Graph" will pick those values up automatically.



#### Session: Feb 28, 2026 (refinement) — Injury Register & Form: drop on-screen QMSF, footer-only from register
- **Issue (production)**: User noted that even after the previous Print Index fix, the **on-screen** heading still showed `QMSF 19` (Injury Register page) and `QMSF 19 — Issue 1 (June 2023)` (individual Injury Form editor) — and they wanted that information ONLY in the printed footer, not on screen.
- **Fix #1** — `pages/InjuryRegister.js`: Removed the `{docInfo?.form_no || '—'}` prefix from the header subtitle. Subtitle now reads simply "All recorded workplace injuries. Next record number: 00005". Doc-control lookup is still performed (used by the Print Index footer) but no longer displayed.
- **Fix #2** — `pages/InjuryRegisterForm.js`: Removed the hardcoded `<p>QMSF 19 — Issue 1 (June 2023)</p>` line under the individual record heading. Heading now just shows "Register of Injury — `<record-number>`".
- **Footers already registry-driven** (verified previously):
  - Register Index print → `getControlledDocumentByModule('Injury Register', { fallback: 'Injury Register', docType: 'Register' })` → e.g. QMSF 29.
  - Individual Injury Form print → `getControlledDocumentByModule('Injury Report Form', { fallback: 'Injury Register', docType: 'Form' })`.
- **For user**: Redeploy preview → production to push the cleaned heading and the Print Index button live.



#### Session: Feb 28, 2026 (refinement) — Injury Register: "Print Index" button + registry-driven QMSF#
- **Issue**: User couldn't print the Injury Register list, and the on-screen header text was hardcoded "QMSF 19" — but they had reassigned it to "QMSF 29" in Document Control.
- **Fix** in `pages/InjuryRegister.js`:
  - Added `getControlledDocumentByModule('Injury Register', { fallback: 'Injury Register', docType: 'Register' })` on mount → header subtitle now reads `{docInfo?.form_no || '—'} — All recorded workplace injuries…` (pulls live from register).
  - Added `printIndex()` handler that wraps the table HTML in the standard `buildPrintBodyOpen(footer)` / `buildPrintBodyClose()` pattern → standard ISO doc-control footer pulled live from register, landscape A4, columns: Record #, Date, Worker, Activity/Area, Injury, Cause, First Aid By, with alternating row stripes.
  - New "Print Index" button (data-testid `injury-print-index`) added to the header next to "New Record".
- Removed unused `Edit` import to satisfy lint.



#### Session: Feb 28, 2026 (refinement) — Near Miss Register: "Print Register" button
- **Request**: User couldn't print the Near Miss / Incident / Hazard Register listing — only had "Print Blank Form" + per-row print, nothing for the whole register.
- **Fix** in `pages/NearMissRegister.js`:
  - Added `printRegister()` handler that calls `getControlledDocumentByModule('Near Miss Register', { fallback: 'Near Miss', docType: 'Register' })` → wraps the table HTML in the standard `buildPrintBodyOpen(footer)` / `buildPrintBodyClose()` pattern so the ISO doc-control footer (Form No / Issue / Revision Date / Owner / Title) is pulled live from the user's register entry and anchored to the bottom of every printed page (with logo header).
  - Added "Print Register" button (data-testid `nm-print-register`) between "Print Blank Form" and "New Report".
  - Landscape A4. Columns: NM #, Date, Reporter, Location, Type, Severity, Status, Corrective Action. Alternating row stripes.



#### Session: Feb 28, 2026 (refinement) — Plant Hazard Check: remove inline doc-control badges, route Register print through doc-control footer
- **Issue 1**: User noted the on-screen heading showed an inline QMSF/Issue/Revision badge ("QMSF 27 Iss. — · ...") even before any data was filled in the register. They wanted it removed — the footer-pulled data should be the only place it appears.
- **Issue 2**: `printIndex` (Plant Hazard Register print) was building its own custom HTML with the QMSF#/Issue embedded in the H1 + a custom company-info header band. It did NOT use the standard `<thead>` (logo) / `<tfoot>` (doc-control) wrapper pattern, so it wasn't actually pulling from the register.
- **Issue 3**: The `docInfo` state previously held only the Form entry (QMSF 26) but was also used to render the Register print header → wrong values shown on the register's print.
- **Fix** in `pages/PlantHazardChecks.js`:
  - Dropped the `docInfo` state + the unused initial fetch entirely.
  - Removed the on-screen QMSF/Iss/Rev badge from both the list heading and the editor heading. Heading now just reads "Plant Hazard Checks / Risk Assessments — 11-page ISO audit checklist".
  - `printIndex` now calls `getControlledDocumentByModule('Plant Hazard Check Register', { fallback: 'Plant Hazard Checks', docType: 'Register' })` → wraps content with `buildPrintBodyOpen(footer)` / `buildPrintBodyClose()` → standard logo header + ISO doc-control footer (Form No / Issue / Revision Date / Owner / Title) anchored at the bottom of every printed page, pulled live from the user's Register entry (QMSF 35).
  - `printOne` (the per-record 11-page audit form) continues to use `'Plant Hazard Audit Form'` module key — pulls the user's Form entry (QMSF 26) for its footer.
- **Outcome**: Single source of truth honoured. User edits QMSF# / Issue / Revision Date / Owner once in Document Control → both the Register print and every individual PHC audit print pick it up.



#### Session: Feb 28, 2026 (refinement) — Employment Application public link + Submit button parity with Customer Satisfaction
- **Bug 1**: Forms Library card for Employment Application had no easy way to copy/send the public link to candidates.
- **Bug 2**: When a candidate filled the form publicly, the bottom-of-page button always showed "Print Form" instead of "Submit Application" — the top button was correct but the bottom one was wrong.
- **Fix #1 — `pages/FormsLibrary.js`**:
  - Added `PUBLIC_ROUTES` map: `{ 'employment-application': '/apply/employment-application' }`.
  - Added `copyPublicLink(form)` handler → writes `${origin}${route}` to clipboard.
  - New "Copy Public Link" button (Link2 icon) on each form card that has a public route — appears between "Fill Online" and "Submissions" buttons. Matches the UX pattern of the Customer Satisfaction campaign cards.
- **Fix #2 — `pages/EmploymentApplicationForm.js`**: Bottom button area now conditionally renders the Submit Application button when `publicMode` is true (matching the top button), so the candidate can submit from either end of the page.
- **Fix #3 — `forms/employmentApplication.js`**: Declared `fill_route`, `submissions_route`, `public_route` on the form template so future forms can opt-in to the same multi-button card by just declaring these.
- **Verified end-to-end**: `POST /api/employment-applications/public/submit` accepts payload, generates `EA-2026-0001`, persists, and appears in admin list (`GET /api/employment-applications`).
- User-flow now matches Customer Satisfaction: HR clicks "Copy Public Link" → paste in email/SMS to candidate → candidate fills form → clicks "Submit Application" → admin sees it under Submissions.



#### Session: Feb 28, 2026 (refinement) — Document Control Register self-referencing footer
- **Bug**: Document Control Register print used its own custom `@page @bottom-left/@bottom-right` CSS counters instead of the standard `<tfoot>`-based ISO footer — so it didn't pull from the register itself.
- **Fix** in `pages/DocumentControl.js`:
  - `handlePrint` now calls `getControlledDocumentByModule('Document Control Register', { fallback: 'Document Control', docType: 'Register' })` and passes the result through `buildDocControlFooter()`.
  - Inline CSS replaced with `buildPrintFooterCss()` + `buildPrintBodyOpen(footer)` / `buildPrintBodyClose()` pattern, just like every other ISO form.
  - Print stays landscape A4; data table class renamed to `data-tbl` so it doesn't collide with the doc-control wrapper's own table.
- **Outcome**: The Register-of-Registers now self-reports. Whatever QMSF#/Issue/Revision Date the user sets against `related_module='Document Control Register'` in their own register is what prints in the footer.



#### Session: Feb 28, 2026 (refinement) — Evacuation Drill "Time Taken" → Min + Sec inputs
- **Request**: User wanted the "Time Taken" field to be Minutes + Seconds (numeric) instead of a single free-text input.
- **Fix** in `pages/EvacuationDrills.js DrillEditor`:
  - Replaced single `Input` with two side-by-side numeric `Input`s (Min, Sec) with inline "Min" / "Sec" labels. Test IDs: `editor-time-min`, `editor-time-sec`. Sec capped at 0–59.
  - State split into `timeMin` + `timeSec`; the combined `time_taken` payload string remains `"X Min Y Seconds"` for backward compatibility with stored records, print HTML, and the listing table.
  - Parser `_parseTime()` reads existing free-text values (e.g. "3 Min 15 Seconds") and seeds the two numeric inputs.
  - Auto-derive now supports `HH:MM:SS` (not just `HH:MM`) for the Start/Finish time → computes diff in seconds → seeds Min/Sec if the user hasn't typed them yet.
- **No DB schema change** — same string field, just better UX.



#### Session: Feb 28, 2026 (refinement) — Evacuation Drill report 3-page → 2-page compact layout
- **Issue**: User reported the Evacuation Drill print on production deploy was running to 3 pages. Wanted 2 pages by switching the label/value tables to 2-column layout.
- **Fix** in `pages/EvacuationDrills.js` `buildPrintHtml()`:
  - Added `twoColRow(l1, v1, l2, v2)` helper rendering `<label><value><label><value>` in a single row.
  - **Drill Details** (6 fields) → 3 two-col rows (Start/Finish, Total/Scenario, Alarm/Assembly Point).
  - **Emergency Control Organisation** (6 fields) → 3 two-col rows.
  - **Visitors / Contractors** (2 fields) → 1 two-col row.
  - Sign-off section also compacted (Drill Outcome row + signature lines).
  - Global CSS: font-size 11pt → 10pt, table padding 6px → 3px, h2 margins 14px → 8px, signature line height 22px → 18px, `@page` margins tightened to 10/12/16/12 mm.
- **Result**: Page-2 content shrinks ~47%. The drill grid on page 1 + the detailed report on page 2 now fits exactly 2 pages. Wardens/Time-Taken inlined (no separate label/value div) to claw back vertical space on page 1.



#### Session: Feb 28, 2026 (hot-fix 3) — Audit Report PDF footer ignored Document Control
- **Production bug**: User reported the Audit Report PDF (e.g. `AR-27`) was either showing a hardcoded "QMSF 07" or no QMSF info at all in the footer. Inspection of the actual PDF (41-page export) confirmed the footer only contained `report_number — client | ISO standards | Page X of Y` — **no** QMSF/Issue/Revision/Owner.
- **Architectural difference**: Unlike all other forms (browser-side `window.print()` with `<tfoot>` + CSS), Audit Reports are generated **server-side with ReportLab** (`services/pdf_generator.py`). The browser-side Document Control helper (`getControlledDocumentByModule`) does not apply — the lookup had to be done in Python.
- **Fix #1 — `routes/audit_routes.py`**: Added `_resolve_doc_control_for_module(primary, fallback, doc_type)` — strict match on `related_module='ISO Audit Report'`, falls back to legacy `'ISO Audits'`, disambiguates by `doc_type='Form'`. Result is attached as `audit['doc_control']` before calling `generate_audit_pdf()`.
- **Fix #2 — `services/pdf_generator.py` `FooterCanvas.draw_footer`**: Added a two-line footer:
  - **Top line** (bold, black): `Form No | Issue | Revision Date | Owner | Title` — all pulled live from `audit_info['doc_control']`. Falls back to "—" when registry entry missing.
  - **Bottom line** (grey, lighter): preserves the existing `report_number - client | ISO standards | Page X of Y`.
  - `bottomMargin` raised from 2.5 → 2.9 cm to fit the extra line without overlapping body text.
- **Verified**: Re-generated PDF for `AR-2025-026` shows `Form No: QMSF 10A | Issue: 2 | Revision Date: 10/01/2026 | Owner: Quality Manager | Title: ISO Audit Report` on every page (4-page sample), pulled from the seeded Document Control entry. User can change any of those fields in the register and the next PDF download picks them up immediately.
- **User must redeploy** preview → production to push the fix live.



#### Session: Feb 28, 2026 (hot-fix 2) — Calibration Certificate footer hardcoded + wrong position
- **Production bug**: User reported Calibration Certificate print page (`/quality/calibration/print/:id`) showed an inline footer reading "QMSF 06 Issue 3 Jan 2026" sitting just below the signature block — wrong QMSF# (should be QMSF 07) and wrong position (should be at bottom of sheet like every other form).
- **Root cause #1** — The footer in `PrintCalibrationRecord.js` was a hardcoded `<div class="footer-block">…QMSF 06 Issue 3 Jan 2026…</div>` rendered inline rather than fetched from the Document Control register.
- **Root cause #2** — `api.get('/settings')` (no trailing slash) was returning a 307 redirect over HTTPS that got rewritten to HTTP in this environment → **mixed-content** error → the entire `try { … }` block threw → `getControlledDocumentByModule()` never ran. So even after I switched to the registry-driven footer, it would have shown "—".
- **Fixes** (both in `PrintCalibrationRecord.js`):
  - Replaced hardcoded inline footer with the standard ISO doc-control bottom-of-page format: `Form No | Issue | Revision Date | Owner | Title` plus Record # — anchored via `position:fixed; bottom:6mm` so it sits at the bottom of every printed page exactly like JSA/NCR/PHC.
  - Split fetch chain into three independent `try/catch` blocks (record+instrument, settings, document-control) so a failure in one no longer blocks the others. Settings fetch changed to `/settings/` with trailing slash to avoid the HTTPS→HTTP redirect quirk.
  - Doc Control lookup: `getControlledDocumentByModule('Calibration Records', { fallback: 'Calibration Records', docType: 'Form' })`.
- **Also fixed**: `CalibrationRecord.js` (the data entry screen) heading "Calibration Record (QMSF 06)" now reads "Calibration Record ({docInfo?.form_no || '—'})" — also pulled from the registry.
- **Verified end-to-end** (preview screenshot): Footer now displays "Form No: QMSF 07 | Issue: 4 | Revision Date: 15/01/2026 | Owner: Quality Manager | Title: Calibration Record" pulled live from the Document Control register entry the user maintains.
- **User must redeploy** preview → production for the production app to pick up the fix.



#### Session: Feb 28, 2026 (hot-fix) — Forms Library Print pulled wrong QMSF# (production bug)
- **Production bug**: User reported deployed app's Employment Application form printed footer "QMSF 02 / Issue 2 / Customer Satisfaction Analysis Report" instead of the correct "QMSF 03 / Issue 3 / Employment Application" entry from their register. Root cause: `FormsLibrary.js` + form templates still used the legacy `getControlledDocumentByFormOrModule(form_no, title)` which prioritized form_no match — and the hardcoded `form_no: 'QMSF 02'` in `employmentApplication.js` matched a different row in the register (QMSF 02 had been reassigned to Customer Satisfaction Analysis Report).
- **Smart lookup helper** (`utils/documentControl.js`): Added `findByModuleSmart(items, primaryKey, { fallback, docType })`. Tries exact match on the new canonical key first (e.g. `'Employment Application Form'`), then falls back to a legacy short name (e.g. `'Employment Application'`) — disambiguating multiple matches by `doc_type` (`'Form'` vs `'Register'`). This makes the lookup tolerant to old register entries that still use legacy single-name labels (`'JSA'`, `'Supplier Review'`, `'OHS Meetings'`, `'Training Matrix'`, etc.) which the user already had populated in production.
- **Form templates** (`forms/employmentApplication.js`): Added `related_module: 'Employment Application Form'` + `fallback_module: 'Employment Application'` declarations so the Forms Library knows which registry entry to query.
- **FormsLibrary.js**: Replaced `getControlledDocumentByFormOrModule(form.form_no, form.title)` with `getControlledDocumentByModule(form.related_module, { fallback: form.fallback_module, docType: 'Form' })`. On-screen card QMSF# badge now also pulls from the registry instead of the hardcoded form constant.
- **All 25+ module pages** (JSADetail/Register, NCR*, PlantHazardChecks, RiskOpportunities, NearMissRegister, LeaveOfAbsence, TrainingAppraisal, ForkliftRegister, FirstAidRegister, LegalRequirements, CalibrationSchedule, EvacuationDrills, AuditSchedule, SupplierReviews, InjuryRegisterForm, InjuryGraph, OHSMeetingForm, ManagementReviewForm, HousekeepingAudits, EmploymentApplication*, EnvironmentalRiskAssessment, MSDSRegister) — each now passes `{ fallback: '<legacy name>', docType: 'Form'|'Register' }` so the lookup resolves correctly against the user's existing production register without requiring them to manually re-link every entry.
- **Verified end-to-end** (preview): Forms Library card for Employment Application now displays "QMSF 03 · Issue 3 · Rev 19/06/2026" pulled live from the seeded production-like register entry. 20/20 backend tests passed (iteration_17.json).
- **User must redeploy preview → production** to pick up the fix.



#### Session: Feb 28, 2026 — Document Control Register = Single Source of Truth for ALL Print Footers
- **Problem**: User reported JSA Form footer showed "QMSF 14 Issue 3" but per their official ISO Document Control, **QMSF 14 is Skills Matrix** (not JSA). Many modules had hardcoded `form_no`/`issue` fallbacks that overrode or shadowed the registry. Modules that have both a Register AND individual Forms (JSA, NCR, PHC, Near Miss, OHS, Injury, Evac, Supplier, ISO Audit, ERA, Skills Matrix) were collapsed into a single dropdown entry — making it impossible to link Register vs Form to separate QMSF numbers.
- **Backend** (`routes/iso_modules_routes.py`):
  - Expanded `ISO_MODULES` list from 19 → 40 entries. Every module with a Register + Form pair is now split into two distinct dropdown options (e.g. `JSA Register` + `JSA Form`, `NCR Register` + `NCR Form`, `Plant Hazard Check Register` + `Plant Hazard Audit Form`, etc.).
  - Reorganized into 7 groups: Quality, Safety, HR, IMS, Environment, Equipment, System.
  - Added all previously missing entries: Plant Hazard Check, Near Miss, Risk & Opportunities Register/Form, Skills Matrix Register/Form, Training Appraisal Form, Leave of Absence Form, OHS Meeting Register, Injury Report Form, Evacuation Drill Register, etc.
- **Frontend** (`utils/documentControl.js`):
  - Added new strict helper `getControlledDocumentByModule(moduleKey)` that matches ONLY against `related_module` (case/punctuation-insensitive exact match — no form_no shortcut, no fuzzy contains). Returns `null` if no entry — caller renders "—" in the footer so the user knows the registry needs populating.
  - Old `getControlledDocumentByFormOrModule` kept for the two legitimate dynamic-form-number cases (Customer Satisfaction campaigns, FormsLibrary blank-form printer).
- **Frontend module pages updated** to use the new strict lookup AND drop all hardcoded `form_no`/`issue` defaults — footer now always pulls from the register:
  - JSADetail (`'JSA Form'`), JSARegister (`'JSA Register'`), NCRRegister, NCRForm (with split moduleMap for ncr/credit/jobsheet), PlantHazardChecks (`'Plant Hazard Audit Form'`), RiskOpportunities (`'Risk & Opportunities Register'` + `'Risk & Opportunity Form'`), NearMissRegister (`'Near Miss / Hazard Form'`), LeaveOfAbsence, TrainingAppraisal, ForkliftRegister, FirstAidRegister, LegalRequirements, CalibrationSchedule, EvacuationDrills, AuditSchedule, SupplierReviews, InjuryRegisterForm, InjuryGraph, OHSMeetingForm, ManagementReviewForm, HousekeepingAudits, EmploymentApplicationForm, EmploymentApplicationSubmissions, EnvironmentalRiskAssessment, MSDSRegister.
  - On-screen QMSF# badges in registers (JSA, NCR, R&O, PHC, Forklift, First Aid, Near Miss, Leave, Training Appraisal) now also pull live from the registry — change it once in Document Control, every screen + every print updates automatically.
- **Migration script** (`backend/migrate_doc_control_modules.py` — RAN ONCE):
  - Relinked 13 existing register entries to the new canonical module keys (e.g. `'JSA'` → `'JSA Form'`, `'Customer Satisfaction'` → `'Customer Satisfaction Survey Form'`, `'Forklift Register'` → `'Forklift License Register'`, etc.).
  - Removed 1 duplicate QMSF 14 entry.
- **Outcome**: The Document Control Register is now the **single source of truth** for every printed form's footer (QMSF#, Issue, Revision Date, Owner, Title). User edits the register once → next print picks it up immediately (1-min cache, auto-invalidated on save). Every Register + Form pair has its own dropdown option so they can each carry their own QMSF#.
- **Tested**: 75/75 backend pytest tests passed (`test_doc_control_iso_modules.py`) — confirms ISO modules registry returns the new split list, document_control entries are correctly migrated with no duplicates, doc-control CRUD round-trip works, and all core ISO/QMS endpoints (JSAs, NCRs, R&O, PHC, Near Miss, LOA, Training, notifications, users, compliance, settings) regress clean.


#### Session: Feb 26, 2026 (d) — Plant Hazard Checks FULL Rebuild (QMSF 22 Iss. 3, June 2026)
- **Request**: Previous PHC was one-row-per-category. The real master form (PHC 01 Pedestal Grinder) is an 11-page audit document with 16 sections (A–P), each containing multiple sub-questions, plus cover-page reference tables and an introduction page. User upgraded the document version from Issue 2 (June 2023) to **Issue 3 (June 2026)**.
- **Backend** (`routes/plant_hazard_checks_routes.py` — full rewrite):
  - New form metadata: `QMSF 22`, Issue `3`, Revision `June 2026`.
  - New data model: `sections: [{code, name, prompt, questions: [{n, question, applies, consequence, likelihood, risk, controls, comments}]}]`.
  - `/reference` endpoint now returns ALL reference data needed for the form:
    - 5 Consequence levels (Negligible → Catastrophic with measures)
    - 5 Likelihood levels (A Frequent → E Rare with measures)
    - Risk Action Guideline (High 6-8, Medium 4-5, Low 1-3)
    - Hierarchy of Controls (5 levels: Elimination → PPE)
    - `default_sections` — complete pre-seeded master list of all 66 sub-questions across 16 categories (A=1, B=8, C=7, D=1, E=1, F=5, G=1, H=1, I=8, J=1, K=1, L=2, M=12, N=8, O=8, P=1).
- **Frontend** (`pages/PlantHazardChecks.js` — full rewrite):
  - **Form view**: 16 collapsible section cards with per-section completion counter (`0/8`, `0/12`, …). Each question is a table row with Applies (Yes/No/N/A) → Consequence (1-5 with descriptors) → Likelihood (A-E with descriptors) → Risk badge (auto-computed) → Controls. Section P uses a special "Comments" column instead of Controls.
  - **Print**: 11-page A4 output exactly matching the master document — Page 1 cover (meta + Consequence + Likelihood + 5×5 colour Risk Matrix + Risk Action Guideline), Page 2 Introduction (intro text + bullet examples + Hierarchy of Controls), Pages 3-10 hazard sections A-O each on their own page, Page 11 Section P + free-form Comments + dual Signed lines + Date. QMSF 22 Iss. 3 footer via `<tfoot>` doc-control wrapper.
  - **Heatmap**: Updated to flatten sub-questions across all sections (counts every `applies:'Yes'` answer by Consequence × Likelihood). Backwards-compatible with legacy `hazards[]` schema.
  - **Backwards-compat**: Old records (with `hazards[]`) auto-migrate to the new `sections[]` schema on edit.
- **Testing**: Backend curl verified all 66 questions round-trip correctly; Section A controls + Section P comments persist. Frontend smoke-tested via Playwright — 16 sections render, Section M = 12 questions, all completion counters working, form header shows correct QMSF 22 Iss. 3 doc-control badge.

#### Session: Feb 26, 2026 (c) — Compliance Expiry Notifications (Forklift / First Aid)
- **Request**: Bell-icon notifications when Forklift Licenses or First Aid Certificates approach expiry.
- **Backend** (`routes/notification_routes.py`):
  - New `check_compliance_expiry_alerts()` scans `forklift_licenses` + `first_aid_certificates`, classifies each record's expiry as `current` / `expiring_soon` (≤90 days) / `expired`.
  - Creates `type=compliance_expiry` notifications with deep-link to the relevant register and severity-based priority: `medium` (>30 days), `high` (≤30 days), `critical` (already expired).
  - **Smart dedupe**: link includes `::<status>` so each status transition (current→expiring_soon→expired) fires exactly once per cert; users can mark-read or delete and it won't re-spam.
  - Wired into existing `/check-alerts` endpoint (manual trigger) and `/unread-count` endpoint (passive, throttled to once per 6 hours via `notifications_cron` collection). The bell already polls `unread-count` every 60 seconds, so alerts surface automatically.
  - First Aid uses the latest certificate's expiry (max expiry_date across the renewal history) and includes attainment codes (e.g. "HLTAID011, HLTAID009") in the message.
- **Frontend** (`pages/ForkliftRegister.js`, `pages/FirstAidRegister.js`): Added "Check Expiries" button (data-testids `fl-check-expiry`, `fa-check-expiry`) for instant scan with toast feedback ("N new expiry alert(s) added to the bell.").
- **Testing**: Curl verified — created a forklift license expiring in 15 days → high-priority alert with day count; created an already-expired license → critical alert with days-ago count; First Aid cert expiring in 45 days → medium alert with HLTAID codes. Existing bell UI auto-shows them.

#### Session: Feb 26, 2026 (b) — Safety/HR Forms Expansion + PHC Risk Heatmap
- **PHC Risk Heatmap (Plant Hazard Checks register)**: New 5×5 grid card "Risk Heatmap — Plant-wide Exposure" plots count of *applicable* hazards (applies==Yes) across all assessments grouped by Consequence (5↓1) × Likelihood (A→E). Cells colored Low/Medium/High/Extreme matching the same scoring formula as the form; testids `phc-heatmap-c<1-5>-l<A-E>` for QA. One-glance view for safety-meeting decks.
- **Digital Near Miss / Incident / Hazard Form (QMSF 32, Issue 2)** — `/safety/near-miss`:
  - Backend `routes/near_miss_routes.py` collection `near_miss_reports`, counter key `near_miss_no`. Endpoints: `/reference`, full CRUD, `/stats` (total / open / closed / by_type breakdown).
  - 5 sections: Reporter Info → Description → Corrective/Preventive → Asset/Maintenance → Management Workflow (3 sign-blocks: Representative / Action Completion / Revised-Closed).
  - ISO improvements: Incident Type (Near Miss / Hazard / Injury / Property Damage / Environmental) + Severity (Low/Med/High/Critical) + Status (Open / In Progress / Closed).
  - Print: A4 portrait, doc-control footer (QMSF 32 Iss. 2), checkbox-style Yes/No marks, signature rows.
  - **Blank printable form** for hand-fill before going digital (`nm-print-blank`).
- **Digital Training Record / Appraisal Form (QMSF 08)** — `/safety/training-appraisals`:
  - Backend `routes/training_appraisal_routes.py` collection `training_appraisals`, counter key `training_appraisal_no`. Endpoints: `/reference`, full CRUD, `/stats` (total / internal / external / aggregated total_hours).
  - Links to Employee directory (auto-fills name + department); also accepts manual entry.
  - **ISO compliance improvements**: Training Objectives, Learning Outcomes Achieved, Effectiveness Rating (1–5 scale), separate Date of Appraisal vs Date of Training, Trainee + Manager signature blocks.
  - Print: A4 portrait, doc-control footer (QMSF 08), boxed sign-off row.
  - **Blank printable form** with empty lines for hand-fill (`ta-print-blank`).
- **Digital Leave of Absence Form (QMSF 12)** — `/hr/leave-of-absence`:
  - Backend `routes/leave_of_absence_routes.py` collection `leave_of_absence`, counter key `loa_no`. Endpoints: `/reference`, full CRUD, `/stats` (total / pending / approved / declined).
  - Sections: Employee Details (title/surname/first/emp-no/work-area/shift) → Duration (last day + time / resume + time / total days) → Paid Leave multi-select (8 types: Annual, Sick, RDO, LSL, Carers, Public Hols, Bereavement, Special) → Unpaid Leave (Sick, Special) → Approvals (Employee, Supervisor, Operations Manager) → Pay Office Use Only block.
  - Links to Employee directory (auto-fills name + emp_no); status badge in register (Pending / Approved / Declined / Completed).
  - Print: A4 portrait, doc-control footer (QMSF 12), checkbox-style leave type marks.
  - **Blank printable form** for hand-fill (`loa-print-blank`).
- **Testing**: 10/10 backend pytest pass (`/app/backend/tests/test_new_safety_hr_forms.py`), frontend ~95% E2E (heatmap counts verified after seeding hazards at c5-lC and c2-lB; all 3 form register/form/print/save/edit flows pass). Zero functional bugs; added row-delete testids per QA feedback.

#### Session: Feb 26, 2026 (a) — Plant Hazard Checks / Risk Assessments (QMSF 31)
- **Request**: Digitize the Plant Hazard Check / Risk Assessment Word doc (PHC 01 Pedestal Grinder template) into a dynamic, printable register module.
- **Backend** (`routes/plant_hazard_checks_routes.py`, collection: `plant_hazard_checks`, counter reused from `ncr_counters` under key `phc_no`):
  - Auto-incrementing `phc_no` via atomic `$inc`.
  - 16 hazard categories A–P seeded (Entanglement, Crushing, Cutting, Shearing, Friction, Striking, High-Pressure Fluid, Explosion, Electrical, Suffocation, Temperature, Fire, Slipping, Ergonomic, Other, Technical Data).
  - Full CRUD + `/stats` (total + overdue_for_review based on `next_review_date < today`) + `/hazard-categories` reference endpoint.
  - Search by machine_name / area / reason / PHC #.
- **Frontend** (`pages/PlantHazardChecks.js` at `/safety/plant-hazard-checks`, sidebar entry under SAFETY group):
  - Register view: QMSF 31 badge, Total / Overdue stat cards, search bar, sortable table with PHC # auto-formatted as `PHC-NN`.
  - Edit form: assessment metadata (machine, area, team, dates, reason) + collapsible 16-row hazard matrix (Applies Y/N → Consequence 1–5 → Likelihood A–E → auto-computed Risk badge colored Low/Medium/High/Extreme → Controls) + dual sign-off.
  - Risk auto-formula: `score = consequence * (6 - likelihoodIndex)`; ≥16 Extreme, ≥10 High, ≥5 Medium, else Low.
  - Print to A4 portrait with `tfoot` doc-control footer (QMSF 31), meta table, 7-col hazard grid, and signature lines.
- **Testing**: 12/12 backend pytest + 9/9 frontend E2E review-request bullets PASS (zero issues). Pytest suite at `/app/backend/tests/test_plant_hazard_checks.py`.

#### Session: Feb 25, 2026 — ISO Compliance Registers (QMSF 29 / 30)
- **Forklift License Register** (`/safety/forklift-register`, QMSF 29): Name + License # + Issue Date + Expiry Date + Notes. Auto-suggest expiry as Issue Date +5 years. Five stat widgets: Current / Expiring Soon (≤90d) / Expired / Missing Expiry / Total. Search + Status filter. Print to A4 portrait with QMSF doc-control footer.
- **First Aid Certificate Register** (`/safety/first-aid-register`, QMSF 30): Per-employee record with full **renewal history** (each renewal = certificate #, issuer, issue/expiry dates, multi-select attainments, uploaded PDF/Image). Stats use the latest certificate's expiry. Attainment codes (HLTAID009/010/011/012/013/014 seeded) editable via "Manage Codes" modal. Auto-suggest expiry = Issue Date + longest applicable refresh window (HLTAID009 +1y, others +3y).
- **File attachments** — upload PDF / PNG / JPG / WEBP / HEIC up to 10MB, stored base64 in `compliance_files` collection. Download via signed-in API call with attachment disposition. Files cascade-delete with their owning record.
- **Backend** (`compliance_registers_routes.py`): full CRUD + stats + searchable picklist for attainments + shared file upload/download/delete routes. New collections: `forklift_licenses`, `first_aid_certificates`, `first_aid_attainment_codes`, `compliance_files`.
- **Routing + Sidebar**: New entries under SAFETY group. QMSF 29 and QMSF 30 added to Document Control register.

#### Session: Feb 23, 2026 (b) — Digital NCR Register (QMSF 03 / 03A / 03B)
- **Request**: Replace the legacy Filemaker Non-Conformance Report (12,580 records) with a searchable digital module — counters, dropdowns sourced from Employees / Suppliers, editable Department picklist, Category = NCR | Concern, Credit Request flag → printable + searchable Credit Requests log, Recut Required → NCR Job Sheet.
- **Backend** (`routes/ncr_routes.py`, collections: `ncrs`, `ncr_counters`, `ncr_departments`, `credit_requests`):
  - Atomic NCR auto-numbering from 1 via `find_one_and_update($inc)`.
  - 11 default Departments seeded; editable via `GET/PUT /api/ncr/departments`.
  - Full CRUD (`/`, `/{id}`) + search (text/PO/customer/supplier/numeric NCR), category, status, date range.
  - `/api/ncr/stats` returns this-month + YTD NCR/Concern counts + optional date-range counts + last-12-months series.
  - Toggling `credit_request.enabled` auto-assigns a `credit_request_no` and mirrors a record into the searchable `credit_requests` collection (cascade-deleted with the NCR).
  - QMSF 03 / 03A / 03B seeded in document register; printable per kind via `buildPrintBodyOpen/Close`.
- **Frontend**:
  - `NCRRegister.js` at `/quality/ncr` — page header with QMSF 03 badge, four stat widgets (This Month NCRs/Concerns + YTD), date-range search panel that shows category-split counts for the selected period, sortable table with CR / JS tag chips, Print Register, link to Credit Requests Log.
  - `NCRForm.js` at `/quality/ncr/new` and `/quality/ncr/:id` — full multi-section form (Identifiers, Customer/Supplier/Product, Description & Root Cause, People & Sign-off, Allocated Persons Sales/Programming/Production, Cost & Outcome Flags, Credit Request & Recut). `SelectOrFree` widget gives dropdown-from-Employees plus free-text fallback. Modals for Credit Request and NCR Job Sheet. Inline Department picklist manager. Three Print actions: NCR (QMSF 03), Credit Request (QMSF 03A), NCR Job Sheet (QMSF 03B).
  - `CreditRequestsLog.js` at `/quality/credit-requests` — searchable log of every Credit Request raised.
- **Testing**: testing_agent_v3_fork iteration_11 — backend 25/25, frontend 100% of in-scope flows. Pytest at `/app/backend/tests/test_ncr_register.py`. Performance indexes added on `(category, date_raised)`, `ncr_no`, and credit_requests keys. NCR counter reset to 0 so user's first real entry begins at #1.

#### Session: Feb 23, 2026 (a) — JSA Register QMSF Number (QMSF 15)
- **Request**: Assign a QMSF (controlled document) number to the JSA Register listing page (separate from the individual JSA Form which is QMSF 14).
- **Number assigned**: **QMSF 15** — "JSA Register / Index", owner Quality Manager. Added to the `document_register` collection so it appears in Document Control and on every printout.
- **Frontend** (`JSARegister.js`):
  - New visible badge "QMSF 15" next to the page subtitle.
  - Print Register fully refactored to use the documented `<tfoot>` doc-control footer (`buildPrintBodyOpen` / `buildPrintBodyClose` + `buildPrintFooterCss`) — the printout now shows Form No / Issue / Revision Date and the page counter on every page, matching the other ISO-compliant printables.
  - Print remains A4 landscape; status badge styling preserved.
- **Test**: Visual smoke test (badge renders, doc fetched from `/api/document-control`). Self-tested via screenshot.

#### Session: Feb 22, 2026 (e) — Audit Schedule: Colour-coded Categories
- **Request**: Replace free-text cell marks (X for internal, COMPASS letters for external) with **colour-coded audit categories** so future auditing bodies can be added without code changes.
- **Backend** (`audit_schedule_routes.py`):
  - New `audit_schedule_categories` collection. Endpoints `GET /api/audit-schedule/categories` (auto-seeds defaults) and `PUT /api/audit-schedule/categories` (full replace + uuid normalisation for `tmp-*` ids).
  - Default seeds: **Internal Audit** (`INT`, blue `#2563eb`, legacy_chars `[X,x]`) and **External Audit – COMPASS** (`COMPASS`, red `#dc2626`, legacy_chars `[C,O,M,P,A,S]`).
  - `GET /{year}` and PUT/duplicate responses now embed the `categories` array for single-fetch convenience.
- **Frontend** (`AuditSchedule.js` rewrite):
  - Legend strip with colour chips above the matrix.
  - Click any cell → popover with category swatches + "Clear cell" → cell renders as solid colour with short label centred.
  - `resolveCell()` legacy mapping: existing X / C / O / M / P / A / S marks auto-render with the correct colour even without re-saving.
  - "Categories" modal (Palette icon) lets users add / edit / colour-pick / delete categories; legacy_chars field comma-separated.
  - Print/PDF renders coloured cell backgrounds + short label + legend block (`-webkit-print-color-adjust:exact`).
- **Testing**: iteration_10 — backend 18/18, frontend ~93% (1 medium bug: orphan/unknown cell ids rendered raw value). Fixed in the same iteration: cell-render fallback now returns blank for unmatched ids; same fix in print HTML; backend now normalises `tmp-*` ids to fresh uuids on category save. Self-verified via Playwright (delete-CUST-category-then-cell-blank flow → confirmed blank). Orphan tmp- value cleared from 2025 DB.

#### Session: Feb 22, 2026 (d) — Internal Audit Schedule module (QMSF 28)
- **Request**: Digitise the legacy Word "Internal Audit Schedule 2025" — annual matrix of audit elements × 12 months. Each cell holds a free-text mark (X = internal audit; letters C-O-M-P-A-S-S spread across rows = external COMPASS accreditation audit). Free editing, no change-tracking. Must support multiple years with "Duplicate Year" workflow.
- **Backend** (`routes/audit_schedule_routes.py`, collection `audit_schedules`):
  - `GET /api/audit-schedule/years` — distinct years descending.
  - `GET /api/audit-schedule/{year}` — auto-seeds 13 default ISO elements (6 marked priority) the first time a year is opened.
  - `PUT /api/audit-schedule/{year}` — upserts elements, cells, signature/date. Normalises missing cell months to "".
  - `POST /api/audit-schedule/{from_year}/duplicate-to/{to_year}` — clones elements + cell marks into a fresh year (resets signature/date). Returns 400/404/409 on bad inputs.
  - `DELETE /api/audit-schedule/{year}`.
- **Frontend** (`pages/AuditSchedule.js` at `/quality/audit-schedule`):
  - Year selector with "Add New Year" and "Duplicate Year" modal.
  - Editable matrix — each cell is a 4-char text input (covers X plus letters of COMPASS). No change history.
  - Element rows: priority toggle (star), rename, reorder ▲▼, delete. "Add Element" button.
  - Editable title and company (defaults: "Internal Audit Schedule {year}" / "ULTIMATE LASER").
  - Signed / Signed Date footer.
  - Audit-compliant Print / PDF using the documented `<tfoot>` doc-control footer pattern.
- **Routing**: added to `App.js` and Sidebar under QUALITY → "Audit Schedule" (CalendarCheck icon).
- **Testing**: testing_agent_v3_fork iteration_9 — 100% backend (13/13 pytest cases at `/app/backend/tests/test_audit_schedule.py`) + 100% frontend Playwright flows. Element column widened to 280px after QA flagged minor truncation.

#### Session: Feb 22, 2026 (c) — Injury Graph (LTI / MTI) module (QMSF 27)
- **Request**: Digitise the Injury Graph used to track Lost-Time Injury (LTI) and Medical-Treatment Injury (MTI) counts per month, showing a rolling 3-year window. User chose auto-aggregation from the Injury Register with manual monthly override capability, and two separate bar charts (3 grouped bars per month, one per year).
- **Backend** (`routes/injury_graph_routes.py`):
  - `GET /api/injury-graph/data?end_year=YYYY` — returns 3 years (end-2 → end) of LTI/MTI per month plus auto vs final values plus annual totals.
  - `PUT /api/injury-graph/override` — single (year, month, type) override.
  - `PUT /api/injury-graph/override-year` — bulk 12-month override per year/type.
  - `DELETE /api/injury-graph/override/{year}/{month}/{type}` and `…/override-year/{year}/{type}` — clear overrides.
  - Classification rule: `ceased_work == "Yes"` → LTI, else → MTI. Date pulled from `date_of_event` (fallback `date`).
  - Overrides stored in new `injury_stats_overrides` collection.
- **Frontend** (`pages/InjuryGraph.js`):
  - Two Chart.js Bar charts (LTI, MTI) with 3 grouped bars per month (slate/orange/blue palette).
  - End-Year selector controls the rolling window.
  - Edit modal per year/type with 12 month inputs and "Reset to Auto" button.
  - Audit-compliant PDF / Print export using `documentControl.js` `<tfoot>` pattern (renders chart canvases as PNG + Annual Totals table).
- **Routing**: `/safety/injury-graph` added to `App.js`; sidebar entry under SAFETY ("Injury Graph (LTI/MTI)" — BarChart3 icon).
- **Testing**: testing_agent_v3_fork iteration_8 — 100% backend (10/10 pytest cases), 100% frontend (all flows). Pytest file at `/app/backend/tests/test_injury_graph.py`.

#### Session: Feb 22, 2026 (b) — Housekeeping Audit Summary module (QMSF 26)
- **Request**: Build a digital version of the Housekeeping Audit Summary report. Auditor records findings per location. Must be portable (not tied to Ultimate Laser) — locations need a manageable dropdown.
- **Backend**: new `routes/housekeeping_audits_routes.py` — full CRUD on `housekeeping_audits` collection. Each audit holds `date`, `title` (optional override), `entries: [{location, findings}]`, `auditor`, `signature`, `signed_date`.
- **Locations source**: reuses the existing `/api/ohs-meetings/locations` endpoint + `ohs_settings` collection so the configurable list is shared across OHS Meetings and Housekeeping Audits.
- **Frontend** (`pages/HousekeepingAudits.js` — both list & form in one module):
  - List page with new/view/delete actions.
  - Form auto-seeds one entry per known location so the auditor just fills findings.
  - Location field is a real `<select>` with all configured locations + any custom values from legacy data.
  - **Manage Locations** dialog (same UI as OHS Meetings) — saving updates the shared list and refreshes every dropdown immediately.
  - Heading auto-formats to `HOUSEKEEPING AUDIT SUMMARY dd/mm/yyyy` (overridable).
  - Print renders entries as `Location` headings + findings body, then auditor / signature / signed date. Document Control footer `QMSF 26 / Issue 1 / February 2026 / Safety Manager`.
- **Routes** `/safety/housekeeping-audits[/new|/:id]` wired into `App.js`. Sidebar entry under SAFETY using `ClipboardCheck` icon.
- **Verified in preview**: created audit dated 13/09/2024 with auto-seeded 8 entries, added "Welding Bay" via Manage Locations, picked it on a new row, saved and printed. All values rendered correctly including custom location.

#### Session: Feb 22, 2026 — OHS Meeting print: fix cramped action columns
- **Issue**: When printing an OHS Meeting, the "Action by Whom / Action by When / Completed" values were running together with no visible separation ("GABORASAPNO" jammed in one column).
- **Cause**: The inner content table (`table.inner` in the print template) had `border: 0` and `padding: 2px 0` (zero horizontal padding) plus no explicit column widths — so cells collapsed against each other.
- **Fix**: 
  - Added `border: 1px solid #000`, `padding: 4px 6px`, `line-height: 1.35` and `word-wrap: break-word` to every inner-table cell.
  - Set `table-layout: fixed` with explicit column widths (Desc 60.5% / Whom 13.2% / When 13.2% / Status 13.1%) — aligns with the outer header columns.
  - Promoted classes `td.desc / td.whom / td.when / td.status / td.sec-title / td.empty / td.notes` so each cell type styles consistently.
  - Status cells now show color-coded backgrounds (Yes=green, No=red, Ongoing=amber) in print as well as on screen.
- **Verified in preview**: print metrics confirm Whom cell now has `border-top: 1px, padding-left/right: 6px, width: 227px`, section title rendered correctly. No more cramping.

#### Session: Feb 21, 2026 (g) — Electricity Usage: Greenhouse Gas comparison summary
- **Issue**: The GREENHOUSE GAS EMISSIONS (TONNES) chart on the Electricity Usage page didn't render a Comparable Summary card under it (the Dollars and KWH charts did).
- **Cause**: All three summary cards were gated by `total_change_percent !== 0`. The Dollars/KWH charts showed because their change was small but non-zero (1.06% / 0.04%); the Emissions change rounded to exactly 0% so its card was hidden.
- **Fix**: changed the gate on all three cards (Dollars, Emissions, KWH) from `total_change_percent !== 0` to `comparable_months > 0`. Added a neutral "➖ No Change: 0%" rendering when the percent is exactly zero (slate-grey instead of green/red).
- **Verified in preview**: GHG card now reads `➖ No Change: 0%` / `Comparable Total 2025: 215 Tonnes | Comparable Total 2025: 215 Tonnes` / `(Based on 5 months with data in both years)` / `Additional Emissions: 0 Tonnes`.

#### Session: Feb 21, 2026 (f) — OHS Meetings: quick-fill phrase library
- **Request**: Roll the Management Review quick-fill pattern out to OHS Meetings section items so common phrases (descriptions like "1st Aider Photos Need to be Updated", owners like "Sandun", due labels like "ASAP") can be picked rather than retyped.
- **Backend**: new `/api/ohs-meetings/phrases` (GET / POST / `/phrases/delete`) endpoints in `ohs_meetings_routes.py`. Auto-collects every distinct `description` / `action_by_whom` / `action_when` value from past meetings (with usage counts) and merges any manually-saved phrases stored in the existing `ohs_settings` singleton.
- **Frontend**:
  - **Description**: small "⌄ Quick fill..." dropdown above the textarea (auto + manual phrases, ×N count badges, most-used first) + "+ Save as quick fill" link below (appears at ≥3 chars).
  - **Action by Whom / Action by When**: native HTML `<datalist>` autocomplete on each input — type "A" and "ASAP" pops up, or click the field arrow to see all options. No save-link needed; auto-collection captures whatever you type when the meeting is saved.
  - Applied to both section item rows AND carry-over rows for consistency.
- **Verified in preview**: opened a new meeting. Description dropdown listed 3 auto-collected phrases (×3 / ×2 / ×1). Picked "1st Aider Photos…" → instantly filled. Datalist suggested "John" (Whom) and "SEPT" (When). Typed a brand-new description, clicked "+ Save as quick fill" → on save, the dropdown immediately showed it as a 4th option.

#### Session: Feb 21, 2026 (e) — Management Review: quick-fill phrase library
- **Request**: Lots of meeting answers rarely change ("No Changes", "Communication effective", "No new risks or opportunities", etc.). Need a dropdown of saved answers per agenda item that can be reused with one click, with the option to still type new info or grow the library over time.
- **Backend**: new endpoints under `/api/management-review/`:
  - `GET /phrases` — returns a per-agenda phrase library. Auto-collects every distinct `minutes` value used in past meetings (with usage count), merged with any manually-saved phrases stored in the new `management_review_settings` singleton.
  - `POST /phrases` — append a new phrase for a given `agenda_no`.
  - `POST /phrases/delete` — remove a manually-saved phrase.
- **Frontend**: above every Minutes textarea (non-Agenda #1 rows) a compact **"⌄ Quick fill from saved answers…"** dropdown is rendered when phrases exist for that agenda_no. Selecting an option immediately fills the textarea. Below the textarea a small **"+ Save as quick fill"** link appears whenever the box has ≥3 chars; clicking it persists the current text to the library for future meetings. Library refreshes immediately after save.
- **Verified in preview**: agenda #2 dropdown showed `"86 NCRs raised since last meeting (Last 6 Months) (×1)"` (auto-collected); agenda #14 showed `"No new risks or opportunities"` (manually saved earlier). Typed "Organization structure current stable" in agenda #8, clicked "+ Save as quick fill" → on refresh, agenda #8 dropdown now includes it.

#### Session: Feb 21, 2026 (d) — Management Review: print dates in dd/mm/yyyy
- **Request**: Printed Management Review dates must use **dd/mm/yyyy** format (matching the system timezone setting), not the raw `YYYY-MM-DD` from the date input.
- **Fix**: Imported the existing `formatDate()` helper from `utils/dateFormatter.js` (already wired to the system-timezone setting) into `ManagementReviewForm.js`. Added a local `fmt()` wrapper that returns empty string for null/empty dates. Applied to:
  - Window/PDF title
  - Header row "Date:" cell
  - Carry-over item "From: ..." sub-label (also in print)
  - On-screen carry-over "From: ..." sub-label for visual consistency
- **Verified in preview**: opened existing meeting 2025-01-16 → printed. Window title now reads `Management Review 16/01/2025`; header shows `Date: 16/01/2025`; carry-over sub-labels show `From: 11/07/2024 (#2)` / `From: 11/07/2024 (#5)`. No ISO `YYYY-MM-DD` dates remain anywhere in the printed output.

#### Session: Feb 21, 2026 (c) — OHS Meetings carry-over: Date column added
- **Request**: Items brought over from the last meeting need a dedicated **Date** column on the form and in the printed minutes (showing when the item was originally raised).
- **Frontend**: added an editable **Date** column as the FIRST column of the carry-over table — `<input type="date">` bound to `source_meeting_date`. Section title text shows under the date as small grey context. Auto-populated when "Load from Previous Meeting" pulls items; defaults to blank for manually-added rows so the user can backdate them.
- **Print**: carry-over block now renders as a nested table with its own headers (Date / Item / By Whom / By When / Completed) so the extra column doesn't disturb the section rows below. Date formatted DD/MM/YYYY in print.
- **Verified in preview**: added a manual carry item dated 02/10/2024 (Factory 2, "1st Aider Photos Need to be Updated", Ongoing). Form shows Date column with `10/02/2024` (en-AU display), print contains "ITEMS BROUGHT UP IN THE LAST MEETING" header + `02/10/2024` + the item description.

#### Session: Feb 21, 2026 (b) — OHS Meetings: configurable Locations dropdown
- **Request**: Replace the free-text "Factory" field with a proper dropdown, and make the list of Factories/Buildings/Workstations user-configurable so the package can be marketed to customers with different site setups.
- **Backend**: added `ohs_settings` singleton + `GET /api/ohs-meetings/locations` and `PUT /api/ohs-meetings/locations` endpoints. `/defaults` now also returns `locations`. Default seed `["Factory 1","Factory 2","Factory 3","Factory 4 & 5","Factory 6"]`.
- **Frontend**:
  - Extracted a top-level `FactorySelect` component that always preserves the current value even if it isn't in the active list (handles legacy data).
  - Replaced every Factory text input (carry-over rows + section item rows) with `FactorySelect` — now a proper `<select>` dropdown.
  - Removed the auto-seed of 5 factory rows when a section is created; new sections start with one empty row, the user adds more via the existing "Add row" button.
  - New **"Manage Locations"** button in the form header opens a dialog (textarea, one location per line). Saving persists immediately and refreshes the dropdown on every row.
- **Verified in preview**: new meeting starts with 1 empty row, Factory cell is `SELECT`, options list = 5 configured factories. Added 3 rows picking different factories. Opened Manage Locations, added "Main Office", "Loading Dock", "Workstation A" — dropdown immediately reflected the 8 options. Saved meeting with Factory 1/2/3/Main Office; reload preserved all 4 rows correctly.

#### Session: Feb 21, 2026 — OHS / Environmental Meetings (QMSF 25) + remove Outstanding Actions widget
- **Request**: (a) Remove the Outstanding Actions widget from the Dashboard — wasn't working for the user's flow. (b) Build a digital version of the OHS / Environmental Meeting Minutes form (QMSF 25), with carry-forward of unfinished action items so they can be reviewed at the next meeting.
- **Dashboard**: removed `<OutstandingActions />` import + render from `Dashboard.js`. The component file + backend aggregator are left in place but no longer referenced.
- **Backend**: new `backend/routes/ohs_meetings_routes.py` — CRUD on `ohs_meetings` collection. `GET /defaults` returns the 11 Objectives + 6 default attendees pre-loaded from the user's paper template. `GET /carryover-suggestions` walks every section item from the most recent meeting and surfaces anything where Completed ≠ Yes/N/A, plus any previously-carried items still open.
- **Frontend**:
  - `pages/OHSMeetings.js` — list with section/item/outstanding counts + "New" and "New (Carry Over Open Items)" buttons.
  - `pages/OHSMeetingForm.js` — full form: Date, Company, Attendees (multi-line), Apologies, Next Meeting, editable Objectives column, **Carry-Over** card (amber, highlights every item brought up at the previous meeting with its own Yes/No/Ongoing dropdown and source-meeting provenance), plus any number of **Sections** (each with a title like "HOUSEKEEPING AUDIT 16/1/2025", a Factory/Description/Whom/When/Completed table, and section notes). Up/down arrows reorder sections; default new section seeds 5 factory rows.
  - **Print template** matches the paper QMSF 25 layout: Objectives column on the left (rowspan), Company name + Date header in the middle, central content table with the carry-over block (amber-tinted) at the top and each section underneath. Document Control footer `QMSF 25 / Issue 2 / June 2023 / Safety Manager`.
- **Routes**: `/safety/ohs-meetings`, `/new`, `/:id`. Sidebar nav entry added under SAFETY (HardHat icon).
- **ISO Modules**: "OHS Meetings" added to the dropdown registry.
- **Verified in preview**: created meeting 2024-10-02 with 3 items (one "No", one "Yes") → carry-over endpoint returned 2 open items → meeting 2 created via "New (Carry Over)" → both items pre-loaded into the amber card with source-meeting reference, one marked Yes — print confirmed footer + carry header + 11 objectives + 6 attendees all present.

#### Session: Feb 20, 2026 (d) — Inline editing on Outstanding Actions widget
- **Request**: During the morning stand-up, change ownership / push out a due date / mark something Yes directly from the Dashboard widget, without navigating to the source.
- **Backend**: aggregator now returns a `target` descriptor (`kind` + IDs) on every row. New endpoint `PATCH /api/outstanding-actions/update` accepts `{target, owner?, due_label?, status?}` and writes through to the source record. Supports `mgmt_action` (writes back to the agenda row's action), `mgmt_carry` (writes back to the carry-over item) and `audit_followup` (updates the follow-up doc). Injuries remain read-only with a link to the record.
- **Frontend**: rebuilt `components/OutstandingActions.js` row UI — each row exposes editable controls for **Owner** (text), **Due** (`<input type=date>`) and **Status** (Yes/No/Ongoing/N/A). Owner & due commit on blur / change; status commits immediately on change. Marking Yes / N/A removes the row from the list optimistically. Overdue dates render in red with an alert icon. Small "Refresh" button forces a server re-fetch.
- **Verified in preview**: set owner "John Tsoukalas" on row, pushed a due date to `2025-03-31`, marked another row Yes → list dropped from 5 → 4 items; reload preserved all changes; status colours animate correctly.

#### Session: Feb 20, 2026 (c) — Outstanding Actions dashboard widget
- **Request**: Single screen on the Dashboard surfacing every open action across Management Reviews, ISO Audits and Injury follow-ups, sorted by due-date — "ready for your morning stand-up".
- **Backend**: new `routes/outstanding_actions_routes.py` aggregator endpoint `GET /api/outstanding-actions`. Walks `management_review_meetings` (every action in agenda_rows + every carry-over item), `audit_follow_ups` (status != Closed), and recent (last 90 days) `injury_register` entries flagged with referral/ceased-work. Coerces free-form due-date strings ("Oct 2024", "15/10/2024", "September 2025", ISO) into sortable `YYYY-MM-DD`. Returns flat list + counts per source.
- **Frontend**: `components/OutstandingActions.js` widget mounted on `pages/Dashboard.js` right under the stats grid. Items are clickable rows linking back to the source (`/quality/management-review/:id`, `/quality/audits/:id`, `/safety/injury-register/:id`). Each row shows source pill (colour-coded), description, sub-label, owner, due-date (with overdue highlight), and status badge. "Show all N" / "Show less" toggle when more than 8 items.
- **Verified in preview**: widget renders with `5 total | 5 review` badges; all 5 open management-review actions visible with correct status colours; clicking the first item navigated to the source meeting.

#### Session: Feb 20, 2026 (b) — Multiple action lines per Management Review agenda item
- **Request**: Some agenda items have 2+ actions (e.g. Agenda #5 "Internal Audit completed" + "Next Internal Audit Due September"). Need a way to add extra action lines on each agenda item, each with its own owner / due date / Completed status.
- **Schema**: `AgendaRow.actions: List[ActionDetail]` added on the backend (`ActionDetail` = minutes/by_whom/when/completed). Legacy single-field rows still accepted; frontend `normalizeRow()` migrates old data into `actions: [{...}]` shape on load. `carryover-suggestions` endpoint iterates over every action of the previous meeting and surfaces each open one as a separate carry-over.
- **UI**: each agenda item renders one `<tr>` per action with `rowSpan` on the Agenda cell. A small **"+ Add another action"** link sits under the agenda text; the trash icon appears next to the Completed dropdown when an item has more than one action.
- **Print**: matching `rowspan` applied to the agenda column in the printed minutes table.
- **Verified in preview**: opened meeting #2, added a 2nd action to Agenda #5 ("Next Internal Audit Due September 2026" / Ongoing), added a 3rd then removed it, saved, reloaded → both actions persisted. Print confirmed `rowSpan=2` on the agenda cell and Document Control footer intact.

#### Session: Feb 20, 2026 — Management Review: carry-over items embedded in Agenda #1
- **Request**: Agenda Item #1 ("Review actions from previous Management Review") should not just contain the text "Actions from previous meeting reviewed" — instead, it should display the **list** of individual items carried forward from the previous meeting so each can be marked off individually.
- **Fix**: Removed the separate bottom "Carry-Over Items" card. Moved the carry-over editor directly into Agenda Item #1's Minutes cell as a nested sub-table (#, Item/Description, By Whom, By When, Completed, delete). Items show their source meeting date + source agenda number for traceability. "Load from Previous Meeting" and "Add item" buttons sit at the top of the cell. Print now embeds the same nested table inside Agenda #1's Minutes column (no separate carry-over section).
- **Verified in preview**: opened existing meeting #2 — 2 carry-over items render inline within Agenda #1, each with its own Completed dropdown; bottom card gone; print output has carry items as a nested table within Agenda #1 row (3 rows including header), no standalone section, `<tfoot>` footer intact.

#### Session: Feb 19, 2026 (f) — Management Review Meetings (QMSF 05)
- **Request**: Digital fillable version of the QMSF 05 Management Review form. Open items must carry over to the next meeting so they can be re-reviewed (Yes/No/Ongoing). Printable with proper header & footer.
- **Backend** (`backend/routes/management_review_routes.py`): full CRUD + `/agenda-template` (returns the fixed 14-item ISO/IMS agenda) + `/carryover-suggestions` (returns all rows in the most recent meeting whose `completed` is not Yes/N/A, plus any unfinished previous carry-over items — so issues persist forward until closed). Collection: `management_review_meetings`.
- **Frontend**:
  - `pages/ManagementReview.js` — list with completed/outstanding badges per meeting and a "New (Carry Over Open Items)" shortcut button when at least one prior meeting exists.
  - `pages/ManagementReviewForm.js` — full editable agenda table (14 rows seeded from the standard template), Carry-Over Items table with "Load Outstanding from Previous" and "Add row" buttons, and a Next Meeting field. Each row has a color-coded `completed` dropdown (Yes=green / No=red / Ongoing=amber / N/A=grey).
  - Print: native HTML `<tfoot>` pattern. Includes the blue company-name / title header strip (matching the paper QMSF 05), 14-row minutes table with color-coded status cells, an optional "Carry-Over Items from Previous Meetings" table, and a NEXT MEETING line. Document Control footer pulls "Management Review" (defaults to QMSF 05 / Issue 2 / June 2023 / Quality Manager).
- **Routes** `/quality/management-review`, `/new`, `/:id` wired. Sidebar nav entry added under QUALITY (between ISO Audits and Supplier Reviews) using the existing `ClipboardList` icon.
- **ISO Modules**: "Management Review" added to the Document Control dropdown registry.
- **Verified end-to-end in preview**:
  1. Created meeting 1 (`2024-07-11`) with agenda #1=Yes, #2=Ongoing, #5=No.
  2. Clicked "New (Carry Over Open Items)" — meeting 2 auto-loaded the 2 outstanding rows (NCRs + Internal Audit) into the Carry-Over table with source meeting reference.
  3. Marked carry-over #1 as Yes, saved.
  4. Print window opened with `tfoot` footer ("Form No: QMSF 05 | Issue: 2 | Revision Date: June 2023 | Owner: Quality Manager"), 14 agenda rows + 2 carry-over rows, colour-coded status cells.

#### Session: Feb 19, 2026 (e) — Injury Register print fits on one A4 page
- **Request**: Print was spilling onto a second page (just the date/time/sign-off row).
- **Fix**: Tightened the print template in `InjuryRegisterForm.js` — `@page` margin 8mm (was 12mm via default), body font 9pt (was 10pt), h1 13pt (was 16pt), section-title 9pt (was 10pt), .cell padding 2×5px (was 4×6px), .desc min-height 28px (was 60px), section-title margin 4px (was 8px). Body diagram image scaled to 280px width (was 420px) in `renderBodyDiagramHtml`. Description block + diagram now sit side-by-side with equal heights.
- **Verified in preview**: rendered content height = 700px vs A4 portrait available 1063px (8mm top + 8mm bottom margins). Fits cleanly on one page with footer.

#### Session: Feb 19, 2026 (d) — Injury body diagram now uses real anatomy reference
- **Issue**: Hand-drawn SVG silhouettes looked like aliens — wrong proportions, no shoulders/chest.
- **Fix**: Replaced both SVG bodies with the company's actual QMSF 19 reference image (`/app/frontend/public/assets/injury_body_ref.png`). The image carries proper anatomical front + back silhouettes AND the embedded code legend. Code-picker moved to a horizontal row above the diagram. Click handler auto-detects `side` (front vs back) by x-position and ignores clicks on the legend column. Print template (`renderBodyDiagramHtml`) updated to overlay markers on the same reference image at the saved %-coordinates.
- **Verified in preview**: 2 markers placed (L=front, Bu=back) at correct coordinates; legend-area click correctly ignored.

#### Session: Feb 19, 2026 (c) — Injury Register module (QMSF 19)
- **Request**: Make the paper "Register of Injury" (QMSF 19) form completable online. Mark injury location on a body diagram. Record number must auto-increment sequentially. Records stored for company history. Printable.
- **Backend**: New `backend/routes/injury_register_routes.py` with `GET /api/injury-register` (list), `GET /api/injury-register/next-number`, `GET /api/injury-register/{id}`, `POST` (auto-assigns `record_number = max+1`, label as 5-digit zero-padded e.g. `00001`), `PUT`, `DELETE`. Collection: `injury_register`.
- **Frontend**:
  - `pages/InjuryRegister.js` — list with search, next-number badge, view/print/delete row actions
  - `pages/InjuryRegisterForm.js` — full fillable form (worker, employer, accident details, injury description, body diagram, cause/treatment, sign-off)
  - `components/BodyDiagram.js` — interactive front + back SVG silhouettes. Click anywhere to drop a marker tagged with selected injury code (A/Bl/Bu/C/D/F/L/P/S/T). Markers stored as `{side, x%, y%, code, note}`. Includes a `renderBodyDiagramHtml()` helper for the print view that renders the same diagram inline with code legend.
  - Print uses native HTML `<tfoot>` pattern via `buildPrintBodyOpen/Close` — Document Control footer auto-pulls "Injury Register" (defaults to `QMSF 19 / Issue 1 / June 2023 / Safety Manager`).
- **Routes** wired in `App.js` (`/safety/injury-register`, `/new`, `/:id`); sidebar nav entry added under SAFETY with `HeartPulse` icon.
- **ISO Modules**: Added `Injury Register` to `iso_modules_routes.ISO_MODULES` so it appears in the Document Control "Related Module" dropdown.
- **Verified in preview**: Created record 00001 ("John Smith / Operating press brake"), next-number ticked to 00002, body markers placed on both front and back silhouettes, print window opened with correct footer "Form No: QMSF 19 | Issue: 1 | Revision Date: June 2023 | Owner: Safety Manager | Title: Register of Injury" + body diagram rendered.

#### Session: Feb 19, 2026 (b) — Document Control: numerical order + search
- **Request**: Document Control Register was showing entries in insertion order ("QMSF 07, QMSF 01, QMSF 02, QMSF 01A, QMSF 10, QMSF 14, ..."). User wanted natural numerical order (01 → 01A → 02 → 07 → 10 → 14 → ...) for both screen display and printed PDF, plus a search box.
- **Fix**: Added `sortByFormNo` helper in `DocumentControl.js` that extracts prefix + integer + alpha-suffix from each `form_no` so QMSF entries always sort: integer first, then suffix (`01`, `01A`, `02`, `7`, `10`, `100`). Non-QMSF prefixes (e.g. `POL 01`) fall after QMSF alphabetically.
- Added a `Search` input (top-right of the Register card, `data-testid="doc-search-input"`) that filters across form_no / title / type / issue / owner / related_module / location / notes.
- Print now uses the same sorted+filtered `visibleItems` list so the printed PDF order matches what's on screen.
- **Verified in preview**: 9 records render in numerical order (QMSF 01, 02, 10, 14, 14, 16, 17, 18, 19) and search input is wired.
- **Note**: User needs to redeploy preview → production for live order/search.

#### Session: Feb 19, 2026 — Calibration Schedule print footer fix
- **Bug**: On production deploy, Calibration Schedule PDF showed the last visible row sliced/cut by the footer band (user screenshot, 18 instruments paginated to 2 pages). Module was still using the legacy html2canvas + jsPDF capture-as-image approach with a hand-drawn footer, which masked half-rows on the page boundary.
- **Fix**: Migrated `CalibrationSchedule.js`'s `handlePrint` to the same native HTML print-window + `<tfoot>` wrapper pattern already used by Skills Matrix, MSDS, JSA, etc. Pulls footer data from Document Control via `getControlledDocumentByFormOrModule('QMSF 07', 'Calibration Schedule')`. Removed `html2canvas` and `jspdf` imports.
- **Verified**: Print window opens with `table.dc-page-flow > tfoot` and `.dc-print-footer` correctly populated (`Form No: QMSF 07 | Issue: 4 | Revision Date: November 2025 | Owner: Quality Manager`). Same proven cross-browser pattern — no content/footer overlap on multi-page documents.
- **Note**: User needs to redeploy preview → production to push the fix live.

#### Session: June 18, 2026 — Footer Roll-out + Module Dropdown

3. **Print footer migration to all printable QUALITY/SAFETY/ENVIRONMENT modules ✨**
   - Replaced legacy `@page @bottom-left { content: ... }` hard-coded footers with the new `buildPrintFooterCss()` + `buildPrintFooterHtml()` `position: fixed` pattern across:
     - `SupplierReviews.js` (was hard-coded `QMSF 10 Issue 2: February 2023`, now auto-pulled `QMSF 10 Issue 3 29/04/2026`)
     - `TrainingMatrix.js` (Skills Matrix)
     - `EvacuationDrills.js`
     - `MSDSRegister.js`
     - `LegalRequirements.js` (also stripped the now-redundant "Print tip: uncheck Headers and footers" warning banner since the new fixed footer doesn't need it)
     - `EnvironmentalRiskAssessment.js` (both index + matrix print pages)
   - **Footer clipping fix** in `documentControl.js` helper: changed footer position from `bottom: 0` → `bottom: 6mm`, increased `@page bottom margin` to `32mm`, nudged page-number `@bottom-right` by `margin-bottom: 8mm`. Resolves the "half text cut off" issue reported on Skills Matrix and all other footers.
   - Each migrated module now uses `getControlledDocumentByFormOrModule(formNo, moduleName)` so the footer pulls live values from the Document Control register. Defaults provided so it still works even if the register isn't populated.
   - Seeded `QMSF 14/16/17/18/19` in preview DB to match the user's production register entries.

4. **Centralised ISO Module registry + dropdown ✨**
   - New backend `/api/iso-modules/modules` returns the canonical list of all printable modules grouped by area (Quality / Safety / Environment / Equipment / System).
   - `DocumentControl.js` "Related Module" field is now a **grouped `<select>` dropdown** rather than free-text input. Adding a new ISO module to `/app/backend/routes/iso_modules_routes.py:ISO_MODULES` automatically populates this dropdown app-wide.
   - Existing/legacy related_module values are preserved (shown with "(legacy)" suffix) so no data is lost.
   - 17 modules available across 5 groups, with each entry exposing `name`, `group`, and `default_form_no`.



#### Session: June 17, 2026 — Customer Satisfaction Module 🎯

2. **Customer Satisfaction Module (QMSF 01A) — Brand-new ISO 9001 module ✨**
   - **Yearly campaigns** under QUALITY → Customer Satisfaction (`/quality/customer-satisfaction`). One campaign per year; status Active/Closed; cannot duplicate years.
   - **Generic public survey link** per campaign: `/survey/customer-satisfaction/{token}` — no login required; Sales shares the link with all customers.
   - **Sequential Response IDs** auto-generated: `CSS-{year}-{NNN}` (CSS-2026-001, CSS-2026-002, …).
   - **Public survey page** renders all 7 scored questions (5-point scale per QMSF 01A), 3 free-text fields (Improvements / Suggestions / Additional Comments), and contact info. Validates required fields. Shows thank-you screen with Response ID on submit.
   - **Confidential admin view** (Admin / Quality Manager only): expandable per-year accordion with Responses tab + Analysis Report tab. Non-admins see a Lock screen.
   - **Analysis Report**: overall %, aggregate score, 7-KPI category averages, individual company scores (sorted desc), verbatim free-text feedback grouped by company.
   - **AI Recommended Actions** via Gemini 2.5 Pro (Emergent LLM Key + `emergentintegrations`): one-click button generates prioritised, role-attributed action items from the verbatim feedback; persisted on the campaign and re-rendered in the printed report.
   - **Native HTML printing** for both:
     - Per-response print (mirrors QMSF 01A original form layout with ● filled / ○ empty)
     - Summary report print (CONFIDENTIAL banner, stats box, category table, company scores table, feedback sections, AI recommendations block)
     - Both use `@page` CSS, `page-break-inside: avoid`, and auto-pulled Document Control footer (QMSF 01A, Issue, Revision Date, Owner)
   - **Token rotation**: Admin can rotate the public link if it's been shared inappropriately.
   - **Seed data**: Document Control entry `QMSF 01A — Customer Satisfaction Survey` and 2026 campaign created in the DB during this session.
   - **Backend** `/app/backend/routes/customer_satisfaction_routes.py`: 14 endpoints (Admin CRUD, public GET/submit, report, AI). Public submit captures `x-forwarded-for` for audit trail. Tested 18/18 pytest cases passing.
   - **Frontend** `/app/frontend/src/pages/CustomerSatisfaction.js` (admin) + `/app/frontend/src/pages/CustomerSatisfactionPublicSurvey.js` (public, no auth dependency).
   - **Sidebar**: New `Customer Satisfaction` item under QUALITY group with `Smile` icon.



#### Session: June 17, 2026

1. **JSA Print Layout — Native HTML Rewrite & Document Control Integration ✨**
   - Removed `html2canvas` + `jsPDF` pipeline (was slicing table rows in half across pages — non-compliant for audit)
   - Rebuilt `handlePrint` in `/app/frontend/src/pages/JSADetail.js` using native `window.open` + `document.write`
   - **A4 layout** with `@page` margins: `16mm 12mm 22mm 12mm` reserved for header/footer bands
   - **CSS `@bottom-left` margin box** renders Document Control footer on every page (Form No, Issue, Revision Date, Owner, Title)
   - **CSS `@bottom-right` margin box** renders `Page X of Y`
   - **`page-break-inside: avoid`** on every hazard row + review row + sign-off block → no more split rows
   - **`thead { display: table-header-group }`** repeats hazard table header on each printed page
   - Document Control footer **auto-pulls from `/api/document-control`** via new helper `/app/frontend/src/utils/documentControl.js`:
     - `fetchControlledDocuments()` — cached fetch (60s TTL)
     - `findControlledDocument(items, moduleName)` — case-insensitive contains match against `related_module`, then `title`, then `form_no`
     - `getControlledDocument(moduleName)` — convenience wrapper
     - `buildDocControlFooter(doc, defaults)` — safe footer object with fallbacks
   - JSA passes `'JSA'` (falls back to `'Job Safety Analysis'`) for lookup; defaults to `QMSF 14 / Issue 1` if registry empty
   - On-screen footer also shows the live Document Control stamp under the JSA detail card (`data-testid="doc-control-stamp"`)
   - Pattern is now the template for rolling Document Control out to every printable module (Calibration, MSDS, Environmental Risk, etc.)



#### Session: February 26, 2026

1. **Environmental Risk Assessment — 5×5 Matrix Upgrade ✨**
   - Replaced free-text 1–5 risk score with proper **ISO 14001 Revision 3** Consequence × Likelihood matrix
   - **Consequence (1–5)**: Negligible, Minor, Major, Critical, Catastrophic — with full descriptors (Australian regulatory language)
   - **Likelihood (A–E)**: Frequent, Reasonable/Probable, Occasional, Remote, Rare
   - **Auto-computed Score (0–8)** from 5×5 matrix (single source of truth — both frontend and backend recompute on save)
   - **Risk tiers**: 6–8 High (red), 4–5 Medium (orange), 1–3 Low (yellow), 0 None
   - Same matrix applied to **Revised** values (after corrective action re-assessment)
   - In-page **Risk Matrix legend** with colored 5×5 grid and Action Guideline table
   - Print template now includes matrix legend on every assessment PDF
   - Frontend: `/app/frontend/src/pages/EnvironmentalRiskAssessment.js`
   - Backend: `/app/backend/routes/environmental_risk_routes.py` (`RISK_MATRIX` + `_compute_score` + `_level_from_score`)

2. **Environmental Risk — AI Suggest Actions ✨**
   - Per-impact "AI Suggest Actions" button (purple, sparkle icon) calls `/api/environmental-risks/ai-suggest-actions`
   - Uses Gemini 2.5 Pro via Emergent Universal Key (ISO 14001 environmental compliance prompt)
   - Suggestions are appended (not overwritten) to Corrective Actions field
   - Verified live: returns numbered list of 3–5 concrete actions

3. **Environmental Risk — "By Whom" Dropdown**
   - Free-text field replaced with standardised dropdown: Operations Manager / Quality Manager / All

#### Session: February 23, 2026 (Continuation)

3. **Legal Requirements (Compliance Register) Module — NEW ✨**
   - New page under Quality menu: `/quality/legal-requirements` (icon: Scale)
   - Backend: `/app/backend/routes/legal_requirements_routes.py` — full CRUD + AI endpoints + audit trail
   - Frontend: `/app/frontend/src/pages/LegalRequirements.js`
   - Fields per item: Name, Category, Sub-category, Year/Version, Last Review Date, Next Review Date, Responsible Person, Notes
   - Default categories: Victorian Legislation, Victorian Codes of Practice, Commonwealth Legislation, Australian Standards, Industry Standards, Environmental, Other
   - **Two views**: "Register View" (read-only printable layout) and "Manage / Edit" (CRUD controls)
   - **Print**: Generates clean A4 register matching original docx style — company name, review date, scope, grouped by category/sub-category
   - **Date format**: All dates display via centralised `formatDate` utility (DD/MM/YYYY from Settings — Australia/Melbourne timezone)
   - **AI Check ✨ (Gemini 2.5 Pro via Emergent Universal Key)**:
     - Per-item button → opens dialog with: is_current, latest_version, last_amended_date, summary, confidence, source URLs
     - **Auto-update**: when AI finds a newer year with high/medium confidence, the year is automatically updated on the record
     - "AI Check All" bulk button (capped at 3 concurrent calls) — also auto-updates outdated items
     - Verified live: tested "Dangerous Goods Regulations 2012" → AI auto-updated to 2022 with high confidence
   - **Audit trail (`change_history` array)**: every change is logged for ISO/auditor review, including:
     - `created` (record creation)
     - `manual_edit` (with field-level from→to diff)
     - `ai_check` (no change applied)
     - `ai_auto_update` (year auto-changed by AI — with old_year, new_year, AI summary, source URLs)
     - `manual_accept_ai_update` (user-triggered apply)
     - Each entry stamped with username, ISO timestamp, and AI confidence/sources where applicable
   - **History dialog**: per-item History icon shows full change log with formatted timestamps, action badges, and from→to diffs
   - Honest disclaimer in UI: AI training cutoff may miss recent amendments — verify with linked official sources
   - Register starts empty per user request

1. **Multi-item Quote Edit Validation (P0) - VERIFIED**
   - Previous agent's `handleEditQuote` fix confirmed working via screenshot test
   - All 3 existing multi-item quotes (#84, #120, #121) open Edit dialog correctly with:
     - Line Items card populated with correct counts, descriptions, quantities, totals
     - TOTAL QUOTE VALUE matching backend
     - Edit/Delete buttons on each line item
   - No JS errors, no blank screens

2. **Qty Breaks on Multi-Item Printed/Downloaded Quote (P0) - FIXED**
   - Root cause: Print/PDF logic only checked `quoteData.quantity_breaks` (top-level). Historic multi-item quotes (e.g., Quote #120) stored qty_breaks on line items but NOT at top level, so breaks weren't rendering on print/PDF outputs
   - Fix: Added fallback in print HTML (line ~2151), PDF download HTML (line ~2523), and handleEditQuote (line ~1631) to use `line_items[0].quantity_breaks` when top-level is empty
   - Verified: Quote #120 print now shows "Qty: 50 per item" and "Qty: 100 per item" break tables
   - Verified: Quote #120 edit dialog now displays populated quantity break rows (50, 100)
   - Verified: Quote #121 (top-level breaks) still works correctly (no regression)

#### Session: February 8-9, 2026

5. **Shop Floor Entry Timer Bug (P0) - FIXED**
   - Fixed: Timer now correctly excludes pause duration
   - Frontend `calculatePauseSeconds` function calculates pause time from pauses array in real-time
   - When paused, timer stops incrementing; when resumed, timer continues from correct point
   - Active time = Total elapsed time - Pause duration

6. **Production Dashboard Not Showing Active Jobs (P0) - FIXED**
   - Fixed: Active operators and jobs now display correctly when time entry is started
   - "Who's Working Now" section shows operator name, job number, process, and status badge
   - Dashboard refreshes every 30 seconds automatically

7. **Production Dashboard Bottlenecks API Error (P1) - FIXED**
   - Fixed: TypeError when `efficiency_percent` is `None` in database
   - Added null handling in `identify_bottlenecks` endpoint
   - All Production Dashboard API endpoints now working correctly

8. **Time Saved to Job Sheet on Complete (P0) - FIXED**
   - When job is marked complete, actual work time (excluding pauses) is saved to Job Sheet
   - Efficiency metrics calculated: estimated_hours, actual_hours, hours_saved, efficiency_percent
   - Backend `calculate_duration` function correctly sums active time intervals

9. **Complete Job Sheet Auto-Population from Shop Floor Entry (NEW)**
   - When opening "Complete Job Sheet" dialog, data auto-populates from Shop Floor time entries
   - Start Time: First time entry's start time
   - End Time: Last time entry's end time  
   - Operator Name: Names from all time entries (comma-separated if multiple)
   - Production Notes: Notes from time entries
   - Green banner indicates "Time data auto-populated from Shop Floor Entry"
   - "From Shop Floor" badges on Start/End Time fields
   - Users can still manually adjust all values if needed

#### Previous Session (January 2026)

1. **Quote Rounding UI Fix (P0)**
   - Fixed: When "Unit Price" rounding is applied, the PRICE PER PART now updates correctly
   - Both "Unit Price" and "Overall Total" rounding options work properly
   - "(Rounded)" indicator shows when rounding is active
   - Original price shown crossed out for transparency

2. **Admin Tools - Packing Slip Fix (P1)**
   - Added Admin Tools section to Settings page
   - Created backend API endpoints for preview and execute operations
   - Tool scans invoice items to find unflagged packing slips
   - Preview shows database stats and items to fix
   - Execute marks identified packing slips as invoiced
   - Requires admin authentication

3. **Admin Tools - Database Maintenance Suite (NEW)**
   - **Database Health Check**: Shows collection counts, status breakdowns, overall health score
   - **Orphan Record Detection**: Finds records referencing non-existent parents
   - **Data Integrity Check**: Identifies records with missing required fields

4. **Dimensional Inspection Checklist - Job Sheet Page 2 (NEW)**
   - Quote Q.A. Section with inspection items (dimensions/angles)
   - Job Sheet Inspection Interval configuration
   - Auto-generated checkpoints based on quantity and interval
   - Page 2 Print with Dimensional Inspection Checklist

### Known Issues
1. **Production Performance (P2)** - Production deployment running with `--reload` flag causing slowness. Platform-level configuration issue.
2. **Broken Drawing Downloads (P3)** - Legacy quote drawings on ephemeral filesystem need migration tool.
3. **Database Query Optimization (P3)** - Queries need pagination and indexing for scalability.
4. **Security Vulnerabilities (P1)** - Unpatched vulnerabilities in `jspdf`, `react-router-dom`, `pymongo`, `starlette`. Need to update packages.
5. **Mixed Content Warning (P3)** - Minor: Settings API call has HTTP/HTTPS mixed content in some scenarios. Non-blocking.

### Architecture Notes
- `Quotes.js` is 4000+ lines and needs refactoring into smaller components
- Material selection uses 3-step filter (Type → Thickness → Grade)
- Email functionality uses backend PDF generation service

## API Endpoints (Key)
- `POST /api/email/quote/{quote_id}` - Send quote PDF via email
- `GET/POST /api/settings/admin/fix-invoiced-packing-slips/preview|execute` - Admin data fix tools
- `GET /api/settings/admin/database-health` - Database health statistics
- `GET /api/settings/admin/orphan-records` - Orphan record detection
- `GET /api/settings/admin/data-integrity` - Data integrity validation
- `GET/POST/PUT/DELETE /api/jsa/*` - JSA module CRUD
- `GET /api/shop-floor/active-jobs` - Get available jobs for time tracking
- `GET /api/shop-floor/time-entries/active` - Get active time entries for operator
- `POST /api/shop-floor/time-entries` - Start new time entry
- `POST /api/shop-floor/time-entries/{id}/pause` - Pause time entry
- `POST /api/shop-floor/time-entries/{id}/resume` - Resume time entry
- `POST /api/shop-floor/time-entries/{id}/stop` - Complete time entry and calculate efficiency
- `GET /api/production-dashboard/live-metrics` - Real-time production metrics
- `GET /api/production-dashboard/bottlenecks` - Production bottleneck analysis
- `GET /api/production-dashboard/daily-summary` - Daily production summary

## Tech Stack
- Frontend: React + Tailwind CSS + Shadcn/UI
- Backend: FastAPI (Python)
- Database: MongoDB
- Authentication: JWT-based

## Test Credentials
- Username: admin
- Password: admin123

## Files Modified This Session
- `frontend/src/pages/ShopFloorEntry.js` - Fixed timer calculation with `calculatePauseSeconds` function
- `backend/routes/production_dashboard_routes.py` - Fixed None handling in bottlenecks endpoint

## Session: March 5, 2026

### Completed ✅

#### Press Brake Quoting Engine (Full Specification)
- **Base Bend Time Model**: 15/20/30/45 sec based on bend length
- **Thickness Modifier**: ×1.0 (≤2mm), ×1.15 (2-6mm), ×1.30 (6-10mm), ×1.50 (>10mm)
- **V-Die Modifier**: Auto-calculated (V = thickness × 8), ×1.0 to ×1.35
- **Flip Time Model**: 3/5/8/12 sec per flip based on bend length
- **Weight Handling**: 0/5/10/20/30 sec based on part weight
- **Difficulty Factor**: Simple (×1.0), Moderate (×1.2), Complex (×1.5)
- **Box Last Bend Penalty**: +50% for box/complex geometry
- **Second Operator Rule**: Required if weight >15kg OR length >2000mm
- **Override Seconds per Part**: Manual override for competitive pricing
- **UI Fields**: Bend Length, Number of Bends, Thickness, V-Die, Part Weight, Flips, Geometry Type, Difficulty, Quantity

#### Drawing Analysis Module
- **DXF Upload & Analysis**: Detects bends from BEND/FOLD/UP/DOWN layers, extracts dimensions from geometry
- **PDF Upload & Analysis**: Text extraction for UP/DOWN annotations, material type, thickness, dimensions
- **Auto-Population**: Detected values auto-fill Press Brake calculator fields
- **Confidence Levels**: LOW/MEDIUM/HIGH based on detection quality
- **All Fields Editable**: Estimator can adjust any auto-detected value

#### Dashboard Metrics Fix
- Fixed date parsing for Revenue YTD/MTD (handles both string and datetime formats)
- Fixed None value handling in active work hours calculation
- Added fallback to estimated_hours when timing data unavailable

### New API Endpoints
- `POST /api/drawing-analysis/analyze` - Upload and analyze DXF/PDF drawings
- `POST /api/drawing-analysis/calculate-weight` - Calculate part weight from dimensions
- `GET /api/part-history/search?q=` - Search parts by description, customer, quote number
- `GET /api/part-history/detail/{quote_id}` - Full production history for a part

### Files Modified/Created
- `frontend/src/pages/Quotes.js` - Enhanced Press Brake calculator, Drawing Upload UI
- `backend/routes/drawing_analysis_routes.py` - NEW: DXF/PDF analysis module
- `backend/routes/dashboard_routes.py` - Fixed date parsing and None handling
- `backend/server.py` - Added drawing_analysis_routes router
- `backend/requirements.txt` - Added ezdxf, PyMuPDF dependencies

## Session: March 31, 2026

### Completed

#### Part History Module - NEW
- **Search**: Search by part description, drawing number, customer name, or quote number
- **List View**: Shows all quotes with part description, customer, qty, price, status
- **Detail View**: Full production history for a part including:
  - Summary stats (times quoted, job sheets, invoiced, total qty produced)
  - All job sheets with operator name, actual hours, efficiency, production notes
  - Time entries with duration and operator notes
  - Invoices and packing slips
  - Related quotes (repeat orders for same part description)
- **API**: `GET /api/part-history/search?q=`, `GET /api/part-history/detail/{quote_id}`

#### P0 Bug Fix: calculateProcessCost Desync - FIXED
- Updated `calculateProcessCost` in `Quotes.js` to mirror the full 12-step enhanced Press Brake calculation engine
- Previously, changing Difficulty Level or Geometry Type updated the displayed time but NOT the dollar price
- Now includes: thickness factor, V-die factor, geometry penalty (box/complex), difficulty multiplier, flip time, handling time, second operator rule
- Verified: Simple=$92.00 vs Complex=$99.60 (difficulty), Flange=$92.00 vs Box=$93.92 (geometry penalty)

#### P0 Bug Fix: Quantity/Price Breaks on Quote Print & Download - FIXED
- Print (window.print): Template already existed but relied on broken `calculateProcessCost` — now works correctly
- Download PDF (jsPDF + html2canvas): Was entirely missing the quantity breaks section — added matching HTML template with `calculateQuantityBreakPricing` calls
- Verified: Quote #99 prints AND downloads with "Quantity Breaks - Price per Quantity (Ex GST)" section showing correct per-part and total prices

### Files Modified
- `frontend/src/pages/Quotes.js` - Lines 418-528: Replaced old simple Press Brake formula with full enhanced 12-step calculation

## Upcoming Tasks (Priority Order)
1. **P1: Edit Invoice Line Item Prices** - Backend model partially updated; frontend UI incomplete
2. **P1: STEP File Support** - Add 3D geometry analysis (requires pythonOCC)
3. **P1: Patch Security Vulnerabilities** - Update `jspdf`, `react-router-dom`, `pymongo`, `starlette`
4. **P1: Legacy Drawing Migration Tool** - Build user-facing tool to re-upload drawings for old quotes
5. **P2: Refactor Quotes.js** - Break down 5700+ line monolith into smaller components
6. **P2: QA Inspection Items Save Bug** - Investigate recurring issue
7. **P3: Database Query Optimization** - Add pagination and proper indexing

## User Action Required
- Navigate to Settings > Admin Tools and click "Fix Invoiced Packing Slips" to resolve data integrity issue in production

## Session: Feb 2026 — Machine Decommissioned (Plant Hazard Checks)

### Completed
#### Machine Decommissioned Feature — Plant Hazard Checks / Risk Assessments — NEW
- User scenario: CO2 lasers upgraded to Fibre — reviews can no longer be redone; needed a way to stop review tracking without deleting audit history
- Backend (`plant_hazard_checks_routes.py`):
  - `POST /api/plant-hazard-checks/{id}/decommission` — sets status=decommissioned + date/reason/marked-by
  - `POST /api/plant-hazard-checks/{id}/reactivate` — restores active status, unsets decom fields
  - `/stats` now excludes decommissioned from "overdue_for_review" and returns `decommissioned` count
  - PUT (edit save) does NOT clobber decommission fields (not in PHCIn model)
- Frontend (`PlantHazardChecks.js`):
  - Archive icon action opens "Mark Machine Decommissioned" dialog (date, reason, marked by)
  - Decommissioned rows: greyed with DECOMMISSIONED badge, Next Review = "Not Required", excluded from overdue highlight
  - Reactivate (RotateCcw icon) with confirm
  - New "Decommissioned" stat card; heatmap excludes decommissioned machines
  - Printed Register/Index: grey row + DECOMMISSIONED badge + "Not Required — Decommissioned <date>"
  - Printed 11-page report: cover banner "MACHINE DECOMMISSIONED — REVIEW NO LONGER REQUIRED" with date/reason/by; Next Review row updated
  - Edit form shows decommission banner
- Verified end-to-end via curl + Playwright screenshots (overdue count 1→0 on decommission, reactivate restores)

#### Courier KPI Chart Label Fix — VERIFIED
- Screenshot confirmed percentage labels render in pill badges above data points (e.g. 73.3%, 80.7%), no clipping — pending item from last session closed

### Demo data seeded in PREVIEW DB only
- 1 PHC record "Laser CO2 Trumpf 3030" (decommissioned) + courier "Direct Couriers" with 4 months KPI data

## Note
- User must REDEPLOY to see these changes on production (pressbrake-quotes.emergent.host)

### Feb 2026 — PHC Team Input + Print Density Fixes
- **Risk Assessment Team chip editor** (`PlantHazardChecks.js`): replaced fragile comma-splitting Input with tag/chip editor — type name + Enter (or Add button), chips removable via ✕, Backspace removes last, paste of "A, B" still splits, dedupe case-insensitive, onBlur auto-adds
- **Print pagination fix** (printOne): removed forced page-break before every hazard section (was leaving ¾-blank pages). Sections A–O now flow continuously; `.haz-sec` + `table.hazards` use `page-break-inside/break-inside: avoid` so tables never split. Section P + comments + sign-off flow after, wrapped in `.signoff-block` (avoid-inside). Result verified via rendered PDF: 8 dense pages vs ~13 before, 3–5 full sections per page, no split tables, doc-control footer intact

### Feb 2026 — Internal Audit PDF Density Fix
- `backend/services/pdf_generator.py` (`generate_audit_pdf`):
  - Findings ≤1800 chars: `KeepTogether` (kept whole on one page)
  - Long findings: `KeepTogether(maxHeight=usable_h)` → never pushed to a fresh page, flows and splits in place (this was the source of ¾-blank pages)
  - `keepWithNext=True` on clause_title_style + finding_label_style → no orphan headers/labels at page bottoms
  - Removed forced PageBreak before CONCLUSION — now flows after last finding (kept whole if short)
- Verified with seeded findings: 13 pages (fills 46–93%) → 12 pages (mostly 79–99%); split boundaries clean

## Session: Feb 2026 — IMS Audit Software Framework Upgrade (major)
User provided full 18-section spec to transform basic audit cards into a structured IMS audit management platform.

### Built & tested (backend 25/25 pass iter_22, frontend iter_23 + fixes)
- **Standards & Clause Library** (`standards_library_routes.py`, `StandardsLibrary.js` at /quality/standards-library): standards CRUD (ISO 9001:2015/2026, 14001:2015/2026, 45001:2018, 19011:2026), clauses CRUD (numbers + short summaries only — no ISO wording), clause mappings (2015→2026), help content CRUD, transition gap register + report. Idempotent /seed.
- **Help system** (`components/audit/HelpButton.js`): Help button beside every audit heading (cards, dialogs, templates, registers). Side drawer with 14 structured fields (purpose, what to check, evidence examples, wording, red flags…), admin-editable, legacy heading titles auto-map (General Requirements→Context of the Organisation etc.), NEVER in print/PDF (verified byte-scan).
- **17-section IMS framework** seeded (`services/ims_framework_seed.py`) with user's help text verbatim; Change Management clause mapping corrected (14001→6.1 & 8.1); DEFAULT_CLAUSES 2.1 renamed.
- **Audit Templates** (`audit_templates_routes.py`, /quality/audit-templates): 14 seeded templates; create-audit-from-template generates findings per section with prompts/evidence requirements.
- **Asset Registers** (`asset_registers_routes.py`, /quality/asset-registers): fire_equipment / test_tag / first_aid / spill_kit + overdue tracking + compliance report.
- **Audit extensions** (audit_routes.py appended): samples CRUD (17 sample types), extended finding fields (status ×12, risk rating, records checked, people interviewed, CA lifecycle incl. effectiveness verification), lock/reopen (reason + authorised_by, edits blocked 423 when locked), audit trail (services/audit_trail.py), coverage report, open findings report, dashboard summary. Findings numerically sorted.
- **AuditReportDetail.js**: help buttons + status/risk badges + counts on cards, 4-tab finding dialog (Finding/Evidence Details/Corrective Action/Samples), Conformity-blocked-when-follow-up validation, lock banner, reopen dialog, history dialog.
- **Audit Dashboard** (/quality/audit-dashboard): audits, findings, severity, CA closure rate, asset compliance, transition progress.
- **PDF**: samples tables per finding, corrective action summary table, auditor sign-off block. Help excluded. Existing dense-print settings kept.
- Fixes from testing: AuditReport model now returns locked fields; /api/settings 307 mixed-content fixed; audit list links (audit-open-{id} / audit-view-{id}).

### NOT built (backlog, by phase agreement)
- P1: Management of Change form module (section+help exist; dedicated form not built)
- P1: Attachments/photo uploads on samples/findings/registers (fields exist in schema)
- P2: Full role matrix (Auditor/Dept Manager/Viewer) — currently admin/QM enforced on library edits only
- P2: Multi-company/multi-tenant (Phase 5 — deferred; single-tenant data in production)
- P2: Dashboard extras: audits due, legal/aspects/risk/mgmt review due dates

### Feb 2026 — Supplier Review Escalation (C/D ratings)
- `supplier_review_routes.py`: SupplierRow extended with 8 escalation fields (reason still approved, risk controls, corrective action, contacted+date, follow-up date, approved by, decision). Server 422 when D-rated supplier lacks escalation_decision (5 options: Continue with controls / Restricted use only / Supplier corrective action required / Suspended / Removed from approved supplier list)
- `SupplierReviews.js`: auto-appearing escalation panel below any C (orange) / D (red) rated row; decision mandatory for D (red-highlighted select + client block + toast); "Suggest Comment" button composes auditor-ready wording from live data (names D suppliers, NCR %, decision — per user's TSM example); new-review default comment strengthened; print-out includes "Supplier Escalation & Risk Control" table for C/D suppliers
- Verified end-to-end: 422 without decision, panel triggers at 11.76% NCR, save blocked in UI without decision, persisted correctly

### Feb 2026 — Admin Menu Configuration + IMS Sidebar Restructure
- `frontend/src/config/menuConfig.js`: central MODULES registry (stable internal keys + routes + icons + help notes) and DEFAULT_SECTIONS. mergeMenu() merges saved config with defaults — unknown ids dropped, new modules auto-appended (future modules need no config migration)
- Default structure per user spec: Dashboard → **IMS** (IMS Dashboard, Standards Library, Legal Requirements, Internal System Audits, Audit Schedule/Templates, Mgmt Review, Doc Control, Forms, Risk & Opportunities, NCR, Supplier Reviews, Customer Satisfaction) → Sales → Production → Safety → Environment → Equipment → Operations → HR → System
- Default renames: ISO Audits→**Internal System Audits**, MSDS→**SDS Register**; moved Legal Requirements + Standards Library under IMS; Asset Registers under Equipment; HR has Training Matrix/Appraisals **shortcuts** (same module & data, no duplicates)
- `menu_config_routes.py` (/api/menu-config): GET / PUT (admin-only) / DELETE (restore default), org-scoped doc (multi-tenant ready), audit-trailed
- `Sidebar.js` rewritten config-driven (permissions/admin checks unchanged, shortcuts check underlying moduleId); refreshes on 'menu-config-updated' event
- `MenuConfig.js` (/settings/menu, admin): drag-drop items (incl. cross-section moves), section up/down arrows + DnD, rename labels (keys shown read-only), hide/show per module & section, help icons per module (screen-only), Save + Restore Default IMS Menu
- Verified: reorder persists after reload, hidden module vanishes from sidebar, restore resets everything, renames display-only

---

## IMS Manual Builder (June 2026) — COMPLETE ✅ (tested: iteration_24.json, 100% pass)
Live, editable Quality/Environmental/OHS Manual at `/ims/manual` (first item under IMS in sidebar).
- 29 seeded sections from the reference DOCX ("QUALITY OHS ENVIRONMENTAL MANUAL 2018"): 12 manual sections (0–11) + 17 procedures (2.0–2.16). Auto-seeded idempotently on startup (`ims_manual_routes.ensure_manual_seed`, content in `services/ims_manual_default_content.json`).
- Draft → Approved by 1 person (Admin/Quality Manager). Editing a section bumps its revision, snapshots the old version to revision history and resets section+manual to Draft.
- Clause mapping per section via Standards Library (no hard-coded clauses); free-text clause refs also supported.
- PDF export: full manual (cover + doc-control table + TOC + all sections, ~44pp) AND per-section print. Footer: Doc No | Rev | Status | Approved by | "UNCONTROLLED WHEN PRINTED" | page x of y.
- Completion dashboard bar (% audit-ready = approved/total). Add/archive custom sections. Editable manual metadata (title, doc no, company, issue date).
- Files: backend `routes/ims_manual_routes.py`, `services/ims_manual_pdf.py`; frontend `pages/IMSManual.js`; menu `config/menuConfig.js` (ims_manual, pinFirst).

### Remaining backlog (unchanged priority)
- P1: STEP file support in Drawing Analysis
- P2: Delete dead code (OutstandingActions.js / outstanding_actions_routes.py)
- P2: Refactor Quotes.js (>6500 lines)
- P2: Company logo/name branding setting for sidebar header

## Sidebar Company Branding (June 2026) — COMPLETE ✅ (self-tested via screenshot)
- Sidebar header now displays the company logo, name and tagline from Settings (`GET /api/settings` — company_name, company_tagline, company_logo_url). Falls back to Nestix defaults when unset.
- Settings page dispatches `company-settings-updated` event on save/logo upload/logo delete so the sidebar refreshes live.
- Files: `components/layout/Sidebar.js`, `pages/Settings.js`. Backend unchanged (logo upload/delete endpoints already existed in settings_routes.py).
- Backlog item "Company logo/name branding setting" is now DONE — remove from P2 list.

## IMS Manual Print Layout — Word-style (June 2026) — COMPLETE ✅ (self-tested: PDF pages rendered + UI screenshot)
User request: make the PDF export look like the original Word manual.
- Cover page: company logo (SVG via svglib / raster), centered title, company address/phone/email from Company Settings, AUTHORIZATION block (approved by / issued date), doc no + rev.
- INDEX pages: two Word-style tables (Section | Std. Reference | Revision | Date | System Element Title) for Manual Sections and Procedures, driven by live section data.
- Section headings: centered bold (SECTION X — TITLE), italic ISO Reference line, duplicated in-content headings auto-stripped (`_strip_redundant_heads`).
- Footer: Word format "COMPANY MANUAL   ISSUE n: MONTH YEAR   Page x of y" + control line (Doc No, DRAFT/pending note, Uncontrolled when printed). Auto-shrinks to avoid overlap.
- Table support: content lines starting with '|' render as real tables in BOTH the PDF and the on-screen viewer (SectionContent component). Sections 9/10/11 re-seeded with the actual objectives tables from the Word doc (Env/Quality/OHS objectives).
- Files: services/ims_manual_pdf.py (rewritten), routes/ims_manual_routes.py (passes company settings), pages/IMSManual.js (SectionContent table renderer), services/ims_manual_default_content.json (m9/m10/m11 updated). New dep: svglib.

## Company Policies Generator (June 2026) — COMPLETE ✅ (tested: iteration_25.json, 100% pass)
New module at /quality/policies (IMS → Policies, after Document Control).
- Word-like editor (react-quill-new, React 19 compatible): Calibri default + Arial/Times/Georgia/Courier, pt font sizes (8–36), bold/italic/underline/strike, sub/superscript, font & highlight colour, ordered/bullet lists, indent, alignment, clear formatting. Inline style attributors so saved HTML carries real styles.
- Fields per policy: Title, Issue, Issue Date (MM/YYYY). CRUD via /api/policies.
- PDF export (xhtml2pdf + Carlito fonts in /app/backend/fonts as Calibri): company logo centered top (SVG converted via PyMuPDF), Calibri 12pt body, footer "POLICY TITLE | ISSUE: n MM/YYYY | Page x of y" + uncontrolled-when-printed — matches the user's Word policies exactly.
- Seeded from user DOCX: Conflict Minerals Policy, Forklift Policy (policies_seed.json, idempotent on startup).
- Files: routes/policies_routes.py, pages/Policies.js + Policies.css, menuConfig.js. New deps: xhtml2pdf, react-quill-new, Carlito TTFs.
NOTE: App deployed to production (pressbrake-quotes.emergent.host) — preview changes need a redeploy to go live.

### Bug fix (June 2026): Policy PDF text chopped off — RESOLVED ✅
Cause: Quill 2 getSemanticHTML converts normal spaces to &nbsp;, making paragraphs unbreakable in xhtml2pdf (lines ran off the page edge). Fix: (1) sanitize on save in Policies.js, (2) sanitize at export time in policies_routes.py `_sanitize_html` (covers existing polluted data incl. production), (3) one-time DB cleanup in preview. Verified: zero text blocks past the right margin.

### Enhancement (June 2026): Sticky policy editor toolbar — DONE ✅
Save/Print actions bar and the Quill formatting toolbar stay pinned (sticky, below app top bar) while scrolling long policies. Files: Policies.js (sticky actions bar), Policies.css (toolbar top offset 110px).

## Quote Print — combined process pricing (June 2026) — COMPLETE ✅ (self-tested: print popup text assertions + editor screenshot)
User request: customer quote must show the part DESCRIPTION, not process names, and one combined total per line (not separate process prices).
- Single-item quote print window + PDF download: "Cost Breakdown" (per-process rows) replaced with "Quote Summary" — one row: Item | Description | Material | Qty | Price/Part (Ex GST) | Total (Inc GST), totals from quote_total. Multi-item quotes already combined.
- Added internal "Process Price Summary" card (data-testid process-price-summary) in the quote editor cost sidebar: each process + Combined Process Total, marked "internal — combined on customer quote". The saved-quote View dialog retains full per-process breakdown for estimators.
- File: frontend/src/pages/Quotes.js (~lines 2400, 2797, 5277).

### Bug fix (June 2026): Multi-item quote — per-line Quantity Breaks not printing — RESOLVED ✅
User's production Quote_318 PDF lacked quantity breaks. Root cause: production runs an older build; additionally, the fallback only used the FIRST line item's breaks. Fix: both print window and Download PDF paths now MERGE unique break quantities from quote level + every line item (sorted), printing a per-quantity grid for all lines. Verified in preview (Print popup text + rendered downloaded PDF, quantities 25/50/100 from different lines). USER MUST REDEPLOY for production.

### Enhancement (June 2026): Qty-break grids now show TOTAL (Ex GST) — DONE ✅
Each "Qty: X per item" quantity-break table on multi-item quotes (print window + Download PDF) now has a TOTAL (Ex GST) row above TOTAL (incl. GST). Verified visually on quote 120. Needs redeploy for production.

### Feature (June 2026): Job Sheet "Sync from Quote" — DONE ✅
User need: reprint a job sheet with corrected material specs after fixing the quote, without deleting/reissuing.
- New endpoint POST /api/job-sheets/{id}/sync-from-quote — overwrites material_type/grade/finish/thickness (+legacy material) from the linked quote (line item matched by part_description on multi-item quotes).
- New purple sync button (RotateCcw, data-testid sync-job-sheet-{number}) next to Print on each Job Sheets row; shows confirmation with new specs, then user reprints. Job sheet number/status/times untouched.
- Files: backend/routes/job_sheet_routes.py, frontend/src/pages/JobSheets.js. Verified via curl (JS-0047 thickness 4 → 4mm) + UI click. Needs redeploy for production.

### Enhancement (June 2026): Selective job sheet release from multi-item quotes — DONE ✅
User need: generate job sheets for chosen line items only (partial orders / different PO numbers / release 1 item at a time).
- Dialog already had per-line checkboxes + qty/price overrides; added: Select All / Clear All buttons, fetch of existing job sheets on open (/job-sheets/quote/{id}), amber "Already released: JS-XXXX" badge per line, and auto-preselection of ONLY items without existing job sheets.
- Workflow for different PO numbers: release each batch separately entering that batch's PO.
- File: frontend/src/pages/Quotes.js (handleOpenMultiItemJobSheetDialog + dialog UI). Verified E2E: released line 1 only → reopen → badge shown, line 1 unticked, line 2 preselected. Needs redeploy.

## Material RFQ Module (Aug 2026) — COMPLETE ✅ (tested: iteration_26.json 90% + main-agent fixes verified)
User need: send material pricing enquiries to suppliers WITHOUT email integration — public link like customer surveys.
- Internal page /rfqs (SALES → Material RFQs): create enquiry (title, notes, required-by, material items: description/material/size/qty), auto RFQ-XXXX numbering, copy public supplier link, view supplier responses side by side, Open/Close/reopen, delete.
- Public page /rfq/{token} (no auth): shows company branding + items; supplier MUST enter company name; per item: price (ea ex GST), "Size not available" flag, optional alternative size + price (amber panel), notes; thank-you screen; closed enquiries show closed message.
- Backend routes/rfq_routes.py: auth CRUD + public GET/respond (validates company name + item ids). Collections: rfqs, rfq_responses.
- Fixes after testing: mounted Sonner Toaster globally in App.js (RFQs/Policies/IMSManual toasts now visible), clipboard writeText wrapped with prompt() fallback.

### Policy editor/PDF compression (Aug 2026) — DONE ✅
Body Calibri 11pt, line-height 1.2, p margin 3pt (editor + PDF); H1 16pt / H2 13pt; Heading dropdown added to Quill toolbar. Conflict Minerals PDF: 2 pages, compact. (User's 6-page LPG policy will compress on production after redeploy.)

## Full Backup/Restore upgrade (Aug 2026) — COMPLETE ✅ (self-tested: curl auth/export/replace/merge + UI export download)
Purpose: migrate production data when the user redeploys under a new subdomain (they want to rename the deployed URL).
- Upgraded existing Data Migration module (System → Data Migration):
  - export-all now DYNAMIC: every collection in the DB (80 colls, users incl. hashed passwords; excludes notifications_cron), datetime→ISO + bytes→base64 sanitizers, auto-downloads nestix-backup-YYYY-MM-DD.json.
  - import-all: ?mode=replace (clears each collection in file, exact copy — default, with confirm dialog) or ?mode=merge (upsert by id).
  - SECURITY: added admin-role auth to export-all/import-all/clear-all-data endpoints (were previously UNAUTHENTICATED).
  - UI: file picker for restore, Replace/Merge radios, compact per-collection summaries, updated migration instructions.
- Files: backend/routes/data_migration_routes.py, frontend/src/pages/DataMigration.js.
- Platform context: user wants to rename deployed URL (pressbrake-quotes.emergent.host) — support said rename project → new deployment (50cr) → migrate data → shut old down; renaming steps escalated to support@emergent.sh.

### Bug fix (Aug 2026): Login broken on custom domain (ultimate-360.com) — RESOLVED ✅
Cause: frontend baked REACT_APP_BACKEND_URL (pressbrake-quotes.emergent.host) at build time; browsing via the custom domain made API calls cross-origin → login failed. Fix: new /app/frontend/src/lib/backendUrl.js resolves backend URL at RUNTIME — uses window.location.origin unless on localhost (dev). Updated services/api.js + 7 pages that used the env var directly (EmploymentApplicationForm, CustomerSatisfactionPublicSurvey, RecycledMetal, CalibrationSchedule, EfficiencyReports, PublicRFQ, ElectricityUsage, CalibrationRecord). App now works on ANY domain. Verified login on localhost dev branch. USER MUST REDEPLOY.

### RFQ enhancements (Aug 2026) — DONE ✅ (self-tested E2E)
1. Supplier details remembered per device via localStorage on the public page (private to each supplier's browser; prefilled on next visit; saved on successful submit).
2. Optional "Pick from materials…" dropdown per RFQ item (loads /materials, autofills description/material/size and code MAT-{id}).
3. New `code` field on RFQ items — shown in create dialog, public supplier page (Code: MAT-001) and internal responses table.
Files: rfq_routes.py (RFQItem.code), RFQs.js, PublicRFQ.js. Needs redeploy.

### Custom domain (Aug 2026)
ultimate-360.com linked + SSL issued and verified working (apex + www redirect). Login fix (runtime backendUrl.js) shipped for it.

### Password reset (Aug 2026) — VERIFIED EXISTING ✅
Admin password reset already implemented: System → User Management → "Reset Pw" per user (POST /api/auth/users/{username}/reset-password, require_admin, bcrypt hash, min 6 chars). E2E verified: create user → reset → login with new password OK; unauthenticated reset = 403. User's production build predates it → needs redeploy. test_credentials.md updated to document admin123 (preview DB) vs password123 (fresh-deploy seeds).

### RFQ Supplier Price Comparison printout (Aug 2026) — DONE ✅ (verified via rendered PDF)
GET /api/rfqs/{id}/export/pdf — one-page ReportLab comparison: rows = items (code/description/size/qty), columns = each supplier's price; cheapest comparable price per line highlighted green (alternatives counted); ALT/N/A notation; supplier contacts + notes footer; auto landscape when >3 suppliers. Printer button (data-testid print-comparison-{rfq_number}) on each RFQs row, disabled until responses exist. Needs redeploy.

### RFQ offline email-attachable form (Aug 2026) — DONE ✅ (E2E tested from file:// incl. CORS submit)
For suppliers whose cyber-security blocks links: new FileDown button per RFQ row downloads a SELF-CONTAINED HTML enquiry form (GET /api/rfqs/{id}/export/html?origin=<browser origin> — origin passed explicitly because proxy mangles headers). User attaches it to their work email; supplier opens locally, fills company (required)/prices/alternative sizes, clicks Submit → posts to public respond API (verified working from file:// with Origin:null CORS). Failure message tells supplier to reply by email. Needs redeploy.
