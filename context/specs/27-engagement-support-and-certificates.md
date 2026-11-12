# Specification 27: Notifications, Continue Learning, Support Flags and Certificate Issuing

## Source
Weekly Developer Guide and prototype: in-app notifications for announcements, submissions and certificates; "Continue Learning" opens the last activity with its scroll position; instructors see flags for learners who need support (low progress, low attendance, late work) with thresholds an admin configures; certificates are issued by an admin when the learner is Eligible, an override needs a written reason, and revoking needs a reason the learner can be shown. This backend could revoke and reissue certificates but nothing issued one (only the seed script created them).

## 1. Notifications (in-app)
| Event | Who is told | `type` |
| :--- | :--- | :--- |
| New cohort announcement | Cohort students | `new_announcement` |
| Assignment submitted | The cohort's tutors | `submission_received` |
| Certificate issued | The learner | `certificate_issued` |
| Certificate revoked (with the reason) | The learner | `certificate_revoked` |

(Unit 24, 26 and 25 already notify for live classes, enrolment and scholarships.) Failures never block the action. **Not built:** reminders for upcoming classes and due dates need a scheduler; there is none in this backend and no new package may be added without approval.

## 2. Continue Learning
`GET /api/lms/continue-learning?cohortId=` (cohort members; cohort auto-resolved when omitted). Returns the lesson the learner was last on (`reason: "resume"`, with `scrollPosition` and `lastPositionSeconds`), the next lesson when that one is completed (`"next"`), the last lesson again when the whole course is done (`"finished"`), or the first lesson when there is no activity (`"start"`). `continueLearning` is `null` when the course has no lessons.

## 3. Support flags
`GET /api/lms/instructor/cohorts/:cohortId/support-flags` (a tutor assigned to the cohort, or an admin; other tutors `403`). Per learner: `progressPercent` (completed lessons of all lessons), `attendancePercent` (present out of ended sessions, excused ones removed; `null` when no session has ended), `lateSubmissions`, and `flags`:
* `low_progress` when progress is under `lowProgressPercent`, judged only from week 2 of the cohort (otherwise everyone is flagged on day one);
* `low_attendance` when attendance is under `lowAttendancePercent`;
* `late_work` when late submissions reach `lateSubmissions`.
Flagged learners come first. Defaults: 40, 60 and 2. `PUT /api/lms/admin/cohorts/:id/support-thresholds` (admin) changes them; percentages 0 to 100, late count a whole number of at least 1.

## 4. Certificates
* `POST /api/lms/admin/cohorts/:cohortId/certificates { userId, overrideReason? }` (admin). The learner must be in the cohort. Eligibility comes from the gradebook rules (`certificateEligibility`). If not eligible: `422 NOT_ELIGIBLE` with the three states, unless `overrideReason` of at least 10 characters is given, which is stored on the certificate (`issuedBasis: "override"`). One valid certificate per learner per cohort (`409 ALREADY_ISSUED`); a revoked one must be reissued (`409 REVOKED_USE_REISSUE`). The PDF is generated on first download as before.
* `PUT /api/lms/certificates/:id/revoke` now requires a `reason` (`400 REASON_REQUIRED`), refuses an already revoked certificate (`409 ALREADY_REVOKED`) and notifies the learner.

## Verification
`scripts/test-unit27-engagement.js`. The eligible path of issuing depends on a fully approved final project and gradebook, which is covered by the gradebook tests; this script covers the override path.
