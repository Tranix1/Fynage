# Armament Ventures integration audit and migration plan

Audit date: 2026-10-30

> **Superseded status note (2026-10-31):** Use [ecosystem-audit-final-refresh-2026-10-31.md](./ecosystem-audit-final-refresh-2026-10-31.md) for the current audit. This earlier report captured a stale Tengesa checkout and incorrectly described it as lacking retail/POS code. Current inspection confirms Tengesa has a retail model, POS, sales, inventory, expenses, SQLite outbox and sale-derived ledger rows; the missing pieces are cross-app authorization, shared-store structure, deployed rules, and integration verification. The Firebase project table below describes the JavaScript SDK config only; current native `google-services.json` targets are Fynage/Tengesa `armament-f5a0b` and Murimi `murimi-9a3e7`.

## Decision before implementation

No shared financial collection migration or cross-application writes are safe in the current checkout. Murimi has operational finance and offline storage, but its partner API is read-only and the API's required Firebase project does not match Murimi's current client project. Tengesa is presently a branded starter shell with logistics-oriented account types, not a retail/POS implementation. Fynage is the only application in this workspace that can be changed, and writing to either source application's operational records from Fynage would bypass its business logic and permissions.

The migration plan below is additive and preserves current data. Implementation can begin after the project/auth and API blockers are resolved. No existing documents or collections were changed during this audit.

## Project inventory and actual state

| Project | Firebase client project | Application ID | Financial/operational data | Offline / permissions | Integration status |
|---|---|---|---|---|---|
| Fynage | `transix-470b3` | `com.armament.fynage` | Local SQLite plus per-user `financial_ledger`, `financial_accounts`, and `financial_categories`; local financial scope uses an active account value as `businessId` | Local-first queue and Firestore UID rules are present in the working tree; roles are not business-member access controls | Current checkout has personal finance only; no application/business connections or consolidation source |
| Murimi | Client config: `transix-470b3`; `.firebaserc` and integration functions require `murimi-9a3e7` | `com.yayapana.Murimi` | `/users/{uid}/farmAccounts/{accountId}/{collection}/{recordId}`; purchase, expense, sale, payment, stock, asset, transaction and batch records; records include owner/account IDs and stable IDs | SQLite local records plus queued sync and Firestore listeners; current rules grant access by UID owner path only | Finance snapshot functions and pairing UI exist in source, but functions explicitly reject any project except `murimi-9a3e7`; write access is intentionally absent |
| Tengesa | `transix-470b3` | `com.armament.tengesa` | Starter app routes and generic Firestore operations; no product, inventory, POS sale, purchase or retail-finance domain found | No repository Firestore rules, Firebase deployment config, or server functions found | Not ready to supply retail business data; app identity and account types still include tracking/fleet/driver/brokerage concepts |
| TransixMobileApp | `transix-470b3` | `com.yayapana.TransixNewVersion` | Logistics/transport domain; Paynow client and referral code paths exist | Payment activation/reward paths are client-led; prior audit found no trusted Paynow callback/status verifier in its functions | Deferred as requested; no integration changes proposed in this phase |

The Firebase project ID is not itself proof that two applications share the same authenticated user records or Firestore rules. Verify Firebase Auth providers, live rules, deployed function project, and sample UID/document ownership before treating user IDs as globally interchangeable.

## Murimi findings

- Operational records are scoped by Firebase UID and farm account ID, with stable document IDs. Purchases can create related stock and stock movement records, create a fixed asset when classified as fixed asset, and create cash transaction records for amounts paid. The repository uses a local SQLite database and a change queue for offline writes.
- Custom purchase categories use a stable normalized ID (`custom_<normalized-name>`); purchase records preserve category/item names and IDs. Classification distinguishes consumable, fixed asset, and operating expense. This is a useful pattern, but ID generation based on the display name prevents straightforward rename-in-place and needs a new immutable ID for future shared domains.
- Farm accounts are currently owner-owned personal accounts under `users/{uid}`. The active role is stored in account metadata and local state. The code explicitly tells invited users that access is not granted until member roles are implemented. Firestore rules authorize the UID in the path, not investor/worker permissions. Do not infer that the existing role value is a server-enforced access-control model.
- `createMurimiFinancePairingCode`, `exchangeMurimiFinancePairingCode`, `getMurimiFinancialData`, list, and revoke functions are implemented in `functions/src/index.ts`. Pairing uses a one-time code, hashed bearer-token storage, 90-day expiry and revocation. The data endpoint provides a minimized read-only snapshot. It computes `cashNetMovement` from transaction inflows/outflows and labels profit as simplified; it is not a ledger balance or audited profit.
- The integration functions set `REQUIRED_PROJECT_ID = "murimi-9a3e7"`; `isMurimiProject()` rejects requests outside that project. Murimi's current native client config points to `transix-470b3`. Its `.firebaserc` defaults to `murimi-9a3e7`, and the integration documentation says to deploy there. As checked out, the client callable and the required backend project are inconsistent. Pairing cannot be called reliably until the actual deployed client/backend arrangement is reconciled.
- The Firestore rules use owner-path checks for farm records; they do not provide membership roles or per-section financial permissions. Invitations are not membership grants. The API shares owner-selected snapshots only, which is safer than attempting to read Murimi documents directly from Fynage.

## Tengesa findings

- The app has a Tengesa display name/package and shared Firebase client config, but its routes are a small home/auth/account/about/explore shell. Home is generic; signup still asks for tracking, fleet, driver, or broker account type. No retail inventory, products, POS sale, supplier purchase, stock movement, store identity, or financial reporting implementation was found in its app routes/services.
- No Tengesa Firestore rules, `firebase.json`, `.firebaserc`, or server functions were found at the inspected project root. Existing shared Firebase config is not a substitute for application-specific ownership rules.
- Therefore there is no Tengesa business record or financial API to display or write from Fynage. Integration should wait until Tengesa's operational model and server-enforced authorization exist.

## Fynage findings

- Fynage currently provides a personal finance ledger, accounts, categories, transfers/adjustments, historical dates, sync queue, monthly calculations and plans from the current checkout. Its Firestore documents remain under the existing per-user paths; the in-progress rules are additive source, not deployed rules.
- Fynage's current active financial scope is represented by account selector IDs and is passed as `businessId`. A farm or store identity must not be inserted into that field. Personal-account identity, connected application, source business, business cash account, and source record identity need separate fields.
- Existing records must remain personal Fynage records unless an explicit, audited migration establishes otherwise. Do not rewrite a local account ID into a Murimi/Tengesa business ID.
- Fynage currently has no verified partner connection store, business selector, application entitlement model, consolidation engine, or cross-app net-worth source.

## Proposed additive architecture (not yet applied)

Keep source operational collections in their owning application. Introduce versioned, explicitly authorized shared domains only after all projects agree on the same identity/security boundary:

```text
armamentUsers/{uid}
applicationConnections/{connectionId}
businesses/{businessId}
businessMemberships/{businessId_uid}
businessFinancialSnapshots/{businessId_sourceRevision}
sharedFinancialEvents/{eventId}
subscriptions/{uid_applicationId}
```

Records should carry stable IDs, owner, business ID when applicable, source application, source collection/record ID, currency, actual financial date, creation/update timestamps, and a server-controlled access scope. Shared reporting should prefer an idempotent source key `(sourceApp, sourceBusinessId, sourceRecordId)` and read-only source snapshots. Do not copy imported source transactions into Fynage's personal ledger. Store source snapshot time and completeness/valuation limitations.

The first Murimi integration should be a read-only, owner-consented snapshot connection. It must not claim current cash balance from cumulative `cashNetMovement`; it must not add farm cash twice when farm valuation already includes it; and it must not label the supplied simplified calculation as audited profit. The current API does not expose an authorized role/member model, so only the farm owner can safely pair under the inspected implementation.

Fynage quick-entry writes to Murimi require a Murimi-owned callable/API that invokes the same validated domain operations as Murimi, validates the user's business membership and permissions server-side, and uses an idempotency key. The current read-only token must never be upgraded or reused for writes. The same design applies to Tengesa after its POS domain exists.

## Migration plan and safety gates

1. **Resolve identity/project topology:** confirm the intended production Firebase project for Murimi, Fynage, and Tengesa; verify where Auth users and data currently live; reconcile Murimi's native client project with its `.firebaserc`/function project. Record existing UID continuity before changing configuration.
2. **Keep legacy data in place:** do not move `/users/{uid}/farmAccounts/...` or Fynage's `users/{uid}/financial_*` collections. Add connection metadata and server-built snapshots separately. Backfill only with deterministic source IDs and a dry-run duplicate report.
3. **Define business identities:** create immutable business IDs independent of display names and farm account numeric IDs. Map each existing Murimi farm account to one business ID in an additive mapping document. Keep owner UID and account ID as source references.
4. **Implement server authorization first:** add memberships and explicit financial permissions; make rules/functions enforce them. Do not use Murimi's client `currentRole` metadata for security. Preserve owner-only access until tested member permissions exist.
5. **Stabilize Murimi read API:** deploy and test pairing/get/revoke in the same project the Murimi client actually uses, or provide an explicitly configured partner endpoint with correct project selection. Add schema version, source revisions/updated time, pagination/size strategy and metric provenance before broad use.
6. **Build Fynage read-only connection:** secure token storage, consent/revocation state, farm list, source snapshot cache, last-sync timestamp and stale/error/pending states. Keep snapshot data outside the personal ledger. Reconciliation compares source IDs and revisions; never merge uncertain records.
7. **Build consolidated reporting:** separately calculate personal, selected business, and consolidated views. Eliminate internal transfers/loans; include only valued assets/liabilities; avoid adding cash separately if already included in a business valuation. Present unknown values as unvalued.
8. **Add cross-app write APIs only after source owners approve:** Murimi and Tengesa functions call their own domain/repository logic; transaction IDs are idempotent; audit records retain actor/app and source IDs. Add an explicit rollback/compensation path for partial operational writes.
9. **Tengesa readiness:** define POS domain, business IDs, inventory and purchase accounting, offline queue, rules, subscription/entitlement, and a versioned finance export before connecting it.
10. **Subscription architecture:** preserve existing provider paths. Establish a trusted central entitlement and payment-history record only when a server verifier and app-specific product rules are configured. Do not attempt to share subscription state by copying client flags.
11. **Migration validation:** export counts and checksums for source collections; run read-only dry-runs, owner/member security tests, duplicate-key tests, offline/replay tests, and net-worth elimination tests. Monitor reconciliation before any optional backfill. No destructive migration is planned.

## Acceptance tests that cannot pass in the current checkout

| Acceptance area | Current evidence | Blocker to test |
|---|---|---|
| Murimi read in Fynage | Source API and Fynage connection screen exist | Murimi callable requires a different Firebase project than client config; no deployed environment confirmation or device/API credentials |
| Fynage quick-record through Murimi logic | Murimi repository has validated purchase/expense functions | No server-side write API; Fynage must not write directly to Murimi collections |
| Multiple farms / member roles | Murimi supports multiple owner farm accounts | Invitation code states roles are not implemented; rules are owner-only |
| Tengesa business and POS | No retail/POS model found | Tengesa project is a starter shell with logistics account types |
| Shared subscription from both apps | No Murimi subscription flow or trusted entitlement API found | No server-side Murimi Paynow/subscription implementation in inspected Murimi source; no dual-app entitlement contract |
| Consolidated net worth | Fynage calculations are personal-ledger scoped | No connected business sources, valuations completeness model, or intercompany elimination records |
| Cross-app offline sync | Murimi has its own SQLite queue | No shared write protocol; Fynage cannot safely inject Murimi operations |

These acceptance areas are blocked and have not passed end-to-end testing. Fynage now contains a read-only pairing client and business UI, but no source connection has been verified against a deployed backend.

## Required decisions/configuration before the next implementation phase

- Confirm the intended Firebase project for each app and which existing Auth UID set is authoritative.
- Resolve Murimi client-vs-functions project mismatch without migrating or deleting existing data.
- Confirm whether the active Tengesa directory is the intended retail project; if so, provide the actual POS project/repository or authorize its creation as a separate task.
- Approve the shared business-membership model and who may grant investor/worker financial permissions.
- Configure and deploy source-owned callable/API endpoints only after security tests; Fynage cannot safely manufacture access to source collections.
- Choose how business valuation, inventory valuation, internal loans, and source snapshot freshness should be represented before showing consolidated net worth.

## Files inspected

Read-only inspection covered Fynage app routes, financial types/repositories/sync/calculation code, Firebase config and current audit; Murimi Firebase config, functions, Firestore rules, authentication/account context, farm repository/types, offline sync, integration screen and integration documentation; Tengesa package/app config, routes, services and Firebase operations; and Transix package identity/payment/referral reference files from the prior audit. No external project files were changed.

## Fynage verification run for this audit

- `npx tsc --noEmit --pretty false`: passed.
- `npm run lint`: passed with 0 errors and 60 existing warnings.
- `node --disable-warning=ExperimentalWarning --experimental-strip-types --test src/services/integrations/businessSummary.test.mjs src/services/sms/transactionParser.test.mjs`: 15 passed, 0 failed. These verify Fynage's financial/SMS unit scenarios and source-summary calculations; they do not test a cross-app network flow.
- `git diff --check`: passed (Git emitted line-ending normalization warnings for pre-existing modified files).
- No Android device, Firebase emulator, or deployed Murimi/Tengesa integration endpoint was used. The cross-app acceptance tests remain unrun and are not represented as passing.

## Fynage implementation update

The following additive Fynage-side work is now present:

- Replaced the authenticated root's `Home | About` navigation with `Home | Business | Insights | More`; unauthenticated users still see Home/Login and About.
- Added app cards using the inspected package IDs: Murimi `com.yayapana.Murimi`, Tengesa `com.armament.tengesa`, Transix `com.yayapana.TransixNewVersion`. Android package visibility is limited to those package names. SDK 57 `expo-intent-launcher` supplies installed-app icons/open actions where available. Other platforms show installation as unavailable instead of guessing.
- Added dedicated Murimi, Tengesa, and deferred Transix information pages. Tengesa and Transix show no invented financial data.
- Added an additive SQLite v5 `business_connections` table. Murimi one-time pairing exchanges the owner-approved code with the documented endpoint; the bearer token is stored with `expo-secure-store`; the snapshot is cached locally; refresh handles revoked/expired connections; disconnect removes local credentials and cache. No bearer token is written to Firestore or ordinary preferences.
- Added a farm detail page using only fields from Murimi schema v1. It labels cash movement as movement (not balance), simplified operating result as unaudited, and assets without current valuation as excluded. Expenses and operational records are not copied into Fynage's personal ledger.
- Added personal-only Insights and More entry points. Home calls its current figure `NET WORTH · PERSONAL` and explicitly keeps connected business values separate until internal transfers can be reconciled.
- Added a unit test for Murimi summary calculations and unvalued/disposed assets.

This does **not** establish shared cloud persistence or true consolidated net worth. Snapshots are local to the paired Fynage device, source accounts are not refreshed on another device without pairing, and no safe intercompany transfer/ownership model exists. The Murimi pairing issuer remains blocked by the checked-out project mismatch: the Murimi app client config selects `transix-470b3`, while the owner functions require `murimi-9a3e7` and verify that project's Firebase Auth tokens. Do not change the client Firebase project as a quick fix; existing auth UIDs and farm data must be inventoried first. Fynage quick-entry, Murimi permissions, central subscription, and Tengesa POS integration remain unimplemented until their source-owned backend/domain and identity/security contracts exist.

Implementation verification: `npx tsc --noEmit --pretty false` passed; full `npm run lint` passed with 0 errors and 60 existing warnings; Expo Doctor passed 21/21 checks; Android Expo export bundled 2,146 modules successfully; 15 unit tests passed (the prior 14 finance/SMS cases plus the Murimi summary case). Android package detection, secure token storage, app launch, SQLite migration, connection exchange against a deployed service, and all cross-app acceptance workflows still need real Android/backend testing.
