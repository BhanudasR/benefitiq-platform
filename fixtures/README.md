# Masked sample fixtures
Synthetic, masked TPA-style files aligned to the IRDAI F15 field headings, used
by unit tests and local pilot runs. No real member PII. Row 3 of claims
deliberately omits critical fields (paid amount, hospital, diagnosis) and uses
status 4 (Outstanding) to exercise the Data Quality Score + quarantine logic in
the next sprint. Claim CLM-500001 has actual room rent (₹40,000) that will
exceed the allowed room rent at a 1.5% cap, exercising room-rent proportionate
deduction.
