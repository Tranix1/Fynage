# Fynage core audit and completion checklist

Audit updated 2026-10-30 after a full checkout search. This describes code present in this Fynage repository; it does not infer features from the user's description or from Transix.

## Armament integration audit

The historical cross-application inspection is in [armament-integration-audit.md](./armament-integration-audit.md); its Tengesa starter-shell conclusion was superseded by later code. The current result is [ecosystem-audit-final-refresh-2026-10-31.md](./ecosystem-audit-final-refresh-2026-10-31.md). Fynage has a local, owner-consented Murimi snapshot flow. Cross-app financial reads and writes remain blocked by project/identity mismatches and missing shared authorization, despite Tengesa's existing retail/POS domain. No shared financial collections were migrated.

## Executive classification

| Requirement | Current status | Evidence / remaining check |
|---|---|---|
| Phone OTP login and signup | Implemented, not device-tested | `src/app/Account/Login.tsx`, `SignUp.tsx`, `AuthContext.tsx`. Needs real Firebase phone-auth configuration and device test. |
| Financial transaction recording | Implemented; calculation paths unit-tested | SQLite-first ledger, manual historical date, edit/soft-delete, transfer, opening balance and account adjustment flows in `src/app/Home/Index.tsx` and `src/repositories/financialRecords.ts`. UI/device scenarios and Firestore sync remain untested. |
| Planning | Missing in this checkout | No plan routes, planning service/repository, plan types, or plan collections found, including ignored project files. The earlier user statement is not reflected in this checked-out tree. |
| Paynow/subscription lifecycle | Missing in Fynage | No Paynow package, initiation route/service, payment collection, subscription domain, callback function or expiry gate found. Existing login is not followed by payment. |
| Referral | Partially implemented, unreliable end-to-end | Signup validates a code using `src/db/operations.ts`; `SignUp.tsx` passes `referralValidation`, but `AuthContext.signUp` ignores referral fields, so attribution is not saved. No Fynage reward lifecycle. |
| SMS | Partially implemented; parser unit-tested | Android inbox scan and foreground polling exist. EcoCash/Econet plus InnBucks and named-bank heuristics now parse; unmatched supported financial messages enter a device-local review queue. Real SMS format, permission, and native module flows need device testing. |
| Categories | Basic custom category names only | Local/synced category records exist, but no reusable item catalog or accounting classifications/explanations. |
| Offline ledger | Implemented by design, not integration-tested | SQLite persistence and idempotent queued sync are present. No attached Android device or Firestore emulator was available for offline/reconnect/conflict workflow verification. |
| Firebase ownership rules | Rules added locally, not deployed/tested | `firestore.rules` restricts Fynage profile/financial subcollections to the authenticated UID. No Firebase deployment config/rules emulator test is in this checkout. Project is shared with Transix; merge only after cross-app review. |
| CSV export | Implemented; serializer unit-tested | History exports filtered transactions, monthly totals, and current account balances through a CSV share sheet. Needs native share-sheet testing. |
| Reconciliation | Implemented; adjustment logic unit-tested | User enters actual balance and reason; confirmed difference is recorded as an adjustment, not income/expense. UI interaction and Firestore sync need device/emulator test. |

## Why earlier audit said planning and Paynow were absent

A second search covered tracked and ignored files outside `node_modules`, `.git`, and assets, and searched all of `src`, `modules`, `scripts`, `docs`, routes, services, repositories, context, and database utilities. Fynage has seven screen files: root/index, About, Home, Login, Sign Up, and account selection. No plan screen, plan model, plan repository, Paynow code, payment screen, subscription record, payment callback, or server functions exist in this checkout. `package.json` has no Paynow dependency. There is no `functions/`, `firebase.json`, or `.firebaserc` in Fynage.

The implementation claim likely refers to another checkout or an earlier version. No code was found here to test or reuse for those features, so they remain missing. Transaction recording is present and was not rebuilt.

Fynage does have `validateReferralCode`, a signup referral input, and Firebase phone auth. Those do not constitute a plan or payment system. Signup currently validates a referral, passes it into `AuthContext.signUp`, and that method only destructures name, phone number, and account type; attribution is dropped before profile persistence.

## Transix reference comparison (read-only inspection)

| Feature | Transix | Fynage | Required action |
|---|---|---|---|
| Paynow initiation | `app/Payments/paymentHandlers.ts` starts EcoCash/card payment with the client Paynow SDK. | None found. | Do not transplant client secrets/Paynow calls. Fynage needs a trusted server initiation endpoint. |
| Payment verification | Client polls Paynow `pollUrl`; no Paynow verification function exists in `functions/src/index.ts`. | None found. | Server-side status verification and authenticated client status lookup are required. |
| Payment callbacks | Client sets result/return URLs; deployed source inspected has vehicle-cleanup functions only, no payment callback handler. | None found. | Implement signed/verified callback processing server-side before activation. |
| Subscription activation | `SubscriptionPaymentModal.tsx` writes subscription and entitlement records from client `finalizeSuccess` after client poll success. A development-only simulate-success action also exists. | None found. | Fynage must only activate from backend-confirmed payment records. |
| Subscription expiry | Client creates 30-day expiry timestamps for subscription variants; no Fynage entitlement gate exists. | None found. | Add server-authored expiry and enforce access from trusted subscription state. |
| Payment history | Client writes subscription documents. | None found. | Add idempotent payment/subscription history only with server-controlled status. |
| Referral codes | Client utility generates `R`/`C` random codes and checks uniqueness by reads; campaign IDs are Firestore-generated. | Code validation exists; no Fynage code issuance domain. | Reuse the ID and campaign conventions only; use collision-resistant server generation. |
| Referral validation | Client queries individual/campaign referral collections and signup/selector UI attributes a referrer. | Validation UI exists; signup does not persist its validation result. | Persist attribution through a trusted, one-time server operation; reject self-referral. |
| Reward processing | Client `creditReferralIfEligible` checks existing rows, then separately increments wallet and adds a transaction; this is race-prone/non-atomic and is called from payment UI. | No reward process. | Implement one server transaction keyed by payment/referral ID for idempotency. |
| Duplicate prevention | Payment references are random client values; referral reward check and writes are not one atomic operation. | None found. | Backend idempotency keys and unique payment/referral records required. |

Transix's reusable material is limited to UX patterns, supported provider naming, campaign/user reference conventions, and its Firebase data vocabulary. Its payment implementation is not safe to reuse as a trusted subscription flow because payment secrets and polling are client-side, subscription activation is client-written, and the backend contains no Paynow callback/status verifier. No Transix code was modified and no secrets are reproduced here.

## Work completed in this pass

- Added InnBucks parsing mapped to the InnBucks account and supported named-bank parsing mapped to the Bank account. Supported bank-name heuristics: CBZ, CABS, FBC, Stanbic, Steward, NMB, POSB, Ecobank, BancABC, ZB Bank, and First Capital.
- Added additive SQLite schema v4 `sms_review_queue`. Supported-provider messages that look financial but lack a reliable amount/type are kept locally, deduplicated by message fingerprint, and exposed in Review. Users can record manually (retaining source SMS evidence) or dismiss them. Unrelated messages are not kept in this queue.
- SMS scan status now reports scanned count, period, imported/duplicate/unparsed counts and the 10,000-message scan cap. Existing cursors are scoped to owner and account. Android foreground polling also refreshes unmatched-review items.
- Added date filters to History and CSV export for filtered transactions, monthly totals, and current account balances. CSV serialization handles quotes and newlines. Expo SDK 57-compatible `expo-file-system` and `expo-sharing` were installed; native rebuild is needed to use the share sheet in a development binary.
- Extracted reconciliation adjustment creation into a tested financial helper. The UI compares recorded vs actual, requires a reason, confirms the variance, and creates a non-P&L adjustment.
- Added reasoned opening-balance history and corrected sync-state counts to include ledger, account, and category queues.
- Added `firestore.rules` with UID and record-owner checks for Fynage profile, ledger, categories and financial accounts. This is a local rules file only; no Firebase deploy config was added because Transix shares the configured Firebase project.
- Fixed the signup screen logo asset reference found by Android bundling; the previous SVG/asset references were not resolvable by Metro. Signup now uses the existing app icon PNG.
- Fixed the same broken logo reference in Login and corrected stale country-data image paths to the actual `src/assets/images/Trucks` files. The Android export now bundles all 2,132 modules successfully.
- Changed no database document paths for existing records. SQLite migration v4 only adds a local review table; no stored financial data is deleted or rewritten.

## Verification performed

- `node --disable-warning=ExperimentalWarning --experimental-strip-types --test src/services/sms/transactionParser.test.mjs`: 14 passed. Coverage includes EcoCash, InnBucks and named-bank parsing, unmatched-provider classification, duplicate identity, transfers, monthly math, CSV escaping/content, reconciliation adjustment math and assets/loan calculations.
- `npx.cmd tsc --noEmit --pretty false`: passed after the current changes.
- `npm run lint`: passed after these edits with 0 errors and 60 warnings.
- `npx.cmd expo export --platform android`: passed; Metro bundled 2,132 modules and exported the Android JS bundle.
- `git diff --check`: passed before this pass's latest edits; rerun after final edits.
- Environment check: `adb devices -l` returned no attached devices. No Fynage Firebase emulator config/rules tests are available. Therefore SMS permission/import UI, native CSV share, reconciliation screen interaction, offline reconnect sync, and Firebase cross-owner denials are **not** claimed as tested end-to-end.

## Remaining before Fynage is ready for integration

### Core app and data

- Test on Android devices with representative InnBucks/bank SMS, denied permissions, duplicates, capped historical imports, and device-specific sender/message formats. Provider matching is heuristic and does not yet support arbitrary user-configured bank senders.
- Add a durable cross-device review workflow if unparsed queue items must survive reinstall/device changes; currently they are local-only by design to minimize SMS retention.
- Validate CSV file/share behavior on Android and iOS development builds.
- Run historical transaction, reconcile correction, and offline/reconnect/conflict scenarios against a real SQLite/native runtime and Firestore emulator.
- Display account/category sync failures consistently and test stale-write conflict behavior. Current local-first queue is implemented but not integration-certified.
- Complete category classifications (assets/liabilities/capital), simple descriptions, reusable named items, and stable item references.
- Add the missing planning domain and plan-to-income/spending linkage; do not treat expected income as received.
- Decide and implement the intended Fynage subscription/account gating design. Payment amount/payment channel/backend secrets and deployment target must be configured before Paynow can be tested.
- Persist referral attribution and process rewards server-side and idempotently if referrals are in scope. Current signup validation alone does not do this.
- Update the Home/Business/Insights/More navigation and exports/settings experience after core ledger reliability is verified.

### Firebase and Android configuration

- Have the Firebase project owner merge `firestore.rules` into the existing shared project rules after checking Transix's and other applications' paths. Then run Emulator Suite security tests for signed-out, owner, and cross-owner reads/writes. Do not replace the project's rules wholesale.
- Configure a rules emulator/deployment target only after the shared project ownership and app rule requirements are known. No rules were deployed from this task.
- Rebuild the Android/iOS development application after adding `expo-sharing` and `expo-file-system`; Expo Go does not validate the native share/file flow.
- Test READ_SMS declaration and store-policy eligibility for the intended distribution channel. Android background importing remains foreground/manual; no continuous background SMS receiver is claimed.

## Historical architecture notes

- Firebase project currently selected in `src/db/fireBaseConfig.ts`: `transix-470b3` (shared with Transix according to the existing configuration). Financial subcollections are below `users/{uid}`.
- Financial records: `users/{uid}/financial_ledger/{recordId}`.
- Categories: `users/{uid}/financial_categories/{categoryId}`.
- Accounts: `users/{uid}/financial_accounts/{accountId}`.
- Local DB: `fynage.db`, additive migrations through schema v4.
- SMS unresolved review queue: local SQLite only, owner/business scoped.
- No Fynage plan/payment server paths are present.
