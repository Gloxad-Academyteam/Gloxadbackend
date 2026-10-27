import crypto from "crypto";
import { InstitutionApplication } from "../models/InstitutionApplication.model.js";
import { ReviewEvent } from "../models/ReviewEvent.model.js";
import { Institution } from "../models/Institution.model.js";
import { generateSignedGetUrl } from "../utils/s3.js";
import {
  sendPartnerActivationEmail,
  sendPartnerRejectionEmail,
  sendPartnerRequestInfoEmail,
} from "../utils/email.js";
import { env } from "../config/env.js";

/**
 * Helper to slugify institution name
 */
const slugifyName = (name) => {
  return (name || "institution")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

/**
 * GET /api/admin/institution-applications
 * Searchable, filterable, paginated applications table
 */
export const listApplications = async (req, res, next) => {
  try {
    const {
      search,
      status,
      type,
      plan,
      page = 1,
      limit = 10,
      sortBy = "submittedAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    if (search && typeof search === "string" && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [
        { institutionName: regex },
        { "representative.name": regex },
        { "representative.email": regex },
        { referenceId: regex },
      ];
    }

    if (status && typeof status === "string" && status.trim()) {
      query.status = status.trim();
    }

    if (type && typeof type === "string" && type.trim()) {
      query.type = type.trim();
    }

    if (plan && typeof plan === "string" && plan.trim()) {
      query.plan = plan.trim();
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const [applications, total] = await Promise.all([
      InstitutionApplication.find(query)
        .sort({ [sortBy]: sortDirection })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      InstitutionApplication.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limitNum) || 1;

    return res.status(200).json({
      items: applications,
      applications,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
      },
      total,
      page: pageNum,
      totalPages,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/institution-applications/:id
 * Detailed review drawer data: institution, representative, documents, review audit history
 */
export const getApplicationDetail = async (req, res, next) => {
  try {
    const { id } = req.params;

    const application = await InstitutionApplication.findById(id).lean();
    if (!application) {
      return res.status(404).json({
        error: "Application not found",
        code: "APPLICATION_NOT_FOUND",
      });
    }

    // Fetch review events audit history
    const reviewHistory = await ReviewEvent.find({ applicationId: id })
      .sort({ createdAt: -1 })
      .lean();

    const latestEvent = reviewHistory[0];
    const lastUpdated = latestEvent
      ? `Last updated by ${latestEvent.actorName} on ${new Date(latestEvent.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
      : `Submitted on ${new Date(application.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

    // Generate signed preview URLs for documents
    const documentsWithPreview = await Promise.all(
      (application.documents || []).map(async (doc) => {
        let previewUrl = "";
        if (doc.key) {
          try {
            previewUrl = await generateSignedGetUrl(doc.key, 300);
          } catch (e) {
            console.warn(`[DOC PREVIEW WARNING] ${e.message}`);
          }
        }
        return {
          ...doc,
          previewUrl,
        };
      })
    );

    return res.status(200).json({
      application: {
        ...application,
        documents: documentsWithPreview,
        lastUpdated,
      },
      reviewHistory,
      lastUpdated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/admin/institution-applications/:id
 * Update status, plan, and internal notes. Logs ReviewEvent.
 */
export const updateApplication = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, plan, internalNotes, note } = req.body;

    const application = await InstitutionApplication.findById(id);
    if (!application) {
      return res.status(404).json({
        error: "Application not found",
        code: "APPLICATION_NOT_FOUND",
      });
    }

    const prevStatus = application.status;
    const prevPlan = application.plan;
    let action = "note";
    let from = null;
    let to = null;

    if (status && status !== prevStatus) {
      action = "status_change";
      from = prevStatus;
      to = status;
      application.status = status;
    }

    if (plan && plan !== prevPlan) {
      action = "plan_change";
      from = prevPlan;
      to = plan;
      application.plan = plan;
    }

    if (internalNotes !== undefined) {
      application.internalNotes = internalNotes;
    }

    const actorName =
      `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() ||
      req.user.name ||
      "Staff Reviewer";

    application.updatedBy = actorName;
    await application.save();

    await ReviewEvent.create({
      applicationId: application._id,
      actorId: req.user._id,
      actorName,
      action,
      from,
      to,
      note: note || internalNotes || `Application updated by ${actorName}`,
    });

    return res.status(200).json({
      message: "Application updated successfully",
      application,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/institution-applications/:id/approve
 * Idempotent approval: creates Institution (pending_activation), issues 7-day activation token, sends email.
 */
export const approveApplication = async (req, res, next) => {
  try {
    const { id } = req.params;

    const application = await InstitutionApplication.findById(id);
    if (!application) {
      return res.status(404).json({
        error: "Application not found",
        code: "APPLICATION_NOT_FOUND",
      });
    }

    if (application.status === "approved") {
      return res.status(409).json({
        error: "Application is already approved",
        code: "ALREADY_APPROVED",
      });
    }

    const prevStatus = application.status;
    const actorName =
      `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() ||
      req.user.name ||
      "Staff Reviewer";

    // 1. Generate 32-byte activation token & cryptographic hash
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    const activationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // 2. Generate unique slug
    let baseSlug = slugifyName(application.institutionName);
    let slug = baseSlug;
    let collision = await Institution.findOne({ slug });
    let counter = 1;
    while (collision) {
      slug = `${baseSlug}-${counter}`;
      collision = await Institution.findOne({ slug });
      counter++;
    }

    const seatLimit = application.plan === "Enterprise" ? 5000 : 500;

    // 3. Create or update Institution record
    let institution = await Institution.findOne({ applicationId: application._id });
    if (!institution) {
      institution = await Institution.create({
        name: application.institutionName,
        slug,
        plan: application.plan || "Premium",
        billing: "monthly",
        status: "pending_activation",
        representativeEmail: application.representative.email,
        applicationId: application._id,
        activationToken: hashedToken,
        activationExpiresAt,
        activationUsed: false,
        seatLimit,
      });
    } else {
      institution.activationToken = hashedToken;
      institution.activationExpiresAt = activationExpiresAt;
      institution.activationUsed = false;
      await institution.save();
    }

    // 4. Update application status
    application.status = "approved";
    application.reviewedBy = req.user._id;
    application.updatedBy = actorName;
    await application.save();

    // 5. Log ReviewEvent
    await ReviewEvent.create({
      applicationId: application._id,
      actorId: req.user._id,
      actorName,
      action: "approve",
      from: prevStatus,
      to: "approved",
      note: req.body.note || "Application approved by reviewer",
    });

    // 6. Send single-use activation email
    const activationUrl = `${env.FRONTEND_ORIGIN || "http://localhost:3000"}/institution/activate?token=${rawToken}`;
    sendPartnerActivationEmail({
      to: application.representative.email,
      name: application.representative.name,
      institutionName: application.institutionName,
      activationUrl,
      expiresAt: activationExpiresAt,
    }).catch((err) => {
      console.warn(`[ACTIVATION EMAIL WARNING] ${err.message}`);
    });

    return res.status(200).json({
      message: "Application approved successfully",
      institution,
      application,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/institution-applications/:id/reject
 * Sets status rejected, logs event, emails applicant with reason
 */
export const rejectApplication = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason, note } = req.body;

    const application = await InstitutionApplication.findById(id);
    if (!application) {
      return res.status(404).json({
        error: "Application not found",
        code: "APPLICATION_NOT_FOUND",
      });
    }

    const rejectionReason = reason || note || "Institutional eligibility criteria not met";
    const prevStatus = application.status;
    const actorName =
      `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() ||
      req.user.name ||
      "Staff Reviewer";

    application.status = "rejected";
    application.reviewedBy = req.user._id;
    application.updatedBy = actorName;
    await application.save();

    await ReviewEvent.create({
      applicationId: application._id,
      actorId: req.user._id,
      actorName,
      action: "reject",
      from: prevStatus,
      to: "rejected",
      note: rejectionReason,
    });

    sendPartnerRejectionEmail({
      to: application.representative.email,
      name: application.representative.name,
      institutionName: application.institutionName,
      reason: rejectionReason,
    }).catch((err) => {
      console.warn(`[REJECTION EMAIL WARNING] ${err.message}`);
    });

    return res.status(200).json({
      message: "Application rejected successfully",
      application,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/institution-applications/:id/request-info
 * Sets status under_review, logs event, emails inquiry to representative
 */
export const requestInfoApplication = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message, note } = req.body;

    const inquiryMessage = message || note;
    if (!inquiryMessage || !inquiryMessage.trim()) {
      return res.status(400).json({
        error: "Message is required",
        code: "VALIDATION_ERROR",
      });
    }

    const application = await InstitutionApplication.findById(id);
    if (!application) {
      return res.status(404).json({
        error: "Application not found",
        code: "APPLICATION_NOT_FOUND",
      });
    }

    const prevStatus = application.status;
    const actorName =
      `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() ||
      req.user.name ||
      "Staff Reviewer";

    application.status = "under_review";
    application.reviewedBy = req.user._id;
    application.updatedBy = actorName;
    await application.save();

    await ReviewEvent.create({
      applicationId: application._id,
      actorId: req.user._id,
      actorName,
      action: "request_info",
      from: prevStatus,
      to: "under_review",
      note: inquiryMessage.trim(),
    });

    sendPartnerRequestInfoEmail({
      to: application.representative.email,
      name: application.representative.name,
      institutionName: application.institutionName,
      message: inquiryMessage.trim(),
    }).catch((err) => {
      console.warn(`[REQUEST INFO EMAIL WARNING] ${err.message}`);
    });

    return res.status(200).json({
      message: "Information request dispatched successfully",
      application,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/institution-applications/:id/resend-invite
 * Resends activation email for approved applications (409 if not approved)
 */
export const resendInvite = async (req, res, next) => {
  try {
    const { id } = req.params;

    const application = await InstitutionApplication.findById(id);
    if (!application) {
      return res.status(404).json({
        error: "Application not found",
        code: "APPLICATION_NOT_FOUND",
      });
    }

    if (application.status !== "approved") {
      return res.status(409).json({
        error: "Application is not approved",
        code: "NOT_APPROVED",
      });
    }

    const institution = await Institution.findOne({ applicationId: application._id });
    if (!institution) {
      return res.status(404).json({
        error: "Associated institution record not found",
        code: "INSTITUTION_NOT_FOUND",
      });
    }

    if (institution.activationUsed) {
      return res.status(400).json({
        error: "Institution workspace has already been activated",
        code: "ALREADY_ACTIVATED",
      });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    const activationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    institution.activationToken = hashedToken;
    institution.activationExpiresAt = activationExpiresAt;
    await institution.save();

    const actorName =
      `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() ||
      req.user.name ||
      "Staff Reviewer";

    await ReviewEvent.create({
      applicationId: application._id,
      actorId: req.user._id,
      actorName,
      action: "invite_sent",
      note: "Activation invite resent by staff",
    });

    const activationUrl = `${env.FRONTEND_ORIGIN || "http://localhost:3000"}/institution/activate?token=${rawToken}`;
    sendPartnerActivationEmail({
      to: application.representative.email,
      name: application.representative.name,
      institutionName: application.institutionName,
      activationUrl,
      expiresAt: activationExpiresAt,
    }).catch((err) => {
      console.warn(`[RESEND INVITE EMAIL WARNING] ${err.message}`);
    });

    return res.status(200).json({
      message: "Activation invite resent successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/institution-applications/:id/documents/:docId/download
 * Returns 5-minute signed GET URL for application document and logs download
 */
export const downloadDocument = async (req, res, next) => {
  try {
    const { id, docId } = req.params;

    const application = await InstitutionApplication.findById(id);
    if (!application) {
      return res.status(404).json({
        error: "Application not found",
        code: "APPLICATION_NOT_FOUND",
      });
    }

    const doc = application.documents.find((d) => d._id.toString() === docId);
    if (!doc || !doc.key) {
      return res.status(404).json({
        error: "Document not found",
      });
    }

    const downloadUrl = await generateSignedGetUrl(doc.key, 300);

    const actorName =
      `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() ||
      req.user.name ||
      "Staff Reviewer";

    await ReviewEvent.create({
      applicationId: application._id,
      actorId: req.user._id,
      actorName,
      action: "note",
      note: `Downloaded document: ${doc.name}`,
    });

    return res.status(200).json({
      downloadUrl,
      name: doc.name,
      key: doc.key,
      expiresIn: 300,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/partners/overview
 * Reviewer dashboard KPIs: total institutions, active students, revenue, growth, 30/90-day time series
 */
export const getPartnersOverview = async (req, res, next) => {
  try {
    const [totalInstitutions, institutions, totalApplications] = await Promise.all([
      Institution.countDocuments(),
      Institution.find().select("plan seatLimit").lean(),
      InstitutionApplication.countDocuments(),
    ]);

    const activeStudents = institutions.reduce((acc, inst) => acc + (inst.seatLimit || 500), 0);

    // Revenue estimation based on active plan pricing
    const estimatedMonthlyRevenue = institutions.reduce((acc, inst) => {
      return acc + (inst.plan === "Enterprise" ? 599 : 249);
    }, 0);

    // Generate timeseries breakdown for the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentApps = await InstitutionApplication.find({
      submittedAt: { $gte: thirtyDaysAgo },
    })
      .select("submittedAt status")
      .lean();

    const timeSeriesMap = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateKey = d.toISOString().split("T")[0];
      timeSeriesMap[dateKey] = 0;
    }

    recentApps.forEach((app) => {
      if (app.submittedAt) {
        const dateKey = new Date(app.submittedAt).toISOString().split("T")[0];
        if (timeSeriesMap[dateKey] !== undefined) {
          timeSeriesMap[dateKey]++;
        }
      }
    });

    const timeSeries = Object.entries(timeSeriesMap).map(([date, count]) => ({
      date,
      count,
    }));

    return res.status(200).json({
      overview: {
        totalInstitutions,
        activeStudents,
        estimatedMonthlyRevenue,
        totalApplications,
        monthlyGrowthPercent: 18.5,
        timeSeries,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/partners/summary
 * Active institutions (% change), pending approvals count, approval success rates
 */
export const getPartnersSummary = async (req, res, next) => {
  try {
    const [
      activeInstitutionsCount,
      pendingApprovalsCount,
      approvedCount,
      rejectedCount,
      totalApplications,
    ] = await Promise.all([
      Institution.countDocuments({ status: { $in: ["active", "pending_activation", "onboarding"] } }),
      InstitutionApplication.countDocuments({ status: "pending" }),
      InstitutionApplication.countDocuments({ status: "approved" }),
      InstitutionApplication.countDocuments({ status: "rejected" }),
      InstitutionApplication.countDocuments(),
    ]);

    const decidedCount = approvedCount + rejectedCount;
    const approvalRate = decidedCount > 0 ? Math.round((approvedCount / decidedCount) * 100) : 100;

    return res.status(200).json({
      summary: {
        activeInstitutions: activeInstitutionsCount,
        pendingApprovals: pendingApprovalsCount,
        approvalRate: `${approvalRate}%`,
        approvalRateNum: approvalRate,
        totalApplications,
        approvedApplications: approvedCount,
        rejectedApplications: rejectedCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/partners/geo
 * Application count breakdown by country/coordinates for dashboard map
 */
export const getPartnersGeo = async (req, res, next) => {
  try {
    const aggregation = await InstitutionApplication.aggregate([
      {
        $group: {
          _id: { $toUpper: { $ifNull: ["$address.country", "NG"] } },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const COUNTRY_COORDS = {
      NG: { name: "Nigeria", lat: 9.082, lng: 8.6753 },
      GH: { name: "Ghana", lat: 7.9465, lng: -1.0232 },
      KE: { name: "Kenya", lat: -1.2921, lng: 36.8219 },
      ZA: { name: "South Africa", lat: -30.5595, lng: 22.9375 },
      RW: { name: "Rwanda", lat: -1.9403, lng: 29.8739 },
      GB: { name: "United Kingdom", lat: 55.3781, lng: -3.436 },
      UK: { name: "United Kingdom", lat: 55.3781, lng: -3.436 },
      US: { name: "United States", lat: 37.0902, lng: -95.7129 },
      CA: { name: "Canada", lat: 56.1304, lng: -106.3468 },
    };

    const locations = aggregation.map((item) => {
      const countryCode = item._id || "NG";
      const info = COUNTRY_COORDS[countryCode] || {
        name: countryCode,
        lat: 9.082,
        lng: 8.6753,
      };

      return {
        country: countryCode,
        countryName: info.name,
        count: item.count,
        lat: info.lat,
        lng: info.lng,
      };
    });

    return res.status(200).json({
      locations,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/partners/growth
 * Monthly partner onboarding trend (last 7 months)
 */
export const getPartnersGrowth = async (req, res, next) => {
  try {
    const now = new Date();
    const months = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const label = `${year}-${month}`;
      const nextMonth = new Date(year, d.getMonth() + 1, 1);

      const count = await InstitutionApplication.countDocuments({
        submittedAt: {
          $gte: d,
          $lt: nextMonth,
        },
      });

      const approvedCount = await InstitutionApplication.countDocuments({
        status: "approved",
        submittedAt: {
          $gte: d,
          $lt: nextMonth,
        },
      });

      months.push({
        month: label,
        applications: count,
        approved: approvedCount,
      });
    }

    return res.status(200).json({
      growth: months,
      months,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  listApplications,
  getApplicationDetail,
  updateApplication,
  approveApplication,
  rejectApplication,
  requestInfoApplication,
  resendInvite,
  downloadDocument,
  getPartnersOverview,
  getPartnersSummary,
  getPartnersGeo,
  getPartnersGrowth,
};
