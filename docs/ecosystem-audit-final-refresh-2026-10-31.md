# Fynage, Murimi and Tengesa: audit refresh

Date: 2026-10-31. This is a source and local-test audit, not a production Firebase audit. No cloud data, Firebase rules, or deployments were changed. Only Fynage is writable in this workspace; Murimi and Tengesa were inspected and tested without editing their source.

## A. Overall status

**BLOCKED — not ready to deploy as one ecosystem.** The checked-out apps do not share one Firebase project across SDKs, there is no common membership/entitlement or ledger service, and there are no shared security rules or emulator tests. Fynage and Tengesa native configs target `armament-f5a0b`; Murimi native config targets `murimi-9a3e7`; the JavaScript Firebase config in all three projects targets `transix-470b3`. Firebase Auth uses React Native Firebase in the inspected apps while several database/storage paths use the JavaScript SDK, so an app can authenticate to one project and read/write another. No project IDs or production records were changed.

## B. Fynage

- **WORKING AND TESTED:** local personal ledger calculations, source-scoped duplicate identity helper, SMS parsers, Murimi-summary arithmetic, and CSV/reconciliation helpers. Focused tests: **18 passed, 0 failed**.
- **IMPLEMENTED BUT NOT FULLY TESTED:** SQLite-first local records, account/category/ledger outboxes, retry/revision sync, optional Android SMS import with manual entry, read-only Murimi snapshot pairing, and CSV export. Remote deletion now retains a full tombstone and audit data locally; source-based imports use stable IDs and idempotent deduplication. These sync, native permission and sharing paths were not verified on device or emulator.
- **PARTIALLY IMPLEMENTED:** Fynage can show owner-consented Murimi financial snapshots. It cannot yet connect Tengesa businesses/stores or read common top-level accounts. Subscription/referral text in More correctly states there is no verified shared entitlement service.
- **NOT IMPLEMENTED:** shared top-level ledger publication, Fynage subscription checkout, central referral-code assignment/rewards, shared business memberships, and invitation acceptance.
- **Static/build checks:** TypeScript passed; lint passed with 0 errors and 60 warnings; Expo Doctor passed **21/21** checks; Android JS export bundled successfully (**2,147 modules**).

## C. Murimi

- **IMPLEMENTED BUT NOT FULLY TESTED:** farm operations, multiple owner farm accounts, SQLite persistence/outbox, owner-only Firestore paths, and a source-owned read-only finance snapshot/pairing API. Pairing/invitation requests do not establish shared member access.
- **PARTIALLY IMPLEMENTED:** invitations are pending requests; there is no end-to-end accept/reject/revoke membership enforcement. No common subscription/referral flow or investor permission model was found.
- **Test result:** **26 passed, 1 failed**. `broiler day-age stage guidance` returns `grower` on day 21 where the test expects `finisher`.
- **Static checks:** TypeScript passed. Lint failed with **4 errors** in `ArchiveBatch.tsx` (unescaped apostrophe), `HistoricalBatch.tsx` (state update in effect), `Mortality.tsx` (manual memoization), and `Reports/Index.tsx` (manual memoization).

## D. Tengesa

- **IMPLEMENTED BUT NOT FULLY TESTED:** retail products, point of sale, sale/stock transaction handling, local SQLite outbox and sale-derived ledger events. Its two retail calculation tests pass (**2/2**).
- **PARTIALLY IMPLEMENTED:** Paynow initiation, signed callback/poll verification, subscription extension, and credit redemption exist in Tengesa Functions. They are Tengesa-specific and nested under user paths. The payment UI/backend currently hard-codes US$1/month. There is no common cross-app subscription/entitlement or referral-credit wallet. A multiple-store-per-business membership/permission model was not found.
- **BLOCKED for production rules:** `firebase.json` deploys Functions only; `firestore.tengesa.rules` is labeled a merge fragment and is not deployed by the config.
- **Static checks:** TypeScript passed; lint passed with 0 errors and 75 warnings.

## E. Shared Firebase architecture

The selected additive target schema is documented in [ecosystem-audit-config-verification.md](./ecosystem-audit-config-verification.md): root `users`, `businesses`, `accounts`, `memberships`, `invitations`, `moneyLedger`, `customerLedger`, `subscriptions`, `entitlements`, `subscriptionPayments`, `referrals`, and `referralCredits`. It defines stable IDs, owner/account/source metadata, and transfer, reversal, deletion and idempotency references.

**That schema is a plan, not a deployed implementation.** Existing records remain at their current app-owned paths. No migration or backfill is safe until the Firebase/Auth project topology, UID mapping and deployed rules are inventoried. Murimi and Tengesa source records are not presently unified with Fynage personal finances.

## F. Synchronisation and duplicate prevention

- Fynage has a SQLite outbox and Firestore revision checks. Import/sync identity now includes owner, source app, business/account, collection and source document ID. Amount or description is never an identity; amount/date/sender similarity only flags an SMS for review. Fynage helper tests cover stable IDs, separate business/account identities and retained deletion history.
- Murimi has a local farm queue and merge/retry code; Tengesa has a retail outbox and transactional sale write. These are **IMPLEMENTED BUT NOT FULLY TESTED**.
- No offline restart, two-device conflict, Firebase replay, cross-app transfer reconciliation, or deletion replay was exercised against a device or emulator. Shared cross-app synchronization remains **NOT IMPLEMENTED**.

## G. Security and permissions

- Current rules are app-specific and mostly owner-path scoped. No backend-enforced common owner/admin/employee/investor membership matrix exists. Murimi `currentRole` is client metadata, not a permission grant. Tengesa has no rules file attached to its Firebase deploy config. Fynage’s local rules file has no top-level shared-ledger membership model and no deploy target in this checkout.
- Owners have effective access only within their current UID-scoped paths. Administrator, employee and investor access is **NOT IMPLEMENTED** as a consistent permission system. Invited users do not yet gain protected account access through accepted membership.
- No Firebase Emulator Suite or rules-denial tests are configured. It is unsafe to supply a replacement “production” rules file while the SDK projects, legacy collection paths and membership schema are unresolved.

## H. Subscriptions and referrals

- Tengesa has a server-verified Paynow flow and atomic local credit redemption, but it is nested and Tengesa-specific. Fynage has no verified checkout/entitlement flow; Murimi has no consistent subscription service. Cross-app plans, payment history, credit redemption, and invited-user access are **NOT IMPLEMENTED**.
- Referral utilities/attribution exist in legacy schemas and Tengesa backend code. There is no common referral identity, Fynage admin search/code assignment, or shared subscription-credit system. A completed end-to-end referral journey is **NOT IMPLEMENTED**.

## I. Deployment requirements

- **Firestore rules:** deploy none from this audit. Fynage’s local `firestore.rules` is not a complete shared ruleset; Murimi rules are owner-only; Tengesa’s file is a fragment. Do not replace production rules with one app’s rules. First reconcile project IDs, map UIDs/businesses, finalize memberships and exercise all queries in the Emulator Suite.
- **Indexes:** no shared `firestore.indexes.json` exists. Generate indexes only after collection paths and queries are finalized.
- **Functions:** retain existing source-owned Murimi pairing and Tengesa Paynow functions in their current projects. A trusted common ledger publisher, membership/invitation service, entitlement service, referral/credit service and payment-to-entitlement verifier are still required. No central function or deployment was added.
- **Firebase configuration:** no client ID changes recommended until production project, UID continuity and existing data are inventoried. Fynage has no `firebase.json`; Murimi deploys its own rules/functions; Tengesa deploys Functions only.
- **Migrations/packages/environment:** no cloud migration or package change is required for the Fynage changes in this refresh. No production backfill, secrets, indexes or new shared functions were added.
- **Android SMS permission:** Fynage declares `READ_SMS`; permission is optional and manual entry remains available. Google Play lists SMS-based money management as a possible permitted use, subject to Play review and a permissions declaration. The declaration/approval and device disclosure still need completion before Play release ([current Play policy](https://support.google.com/googleplay/android-developer/answer/10208820)).

## J. Remaining blockers

1. Confirm the authoritative Firebase project/auth topology and reconcile native versus JavaScript SDK targets without losing existing users/data.
2. Grant a writable workspace for Murimi/Tengesa if fixes there are expected; this workspace only permits Fynage edits. Fix Murimi's four lint errors and failing day-21 test.
3. Build and emulator-test a complete shared ruleset, indexes and trusted backend for memberships, invitations, ledgers, subscriptions, entitlements and referral credits.
4. Add Fynage-to-Tengesa account/store authorization and read-only financial summaries; keep customer/stock/operational data isolated.
5. Complete role/permission enforcement, subscription journeys, referrals, multi-store support, and business/personal transfer reconciliation.
6. Test denied SMS, duplicate SMS/manual matches, offline restart/reconnect, concurrent edits, cross-device replay, payment callbacks and rule denials on devices/emulators.

**Final classification:** Fynage is **PARTIALLY IMPLEMENTED**; Murimi is **PARTIALLY IMPLEMENTED**; Tengesa is **PARTIALLY IMPLEMENTED**; the shared ecosystem is **BLOCKED** for production. No cross-app feature is claimed as fully end-to-end tested.
