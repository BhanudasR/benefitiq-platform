from fastapi import FastAPI
from .core.config import settings
from .api import routes_health, routes_auth, routes_upload

app = FastAPI(title=settings.app_name)
app.include_router(routes_health.router)
app.include_router(routes_auth.router)
app.include_router(routes_upload.router)


@app.get("/")
def root():
    return {"app": settings.app_name, "docs": "/docs"}
