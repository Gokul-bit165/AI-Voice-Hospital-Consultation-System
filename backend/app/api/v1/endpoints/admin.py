from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List

from backend.app.core.deps import get_db_session, require_admin
from backend.app.models.models import AuditLog, Doctor
from backend.app.schemas.schemas import AuditLogResponse, UserCreate
from backend.app.core.security import get_password_hash

router = APIRouter()

@router.get("/audit-logs", response_model=List[AuditLogResponse])
async def get_audit_logs(
    db: AsyncSession = Depends(get_db_session),
    current_user = Depends(require_admin)
):
    """
    Returns audit logs from the system. Restricted to Admins.
    """
    stmt = select(AuditLog).order_by(AuditLog.timestamp.desc())
    result = await db.execute(stmt)
    logs = result.scalars().all()
    return logs

@router.post("/users")
async def create_user(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user = Depends(require_admin)
):
    """
    Creates a new doctor or receptionist. Restricted to Admins.
    """
    # Check if email already exists
    stmt = select(Doctor).filter(Doctor.email == user_in.email)
    existing = (await db.execute(stmt)).scalars().first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists."
        )

    db_user = Doctor(
        email=user_in.email,
        full_name=user_in.full_name,
        specialization=user_in.specialization,
        license_number=user_in.license_number,
        phone=user_in.phone,
        password_hash=get_password_hash(user_in.password),
        role=user_in.role
    )
    db.add(db_user)
    await db.commit()
    return {"detail": f"Successfully created user {user_in.email} as {user_in.role}"}
