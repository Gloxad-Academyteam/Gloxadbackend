# Specification 26: Enrolment Lifecycle and Trimester Publishing

## Source
Weekly Developer Guide, status model and Priority 0 admin functions: enrolment statuses (Pending, Active, Completed, Withdrawn, Suspended), suspended and withdrawn learners keep their history, programmes are Draft, Published or Archived, publishing runs a readiness checklist on the server, archiving hides a programme from new learners but keeps every record, admins can preview, and an enrolment confirmation notification is sent.

## 1. Enrolment lifecycle
`CohortEnrolment` records one row per student per cohort: `status` and an append-only `history` (`status`, `note`, `by`, `at`). `Cohort.studentIds` stays the access list so every existing route keeps working: **active** and **completed** students are in it; **suspended** and **withdrawn** students are not (they lose access and free their seat) but keep their record and progress.

`Pending` is not used: enrolment is open, not approval-based (guide: policy still open).

| From | Can move to | Who |
| :--- | :--- | :--- |
| `active` | `suspended` (reason required), `withdrawn` (reason required for admin), `completed` | admin; the student can withdraw themselves |
| `suspended` | `active` (needs a free seat), `withdrawn` | admin |
| `completed`, `withdrawn` | nothing by an admin move | a withdrawn student may re-enrol while the window is open |

Rules:
1. A suspended student cannot re-enrol on their own (`409 ENROLMENT_SUSPENDED`).
2. Reinstating checks capacity (`409 COHORT_FULL`).
3. Moves are conditional on the status that was read, so two admins cannot apply one move twice (`409 CONCURRENT_CHANGE`).
4. Members who joined before this unit have no record; they are treated as `active` and get a record on their first change.
5. Enrolment confirmation (`enrolment_confirmed`), suspension, reinstatement and admin withdrawal notify the student in-app.
6. A student may withdraw only while `active` and the cohort is not `completed` or `archived`.

Endpoints: `GET /api/lms/admin/cohorts/:id/enrolments`, `PUT /api/lms/admin/cohorts/:id/enrolments/:userId/status { status, reason }`, `PUT /api/lms/cohorts/:cohortId/withdraw` (student), `GET /api/lms/enrolments/me` (student). The Unit 21 add and remove routes now write records too.

## 2. Trimester publishing
* `archivedAt` (null by default). `PUT /api/lms/admin/trimesters/:id { archived: true|false }`. An archived Trimester disappears from public routes and refuses enrolment; nothing is deleted.
* **Readiness checklist.** Setting `isPublished: true` requires: a title, a description, an enrolment close date in the future, and at least one programme (cohort) where every cohort has a tutor, a capacity of at least 1 and a published course. Otherwise `422 NOT_READY_TO_PUBLISH` with a `missing` list.
* `GET /api/lms/admin/trimesters/:id/preview` returns the public detail view even for a draft or archived Trimester, plus `readiness: { ready, missing }`.

## Verification
`scripts/test-unit26-enrolment-lifecycle.js`.
