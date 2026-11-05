import { Router } from "express";
import {
  getCourses,
  getFreeYouTubeCourses,
  getCourseBySlugOrId,
  createCourseReviewController,
  getCourseReviewsController
} from "../controllers/course.controller.js";
import { authGuard } from "../middlewares/auth.middleware.js";
import { optionalAuthMiddleware } from "../middlewares/optionalAuth.middleware.js";

const router = Router();

router.get("/courses", optionalAuthMiddleware, getCourses);
router.get("/courses/free-youtube", optionalAuthMiddleware, getFreeYouTubeCourses);
router.get("/courses/:id/reviews", optionalAuthMiddleware, getCourseReviewsController);
router.post("/courses/:id/reviews", authGuard, createCourseReviewController);
router.get("/courses/:slugOrId", optionalAuthMiddleware, getCourseBySlugOrId);

export default router;
