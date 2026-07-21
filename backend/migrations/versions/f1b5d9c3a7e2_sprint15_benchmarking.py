"""sprint15 benchmark_config + benchmark_observation

Revision ID: f1b5d9c3a7e2
Revises: e9c3f7a1b2d4
Create Date: 2026-07-21 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1b5d9c3a7e2'
down_revision: Union[str, Sequence[str], None] = 'e9c3f7a1b2d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('benchmark_config',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('tenant_id', sa.String(length=64), nullable=False),
    sa.Column('min_peer_count', sa.Integer(), nullable=False),
    sa.Column('percentile_method', sa.String(length=16), nullable=False),
    sa.Column('same_tolerance_pct', sa.Numeric(precision=6, scale=4), nullable=False),
    sa.Column('weight_peer_size', sa.Numeric(precision=6, scale=4), nullable=False),
    sa.Column('weight_term_availability', sa.Numeric(precision=6, scale=4), nullable=False),
    sa.Column('benchmark_basis', sa.String(length=48), nullable=False),
    sa.Column('config_version', sa.String(length=32), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('benchmark_config', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_benchmark_config_tenant_id'), ['tenant_id'], unique=True)

    op.create_table('benchmark_observation',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('tenant_id', sa.String(length=64), nullable=True),
    sa.Column('source', sa.String(length=64), nullable=False),
    sa.Column('peer_group_key', sa.String(length=128), nullable=False),
    sa.Column('feature_id', sa.String(length=48), nullable=False),
    sa.Column('value', sa.Numeric(precision=18, scale=4), nullable=True),
    sa.Column('text_value', sa.Text(), nullable=True),
    sa.Column('confidence', sa.Numeric(precision=5, scale=3), nullable=True),
    sa.Column('last_updated', sa.DateTime(), nullable=True),
    sa.Column('basis', sa.String(length=128), nullable=True),
    sa.Column('active_flag', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('benchmark_observation', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_benchmark_observation_tenant_id'), ['tenant_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_benchmark_observation_peer_group_key'), ['peer_group_key'], unique=False)
        batch_op.create_index(batch_op.f('ix_benchmark_observation_feature_id'), ['feature_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('benchmark_observation', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_benchmark_observation_feature_id'))
        batch_op.drop_index(batch_op.f('ix_benchmark_observation_peer_group_key'))
        batch_op.drop_index(batch_op.f('ix_benchmark_observation_tenant_id'))
    op.drop_table('benchmark_observation')

    with op.batch_alter_table('benchmark_config', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_benchmark_config_tenant_id'))
    op.drop_table('benchmark_config')
