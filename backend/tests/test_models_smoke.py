from sqlalchemy import create_engine
from app.db.base import Base
import app.models.governance  # noqa: F401  (register tables)
import app.models.canonical   # noqa: F401


def test_schema_creates_on_sqlite():
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)
    names = set(Base.metadata.tables.keys())
    for t in ("raw_file", "upload_batch", "dataset_version", "correction_overlay",
              "validation_issue", "dq_result", "audit_log",
              "client_master", "policy_master", "member_master", "claim", "claim_bill_component"):
        assert t in names
