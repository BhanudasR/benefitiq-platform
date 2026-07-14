"""Shared test helpers: locate and read the masked sample fixtures."""
from pathlib import Path

FIX = Path(__file__).resolve().parents[2] / "fixtures"


def read_bytes(name: str) -> bytes:
    return (FIX / name).read_bytes()


CLAIMS = "claims_sample_masked.csv"
MEMBER = "member_sample_masked.csv"
POLICY = "policy_sample_masked.csv"
