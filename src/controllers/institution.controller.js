import crypto from "crypto";
import { InstitutionApplication } from "../models/InstitutionApplication.model.js";
import { sendPartnerApplicationConfirmationEmail } from "../utils/email.js";
import { env } from "../config/env.js";

const VALID_TYPES = [
  "Private University",
  "Vocational School",
  "Charter School",
  "Medical Institute",
  "Public College",
  "International School",
  "Technical College",
  "Business School",
  "Law School",
  "Online University",
  "Tertiary Institution",
  "Other",
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Helper: Generate unique reference ID (GLX-YYYY-XXXX)
 */
const generateUniqueReferenceId = async () => {
  const year = new Date().getFullYear();
  let referenceId = "";
  let exists = true;
  let attempts = 0;

  while (exists && attempts < 10) {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    referenceId = `GLX-${year}-${randomSuffix}`;
    const found = await InstitutionApplication.findOne({ referenceId });
    if (!found) {
      exists = false;
    }
    attempts++;
  }

  return referenceId;
};

/**
 * POST /api/institutions/applications
 * Submit new partnership request, prevent duplicate pending apps, dispatch confirmation email
 */
export const submitApplication = async (req, res, next) => {
  try {
    const {
      institutionName,
      type,
      website,
      address,
      representative,
      expectedStudents,
      expectedStudentsCount,
      requestedFeatures,
      message,
      documents,
      plan,
    } = req.body;

    const fields = {};

    if (!institutionName || typeof institutionName !== "string" || institutionName.trim().length < 3) {
      fields.institutionName = "Institution name must be at least 3 characters";
    }

    if (!type || !VALID_TYPES.includes(type)) {
      fields.type = `Institution type must be one of: ${VALID_TYPES.join(", ")}`;
    }

    if (!representative || typeof representative !== "object") {
      fields.representative = "Representative contact details are required";
    } else {
      if (!representative.name || typeof representative.name !== "string" || !representative.name.trim()) {
        fields["representative.name"] = "Representative full name is required";
      }
      if (!representative.role || typeof representative.role !== "string" || !representative.role.trim()) {
        fields["representative.role"] = "Representative role or title is required";
      }
      if (
        !representative.email ||
        typeof representative.email !== "string" ||
        !EMAIL_REGEX.test(representative.email.trim())
      ) {
        fields["representative.email"] = "A valid institutional email is required";
      }
      if (!representative.phone || typeof representative.phone !== "string" || !representative.phone.trim()) {
        fields["representative.phone"] = "Representative phone number is required";
      }
    }

    if (Object.keys(fields).length > 0) {
      return res.status(400).json({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        fields,
      });
    }

    const normalizedEmail = representative.email.trim().toLowerCase();

    // Check for existing pending application with this representative email
    const existingPending = await InstitutionApplication.findOne({
      "representative.email": normalizedEmail,
      status: "pending",
    });

    if (existingPending) {
      return res.status(409).json({
        error: "A pending application with this email already exists",
        code: "DUPLICATE_APPLICATION",
      });
    }

    const referenceId = await generateUniqueReferenceId();
    const accessCode = crypto.randomBytes(4).toString("hex").toUpperCase();

    const application = await InstitutionApplication.create({
      referenceId,
      institutionName: institutionName.trim(),
      type,
      website: website ? String(website).trim() : "",
      address: {
        line1: address?.line1 ? String(address.line1).trim() : "",
        city: address?.city ? String(address.city).trim() : "",
        country: address?.country ? String(address.country).trim() : "NG",
      },
      representative: {
        name: representative.name.trim(),
        role: representative.role.trim(),
        email: normalizedEmail,
        phone: representative.phone.trim(),
      },
      expectedStudents: expectedStudents ? String(expectedStudents).trim() : "",
      expectedStudentsCount: expectedStudentsCount ? Number(expectedStudentsCount) : 0,
      requestedFeatures: requestedFeatures ? String(requestedFeatures).trim() : "",
      message: message ? String(message).trim() : "",
      documents: Array.isArray(documents)
        ? documents.map((d) => ({
            name: d.name ? String(d.name).trim() : "Document",
            key: d.key ? String(d.key).trim() : "",
            size: d.size ? Number(d.size) : 0,
            verifiedAt: null,
          }))
        : [],
      plan: plan === "Enterprise" ? "Enterprise" : "Premium",
      status: "pending",
      accessCode,
      submittedAt: new Date(),
    });

    // Send confirmation email asynchronously
    const trackingUrl = `${env.FRONTEND_ORIGIN || "http://localhost:3000"}/partners/track?ref=${referenceId}`;
    sendPartnerApplicationConfirmationEmail({
      to: normalizedEmail,
      name: representative.name.trim(),
      referenceId,
      trackingUrl,
    }).catch((err) => {
      console.warn(`[EMAIL NOTIFICATION WARNING] ${err.message}`);
    });

    return res.status(201).json({
      message: "Partnership application submitted successfully",
      application: {
        _id: application._id,
        referenceId: application.referenceId,
        status: application.status,
        submittedAt: application.submittedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/institutions/applications/:referenceId
 * Status track route returning safe public metadata
 */
export const trackApplication = async (req, res, next) => {
  try {
    const { referenceId } = req.params;
    const { code } = req.query;

    if (!referenceId || typeof referenceId !== "string") {
      return res.status(400).json({
        error: "Reference ID is required",
        code: "VALIDATION_ERROR",
      });
    }

    const application = await InstitutionApplication.findOne({
      referenceId: referenceId.trim().toUpperCase(),
    });

    if (!application) {
      return res.status(404).json({
        error: "Application not found",
        code: "APPLICATION_NOT_FOUND",
      });
    }

    if (code && application.accessCode && String(code).trim().toUpperCase() !== application.accessCode) {
      return res.status(401).json({
        error: "Invalid access code for this application",
        code: "INVALID_ACCESS_CODE",
      });
    }

    return res.status(200).json({
      status: application.status,
      submittedAt: application.submittedAt,
      referenceId: application.referenceId,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/institutions/plans
 * Canonical public plans catalogue ($249/mo Premium, $599/mo Enterprise, 20% annual discount)
 */
export const getPlans = async (req, res) => {
  const plans = [
    {
      id: "premium",
      name: "Premium",
      monthlyPrice: 249,
      annualPrice: 2390,
      annualDiscountPercent: 20,
      seatLimit: 500,
      description: "Ideal for specialized vocational academies, charter schools, and colleges.",
      features: [
        "Up to 500 Active Students",
        "Full LMS Course Platform & Quizzes",
        "Automated Verifiable Course Certificates",
        "Standard Analytics & Reporting Dashboard",
        "Email & In-App Notification Engine",
        "Standard Cloud Infrastructure (Shared S3)",
      ],
    },
    {
      id: "enterprise",
      name: "Enterprise",
      monthlyPrice: 599,
      annualPrice: 5750,
      annualDiscountPercent: 20,
      seatLimit: 5000,
      description: "Designed for universities, multi-campus institutions, and government bodies.",
      features: [
        "Up to 5,000+ Active Students",
        "LiveKit Classroom WebRTC Sessions & Recordings",
        "Multi-Campus & Department Isolation",
        "Custom White-Label Domain & Branding",
        "Dedicated Database Sharding & Priority S3 CDN",
        "24/7 Dedicated Technical Account Manager & SLA",
      ],
    },
  ];

  return res.status(200).json({
    plans,
  });
};

export default {
  submitApplication,
  trackApplication,
  getPlans,
};
