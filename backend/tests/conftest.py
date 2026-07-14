import os, tempfile
os.environ.setdefault("BIQ_STORAGE_BACKEND", "local")
os.environ.setdefault("BIQ_STORAGE_LOCAL_ROOT", tempfile.mkdtemp(prefix="biq_raw_"))
os.environ.setdefault("BIQ_JWT_SECRET", "test-secret")
