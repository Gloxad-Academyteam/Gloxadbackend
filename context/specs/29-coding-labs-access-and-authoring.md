# Specification 29: Coding Labs, Access and Authoring

## Why
Labs could be listed for a cohort (members only) but anyone signed in could read, autosave to or submit to any lab by its id, and nothing in the API could create one (only the seed script). The frontend lab screen needs both.

## Rules
1. **Access.** Reading a lab, reading or saving its draft, and submitting need cohort membership (students, assigned tutors, admins): `403 COHORT_ACCESS_DENIED`. Invalid id `400`, unknown `404`.
2. **Authoring.** `POST /api/lms/cohorts/:cohortId/labs` and `PUT /api/lms/labs/:labId` for the cohort's tutors and admins. Fields: `title`, `description`, `instructions`, `language` (`javascript`, `typescript`, `python`, `html`, `css`, `sql`), `starterCode`, `dueAt`, `testCases` (up to 50, each `name`, `input`, `expectedOutput`, `hidden`).
3. **Size.** Code is at most 100000 characters (`400`). Lab routes accept a 256 KB body; the rest of the API keeps 16 KB.
4. **Hidden tests** never reveal their expected output to students (`[HIDDEN]`).
5. **Results are unverified.** The browser reports `passedTests` and `totalTests`; the server stores them with `unverified: true`. Server-side execution waits for the security-reviewed runner (Phase 5).

## Verification
`scripts/test-unit29-labs.js`.
