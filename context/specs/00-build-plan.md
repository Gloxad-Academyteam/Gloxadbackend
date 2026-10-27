# Gloxad Academy Backend API - Build Plan

> **System Build Plan**  
> **Target Path**: `context/specs/00-build-plan.md`  
> **Runtime**: Node.js v18+ (ES Modules, `"type": "module"`)  
> **Framework**: Express.js v5.x  
> **Database**: MongoDB v6+ with Mongoose ODM v9.x  
> **Base Path**: `/api`  
> **Server Port**: `3001`  

---

## Architecture & Build Strategy

This build plan decomposes the Gloxad Academy Backend API into **15 focused, sequentially executable units**. Each unit satisfies the four architectural invariants:
1. **Single Visible Result**: Every unit yields a tangible, testable API response, running service, or interactive documentation interface.
2. **Strict System Boundary**: Every unit stays confined to its domain (Auth, Media, Taxonomy, Authoring, Payments, Learning, Messaging, Admin).
3. **Just-In-Time Dependencies**: Packages and SDKs are installed only when their respective unit is actively built.
4. **Zero Orphaned Code**: Database models are implemented together with the endpoints that consume them.

---

## Master Build Sequence

| Unit # | Unit Name | System Boundary | Visible Result | Key Dependencies |
| :---: | :--- | :--- | :--- | :--- |
| **01** | Core Foundation & Error Infrastructure | Runtime & Middleware | Server starts, connects to MongoDB, returns `{ "status": "ok" }` on `GET /api/health`, and standard `{ "error": "<msg>" }` on invalid routes | `express`, `mongoose`, `dotenv`, `cors`, `helmet` |
| **02** | Authentication Core & JWT Guards | Identity & Security | `signup`, `signin`, `me`, `signout`, and `update-password` with JWT token issuance and `req.user` extraction | `jsonwebtoken`, `bcryptjs` |
| **03** | Email OTP & Password Recovery | Communication & Recovery | 4-digit OTP email verification and 5-digit password reset with TTL-indexed database records | `nodemailer`, `express-rate-limit` |
| **04** | User Profile & S3 Media Offloading | User & Cloud Storage | Profile update endpoint and AWS S3 PUT presigned URL generator with 15-minute expiration | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` |
| **05** | Category Taxonomy Management | Taxonomy & Catalog | Public category tree retrieval (`GET /api/categories`) and admin-only category CRUD | None (Core Mongoose) |
| **06** | Course Catalog & Public Discovery | Catalog & Content Shield | Public course listing with full-text search, filters, pagination, and role-protected content shielding (`videoUrl` and quiz answers hidden) | None (Core Mongoose) |
| **07** | Tutor Onboarding & Analytics | Instructor Domain | Instructor expertise showcase submission, profile status lifecycle, and instructor analytics dashboard | None (Core Mongoose) |
| **08** | 5-Step Course Authoring & Review Pipeline | Course Authoring | Draft course initialization, 5-step wizard persistence, submission for admin review, and course appeals | None (Core Mongoose) |
| **09** | Admin Moderation & Operations | Administrative Control | Tutor approvals, course publish/rejection moderation, user management, platform revenue metrics, and system broadcast notifications | None (Core Mongoose) |
| **10** | Course Enrollments & Paystack Verification | Payments & Checkout | Free course instant enrollment, server-side Paystack transaction verification, and duplicate-reference protection | Paystack API (`axios` or `fetch`) |
| **11** | Idempotent Paystack Webhook Handler | Webhooks & Idempotency | HMAC-SHA512 verified Paystack webhook endpoint processing `charge.success` events idempotently | `crypto` (Node native) |
| **12** | Learning Engine & Quiz Grading | Learning Experience | Server-side quiz evaluation, lesson progress tracking, completion certificates, and course Q&A/notes | None (Core Mongoose) |
| **13** | Real-Time Messaging & Notifications | Real-Time & WebSockets | Socket.io server integration with JWT handshake, room-based chat, typing indicators, and REST conversation endpoints | `socket.io` |
| **14** | Interactive API Documentation Portal | Developer Experience | Static HTML API documentation page served at `GET /` detailing all 35+ endpoints, payloads, and status codes | Vanilla HTML/CSS |
| **15** | Seed Data & End-to-End System Smoke Tests | Verification & QA | Comprehensive database seed script and automated smoke test suite validating all core flows and architectural invariants | Native Node test runner |
| **16** | Frontend Integration Gap Remediation | System Synchronization | 6 missing endpoints, reviews/ratings engine, dual aliases, and multi-origin CORS | None (Core Mongoose) |
| **17** | Infrastructure Unblock & Partner Applications | Infrastructure & Applications | Decoupled health checks, private S3 URLs, partner applications lifecycle, and reviewer portal | None (Core Mongoose, S3) |
| **18** | Institution Onboarding & Subscriptions | Multi-Tenant & Billing | Activation token, 6-step wizard persistence, departments, member CSV import, and Paystack subscriptions | None (Core Mongoose, Paystack) |
| **19** | Trimester LMS Core | Academic LMS Engine | Independent cohorts, curriculum progress, server-timed quizzes, assignments, and grading queue | None (Core Mongoose) |
| **20** | Live Classrooms, Community & Certificates | Live Video & Social | LiveKit WebRTC join tokens, Socket.io /live, cohort channels/posts, and QR-verifiable PDF certificates | `livekit-server-sdk`, `pdfkit`, `qrcode` |
| **21** | Frontend Lead Audit Remediation & Catalog Pipeline | Security, Taxonomy & OpenAPI | Paystack backdoor purged, S3 size caps, 74 catalog courses dataset & upsert runner, certificate revoke/reissue, LinkedIn Add-to-Profile share, and OpenAPI 3.0 spec | None (Core Mongoose) |

---

## Detailed Unit Specifications

### Unit 01: Core Foundation & Centralized Error Infrastructure
- **System Boundary**: Server Runtime, Configuration & Middleware Pipeline
- **What It Builds**:
  - Configuration loaders: `src/config/env.js` (validates `PORT`, `MONGODB_URI`, `JWT_SECRET`, `FRONTEND_ORIGIN`), `src/config/db.js` (Mongoose connection lifecycle).
  - Standard constants: `src/constants/index.js` (roles, course statuses, pagination defaults).
  - Express setup: `src/app.js` with CORS (credentials enabled), Helmet security headers, JSON body parsing with 16KB limits.
  - Server runner: `src/server.js` (or entry point `src/index.js`) initializing MongoDB connection prior to listening on port `3001`.
  - Global error middleware: `src/middlewares/error.middleware.js` intercepting all unhandled exceptions and formatting them strictly to `{ "error": "<message>" }` with standard HTTP status codes (`400`, `401`, `403`, `404`, `500`).
  - Health check endpoint: `GET /api/health` returning `{ "status": "ok", "uptime": ... }`.
- **Dependencies To Introduce**: `express@5.x`, `mongoose@9.x`, `dotenv`, `cors`, `helmet`.
- **Prerequisite Dependencies**: None.
- **Visible Result**: Running `npm run dev` boots the server on `http://localhost:3001`, logs clean MongoDB connection, responds `200 OK` on `GET /api/health`, and returns `{ "error": "Route not found" }` on undefined endpoints with HTTP 404.

---

### Unit 02: Authentication Core & JWT Access Guards
- **System Boundary**: Identity, Authentication & Role Enforcement
- **What It Builds**:
  - Mongoose schema: `src/models/User.model.js` (fields: `email`, `password`, `firstName`, `lastName`, `role`, `approvalStatus`, `isVerified`, `avatarUrl`, `bio`, `socials`, `notificationPreferences`, `createdAt`, `updatedAt`).
  - Cryptographic helpers: `src/utils/hash.js` (bcrypt salt hashing and comparison), `src/utils/jwt.js` (JWT signing and verification).
  - Middleware guards:
    - `src/middlewares/auth.middleware.js` (validates `Authorization: Bearer <token>`, extracts claims, attaches `req.user`).
    - `src/middlewares/role.middleware.js` (enforces role check: `student`, `instructor`, `admin`, returning HTTP 403 on mismatch).
  - Endpoints in `src/controllers/auth.controller.js` & `src/routes/auth.routes.js`:
    - `POST /api/auth/signup`: Validates input, hashes password, saves user, returns public user object.
    - `POST /api/auth/signin`: Validates credentials, issues signed JWT token, returns token and user profile.
    - `GET /api/auth/me`: Protected route returning authenticated caller's profile.
    - `POST /api/auth/signout`: Returns 200 acknowledging session termination.
    - `POST /api/auth/update-password`: Verifies current password and sets new hashed password.
- **Dependencies To Introduce**: `jsonwebtoken`, `bcryptjs`.
- **Prerequisite Dependencies**: Unit 01 (Foundation & Error Handling).
- **Visible Result**: A client can register a new user, sign in to receive a JWT Bearer token, and access `GET /api/auth/me` with header `Authorization: Bearer <token>`, while unauthenticated calls receive HTTP 401 `{ "error": "Authentication token missing or invalid" }`.

---

### Unit 03: Email OTP Verification & Password Recovery System
- **System Boundary**: Communications, Rate Limiting & Account Recovery
- **What It Builds**:
  - Mongoose schema: `src/models/Otp.model.js` (`email`, `code` [hashed], `type` [`email_verification` | `password_reset`], `expiresAt` with MongoDB TTL automatic expiration).
  - Mailer utility: `src/utils/email.js` using Nodemailer (or mock SMTP in development) to send 4-digit verification OTP and 5-digit password reset OTP.
  - Rate limiting middleware: `src/middlewares/rateLimiter.middleware.js` (protects auth & OTP endpoints from brute-force attempts).
  - Endpoints in `src/controllers/auth.controller.js` & `src/routes/auth.routes.js`:
    - `POST /api/auth/verify-email`: Validates 4-digit OTP, marks `user.isVerified = true`.
    - `POST /api/auth/forget-passwd`: Generates 5-digit OTP, stores hashed record, dispatches email.
    - `POST /api/auth/verify-otp`: Validates OTP code without consuming it.
    - `POST /api/auth/reset-passwd`: Validates and consumes OTP, hashes new password, updates user.
- **Dependencies To Introduce**: `nodemailer`, `express-rate-limit`.
- **Prerequisite Dependencies**: Unit 02 (Auth Core & User Model).
- **Visible Result**: Submitting `POST /api/auth/verify-email` with a valid OTP successfully marks the instructor or student account verified; requesting password recovery issues an OTP and allows resetting password.

---

### Unit 04: User Profile Management & AWS S3 Presigned Media Offloading
- **System Boundary**: Profile Customization & Direct Cloud Storage
- **What It Builds**:
  - S3 cloud storage utility: `src/utils/s3.js` using AWS SDK v3 to generate secure PUT presigned URLs with 15-minute expiration under isolated directory prefixes (`avatars/`, `courses/thumbnails/`, `courses/trailers/`, `courses/videos/`, `courses/resources/`, `certifications/`).
  - Endpoints in `src/controllers/user.controller.js`, `src/controllers/upload.controller.js`, and matching routes:
    - `PUT /api/auth/update-profile`: Updates bio, social links, avatar URL, and notification preferences.
    - `POST /api/upload/presigned-url`: Protected endpoint accepting `{ filename, fileType, folder }`, generating AWS S3 `uploadUrl` (pre-signed PUT) and canonical `fileUrl`. Ensures Rule 2 (Zero Raw File Buffering on API Server) is strictly obeyed.
- **Dependencies To Introduce**: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.
- **Prerequisite Dependencies**: Unit 02 (Auth Guard).
- **Visible Result**: An authenticated user updates their profile via `PUT /api/auth/update-profile`; calling `POST /api/upload/presigned-url` returns a short-lived S3 upload URL for direct browser-to-S3 media streaming.

---

### Unit 05: Course Taxonomy & Category Management
- **System Boundary**: Course Taxonomy & Administrative Content Catalog
- **What It Builds**:
  - Mongoose schema: `src/models/Category.model.js` (`name`, `slug`, `icon`, `subcategories`: `[{ name, slug, topics: [String] }]`).
  - Endpoints in `src/controllers/category.controller.js` & `src/routes/category.routes.js`:
    - `GET /api/categories`: Public read-only listing of all categories, subcategories, and topics.
    - `POST /api/admin/categories`: Admin-only route to create a new category.
    - `DELETE /api/admin/categories/:id`: Admin-only route to delete a category.
- **Dependencies To Introduce**: None (Uses existing Mongoose & Express).
- **Prerequisite Dependencies**: Unit 02 (AuthGuard & RoleGuard `admin`).
- **Visible Result**: Calling `GET /api/categories` returns hierarchical category data; an admin can create and delete categories, while students and instructors are rejected with HTTP 403 Forbidden.

---

### Unit 06: Course Catalog & Public Discovery (with Content Protection)
- **System Boundary**: Course Catalog & Content Protection Filter
- **What It Builds**:
  - Mongoose schema: `src/models/Course.model.js` (core fields: `title`, `subtitle`, `slug`, `category`, `subCategory`, `topic`, `language`, `level`, `courseType` [`free`, `paid`, `trimester`], `price`, `discountPrice`, `thumbnail`, `trailerVideoUrl`, `description`, `skills`, `targetAudience`, `requirements`, `modules`, `welcomeMessage`, `congratsMessage`, `status` [`draft`, `pending`, `published`, `rejected`], `instructor` ref, `enrolledCount`, `rating`).
  - Endpoints in `src/controllers/course.controller.js` & `src/routes/course.routes.js`:
    - `GET /api/courses`: Public course search and discovery supporting text search (`?search=`), category filter (`?category=`), type filter (`?courseType=free|paid`), sorting (`?sort=popular|newest|price`), and pagination (`?page=1&limit=10`). Only returns `status: "published"`.
    - `GET /api/courses/:slugOrId`: Full course view enforcing Rule 3 (Content Protection): strips lesson `videoUrl` and quiz `correctOptionIndex` for unauthenticated callers or non-enrolled students.
- **Dependencies To Introduce**: None.
- **Prerequisite Dependencies**: Unit 05 (Category Model), Unit 02 (Auth check for content protection).
- **Visible Result**: Public users can query, filter, and paginate published courses; viewing a specific course returns all curriculum outlines while keeping video URLs and quiz answers concealed from non-enrolled callers.

---

### Unit 07: Tutor Onboarding & Analytics
- **System Boundary**: Instructor Onboarding & Performance Tracking
- **What It Builds**:
  - Tutor onboarding fields on `User.model.js` (`approvalStatus` [`pending`, `approved`, `rejected`], `expertiseBio`, `experienceYears`, `certificationsUrl`).
  - Endpoints in `src/controllers/tutor.controller.js` & `src/routes/tutor.routes.js`:
    - `POST /api/tutor/showcase-expertise`: Instructor submits credentials/bio; transitions status to `approvalStatus: "pending"`.
    - `GET /api/tutor/dashboard-stats`: Returns instructor metrics (total enrolled students, active courses, average rating).
    - `GET /api/tutor/earnings`: Returns instructor revenue share balances and monthly revenue breakdown.
- **Dependencies To Introduce**: None.
- **Prerequisite Dependencies**: Unit 02 (AuthGuard, RoleGuard `instructor`), Unit 04 (S3 URL generation for credential PDFs).
- **Visible Result**: An instructor account can apply for tutor verification, view personal dashboard statistics, and inspect earnings reports.

---

### Unit 08: 5-Step Course Authoring Wizard & Review Pipeline
- **System Boundary**: Incremental Course Authoring & Review Submissions
- **What It Builds**:
  - Nested schema definitions in `Course.model.js`:
    - Step 1: Basic Info (`title`, `subtitle`, `category`, `subCategory`, `topic`, `language`, `level`, `courseType`, `price`).
    - Step 2: Advanced Info (`thumbnail`, `trailerVideoUrl`, `description`, `skills`, `targetAudience`, `requirements`).
    - Step 3: Curriculum & Lessons (`modules`: array of module objects containing `lessons` [`title`, `videoUrl`, `duration`, `isFreePreview`] and `quizzes` [`title`, `passingScore`, `questions` with options and server-side `correctOptionIndex`]).
    - Step 4: Publish Messages (`welcomeMessage`, `congratsMessage`).
    - Step 5: Final Review & Submit.
  - Mongoose schema: `src/models/Appeal.model.js` (`courseId`, `instructorId`, `message`, `status` [`pending`, `resolved`]).
  - Ownership validation: verifies `course.instructor.toString() === req.user._id.toString()`.
  - Endpoints in `src/controllers/tutor.controller.js` & `src/routes/tutor.routes.js`:
    - `POST /api/tutor/courses`: Step 1 - Creates course draft with `status: "draft"`.
    - `PUT /api/tutor/courses/:id`: Steps 2–4 - Incrementally updates draft course content.
    - `GET /api/tutor/courses`: Lists instructor's owned courses across all statuses.
    - `GET /api/tutor/courses/:id`: Returns instructor's draft course with full unmasked lesson/quiz data.
    - `POST /api/tutor/courses/:id/submit`: Validates completeness of all 5 wizard steps and transitions course status to `pending`.
    - `POST /api/tutor/courses/:id/appeal`: Submits an appeal for a rejected course.
- **Dependencies To Introduce**: None.
- **Prerequisite Dependencies**: Unit 02 (AuthGuard, RoleGuard `instructor`), Unit 06 (Course Model), Unit 07 (Tutor Status).
- **Visible Result**: An approved tutor can initialize a draft course, save each wizard step progressively, retrieve the full draft, and submit the course for administrative review.

---
  
### Unit 09: Admin Moderation, User Management & Platform Operations
- **System Boundary**: Administrative Moderation, User Lifecycle & Platform Insights
- **What It Builds**:
  - Endpoints in `src/controllers/admin.controller.js` & `src/routes/admin.routes.js`:
    - `GET /api/admin/dashboard-stats`, `GET /api/admin/recent-registrations`, `GET /api/admin/recent-transactions`: Platform health and activity.
    - `GET /api/admin/users`: Lists platform users with filtering by role and status.
    - `DELETE /api/admin/users/:id`: Soft deletion/deactivation of user accounts.
    - `PUT /api/admin/tutors/:id/approval`: Approves or rejects tutor onboarding application (`{ "status": "approved" | "rejected" }`).
    - `GET /api/admin/courses/pending`: Lists courses awaiting admin review.
    - `GET /api/admin/courses/all`: Full platform course directory.
    - `PUT /api/admin/courses/:id/status`: Moderates course (`{ "status": "published" }` or `{ "status": "rejected", "rejectionReason": "..." }`).
    - `GET /api/admin/appeals` & `PUT /api/admin/appeals/:id/status`: Lists and resolves course rejection appeals.
    - `GET /api/admin/finance`: Platform-wide gross transaction metrics and revenue breakdown.
    - `POST /api/admin/broadcast`: Creates platform notifications targeted by role (`all`, `students`, `instructors`).
- **Dependencies To Introduce**: None.
- **Prerequisite Dependencies**: Unit 02 (AuthGuard, RoleGuard `admin`), Unit 07 (Tutor Model), Unit 08 (Course & Appeal Models).
- **Visible Result**: An admin user can approve pending instructors, publish pending courses, resolve appeals, inspect platform financial summaries, and broadcast announcements.

---

### Unit 10: Course Enrollments & Paystack Payment Verification
- **System Boundary**: Commerce, Enrollments & Payment Verification
- **What It Builds**:
  - Mongoose schemas:
    - `src/models/Enrollment.model.js` (`user`, `course`, `enrolledAt`, `completedLessons`: `[ObjectId]`, `lastAccessedLesson`, `quizScores`, `progressPercentage`, `isCompleted`, `completedAt`).
    - `src/models/Transaction.model.js` (`reference`, `user`, `course`, `amount`, `currency`, `status` [`success`, `failed`, `pending`], `gatewayResponse`, `instructorShare`, `platformShare`).
  - Paystack client utility: `src/utils/paystack.js` performing server-side HTTP calls to `https://api.paystack.co/transaction/verify/:reference` using `PAYSTACK_SECRET_KEY`.
  - Rule 4 Enforcement: Mandatory server-side payment verification (verifies price matches DB course price, checks `metadata.student_id === req.user._id`, verifies uniqueness of `reference` to prevent double-crediting).
  - Endpoints in `src/controllers/enrollment.controller.js` & `src/routes/enrollment.routes.js`:
    - `POST /api/enrollments/enroll/:courseId`: Instant enrollment for free courses (`courseType === "free"`).
    - `POST /api/enrollments/checkout`: Verifies Paystack reference server-side, records `Transaction`, creates `Enrollment`, increments course enrollment counters.
    - `GET /api/enrollments/my-courses`: Returns signed-in user's active enrolled courses with real-time completion percentages.
- **Dependencies To Introduce**: Native Node `fetch` or `axios` for Paystack REST calls.
- **Prerequisite Dependencies**: Unit 02 (Auth Guard), Unit 06 (Course Model).
- **Visible Result**: Free courses allow instant enrollment; paid courses require a verified Paystack reference and prevent duplicate reference reuse, unlocking full course access.

---

### Unit 11: Idempotent Paystack Webhook Processing
- **System Boundary**: External Payment Webhooks & Cryptographic Signatures
- **What It Builds**:
  - Webhook middleware verifying `x-paystack-signature` using HMAC-SHA512 with `PAYSTACK_SECRET_KEY` against raw request buffer.
  - Endpoints in `src/controllers/webhook.controller.js` & `src/routes/webhook.routes.js`:
    - `POST /api/webhooks/paystack`: Handles asynchronous `charge.success` events directly from Paystack servers.
  - Idempotency Guarantee: Checks if transaction reference already exists; if already processed, responds HTTP 200 immediately without duplicate database writes or double accounting.
- **Dependencies To Introduce**: Node `crypto` (native).
- **Prerequisite Dependencies**: Unit 10 (Enrollment & Transaction Models).
- **Visible Result**: Sending a signed Paystack test webhook payload triggers enrollment creation; repeating the same webhook payload succeeds idempotently without duplicate records.

---

### Unit 12: Learning Engine (Progress, Server-Side Quiz Grading, Q&A, Notes, Certificate)
- **System Boundary**: Student Learning Interaction & Assessment Engine
- **What It Builds**:
  - Mongoose schemas: `src/models/QuestionNoteMisc.model.js` (handling Q&A threads, private student notes with timestamps, and course announcements).
  - Server-side quiz grading engine: compares student answers against hidden `correctOptionIndex` from `Course` schema, computes percentage score, checks `passingScore` (default 70%), records score on `Enrollment`.
  - Progress tracker: records completed lessons, updates video playback position, calculates overall course completion percentage (`completedLessons.length / totalLessons.length * 100`).
  - Certificate generation: when `progressPercentage === 100`, records `completedAt` and issues verifiable certificate metadata.
  - Endpoints in `src/controllers/learning.controller.js` & `src/routes/learning.routes.js`:
    - `GET /api/learning/:courseId/questions` & `POST /api/learning/:courseId/questions`
    - `GET /api/learning/:courseId/notes` & `POST /api/learning/:courseId/notes`
    - `GET /api/learning/:courseId/announcements`
    - `POST /api/learning/:courseId/quiz/:moduleId/submit`
    - `POST /api/learning/:courseId/progress`
    - `GET /api/learning/:courseId/certificate`
- **Dependencies To Introduce**: None.
- **Prerequisite Dependencies**: Unit 10 (Enrollment Model), Unit 06 (Course Model & Quizzes).
- **Visible Result**: Enrolled students can track video progress, submit quiz answers for instant server grading, take notes, post questions, and receive completion certificates upon finishing 100% of the lessons.

---

### Unit 13: Real-Time Messaging & In-App Notifications (REST + Socket.io)
- **System Boundary**: Real-Time Bidirectional WebSockets & In-App Communications
- **What It Builds**:
  - Mongoose schemas:
    - `src/models/Conversation.model.js` (`participants`, `lastMessage`, `courseId`, `updatedAt`).
    - `src/models/Message.model.js` (`conversationId`, `sender`, `text`, `createdAt`).
    - `src/models/Notification.model.js` (`recipient`, `title`, `message`, `type`, `read`, `link`, `createdAt`).
  - Socket.io engine: `src/socket/socket.handler.js` initialized on HTTP server with JWT handshake authentication:
    - User room: `user:<userId>` (for personal notifications).
    - Conversation room: `conv:<conversationId>` (for live chat).
    - Events: `join_user`, `join_conversation`, `leave_conversation`, `typing`, `stop_typing`, `new_message`, `new_notification`.
  - Endpoints in `src/controllers/message.controller.js`, `src/controllers/notification.controller.js`, and matching routes:
    - `GET /api/messages/conversations`: Lists user conversations.
    - `GET /api/messages/:conversationId` & `POST /api/messages/:conversationId`: Reads and posts messages (emitting `new_message` over Socket.io).
    - `POST /api/messages/conversations/new`: Creates or retrieves 1:1 conversation.
    - `GET /api/notifications` & `POST /api/notifications/mark-read`: In-app notification center.
- **Dependencies To Introduce**: `socket.io`.
- **Prerequisite Dependencies**: Unit 02 (Auth Guard), Unit 01 (HTTP Server).
- **Visible Result**: Two connected users exchange real-time chat messages via Socket.io in room `conv:<id>` while messages persist to MongoDB, and system notifications trigger real-time toasts.

---

### Unit 14: Interactive API Documentation Web Page
- **System Boundary**: Developer Experience & Frontend Integration Reference
- **What It Builds**:
  - Interactive HTML/CSS documentation template in `src/views/docs.html` served at `GET /`.
  - Adheres strictly to `code-standards.md` styling rules (Inter font, method badges: Green GET, Blue POST, Amber PUT, Red DELETE, dark code snippets `#1B1B24`, cards `#FFFFFF` with `#D9DDE8` border).
  - Documents all 35+ REST endpoints across all categories with:
    - HTTP Method & Full Endpoint Path
    - Required Headers (`Authorization: Bearer <token>`)
    - JSON Request Body Schemas
    - Expected Status Codes (`200`, `201`, `400`, `401`, `403`, `404`, `409`, `422`, `429`)
    - Response Payload Examples
  - Documents all 8 Socket.io real-time events (`join_user`, `join_conversation`, `new_message`, etc.).
- **Dependencies To Introduce**: None (Vanilla HTML & CSS).
- **Prerequisite Dependencies**: Units 01 through 13.
- **Visible Result**: Navigating to `http://localhost:3001/` in any browser displays a responsive, modern API reference table allowing frontend engineers to integrate without ambiguity.

---

### Unit 15: Seed Data & End-to-End System Smoke Tests
- **System Boundary**: System Verification, Seed Automation & Quality Assurance
- **What It Builds**:
  - Database seed script: `src/seed.js` creating initial admin account, standard categories, demo instructors, published sample courses, and student enrollments.
  - Automated smoke test runner validating all 5 Architectural Invariants:
    1. Uniform error response schema `{ "error": "<msg>" }`.
    2. Zero raw file buffering (presigned URL generation).
    3. Content protection integrity (concealed video URLs and quiz answers).
    4. Paystack server-side verification and reference idempotency.
    5. Primary key `_id` naming consistency.
- **Dependencies To Introduce**: None.
- **Prerequisite Dependencies**: Units 01 through 14.
- **Visible Result**: Running `node src/seed.js` initializes clean demo data, and running the smoke tests produces a 100% passing test report across all core flows.

---

### Unit 16: Frontend Integration Gap Remediation
- **System Boundary**: Frontend Integration Gap Remediation & System Synchronization
- **What It Builds**:
  - Implement 6 missing REST endpoints (`POST /api/auth/refresh`, `GET /api/admin/users/:id`, `GET /api/admin/courses/:id`, `GET/PUT /api/admin/settings`, `GET /api/tutor/search-instructors`, `POST /api/courses/:id/reviews`).
  - Complete Course Ratings & Review Engine (`Review` model, student review creation, public review list, tutor reply to reviews, admin review moderation/deletion).
  - Schema extensions: `imageUrl` on `Category`, `experienceProofs` on `User`, `PlatformSettings` singleton model.
  - Response field standardization & dual-key aliases (`isVerified`/`isEmailVerified`, `bio`/`biography`/`expertiseBio`, `socials`/`socialLinks`, `avatar`/`avatarUrl`).
  - Multi-Origin CORS support handling comma-separated `FRONTEND_ORIGIN` strings.
  - Interactive HTML documentation portal sync (`src/views/docs.html`) covering all 55+ REST endpoints.
- **Dependencies To Introduce**: None (Uses existing packages).
- **Prerequisite Dependencies**: Units 01 through 15.
- **Visible Result**: All 55+ endpoints operate with 100% compliance across all 5 architectural invariants and pass automated E2E smoke tests.

---

### Unit 17: Infrastructure Unblock & Partner Applications
- **System Boundary**: Infrastructure Readiness & Institution Partner Application Lifecycle
- **What It Builds**:
  - Decoupled health routes: `GET /api/health/liveness` and `GET /api/health/readiness`.
  - Extended S3 upload folders (`logos`, `signatures`, `documents`, `submissions`, `certificates`) and private signed GET URLs (`GET /api/upload/signed-url`).
  - S3 multipart upload endpoints for videos over 100MB (`POST /api/upload/multipart/*`).
  - Validation error envelope standardization (`{ error, code, fields }`).
  - Models: `InstitutionApplication`, `ReviewEvent`, `Institution` (in `pending_activation`).
  - Public submission (`POST /api/institutions/applications` with `GLX-YYYY-XXXX` reference code) and status tracking (`GET /api/institutions/applications/:referenceId`).
  - Reviewer Portal endpoints under `/api/admin/institution-applications/*` and `/api/admin/partners/*` (listing, drawer details, status update, request info, rejection, idempotent approval with 7-day single-use activation token generation, and partner metrics).
- **Dependencies To Introduce**: None (Core stack + AWS SDK v3).
- **Prerequisite Dependencies**: Units 01 through 16.
- **Visible Result**: Partner applications can be submitted, tracked, reviewed by admins, approved with single-use activation tokens, and verified via automated smoke tests.

---

### Unit 18: Institution Onboarding, Workspace Management & Subscriptions
- **System Boundary**: Multi-Tenant Workspace Activation & Recurring Billing
- **What It Builds**:
  - Activation endpoint (`POST /api/institutions/activate`) consuming 7-day token, enforcing 12+ character password, and upgrading to `institution_admin`.
  - Models: `Department`, `InstitutionMember`, `Subscription`.
  - 6-step onboarding wizard persistence: `GET /api/institutions/me` (step resumption), `PUT /api/institutions/me/branding`, `GET/POST/PUT/DELETE /api/institutions/me/departments`, `GET/POST/DELETE /api/institutions/me/members`.
  - Bulk CSV / JSON member import with alias parsing, deduplication, and 500-seat limits on Premium.
  - Paystack subscription checkout (`POST /api/institutions/me/subscription/checkout`) returning `{ reference, access_code }` and webhook reconciliation.
  - Institution dashboard metrics (`GET /api/institutions/me/dashboard`).
- **Dependencies To Introduce**: None (Core stack + Paystack HTTPS integration).
- **Prerequisite Dependencies**: Unit 17.
- **Visible Result**: Approved institutions activate their workspace, complete onboarding, import members via CSV, pay via Paystack Inline, and view tenant analytics.

---

### Unit 19: Trimester LMS Core
- **System Boundary**: Academic LMS, Multi-Cohort Navigation, Quizzes & Assignments
- **What It Builds**:
  - Dedicated `/api/lms/*` namespace and multi-cohort resolution guard (`?cohortId=` or fallback to recent active cohort).
  - Models: `Trimester`, `Cohort`, `LmsLessonProgress`, `LmsQuizAttempt`, `LmsAssignment`, `LmsSubmission`, `LmsLessonComment`.
  - Student dashboard (`GET /api/lms/dashboard/student`) and curriculum tree (`GET /api/lms/cohorts/:cohortId/curriculum`).
  - Lesson viewer (`GET /api/lms/lessons/:lessonId`), progress tracker, and threaded discussions with instructor badges.
  - Timed quizzes: `expiresAt` countdown with 15s network grace, instant answer check option, 3 retakes retaining best score.
  - Assignments: GitHub repo / S3 fileKey submissions, late work flagging, pre-grading resubmission, and instructor grading queue.
- **Dependencies To Introduce**: None (Core stack).
- **Prerequisite Dependencies**: Unit 18.
- **Visible Result**: Enrolled cohort students see dashboard progress, navigate curriculum, complete timed quizzes, submit assignments, and instructors grade submissions.

---

### Unit 20: LMS Live Classrooms, Community, Certificates & Analytics
- **System Boundary**: Real-Time Live Classes, Social Discussions, Certificates & Platform Analytics
- **What It Builds**:
  - LiveKit token generation (`POST /api/lms/live-sessions/:id/join`) compatible with `@livekit/components-react`.
  - Socket.io `/live` namespace handling live chat, hand raising, polls, participant sync, and attendance tracking.
  - Cohort community forum: auto-seeded channels ("General", "Q&A", "Project Showcase", "Study Groups"), posts feed, threaded replies, likes, and moderation.
  - Verifiable PDF certificate generation with embedded verification QR code (`pdfkit` + `qrcode`).
  - Instructor cohort overview & student roster with attendance rates (`GET /api/lms/instructor/cohorts/:id/*`).
  - Admin LMS platform analytics (`GET /api/lms/admin/analytics`).
- **Dependencies To Introduce**: `livekit-server-sdk`, `pdfkit`, `qrcode`.
- **Prerequisite Dependencies**: Unit 19.
- **Visible Result**: Scheduled classes connect live via LiveKit, community discussions are active, completed students receive verified PDF certificates with QR codes, and platform analytics display live KPIs.

### Unit 21: Frontend Lead Audit Remediation & Catalog Pipeline
- **System Boundary**: Security Hardening, Taxonomy Alignment, 74 Free Catalog Pipeline & OpenAPI 3.0
- **What It Builds**:
  - Security hardening: Paystack test reference backdoor completely removed; S3 folder policies with byte limits and MIME constraints; rate limiters on refresh, presigned uploads, and forum posts; stored XSS entity escaping.
  - Session resilience: 5-minute clock-skew grace window on JWT token refresh (`verifyTokenWithGracePeriod`).
  - Course taxonomy & 74 free catalog dataset: `src/data/gloxadCourses2026.json`, idempotent upsert runner (`npm run catalog:import`), test course cleaner (`npm run db:clean`), normalized course category `{ _id, name, slug }`, category image banner persistence, instant free enrollment bypass.
  - Partner & Reviewer Portals: Application tracking via `?code=` query param, reviewer audit drawer (`lastUpdated: "Last updated by [name] on [date]"`), bulk student member CSV template endpoint (`GET /api/institutions/admin/members/template`).
  - LMS Live & Attendance: Dynamic real attendance calculation (`attended / (held - excused)`).
  - Certificates & Social Sharing: Admin certificate revocation (`PUT /api/lms/certificates/:id/revoke`) and reissuance (`PUT /api/lms/certificates/:id/reissue`) with audit logs; LinkedIn Add-to-Profile metadata (`linkedInShare`) on all certificate verification endpoints.
  - Admin Analytics & Operations: Dynamic process monitor uptime and memory stats; `currency: "NGN"` on total revenue; admin user search by name/username and reactivation (`PUT /api/admin/users/:id/reactivate`).
  - Specifications: Complete OpenAPI 3.0 schema at `GET /api/openapi.json` and interactive HTML documentation at `GET /` and `GET /api/docs`.
- **Dependencies To Introduce**: None (Core Express & Mongoose).
- **Prerequisite Dependencies**: Unit 20.
- **Visible Result**: 100% of frontend lead audit blockers resolved, 74 courses live in catalog, zero syntax errors across 103 files, and OpenAPI 3.0 spec ready for frontend client generation.

## Invariants Checklist (Enforced on Every Unit)

1. [ ] **Uniform Error Schema**: Any failure branch returns `{ "error": "<message>" }` with appropriate status code.
2. [ ] **Identifier Standard**: All object IDs are returned as `_id` string.
3. [ ] **Media Offloading**: Media uploads use AWS S3 presigned URLs; no multipart/form-data on API server.
4. [ ] **Quiz & Content Protection**: Un-enrolled users never receive `videoUrl` or `correctOptionIndex`.
5. [ ] **Payment Verification**: Payments verified server-side with Paystack API; duplicate references rejected.
6. [ ] **Documentation Sync**: When an endpoint is built, `src/views/docs.html` is updated in sync.
