# 0002. Log every booking status change from day one

- **Date:** 2026-11-07
- **Status:** Accepted
- **Door:** one-way. Data we don't record today is gone for good.

## Context
After launch we want funnel analysis: how many requests get accepted, how fast drivers respond, and where people drop off. The `bookings` table only holds the *current* status, so the history would be lost.

## Decision
Add an append-only table, `booking_events`, with one row per status change (`from_status`, `to_status`, `actor_id`, `created_at`). A database trigger writes it, so the app can't forget to.

## Consequences
- Questions like "what is the median time from requested to accepted?" become a single SQL query.
- The table grows with every action. That's fine at our scale, and we can add an index or partition it later.
- We'll add the same kind of log for sign-up steps once that flow exists.
