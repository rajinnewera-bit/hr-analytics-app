from fastapi import APIRouter

from app.schemas.hr_master import (
    AttendanceVerificationAliasRequest,
    AttendanceVerificationApproveRequest,
    AttendanceVerificationDecisionRecord,
    AttendanceVerificationRejectRequest,
    AttendanceVerificationStoreResponse,
)
from app.services.attendance_verification_service import (
    approve_employee_match,
    create_alias_mapping,
    list_employee_history,
    load_verification_store,
    reject_employee_match,
)

router = APIRouter()


@router.get("/attendance-verification/store", response_model=AttendanceVerificationStoreResponse)
async def get_attendance_verification_store() -> AttendanceVerificationStoreResponse:
    return load_verification_store()


@router.post("/attendance-verification/approve", response_model=AttendanceVerificationStoreResponse)
async def approve_attendance_match(
    payload: AttendanceVerificationApproveRequest,
) -> AttendanceVerificationStoreResponse:
    return approve_employee_match(payload)


@router.post("/attendance-verification/reject", response_model=AttendanceVerificationStoreResponse)
async def reject_attendance_match(
    payload: AttendanceVerificationRejectRequest,
) -> AttendanceVerificationStoreResponse:
    return reject_employee_match(payload)


@router.post("/attendance-verification/alias", response_model=AttendanceVerificationStoreResponse)
async def create_attendance_alias(
    payload: AttendanceVerificationAliasRequest,
) -> AttendanceVerificationStoreResponse:
    return create_alias_mapping(payload)


@router.get(
    "/attendance-verification/history/{employee_code}",
    response_model=list[AttendanceVerificationDecisionRecord],
)
async def get_attendance_verification_history(
    employee_code: str,
) -> list[AttendanceVerificationDecisionRecord]:
    return list_employee_history(employee_code)

