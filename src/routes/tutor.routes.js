import { Router } from "express";
import {
  showcaseExpertiseController,
  getDashboardStatsController,
  getEarningsController,
  createCourseDraft,
  updateCourseDraft,
  getInstructorCourses,
  getInstructorCourseById,
  submitCourseForReview,
  appealCourseRejection,
  searchInstructorsController,
  getTutorReviewsController,
  replyToReviewController,
} from "../controllers/tutor.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { roleMiddleware, approvedTutorGuard } from "../middlewares/role.middleware.js";

const router = Router();

// Apply authMiddleware to all tutor onboarding, analytics, and course authoring endpoints
router.use(authMiddleware);

// Onboarding & Analytics
router.post("/showcase-expertise", showcaseExpertiseController);
router.get("/dashboard-stats", roleMiddleware("instructor"), getDashboardStatsController);
router.get("/earnings", roleMiddleware("instructor"), getEarningsController);
router.get("/search-instructors", roleMiddleware("instructor"), searchInstructorsController);

// Tutor Review Management
router.get("/reviews", roleMiddleware("instructor"), getTutorReviewsController);
router.post("/reviews/:id/reply", roleMiddleware("instructor"), replyToReviewController);

// Course Authoring Wizard & Review Pipeline
router.post("/courses", roleMiddleware("instructor"), approvedTutorGuard, createCourseDraft);
router.get("/courses", roleMiddleware("instructor"), getInstructorCourses);
router.get("/courses/:id", roleMiddleware("instructor"), getInstructorCourseById);
router.put("/courses/:id", roleMiddleware("instructor"), approvedTutorGuard, updateCourseDraft);
router.post("/courses/:id/submit", roleMiddleware("instructor"), approvedTutorGuard, submitCourseForReview);
router.post("/courses/:id/appeal", roleMiddleware("instructor"), approvedTutorGuard, appealCourseRejection);

export default router;

