# GLOXAD LMS — FRONTEND TEAM QUESTIONS & SPECIFICATION ALIGNMENT

**Date:** 05 November 2026  
**From:** Backend Engineering Team  
**To:** Samuel Olusanya & Frontend Engineering Team  
**Subject:** Clarifications & Decision Points on Gloxad LMS Audit (04 Nov 2026)

---

### Hi Samuel & Frontend Team,

We have thoroughly reviewed the **Gloxad LMS App Audit** document and have already started implementing the high-priority backend changes (including top-level course `source` metadata, server-side YouTube free filtering before pagination, answer key shielding during quiz attempts, 90% watch auto-completion, 10-minute live join windows, and departure tracking).

To ensure complete alignment and avoid rework, please provide clarification on the following key questions:

---

### 1. Course Categories & 74 Free Courses Mapping
* **Current State:** The backend currently has 10 categories from the initial spec (`Software Development`, `Data Science & AI`, `Cloud & DevOps`, `Cyber Security`, `Product & UI/UX Design`, `Digital Marketing & Growth`, `Business & Entrepreneurship`, `Finance & FinTech`, `Blockchain & Web3`, `Creative Arts & Media`).
* **Audit Document:** Page 1 lists 10 categories with exact distribution counts totaling 74 courses:
  - `Software Development`: 10
  - `Design`: 10
  - `Data Science & Analytics`: 9
  - `Artificial Intelligence`: 7
  - `Cloud & Cybersecurity`: 7
  - `Marketing & Sales`: 6
  - `Business & Entrepreneurship`: 10
  - `Blockchain`: 5
  - `Foundations`: 5
  - `Test Preparation`: 5
* **Questions:**
  1. Should we migrate the official database categories in `GET /api/categories` to these exact 10 names and slugs?
  2. Is this 10-category list intended to replace the previous taxonomy completely, or should legacy category slugs remain as aliases?

---

### 2. Creator Attribution & Default Avatar
* **Current State:** All free YouTube catalog courses now have a structured `source` summary:
  ```json
  "source": {
    "platform": "youtube",
    "creatorName": "freeCodeCamp.org",
    "creatorAvatar": "https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/logos/gloxad-logo.png",
    "channelUrl": "https://www.youtube.com/@freecodecamp",
    "url": "https://www.youtube.com/watch?v=..."
  }
  ```
* **Questions:**
  1. Do you have a specific avatar URL you want us to set as the default for `freeCodeCamp.org` / YouTube creators, or is the current Gloxad default brand avatar acceptable?
  2. Should all 74 free courses be uniformly attributed to `freeCodeCamp.org`, or should courses from specific instructors (e.g. Mosh, Traversy) keep their specific channel names?

---

### 3. The 22-Node Learning Trail
* **Audit Document:** Priority 2 states: *"Represent the 22-node learning trail from the guide in student progress."*
* **Questions:**
  1. What is the exact sequence/composition of these 22 nodes? For example, is it a fixed 22-milestone structure across the 12-week trimester (e.g. 14 core lessons + 4 quizzes + 3 major assignments + 1 capstone project)?
  2. Does the frontend expect each node to have a numeric index (`nodeIndex: 1..22`) returned by the curriculum API (`/api/lms/cohorts/:cohortId/curriculum`), or does the frontend construct the trail from module order?

---

### 4. Eight-Stage Final-Project Workflow
* **Audit Document:** Priority 4 states: *"Add admin-configurable completion weights, the eight-stage final-project workflow, auditable review/approval transitions, and programme certificate issue/verification rules."*
* **Questions:**
  1. What are the exact names and order of the 8 stages? (e.g., 1. Topic Submission -> 2. Proposal Approval -> 3. Architecture Specification -> 4. Milestone 1 Check-in -> 5. Milestone 2 Check-in -> 6. Final Code Submission -> 7. Project Presentation/Defense -> 8. Final Grade & Sign-Off)?
  2. Who approves each stage (e.g., Cohort Instructor, Admin, or Automated)?
  3. Can students resubmit if a stage is rejected?

---

### 5. Completion Thresholds & Weighting Defaults
* **Audit Document:** Mentions *"admin-configurable completion weights"* and *"confirm enrolment/payment policy, completion thresholds, certificate eligibility"*.
* **Questions:**
  1. What default percentage weights should apply if the cohort admin has not customized them? For example:
     - Lessons Watched: **25%**
     - Quiz Scores: **25%**
     - Assignment Grades: **25%**
     - Live Attendance: **10%**
     - Final Project: **15%**
     - *Total = 100%*
  2. What is the minimum passing threshold to earn a Programme Certificate (e.g. overall score $\ge 70\%$ or $\ge 80\%$)?

---

### 6. Live Class Video Provider (LiveKit vs YouTube Live)
* **Current State:** The backend currently provides:
  - LiveKit WebRTC credentials generation (`POST /api/lms/live-sessions/:id/join`) supporting bidirectional camera, mic, and screen share.
  - YouTube stream embed URL support.
* **Audit Document:** Asks to *"Decide whether YouTube streaming is sufficient or add a conferencing provider for screen sharing and a whiteboard."*
* **Question:**
  - Does the frontend plan to use LiveKit WebRTC rooms directly for interactive classrooms with screen-sharing, or do you prefer an embedded YouTube Live stream with Socket.io chat and polls?

---

### 7. Coding Labs Autosave & Verification
* **Audit Document:** Mentions *"Lab content and submissions persist. Passed/total scores come from the browser and are explicitly stored as unverified; there is no server-side sandbox runner or autosave endpoint."*
* **Questions:**
  1. Do you need a dedicated autosave draft endpoint (e.g., `PUT /api/lms/labs/:id/autosave` with code payload)?
  2. For test execution, should we keep client-side test assertion reporting (with an `unverified: true` flag), or is a remote server sandbox runner (e.g., Docker / Judge0) planned for later?

---

Please let us know your preferences on these items so we can implement the exact schemas and workflows you need!
