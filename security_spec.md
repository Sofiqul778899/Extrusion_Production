# Security Specification

## Data Invariants
1. Production records must have a valid RollID.
2. Machine status can only be 'Running', 'Idle', or 'Breakdown'.
3. Only authenticated users can read data.
4. Only the server (via Admin SDK) should ideally write significant data, but client-side read is allowed for UI responsiveness if needed.

## The "Dirty Dozen" Payloads
(Testing various illegal writes)
1. Write to `production_records` without authentication.
2. Update `RollID` in an existing production record.
3. Inject a script into `Machine.reason`.
4. Set `target` to a negative number.
5. Delete `app_config/sheet`.
6. Add a field `isAdmin: true` to a machine document.
7. ... (other standard attacks)

## Rules Blueprint
- Default deny.
- Authenticated users can read most things.
- Write is restricted.
