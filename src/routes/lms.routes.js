import { Router } from "express";
import { authGuard } from "../middlewares/auth.middleware.js";
import { roleGuard } from "../middlewares/role.middleware.js";
import { cohortGuard } from "../middlewares/cohort.middleware.js";
import { optionalAuthMiddleware } from "../middlewares/optionalAuth.middleware.js";
import { forumPostLimiter } from "../middlewares/rateLimiter.middleware.js";

// Unit 27 Controllers
import { getContinueLearning, getSupportFlags, updateSupportThresholds } from "../controllers/lmsEngagement.controller.js";

// Unit 25 Controllers
import {
  createScholarship,
  listScholarshipsAdmin,
  updateScholarship,
  listApplicationsAdmin,
  setApplicationStatus,
  getPublicScholarships,
  applyToScholarship,
  getMyApplications,
  withdrawApplication,
} from "../controllers/lmsScholarship.controller.js";

// Unit 21 Controllers
import {
  createTrimester,
  listTrimesters,
  updateTrimester,
  createCohort,
  listCohorts,
  updateCohort,
  addCohortStudent,
  removeCohortStudent,
  getPublicTrimesters,
  getPublicTrimester,
  enrolInCohort,
  listCohortEnrolments,
  setEnrolmentStatus,
  withdrawFromCohort,
  getMyEnrolments,
  previewTrimester,
  getPublicProgramme,
} from "../controllers/lmsTrimester.controller.js";

// Unit 19 Controllers
import {
  getLmsMe,
  getStudentDashboard,
} from "../controllers/lmsDashboard.controller.js";
import {
  getCohortCurriculum,
  getLessonDetail,
  updateLessonProgress,
  recordWatchEvent,
  getLessonNotes,
  saveLessonNotes,
  getLessonMaterials,
  getComments,
  createComment,
  replyComment,
  likeComment,
  unlikeComment,
} from "../controllers/lmsCurriculum.controller.js";
import {
  getQuizOverview,
  startQuizAttempt,
  answerQuestion,
  submitQuizAttempt,
} from "../controllers/lmsQuiz.controller.js";
import {
  listAssignments,
  getAssignment,
  submitAssignment,
  submitAssignmentRevision,
  getAssignmentSubmissionHistory,
  getGradingQueue,
  gradeSubmission,
} from "../controllers/lmsAssignment.controller.js";
import {
  getCohortLabs,
  getLabDetail,
  autosaveLabCode,
  getLabDraft,
  submitLab,
} from "../controllers/lmsLab.controller.js";
import {
  getStudentFinalProject,
  createFinalProject,
  advanceFinalProjectStage,
  submitStageDeliverable,
  reviewFinalProjectStage,
  adminSignOffFinalProject,
  getInstructorFinalProjects,
} from "../controllers/lmsFinalProject.controller.js";
import {
  getCohortGradebook,
  getStudentTranscript,
  exportCohortGradebookCsv,
  overrideStudentGrade,
  updateCohortAssessmentWeights,
  getCohortGradeAudits,
} from "../controllers/lmsGradebook.controller.js";

// Unit 20 Controllers
import {
  getLiveSessions,
  createLiveSession,
  updateLiveSession,
  deleteLiveSession,
  joinLiveSession,
  leaveLiveSession,
  getSessionChatHistory,
  createSessionPoll,
  votePoll,
  getSessionAttendance,
  updateSessionAttendance,
} from "../controllers/lmsLive.controller.js";
import {
  getChannels,
  getPosts,
  createPost,
  likePost,
  unlikePost,
  getPostReplies,
  createPostReply,
  deletePost,
  reportPost,
  moderatePost,
} from "../controllers/lmsCommunity.controller.js";
import {
  getMyCertificates,
  getCertificatePdf,
  verifyCertificate,
  revokeCertificate,
  issueCertificate,
  reissueCertificate,
} from "../controllers/lmsCertificate.controller.js";
import {
  getInstructorCohorts,
  getCohortOverview,
  getCohortRoster,
  getCohortWeights,
  updateCohortWeights,
  getCohortAnnouncements,
  createCohortAnnouncement,
  getCohortAttendanceReport,
  getCohortCompletionReport,
} from "../controllers/lmsInstructor.controller.js";
import {
  getAdminAnalytics,
  getRecentCertificates,
} from "../controllers/lmsAdmin.controller.js";

const router = Router();

// ==========================================
// Unit 19: Trimester LMS Core
// ==========================================

// 1. Context & Unified Dashboard
router.get("/me", authGuard, getLmsMe);
router.get("/dashboard/student", authGuard, cohortGuard, getStudentDashboard);

// 2. Curriculum & Lesson Player
router.get("/cohorts/:cohortId/curriculum", authGuard, cohortGuard, getCohortCurriculum);
router.get("/lessons/:lessonId", authGuard, cohortGuard, getLessonDetail);
router.put("/lessons/:lessonId/progress", authGuard, cohortGuard, updateLessonProgress);
router.post("/lessons/:lessonId/watch-event", authGuard, cohortGuard, recordWatchEvent);
router.get("/lessons/:lessonId/notes", authGuard, cohortGuard, getLessonNotes);
router.put("/lessons/:lessonId/notes", authGuard, cohortGuard, saveLessonNotes);
router.get("/lessons/:lessonId/materials", authGuard, cohortGuard, getLessonMaterials);

// 3. Threaded Lesson Discussions & Likes
router.get("/lessons/:lessonId/comments", authGuard, cohortGuard, getComments);
router.post("/lessons/:lessonId/comments", authGuard, cohortGuard, createComment);
router.post("/comments/:id/replies", authGuard, cohortGuard, replyComment);
router.post("/comments/:id/like", authGuard, cohortGuard, likeComment);
router.delete("/comments/:id/like", authGuard, cohortGuard, unlikeComment);

// 4. Quizzes Engine & Server Timing
router.get("/quizzes/:quizId", authGuard, cohortGuard, getQuizOverview);
router.post("/quizzes/:quizId/attempts", authGuard, cohortGuard, startQuizAttempt);
router.post("/quiz-attempts/:attemptId/answers", authGuard, cohortGuard, answerQuestion);
router.post("/quiz-attempts/:attemptId/submit", authGuard, cohortGuard, submitQuizAttempt);

// 5. Assignments & Grading Queue
router.get("/assignments", authGuard, cohortGuard, listAssignments);
router.get("/assignments/:id", authGuard, cohortGuard, getAssignment);
router.post("/assignments/:id/submissions", authGuard, cohortGuard, submitAssignment);
router.post("/assignments/:id/revisions", authGuard, cohortGuard, submitAssignmentRevision);
router.get("/assignments/:id/history", authGuard, cohortGuard, getAssignmentSubmissionHistory);
router.get("/instructor/grading-queue", authGuard, cohortGuard, getGradingQueue);
router.put("/submissions/:id/grade", authGuard, cohortGuard, gradeSubmission);

// 6. Coding Labs & Autosave Engine
router.get("/cohorts/:cohortId/labs", authGuard, cohortGuard, getCohortLabs);
router.get("/labs/:labId", authGuard, getLabDetail);
router.put("/labs/:labId/autosave", authGuard, autosaveLabCode);
router.get("/labs/:labId/draft", authGuard, getLabDraft);
router.post("/labs/:labId/submit", authGuard, submitLab);

// 7. Eight-Stage Final-Project Workflow
router.get("/cohorts/:cohortId/final-project", authGuard, cohortGuard, getStudentFinalProject);
router.post("/cohorts/:cohortId/final-project", authGuard, cohortGuard, createFinalProject);
router.put("/cohorts/:cohortId/final-project/stage", authGuard, cohortGuard, advanceFinalProjectStage);
router.post("/cohorts/:cohortId/final-project/stages/:stageNumber/submit", authGuard, cohortGuard, submitStageDeliverable);
router.put("/final-projects/:projectId/stages/:stageNumber/review", authGuard, roleGuard("instructor", "admin"), reviewFinalProjectStage);
router.put("/cohorts/:cohortId/final-project/review", authGuard, roleGuard("instructor", "admin"), reviewFinalProjectStage);
router.put("/final-projects/:projectId/admin-approve", authGuard, roleGuard("admin"), adminSignOffFinalProject);
router.get("/instructor/cohorts/:cohortId/final-projects", authGuard, roleGuard("instructor", "admin"), getInstructorFinalProjects);

// 8. Academic Gradebook, Audit Engine & Configurable Weights
router.get("/cohorts/:cohortId/gradebook", authGuard, roleGuard("instructor", "admin"), getCohortGradebook);
router.get("/cohorts/:cohortId/gradebook/export", authGuard, roleGuard("instructor", "admin"), exportCohortGradebookCsv);
router.get("/cohorts/:cohortId/my-transcript", authGuard, cohortGuard, getStudentTranscript);
router.put("/cohorts/:cohortId/gradebook/override", authGuard, roleGuard("instructor", "admin"), overrideStudentGrade);
router.put("/cohorts/:cohortId/assessment-weights", authGuard, roleGuard("admin"), updateCohortAssessmentWeights);
router.get("/cohorts/:cohortId/grade-audits", authGuard, roleGuard("instructor", "admin"), getCohortGradeAudits);
router.get("/cohorts/:cohortId/completion-weights", authGuard, getCohortWeights);
router.put("/cohorts/:cohortId/completion-weights", authGuard, roleGuard("admin", "instructor"), updateCohortWeights);
router.get("/cohorts/:cohortId/announcements", authGuard, getCohortAnnouncements);
router.post("/cohorts/:cohortId/announcements", authGuard, roleGuard("instructor"), createCohortAnnouncement);
router.get("/instructor/cohorts/:cohortId/attendance-report", authGuard, roleGuard("instructor"), getCohortAttendanceReport);
router.get("/cohorts/:cohortId/completion-report", authGuard, roleGuard("instructor"), getCohortCompletionReport);

// ==========================================
// Unit 20: LMS Live Classrooms & WebRTC
// ==========================================
router.get("/live-sessions", authGuard, getLiveSessions);
router.post("/live-sessions", authGuard, roleGuard("instructor"), createLiveSession);
router.put("/live-sessions/:id", authGuard, roleGuard("instructor"), updateLiveSession);
router.delete("/live-sessions/:id", authGuard, roleGuard("instructor"), deleteLiveSession);
router.post("/live-sessions/:id/join", authGuard, joinLiveSession);
router.post("/live-sessions/:id/leave", authGuard, leaveLiveSession);
router.get("/live-sessions/:id/chat", authGuard, getSessionChatHistory);
router.post("/live-sessions/:id/polls", authGuard, roleGuard("instructor"), createSessionPoll);
router.post("/polls/:pollId/votes", authGuard, votePoll);
router.get("/live-sessions/:id/attendance", authGuard, roleGuard("instructor"), getSessionAttendance);
router.put("/live-sessions/:id/attendance", authGuard, roleGuard("instructor"), updateSessionAttendance);

// ==========================================
// Unit 20: Community Discussion Forum
// ==========================================
router.get("/channels", authGuard, getChannels);
router.get("/posts", authGuard, getPosts);
router.post("/posts", authGuard, forumPostLimiter, createPost);
router.post("/posts/:id/like", authGuard, likePost);
router.delete("/posts/:id/like", authGuard, unlikePost);
router.get("/posts/:id/replies", authGuard, getPostReplies);
router.post("/posts/:id/replies", authGuard, forumPostLimiter, createPostReply);
router.delete("/posts/:id", authGuard, deletePost);
router.post("/posts/:id/report", authGuard, reportPost);
router.put("/posts/:id/moderate", authGuard, roleGuard("instructor"), moderatePost);

// ==========================================
// Unit 20: Certificates Engine
// ==========================================
router.get("/certificates/me", authGuard, getMyCertificates);
router.get("/certificates/:id/pdf", authGuard, getCertificatePdf);
router.get("/certificates/verify/:certificateId", verifyCertificate);
router.put("/certificates/:id/revoke", authGuard, roleGuard("admin"), revokeCertificate);
router.put("/certificates/:id/reissue", authGuard, roleGuard("admin"), reissueCertificate);

// ==========================================
// Unit 20: Instructor & Admin Analytics
// ==========================================
router.get("/instructor/cohorts", authGuard, roleGuard("instructor"), getInstructorCohorts);
router.get("/instructor/cohorts/:id/overview", authGuard, roleGuard("instructor"), getCohortOverview);
router.get("/instructor/cohorts/:id/roster", authGuard, roleGuard("instructor"), getCohortRoster);
router.get("/admin/analytics", authGuard, roleGuard("admin"), getAdminAnalytics);
router.get("/admin/certificates/recent", authGuard, roleGuard("admin"), getRecentCertificates);

// ==========================================
// Unit 21: Trimester Administration & Programme Enrolment
// ==========================================
router.get("/public/trimesters", optionalAuthMiddleware, getPublicTrimesters);
router.get("/public/trimesters/:id", optionalAuthMiddleware, getPublicTrimester);
router.get("/public/programmes/:cohortId", optionalAuthMiddleware, getPublicProgramme);
router.post("/cohorts/:cohortId/enrol", authGuard, enrolInCohort);

router.put("/cohorts/:cohortId/withdraw", authGuard, withdrawFromCohort);
router.get("/enrolments/me", authGuard, getMyEnrolments);
router.get("/admin/trimesters/:id/preview", authGuard, roleGuard("admin"), previewTrimester);
router.get("/admin/cohorts/:id/enrolments", authGuard, roleGuard("admin"), listCohortEnrolments);
router.put("/admin/cohorts/:id/enrolments/:userId/status", authGuard, roleGuard("admin"), setEnrolmentStatus);

router.post("/admin/trimesters", authGuard, roleGuard("admin"), createTrimester);
router.get("/admin/trimesters", authGuard, roleGuard("admin"), listTrimesters);
router.put("/admin/trimesters/:id", authGuard, roleGuard("admin"), updateTrimester);
router.post("/admin/cohorts", authGuard, roleGuard("admin"), createCohort);
router.get("/admin/cohorts", authGuard, roleGuard("admin"), listCohorts);
router.put("/admin/cohorts/:id", authGuard, roleGuard("admin"), updateCohort);
router.post("/admin/cohorts/:id/students", authGuard, roleGuard("admin"), addCohortStudent);
router.delete("/admin/cohorts/:id/students/:userId", authGuard, roleGuard("admin"), removeCohortStudent);

// ==========================================
// Unit 25: Scholarships
// ==========================================
router.get("/public/scholarships", optionalAuthMiddleware, getPublicScholarships);
router.post("/scholarships/:id/applications", authGuard, applyToScholarship);
router.get("/scholarships/applications/me", authGuard, getMyApplications);
router.put("/scholarship-applications/:id/withdraw", authGuard, withdrawApplication);

router.post("/admin/scholarships", authGuard, roleGuard("admin"), createScholarship);
router.get("/admin/scholarships", authGuard, roleGuard("admin"), listScholarshipsAdmin);
router.put("/admin/scholarships/:id", authGuard, roleGuard("admin"), updateScholarship);
router.get("/admin/scholarships/:id/applications", authGuard, roleGuard("admin"), listApplicationsAdmin);
router.put("/admin/scholarship-applications/:id/status", authGuard, roleGuard("admin"), setApplicationStatus);

// ==========================================
// Unit 27: Engagement, support flags and certificate issuing
// ==========================================
router.get("/continue-learning", authGuard, cohortGuard, getContinueLearning);
router.get("/instructor/cohorts/:cohortId/support-flags", authGuard, roleGuard("instructor"), getSupportFlags);
router.put("/admin/cohorts/:id/support-thresholds", authGuard, roleGuard("admin"), updateSupportThresholds);
router.post("/admin/cohorts/:cohortId/certificates", authGuard, roleGuard("admin"), issueCertificate);

export default router;
