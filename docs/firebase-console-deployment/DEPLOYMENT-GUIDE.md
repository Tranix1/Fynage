# Firebase Console deployment files

Project: `armament-f5a0b`

These exports come from the configured shared project files. `Murimi/firebase.json` is the backend deployment configuration and points to `Murimi/firestore.rules` and `Murimi/firestore.indexes.json`; Fynage, Murimi, and Tengesa each point to the same named files. SHA-256 checksums were identical across all three apps at export time:

- Firestore rules: `4B0C1B6EA31A3EFEE6BE17BD7D6BCD2BB3AD6824962C8DBF64099E7E570E2031`
- Firestore indexes: `B98466F01E0A135577BC681DF2DB546CC21A0EFC62DCC6A93D194B9FAD76AFFC`

## Firestore Security Rules

In Firebase Console, select `armament-f5a0b`, open **Firestore Database - Rules**, replace the editor contents with the complete contents of [`firestore.rules.txt`](./firestore.rules.txt), review, then select **Publish**.

The shared callable backend uses the Admin SDK, so trusted server operations bypass client rules while validating Firebase identity and business roles in callable code. Client writes to protected shared records remain denied. The rules preserve personal finance, business, store, owner, employee, investor, membership, and invitation boundaries.

## Firestore indexes

[`firestore.indexes.json`](./firestore.indexes.json) is the exact index specification shared by all three apps. In Firebase Console, open **Firestore Database - Indexes - Composite**, then create the composite indexes listed under `indexes` in this file, using the collection, fields, sort order, and query scope exactly as specified. The Firebase Console index page does not accept this JSON as a bulk upload. The `fieldOverrides` list is empty, so no single-field exemptions are required.

## Cloud Storage rules

No `storage.rules.txt` is included. The apps initialize the `armament-f5a0b.firebasestorage.app` bucket and upload images, but none of the three `firebase.json` files declares a Storage rules source, and no authoritative `storage.rules` source file exists in the projects. Guessing rules would not be an exact production export and could weaken existing access controls. In Firebase Console, inspect **Storage - Rules** and save the current rules separately before making any Storage change. This requires project account access.

## Verification

- Firestore Emulator security suite: **9 passed, 0 failed** against the shared Firestore rules.
- Shared Armament callable Emulator suite: **1 passed, 0 failed**. It covered business role enforcement, owner and employee invitations, entitlements, referral attribution and redemption, shared ledger synchronization, Murimi purchases and sales, Tengesa sales and expenses, and personal-finance isolation.
- Subscription price and payment-status unit tests: **3 passed, 0 failed**. The configured monthly amount is 100 USD cents.

No Firebase rules, indexes, functions, or production settings have been deployed by this export.

## External account actions

Publishing rules and creating indexes changes the live Firebase project and must be done by a project administrator. When deploying the Cloud Functions code, make sure the deployment environment includes `ARMAMENT_MONTHLY_AMOUNT_MINOR=100`; the project-specific local env file is excluded from Git. Before processing live card payments, enable the payment methods on the Paynow merchant account and complete Verified Merchant approval for Visa/Mastercard. Configure `PAYNOW_ID` and `PAYNOW_KEY` as Cloud Functions secrets; never put them in these files or the mobile apps. Hosted Paynow checkout is used so card details are entered on Paynow, not collected by Armament.

Paynow's documentation describes the hosted web checkout and payment channel setup: [Initiate transaction](https://developers.paynow.co.zw/docs/paynow/initiate_transaction/), [merchant FAQ](https://www.paynow.co.zw/home/merchanttutorial), and [merchant verification](https://verify.paynow.co.zw/).
