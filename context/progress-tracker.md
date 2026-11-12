# Progress Tracker - Gloxad Academy Backend API

> Master Build Plan: [`00-build-plan.md`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/context/specs/00-build-plan.md)  
> Current Active Spec: [`22-handover-phases-2-to-5-specification.md`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/context/specs/22-handover-phases-2-to-5-specification.md)

---

## Current Phase
- **Backend Handover (v1.1, 11 Nov 2026)**: Phase 2 (Academic Governance & Grading Engine) [COMPLETED] -> Moving to Phase 3 (LiveKit Egress Recording)

## Current Goal
- [x] Part A: Module-by-module sequential course progression (Lessons -> Quiz -> Written Task -> Unlock Next Module), error codes (403 MODULE_LOCKED, 409 LESSONS_INCOMPLETE, 409 QUIZ_NOT_PASSED), module task endpoints, deterministic assessments generator, and 27-test automated verification suite. [COMPLETED & VERIFIED].
- [x] Phase 1: 18 primary categories dynamic taxonomy with tags, pathways, and soft deactivation; Provider registry entity with YouTube official embed policy; 12-week 22-node curriculum trail layout. [COMPLETED & VERIFIED].
- [x] Phase 2: 8-stage final-project state machine (stages 1-8, tutor recommendation vs admin official approval), reusable grading engine (7 assessment categories, 100% total weight validation, raw vs weighted marks), late/resubmission score caps, student/tutor gradebooks, and GradeAudit logs. [COMPLETED & VERIFIED via scripts/test-phase2-governance.js - 15/15 PASSED].
- [ ] Phase 3: LiveKit WebRTC classroom automatic recording egress to AWS S3, leave tracking, and 1-hour presigned playback. [NEXT].
- [ ] Phase 4: Persistent multi-file workspace and 3-layer autosave (browser -> server cloud draft -> versioned snapshots).
- [ ] Phase 5: Developer workflow, GitHub integration, and Judge0 code execution runner (supporting self-hosted AWS EC2, cloud, and local VM fallback).

---

## Units Progress Summary

- [x] **Audit & Scaffolding**: Initial repository analysis, rule violation fixes, and dependency installation.
- [x] **Milestone 1 (01-auth-email-otp)**: User Authentication, Email & OTP System [COMPLETED]
  - [x] **Unit 01**: Core Foundation & Centralized Error Infrastructure
  - [x] **Unit 02**: Authentication Core & JWT Access Guards
  - [x] **Unit 03**: Email OTP Verification & Password Recovery System
  - [x] **Phase 1 Alignment (Handoff P0/P1 Blockers)**:
    - [x] Student & Tutor OTP dispatch on signup (4-digit CSPRNG).
    - [x] Session token return on signup (`201 { token, user }`).
    - [x] Verify email updated user return (`200 { message, user }`).
    - [x] `POST /api/auth/resend-verification` implemented.
    - [x] `PUT /api/auth/update-profile` implemented.
    - [x] Server-side session revocation via `tokenVersion`.
    - [x] Isolated rate-limit buckets with `Retry-After`.
    - [x] Multi-provider email integration (Brevo REST API, SMTP Relay, Resend, and Dev Logger fallback).
- [x] **Unit 04**: User Profile Management & AWS S3 Presigned Media Offloading [COMPLETED & VERIFIED]
  - [x] **Phase 1 Alignment**:
    - [x] Upload Presigned URL Generation (S3 offloading) implemented.
    - [x] Direct Media Upload Verification (Client -> S3) verified.
    - [x] AWS S3 Bucket Policy (`s3:GetObject`) & Public Access permissions resolved for public asset rendering (`arn:aws:s3:::amzn-v3-buccket-gloxad-sstone/*`).
    - [x] Frontend Integration Workflow documented in API Docs (`POST /api/upload/presigned-url` -> `PUT /api/auth/update-profile`).
    - [x] Full Profile Update with Collision Prevention & Nested Object Preservation implemented.
- [x] **Unit 05**: Course Taxonomy & Category Management [COMPLETED & VERIFIED]
- [x] **Unit 06**: Course Catalog & Public Discovery (with Content Protection) [COMPLETED & VERIFIED]
- [x] **Unit 07**: Tutor Onboarding & Analytics [COMPLETED & VERIFIED]
- [x] **Unit 08**: 5-Step Course Authoring Wizard & Review Pipeline [COMPLETED & VERIFIED]
- [x] **Unit 09**: Admin Moderation, User Management & Platform Operations [COMPLETED & VERIFIED]
- [x] **Unit 10**: Course Enrollments & Paystack Payment Verification [COMPLETED & VERIFIED]
- [x] **Unit 11**: Idempotent Paystack Webhook Processing [COMPLETED & VERIFIED]
- [x] **Unit 12**: Learning Engine (Progress, Server-Side Quiz Grading, Q&A, Notes, Certificate) [COMPLETED & VERIFIED]
- [x] **Unit 13**: Real-Time Messaging & In-App Notifications (REST + Socket.io) [COMPLETED & VERIFIED]
- [x] **Unit 14**: Interactive API Documentation Web Page [COMPLETED & VERIFIED]
- [x] **Unit 15**: Seed Data & End-to-End System Smoke Tests [COMPLETED & VERIFIED]
- [x] **Unit 16**: Frontend Integration Gap Remediation & System Synchronization [COMPLETED & VERIFIED]
- [x] **Unit 17**: Infrastructure Unblock & Partner Applications (Phase 1) [COMPLETED & VERIFIED]
- [x] **Unit 18**: Institution Onboarding, Workspace Setup & Multi-Currency Billing [COMPLETED & VERIFIED]
- [x] **Unit 19**: Trimester LMS Core — Cohorts, Curriculum, Quizzes & Assignments [COMPLETED & VERIFIED]
- [x] **Unit 20**: LMS Live Classrooms, Community, Certificates & Analytics [COMPLETED & VERIFIED]

---

## Completed in Milestone 1

### Units 01 - 03 (`01-auth-email-otp.md`)
1. **Dependencies**: `jsonwebtoken`, `bcryptjs`, `nodemailer`, `express-rate-limit`, `cors`, `helmet`.
2. **Environment & Database Configuration**:
   - [`src/config/env.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/config/env.js): Validated `PORT`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `FRONTEND_ORIGIN`, SMTP settings.
   - [`.env.example`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/.env.example): Fully documented configuration keys.
   - [`src/config/db.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/config/db.js): Robust Mongoose connection lifecycle handler.
3. **Data Models**:
   - [`src/models/User.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/User.model.js): Standardized password hashing hook, full `name` calculation, `approvalStatus` (`pending` for instructors, `approved` for students), `socials`, `avatarUrl`, and automatic `toJSON` stripping of `password` and `__v`.
   - [`src/models/Otp.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/Otp.model.js): Hashed OTP records with MongoDB TTL auto-deletion index (`expires: 0`) and `consumed` tracking.
4. **Middlewares & Utilities**:
   - [`src/utils/hash.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/utils/hash.js): Bcrypt salt hashing & comparison.
   - [`src/utils/jwt.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/utils/jwt.js): JWT token signing & verification (`7d` expiry).
   - [`src/utils/email.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/utils/email.js): Hybrid email dispatch (SMTP + dev logger fallback).
   - [`src/middlewares/auth.middleware.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/middlewares/auth.middleware.js): Bearer JWT extraction and `req.user` injection.
   - [`src/middlewares/role.middleware.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/middlewares/role.middleware.js): Role authorization guard.
   - [`src/middlewares/rateLimiter.middleware.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/middlewares/rateLimiter.middleware.js): IP rate limiting for auth & OTP routes.
   - [`src/middlewares/error.middleware.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/middlewares/error.middleware.js): Centralized error formatter adhering to Rule 1 (`{ "error": "<message>" }`).
5. **Controllers & Routes (`src/controllers/auth.controller.js` & `src/routes/auth.routes.js`)**:
   - `POST /api/auth/signup`: User registration (Student / Instructor with 4-digit OTP).
   - `POST /api/auth/signin`: Stateless authentication & JWT issuance.
   - `GET /api/auth/me`: Authenticated user profile context.
   - `POST /api/auth/signout`: Session termination acknowledgment.
   - `POST /api/auth/verify-email`: 4-digit OTP email verification.
   - `POST /api/auth/forget-passwd`: 5-digit recovery OTP request (anti-enumeration protected).
   - `POST /api/auth/verify-otp`: 5-digit OTP validation without consumption.
   - `POST /api/auth/reset-passwd`: Consumes OTP and sets new password.
   - `POST /api/auth/update-password`: Authenticated password change.

---

### Unit 04 (`04-user-profile-s3-upload.md`)
1. **Dependencies**:
   - Added AWS SDK v3: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.
2. **Environment & Configuration**:
   - Extended [`src/config/env.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/config/env.js) and [`.env.example`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/.env.example) to support `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_S3_BUCKET`.
3. **Data Model Updates**:
   - Updated [`src/models/User.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/User.model.js) to support `github` link in `socialLinksSchema` and guarantee consistent JSON virtuals output.
4. **AWS S3 Utility & Dev Fallback**:
   - Created [`src/utils/s3.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/utils/s3.js): Validates target folder prefixes (`avatars`, `courses`, `certifications`, `resources`), constructs standardized keys (`<folder>/<timestamp>-<uuid>_<sanitized_filename>`), sets 15-minute expiration (`expiresIn: 900`), and automatically falls back to simulated dev presigned URLs when AWS credentials are absent.
5. **Upload Controller & Routes**:
   - Implemented `POST /api/upload/presigned-url` and `PUT /api/upload/mock-put/*path` in [`src/controllers/upload.controller.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/controllers/upload.controller.js) and [`src/routes/upload.routes.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/routes/upload.routes.js).
   - Mounted upload routes under `/api/upload` in [`src/app.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/app.js).
6. **User Profile Controller Refinements**:
   - Updated `PUT /api/auth/update-profile` in [`src/controllers/auth.controller.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/controllers/auth.controller.js):
     - Validates username uniqueness and returns exact error envelope `400 {"error": "Username is already taken"}`.
     - Performs non-destructive partial updates on nested objects (`socialLinks`, `notificationPreferences`).
7. **Interactive API Documentation Portal Sync**:
   - Updated [`src/views/docs.html`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/views/docs.html) to render documentation blocks, request payload schema tables, and interactive response cards for both `PUT /api/auth/update-profile` and `POST /api/upload/presigned-url`.

---

### Unit 05 (`05-course-taxonomy-category-management.md`) [COMPLETED & VERIFIED]
1. **Data Models**:
   - [`src/models/Category.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/Category.model.js): Hierarchical schema supporting `name`, `slug`, `icon`, `order`, and nested `subCategories` (`name`, `slug`, `topics`). Automatic slugification middleware on validate hook.
2. **Controllers & Routes**:
   - [`src/controllers/category.controller.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/controllers/category.controller.js) & [`src/routes/category.routes.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/routes/category.routes.js):
     - `GET /api/categories`: Public retrieval of full category taxonomy sorted by `order` ascending, then `name` ascending.
     - `POST /api/admin/categories`: Admin-restricted creation of category documents with duplicate name checks and auto slug generation.
     - `PUT /api/admin/categories/:id`: Admin-restricted update of category fields with collision prevention and slug recalculation.
     - `DELETE /api/admin/categories/:id`: Admin-restricted deletion with active course dependency safeguard.
3. **Role Guard Middleware**:
   - [`src/middlewares/role.middleware.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/middlewares/role.middleware.js): Updated to support `roleMiddleware` alias and deliver exact `403 {"error": "Access denied. Admin role required"}` response for admin routes.
4. **Interactive API Documentation Portal Sync**:
   - Updated [`src/views/docs.html`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/views/docs.html) to render Section 5 ("Course Taxonomy & Category Management"), navigation links, TOC anchors, parameter tables, and request/response cards for `GET /api/categories`, `POST /api/admin/categories`, `PUT /api/admin/categories/:id`, and `DELETE /api/admin/categories/:id`.

---

### Unit 06 (`06-course-catalog-public-discovery.md`) [COMPLETED & VERIFIED]
1. **Data Models**:
   - [`src/models/Course.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/Course.model.js): Schema for `Course` including `lessonSchema`, `quizQuestionSchema`, `quizSchema`, `moduleSchema`, and full-text search indexes (`title`, `subtitle`, `description`, `topic`, `skills`).
2. **Middlewares**:
   - [`src/middlewares/optionalAuth.middleware.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/middlewares/optionalAuth.middleware.js): Optional JWT authentication middleware extracting `req.user` without rejecting unauthenticated callers.
3. **Controllers & Routes**:
   - [`src/controllers/course.controller.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/controllers/course.controller.js) & [`src/routes/course.routes.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/routes/course.routes.js):
     - `GET /api/courses`: Public course catalog listing with full-text search (`$text`), category/subCategory regex filters, courseType & level enum filters, price range filter, sorting (`newest`, `popular`, `price-asc`, `price-desc`, `rating`), and pagination.
     - `GET /api/courses/:slugOrId`: Public single course view by MongoDB `_id` or `slug` with Rule 3 content protection shield (`videoUrl` redacted for non-preview lessons unless enrolled/tutor/admin; `correctOptionIndex` stripped from quiz questions for non-tutors/admins).
4. **Interactive API Documentation Portal Sync**:
   - Updated [`src/views/docs.html`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/views/docs.html) to render Section 6 ("Course Catalog & Public Discovery"), navigation links, TOC anchors, parameter tables, content shield badges, and request/response cards for `GET /api/courses` and `GET /api/courses/:slugOrId`.

---

## Verification Results Checklist (100% Passed)

- [x] `GET /`: Returns HTML API documentation portal conforming to `ui-context.md`.
- [x] `GET /api/unknown-endpoint`: Returns `404 {"error": "Route not found"}`.
- [x] `POST /api/auth/signup (validation)`: Returns `400 {"error": "First name, email, and password are required"}`.
- [x] `POST /api/auth/signup (student)`: Returns `201 Created` with `user` object retaining `_id` and stripping `password`.
- [x] `POST /api/auth/signup (duplicate)`: Returns `409 Conflict {"error": "User with this email or username already exists"}`.
- [x] `POST /api/auth/signup (instructor)`: Sets `approvalStatus: "pending"`, generates 4-digit verification OTP, dispatches email.
- [x] `POST /api/auth/verify-email (invalid)`: Returns `400 {"error": "Invalid or expired OTP code"}`.
- [x] `POST /api/auth/verify-email (valid)`: Returns `200 {"message": "Email verified successfully"}` and marks `isVerified: true`.
- [x] `POST /api/auth/signin (invalid)`: Returns `401 {"error": "Invalid email or password"}`.
- [x] `POST /api/auth/signin (valid)`: Returns `200` with JWT Bearer token and sanitized user profile.
- [x] `GET /api/auth/me (unauthenticated)`: Returns `401 {"error": "Authentication token missing or malformed"}`.
- [x] `GET /api/auth/me (authenticated)`: Returns `200` with populated user document (`_id` preserved).
- [x] `POST /api/auth/forget-passwd`: Returns `200 {"message": "Password reset OTP dispatched to email"}` with anti-enumeration protection.
- [x] `POST /api/auth/verify-otp`: Returns `200 {"valid": true, "message": "OTP is valid"}` without consuming code.
- [x] `POST /api/auth/reset-passwd`: Consumes OTP and resets password.
- [x] `POST /api/auth/update-password`: Verifies current password and updates to new password.
- [x] `POST /api/auth/signout`: Returns `200 {"message": "Successfully signed out"}`.
- [x] `POST /api/upload/presigned-url (unauthenticated)`: Returns `401 {"error": "Authentication token missing or malformed"}`.
- [x] `POST /api/upload/presigned-url (missing body)`: Returns `400 {"error": "Filename and fileType are required"}`.
- [x] `POST /api/upload/presigned-url (valid request)`: Returns `200` containing `uploadUrl`, `fileUrl`, `key`, and `expiresIn: 900`.
- [x] `PUT /api/auth/update-profile (duplicate username)`: Returns `400 {"error": "Username is already taken"}`.
- [x] `PUT /api/auth/update-profile (successful update)`: Returns `200` with updated user profile retaining `_id`.
- [x] `GET /api/categories (public read)`: Returns `200 OK` with full category taxonomy array.
- [x] `POST /api/admin/categories (unauthenticated)`: Returns `401 {"error": "Authentication token missing or malformed"}`.
- [x] `POST /api/admin/categories (non-admin student)`: Returns `403 {"error": "Access denied. Admin role required"}`.
- [x] `POST /api/admin/categories (missing name)`: Returns `400 {"error": "Category name is required"}`.
- [x] `POST /api/admin/categories (valid creation)`: Returns `201 Created` with category object and auto-slugified subcategories.
- [x] `POST /api/admin/categories (duplicate name)`: Returns `409 Conflict {"error": "Category with this name already exists"}`.
- [x] `PUT /api/admin/categories/:id (valid update)`: Returns `200 OK` with updated fields and re-slugified name.
- [x] `DELETE /api/admin/categories/:id (course dependency safeguard)`: Returns `409 Conflict {"error": "Cannot delete category currently associated with active courses"}`.
- [x] `DELETE /api/admin/categories/:id (unreferenced deletion)`: Returns `200 OK {"message": "Category deleted successfully"}`.
- [x] `GET /api/courses (public read)`: Returns 200 OK with published courses and pagination metadata.
- [x] `GET /api/courses (filters & search)`: Filters courses by search, category, courseType, level, minPrice/maxPrice, and sort.
- [x] `GET /api/courses/:slugOrId (content shield)`: Redacts video URLs for non-free preview lessons and strips quiz answers for un-enrolled callers.
- [x] `GET /api/courses/:slugOrId (not found)`: Returns 404 {"error": "Course not found"}.
- [x] `POST /api/tutor/showcase-expertise (unauthenticated)`: Returns `401 {"error": "Authentication token missing or malformed"}`.
- [x] `POST /api/tutor/showcase-expertise (validation)`: Returns `400 {"error": "Area of expertise and expertise bio are required"}`.
- [x] `POST /api/tutor/showcase-expertise (valid)`: Updates profile, sets `approvalStatus: "pending"`, upgrades student role to `instructor`, returns `200 OK` with updated user object retaining `_id`.
- [x] `GET /api/tutor/dashboard-stats (student)`: Returns `403 {"error": "Access denied. Instructor role required"}`.
- [x] `GET /api/tutor/dashboard-stats (instructor)`: Returns `200 OK` with `totalCourses`, `publishedCourses`, `pendingCourses`, `draftCourses`, `totalStudents`, `averageRating`, and `totalRevenue`.
- [x] `GET /api/tutor/earnings (student)`: Returns `403 {"error": "Access denied. Instructor role required"}`.
- [x] `GET /api/tutor/earnings (instructor)`: Returns `200 OK` with `totalEarnings`, `withdrawableBalance`, `pendingBalance`, `monthlyBreakdown`, and `recentTransactions`.
- [x] `GET / (API docs portal sync)`: Verified HTML portal contains sections for `showcase-expertise`, `dashboard-stats`, `earnings`, and course authoring wizard.
- [x] `POST /api/tutor/courses (draft creation)`: Creates step 1 draft course with auto-slug generation (`201 Created`). Validates required fields (`400 Bad Request`).
- [x] `PUT /api/tutor/courses/:id (incremental updates)`: Incrementally updates steps 2-4 content for draft/rejected courses (`200 OK`). Restricts edits on pending/published courses (`400 Bad Request`).
- [x] `GET /api/tutor/courses (instructor directory)`: Returns list of instructor's owned courses across all status lifecycles (`200 OK`).
- [x] `GET /api/tutor/courses/:id (unshielded author preview)`: Returns full unshielded draft preview including video URLs and quiz answers for course owner (`200 OK`). Restricts non-owners (`403 Forbidden`).
- [x] `POST /api/tutor/courses/:id/submit (review submission)`: Validates 5-step completeness before transitioning status to `pending` (`200 OK`). Rejects incomplete courses (`400 Bad Request`).
- [x] `POST /api/tutor/courses/:id/appeal (rejection appeal)`: Submits rejection appeal creating `Appeal` document for `rejected` courses (`201 Created`). Rejects appeals on non-rejected courses (`400 Bad Request`).

- [x] `GET /api/admin/dashboard-stats`, `GET /api/admin/recent-registrations`, `GET /api/admin/recent-transactions`, `GET /api/admin/users`, `DELETE /api/admin/users/:id`, `PUT /api/admin/tutors/:id/approval`, `GET /api/admin/courses/pending`, `GET /api/admin/courses/all`, `PUT /api/admin/courses/:id/status`, `GET /api/admin/appeals`, `PUT /api/admin/appeals/:id/status`, `GET /api/admin/finance`, `POST /api/admin/broadcast`: All 13 admin endpoints fully implemented, RBAC-protected (`admin` role), and synchronized with interactive docs portal.

- [x] `POST /api/enrollments/enroll/:courseId`, `POST /api/enrollments/checkout`, `GET /api/enrollments/my-courses`, `GET /api/enrollments/check/:courseId`: All 4 enrollment endpoints implemented, Paystack verification active, revenue share (70% instructor / 30% platform) calculated, idempotency enforced, and synchronized with interactive docs portal.

- [x] `POST /api/webhooks/paystack`: HMAC-SHA512 signature verified against raw payload, idempotent transaction reference check, 70/30 instructor/platform revenue split calculated, active enrollment created, course `enrolledCount` incremented, student notification created, and synchronized with interactive docs portal.

- [x] `POST /api/learning/:courseId/progress`, `POST /api/learning/:courseId/quiz/:quizId/submit`, `GET /api/learning/:courseId/questions`, `POST /api/learning/:courseId/questions`, `POST /api/learning/:courseId/questions/:questionId/reply`, `GET /api/learning/:courseId/notes`, `POST /api/learning/:courseId/notes`, `DELETE /api/learning/:courseId/notes/:noteId`, `GET /api/learning/:courseId/announcements`, `POST /api/learning/:courseId/announcements`, `GET /api/learning/:courseId/certificate`, `GET /api/learning/verify-certificate/:certificateId`: All 12 learning engine endpoints fully implemented, enrollment-guarded, server-side quiz answers shielded (Rule 3), progress & 100% completion auto-tracked, verifiable completion certificates issued, and synchronized with interactive docs portal.

- [x] `GET /`: Interactive API documentation portal served at `GET /` (`src/views/docs.html`) via `src/controllers/docs.controller.js`. Includes `#apiSearchInput` filter, `#globalJwtToken` persistence in `localStorage`, 5 Architectural Invariants banner, and dynamic "Try It Out" live HTTP sandbox drawers across all 43 REST endpoints.

- [x] `npm run seed` & `npm run test:smoke`: Database seeding engine and automated E2E system smoke test suite fully implemented, enforcing 100% compliance across all 5 architectural invariants and 7 end-to-end user flows.

---

### Unit 16 (`16-frontend-integration-gap-remediation.md`) [COMPLETED & VERIFIED]
1. **Data Models & Schema Updates**:
   - [`src/models/Review.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/Review.model.js): Implemented Course Review & Ratings engine with compound unique index `{ course: 1, student: 1 }`, `tutorReply` subdocument, and static method `recalculateCourseRating(courseId)` that keeps course average rating and count strictly updated.
   - [`src/models/PlatformSettings.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/PlatformSettings.model.js): Singleton configuration model with `getOrCreateSettings()` holding platform-wide toggles and defaults.
   - [`src/models/User.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/User.model.js): Added `experienceProofs`, `avatar`, and fully symmetric dual-key aliases in `toJSON`/`toObject` (`isVerified`/`isEmailVerified`, `bio`/`biography`/`expertiseBio`, `socials`/`socialLinks`, `avatar`/`avatarUrl`).
   - [`src/models/Category.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/Category.model.js): Added `imageUrl` field.
   - [`src/models/Course.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/Course.model.js): Added `ratingsCount` field and synchronized with `rating.count` in `toJSON`.
2. **Configuration & Security**:
   - [`src/config/env.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/config/env.js) & [`src/app.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/app.js): Multi-origin CORS support parsing comma-separated origins in `FRONTEND_ORIGIN` with origin callback.
3. **Missing Workflows & REST Endpoints (12 new endpoints)**:
   - `POST /api/auth/refresh`: Stateless JWT token refresh returning `{ token, user }`.
   - `GET /api/admin/users/:id`: Full user profile detail including experience proofs and credential links.
   - `GET /api/admin/courses/:id`: Full unshielded course details for admin moderation.
   - `GET /api/admin/courses/pending`: Populated category object (`{ _id, name, slug, icon, imageUrl }`).
   - `GET /api/admin/settings`: Fetch singleton platform settings.
   - `PUT /api/admin/settings`: Update singleton platform settings.
   - `GET /api/tutor/search-instructors`: Search approved instructors by name or email with regex.
   - `POST /api/courses/:id/reviews`: Student review creation (enrolled students only, 1-5 rating, automatic course rating recalculation).
   - `GET /api/courses/:id/reviews`: Public paginated course reviews listing.
   - `GET /api/tutor/reviews`: Instructor course reviews listing with student details.
   - `POST /api/tutor/reviews/:id/reply`: Tutor response to review with student notification.
   - `GET /api/admin/reviews`: Admin review listing with moderation filters.
   - `DELETE /api/admin/reviews/:id`: Admin review deletion with course rating recalculation.
4. **Seed Engine & E2E Smoke Suite**:
   - [`src/seed.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/seed.js): Added reviews, platform settings, pending course fixtures, and instructor proofs across 10 collections.
   - [`scripts/test-e2e-smoke.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/scripts/test-e2e-smoke.js): Added `FLOW 8` covering all new Unit 16 endpoints. 13 suites, 47 assertions passing 100%.
5. **Interactive API Documentation Portal Sync**:
   - [`src/views/docs.html`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/views/docs.html): Added endpoint cards, parameter schemas, sidebar navigation pills, and right-hand TOC anchors for all Unit 16 endpoints (55 REST endpoints total).

---

### Unit 17 (`17-infrastructure-partner-applications.md`) [COMPLETED & VERIFIED]
1. **Data Models & Schemas**:
   - [`src/models/InstitutionApplication.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/InstitutionApplication.model.js): Implemented partnership application model with compound unique index on `{ "representative.email": 1, status: 1 }` preventing duplicate pending submissions, auto-generating reference IDs (`GLX-YYYY-XXXX`), and supporting document manifests.
   - [`src/models/ReviewEvent.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/ReviewEvent.model.js): Immutable audit log model recording reviewer status changes, notes, plan updates, approvals, rejections, information inquiries, and token resends.
   - [`src/models/Institution.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/Institution.model.js): Core tenant workspace model holding `pending_activation` status, cryptographic hash of single-use 7-day activation token (`activationToken`), 7-day expiration timestamp, and onboarding progress states.
2. **Infrastructure & Uploads**:
   - [`src/app.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/app.js): Decoupled `/api/health` into `/api/health/liveness` (process uptime) and `/api/health/readiness` (MongoDB Atlas connectivity + S3 storage probe).
   - [`src/utils/s3.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/utils/s3.js): Expanded folder prefixes (`logos`, `signatures`, `documents`, `submissions`, `certificates`); enforced private folder key isolation (returning `key` only without public `fileUrl` for private folders); implemented `generateSignedGetUrl(key, expiresIn = 300)` for 5-minute signed GET URLs; implemented S3 multipart helpers (`createMultipartUpload`, `getPresignedPartUrl`, `completeMultipartUpload`, `abortMultipartUpload`).
   - [`src/controllers/upload.controller.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/controllers/upload.controller.js) & [`src/routes/upload.routes.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/routes/upload.routes.js): Mounted `GET /api/upload/signed-url` and multipart endpoints under `/api/upload/multipart/*`. Allowed public presigned URL generation for partner application documents.
   - [`src/middlewares/error.middleware.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/middlewares/error.middleware.js): Enhanced error handler to support `{ error, code, fields }` payload envelopes while preserving strict `{ error }` backward compatibility for existing simple error callers.
3. **Public Partner Applications**:
   - [`src/controllers/institution.controller.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/controllers/institution.controller.js) & [`src/routes/institution.routes.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/routes/institution.routes.js):
     - `POST /api/institutions/applications`: Public submission with rate limiting, input validation returning `{ error, code, fields }`, duplicate pending email check returning `409 DUPLICATE_APPLICATION`, reference ID generator, and confirmation email dispatch.
     - `GET /api/institutions/applications/:referenceId`: Public safe tracking endpoint returning status metadata without sensitive representative data.
     - `GET /api/institutions/plans`: Canonical pricing catalogue ($249/mo Premium, $599/mo Enterprise, 20% annual discount).
4. **Gloxad Staff Reviewer Portal & Partner Analytics**:
   - [`src/controllers/reviewer.controller.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/controllers/reviewer.controller.js) & [`src/routes/admin.routes.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/routes/admin.routes.js):
     - `GET /api/admin/institution-applications`: Searchable, filterable, paginated applications table.
     - `GET /api/admin/institution-applications/:id`: Review drawer context with documents (signed preview URLs) and audit history.
     - `PUT /api/admin/institution-applications/:id`: Updates status, plan, internal notes and creates `ReviewEvent`.
     - `POST /api/admin/institution-applications/:id/approve`: Idempotent approval creating `Institution` (`pending_activation`), issuing single-use 7-day hashed activation token, sending activation email, preventing duplicate approvals (`409 ALREADY_APPROVED`).
     - `POST /api/admin/institution-applications/:id/reject`: Transitions status to `rejected`, records reason in `ReviewEvent`, dispatches rejection email.
     - `POST /api/admin/institution-applications/:id/request-info`: Sets status to `under_review`, records question in `ReviewEvent`, dispatches inquiry email.
     - `POST /api/admin/institution-applications/:id/resend-invite`: Regenerates and resends single-use 7-day activation link for approved applications (409 if not approved).
     - `GET /api/admin/institution-applications/:id/documents/:docId/download`: Emits 5-minute signed GET URL for document key and logs download event.
     - `GET /api/admin/partners/overview`: Computed dashboard KPIs (total institutions, active students, revenue, 30-day time series).
     - `GET /api/admin/partners/summary`: Active institutions, pending approvals, approval success rates.
     - `GET /api/admin/partners/geo`: Country-level application breakdown with latitude/longitude coordinates.
     - `GET /api/admin/partners/growth`: Monthly partner onboarding progression for the last 7 months.
5. **Transactional Email Templates**:
   - [`src/utils/email.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/utils/email.js): Added `sendPartnerApplicationConfirmationEmail`, `sendPartnerActivationEmail`, `sendPartnerRejectionEmail`, and `sendPartnerRequestInfoEmail`.
6. **Seed Engine & E2E Smoke Tests**:
   - [`src/seed.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/seed.js): Seeded applications (`pending`, `under_review`, `approved`, `rejected`), pre-seeded `Institution` record, and `ReviewEvent` audit logs across 13 collections.
   - [`scripts/test-e2e-smoke.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/scripts/test-e2e-smoke.js): Added `FLOW 9` testing all 15 Phase 1 endpoints. 14 suites, 73 assertions passing 100%.
7. **Interactive API Documentation Portal Sync**:
   - [`src/views/docs.html`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/views/docs.html): Added Section 13 ("Institution Partner & Staff Reviewer Portal"), left sidebar navigation links, right-hand TOC anchors, and dynamic "Try It Out" live sandbox drawers for all 15 new endpoints (70 REST endpoints total).

---

## Completed in Milestone 14

### Unit 18: Institution Onboarding, Workspace Management & Multi-Currency Billing (`18-institution-onboarding-workspace-billing.md`)
1. **Multi-Tenant Data Architecture & Schemas**:
   - [`src/models/Department.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/Department.model.js): Compound unique index `{ institutionId: 1, code: 1 }`, academic metadata (`name`, `code`, `faculty`, `headName`, `description`, `status`).
   - [`src/models/InstitutionMember.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/InstitutionMember.model.js): Scoped unique email `{ institutionId: 1, email: 1 }`, roles (`tutor`, `student`), department references, invite lifecycle tracking (`pending`, `accepted`, `revoked`, `lastInviteSentAt`).
   - [`src/models/Subscription.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/Subscription.model.js): Tiered subscriptions (`plan: Premium | Enterprise`, `billing: monthly | annual`, `currency: USD | NGN`), Paystack plan/customer/subscription codes, and historical invoices subdocument.
   - [`src/models/User.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/User.model.js): Added `"institution_admin"` to role enum and `institutionId` ObjectId reference field.
2. **Tenant Security & Guard Infrastructure**:
   - [`src/middlewares/institution.middleware.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/middlewares/institution.middleware.js): Created `institutionContext` middleware resolving authenticated admin workspace, enforcing tenant status (`pending_activation`, `onboarding`, `active`, `suspended`), and scoping queries strictly to `req.institutionId`.
   - [`src/middlewares/role.middleware.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/middlewares/role.middleware.js): Added explicit 403 authorization guard for `institution_admin`.
   - [`src/middlewares/rateLimiter.middleware.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/middlewares/rateLimiter.middleware.js): Configured `memberInviteLimiter` and optimized test/development ceiling to allow seamless automated verification without tripping false positive IP limits.
3. **Workspace Activation & 6-Step Onboarding Wizard**:
   - [`src/controllers/activation.controller.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/controllers/activation.controller.js):
     - `POST /api/institutions/activate`: Validates 12+ char password, consumes single-use 7-day token (SHA-256 hashed), creates `institution_admin` user account, activates workspace to `onboarding`, and issues 7-day JWT session.
   - [`src/controllers/institutionAdmin.controller.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/controllers/institutionAdmin.controller.js):
     - `GET /api/institutions/me`: Resumes onboarding wizard state (`currentStep`, `completedSteps`), workspace configuration, and limits.
     - `PUT /api/institutions/me/branding`: Step 1 configuration verifying S3 `logos/` key isolation and updating branding colors, display name, and tagline.
4. **Multi-Tenant Departments & Member Management**:
   - [`src/controllers/department.controller.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/controllers/department.controller.js):
     - `GET /api/institutions/me/departments`: Scoped listing of departments with assigned member counts.
     - `POST /api/institutions/me/departments`: Creates department enforcing 10 department cap for Premium plan and unique code per institution.
     - `PUT /api/institutions/me/departments/:id`: Metadata updates.
     - `DELETE /api/institutions/me/departments/:id`: Deletion safeguard rejecting request (`409 DEPARTMENT_HAS_MEMBERS`) if active tutors/students belong to department.
   - [`src/controllers/member.controller.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/controllers/member.controller.js):
     - `GET /api/institutions/me/members`: Paginated, filterable roster by role (`student`, `tutor`), department, and search.
     - `POST /api/institutions/me/members`: Enforces 500 seat limit for Premium, duplicate email check (`409 DUPLICATE_MEMBER`), and dispatches branded email invite.
     - `POST /api/institutions/me/members/import`: Bulk CSV/JSON roster parser supporting flexible column aliases (`Full Name`, `Professional Email`, `Department Code`) and returning `{ imported, skipped }`.
     - `POST /api/institutions/me/members/:id/invite`: Rate-limited invite resend enforcing 30-second cooldown (`429 RATE_LIMITED`).
     - `DELETE /api/institutions/me/members/:id`: Removes member record and detaches linked user.
5. **Paystack Subscription Checkout & Webhook Reconciliation**:
   - [`src/controllers/subscription.controller.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/controllers/subscription.controller.js):
     - `POST /api/institutions/me/subscription/checkout`: Canonical pricing computation with 20% annual discount ($2,390.40/yr Premium, $5,750.40/yr Enterprise) and Paystack transaction initialization.
     - `GET /api/institutions/me/subscription`: Returns active subscription, billing schedule, and invoice history.
   - [`src/controllers/webhook.controller.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/controllers/webhook.controller.js): Extended Paystack webhook to process `charge.success` with `metadata.type === 'institution_subscription'`, upserting `Subscription`, transitioning workspace to `active`, completing Step 6, appending invoice record, and sending receipt email.
6. **Workspace Dashboard & Real-Time Analytics**:
   - [`src/controllers/institutionDashboard.controller.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/controllers/institutionDashboard.controller.js):
     - `GET /api/institutions/me/dashboard`: Aggregates real-time metrics (`totalStudents`, `totalTutors`, `activeDepartments`, `seatLimit`, `seatsOccupied`, `seatUtilizationPercentage`), workspace status, and recent activity logs.
7. **Transactional Emails**:
   - [`src/utils/email.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/utils/email.js): Added `sendInstitutionMemberInviteEmail` and `sendSubscriptionReceiptEmail`.
8. **Interactive API Documentation Portal Sync**:
   - [`src/views/docs.html`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/views/docs.html): Added Section 14 ("Institution Workspace & Billing Portal"), sidebar navigation, right-hand TOC anchors, and dynamic "Try It Out" live sandbox drawers for all 15 workspace endpoints (85 REST endpoints documented).
9. **Seed Engine & E2E Smoke Tests**:
   - [`src/seed.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/seed.js): Seeded `departments`, `institutionmembers`, `subscriptions`, active Apex Technical University workspace, pending Heritage Maritime University workspace, and expired St. Jude Institute workspace across 16 database collections.
   - [`scripts/test-e2e-smoke.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/scripts/test-e2e-smoke.js): Added `FLOW 10` covering activation, weak password rejection, token replay protection, branding S3 key verification, department limits and collision, member roster import with aliases, invite rate limiting, department deletion guards, Paystack checkout math, webhook reconciliation, and isolated tenant dashboard analytics.
   - **Verification**: 15 test suites, 97 assertions passing with 100% compliance.

---

### Unit 19 (`19-trimester-lms-core.md`) [COMPLETED & VERIFIED]
1. **Data Models**:
   - [`src/models/Trimester.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/Trimester.model.js): Schema for academic terms (`name`, `code`, `year`, `termNumber`, `startDate`, `endDate`, `status: 'upcoming' | 'active' | 'completed'`).
   - [`src/models/Cohort.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/Cohort.model.js): Multi-cohort student group model (`courseId`, `trimesterId`, `institutionId`, `studentIds`, `instructorIds`, `syllabusOverrides`, `curriculumModules`).
   - [`src/models/LmsLessonProgress.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/LmsLessonProgress.model.js): Compound-indexed (`{ cohortId: 1, userId: 1, lessonId: 1 }`) progress tracking (`isCompleted`, `watchedSeconds`, `lastPositionSeconds`, `completedAt`).
   - [`src/models/LmsQuizAttempt.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/LmsQuizAttempt.model.js): Server-authoritative timed attempts (`quizId`, `cohortId`, `userId`, `attemptNumber`, `startedAt`, `expiresAt`, `status`, `score`, `percentage`, `answers: [{ questionId, selectedOption, isCorrect, isLocked }]`).
   - [`src/models/LmsAssignment.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/LmsAssignment.model.js): Cohort assignment specification (`courseId`, `cohortId`, `title`, `instructions`, `dueDate`, `totalPoints`, `rubric`, `starterFiles`).
   - [`src/models/LmsSubmission.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/LmsSubmission.model.js): Unique student assignment submission (`{ assignmentId: 1, userId: 1 }`) with GitHub validation, `submissions/` S3 key check, late flagging (`isLate`), pre-grading resubmission, and instructor grading with rubric points.
   - [`src/models/LmsLessonComment.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/LmsLessonComment.model.js): Threaded discussion board with parent-child hierarchy (`parentId`), author roles, likes counter, and `likedBy` array.
2. **Access Control & Cohort Guards**:
   - [`src/middlewares/cohort.middleware.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/middlewares/cohort.middleware.js): Implemented `cohortGuard` resolving `cohortId` dynamically across route parameters, query strings, request bodies, or indirect object IDs (attempt, submission, assignment, comment). Enforces strict multi-cohort isolation, rejecting non-members with `403 {"error": "You are not enrolled in this cohort", "code": "COHORT_ACCESS_DENIED"}`.
3. **Controllers & Endpoints Implemented (`src/routes/lms.routes.js`)**:
   - [`src/controllers/lmsDashboard.controller.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/controllers/lmsDashboard.controller.js):
     - `GET /api/lms/me`: Returns active and enrolled cohorts, current trimester context, and user role.
     - `GET /api/lms/dashboard/student`: Progress metrics calculation (overall completion %, week progress, assignments, upcoming deadlines).
   - [`src/controllers/lmsCurriculum.controller.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/controllers/lmsCurriculum.controller.js):
     - `GET /api/lms/cohorts/:cohortId/curriculum`: Module hierarchy with lock/unlock status and per-lesson completion tags.
     - `GET /api/lms/lessons/:lessonId`: Lesson detail with 1-hour AWS S3 pre-signed video playback URL for enrolled students.
     - `PUT /api/lms/lessons/:lessonId/progress`: Heartbeat and lesson completion updater.
     - `GET /api/lms/lessons/:lessonId/comments`: Threaded comments with author roles and nested replies.
     - `POST /api/lms/lessons/:lessonId/comments`: Posts new discussion topic.
     - `POST /api/lms/comments/:id/replies`: Posts threaded reply.
     - `POST /api/lms/comments/:id/like` & `DELETE /api/lms/comments/:id/like`: Toggles upvotes.
   - [`src/controllers/lmsQuiz.controller.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/controllers/lmsQuiz.controller.js):
     - `GET /api/lms/quizzes/:quizId`: Quiz overview with correct answers shielded per Rule 3.
     - `POST /api/lms/quizzes/:quizId/attempts`: Starts 15-minute server-timed attempt (max 3 attempts).
     - `POST /api/lms/quiz-attempts/:attemptId/answers`: Instant verification and question locking (`check: true`).
     - `POST /api/lms/quiz-attempts/:attemptId/submit`: 15-second grace window, auto-grading, and best score preservation.
   - [`src/controllers/lmsAssignment.controller.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/controllers/lmsAssignment.controller.js):
     - `GET /api/lms/assignments`: Lists cohort deliverables with submission status.
     - `GET /api/lms/assignments/:id`: Detailed assignment specifications, rubric, and user submission.
     - `POST /api/lms/assignments/:id/submissions`: GitHub repository validation, `submissions/` S3 key check, late flagging, and pre-grading resubmission.
     - `GET /api/lms/instructor/grading-queue`: Instructor queue of submissions awaiting grading.
     - `PUT /api/lms/submissions/:id/grade`: Records score, rubric scores, feedback, and notifies student.
4. **Interactive API Documentation Portal Sync**:
   - [`src/views/docs.html`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/views/docs.html): Added Section 15 ("Trimester LMS Core"), sidebar navigation group, right-hand TOC anchors, and dynamic "Try It Out" live sandbox drawers for all 19 endpoints (104 REST endpoints documented).
5. **Seed Engine & E2E Smoke Tests**:
   - [`src/seed.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/seed.js): Seeded `trimesters`, `cohorts`, `lmslessonprogress`, `lmsquizattempts`, `lmsassignments`, `lmssubmissions`, and threaded `lmslessoncomments` across 23 database collections.
   - [`scripts/test-e2e-smoke.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/scripts/test-e2e-smoke.js): Added `FLOW 11` covering cohort gating, student dashboard metrics, unshielded video presigning, lesson heartbeat, comments/replies/likes, quiz server timer and instant answer check, assignment GitHub validation, instructor queue, and rubric grading.
   - **Verification**: 16 test suites, 121 assertions passing with 100% compliance.
   - **Build**: 87 files verified with zero syntax errors (`npm run build`).

---

### Unit 20 (`20-lms-live-community-certificates.md`) [COMPLETED & VERIFIED]
1. **Dependencies**:
   - `livekit-server-sdk`: LiveKit Cloud token generation (`AccessToken`, `VideoGrant`) for interactive WebRTC rooms.
   - `pdfkit`: High-fidelity vector PDF generation for verifiable course certificates.
   - `qrcode`: 2D QR code generation embedded directly in PDF certificates for public cryptographic verification.
2. **Data Models**:
   - [`src/models/LmsLiveSession.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/LmsLiveSession.model.js): Live session schedule, LiveKit room name, recording URL, and status lifecycle (`scheduled`, `active`, `ended`, `cancelled`).
   - [`src/models/LmsAttendance.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/LmsAttendance.model.js): Compound-indexed (`{ liveSessionId: 1, userId: 1 }`) attendee join/leave records with duration computation.
   - [`src/models/LmsPoll.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/LmsPoll.model.js): Interactive in-classroom polls (`question`, `options`, `votes`, `isActive`).
   - [`src/models/LmsChatMessage.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/LmsChatMessage.model.js): In-session chat messages (`content`, `isPinned`, `deletedAt`).
   - [`src/models/LmsChannel.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/LmsChannel.model.js): Cohort discussion channels (`name`, `slug`, `cohortId`, `isGeneral`, `isAnnouncementsOnly`).
   - [`src/models/LmsPost.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/LmsPost.model.js): Community posts (`channelId`, `cohortId`, `authorId`, `title`, `content`, `tags`, `isPinned`, `likesCount`, `repliesCount`, `reportCount`).
   - [`src/models/LmsReply.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/LmsReply.model.js): Threaded replies (`postId`, `authorId`, `content`, `parentReplyId`, `likesCount`, `reportCount`).
   - [`src/models/LmsCertificate.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/LmsCertificate.model.js): Verifiable certificate record (`certificateId`, `userId`, `courseId`, `cohortId`, `pdfUrl`, `qrCodeUrl`, `metadata`, `status: 'valid' | 'revoked'`).
3. **Core Utilities & Infrastructure**:
   - [`src/utils/livekit.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/utils/livekit.js): Generates LiveKit Cloud credentials with host/viewer role grants and fallback development mock tokens.
   - [`src/utils/certificate.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/utils/certificate.js): Vector PDF generator generating high-res certificates with embedded verification QR code linking to `/verify-certificate?id=...`.
   - [`src/utils/s3.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/utils/s3.js): Added `uploadBuffer` utility to support direct PDF upload to AWS S3 / mock dev uploads.
   - [`src/socket/live.handler.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/socket/live.handler.js): Real-time Socket.io `/live` namespace handling `join-session`, `leave-session`, `send-message`, `pin-message`, `create-poll`, `vote-poll`, `end-poll`, and `raise-hand`.
4. **Controllers & Endpoints Implemented (`src/routes/lms.routes.js`)**:
   - **Live Classrooms**:
     - `GET /api/lms/live-sessions`: Lists upcoming and active sessions with countdown.
     - `POST /api/lms/live-sessions`: Instructor creates new scheduled session.
     - `POST /api/lms/live-sessions/:id/join`: Returns LiveKit credentials, room name, and logs join attendance.
     - `POST /api/lms/live-sessions/:id/leave`: Records leave time and calculates attendance duration.
     - `PUT /api/lms/live-sessions/:id/status`: Instructor starts/ends/cancels session.
     - `GET /api/lms/live-sessions/:id/chat`: Retrieves message history.
     - `POST /api/lms/live-sessions/:id/polls` & `POST /api/lms/polls/:id/vote`: Poll creation and real-time voting.
     - `GET /api/lms/live-sessions/:id/attendance`: Instructor attendance report with participation %.
   - **Cohort Community**:
     - `GET /api/lms/cohorts/:cohortId/channels`: Lists cohort channels.
     - `POST /api/lms/cohorts/:cohortId/channels`: Creates discussion channel (instructor/admin).
     - `GET /api/lms/channels/:channelId/posts`: Paginated posts list with author, likes, and reply counts.
     - `POST /api/lms/channels/:channelId/posts`: Creates new community post with channel announcement guards.
     - `GET /api/lms/posts/:postId`: Post detail with top-level and nested replies.
     - `POST /api/lms/posts/:postId/replies`: Submits threaded reply.
     - `POST /api/lms/posts/:postId/like` & `POST /api/lms/replies/:replyId/like`: Toggles upvotes.
     - `DELETE /api/lms/posts/:postId`: Soft-deletes post (author or instructor/admin).
     - `POST /api/lms/posts/:postId/report`: Flags post for moderation.
   - **Verifiable Certificates**:
     - `GET /api/lms/certificates`: Student list of earned certificates.
     - `POST /api/lms/certificates/generate`: On-demand PDF certificate generation with embedded verification QR code and S3 upload.
     - `GET /api/learning/certificates/verify/:certificateId`: Public cryptographic certificate verification endpoint.
   - **Instructor Overview & Roster**:
     - `GET /api/lms/instructor/overview`: Live session KPIs, upcoming sessions, and recent community activity.
     - `GET /api/lms/instructor/cohorts/:cohortId/roster`: Student list with attendance rates, quiz averages, assignment completion %, and overall progress.
   - **Admin Platform Analytics**:
     - `GET /api/lms/admin/analytics`: Aggregate statistics on live sessions, attendance minutes, certificates issued, and community engagement.
     - `GET /api/lms/admin/certificates/recent`: Global audit feed of recently issued certificates.
5. **Interactive API Documentation Portal Sync**:
   - [`src/views/docs.html`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/views/docs.html): Added Section 16 ("LMS Live Classrooms, Community, Certificates & Analytics"), sidebar navigation pills, table of contents links, and interactive curl/JSON drawers for all 22 new endpoints (126 total documented endpoints).
6. **Seed Engine & E2E Smoke Tests**:
   - [`src/seed.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/seed.js): Seeded `lmslivesessions`, `lmsattendances`, `lmspolls`, `lmschatmessages`, `lmschannels`, `lmsposts`, `lmsreplies`, and `lmscertificates` across 30 database collections.
   - [`scripts/test-e2e-smoke.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/scripts/test-e2e-smoke.js): Added `FLOW 12` covering LiveKit token issuance, Socket.io `/live` namespace, poll creation and voting, attendance tracking, community channels, announcements-only role protection, post creation, threaded replies, likes toggling, soft deletion, moderation report, on-demand PDF certificate generation, public QR verification, instructor overview/roster analytics, and admin global analytics.
   - **Verification**: 20 test suites, 150 assertions passing with 100% compliance.
   - **Build**: 103 files verified with zero syntax errors (`npm run build`).

---

## Phase 5: Frontend Lead Requirements & Security Audit Remediation (Oct 2026) [COMPLETED & VERIFIED]

1. **Security & Production Hardening**:
   - **Paystack Webhook & Mock Bypass Restricted**: Fully removed backdoor allowing arbitrary checkout verification via references prefixed with `PAYSTACK_TEST_REF_`. Strictly gated test mock bypass behind `process.env.NODE_ENV === 'test' && process.env.ALLOW_PAYSTACK_TEST_MOCK === 'true'`.
   - **Environment Variable Validation**: `src/config/env.js` now terminates process startup if `JWT_SECRET` or `MONGODB_URI` are missing when `NODE_ENV === 'production'`.
   - **AWS S3 Bucket & Region Alignment**: Defaulted `AWS_S3_BUCKET` to active AWS account bucket `amzn-v3-buccket-gloxad-sstone` in `eu-north-1`.
   - **Expanded CORS Policy**: Added `localhost:3000`, `127.0.0.1:3000`, and official domains `https://gloxadacademy.com`, `https://www.gloxadacademy.com` to `FRONTEND_ORIGINS`.
   - **S3 Presigned URL Folder Policies & Size Enforcements**: Added `categories` folder to allowed folders; introduced strict MIME and file size policies (`avatars`: 2MB, `categories`: 2MB, `logos`: 2MB, `signatures`: 2MB, `documents`: 10MB, `submissions`: 50MB, `courses`: 500MB).
   - **Rate Limiting Hardening**: Added dedicated limiters: `tokenRefreshLimiter` (30/15min), `uploadPresignedLimiter` (50/15min), `forumPostLimiter` (20/15min), and tightened `partnerApplicationLimiter` to 5/hour per IP.
   - **Stored XSS Sanitization**: Community forum controller (`src/controllers/lmsCommunity.controller.js`) now uses HTML entity escaping on post titles, content, tags, and threaded replies.

2. **Core Taxonomy & Free Catalog Pipeline (74 Courses)**:
   - **Category Image Persistence**: `createCategory` and `updateCategory` now accept and persist `imageUrl`.
   - **Category Normalization**: Course endpoints (`getCourses`, `getCourseBySlugOrId`) now normalize `category` to always return `{ _id, name, slug }`.
   - **74 Free Catalog Courses Dataset**: Generated `src/data/gloxadCourses2026.json` featuring 74 complete courses with video lessons across the 10 official categories.
   - **Catalog Upsert Importer**: Created `scripts/import-catalogue.js` to idempotently upsert categories, platform tutor, and all 74 catalog courses. Added `npm run catalog:import`.
   - **Test Course Cleanup**: Created `scripts/clean-test-data.js` (`npm run db:clean`) to purge dummy test records ("Smoke...", "Jane Tutor") without affecting production catalog courses.
   - **Instant Free Enrollment**: `src/controllers/enrollment.controller.js` allows immediate free enrollment for any course where `price === 0` or `courseType === 'free'`.

3. **Authentication & Session Continuity**:
   - **Token Refresh Grace Window**: Implemented `verifyTokenWithGracePeriod(token, 300)` in `src/utils/jwt.js` to allow seamless refresh for tokens that expired within the last 5 minutes (300 seconds), eliminating abrupt student logout on unstable mobile connections.

4. **Institution Portal & Reviewer Drawer**:
   - **Partner Application Tracking**: `GET /api/institutions/applications/track` supports `?code=` query param verification and returns application status, name, type, and submission date.
   - **Reviewer Portal Audit Drawer**: `GET /api/admin/institution-applications` and `GET /api/admin/institution-applications/:id` return standard pagination and `lastUpdated: "Last updated by [name] on [date]"`.
   - **Bulk Member Import CSV Template**: Added `GET /api/institutions/admin/members/template` returning standard CSV headers (`email,firstName,lastName,matricNumber,cohortId,department`).

5. **LMS Live Classrooms & Dynamic Attendance**:
   - **Dynamic Attendance KPI**: Replaced hardcoded `attendance: 100` in `src/controllers/lmsDashboard.controller.js` with real computed attendance percentage (`attended sessions / (held sessions - excused sessions)`).
   - **LiveKit Cloud & Lesson Video Synergy**: Clarified distinction between LiveKit Cloud WebRTC credentials for interactive cohort classrooms (`/api/lms/live-sessions/:id/join`) and embedded YouTube/S3 video lessons for the 74 self-paced courses.

6. **LMS Certificates Engine & Social Sharing**:
   - **Certificate Revocation & Reissuance**: Added `PUT /api/lms/certificates/:id/revoke` and `PUT /api/lms/certificates/:id/reissue` (admin only) with audit logging of `revokedReason` and `revokedBy`.
   - **LinkedIn Add-to-Profile Integration**: `getMyCertificates` and public verification endpoints (`/api/lms/certificates/verify/:certificateId` and `/api/learning/verify-certificate/:certificateId`) now return structured `linkedInShare` metadata with direct LinkedIn profile deep links.

7. **Admin Platform Analytics & User Reactivation**:
   - **Dynamic Platform Health**: Replaced hardcoded `uptime: "99.98%"` in `getAdminAnalytics` with dynamic uptime calculation (`process.uptime()`), system health indicators, and memory stats.
   - **Revenue Currency**: Added `currency: "NGN"` and `revenue: { total, currency }` to `getAdminAnalytics`.
   - **Admin User Search & Filtering**: Enhanced `getUsersController` with case-insensitive search across `username` and `name`, filter by `isDeactivated` and `isActive`.
   - **Admin User Reactivation**: Added `PUT /api/admin/users/:id/reactivate`.

8. **OpenAPI 3.0 Standard**:
   - Published complete OpenAPI 3.0 specification in `src/docs/openapi.json` and mounted `GET /api/openapi.json` for automated frontend SDK generation.

9. **Frontend LMS Audit Remediation & Hardening (05 Nov 2026)**:
   - **Course Source Metadata**: Added top-level `source: { platform, creatorName, creatorAvatar, channelUrl, url }` to `Course.model.js` and course summaries.
   - **Pre-Pagination YouTube Free Filter**: Enhanced `GET /api/courses` with `platform=youtube`, `isYouTube=true`, `isFree=true`, and `excludeEnrolled=true` applied in MongoDB query strictly before pagination and count calculation.
   - **Student Dashboard Free YouTube Endpoint**: Implemented `GET /api/courses/free-youtube` returning up to 6 free YouTube courses (excluding enrolled ones for authenticated students).
   - **22-Node Learning Trail & Telemetry**: Added `learningTrail` representation (22 sequential milestone nodes) in `getCohortCurriculum`. Implemented `POST /api/lms/lessons/:lessonId/watch-event` supporting auto-completion on 90% watched or `ended` event. Added dedicated notes endpoints `GET/PUT /api/lms/lessons/:lessonId/notes` and materials `GET /api/lms/lessons/:lessonId/materials`.
   - **Assignment Revisions & Submission Timeline**: Added `POST /api/lms/assignments/:id/revisions` (maintaining immutable revision history) and `GET /api/lms/assignments/:id/history`.
   - **Coding Labs & Autosave Engine**: Created `LmsLab.model.js` and `LmsLabSubmission.model.js`. Added endpoints `GET /api/lms/cohorts/:cohortId/labs`, `GET /api/lms/labs/:labId`, `PUT /api/lms/labs/:labId/autosave`, `GET /api/lms/labs/:labId/draft`, and `POST /api/lms/labs/:labId/submit` (with `unverified: true` flag).
   - **Eight-Stage Final-Project Workflow**: Created `LmsFinalProject.model.js` supporting the 8 stages with auditable staff review history. Added endpoints `GET/POST /api/lms/cohorts/:cohortId/final-project`, `PUT .../final-project/stage`, `PUT .../final-project/review`, and `GET /api/lms/instructor/cohorts/:cohortId/final-projects`.
   - **Configurable Completion Weights & Announcements**: Added `completionWeights` and `announcements` to `Cohort.model.js`. Implemented `GET/PUT /api/lms/cohorts/:cohortId/completion-weights`, `GET/POST /api/lms/cohorts/:cohortId/announcements`, `GET /api/lms/instructor/cohorts/:cohortId/attendance-report`, and `GET /api/lms/cohorts/:cohortId/completion-report`.
   - **Quiz Answer Shielding**: Hardened `lmsQuiz.controller.js` so `POST /api/lms/quiz-attempts/:attemptId/answers` never leaks `correctOptionIndex` or explanations while the attempt is in progress. Answer keys and evaluation are revealed only upon final submission (`POST .../submit`).
   - **Live Session 10-Minute Join Window & Leave Tracking**: Enforced 10-minute pre-session join window in `POST /api/lms/live-sessions/:id/join`. Added `POST /api/lms/live-sessions/:id/leave` to persist `leftAt` and calculate attended `durationMinutes`.
   - **Community Moderation**: Added `PUT /api/lms/posts/:id/moderate` (pin, unpin, hide, unhide, lock, unlock).
   - **Certificate Progress Bug Fix**: Fixed query in `getMyCertificates` from `isCompleted: true` to `status: "completed"` and resolved course modules fallback.
   - **API Documentation Portal**: Added comprehensive endpoint cards, schemas, and sidebar navigation links to `src/views/docs.html`.
   - **Alignment Questionnaire**: Created `FRONTEND_ALIGNMENT_QUESTIONS.md` documenting decisions on 10-category taxonomy, 22-node trail, 8-stage final projects, and completion weights.

10. **Phase 2 Delivery: Academic Governance, 8-Stage Project State Machine & Grading Engine (12 Nov 2026)**:
   - **Specification**: Authored [`context/specs/22-handover-phases-2-to-5-specification.md`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/context/specs/22-handover-phases-2-to-5-specification.md) establishing all contracts for Phases 2–5, including self-hosted Judge0 on AWS EC2.
   - **Models & Schemas**:
     - Extended [`src/models/LmsFinalProject.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/LmsFinalProject.model.js) to support `pending_admin_approval`, `stageSubmissions` history, `tutorRecommendation`, and `adminSignOff`.
     - Updated [`src/models/Cohort.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/Cohort.model.js) with 7 assessment categories (`quizzes: 15`, `assignments: 15`, `practicals: 15`, `codingChallenges: 10`, `attendance: 10`, `weeklyTasks: 10`, `finalProject: 25`) and `latePolicyCaps`.
     - Created [`src/models/GradeAudit.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/GradeAudit.model.js) for immutable audit logging of manual grade overrides and weight modifications.
   - **Controllers & Endpoints Implemented**:
     - `POST /api/lms/cohorts/:cohortId/final-project/stages/:stageNumber/submit`: Validates sequential progression and rejects out-of-order submissions with `403 STAGE_LOCKED`.
     - `PUT /api/lms/final-projects/:projectId/stages/:stageNumber/review`: Tutor stage review (`approved` or `revisions_required`). Stage 8 forwards tutor recommended mark to Admin as `pending_admin_approval`.
     - `PUT /api/lms/final-projects/:projectId/admin-approve`: Administrator official final sign-off locking score and granting certificate eligibility.
     - `GET /api/lms/cohorts/:cohortId/gradebook`: Cohort student roster with weighted GPA and letter grades (A/B/C/D/F).
     - `GET /api/lms/cohorts/:cohortId/gradebook/export`: Streams official downloadable CSV gradebook.
     - `GET /api/lms/cohorts/:cohortId/my-transcript`: Student-facing itemized transcript with the 3 separate states (`learningCompletion`, `academicPerformance`, `certificateEligibility`).
     - `PUT /api/lms/cohorts/:cohortId/gradebook/override`: Manual grade adjustment with mandatory reason and `GradeAudit` entry.
     - `PUT /api/lms/cohorts/:cohortId/assessment-weights`: Admin weight update with strict 100% total validation.
     - `GET /api/lms/cohorts/:cohortId/grade-audits`: List of all cohort grade modification audits.
   - **Automated Verification**:
     - Created [`scripts/test-phase2-governance.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/scripts/test-phase2-governance.js) with 15/15 automated integration checks passing (100% success).
     - Verified build syntax across 115 files with zero errors (`npm run build`).
   - **Frontend Integration Guide for Samuel & Frontend Team**:
     - **8-Stage Progression**: Frontend UI disables Stage $N+1$ until Stage $N$ is marked `approved`. If `revisions_required`, display reviewer feedback notes and allow resubmission on that stage.
     - **Tutor vs Admin Final Sign-Off**: When student reaches Stage 8, tutor recommends a score. The UI displays *"Awaiting Administrator Sign-Off"* until Admin confirms the grade via `PUT .../admin-approve`.
     - **Three States Rendering**:
       - `learningCompletion`: boolean badge (modules/lessons completed).
       - `academicPerformance`: boolean badge (total weighted score $\ge 70\%$).
       - `certificateEligibility`: boolean badge (requires both completion + score $\ge 70\%$ + attendance $\ge 70\%$ + approved final project).
     - **Gradebook CSV Export**: Point the frontend "Export Gradebook" button directly to `GET /api/lms/cohorts/:cohortId/gradebook/export` (triggers native browser download).
     - **Interactive Docs Sync**: Added all 8 new Phase 2 endpoint cards and sidebar navigation pills to [`src/views/docs.html`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/views/docs.html).


---

## Architecture Decisions & Invariants Enforced
- **Rule 1: Uniform Error Schema**: All 4xx and 5xx responses strictly return `{ "error": "<message>" }`.
- **Rule 2: Zero File Buffering**: Direct-to-cloud file upload offloading strictly via AWS S3 PUT presigned URLs without streaming raw bytes through the API server.
- **Rule 3: Server Content Protection**: Lesson video URLs (for non-preview lessons) and quiz `correctOptionIndex` are strictly shielded server-side from non-enrolled or unauthenticated users.
- **Rule 5: Strict Identifier Standard**: Primary keys strictly retain `_id` and are never projected to `id`.
- **Stateless Auth**: JWT Bearer authorization in `Authorization: Bearer <token>` with 7-day expiration.
- **Unified Deployment**: `src/views/docs.html` is served directly by the Express app at `GET /`, guaranteeing that deploying the backend automatically deploys the updated documentation with zero manual steps.
- **Build Verification Invariant**: `npm run build` (`node scripts/build.js`) executes strict syntax validation (`node --check`) across all project files before every commit/deployment.