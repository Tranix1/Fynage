# Fynage, Murimi and Tengesa ecosystem audit

Audit date: 2026-10-31. This report reflects the checked-out source, not deployed Firebase state. No production data, Firebase rules, or external projects were changed.

## Overall status

**NOT READY FOR PRODUCTION AS ONE SHARED ECOSYSTEM.** The three apps do not share one Firebase project: Fynage and Tengesa use `armament-f5a0b`; Murimi uses `murimi-9a3e7`. Auth UIDs, Firestore rules, and data are therefore not one common identity/data plane. Murimi has an owner-approved read-only finance API consumed by Fynage in source. Tengesa has retail/POS and local outbox code, but Fynage does not consume its ledger, its deployment config does not deploy Firestore rules, and its payment/referral rules are a source fragment only. No live end-to-end tests or emulator security tests were run.

Project configuration evidence: the three `google-services.json` files and Murimi `.firebaserc`; Fynage and Tengesa identify `armament-f5a0b`, while Murimi client, `.firebaserc`, and function guard identify `murimi-9a3e7`.

## Per application

| App | State | Evidence / remaining work |
|---|---|---|
| Fynage | **PARTIALLY IMPLEMENTED** | Personal ledger, accounts/categories, SQLite persistence, sync queue, tombstones, retries, SMS review queue, reconciliation and CSV export exist. Murimi pairing/snapshot UI and secure token storage exist. Subscription and referral UI explicitly says there is no verified entitlement service. Tengesa page is informational and does not connect. Its active-account ID is used as ledger `businessId`; source-account and personal scopes still need a formal distinction. Fynage does not have a production-ready shared schema or role/membership service. |
| Murimi | **PARTIALLY IMPLEMENTED** | Farm operations, multiple owner farm accounts, SQLite, queued sync and stable source IDs exist. Functions expose one-time pairing codes, revocable finance tokens and read-only snapshots. Firestore rules are owner-path-only; `currentRole` is client metadata, not authorization. Invitations explicitly say acceptance does not yet grant access. No common subscription/referral service or member permissions. |
| Tengesa | **PARTIALLY IMPLEMENTED** | Retail domain exists: products, sales, expenses, multiple independent businesses, local SQLite and an outbox. Sale sync uses a Firestore transaction for stock, sale, movements and ledger entries. It does not model multiple stores under one shared business, separate customer/purchase workflows are missing, and roles are absent. `firebase.json` configures Functions only; `firestore.tengesa.rules` says it is a merge fragment and must not be deployed alone. |

## Shared Firebase architecture and finance

There is no shared top-level schema in these checkouts. Existing data remains under app/user paths: Fynage `users/{uid}/financial_*`; Murimi `users/{uid}/farmAccounts/{accountId}/...`; Tengesa `users/{uid}/tengesa/{collection}` plus `users/{uid}/financial_ledger`. Subscriptions and credits are also nested under user paths. Top-level `users`, `businesses`, `moneyLedger`, `customerLedger`, `subscriptions`, `referrals`, `referralCredits`, `invitations`, and membership/entitlement collections are not a common implemented contract.

Tengesa writes idempotent sale-derived rows into its user's `financial_ledger` with `sourceApp: tengesa` and stable `sourceRecordId`; expense sync uses deterministic IDs too. Fynage sync uses that same nested collection path, but filters rows by its active `businessId`, and the Fynage UI's business connection list does not connect Tengesa. Thus the existence of those Tengesa ledger writes does **not** establish that Fynage displays them, or that personal/business summaries reconcile. Murimi stays in a separate project and exports snapshots over a bearer-token API; it does not copy farm events into Fynage's personal ledger. Transfer pairing/elimination, common customer ownership, reversals, and consolidated multi-currency totals are not implemented.

Recommended safe target is additive: preserve current source paths; add a centrally governed business/membership/entitlement identity and a shared ledger event keyed by `(sourceApp, sourceBusinessId, sourceRecordId)`. A trusted server adapter should publish source-owned finance events. Never backfill or merge until UIDs, duplicate mappings, balances, and account ownership have been inventoried. This is a design recommendation, not deployed code.

## Synchronisation and SMS

| Feature | Classification | Verification |
|---|---|---|
| Fynage local-first ledger and retry/revision sync | **IMPLEMENTED BUT NOT FULLY TESTED** | Unit tests exercise identity/dedupe and financial calculations; no device/offline restart or Firestore replay test. |
| Murimi SQLite farm queue and retries | **IMPLEMENTED BUT NOT FULLY TESTED** | Source has queued upserts/deletes and remote merge; no offline device or concurrent-edit test. |
| Tengesa local retail outbox and idempotent sale transaction | **IMPLEMENTED BUT NOT FULLY TESTED** | Retail calculation tests pass; no Firebase emulator or offline/reconnect test. Non-sale outbox operation IDs are random and queue replay/conflict behavior lacks dedicated tests. |
| Shared cross-app synchronization | **NOT IMPLEMENTED** | Firebase project split and no common adapter/schema. |
| SMS transaction recognition | **PARTIALLY IMPLEMENTED** | Fynage Android-only permission and optional scan/manual path; parser recognizes EcoCash, InnBucks and named banks, with a local review queue. Murimi/Tengesa have no equivalent SMS import implementation found. No device permission/provider-format tests. |

Fynage parser suite: **14/14 passed**. Murimi reporting suite: **19/20 passed**, with a failure in “broiler day-age stage guidance” (`actual grower`, expected `finisher`). Tengesa retail suite: **2/2 passed**. These are unit tests, not end-to-end tests.

## Security and roles

| Role | Current effective access |
|---|---|
| Owner | Fynage and Murimi rules scope access to a user's own UID path. Tengesa's intended business ownership checks exist only in its unconfigured fragment/backend code. |
| Administrator | No consistent, backend-enforced business administrator membership found. |
| Employee | No accepted invitation plus permission-grant path found; no explicit sensitive-field restrictions. |
| Investor | No isolated investment permission model found. |

Fynage's local `firestore.rules` protects current nested profile/finance paths, but it is untracked in the checkout and lacks connections/payment/referral rules. Murimi's deployed-source rules are owner-only and do not grant invitation roles. Tengesa's rules file is explicitly a fragment; `firebase.json` does not point to it. Do not deploy a combined replacement based on these incompatible schemas. No rules emulator tests were available/configured. Before production, establish one Auth/Firestore project or a deliberately federated server boundary, then write and test complete rules with deny-by-default behavior.

## Subscriptions, referrals, invitations and About

- **Subscriptions: PARTIALLY IMPLEMENTED.** Tengesa has Paynow initiation/callback verification and transactional credit redemption in Functions, but records are nested and Tengesa-specific. Fynage advertises no verified entitlement service; Murimi lacks a consistent subscription flow. Renewal/payment journeys have not been tested against Paynow or Functions Emulator.
- **Referrals: PARTIALLY IMPLEMENTED / NOT CENTRALIZED.** Legacy client referral code utilities and Tengesa backend attribution/reward code exist in different schemas. No common user identity, Fynage admin user search/code assignment flow, or cross-app credit wallet. No double-reward test was run.
- **Invitations and roles: NOT IMPLEMENTED end-to-end.** Murimi stores invitation requests but the UI confirms they do not grant access. No common accept/reject/revoke membership model or investor scoping.
- **About: PARTIALLY IMPLEMENTED.** About screens exist, but consistent operator, privacy, support, referral, subscription and current-version information was not verified for every app.

## Checks run

- Fynage `npx.cmd tsc --noEmit --pretty false`: passed.
- Murimi `npx.cmd tsc --noEmit --pretty false`: passed.
- Tengesa `npx.cmd tsc --noEmit --pretty false`: passed.
- Fynage lint: passed with 60 warnings.
- Tengesa lint: passed with 75 warnings.
- Murimi lint: **failed** (86 findings, including 4 errors and 82 warnings; resolve those errors before release).
- Fynage parser tests: 14/14 passed; Murimi report tests: 19/20 passed; Tengesa tests: 2/2 passed.
- No Android device, Firebase Emulator Suite, live payment, cross-app account, offline restart, or security-rule denial tests were available/executed.

## Deployment requirements and blockers

1. **Firestore rules:** no complete shared rules file is safe to copy/deploy now. Fynage's local rules cover only its present user documents; Murimi's rules cover only owner farm paths; Tengesa's `firestore.tengesa.rules` is expressly a merge fragment and is not referenced by its `firebase.json`. First decide the production Firebase/Auth topology and membership schema, write a complete deny-by-default ruleset, and test all query/read/write paths in the Emulator Suite. Do not replace production rules with any single app's file.
2. **Indexes:** no shared `firestore.indexes.json` is present. Generate indexes from approved queries after paths and query shapes are frozen; none can be certified for the target schema yet.
3. **Trusted functions:** retain and audit Murimi's pairing/snapshot functions and Tengesa's Paynow/callback/credit functions in their respective projects. A central entitlement, referral qualification/credit, invitation/membership, and financial-event adapter is still required. Secrets stay in server secret configuration. Function deployment was not run.
4. **Firebase configuration:** decide whether to consolidate Auth and Firestore or operate an explicitly federated backend. Inventory Auth providers, UIDs, source data counts and deployed rules first. Fynage/Tengesa target `armament-f5a0b`; Murimi targets `murimi-9a3e7`. Do not change client project IDs as a migration shortcut.
5. **Android permissions:** Fynage requests `android.permission.READ_SMS`; its parsing is optional and a manual path exists. Confirm Play policy eligibility before release. Murimi/Tengesa do not currently request SMS permission. No new permission is recommended.
6. **Environment variables:** no ecosystem-level shared config is defined. Preserve Firebase client config per app; configure Paynow secrets and any future service credentials only in trusted Functions secrets, never in mobile bundles. Confirm production endpoints/project IDs before release.
7. **Migrations/packages:** no cloud migration or package changes made in this audit. Keep existing nested records. Any shared-ledger backfill needs deterministic source IDs, dry-run duplicate/reconciliation reports, export/backup, and reversible additive rollout.

## Remaining risks

- Two Firebase projects prevent the requested single identity/security boundary; identical phone numbers do not establish the same UID.
- Current member roles, invitation revocation, employee field restrictions, and investor scopes are not enforced end-to-end.
- Fynage/Tengesa financial scopes are not reconciled; cross-app transfer pairing and consolidated reports can misstate personal or business totals.
- Tengesa lacks deployed Firestore rules in its deployment config; its client writes must not be considered production-secure until rules are attached and emulator-tested.
- Murimi has a failing calculation test and lint errors.
- Payment, credits and referral paths need common idempotency and adversarial/replay tests across the separate projects.
- Offline persistence and retry code exists, but restart, multi-device conflict, deletion and financial duplicate scenarios remain unverified.

## Change record

This audit added only this report in Fynage. No source files, Firestore documents, rules deployments, cloud functions, or user data were changed. The three projects already contain local modifications; those were preserved.
