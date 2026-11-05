import { LmsCertificate } from "../models/LmsCertificate.model.js";
import { Cohort } from "../models/Cohort.model.js";
import { Course } from "../models/Course.model.js";
import { User } from "../models/User.model.js";
import { Enrollment } from "../models/Enrollment.model.js";
import { LmsLessonProgress } from "../models/LmsLessonProgress.model.js";
import { generateAndUploadCertificatePdf } from "../utils/certificate.js";
import { generateSignedGetUrl } from "../utils/s3.js";

/**
 * Helper to generate LinkedIn Add-to-Profile share metadata
 */
export const buildLinkedInShare = (cert) => {
  const title = cert.title || cert.courseId?.title || "Certificate of Completion";
  const issuedDate = cert.issuedAt ? new Date(cert.issuedAt) : new Date();
  const certId = cert.certificateId || cert._id?.toString() || "";
  const frontendUrl = process.env.FRONTEND_URL || "https://gloxadacademy.com";
  const certUrl = `${frontendUrl}/verify-certificate/${certId}`;

  return {
    name: title,
    organizationName: "Gloxad Academy",
    issueMonth: issuedDate.getMonth() + 1,
    issueYear: issuedDate.getFullYear(),
    certId,
    certUrl,
    shareUrl: `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(
      title
    )}&organizationName=${encodeURIComponent("Gloxad Academy")}&issueYear=${issuedDate.getFullYear()}&issueMonth=${
      issuedDate.getMonth() + 1
    }&certUrl=${encodeURIComponent(certUrl)}&certId=${encodeURIComponent(certId)}`,
  };
};

/**
 * GET /api/lms/certificates/me
 * Returns in-progress and earned credentials for authenticated student
 */
export const getMyCertificates = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // 1. Fetch earned certificates
    const earnedCertificates = await LmsCertificate.find({
      userId,
      revokedAt: null,
    })
      .populate("cohortId", "name currentWeek status")
      .populate("courseId", "title thumbnail")
      .sort({ issuedAt: -1 });

    const earnedCohortIds = new Set(
      earnedCertificates.map((c) => c.cohortId?._id?.toString() || c.cohortId?.toString())
    );

    // 2. Fetch cohorts where user is enrolled but has not yet earned a certificate
    const enrolledCohorts = await Cohort.find({
      studentIds: userId,
      _id: { $nin: Array.from(earnedCohortIds).filter(Boolean) },
    })
      .populate("courseId", "title thumbnail modules")
      .sort({ createdAt: -1 });

    const inProgressList = await Promise.all(
      enrolledCohorts.map(async (cohort) => {
        // Calculate progress percentage
        const courseModules = cohort.courseId?.modules || cohort.curriculumModules || [];
        const totalLessons = courseModules.reduce(
          (acc, m) => acc + (m.lessons || []).length,
          0
        );

        let progressPercentage = 0;
        if (totalLessons > 0) {
          const completedCount = await LmsLessonProgress.countDocuments({
            cohortId: cohort._id,
            userId,
            status: "completed",
          });
          progressPercentage = Math.min(100, Math.round((completedCount / totalLessons) * 100));
        }

        return {
          cohortId: cohort._id,
          cohortName: cohort.name,
          courseId: cohort.courseId?._id || cohort.courseId,
          title: cohort.courseId?.title || cohort.name,
          thumbnail: cohort.courseId?.thumbnail || "",
          currentWeek: cohort.currentWeek || 1,
          status: cohort.status,
          progressPercentage,
        };
      })
    );

    const earnedWithShare = earnedCertificates.map((cert) => {
      const obj = cert.toObject ? cert.toObject() : { ...cert };
      obj.linkedInShare = buildLinkedInShare(obj);
      return obj;
    });

    return res.status(200).json({
      inProgress: inProgressList,
      earned: earnedWithShare,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/lms/certificates/:id/pdf
 * Emits signed GET URL to server-generated certificate PDF with embedded QR code
 */
export const getCertificatePdf = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Search by certificateId or MongoDB _id
    let cert = null;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      cert = await LmsCertificate.findById(id)
        .populate("userId", "firstName lastName email")
        .populate("cohortId", "name")
        .populate("courseId", "title");
    }
    if (!cert) {
      cert = await LmsCertificate.findOne({ certificateId: id })
        .populate("userId", "firstName lastName email")
        .populate("cohortId", "name")
        .populate("courseId", "title");
    }

    if (!cert) {
      return res.status(404).json({ error: "Certificate not found" });
    }

    // Verify caller is owner, enrolled in cohort, or admin/instructor
    const isOwner = cert.userId._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";
    const isInstructor = req.user.role === "instructor";

    if (!isOwner && !isAdmin && !isInstructor) {
      return res.status(403).json({
        error: "Access denied. You do not have permission to view this certificate",
      });
    }

    // Generate PDF and upload to S3 if not yet generated
    if (!cert.pdfKey) {
      const studentName = cert.userId
        ? `${cert.userId.firstName || ""} ${cert.userId.lastName || ""}`.trim()
        : "Student";
      const courseTitle = cert.courseId?.title || cert.title;
      const cohortName = cert.cohortId?.name || "";

      const pdfKey = await generateAndUploadCertificatePdf({
        certificateId: cert.certificateId,
        studentName,
        courseTitle,
        cohortName,
        issuedAt: cert.issuedAt,
        badge: cert.badge,
      });

      cert.pdfKey = pdfKey;
      await cert.save();
    }

    // Generate signed GET URL
    const signedUrl = await generateSignedGetUrl(cert.pdfKey, 300);

    if (req.query.redirect === "true") {
      return res.redirect(signedUrl);
    }

    return res.status(200).json({
      url: signedUrl,
      downloadUrl: signedUrl,
      signedUrl,
      certificateId: cert.certificateId,
      pdfKey: cert.pdfKey,
      expiresIn: 300,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/learning/verify-certificate/:certificateId
 * Public verification endpoint for cohort certificates and legacy course certificates
 */
export const verifyCertificate = async (req, res, next) => {
  try {
    const { certificateId } = req.params;

    // Check LMS Certificate collection first
    const cert = await LmsCertificate.findOne({ certificateId })
      .populate("userId", "firstName lastName email")
      .populate("courseId", "title instructor")
      .populate("cohortId", "name");

    if (cert) {
      const studentName = cert.userId
        ? `${cert.userId.firstName || ""} ${cert.userId.lastName || ""}`.trim()
        : "Student";
      const courseTitle = cert.courseId?.title || cert.title;
      const cohortName = cert.cohortId?.name || "";

      const isValid = !cert.revokedAt;

      return res.status(200).json({
        valid: isValid,
        message: isValid
          ? "Certificate verified successfully"
          : "Certificate has been revoked",
        certificate: {
          certificateId: cert.certificateId,
          studentName,
          courseTitle,
          cohortName,
          badge: cert.badge,
          issuedAt: cert.issuedAt,
          isRevoked: Boolean(cert.revokedAt),
          revokedAt: cert.revokedAt || null,
          revokedReason: cert.revokedReason || null,
        },
        linkedInShare: isValid ? buildLinkedInShare(cert) : null,
      });
    }

    // Fallback: Check legacy single-course Enrollment certificates
    const enrollment = await Enrollment.findOne({ certificateId })
      .populate("user", "firstName lastName")
      .populate({
        path: "course",
        select: "title instructor",
        populate: {
          path: "instructor",
          select: "firstName lastName",
        },
      });

    if (enrollment) {
      const studentName = enrollment.user
        ? `${enrollment.user.firstName} ${enrollment.user.lastName}`.trim()
        : "Student";
      const courseTitle = enrollment.course ? enrollment.course.title : "Course";
      const instructorName =
        enrollment.course && enrollment.course.instructor
          ? `${enrollment.course.instructor.firstName} ${enrollment.course.instructor.lastName}`.trim()
          : "Gloxad Academy";

      const issuedDate = new Date(enrollment.completedAt || enrollment.updatedAt || Date.now());
      const certId = enrollment.certificateId;
      const frontendUrl = process.env.FRONTEND_URL || "https://gloxadacademy.com";
      const certUrl = `${frontendUrl}/verify-certificate/${certId}`;

      const linkedInShare = {
        name: courseTitle,
        organizationName: "Gloxad Academy",
        issueMonth: issuedDate.getMonth() + 1,
        issueYear: issuedDate.getFullYear(),
        certId,
        certUrl,
        shareUrl: `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(
          courseTitle
        )}&organizationName=${encodeURIComponent("Gloxad Academy")}&issueYear=${issuedDate.getFullYear()}&issueMonth=${
          issuedDate.getMonth() + 1
        }&certUrl=${encodeURIComponent(certUrl)}&certId=${encodeURIComponent(certId)}`,
      };

      return res.status(200).json({
        valid: true,
        message: "Certificate verified successfully",
        certificate: {
          certificateId: enrollment.certificateId,
          studentName,
          courseTitle,
          instructorName,
          issuedAt: enrollment.completedAt || enrollment.updatedAt,
        },
        linkedInShare,
      });
    }

    return res.status(404).json({
      error: "Certificate not found or invalid certificate ID",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/lms/certificates/:id/revoke
 * Admin revokes a certificate
 */
export const revokeCertificate = async (req, res, next) => {
  try {
    const { id } = req.params;
    let cert = null;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      cert = await LmsCertificate.findById(id);
    }
    if (!cert) {
      cert = await LmsCertificate.findOne({ certificateId: id });
    }

    if (!cert) {
      return res.status(404).json({ error: "Certificate not found" });
    }

    cert.revokedAt = new Date();
    cert.revokedReason = req.body.reason || "Revoked by administrator";
    cert.revokedBy = req.user._id;
    await cert.save();

    return res.status(200).json({
      message: "Certificate revoked successfully",
      certificate: cert,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/lms/certificates/:id/reissue
 * Admin reissues a previously revoked certificate
 */
export const reissueCertificate = async (req, res, next) => {
  try {
    const { id } = req.params;
    let cert = null;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      cert = await LmsCertificate.findById(id);
    }
    if (!cert) {
      cert = await LmsCertificate.findOne({ certificateId: id });
    }

    if (!cert) {
      return res.status(404).json({ error: "Certificate not found" });
    }

    cert.revokedAt = null;
    cert.revokedReason = null;
    cert.revokedBy = null;
    cert.issuedAt = new Date();
    cert.pdfKey = ""; // Reset PDF key so newly stamped PDF is generated on next download
    await cert.save();

    return res.status(200).json({
      message: "Certificate reissued successfully",
      certificate: cert,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getMyCertificates,
  getCertificatePdf,
  verifyCertificate,
  revokeCertificate,
  reissueCertificate,
  buildLinkedInShare,
};
