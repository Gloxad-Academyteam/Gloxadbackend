# Specification 25: Scholarships

## 1. Source and purpose

The Weekly Developer Guide (Trimester Program and LMS Landing Pages) lists Scholarships as one of the four landing pages and as a Priority 0 admin function. The prototype adds the rules: only published scholarships reach the public page, closing dates close applications automatically, an application moves through Submitted, Under Review and Shortlisted to Approved or Rejected, a rejection always needs a reason, every change keeps history, and approving an applicant never marks anything paid or complete. The main backend has no scholarship model or route, so this unit adds them. Payment stays out of scope.

## 2. Rules

1. **Drafts are never public.** A scholarship is `draft`, `published` or `archived`. Only `published` appears on public routes or accepts applications.
2. **The window is computed on the server**, never trusted from the client: `upcoming` (before `opensAt`), `open`, `closed` (after `closesAt`). Applying outside `open` is `409`.
3. **Publish readiness checklist, on the server.** Moving a scholarship to `published` requires: a title, a description, at least one eligibility rule, valid `opensAt` and `closesAt` with `closesAt` after `opensAt` and in the future. Otherwise `422` with the list of what is missing.
4. **One application per student per scholarship.** A second attempt, including after withdrawing, is `409 ALREADY_APPLIED`.
5. **Required documents.** Each label in `requiredDocuments` must be matched by a submitted document. A document is `{ label, key }` where `key` is an S3 key in the private `documents/` folder (uploaded through the existing presigned-URL flow).
6. **Statuses and allowed moves** (admin only):

| From | Can move to |
| :--- | :--- |
| `submitted` | `under_review`, `rejected` |
| `under_review` | `shortlisted`, `approved`, `rejected` |
| `shortlisted` | `approved`, `rejected` |
| `approved`, `rejected`, `withdrawn` | nothing (final) |

   A student can move their own application to `withdrawn` while it is `submitted`, `under_review` or `shortlisted`.
7. **A rejection always needs a note** the applicant can see. Other moves may carry an optional note.
8. **History is append-only.** Every change adds an entry `{ status, note, internalNote, by, at }`. Nothing is overwritten. `internalNote` is staff-only and is never returned to the applicant.
9. **Approval changes nothing else.** It does not enrol, pay for or complete anything.
10. **Notification.** Each admin status change creates an in-app notification for the applicant (`type: "scholarship_update"`).
11. **Only students apply.** Tutors and admins get `403`.

## 3. Data model

`Scholarship`: `title`, `summary`, `description`, `eligibility` [String], `requiredDocuments` [String], `opensAt`, `closesAt`, `trimesterId` (optional link to a Trimester), `status`, `createdBy`, timestamps. Index on `status`.

`ScholarshipApplication`: `scholarshipId`, `userId`, `statement` (20 to 3000 characters), `documents` [{ `label`, `key` }], `status`, `history` [...], `submittedAt`, timestamps. Unique index on `{ scholarshipId, userId }`.

## 4. Endpoints

All errors are `{ "error": "message" }`, with `code` where listed.

### Public and student

| Method and path | Auth | Purpose |
| :--- | :--- | :--- |
| `GET /api/lms/public/scholarships` | Optional | Published scholarships with computed `state`. With a token, `application` shows the viewer's own status and latest note. |
| `POST /api/lms/scholarships/:id/applications` | Student | Apply. Body `{ statement, documents }`. `201`. |
| `GET /api/lms/scholarships/applications/me` | Student | My applications with full history (no staff notes). |
| `PUT /api/lms/scholarship-applications/:id/withdraw` | Student (owner) | Withdraw. |

### Admin (`roleGuard("admin")`)

| Method and path | Purpose |
| :--- | :--- |
| `POST /api/lms/admin/scholarships` | Create (always starts as `draft`). |
| `GET /api/lms/admin/scholarships` | List all with application counts per status. |
| `PUT /api/lms/admin/scholarships/:id` | Edit fields and move `status` (publish runs the readiness checklist). |
| `GET /api/lms/admin/scholarships/:id/applications?status=` | Applications with applicant name, email, statement, documents and full history. |
| `PUT /api/lms/admin/scholarship-applications/:id/status` | Move an application. Body `{ status, note, internalNote }`. |

## 5. Assumptions to confirm

1. Only admins decide applications (the guide marks instructor involvement as "confirm").
2. A withdrawn application cannot be reopened; the student cannot re-apply.
3. A scholarship's link to a Trimester is informational for now; approval does not create access.
4. There is no automatic email; in-app notification only, as the guide says in-app comes first.

## 6. Verification

`scripts/test-unit25-scholarships.js` covers: access control on every route; draft hidden from public and apply; the publish checklist; window states (upcoming, open, closed); required documents and document key rules; duplicate and withdrawn re-apply; every allowed and refused status move; rejection needs a note; history is append-only and staff notes never reach the applicant; notifications created; tutors and admins cannot apply; archived scholarships disappear.
