# Task 2 Report: Visit Counter Service Layer & Auth Integration

## Overview
Implemented the TypeScript definitions and service layer for Visit Counter, along with login tracking integration in `auth-service.ts`.

## Deliverables

### 1. Types: `src/lib/visit-counter-types.ts`
- `ScreenKey`: `'dashboard' | 'epic_alerts' | 'epic_reports' | 'epic_in_po'`
- `SCREEN_NAMES`: Vietnamese display labels for the 4 tracked screens
- `TRACKED_SCREEN_KEYS`: Array of all 4 tracked screen keys
- Interfaces:
  - `RecentLoginUser`: `{ userId, username, fullName, email, lastLoginAt }`
  - `FooterVisitSummary`: `{ totalVisits, weeklyVisits, screenVisits, screenKey, lastLoginUsers }`
  - `TrendLinePoint`: `{ date, label, count }`
  - `ScreenVisitStat`: `{ screenKey, screenName, totalVisits, weeklyVisits, prevWeeklyVisits, todayVisits }`
  - `DomainUserStat`: `{ userId, username, fullName, email, totalVisits, weeklyVisits, todayVisits }`
  - `DomainVisitStat`: `{ domainId, domainCode, domainName, totalVisits, weeklyVisits, todayVisits, users }`
  - `DetailedVisitStats`: `{ appVisits, trendLine, screenStats, domainStats, recentLogins }`

### 2. Service Layer: `src/lib/visit-counter-service.ts`
- Timezone handling: Asia/Ho_Chi_Minh (`+07:00`) for all day boundaries (Today $T$, Weekly $T-7 \to T$, Prev Weekly $T-15 \to T-8$).
- Implemented functions:
  - `recordAppLogin(userId: number): Promise<void>`
  - `recordScreenView(userId: number | null, screenKey: ScreenKey): Promise<void>`
  - `getRecentLoginUsers(limit: number = 5): Promise<RecentLoginUser[]>` (with fallback to `users.last_login_at` and `email.split('@')[0]` extraction)
  - `getFooterVisitSummary(screenKey?: ScreenKey | null): Promise<FooterVisitSummary>`
  - `getDetailedVisitStats(): Promise<DetailedVisitStats>`
    - Zero-filled 8-day daily trendline ($T-7 \to T$)
    - 4 tracked screen metrics comparison
    - Aggregated domain visits with user breakdown and fallback to "Chưa gán domain" (`KHAC`)
    - 10 most recent login users

### 3. Authentication Hook: `src/lib/auth-service.ts`
- Imported `recordAppLogin` from `@/lib/visit-counter-service`.
- In `authenticateLocal()`, invoked `await recordAppLogin(user.id);` immediately after updating `last_login_at` and `recordUsageEvent`.

## Verification & Tests
1. **Type Check**:
   - Command: `cmd /c npx tsc --noEmit`
   - Result: 0 errors, clean compilation.
2. **Integration Test**:
   - Created test script verifying event insertion, retrieval, timezone sliding window calculations, trendline zero-filling, and domain aggregations against local PostgreSQL target.
   - Result: All test assertions passed.

## Status
- **Status**: DONE
- **Summary**: Implemented Visit Counter types, database service layer with Asia/Ho_Chi_Minh timezone handling, and hooked `recordAppLogin` into `auth-service.ts`.
- **Commits**: none
- **Tests**: `cmd /c npx tsc --noEmit` passed with 0 errors; database integration tests passed.
- **Concerns**: none
