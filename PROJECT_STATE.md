# Project State

Last updated: 2026-05-31

## 1. Current Architecture

This repository is currently structured as a dedicated HR analytics and payroll-attendance product with a split frontend/backend architecture:

- `frontend/`
  - Next.js App Router frontend
  - HRMS route group under `frontend/app/(hrms)/`
  - Main user-facing areas:
    - `dashboard`
    - `attendance/upload`
    - `attendance/working`
    - `employees`
    - `employees/[code]`
    - `employees/new`
- `backend/`
  - FastAPI backend
  - Upload and attendance processing routes in `backend/app/routes/upload.py`
  - Attendance processing engine in `backend/app/services/attendance_*`
  - File/workbook analysis routing in `backend/app/services/analysis_router.py`
- `scripts/`
  - local development helpers
- `render.yaml`
  - backend deployment configuration

Core processing flow:

1. Upload attendance workbook.
2. Ingest and normalize attendance rows.
3. Apply employee merge instructions if provided.
4. Apply holiday markers and administrative attendance exceptions.
5. Detect anomalies.
6. Apply HR review decisions.
7. Classify final attendance status.
8. Reconcile monthly payroll, late deductions, comp off, and payable days.
9. Return dashboard summaries, review queues, processed rows, and employee summaries to the frontend.

## 2. Completed Modules

### Attendance Intake and Upload Workspace

- Workbook upload flow is implemented.
- Sheet switching and upload-session workspace flow are implemented.
- Review decisions and merge instructions are supported in the upload route.

Relevant files:

- `frontend/components/attendance-upload-panel.tsx`
- `frontend/context/upload-workspace-context.tsx`
- `backend/app/routes/upload.py`

### Attendance Processing and Payroll Engine

- Ingestion, anomaly detection, HR review workflow, final attendance classification, and payroll reconciliation are implemented.
- Late deductions, week off/holiday rules, comp off, payable day reconciliation, and monthly summary generation are implemented.

Relevant files:

- `backend/app/services/attendance_ingestion.py`
- `backend/app/services/attendance_anomaly.py`
- `backend/app/services/attendance_review_workflow.py`
- `backend/app/services/attendance_classification.py`
- `backend/app/services/attendance_payroll.py`
- `backend/app/services/attendance_validation.py`
- `backend/app/services/attendance_rule_engine.py`

### Attendance Working Surface

- Dedicated HR attendance working page exists.
- Attendance analysis, review, summaries, and processed attendance surfaces are present.

Relevant files:

- `frontend/app/(hrms)/attendance/working/page.tsx`
- `frontend/components/attendance-working-panel.tsx`
- `frontend/components/attendance-analysis-card.tsx`

### Attendance Merge Workflow

- Employee merge workflow exists in both frontend and backend.

Relevant files:

- `frontend/components/attendance-merge-card.tsx`
- `backend/app/services/attendance_merge_workflow.py`

### Attendance Export

- Export UI and export helper are present.

Relevant files:

- `frontend/components/attendance-export-card.tsx`
- `frontend/lib/export-attendance.ts`

### HRMS Shell and Navigation

- HRMS route layout and navigation shell are implemented.

Relevant files:

- `frontend/app/(hrms)/layout.tsx`
- `frontend/components/page-header.tsx`
- `frontend/components/hrms-branding.tsx`
- `frontend/lib/hrms-nav.ts`

### Employee Master

- Employee listing, create view, and profile view screens are present.
- Backend persistence is now implemented for employee records, salary components, and leave/comp-off balances.
- Frontend screens now use API-backed persistence instead of browser-only storage.

Relevant files:

- `frontend/app/(hrms)/employees/page.tsx`
- `frontend/app/(hrms)/employees/[code]/page.tsx`
- `frontend/app/(hrms)/employees/new/page.tsx`
- `frontend/components/employee-master-panel.tsx`
- `frontend/components/employee-create-view.tsx`
- `frontend/components/employee-profile-view.tsx`
- `backend/app/routes/employees.py`
- `backend/app/services/employee_master_service.py`
- `backend/app/db.py`
- `backend/app/schemas/hr_master.py`

### Attendance Verification UX

- Verification registry, review dialogs, and drilldown dialogs are present.
- Matching/review experience exists in the frontend.
- Backend persistence is now implemented for alias mapping and verification decisions.
- Frontend verification actions now write through backend APIs.

Relevant files:

- `frontend/lib/attendance-verification-registry.ts`
- `frontend/lib/attendance-verification-storage.ts`
- `frontend/components/attendance-verification-summary-section.tsx`
- `frontend/components/attendance-verification-drilldown-dialog.tsx`
- `frontend/components/attendance-verification-review-dialog.tsx`
- `backend/app/routes/attendance_verification.py`
- `backend/app/services/attendance_verification_service.py`

## 3. Attendance Business Rules Currently Implemented

Current rules are driven by `backend/app/services/attendance_rule_engine.py` and applied in `backend/app/services/attendance_classification.py` and `backend/app/services/attendance_payroll.py`.

### Configured Defaults

- Late after: `10:11`
- Half-day entry after: `12:00`
- Full shift hours: `10.0`
- Female full shift hours: `9.0`
- Minimum present hours threshold: `5.0`
- Non-working day full present threshold: `5.0`
- Impossible overnight threshold: `16.0`

### Implemented Classification and Payroll Rules

- Both in-time and out-time missing:
  - Default `Absent`
  - Exception: explicit holiday or week-off raw status is handled as holiday/week-off first
- Missing out-time with valid in-time before late cutoff:
  - `Present - Missing Out Time`
  - `1.0` payable day
- Missing out-time with valid in-time after late cutoff:
  - `Present but Late - Missing Out Time`
  - `1.0` payable day
  - late flag remains active
- Missing in-time with out-time present:
  - `Irregular Punch Pending HR Review`
  - `0` payable day
- Invalid/negative/unreadable/impossible overnight duration:
  - `Irregular Punch Pending HR Review`
  - `0` payable day
- Less than `3` working hours:
  - `Absent`
- `3` hours to below `5` hours:
  - `Half Day`
- Entry at or after `12:00`:
  - `Half Day` when the row has not already been classified as absent/irregular earlier
- Late after `10:11` with payable attendance:
  - `Present but Late`
- Before late cutoff with payable attendance:
  - `Present`
- Early logout:
  - tracked as `early_logout` derived flag
  - not a separate final attendance status
- Sunday/week-off or holiday work:
  - `>= 5` hours => `Present`
  - `< 5` hours => `Half Day`
  - late discipline is suppressed on worked non-working days
- Sunday/week-off with no valid punch:
  - converted to `Paid WO` or `Unpaid WO` based on same-week weekday work
- Holiday with no valid punch:
  - converted to `Paid Holiday` or `Unpaid Holiday` based on same-week work
- Comp off:
  - earned for worked week-offs and worked holidays
  - also supported via HR comp-off override
  - adjustment priority:
    1. absent days
    2. late deductions
    3. leftover carries forward
- Late deduction:
  - every `3` late marks produces `1` payroll deduction day
  - implemented as monthly deduction logic, not per-day absence conversion
- Final payable days:
  - `gross payable`
  - plus comp off adjusted against absences
  - minus remaining late penalty after comp off adjustment

## 4. Employee Master Status

Employee Master is now backend-persisted.

Current status:

- Employee list UI: implemented
- Employee create UI: implemented
- Employee profile view: implemented
- Employee data persistence: backend-backed

Storage mode:

- Backend SQLite persistence layer
- Frontend cache mirror is still maintained for continuity with current helper flows
- CRUD API exists for employees
- Salary component API exists

Key files:

- `frontend/components/employee-master-panel.tsx`
- `frontend/components/employee-create-view.tsx`
- `frontend/components/employee-profile-view.tsx`
- `frontend/lib/employee-master-storage.ts`
- `frontend/lib/employee-master-api.ts`
- `backend/app/routes/employees.py`
- `backend/app/services/employee_master_service.py`
- `backend/app/db.py`

## 5. Attendance Verification Status

Attendance Verification UX is present and persistence is now backend-backed.

Current status:

- Verification registry: implemented
- Verification review dialog: implemented
- Verification drilldown dialog: implemented
- Verification storage: backend-backed
- Alias mapping persistence: implemented
- Verification decision persistence: implemented

Key files:

- `frontend/lib/attendance-verification-registry.ts`
- `frontend/lib/attendance-verification-storage.ts`
- `frontend/components/attendance-verification-summary-section.tsx`
- `frontend/components/attendance-verification-review-dialog.tsx`
- `frontend/components/attendance-verification-drilldown-dialog.tsx`
- `frontend/lib/attendance-verification-api.ts`
- `backend/app/routes/attendance_verification.py`
- `backend/app/services/attendance_verification_service.py`

## 6. Dashboard Status

Dashboard shell and derived attendance/payroll summary views are implemented.

Current status:

- Dashboard route: implemented
- KPI/overview surfaces: implemented
- Attendance working dashboard: implemented
- Employee summary surfaces: implemented
- Current dashboard data source:
  - upload-session attendance snapshot
  - backend-backed employee master state
  - backend-backed verification state

Implication:

- The dashboard is functional for the current session/workspace
- Employee Master and Verification portions are now shared across users/devices if the same backend is used
- Attendance upload workspace itself is still session/browser driven

Relevant files:

- `frontend/app/(hrms)/dashboard/page.tsx`
- `frontend/components/dashboard-overview.tsx`
- `frontend/components/attendance-working-panel.tsx`
- `frontend/components/attendance-analysis-card.tsx`

## 7. Pending Modules

### Shared Persistent Dashboard State

Needed:

- dashboard API if a single backend summary endpoint is desired
- shared persisted attendance workspace/session model if uploads must survive beyond browser session semantics

### Production Hardening of HRMS Data Layer

Needed:

- multi-user persistence
- stronger operational audit/reporting surfaces on top of persisted data
- optional migration away from frontend cache mirrors once all screens use backend fetches exclusively

## 8. Known Limitations

- Dashboard still depends on upload-session state stored in the browser for the active attendance workspace.
- Frontend cache mirrors still exist for Employee Master and Verification helpers to preserve compatibility during transition.
- Some attendance policy semantics are implemented differently from a stricter HR reading:
  - `3 late marks = 1 absent` is implemented as payroll deduction, not day-level absent conversion
  - after `12:00` and below `5` hours is not always absent; `3` to `<5` hours becomes `Half Day`
  - `early_logout` exists as a flag, not as a distinct final status
- Holiday token fallback in classification is narrower than the default rule list if custom rules are incompletely supplied.
- `comp_off_earned_count` in summaries counts source rows, not exact earned day values.

## 9. Current Git Branch and Last Audited Commit

- Repository: `rajinnewera-bit/hr-analytics-app`
- Branch: `payroll-system-v2`
- Last audited commit: `edfcb98dfe6a3dbcb8554c54e8edf870e9673d36`
- Audit date: `2026-05-31`
