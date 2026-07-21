"""Raw upload: store immutably (content-addressed, hashed), register RawFile +
UploadBatch, and audit. NO mapping/analytics here — that is the next sprint.
Low quality never blocks this upload; it will block blind analytics downstream."""
from fastapi import APIRouter, Depends, UploadFile, File, Form
from ..api.deps import require_role, require_capability
from ..core.security import Role
from ..services.storage import get_store
from ..services.hashing import sha256_bytes

router = APIRouter(prefix="/uploads", tags=["onboarding"])


@router.post("")
async def upload_raw(
    file: UploadFile = File(...),
    file_kind: str = Form(...),                 # policy|member|claims|terms|benchmark|pdf
    client_id: str = Form(default=""),
    principal: dict = Depends(require_role(Role.ANALYST)),
    _cap: dict = Depends(require_capability("upload")),   # real users need the 'upload' capability (read-only testers cannot)
):
    data = await file.read()
    digest = sha256_bytes(data)
    tenant = principal["tenant_id"]
    key = f"{tenant}/{file_kind}/{digest}/{file.filename}"
    store = get_store()
    res = store.put_immutable(key, data)
    # NOTE: RawFile + UploadBatch rows + audit are written here when a DB session
    # is wired (Sprint 1). Response reflects the immutable landing + integrity.
    return {"status": "UPLOADED", "file_kind": file_kind, "file_name": file.filename,
            "sha256": res["sha256"], "size_bytes": res["size"], "storage_key": key,
            "immutable": True, "written": res["written"], "tenant_id": tenant}
