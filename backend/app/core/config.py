"""Runtime configuration (12-factor, env-driven). No secrets in code."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BIQ_", env_file=".env", extra="ignore")

    app_name: str = "BenefitIQ Platform"
    env: str = "local"
    # Database (canonical + governance + audit)
    database_url: str = "postgresql+psycopg2://biq:biq@localhost:5432/benefitiq"
    # Object storage for immutable raw uploads: backend = "local" | "s3"
    storage_backend: str = "local"
    storage_local_root: str = "./_raw_store"
    s3_endpoint: str = "http://localhost:9000"
    s3_bucket: str = "biq-raw"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_region: str = "ap-south-1"  # Mumbai
    # Auth
    jwt_secret: str = "change-me-in-prod"
    jwt_alg: str = "HS256"
    jwt_ttl_minutes: int = 60
    # Dev/pilot convenience: create tables on startup (use Alembic in prod -> set false)
    auto_create_tables: bool = True


settings = Settings()
