import { Router } from "express";
import { authGuard } from "../middlewares/auth.middleware.js";
import { roleGuard } from "../middlewares/role.middleware.js";
import { cohortGuard } from "../middlewares/cohort.middleware.js";
import { forumPostLimiter } from "../middlewares/rateLimiter.middleware.js";

// Unit 19 Controllers
import {
  getLmsMe,
  getStudentDashboard,
} from "../controllers/lmsDashboard.controller.js";
import {
  getCohortCurriculum,
  getLessonDetail,
  updateLessonProgress,
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
  getGradingQueue,
  gradeSubmission,
} from "../controllers/lmsAssignment.controller.js";

// Unit 20 Controllers
import {
  getLiveSessions,
  createLiveSession,
  updateLiveSession,
  deleteLiveSession,
  joinLiveSession,
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
} from "../controllers/lmsCommunity.controller.js";
import {
  getMyCertificates,
  getCertificatePdf,
  verifyCertificate,
  revokeCertificate,
  reissueCertificate,
} from "../controllers/lmsCertificate.controller.js";
import {
  getInstructorCohorts,
  getCohortOverview,
  getCohortRoster,
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
router.get("/instructor/grading-queue", authGuard, cohortGuard, getGradingQueue);
router.put("/submissions/:id/grade", authGuard, cohortGuard, gradeSubmission);

// ==========================================
// Unit 20: LMS Live Classrooms & WebRTC
// ==========================================
router.get("/live-sessions", authGuard, getLiveSessions);
router.post("/live-sessions", authGuard, roleGuard("instructor"), createLiveSession);
router.put("/live-sessions/:id", authGuard, roleGuard("instructor"), updateLiveSession);
router.delete("/live-sessions/:id", authGuard, roleGuard("instructor"), deleteLiveSession);
router.post("/live-sessions/:id/join", authGuard, joinLiveSession);
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

export default router;
