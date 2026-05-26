# Security Specification

## 1. Data Invariants
- A project cannot exist without a valid `ownerId` that strictly matches the `request.auth.uid`.
- `createdAt` is immutable.
- `ownerId` is immutable.
- Configuration must be an object.
- Any updates must strictly use `affectedKeys().hasOnly()`.

## 2. The "Dirty Dozen" Payloads
1. Unauthorized creation (not logged in).
2. Spoofed `ownerId` on creation.
3. Missing required fields on creation.
4. Extraneous keys on creation (shadow update).
5. Invalid target ID poisoning (massive ID).
6. Non-object `configuration`.
7. Name over 100 characters.
8. Unauthorized read (reading another user's project).
9. Updating another user's project.
10. Attempting to change `ownerId` on update.
11. Sending a client timestamp instead of `request.time`.
12. Attempting to update `createdAt`.

## 3. The Test Runner
A `firestore.rules.test.ts` file will be provided to assert these payloads.
