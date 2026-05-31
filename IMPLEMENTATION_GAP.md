# Implementation Gap

Last updated: 2026-05-31

## Scope

This document compares the current `payroll-system-v2` frontend screens against the actual backend API surface.

The focus areas are:

1. Employee Master
2. Attendance Verification
3. Dashboard

It distinguishes what is already backend-persisted from what is still frontend-only and localStorage/sessionStorage based.

## 1. Completed Backend-Backed Modules

The backend is fully active for the attendance processing pipeline.

### 1.1 Attendance Upload and Analysis

Implemented backend APIs:

- `POST /upload`
- `GET /upload/{upload_id}/sheet/{sheet_name}`

What this covers:

- file upload
- workbook preview
- sheet-level attendance analysis
- generation of validation summary
- generation of attendance status summary
- generation of processed attendance rows
- generation of employee monthly summary
- generation of unit summary

Relevant files:

- `backend/app/routes/upload.py`
- `backend/app/services/file_preview.py`
- `backend/app/services/analysis_router.py`
- `backend/app/services/attendance_validation.py`

### 1.2 Attendance Review and Payroll Recalculation

Implemented backend API:

- `POST /upload/{upload_id}/attendance-review`

What this covers:

- HR review decisions
- late regularization
- missing punch review
- absent regularization
- holiday markers
- administrative attendance exceptions
- recalculation of processed rows
- recalculation of payroll summaries

Relevant files:

- `backend/app/routes/upload.py`
- `backend/app/services/attendance_review_workflow.py`
- `backend/app/services/attendance_classification.py`
- `backend/app/services/attendance_payroll.py`
- `backend/app/services/attendance_validation.py`

### 1.3 Attendance Merge Workflow

Implemented backend API:

- `POST /upload/{upload_id}/attendance-merge`

What this covers:

- employee identity merge instructions
- dry-run merge previews
- merged attendance processing response

Relevant files:

- `backend/app/routes/upload.py`
- `backend/app/services/attendance_merge_workflow.py`
- `backend/app/services/attendance_validation.py`

### 1.4 Backend-Persisted Upload Workspace Files

The backend persists uploaded files to server-side storage for the duration of the upload workflow.

What exists:

- upload metadata and file-path handling
- reload by `upload_id`
- sheet re-analysis by `upload_id`
- review and merge re-entry by `upload_id`

Relevant files:

- `backend/app/services/file_storage.py`
- `backend/app/routes/upload.py`

Important note:

- This is backend-backed upload/session file handling
- It is not yet a general HRMS data persistence layer for employee master or verification

### 1.5 Employee Master Persistence

Implemented backend APIs:

- `GET /employees`
- `POST /employees`
- `POST /employees/bulk-upsert`
- `GET /employees/{employee_code}`
- `PUT /employees/{employee_code}`
- `DELETE /employees/{employee_code}`
- `DELETE /employees`

What this covers:

- employee listing
- employee create
- employee update
- employee delete
- employee master bulk sync
- backend persistence of leave/comp-off balances using the current leave design

Relevant files:

- `backend/app/routes/employees.py`
- `backend/app/services/employee_master_service.py`
- `backend/app/db.py`
- `backend/app/schemas/hr_master.py`

### 1.6 Salary Component Persistence

Implemented backend APIs:

- `GET /salary-components`
- `PUT /salary-components`

What this covers:

- global salary component loading
- salary component persistence for current Employee Master screens

Relevant files:

- `backend/app/routes/employees.py`
- `backend/app/services/employee_master_service.py`

### 1.7 Attendance Verification Persistence

Implemented backend APIs:

- `GET /attendance-verification/store`
- `POST /attendance-verification/approve`
- `POST /attendance-verification/reject`
- `POST /attendance-verification/alias`
- `GET /attendance-verification/history/{employee_code}`

What this covers:

- persisted alias mapping
- persisted approval/rejection decisions
- shared verification store loading
- employee-level verification history

Relevant files:

- `backend/app/routes/attendance_verification.py`
- `backend/app/services/attendance_verification_service.py`
- `backend/app/db.py`
- `backend/app/schemas/hr_master.py`

## 2. Frontend-Only Modules

These areas are currently not persisted through backend APIs or database models.

### 2.1 Dashboard Composition

Current persistence mode:

- hybrid composition

The dashboard currently reads:

- upload workspace from `sessionStorage`
- attendance snapshot from `localStorage`
- Employee Master from backend APIs
- Attendance Verification store from backend APIs

Storage helpers involved:

- `frontend/lib/upload-workspace-storage.ts`
- `frontend/lib/attendance-snapshot.ts`
- `frontend/lib/employee-master-api.ts`
- `frontend/lib/attendance-verification-api.ts`

Dashboard implementation:

- `frontend/components/dashboard-overview.tsx`

Important note:

- the dashboard is still not backed by its own summary API
- it remains partly browser-session-driven because attendance upload workspace is still session based
- employee/verification data is no longer frontend-only

### 2.2 Frontend Cache Mirrors

These are still present, but they are no longer the primary source of truth.

Current mode:

- browser cache mirror for compatibility

What remains frontend-local:

- upload workspace session snapshot
- attendance snapshot cache
- verification reviewer display name

Relevant files:

- `frontend/lib/upload-workspace-storage.ts`
- `frontend/lib/attendance-snapshot.ts`
- `frontend/lib/attendance-verification-storage.ts`
- `frontend/lib/employee-master-storage.ts`

## 3. APIs That Already Exist

Current backend API surface now includes both attendance processing and HRMS persistence APIs.

### Upload and Attendance Processing APIs

- `POST /upload`
  - upload workbook
  - run preview/analysis

- `GET /upload/{upload_id}/sheet/{sheet_name}`
  - analyze a selected sheet from an existing uploaded workbook

- `POST /upload/{upload_id}/attendance-review`
  - apply attendance review decisions
  - apply policy rules
  - apply holiday markers
  - apply administrative attendance exceptions
  - return recalculated attendance output

- `POST /upload/{upload_id}/attendance-merge`
  - apply employee merge instructions
  - return merged/reprocessed attendance output

Backend route files:

- `backend/app/routes/upload.py`
- `backend/app/main.py`

### Employee Master APIs

- `GET /employees`
- `POST /employees`
- `POST /employees/bulk-upsert`
- `GET /employees/{employee_code}`
- `PUT /employees/{employee_code}`
- `DELETE /employees/{employee_code}`
- `DELETE /employees`

### Salary Component APIs

- `GET /salary-components`
- `PUT /salary-components`

### Attendance Verification APIs

- `GET /attendance-verification/store`
- `POST /attendance-verification/approve`
- `POST /attendance-verification/reject`
- `POST /attendance-verification/alias`
- `GET /attendance-verification/history/{employee_code}`

### Existing Backend Schemas

The backend already exposes rich Pydantic response/request models for attendance workflow data, including:

- upload response
- attendance review request
- attendance merge request
- attendance processed rows
- attendance exception groups
- attendance monthly summaries
- attendance policy rules
- holiday markers
- administrative attendance exceptions

Relevant file:

- `backend/app/schemas/upload.py`

## 4. APIs Still Missing

These are the missing backend APIs required to make Employee Master, Attendance Verification, and Dashboard fully persisted and multi-user safe.

### 4.1 Dashboard APIs

Missing:

- `GET /dashboard/overview`
- `GET /dashboard/payroll-readiness`
- `GET /dashboard/attendance-verification-summary`

Right now the dashboard computes these values in the frontend instead of requesting a unified backend summary.

### 4.2 Persisted Upload Workspace Retrieval APIs

Currently the backend can continue a workflow by `upload_id`, but there is no general API for listing or restoring historical HR workspaces across users.

Potential future APIs:

- `GET /uploads`
- `GET /uploads/{upload_id}`
- `GET /uploads/{upload_id}/summary`

These are optional for the next phase, but useful if multi-session operational continuity is needed.

## 5. Database Models Still Missing

Core HRMS persistence models are now implemented in the backend SQLite layer.

### 5.1 Implemented Persistence Tables

Implemented:

- `employees`
  - employee_code
  - employee_name
  - department
  - designation
  - salary_mode
  - unit
  - doj
  - gross_monthly_salary
  - opening_leave_balance
  - leave_accrued
  - leave_availed
  - closing_leave_balance
  - comp_off_balance
  - status

- `salary_components`
  - id
  - component_name
  - percentage
  - active
  - sort_order

- `attendance_verification_aliases`
  - employee_code
  - attendance_name
  - normalized_attendance_name
  - master_name
  - created_by
  - created_at

- `attendance_verification_decisions`
  - employee_code
  - attendance_name
  - master_name
  - action
  - status
  - remarks
  - actor
  - acted_at

### 5.2 Optional Audit / Workspace Models Still Missing

Recommended for stronger auditability:

- `UploadWorkspace`
  - upload_id
  - file metadata
  - selected sheet
  - created_by
  - created_at

- `AttendanceReviewAudit`
  - upload_id
  - employee/date context
  - action
  - reason
  - remarks
  - actor
  - acted_at

These are not strictly required for the next phase if the current upload flow remains file-based, but they would improve continuity and traceability.

## 6. Screen-by-Screen Gap Summary

### Employee Master Screens

Screens:

- `employees`
- `employees/new`
- `employees/[code]`

Current reality:

- fully functional frontend experience
- backend CRUD support now exists
- persisted in backend
- shared across users/devices using the same backend

Gap:

- no major CRUD gap remains
- optional future import audit/history could be added

### Attendance Verification Screens

Screens:

- verification summary section
- verification drilldown dialog
- verification review dialog
- verification status shown inside employee screens

Current reality:

- fully functional frontend workflow
- review outcomes now saved through backend APIs
- registry is still computed in the browser, but from backend-persisted store data

Gap:

- no core persistence gap remains
- optional dedicated backend verification summary endpoint could still be added

### Dashboard

Screen:

- `dashboard`

Current reality:

- shows useful summaries
- attendance session portion depends on uploaded backend response cached in sessionStorage
- employee/verification stats now come from backend APIs

Gap:

- backend dashboard API
- cross-device consistency

## 7. Recommended Next Development Phase

Recommended next phase:

### Phase: Backend Dashboard and Workspace Persistence

This should be the next development phase now that Employee Master and Verification persistence are in place.

Recommended order:

1. Add a backend dashboard summary API
2. Add persisted upload-workspace/session tracking if required across users/devices
3. Reduce reliance on browser cache mirrors where safe
4. Add optional audit/history views for employee changes and verification activity

Why this phase should come next:

- the attendance/payroll engine is already backend-backed and rich
- Employee Master persistence is now in place
- Attendance Verification persistence is now in place
- the remaining gap is aggregated operational state and cross-session workspace continuity

### What should remain unchanged in that phase

To minimize risk, the next phase should preserve:

- attendance classification logic
- payroll reconciliation logic
- HR review workflow
- upload workflow
- existing attendance response schemas unless extension is necessary

## 8. Bottom Line

Current system status:

- Attendance processing is backend-backed.
- Employee Master is backend-backed.
- Attendance Verification is backend-backed.
- Dashboard is still partially browser-derived because upload workspace/session state is not yet a dedicated backend module.

The backend is now strong for both payroll-attendance processing and core HRMS persistence.

The main remaining implementation gap is:

- backend-derived dashboard summaries
- multi-session upload workspace persistence
- deeper audit/reporting surfaces on top of persisted HRMS data
