import crypto from "crypto";
import { InstitutionMember } from "../models/InstitutionMember.model.js";
import { Department } from "../models/Department.model.js";
import { Institution } from "../models/Institution.model.js";
import { sendInstitutionMemberInviteEmail } from "../utils/email.js";
import { env } from "../config/env.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Helper to parse CSV string into array of object rows
 */
const parseCsvString = (csvText) => {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.replace(/^["']|["']$/g, "").trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.replace(/^["']|["']$/g, "").trim());
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    rows.push(row);
  }

  return rows;
};

/**
 * GET /api/institutions/me/members
 * Step 3 & 4: Paginated members listing with filters.
 */
export const getMembers = async (req, res, next) => {
  try {
    const { role, departmentId, q, page = 1, limit = 20 } = req.query;

    const filter = { institutionId: req.institutionId };

    if (role && (role === "tutor" || role === "student")) {
      filter.role = role;
    }

    if (departmentId) {
      filter.departmentIds = departmentId;
    }

    if (q && typeof q === "string" && q.trim()) {
      const searchRegex = new RegExp(q.trim(), "i");
      filter.$or = [{ name: searchRegex }, { email: searchRegex }, { designation: searchRegex }];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [members, total] = await Promise.all([
      InstitutionMember.find(filter)
        .populate("departmentIds", "name code faculty")
        .populate("userId", "firstName lastName avatarUrl")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      InstitutionMember.countDocuments(filter),
    ]);

    return res.status(200).json({
      members,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/institutions/me/members
 * Step 3 & 4: Adds individual member. Enforces seat limit and duplicate email check.
 */
export const addMember = async (req, res, next) => {
  try {
    const { role, name, email, departmentIds, designation, autoInvite } = req.body || {};

    if (!role || !["tutor", "student"].includes(role)) {
      return res.status(400).json({
        error: "Member role is required and must be either 'tutor' or 'student'",
        code: "VALIDATION_ERROR",
      });
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        error: "Member name is required",
        code: "VALIDATION_ERROR",
      });
    }

    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({
        error: "A valid member email address is required",
        code: "VALIDATION_ERROR",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check duplicate email within tenant
    const existingMember = await InstitutionMember.findOne({
      institutionId: req.institutionId,
      email: normalizedEmail,
    });

    if (existingMember) {
      return res.status(409).json({
        error: "Member with this email already exists in this institution",
        code: "DUPLICATE_MEMBER",
      });
    }

    const institution = await Institution.findById(req.institutionId);
    const plan = institution?.plan || "Premium";
    const seatLimit = institution?.seatLimit || (plan === "Enterprise" ? 5000 : 500);

    // Enforce student seat limits on Premium plan
    if (role === "student" && plan === "Premium") {
      const currentStudents = await InstitutionMember.countDocuments({
        institutionId: req.institutionId,
        role: "student",
      });

      if (currentStudents + 1 > seatLimit) {
        return res.status(400).json({
          error: `Member limit of ${seatLimit} reached for Premium plan. Upgrade to Enterprise to add more members.`,
          code: "SEAT_LIMIT_EXCEEDED",
        });
      }
    }

    // Resolve department IDs if provided
    let resolvedDepartmentIds = [];
    if (Array.isArray(departmentIds)) {
      resolvedDepartmentIds = departmentIds;
    } else if (departmentIds) {
      resolvedDepartmentIds = [departmentIds];
    }

    let inviteToken = null;
    let inviteStatus = "not_invited";
    let invitedAt = null;

    if (autoInvite === true) {
      inviteToken = crypto.randomBytes(32).toString("hex");
      inviteStatus = "pending";
      invitedAt = new Date();
    }

    const member = await InstitutionMember.create({
      institutionId: req.institutionId,
      role,
      name: name.trim(),
      email: normalizedEmail,
      departmentIds: resolvedDepartmentIds,
      designation: designation ? String(designation).trim() : "",
      autoInvite: Boolean(autoInvite),
      inviteStatus,
      inviteToken,
      invitedAt,
    });

    // Send invitation email if autoInvite is enabled
    if (autoInvite === true) {
      const inviteUrl = `${env.FRONTEND_ORIGIN || "http://localhost:3000"}/institution/invite?token=${inviteToken}`;
      sendInstitutionMemberInviteEmail({
        to: normalizedEmail,
        name: name.trim(),
        institutionName: institution?.name || "Institution Workspace",
        role,
        inviteUrl,
      }).catch((e) => console.warn(`[INVITE EMAIL WARNING] ${e.message}`));
    }

    // Advance wizard steps: Step 3 for tutors, Step 4 for students
    if (institution) {
      const stepToComplete = role === "tutor" ? 3 : 4;
      const nextStep = role === "tutor" ? 4 : 5;

      if (!institution.onboarding) {
        institution.onboarding = { currentStep: nextStep, completedSteps: [stepToComplete] };
      } else {
        if (!institution.onboarding.completedSteps.includes(stepToComplete)) {
          institution.onboarding.completedSteps.push(stepToComplete);
        }
        if (institution.onboarding.currentStep === stepToComplete) {
          institution.onboarding.currentStep = nextStep;
        }
      }
      await institution.save();
    }

    return res.status(201).json({
      message: "Member added successfully",
      member,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        error: "Member with this email already exists in this institution",
        code: "DUPLICATE_MEMBER",
      });
    }
    next(error);
  }
};

/**
 * POST /api/institutions/me/members/import
 * Step 3 & 4: Bulk CSV or JSON rows import.
 */
export const importMembers = async (req, res, next) => {
  try {
    let rows = [];

    if (typeof req.body.csv === "string") {
      rows = parseCsvString(req.body.csv);
    } else if (Array.isArray(req.body.members)) {
      rows = req.body.members;
    } else if (Array.isArray(req.body.rows)) {
      rows = req.body.rows;
    } else if (Array.isArray(req.body)) {
      rows = req.body;
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({
        error: "No member rows provided for import",
        code: "EMPTY_IMPORT",
      });
    }

    const institution = await Institution.findById(req.institutionId);
    const plan = institution?.plan || "Premium";
    const seatLimit = institution?.seatLimit || (plan === "Enterprise" ? 5000 : 500);

    // Pre-load departments in institution for fast matching by code or name
    const allDepartments = await Department.find({ institutionId: req.institutionId });
    const deptMapByCode = new Map();
    const deptMapByName = new Map();
    const deptMapById = new Map();

    allDepartments.forEach((dept) => {
      deptMapByCode.set(dept.code.toUpperCase(), dept._id);
      deptMapByName.set(dept.name.toLowerCase(), dept._id);
      deptMapById.set(String(dept._id), dept._id);
    });

    // Check existing members to prevent duplicates
    const existingMembers = await InstitutionMember.find({ institutionId: req.institutionId }).select("email");
    const existingEmails = new Set(existingMembers.map((m) => m.email.toLowerCase()));

    const currentStudentCount = await InstitutionMember.countDocuments({
      institutionId: req.institutionId,
      role: "student",
    });

    const defaultRole = req.query.role || req.body.role || "student";
    const seenImportEmails = new Set();
    const validMembersToInsert = [];
    const skipped = [];

    let projectedNewStudents = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rawName = row.name || row["Full Name"] || row.fullName || "";
      const rawEmail = row.email || row["Professional Email"] || row.professionalEmail || "";
      const rawRole = row.role || defaultRole;
      const rawDept = row.department || row.Department || row.departmentId || row.departmentCode || "";
      const rawDesignation = row.designation || row.Designation || row.title || "";

      const normalizedName = String(rawName).trim();
      const normalizedEmail = String(rawEmail).trim().toLowerCase();
      const normalizedRole = ["tutor", "student"].includes(rawRole) ? rawRole : "student";

      if (!normalizedName) {
        skipped.push({ row: i + 1, reason: "Missing name" });
        continue;
      }

      if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
        skipped.push({ row: i + 1, reason: "Invalid or missing email" });
        continue;
      }

      if (existingEmails.has(normalizedEmail)) {
        skipped.push({ row: i + 1, reason: `Email '${normalizedEmail}' already registered in institution` });
        continue;
      }

      if (seenImportEmails.has(normalizedEmail)) {
        skipped.push({ row: i + 1, reason: `Duplicate email '${normalizedEmail}' in import list` });
        continue;
      }

      // Check student seat limit
      if (normalizedRole === "student" && plan === "Premium") {
        if (currentStudentCount + projectedNewStudents + 1 > seatLimit) {
          return res.status(400).json({
            error: `Member limit of ${seatLimit} reached for Premium plan. Upgrade to Enterprise to add more members.`,
            code: "SEAT_LIMIT_EXCEEDED",
          });
        }
        projectedNewStudents++;
      }

      seenImportEmails.add(normalizedEmail);

      // Resolve department ID
      const deptIds = [];
      if (rawDept) {
        const cleanDeptStr = String(rawDept).trim();
        const byCode = deptMapByCode.get(cleanDeptStr.toUpperCase());
        const byName = deptMapByName.get(cleanDeptStr.toLowerCase());
        const byId = deptMapById.get(cleanDeptStr);

        const matchedId = byCode || byName || byId;
        if (matchedId) {
          deptIds.push(matchedId);
        }
      }

      validMembersToInsert.push({
        institutionId: req.institutionId,
        role: normalizedRole,
        name: normalizedName,
        email: normalizedEmail,
        departmentIds: deptIds,
        designation: rawDesignation ? String(rawDesignation).trim() : "",
        autoInvite: false,
        inviteStatus: "not_invited",
        inviteToken: null,
        invitedAt: null,
      });
    }

    let createdCount = 0;
    if (validMembersToInsert.length > 0) {
      const created = await InstitutionMember.insertMany(validMembersToInsert);
      createdCount = created.length;
    }

    // Advance wizard steps
    if (institution && createdCount > 0) {
      const hasTutors = validMembersToInsert.some((m) => m.role === "tutor");
      const hasStudents = validMembersToInsert.some((m) => m.role === "student");

      if (!institution.onboarding) {
        institution.onboarding = { currentStep: 4, completedSteps: [3] };
      }

      if (hasTutors && !institution.onboarding.completedSteps.includes(3)) {
        institution.onboarding.completedSteps.push(3);
      }
      if (hasStudents && !institution.onboarding.completedSteps.includes(4)) {
        institution.onboarding.completedSteps.push(4);
      }
      if (hasTutors && institution.onboarding.currentStep === 3) {
        institution.onboarding.currentStep = 4;
      }
      if (hasStudents && institution.onboarding.currentStep === 4) {
        institution.onboarding.currentStep = 5;
      }
      await institution.save();
    }

    return res.status(200).json({
      message: "Bulk member import processed",
      imported: createdCount,
      skipped,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/institutions/me/members/:id/invite
 * Resends member invitation email. Rate limited to prevent spam.
 */
export const resendInvite = async (req, res, next) => {
  try {
    const { id } = req.params;

    const member = await InstitutionMember.findOne({
      _id: id,
      institutionId: req.institutionId,
    });

    if (!member) {
      return res.status(404).json({
        error: "Member not found",
        code: "MEMBER_NOT_FOUND",
      });
    }

    // Rate-limit resend: require at least 30 seconds between resends
    if (member.invitedAt && Date.now() - new Date(member.invitedAt).getTime() < 30 * 1000) {
      return res.status(429).json({
        error: "Please wait before resending another invitation",
        code: "RATE_LIMITED",
      });
    }

    const institution = await Institution.findById(req.institutionId);

    const inviteToken = crypto.randomBytes(32).toString("hex");
    member.inviteToken = inviteToken;
    member.inviteStatus = "pending";
    member.invitedAt = new Date();
    await member.save();

    const inviteUrl = `${env.FRONTEND_ORIGIN || "http://localhost:3000"}/institution/invite?token=${inviteToken}`;
    sendInstitutionMemberInviteEmail({
      to: member.email,
      name: member.name,
      institutionName: institution?.name || "Institution Workspace",
      role: member.role,
      inviteUrl,
    }).catch((e) => console.warn(`[RESEND INVITE EMAIL WARNING] ${e.message}`));

    return res.status(200).json({
      message: "Invitation resent successfully",
      member,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/institutions/me/members/:id
 * Detaches registered user or deletes draft member record.
 */
export const deleteMember = async (req, res, next) => {
  try {
    const { id } = req.params;

    const member = await InstitutionMember.findOne({
      _id: id,
      institutionId: req.institutionId,
    });

    if (!member) {
      return res.status(404).json({
        error: "Member not found",
        code: "MEMBER_NOT_FOUND",
      });
    }

    await InstitutionMember.findByIdAndDelete(id);

    return res.status(200).json({
      message: "Member removed successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/institutions/me/members/template
 * Downloadable CSV template for bulk student and tutor onboarding
 */
export const getMemberTemplate = async (req, res) => {
  const csvContent =
    "name,email,role,designation,department\n" +
    "John Doe,john.doe@example.edu,student,Undergraduate,Computer Science\n" +
    "Dr. Jane Smith,jane.smith@example.edu,tutor,Senior Lecturer,Engineering\n";

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="gloxad_members_import_template.csv"'
  );
  return res.status(200).send(csvContent);
};

export default {
  getMembers,
  addMember,
  importMembers,
  getMemberTemplate,
  resendInvite,
  deleteMember,
};
