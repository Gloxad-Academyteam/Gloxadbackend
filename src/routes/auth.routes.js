import { Router } from "express";
import {
  signup,
  signin,
  getMe,
  signout,
  verifyEmail,
  resendVerification,
  updateProfile,
  forgotPassword,
  verifyOtp,
  resetPassword,
  updatePassword,
  refreshTokenController,
} from "../controllers/auth.controller.js";
import { authGuard } from "../middlewares/auth.middleware.js";
import {
  signupLimiter,
  signinLimiter,
  tokenRefreshLimiter,
  resendVerificationLimiter,
  verifyEmailLimiter,
  forgotPasswordLimiter,
  verifyOtpLimiter,
  resetPasswordLimiter,
  updatePasswordLimiter,
  updateProfileLimiter,
} from "../middlewares/rateLimiter.middleware.js";

const router = Router();

router.post("/signup", signupLimiter, signup);
router.post("/signin", signinLimiter, signin);
router.post("/refresh", tokenRefreshLimiter, refreshTokenController);
router.get("/me", authGuard, getMe);
router.post("/signout", signout);
router.post("/verify-email", verifyEmailLimiter, verifyEmail);
router.post("/resend-verification", resendVerificationLimiter, resendVerification);
router.put("/update-profile", authGuard, updateProfileLimiter, updateProfile);
router.post("/forget-passwd", forgotPasswordLimiter, forgotPassword);
router.post("/verify-otp", verifyOtpLimiter, verifyOtp);
router.post("/reset-passwd", resetPasswordLimiter, resetPassword);
router.post("/update-password", authGuard, updatePasswordLimiter, updatePassword);

export default router;
