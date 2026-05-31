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

## 2. Frontend-Only Modules

These areas are currently not persisted through backend APIs or database models.

### 2.1 Employee Master

Current persistence mode:

- `localStorage`

What is frontend-only:

- employee records
- employee profile edits
- salary component settings
- employee import into master
- employee delete/reset operations

Frontend storage implementation:

- `frontend/lib/employee-master-storage.ts`

Key local storage keys:

- `hr_analytics_employee_master_v1`
- `hr_analytics_salary_components_v1`

Screens affected:

- `frontend/app/(hrms)/employees/page.tsx`
- `frontend/app/(hrms)/employees/[code]/page.tsx`
- `frontend/app/(hrms)/employees/new/page.tsx`
- `frontend/components/employee-master-panel.tsx`
- `frontend/components/employee-create-view.tsx`
- `frontend/components/employee-profile-view.tsx`

### 2.2 Attendance Verification

Current persistence mode:

- `localStorage`

What is frontend-only:

- verification reviewer name
- alias creation
- manual approval decisions
- rejection decisions
- verification history

Frontend storage implementation:

- `frontend/lib/attendance-verification-storage.ts`

Key local storage keys:

- `hr_analytics_attendance_verification_v1`
- `hr_analytics_verification_reviewer_v1`

Frontend-derived registry implementation:

- `frontend/lib/attendance-verification-registry.ts`

Important note:

- verification status is currently computed in the browser by combining:
  - Employee Master from `localStorage`
  - attendance snapshot from `localStorage`
  - verification store from `localStorage`

Screens affected:

- `frontend/components/attendance-verification-summary-section.tsx`
- `frontend/components/attendance-verification-review-dialog.tsx`
- `frontend/components/attendance-verification-drilldown-dialog.tsx`
- `frontend/components/employee-master-panel.tsx`
- `frontend/components/employee-profile-view.tsx`

### 2.3 Dashboard Composition

Current persistence mode:

- hybrid frontend-only composition

The dashboard currently reads:

- upload workspace from `sessionStorage`
- attendance snapshot from `localStorage`
- Employee Master from `localStorage`
- Attendance Verification store from `localStorage`

Storage helpers involved:

- `frontend/lib/upload-workspace-storage.ts`
- `frontend/lib/attendance-snapshot.ts`
- `frontend/lib/employee-master-storage.ts`
- `frontend/lib/attendance-verification-storage.ts`

Dashboard implementation:

- `frontend/components/dashboard-overview.tsx`

Important note:

- the dashboard is not backed by its own API
- it does not read Employee Master or Verification from the backend
- it is only as complete as the browser-local state on the current device/session

## 3. APIs That Already Exist

Current backend API surface is limited and clearly scoped.

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

### 4.1 Employee Master APIs

Missing:

- `GET /employees`
- `POST /employees`
- `GET /employees/{employee_code}`
- `PUT /employees/{employee_code}`
- `DELETE /employees/{employee_code}`

Optional but recommended:

- `POST /employees/import`
- `GET /employees/units`
- `GET /employees/departments`

### 4.2 Salary Component / Payroll Settings APIs

Missing:

- `GET /salary-components`
- `PUT /salary-components`

These are currently stored only in browser localStorage.

### 4.3 Attendance Verification APIs

Missing:

- `GET /attendance-verification`
- `POST /attendance-verification/decision`
- `POST /attendance-verification/alias`
- `GET /attendance-verification/history/{employee_code}`
- `GET /attendance-verification/summary`

Optional but recommended:

- `DELETE /attendance-verification/alias/{alias_id}`
- `DELETE /attendance-verification/decision/{decision_id}`

### 4.4 Dashboard APIs

Missing:

- `GET /dashboard/overview`
- `GET /dashboard/payroll-readiness`
- `GET /dashboard/attendance-verification-summary`

Right now the dashboard computes these values in the frontend instead of requesting a unified backend summary.

### 4.5 Persisted Upload Workspace Retrieval APIs

Currently the backend can continue a workflow by `upload_id`, but there is no general API for listing or restoring historical HR workspaces across users.

Potential future APIs:

- `GET /uploads`
- `GET /uploads/{upload_id}`
- `GET /uploads/{upload_id}/summary`

These are optional for the next phase, but useful if multi-session operational continuity is needed.

## 5. Database Models Still Missing

There are currently no backend database models in this repository for the HRMS layer.

### 5.1 Employee Master Models

Needed:

- `Employee`
  - employee_code
  - employee_name
  - department
  - designation
  - salary_mode
  - unit
  - doj
  - gross_monthly_salary
  - status

- `EmployeeLeaveBalance`
  - employee reference
  - casual leave balance
  - sick leave balance
  - earned leave balance
  - comp off balance

### 5.2 Salary Component Models

Needed:

- `SalaryComponent`
  - component identifier
  - component name
  - percentage
  - active flag

Depending on final design:

- global salary structure model
- or unit/company-level payroll settings model

### 5.3 Attendance Verification Models

Needed:

- `AttendanceVerificationAlias`
  - employee_code
  - attendance_name
  - normalized_attendance_name
  - master_name
  - created_by
  - created_at

- `AttendanceVerificationDecision`
  - employee_code
  - attendance_name
  - master_name
  - action
  - status
  - remarks
  - actor
  - acted_at

### 5.4 Optional Audit / Workspace Models

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
- no backend CRUD support
- all data stored in browser localStorage
- not shared across users/devices

Gap:

- backend Employee Master API
- backend persistence
- backend salary component persistence

### Attendance Verification Screens

Screens:

- verification summary section
- verification drilldown dialog
- verification review dialog
- verification status shown inside employee screens

Current reality:

- fully functional frontend workflow
- review outcomes saved only in browser localStorage
- registry built entirely in the browser

Gap:

- backend alias persistence
- backend decision persistence
- shared reviewer audit history

### Dashboard

Screen:

- `dashboard`

Current reality:

- shows useful summaries
- attendance session portion depends on uploaded backend response cached in sessionStorage
- employee/verification stats depend on frontend-local stores

Gap:

- backend dashboard API
- backend-backed employee and verification summary source
- cross-device consistency

## 7. Recommended Next Development Phase

Recommended next phase:

### Phase: Backend Persistence for Employee Master + Attendance Verification

This should be the next development phase before expanding the dashboard further.

Recommended order:

1. Add backend Employee Master data models and CRUD APIs
2. Add backend Salary Component settings model/API
3. Add backend Attendance Verification alias/decision models and APIs
4. Replace frontend localStorage writes with API-backed persistence in:
   - `employee-master-storage.ts`
   - `attendance-verification-storage.ts`
5. Refactor dashboard overview to consume backend-backed employee/verification summaries

Why this phase should come next:

- the attendance/payroll engine is already backend-backed and rich
- the HRMS screens already exist
- the largest remaining product gap is not UI, but persistence and shared operational state
- without this phase, Employee Master and Verification remain single-browser features

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
- Employee Master is frontend-only.
- Attendance Verification is frontend-only.
- Dashboard is partially backend-fed and partially browser-derived.

The backend is already strong where payroll-attendance processing is concerned.

The missing implementation layer is the HRMS persistence layer for:

- employee records
- salary settings
- verification aliases
- verification decisions
- backend-derived dashboard summaries across users/devices

