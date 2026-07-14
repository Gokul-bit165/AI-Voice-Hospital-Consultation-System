from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from datetime import timedelta

from backend.app.core.deps import get_db_session, get_current_user
from backend.app.core.security import verify_password, create_access_token, create_refresh_token, decode_token
from backend.app.core.config import settings
from backend.app.models.models import Doctor
from backend.app.schemas.schemas import Token, LoginRequest, UserCreate
from pydantic import BaseModel

router = APIRouter()

class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    specialization: str
    role: str

    class Config:
        from_attributes = True

@router.post("/login", response_model=Token)
async def login(login_data: LoginRequest, db: AsyncSession = Depends(get_db_session)):
    result = await db.execute(select(Doctor).filter(Doctor.email == login_data.email))
    doctor = result.scalars().first()
    
    if not doctor or not verify_password(login_data.password, doctor.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect email or password"
        )
        
    access_token = create_access_token(subject=doctor.id, role=doctor.role)
    refresh_token = create_refresh_token(subject=doctor.id, role=doctor.role)
    
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        role=doctor.role
    )

@router.post("/refresh", response_model=Token)
async def refresh(refresh_token_data: dict, db: AsyncSession = Depends(get_db_session)):
    rf_token = refresh_token_data.get("refresh_token")
    if not rf_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Refresh token required")
        
    payload = decode_token(rf_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        
    user_id = payload.get("sub")
    role = payload.get("role")
    
    # Generate new access token
    new_access_token = create_access_token(subject=user_id, role=role)
    # Return same refresh token or generate new one
    return Token(
        access_token=new_access_token,
        refresh_token=rf_token,
        role=role
    )

@router.post("/logout")
async def logout():
    return {"detail": "Successfully logged out"}

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: Doctor = Depends(get_current_user)):
    return current_user
