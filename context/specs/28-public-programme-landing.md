# Specification 28: Public Landing Page for a Trimester Course

## Why
The guide asks for a public landing page for the Trimester program: overview, the week journey, learning activities, schedule, eligibility and registration state, with call to action by viewer state, and no private progress for visitors. The Trimester list already returned programmes, but a landing page also needs the course's own marketing content and a single address per programme.

## Rules
1. **Tutor-only authoring.** Trimester courses are created by tutors (`403 TRIMESTER_COURSE_TUTOR_ONLY` for anyone else, admins included). Admins moderate the course and run the cohort that teaches it.
2. **Content comes from the tutor's course**, so nothing is hard-coded: `thumbnail` (the cover image uploaded through the course wizard), `trailerVideoUrl`, `level`, `language`, `skills` (what you will learn), `targetAudience` (who it is for), `requirements`, `description`, `slug`. Missing content is `null` or an empty list; the page decides what to show.
3. `GET /api/lms/public/programmes/:cohortId` (optional token) returns one programme and its Trimester summary: `{ trimester, programme }`. The programme carries `weeks` (one per module with `lessonCount`), the next five `sessions`, `instructors`, `seats`, `seatsLeft`, `price`, `enrolmentState` and `enrolled`.
4. **Visibility.** Only a published, non-archived Trimester and a cohort that is `enrolling` or `active`. Anything else is `404`. Visitors never see anyone's progress; `enrolled` is only `true` for the signed-in viewer.
5. The Trimester list and detail routes return the same new programme fields.

## Verification
`scripts/test-unit28-programme-landing.js`.
