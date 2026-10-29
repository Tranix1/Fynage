# Fynage Firebase setup

The Fynage client configuration in `src/db/fireBaseConfig.ts` names Firebase project `transix-470b3`. Financial records synchronize through React Native Firebase to `users/{uid}/financial_ledger/{transactionId}` and categories to `users/{uid}/financial_categories/{categoryId}`. Both paths are UID-scoped and carry `businessId` in each document. Murimi and Fynage must use the same Firebase project and Firebase Auth UID for shared data; do not copy Murimi's operational batches or production records into Fynage.

Transactions are saved to SQLite first, then queued for Firestore. The local queue retries after connectivity returns. Stable document IDs make retries idempotent. Local edits use revision metadata; remote records do not replace a queued local edit. Deletions are synced as tombstones. Category archives are soft updates, so older transactions retain their category text.

## Native app files

The repository does not contain the Firebase native app files. Download the Android and iOS app configuration files from the Firebase project above, register package `com.yayapana.Fynage` and the iOS bundle identifier in that same project, and set `android.googleServicesFile` and `ios.googleServicesFile` in `app.json` to their paths. Keep downloaded native config files out of source control if they are managed as deployment secrets. React Native Firebase phone authentication requires these platform registrations and a development build.

In Firebase Console, enable **Authentication → Sign-in method → Phone**. Configure the supported SMS regions, billing/quota, and app verification (Android SHA fingerprints/Play Integrity and iOS APNs/reCAPTCHA URL scheme) for the registered apps. Use Firebase's fictional test phone numbers only in development. Production must use real Firebase phone verification.

## Firestore rules to merge into the project's deployed rules

No Firestore rules or `firebase.json` deployment target were present in this checkout. Merge this match block with the rules already deployed to the project; do not replace unrelated application rules with it. It grants access only to a user's own profile and records. Shared business membership is not modeled in this app yet, so this rule intentionally does not grant cross-user business access.

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
}
```

For deletes, the client writes a soft-delete tombstone (a document remains with `deletedAt`) so the change reaches other devices. The mobile app writes only `financial_ledger` and `financial_categories`; deploy these rules to the Firebase project selected above before enabling sync. Add explicit membership checks before enabling cross-user business access.

## SMS import on Android

SMS import uses the local `@armament/fynage-sms` Expo module and requests only `android.permission.READ_SMS`, after an in-app explanation and user action. The native module is not available in Expo Go; rebuild a development/production binary after changing `app.json` or native dependencies (`npx expo run:android` or an EAS development build). The app scans inbox history from the prior 12 months on request and re-scans while the app is foregrounded. Android background restrictions mean this is not continuous background SMS monitoring. If permission is denied or revoked, manual entry and previously imported transactions remain available. No SMS body is sent to analytics or logs; relevant messages are kept in the user's private ledger for traceability.

The parser currently recognizes EcoCash/Econet sender IDs `+263143`, `+263164`, and provider-name senders. SMS text formats vary; unrecognized messages are skipped and potential duplicates are marked for review. Users should verify imported amounts, dates, currency, and classifications.
