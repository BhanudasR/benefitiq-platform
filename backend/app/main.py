from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.config import settings
from .api import (routes_health, routes_auth, routes_upload, routes_onboarding,
                      routes_batches, routes_metrics, routes_simulation,
                      routes_terms, routes_recommendations, routes_wellness,
                      routes_admin)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.auto_create_tables:
        from .db.init_db import init_db
        init_db()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)
app.include_router(routes_health.router)
app.include_router(routes_auth.router)
app.include_router(routes_upload.router)
app.include_router(routes_onboarding.router)
app.include_router(routes_batches.router)
app.include_router(routes_metrics.router)
app.include_router(routes_simulation.router)
app.include_router(routes_terms.router)
app.include_router(routes_terms.brouter)
app.include_router(routes_recommendations.router)
app.include_router(routes_wellness.router)
app.include_router(routes_admin.router)


@app.get("/")
def root():
    return {"app": settings.app_name, "docs": "/docs"}
