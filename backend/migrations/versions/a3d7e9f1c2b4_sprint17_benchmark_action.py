"""sprint17 benchmark_action (benchmark gap -> renewal/sandbox linkage)

Revision ID: a3d7e9f1c2b4
Revises: f1b5d9c3a7e2
Create Date: 2026-07-21 15:00:00.000000

Additive only: creates the benchmark_action table. No existing table is modified.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3d7e9f1c2b4'
down_revision: Union[str, Sequence[str], None] = 'f1b5d9c3a7e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('benchmark_action',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('tenant_id', sa.String(length=64), nullable=False),
    sa.Column('client_id', sa.String(length=64), nullable=True),
    sa.Column('policy_id', sa.String(length=64), nullable=True),
    sa.Column('policy_version_id', sa.String(length=64), nullable=True),
    sa.Column('feature_id', sa.String(length=48), nullable=False),
    sa.Column('feature_name', sa.String(length=128), nullable=False),
    sa.Column('current_client_value', sa.Text(), nullable=True),
    sa.Column('benchmark_value', sa.Text(), nullable=True),
    sa.Column('classification', sa.String(length=48), nullable=False),
    sa.Column('peer_group_definition', sa.JSON(), nullable=True),
    sa.Column('confidence', sa.String(length=16), nullable=True),
    sa.Column('confidence_score', sa.Numeric(precision=6, scale=3), nullable=True),
    sa.Column('evidence', sa.JSON(), nullable=True),
    sa.Column('caveats', sa.JSON(), nullable=True),
    sa.Column('selected_action', sa.String(length=32), nullable=False),
    sa.Column('target_module', sa.String(length=32), nullable=False),
    sa.Column('simulation_ready', sa.Boolean(), nullable=False),
    sa.Column('sandbox_lever', sa.String(length=48), nullable=True),
    sa.Column('not_ready_reason', sa.Text(), nullable=True),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('action_history', sa.JSON(), nullable=True),
    sa.Column('created_by', sa.String(length=128), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('benchmark_action', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_benchmark_action_tenant_id'), ['tenant_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_benchmark_action_feature_id'), ['feature_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('benchmark_action', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_benchmark_action_feature_id'))
        batch_op.drop_index(batch_op.f('ix_benchmark_action_tenant_id'))
    op.drop_table('benchmark_action')
