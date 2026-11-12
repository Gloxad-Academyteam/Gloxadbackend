# Specification 21: Trimester Administration & Programme Enrolment

## 1. Why this unit exists

Units 19 and 20 built everything a student does inside a cohort (curriculum, quizzes, assignments, live classes, certificates). Nothing in the API can create a Trimester, create a cohort, or put a student into one. Today that is only possible through `src/seed.js`. This unit closes that gap:

1. Admins create and publish Trimesters, create cohorts (programmes) inside them, assign tutors, and manage rosters.
2. The public can see published Trimesters and their programmes without signing in.
3. A signed-in student can enrol themselves in an open programme.

## 2. Vocabulary

| Term | Meaning in this codebase |
| :--- | :--- |
| Trimester | A 12-week academic term (`Trimester` model): dates, enrolment window, status. |
| Programme | A cohort running one trimester-type course during one Trimester (`Cohort` model). The public API calls it a programme. |
| Seat | One place in a cohort. `capacity - studentIds.length` seats are left. |

## 3. Scope (in and out)

In scope: admin Trimester and cohort management, admin roster add and remove, public Trimester list and detail, student self-enrolment for free programmes.

Out of scope (later units): paid programme checkout through Paystack, scholarships, waiting lists, instructor self-service cohort creation, automatic cohort status changes by date.

## 4. Data model changes

`Trimester.model.js` gains three optional fields. Existing documents keep working because every new field has a default.

| Field | Type | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `description` | String | `""` | Shown on the public Trimester page. |
| `isPublished` | Boolean | `false` | Only published Trimesters appear in public routes. Indexed. |
| `enrollmentOpensAt` | Date | `null` | Optional start of the enrolment window. When null, enrolment opens as soon as the Trimester is published. |

No change to `Cohort.model.js` or `Enrollment.model.js`.

## 5. Rules

### 5.1 Enrolment state of a programme
Computed on the server, never trusted from the client:

| State | Condition |
| :--- | :--- |
| `upcoming` | `enrollmentOpensAt` is set and is in the future. |
| `open` | Cohort status is `enrolling`, now is on or before `enrollmentClosesAt`, and (if set) on or after `enrollmentOpensAt`. |
| `closed` | Anything else (cohort not `enrolling`, window ended). |

A full cohort stays `open` with `seatsLeft: 0`; the enrol call then answers `409 COHORT_FULL`.

### 5.2 Self-enrolment (`POST /api/lms/cohorts/:cohortId/enrol`)
Order of checks, each with its own status and `code`:

1. Signed in. `401` otherwise.
2. `role === "student"`. `403` otherwise (tutors and admins cannot enrol themselves).
3. Valid id and cohort exists on a **published** Trimester. `400` or `404`.
4. Enrolment state is `open`. `409 ENROLMENT_NOT_OPEN` (upcoming) or `409 ENROLMENT_CLOSED`.
5. The programme's course is free (`price === 0`). Otherwise `409 PAYMENT_REQUIRED`. Paid enrolment arrives with the Paystack unit; the server never trusts a client claim of payment (Architecture Rule 4).
6. Seat is taken with one atomic update that requires: cohort still `enrolling`, student not already in `studentIds`, and `studentIds.length < capacity`. If the update matches nothing, the server reloads and answers `409 ALREADY_ENROLLED`, `409 COHORT_FULL` or `409 ENROLMENT_CLOSED`. Two students racing for the last seat can never both win.
7. A course `Enrollment` is created if missing (upsert on `{ user, course }`) so the programme shows in `GET /api/enrollments/my-courses`; `Course.enrolledCount` goes up only when that upsert inserted a new row.

Success: `201 { message, cohortId, enrolment: { cohortId, courseId, enrolledAt } }`.

### 5.3 Admin rules
* Only `role === "admin"`.
* A cohort can only be created for a course that is `published` and has `courseType === "trimester"`. `422` otherwise.
* Every id in `instructorIds` must be a user with `role === "instructor"` and `approvalStatus === "approved"`. `422` otherwise.
* `capacity` cannot be set below the number of students already enrolled. `422`.
* `endDate` must be after `startDate`, and `enrollmentClosesAt` must not be after `endDate`. `400`.
* Adding a student by admin ignores the enrolment window and price (an admin can sponsor a seat) but still respects `capacity` and duplicates.
* Removing a student keeps their progress records; they simply lose cohort access.

## 6. Endpoints

All errors use `{ "error": "message" }`, with an extra `code` where listed. Identifiers are `_id` strings.

### Admin (`authGuard`, `roleGuard("admin")`)

| Method and path | Purpose | Success |
| :--- | :--- | :--- |
| `POST /api/lms/admin/trimesters` | Create a Trimester. Body: `number` (1 to 3), `title`, `startDate`, `endDate`, `enrollmentClosesAt`, optional `description`, `weeks`, `enrollmentOpensAt`. Created unpublished, status `upcoming`. | `201 { trimester }` |
| `GET /api/lms/admin/trimesters` | List all Trimesters with `cohortCount` and `studentCount`. | `200 { trimesters }` |
| `PUT /api/lms/admin/trimesters/:id` | Update fields, including `status` (`upcoming`, `active`, `completed`) and `isPublished`. | `200 { trimester }` |
| `POST /api/lms/admin/cohorts` | Create a cohort. Body: `trimesterId`, `courseId`, `name`, optional `capacity` (default 50), `instructorIds`, `timezone`. Created with status `enrolling`. | `201 { cohort }` |
| `GET /api/lms/admin/cohorts?trimesterId=` | List cohorts with `studentCount`, `seatsLeft`, course title, tutors. | `200 { cohorts }` |
| `PUT /api/lms/admin/cohorts/:id` | Update `name`, `capacity`, `instructorIds`, `timezone`, `currentWeek`, `status` (`enrolling`, `active`, `completed`, `archived`). | `200 { cohort }` |
| `POST /api/lms/admin/cohorts/:id/students` | Add a student by `userId` or `email`. | `201 { message, studentCount }` |
| `DELETE /api/lms/admin/cohorts/:id/students/:userId` | Remove a student. | `200 { message, studentCount }` |

### Public

| Method and path | Auth | Purpose |
| :--- | :--- | :--- |
| `GET /api/lms/public/trimesters` | Optional | Published Trimesters whose status is `upcoming` or `active`, each with its programmes. `enrolled` is true only when a signed-in student is already in that cohort. |
| `GET /api/lms/public/trimesters/:id` | Optional | One published Trimester with programmes. Each programme adds `weeks` (one entry per course module: `weekNumber`, `title`, `lessonCount`) and `sessions` (next five scheduled live sessions). |
| `POST /api/lms/cohorts/:cohortId/enrol` | Student | Self-enrolment (section 5.2). |

### Programme shape (public)

```json
{
  "_id": "<cohortId>",
  "name": "Cohort Alpha - Fullstack JS",
  "courseId": "<courseId>",
  "title": "Fullstack Software Engineering",
  "description": "...",
  "price": 0,
  "currency": "NGN",
  "seats": 50,
  "seatsLeft": 38,
  "instructors": [{ "_id": "...", "name": "Jane Tutor" }],
  "enrolmentState": "open",
  "enrolled": false
}
```

The Trimester wrapper carries `_id`, `number`, `title`, `description`, `startDate`, `endDate`, `weeks`, `enrollmentOpensAt`, `enrollmentClosesAt`, `status` and `programmes`.

## 7. Assumptions to confirm

1. **Programme = cohort.** The public pages list cohorts; a Trimester is the term that groups them. The earlier frontend prototype treated a Trimester as a single programme, so the frontend adapts to this shape.
2. **Paid programmes are blocked for self-enrolment** until the payment unit. The only way into a paid programme today is an admin adding the student.
3. **Only trimester-type courses** can run as cohorts when created through the new admin route. Existing seeded cohorts are untouched.
4. **No automatic date-based status changes.** An admin moves a cohort from `enrolling` to `active` and a Trimester from `upcoming` to `active`.

## 8. Verification

`scripts/test-unit21-trimester.js` runs its own server and checks: access control for every admin route (student `403`, tutor `403`, signed-out `401`); validation failures; unpublished Trimesters hidden from public routes; the enrolment state machine across the window; free enrolment success and the `Enrollment` row; duplicate, full-cohort, closed and paid refusals; tutors and admins refused self-enrolment; an eight-way race for the last seat produces exactly one winner; admin add and remove; capacity below roster refused.
