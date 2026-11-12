# Specification 23: Course Creation Governance

## Why
`context/architecture.md` says instructor routes require `approvalStatus === "approved"`. The tutor course routes only checked the role, so a tutor who was still pending or had been rejected could create, edit, submit and appeal courses by calling the API directly. Only the web screen blocked them.

## Rule
Creating and changing courses needs three things, checked in this order:
1. A signed-in user. `401`.
2. `role === "instructor"`, or `admin`. The existing role guard deliberately lets admins through instructor routes (admins author Trimester courses). Students get `403`.
3. `approvalStatus === "approved"`. `403` with `code: "TUTOR_NOT_APPROVED"` and the current `approvalStatus`.

## Routes covered
`POST /api/tutor/courses`, `PUT /api/tutor/courses/:id`, `POST /api/tutor/courses/:id/submit`, `POST /api/tutor/courses/:id/appeal`.

## Deliberately not covered
`POST /api/tutor/showcase-expertise` must stay open, because it is how a tutor applies. Read-only tutor routes (`GET` courses, dashboard stats, earnings, reviews) stay open so a pending tutor sees an empty dashboard instead of an error.

## Open decision
Whether tutors may create courses of type `trimester` or only admins. Admins can already author them; restricting tutors is not enforced until the product owner decides.

## Verification
`scripts/test-unit23-course-governance.js`: approved tutors can still create, edit and submit; pending and rejected tutors are refused on all four routes with `TUTOR_NOT_APPROVED`; students get the role `403`; admins may author (existing design); signed-out is `401`; `showcase-expertise` and read routes remain reachable for pending tutors; once an admin approves a pending tutor the same token works.
