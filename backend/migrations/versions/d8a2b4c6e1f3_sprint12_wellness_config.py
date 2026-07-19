"""sprint12 wellness_config

Revision ID: d8a2b4c6e1f3
Revises: c7f1a2b3d4e5
Create Date: 2026-07-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd8a2b4c6e1f3'
down_revision: Union[str, Sequence[str], None] = 'c7f1a2b3d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('wellness_config',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('tenant_id', sa.String(length=64), nullable=False),
    sa.Column('opportunity_min_share', sa.Numeric(precision=6, scale=4), nullable=False),
    sa.Column('min_claim_count', sa.Integer(), nullable=False),
    sa.Column('k_anonymity_min_cohort_size', sa.Integer(), nullable=False),
    sa.Column('weight_data_quality', sa.Numeric(precision=6, scale=4), nullable=False),
    sa.Column('weight_evidence_completeness', sa.Numeric(precision=6, scale=4), nullable=False),
    sa.Column('config_version', sa.String(length=32), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('wellness_config', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_wellness_config_tenant_id'), ['tenant_id'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('wellness_config', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_wellness_config_tenant_id'))

    op.drop_table('wellness_config')
