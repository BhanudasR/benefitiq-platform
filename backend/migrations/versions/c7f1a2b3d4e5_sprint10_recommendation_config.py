"""sprint10 recommendation_config

Revision ID: c7f1a2b3d4e5
Revises: bf5b4e9e2a15
Create Date: 2026-07-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7f1a2b3d4e5'
down_revision: Union[str, Sequence[str], None] = 'bf5b4e9e2a15'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('recommendation_config',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('tenant_id', sa.String(length=64), nullable=False),
    sa.Column('icr_defend_max', sa.Numeric(precision=8, scale=2), nullable=False),
    sa.Column('icr_negotiate_max', sa.Numeric(precision=8, scale=2), nullable=False),
    sa.Column('icr_redesign_max', sa.Numeric(precision=8, scale=2), nullable=False),
    sa.Column('one_off_share_defend_min', sa.Numeric(precision=6, scale=4), nullable=False),
    sa.Column('trend_worsening_pct', sa.Numeric(precision=8, scale=2), nullable=False),
    sa.Column('incumbent_defence_strong_min', sa.Numeric(precision=6, scale=4), nullable=False),
    sa.Column('rfq_ready_min', sa.Numeric(precision=6, scale=4), nullable=False),
    sa.Column('weight_data_quality', sa.Numeric(precision=6, scale=4), nullable=False),
    sa.Column('weight_evidence_completeness', sa.Numeric(precision=6, scale=4), nullable=False),
    sa.Column('config_version', sa.String(length=32), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('recommendation_config', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_recommendation_config_tenant_id'), ['tenant_id'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('recommendation_config', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_recommendation_config_tenant_id'))

    op.drop_table('recommendation_config')
