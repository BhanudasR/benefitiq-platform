"""Placement Intelligence (Sprint 18) — a thin, read-only COMPOSITION layer.

The stay-defend / negotiate / RFQ decision is NOT recomputed here: it is reused verbatim from
the governed renewal placement-trigger engine (`services.recommendations.placement`). This
package only adds breadth + presentation — incumbent defence, RFQ readiness, a governed quote
pending state, terms-to-protect + benchmark gaps to raise (from Benefit Benchmarking, claims-
free), and an evidence view. No new decision engine, no fabricated quotes, no frontend math.
"""
