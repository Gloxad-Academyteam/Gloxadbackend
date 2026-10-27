import crypto from "crypto";
import { User } from "../models/User.model.js";
import { Otp } from "../models/Otp.model.js";
import { hashValue, compareValue } from "../utils/hash.js";
import { signToken, verifyToken, verifyTokenWithGracePeriod } from "../utils/jwt.js";
import {
  sendEmailVerificationOtp,
  sendPasswordResetOtp,
  sendWelcomeEmail,
} from "../utils/email.js";

/**
 * 1. signup (POST /api/auth/signup)
 * Register student or instructor, issue 4-digit OTP to all, and return session token
 */
export const signup = async (req, res, next) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      username: customUsername,
      role,
      areaOfExpertise,
      university,
      level,
      skills,
    } = req.body;

    if (!firstName || !email || !password) {
      return res.status(400).json({
        error: "First name, email, and password are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters long",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const assignedRole = role === "instructor" ? "instructor" : "student";

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        error: "Email already in use",
      });
    }

    // Determine unique username
    let finalUsername;
    if (customUsername && customUsername.trim()) {
      const normalizedCustom = customUsername.trim().toLowerCase();
      const existingUsername = await User.findOne({ username: normalizedCustom });
      if (existingUsername) {
        return res.status(400).json({
          error: "Username already taken",
        });
      }
      finalUsername = normalizedCustom;
    } else {
      const baseUsername = normalizedEmail.split("@")[0].replace(/[^a-zA-Z0-9]/g, "");
      let candidate = baseUsername || "user";
      let counter = 1;
      while (await User.findOne({ username: candidate })) {
        candidate = `${baseUsername}${counter++}`;
      }
      finalUsername = candidate;
    }

    const user = new User({
      email: normalizedEmail,
      password,
      firstName: firstName.trim(),
      lastName: lastName ? lastName.trim() : "",
      username: finalUsername,
      role: assignedRole,
      approvalStatus: assignedRole === "instructor" ? "pending" : "approved",
      isVerified: false,
      areaOfExpertise: areaOfExpertise ? areaOfExpertise.trim() : "",
      university: university ? university.trim() : "",
      level: level ? level.trim() : "",
      skills: Array.isArray(skills) ? skills : [],
      certifications: [],
      tokenVersion: 0,
    });

    await user.save();

    // Generate CSPRNG 4-digit OTP for ALL newly registered accounts (students & instructors)
    const otpCode = crypto.randomInt(1000, 10000).toString();
    const hashedOtp = await hashValue(otpCode, 10);

    await Otp.create({
      email: normalizedEmail,
      code: hashedOtp,
      type: "email_verification",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 mins
      consumed: false,
      attempts: 0,
      maxAttempts: 5,
    });

    await sendEmailVerificationOtp(normalizedEmail, otpCode);

    // Issue JWT session token with tokenVersion
    const token = signToken({
      sub: user._id,
      role: user.role,
      tokenVersion: user.tokenVersion || 0,
    });

    return res.status(201).json({
      token,
      user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 2. signin (POST /api/auth/signin)
 * Authenticate user & issue JWT
 */
export const signin = async (req, res, next) => {
  try {
    const { email, username, password } = req.body;
    const identifier = email || username;

    if (!identifier || !password) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    const normalizedIdentifier = identifier.trim().toLowerCase();
    const user = await User.findOne({
      $or: [{ email: normalizedIdentifier }, { username: normalizedIdentifier }],
    });

    if (!user) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    const token = signToken({
      sub: user._id,
      role: user.role,
      tokenVersion: user.tokenVersion || 0,
    });

    return res.status(200).json({
      token,
      user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 3. getMe (GET /api/auth/me)
 * Return authenticated caller's profile
 */
export const getMe = async (req, res, next) => {
  try {
    return res.status(200).json({
      user: req.user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 4. signout (POST /api/auth/signout)
 * Invalidate server-side session by bumping tokenVersion
 */
export const signout = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const decoded = verifyToken(token);
        if (decoded && decoded.sub) {
          await User.findByIdAndUpdate(decoded.sub, { $inc: { tokenVersion: 1 } });
        }
      } catch (e) {
        // Token was already invalid, acknowledgment response still proceeds
      }
    }

    return res.status(200).json({
      message: "Successfully signed out",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 5. verifyEmail (POST /api/auth/verify-email)
 * 4-digit OTP email verification with updated user object return
 */
export const verifyEmail = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        error: "Email and OTP code are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const otpRecord = await Otp.findOne({
      email: normalizedEmail,
      type: "email_verification",
      consumed: false,
    }).sort({ createdAt: -1 });

    if (!otpRecord || otpRecord.expiresAt < new Date()) {
      return res.status(400).json({
        error: "Invalid or expired verification code",
      });
    }

    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      otpRecord.consumed = true;
      await otpRecord.save();
      return res.status(400).json({
        error: "Too many failed attempts. Please request a new verification code.",
      });
    }

    const isMatch = await compareValue(otp, otpRecord.code);
    if (!isMatch) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      return res.status(400).json({
        error: "Invalid or expired verification code",
      });
    }

    otpRecord.consumed = true;
    await otpRecord.save();

    const user = await User.findOneAndUpdate(
      { email: normalizedEmail },
      { isVerified: true },
      { returnDocument: "after" }
    );

    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    // Dispatch onboarding welcome email
    sendWelcomeEmail(user.email, user.firstName).catch((err) => {
      console.warn("[WELCOME EMAIL NOTICE]", err.message);
    });

    return res.status(200).json({
      message: "Email verified successfully",
      user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 6. resendVerification (POST /api/auth/resend-verification)
 * Generate fresh 4-digit OTP for unverified accounts with generic anti-enumeration response
 */
export const resendVerification = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: "Email is required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    // Only issue new code if user exists and is not yet verified
    if (user && !user.isVerified) {
      // Invalidate existing active verification OTPs
      await Otp.updateMany(
        { email: normalizedEmail, type: "email_verification", consumed: false },
        { consumed: true }
      );

      const otpCode = crypto.randomInt(1000, 10000).toString();
      const hashedOtp = await hashValue(otpCode, 10);

      await Otp.create({
        email: normalizedEmail,
        code: hashedOtp,
        type: "email_verification",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 mins
        consumed: false,
        attempts: 0,
        maxAttempts: 5,
      });

      await sendEmailVerificationOtp(normalizedEmail, otpCode);
    }

    // Always return generic 200 to avoid user enumeration
    return res.status(200).json({
      message: "If this account needs verification, a new code has been sent.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 7. updateProfile (PUT /api/auth/update-profile)
 * Partial profile update for authenticated user
 */
export const updateProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    const {
      firstName,
      lastName,
      username,
      avatarUrl,
      avatar,
      university,
      level,
      skills,
      biography,
      bio,
      title,
      phoneNumber,
      socialLinks,
      notificationPreferences,
    } = req.body;

    // Handle username update with collision check
    if (username && username.trim()) {
      const normalizedUsername = username.trim().toLowerCase();
      if (normalizedUsername !== user.username) {
        const existing = await User.findOne({
          username: normalizedUsername,
          _id: { $ne: user._id },
        });
        if (existing) {
          return res.status(400).json({
            error: "Username is already taken",
          });
        }
        user.username = normalizedUsername;
      }
    }

    if (firstName !== undefined) user.firstName = firstName.trim();
    if (lastName !== undefined) user.lastName = lastName.trim();
    if (avatarUrl !== undefined || avatar !== undefined) {
      user.avatarUrl = avatarUrl || avatar || "";
    }
    if (university !== undefined) user.university = university.trim();
    if (level !== undefined) user.level = level.trim();
    if (skills !== undefined && Array.isArray(skills)) user.skills = skills;
    if (biography !== undefined || bio !== undefined) {
      const newBio = biography !== undefined ? biography.trim() : bio.trim();
      user.biography = newBio;
      user.bio = newBio;
    }
    if (title !== undefined) user.title = title.trim();
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber.trim();

    if (socialLinks && typeof socialLinks === "object") {
      const currentSocials =
        user.socialLinks && typeof user.socialLinks.toObject === "function"
          ? user.socialLinks.toObject()
          : user.socialLinks || {};
      user.socialLinks = { ...currentSocials, ...socialLinks };
      user.socials = user.socialLinks;
    }

    if (notificationPreferences && typeof notificationPreferences === "object") {
      const currentPrefs =
        user.notificationPreferences && typeof user.notificationPreferences.toObject === "function"
          ? user.notificationPreferences.toObject()
          : user.notificationPreferences || {};
      user.notificationPreferences = { ...currentPrefs, ...notificationPreferences };
    }

    await user.save();

    return res.status(200).json({
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 8. forgotPassword (POST /api/auth/forget-passwd)
 * Request 5-digit password recovery OTP
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: "Email is required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    // Anti-enumeration protection
    if (!user) {
      return res.status(200).json({
        message: "If the account exists, an OTP has been sent",
      });
    }

    await Otp.updateMany(
      { email: normalizedEmail, type: "password_reset", consumed: false },
      { consumed: true }
    );

    const otpCode = crypto.randomInt(10000, 100000).toString();
    const hashedOtp = await hashValue(otpCode, 10);

    await Otp.create({
      email: normalizedEmail,
      code: hashedOtp,
      type: "password_reset",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 mins
      consumed: false,
      attempts: 0,
      maxAttempts: 5,
    });

    await sendPasswordResetOtp(normalizedEmail, otpCode);

    return res.status(200).json({
      message: "Password reset OTP dispatched to email",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 9. verifyOtp (POST /api/auth/verify-otp)
 * Validate 5-digit OTP without consuming it
 */
export const verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        error: "Email and OTP code are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const otpRecord = await Otp.findOne({
      email: normalizedEmail,
      type: "password_reset",
      consumed: false,
    }).sort({ createdAt: -1 });

    if (!otpRecord || otpRecord.expiresAt < new Date()) {
      return res.status(400).json({
        error: "Invalid or expired OTP code",
      });
    }

    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      otpRecord.consumed = true;
      await otpRecord.save();
      return res.status(400).json({
        error: "Too many failed attempts. Please request a new verification code.",
      });
    }

    const isMatch = await compareValue(otp, otpRecord.code);
    if (!isMatch) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      return res.status(400).json({
        error: "Invalid or expired OTP code",
      });
    }

    return res.status(200).json({
      valid: true,
      message: "OTP is valid",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 10. resetPassword (POST /api/auth/reset-passwd)
 * Consume 5-digit OTP and reset password + revoke old sessions
 */
export const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        error: "Email, OTP, and new password are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters long",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const otpRecord = await Otp.findOne({
      email: normalizedEmail,
      type: "password_reset",
      consumed: false,
    }).sort({ createdAt: -1 });

    if (!otpRecord || otpRecord.expiresAt < new Date()) {
      return res.status(400).json({
        error: "Invalid or expired OTP code",
      });
    }

    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      otpRecord.consumed = true;
      await otpRecord.save();
      return res.status(400).json({
        error: "Too many failed attempts. Please request a new verification code.",
      });
    }

    const isMatch = await compareValue(otp, otpRecord.code);
    if (!isMatch) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      return res.status(400).json({
        error: "Invalid or expired OTP code",
      });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    otpRecord.consumed = true;
    await otpRecord.save();

    user.password = newPassword;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate all prior sessions
    await user.save();

    return res.status(200).json({
      message: "Password reset successfully. You can now sign in with your new password.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 11. updatePassword (POST /api/auth/update-password)
 * Authenticated password update + session revocation
 */
export const updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: "Current password and new password are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters long",
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        error: "Current password does not match",
      });
    }

    user.password = newPassword;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate all other sessions
    await user.save();

    return res.status(200).json({
      message: "Password updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 12. refreshTokenController (POST /api/auth/refresh)
 * Refreshes access token using active Bearer token and current tokenVersion.
 */
export const refreshTokenController = async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.body && req.body.token) {
      token = req.body.token;
    }

    if (!token) {
      return res.status(401).json({
        error: "Authentication token missing or malformed",
      });
    }

    let decoded;
    try {
      // Allow tokens that expired within the last 5 minutes (300 seconds)
      decoded = verifyTokenWithGracePeriod(token, 300);
    } catch (err) {
      return res.status(401).json({
        error: "Authentication token missing, expired, or malformed",
      });
    }

    const user = await User.findById(decoded.sub).select("-password");
    if (!user || user.isActive === false || user.isDeactivated === true) {
      return res.status(401).json({
        error: "User account not found or deactivated",
      });
    }

    if (decoded.tokenVersion !== undefined && user.tokenVersion !== undefined) {
      if (decoded.tokenVersion !== user.tokenVersion) {
        return res.status(401).json({
          error: "Session expired or revoked. Please sign in again.",
        });
      }
    }

    const newToken = signToken({
      sub: user._id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion || 0,
    });

    return res.status(200).json({
      token: newToken,
      user,
    });
  } catch (error) {
    next(error);
  }
};

export default {
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
};
