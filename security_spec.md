# Security Specification - SEPA Master

## Data Invariants
1. A user can only read and write their own profile document.
2. A user can only read and write scan data (metadata and stocks) under their own user path.
3. Timestamps like `lastActive` and `lastScanTime` must be validated against server time (though for simple numbers we check logic).

## The Dirty Dozen Payloads
1. Create a user document with a different `userId` in the path than the authenticated user. (REJECT)
2. Read stocks belonging to another user. (REJECT)
3. Update a scan status to 'scanning' for another user. (REJECT)
4. Inject a huge string (>128 chars) as a ticker ID. (REJECT)
5. Create a user document without an email. (REJECT)
6. Update another user's `lastActive` timestamp. (REJECT)
7. Delete the entire `markets` collection of another user. (REJECT)
8. Batch write stocks into another user's subcollection. (REJECT)
9. List all users in the system. (REJECT)
10. Update a stock's `price` with a non-number value. (REJECT)
11. Query stocks across all users. (REJECT)
12. Create a stock with a ticker ID containing malicious characters. (REJECT)

## Test Runner (Logic Overview)
The `firestore.rules` will be tested using ESLint and manual logic verification following the "Fortress" pattern.
