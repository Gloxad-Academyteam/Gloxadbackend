import express from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import { env } from "./config/env.js";
import authRouter from "./routes/auth.routes.js";
import uploadRouter from "./routes/upload.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import courseRoutes from "./routes/course.routes.js";
import tutorRoutes from "./routes/tutor.routes.js";
import adminRouter from "./routes/admin.routes.js";
import enrollmentRoutes from "./routes/enrollment.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import learningRouter from "./routes/learning.routes.js";
import messageRoutes from "./routes/message.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import institutionRoutes from "./routes/institution.routes.js";
import institutionAdminRoutes from "./routes/institutionAdmin.routes.js";
import lmsRouter from "./routes/lms.routes.js";
import providerRoutes from "./routes/provider.routes.js";
import { authGuard } from "./middlewares/auth.middleware.js";
import { roleGuard } from "./middlewares/role.middleware.js";
import { institutionContext } from "./middlewares/institution.middleware.js";
import { renderApiDocs } from "./controllers/docs.controller.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { checkS3Readiness } from "./utils/s3.js";
import { activityLogger } from "./middlewares/activity.middleware.js";
import "./models/ActivityLog.model.js";

// Ensure all Mongoose schemas are registered on startup
import "./models/User.model.js";
import "./models/Provider.model.js";
import "./models/Trimester.model.js";
import "./models/Cohort.model.js";
import "./models/Course.model.js";
import "./models/Enrollment.model.js";
import "./models/Transaction.model.js";
import "./models/Review.model.js";
import "./models/Institution.model.js";
import "./models/Department.model.js";
import "./models/InstitutionMember.model.js";
import "./models/Subscription.model.js";
import "./models/LmsLessonProgress.model.js";
import "./models/LmsQuizAttempt.model.js";
import "./models/LmsAssignment.model.js";
import "./models/LmsSubmission.model.js";
import "./models/LmsLessonComment.model.js";
import "./models/LmsLiveSession.model.js";
import "./models/LmsAttendance.model.js";
import "./models/LmsPoll.model.js";
import "./models/LmsChatMessage.model.js";
import "./models/LmsChannel.model.js";
import "./models/LmsPost.model.js";
import "./models/LmsReply.model.js";
import "./models/LmsCertificate.model.js";

const app = express();

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows inline CSS/JS in docs.html
  })
);

// Cross-Origin Resource Sharing (Multi-Origin Support)
const allowedOrigins = (env.FRONTEND_ORIGINS && env.FRONTEND_ORIGINS.length > 0)
  ? env.FRONTEND_ORIGINS
  : ["http://localhost:3000"];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);

// Coding labs carry code (up to 100000 characters), which does not fit the default 16kb body limit
const CODE_ROUTES = /^\/api\/lms\/(labs(\/|$)|cohorts\/[^/]+\/labs$)/;
const codeJson = express.json({ limit: "256kb" });
app.use((req, res, next) => (CODE_ROUTES.test(req.path) ? codeJson(req, res, next) : next()));

// Body parser middleware with 16kb limit & rawBody preservation for signature verification
app.use(
  express.json({
    limit: "16kb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "16kb" }));

// Records every sign-in, change and failure for the admin activity view
app.use(activityLogger);

// Interactive HTML API Documentation Portal
app.get("/", renderApiDocs);

// Published OpenAPI 3.0 Specification
app.get("/api/openapi.json", (req, res) => {
  res.sendFile(path.resolve("src/docs/openapi.json"));
});


// Health check endpoints
// 1. Process uptime liveness check
app.get("/api/health/liveness", (req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

// 2. Connectivity probe readiness check (Database & S3 Storage)
app.get("/api/health/readiness", async (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  const isStorageConnected = await checkS3Readiness();

  if (isDbConnected && isStorageConnected) {
    return res.status(200).json({
      status: "ready",
      database: "connected",
      storage: "connected",
    });
  }

  return res.status(503).json({
    status: "not_ready",
    database: isDbConnected ? "connected" : "disconnected",
    storage: isStorageConnected ? "connected" : "disconnected",
  });
});

// 3. Backward-compatible /api/health endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

// Mount auth routes under /api/auth
app.use("/api/auth", authRouter);

// Mount upload routes under /api/upload
app.use("/api/upload", uploadRouter);

// Mount tutor onboarding & analytics routes under /api/tutor
app.use("/api/tutor", tutorRoutes);

// Mount admin routes under /api/admin
app.use("/api/admin", adminRouter);

// Mount tenant institution workspace routes under /api/institutions/me
app.use(
  "/api/institutions/me",
  authGuard,
  roleGuard("institution_admin"),
  institutionContext,
  institutionAdminRoutes
);

// Mount institution partner applications under /api/institutions
app.use("/api/institutions", institutionRoutes);

// Mount enrollment routes under /api/enrollments
app.use("/api/enrollments", enrollmentRoutes);

// Mount webhook routes under /api/webhooks
app.use("/api/webhooks", webhookRoutes);

// Mount learning engine routes under /api/learning
app.use("/api/learning", learningRouter);

// Mount Trimester LMS Core routes under /api/lms
app.use("/api/lms", lmsRouter);

// Mount messaging routes under /api/messages
app.use("/api/messages", messageRoutes);

// Mount notification routes under /api/notifications
app.use("/api/notifications", notificationRoutes);

// Mount category taxonomy & course catalog routes under /api
app.use("/api", categoryRoutes);
app.use("/api", providerRoutes);
app.use("/api", courseRoutes);

// Global 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Centralized error handler
app.use(errorMiddleware);

export { app };
export default app;
