import { Router } from "express";
import {
  getPresignedUrl,
  getSignedUrlController,
  initiateMultipartController,
  presignPartController,
  completeMultipartController,
  abortMultipartController,
  mockUpload,
  mockGet,
} from "../controllers/upload.controller.js";
import { authGuard } from "../middlewares/auth.middleware.js";
import { uploadPresignedLimiter } from "../middlewares/rateLimiter.middleware.js";

const router = Router();

// Middleware: allow public presigned URL generation for partner application documents
const presignedAuthGuard = (req, res, next) => {
  if (req.body && req.body.folder === "documents") {
    return next();
  }
  return authGuard(req, res, next);
};

// Presigned PUT URL generation
router.post("/presigned-url", uploadPresignedLimiter, presignedAuthGuard, getPresignedUrl);

// Signed GET URL generation for private S3 assets
router.get("/signed-url", authGuard, getSignedUrlController);

// Multipart Upload endpoints
router.post("/multipart/initiate", authGuard, initiateMultipartController);
router.post("/multipart/presign-part", authGuard, presignPartController);
router.post("/multipart/complete", authGuard, completeMultipartController);
router.post("/multipart/abort", authGuard, abortMultipartController);

// Mock endpoints for developer fallback
router.put("/mock-put/*path", mockUpload);
router.get("/mock-get/*path", mockGet);

export default router;
