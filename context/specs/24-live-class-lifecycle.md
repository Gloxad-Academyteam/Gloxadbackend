# Specification 24: Live Class Scheduling and Lifecycle

## Source
Weekly Developer Guide: admins schedule live sessions; changing a time updates the countdown, the join window and the attendance window together; all times are stored in UTC; attendance comes from join and leave timestamps, not a roll call; the join window is enforced by the server. Review of `lmsLive.controller.js` also found permission and lifecycle gaps, fixed here.

## Rules
1. **Scheduling.** `POST /api/lms/live-sessions` needs `cohortId`, `title`, `startsAt`, `endsAt`. Times must be valid, `endsAt` after `startsAt`, and `startsAt` in the future (`400`). Times are stored as UTC instants.
2. **Who schedules.** A tutor assigned to the cohort hosts their own class. An admin schedules on behalf of one of the cohort's tutors: `instructorId` must be a tutor assigned to that cohort (`422` otherwise); if omitted it defaults to the cohort's first tutor; a cohort without tutors gives `422`. Other tutors and students get `403`.
3. **Status moves.** `scheduled` to `live` or `ended`; `live` to `ended`; `ended` is final. Anything else is `409 INVALID_TRANSITION` with the allowed moves. An unknown status is `400`. (`live` normally happens when the host joins.)
4. **Rescheduling** is only possible while `scheduled` (`409 SESSION_LOCKED` after). New times follow rule 1. Because the countdown, join window and attendance window are all derived from `startsAt` and `endsAt`, they move together.
5. **Ending a class** stamps `endedAt` and closes every attendance record still open (`leftAt` set, duration computed), so attendance never depends on students pressing Leave.
6. **After a class ends**, nobody can join, even before the planned `endsAt`.
7. **Cancelling** (`DELETE`) is only possible while `scheduled` (`409 SESSION_LOCKED` otherwise).
8. **Rejoining** after leaving clears `leftAt` (the person is in the room again).
9. **Permissions.** Only cohort members (students, assigned tutors) and admins can list a cohort's sessions with `?cohortId=` or read a session's chat history (`403 COHORT_ACCESS_DENIED`). Before, any signed-in user could.
10. **Notifications (in-app).** Scheduling notifies the cohort's students (`live_class_scheduled`); rescheduling notifies them (`live_class_rescheduled`).

## Verification
`scripts/test-unit24-live-classes.js`.
