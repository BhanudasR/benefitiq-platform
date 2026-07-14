"""Create all tables on the configured engine. Imports every model module so the
metadata is complete. Used for local/dev/pilot startup; production uses Alembic."""
from .base import Base
from .session import engine
from ..models import governance, canonical  # noqa: F401  (register mappers)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
