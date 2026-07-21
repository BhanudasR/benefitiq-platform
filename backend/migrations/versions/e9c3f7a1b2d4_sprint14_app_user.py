"""sprint14 app_user (admin user management + RBAC)

Revision ID: e9c3f7a1b2d4
Revises: d8a2b4c6e1f3
Create Date: 2026-07-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e9c3f7a1b2d4'
down_revision: Union[str, Sequence[str], None] = 'd8a2b4c6e1f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('app_user',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('username', sa.String(length=128), nullable=False),
    sa.Column('display_name', sa.String(length=128), nullable=True),
    sa.Column('password_hash', sa.String(length=255), nullable=False),
    sa.Column('base_role', sa.String(length=16), nullable=False),
    sa.Column('user_role', sa.String(length=32), nullable=False),
    sa.Column('tenant_id', sa.String(length=64), nullable=False),
    sa.Column('broker_id', sa.String(length=64), nullable=True),
    sa.Column('client_ids', sa.JSON(), nullable=True),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('created_by', sa.String(length=128), nullable=True),
    sa.Column('last_login', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('app_user', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_app_user_email'), ['email'], unique=True)
        batch_op.create_index(batch_op.f('ix_app_user_tenant_id'), ['tenant_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('app_user', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_app_user_tenant_id'))
        batch_op.drop_index(batch_op.f('ix_app_user_email'))

    op.drop_table('app_user')
