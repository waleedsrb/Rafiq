# 0001. Stack: Expo + TypeScript + Supabase

- **Date:** 2026-11-07
- **Status:** Accepted
- **Door:** two-way (we could swap the backend later, but it gets more expensive the more we build)

## Context
Rafiq needs an iOS and Android app in Arabic and English, built quickly by a very small team.

## Decision
- **App:** Expo (React Native) + TypeScript, Expo Router for screens (`src/app/`).
- **Backend:** Supabase: Postgres, phone sign-in, file storage, scheduled jobs.
- **Payments, SMS and maps** sit behind adapters, meaning our own small interface with a fake version first, so we can choose providers (for example Lahza) later without rewriting screens.

## Consequences
- One codebase serves both phones, plus web for quick previews.
- The business rules (who can accept, seat limits) live **in the database** as triggers and Row Level Security, so no app version can skip them.
- Schema changes are always new files in `supabase/migrations/`. We never edit a migration after it has been applied.
