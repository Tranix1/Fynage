# Fynage Firebase setup

The Fynage client configuration in `src/db/fireBaseConfig.ts` names Firebase project `transix-470b3`. Financial records synchronize through React Native Firebase to `users/{uid}/financial_ledger/{transactionId}`, categories to `users/{uid}/financial_categories/{categoryId}`, and accounts to `users/{uid}/financial_accounts/{accountId}`. These are additive paths; older ledger and category documents are not rewritten. All paths are UID-scoped and carry `ownerId` and `businessId` in each document. Murimi and Fynage must use the same Firebase project and Firebase Auth UID for shared data; do not copy Murimi's operational batches or production records into Fynage.

Transactions are saved to SQLite first, then queued for Firestore. The local queue retries after connectivity returns. Stable document IDs make retries idempotent. Local edits use revision metadata; remote records do not replace a queued local edit. Deletions are synced as tombstones. Category archives are soft updates, so older transactions retain their category text.

## Native app files

The repository does not contain the Firebase native app files. Download the Android and iOS app configuration files from the Firebase project above, register package `com.yayapana.Fynage` and the iOS bundle identifier in that same project, and set `android.googleServicesFile` and `ios.googleServicesFile` in `app.json` to their paths. Keep downloaded native config files out of source control if they are managed as deployment secrets. React Native Firebase phone authentication requires these platform registrations and a development build.

In Firebase Console, enable **Authentication → Sign-in method → Phone**. Configure the supported SMS regions, billing/quota, and app verification (Android SHA fingerprints/Play Integrity and iOS APNs/reCAPTCHA URL scheme) for the registered apps. Use Firebase's fictional test phone numbers only in development. Production must use real Firebase phone verification.

## Firestore rules to merge into the project's deployed rules

`firestore.rules` in this checkout contains ownership checks for the Fynage profile and financial subcollections. No `firebase.json` or `.firebaserc` deployment target is configured. The current Firebase project is shared with Transix; do not deploy this file as a replacement for the existing project rules. Merge these matches into the active rules only after reviewing all applications using that project. Access is per UID; shared business membership is not modeled here.

```text
match /users/{uid} {
  allow read: if request.auth != null && request.auth.uid == uid;
  allow create, update: if request.auth != null && request.auth.uid == uid
    && request.resource.data.uid == uid;
  match /financial_ledger/{recordId} {
    allow read: if request.auth != null && request.auth.uid == uid;
    allow create, update: if request.auth != null
      && request.auth.uid == uid
      && request.resource.data.ownerId == uid;
    allow delete: if false;
  }
  match /financial_categories/{categoryId} {
    allow read: if request.auth != null && request.auth.uid == uid;
    allow create, update: if request.auth != null
      && request.auth.uid == uid
      && request.resource.data.ownerId == uid;
    allow delete: if false;
  }
  match /financial_accounts/{accountId} {
    allow read: if request.auth != null && request.auth.uid == uid;
    allow create, update: if request.auth != null
      && request.auth.uid == uid
      && request.resource.data.ownerId == uid;
    allow delete: if false;
  }
}
```

For deletes, the client writes a soft-delete tombstone (a document remains with `deletedAt`) so the change reaches other devices. The mobile app writes `financial_ledger`, `financial_categories`, and `financial_accounts`. These rules have not been emulator-tested or deployed. Add explicit membership checks before enabling cross-user business access.

## SMS import on Android

SMS import uses the local `@armament/fynage-sms` Expo module and requests only `android.permission.READ_SMS`, after an in-app explanation and user action. The native module is not available in Expo Go; rebuild a development/production binary after changing `app.json` or native dependencies (`npx expo run:android` or an EAS development build). The app scans inbox history from the prior 12 months on request and re-scans while the app is foregrounded. Android background restrictions mean this is not continuous background SMS monitoring. If permission is denied or revoked, manual entry and previously imported transactions remain available. No SMS body is sent to analytics or logs; relevant messages are kept in the user's private ledger for traceability.

The parser recognizes EcoCash/Econet sender IDs `+263143`, `+263164`, InnBucks provider-name messages, and bank messages containing supported bank names (CBZ, CABS, FBC, Stanbic, Steward, NMB, POSB, Ecobank, BancABC, ZB Bank, First Capital). Bank messages use the general Bank financial account. Supported-provider financial messages without a confident amount or transaction type are placed in a local-only review queue; users can record them manually or dismiss them. SMS formats are heuristic and need validation against representative device messages. Users should verify amount, date, currency and classification.

## CSV export

The History screen exports the currently filtered transactions and current account balances as UTF-8 CSV through the system share sheet. The temporary file is written to app cache. It includes records available on this device; sync first when exporting records from another device.
