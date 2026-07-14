import os, tempfile

os.environ.setdefault("BIQ_STORAGE_BACKEND", "local")
os.environ.setdefault("BIQ_STORAGE_LOCAL_ROOT", tempfile.mkdtemp(prefix="biq_raw_"))
os.environ.setdefault("BIQ_JWT_SECRET", "test-secret")
os.environ.setdefault("BIQ_DATABASE_URL", "sqlite:///" + os.path.join(
    tempfile.mkdtemp(prefix="biq_db_"), "biq_test.db"))

import pytest
from app.db.init_db import init_db
from app.db.session import SessionLocal


@pytest.fixture(scope="session", autouse=True)
def _create_tables():
    init_db()
    yield


@pytest.fixture
def db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()
