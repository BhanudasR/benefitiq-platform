from fastapi import APIRouter
from ..core.config import settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    return {"status": "ok", "app": settings.app_name, "env": settings.env,
            "storage_backend": settings.storage_backend}
