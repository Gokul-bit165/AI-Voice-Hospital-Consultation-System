from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List

from backend.app.core.deps import get_db_session, require_admin
from backend.app.models.models import AuditLog, Doctor, ApiKey
from backend.app.schemas.schemas import AuditLogResponse, UserCreate, ApiKeyCreate, ApiKeyUpdate, ApiKeyResponse
from backend.app.core.security import get_password_hash
from backend.app.core.api_keys import load_api_keys


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

def mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 12:
        return "••••" + key[-4:]
    return f"{key[:8]}••••{key[-4:]}"

@router.get("/api-keys", response_model=List[ApiKeyResponse])
async def get_api_keys(
    db: AsyncSession = Depends(get_db_session),
    current_user = Depends(require_admin)
):
    """
    List all configured dynamic API keys. Restrict to Admin.
    """
    stmt = select(ApiKey).order_by(ApiKey.service, ApiKey.priority.desc())
    result = await db.execute(stmt)
    keys = result.scalars().all()
    
    response = []
    for k in keys:
        response.append(ApiKeyResponse(
            id=k.id,
            service=k.service,
            name=k.name,
            masked_key=mask_key(k.key_value),
            priority=k.priority,
            is_active=k.is_active,
            fail_count=k.fail_count,
            created_at=k.created_at
        ))
    return response

@router.post("/api-keys", response_model=ApiKeyResponse)
async def create_api_key(
    key_in: ApiKeyCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user = Depends(require_admin)
):
    """
    Register a new dynamic API key. Restrict to Admin.
    """
    db_key = ApiKey(
        service=key_in.service.lower(),
        name=key_in.name,
        priority=key_in.priority if key_in.priority is not None else 1,
        is_active=key_in.is_active if key_in.is_active is not None else True
    )
    db_key.key_value = key_in.key_value # uses encrypted setter
    
    db.add(db_key)
    await db.commit()
    await db.refresh(db_key)
    
    # Reload in-memory cache
    await load_api_keys()
    
    return ApiKeyResponse(
        id=db_key.id,
        service=db_key.service,
        name=db_key.name,
        masked_key=mask_key(key_in.key_value),
        priority=db_key.priority,
        is_active=db_key.is_active,
        fail_count=db_key.fail_count,
        created_at=db_key.created_at
    )

@router.put("/api-keys/{key_id}", response_model=ApiKeyResponse)
async def update_api_key(
    key_id: str,
    key_in: ApiKeyUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user = Depends(require_admin)
):
    """
    Update details of an existing API key. Restrict to Admin.
    """
    stmt = select(ApiKey).filter(ApiKey.id == key_id)
    result = await db.execute(stmt)
    db_key = result.scalars().first()
    if not db_key:
        raise HTTPException(status_code=404, detail="API key not found")
        
    if key_in.name is not None:
        db_key.name = key_in.name
    if key_in.priority is not None:
        db_key.priority = key_in.priority
    if key_in.is_active is not None:
        db_key.is_active = key_in.is_active
    if key_in.key_value is not None and key_in.key_value.strip() != "":
        db_key.key_value = key_in.key_value
        
    await db.commit()
    await db.refresh(db_key)
    
    # Reload in-memory cache
    await load_api_keys()
    
    return ApiKeyResponse(
        id=db_key.id,
        service=db_key.service,
        name=db_key.name,
        masked_key=mask_key(db_key.key_value),
        priority=db_key.priority,
        is_active=db_key.is_active,
        fail_count=db_key.fail_count,
        created_at=db_key.created_at
    )

@router.delete("/api-keys/{key_id}")
async def delete_api_key(
    key_id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user = Depends(require_admin)
):
    """
    Delete an API key. Restrict to Admin.
    """
    stmt = select(ApiKey).filter(ApiKey.id == key_id)
    result = await db.execute(stmt)
    db_key = result.scalars().first()
    if not db_key:
        raise HTTPException(status_code=404, detail="API key not found")
        
    await db.delete(db_key)
    await db.commit()
    
    # Reload in-memory cache
    await load_api_keys()
    
    return {"detail": "Successfully deleted API key"}

