from contextlib import asynccontextmanager
from fastapi import FastAPI
from .core.config import settings
from .api import (routes_health, routes_auth, routes_upload, routes_onboarding,
                      routes_batches, routes_metrics)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.auto_create_tables:
        from .db.init_db import init_db
        init_db()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.include_router(routes_health.router)
app.include_router(routes_auth.router)
app.include_router(routes_upload.router)
app.include_router(routes_onboarding.router)
app.include_router(routes_batches.router)
app.include_router(routes_metrics.router)


@app.get("/")
def root():
    return {"app": settings.app_name, "docs": "/docs"}
