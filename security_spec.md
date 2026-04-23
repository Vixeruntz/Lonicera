# Security Specification

1. Data Invariants: An article can only be read, never written by the client. The cache is entirely server-authoritative.
2. The Dirty Dozen Payloads:
- `{"title": "Hacked"}` -> Rejected by `allow write: if false`
- Any payload will be completely rejected.
3. Test Runner:
Writing tests is trivial since all writes are false.
