import mongoose from "mongoose";
import { Scholarship, SCHOLARSHIP_STATUSES } from "../models/Scholarship.model.js";
import { ScholarshipApplication, APPLICATION_STATUSES } from "../models/ScholarshipApplication.model.js";
import { Trimester } from "../models/Trimester.model.js";
import { Notification } from "../models/Notification.model.js";

// Allowed admin moves (spec 25, section 2). Final states have no way out.
const TRANSITIONS = {
  submitted: ["under_review", "rejected"],
  under_review: ["shortlisted", "approved", "rejected"],
  shortlisted: ["approved", "rejected"],
  approved: [],
  rejected: [],
  withdrawn: [],
};
const WITHDRAWABLE = ["submitted", "under_review", "shortlisted"];
const STATUS_LABEL = {
  submitted: "Submitted",
  under_review: "Under review",
  shortlisted: "Shortlisted",
  approved: "Approved",
  rejected: "Not successful",
  withdrawn: "Withdrawn",
};
const MAX_DOCUMENTS = 10;

const isId = (value) => mongoose.isValidObjectId(value);
const fail = (res, status, error, extra = {}) => res.status(status).json({ error, ...extra });
const toDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const cleanList = (value) => (Array.isArray(value) ? value.map((item) => String(item ?? "").trim()).filter(Boolean) : null);

/** upcoming, open or closed, always computed on the server */
const windowState = (scholarship, now = new Date()) => {
  if (now < new Date(scholarship.opensAt)) return "upcoming";
  if (now > new Date(scholarship.closesAt)) return "closed";
  return "open";
};

/** What is still missing before a scholarship may be published. Empty means ready. */
const missingForPublish = (scholarship, now = new Date()) => {
  const missing = [];
  if (!scholarship.title?.trim()) missing.push("title");
  if (!scholarship.description?.trim()) missing.push("description");
  if (!scholarship.eligibility?.length) missing.push("at least one eligibility rule");
  if (!scholarship.opensAt || !scholarship.closesAt) missing.push("opening and closing dates");
  else if (new Date(scholarship.closesAt) <= new Date(scholarship.opensAt)) missing.push("a closing date after the opening date");
  else if (new Date(scholarship.closesAt) <= now) missing.push("a closing date in the future");
  return missing;
};

const withoutStaffNotes = (history = []) => history.map(({ status, note, at }) => ({ status, note, at }));
const latestOf = (history = []) => {
  const last = history[history.length - 1];
  return last ? { status: last.status, note: last.note, at: last.at } : null;
};

const publicScholarship = (scholarship, application) => ({
  _id: scholarship._id,
  title: scholarship.title,
  summary: scholarship.summary ?? "",
  description: scholarship.description ?? "",
  eligibility: scholarship.eligibility ?? [],
  requiredDocuments: scholarship.requiredDocuments ?? [],
  opensAt: scholarship.opensAt,
  closesAt: scholarship.closesAt,
  trimesterId: scholarship.trimesterId ?? null,
  state: windowState(scholarship),
  application: application
    ? { _id: application._id, status: application.status, submittedAt: application.submittedAt, latest: latestOf(application.history) }
    : null,
});

const notifyApplicant = async (application, scholarship, note) => {
  try {
    await Notification.create({
      recipient: application.userId,
      title: "Scholarship update",
      message: `Your application for "${scholarship.title}" is now: ${STATUS_LABEL[application.status]}.${note ? ` ${note}` : ""}`,
      type: "scholarship_update",
      link: "/scholarships",
    });
  } catch {
    // A failed notification must never block the decision
  }
};

// ---------------------------------------------------------------------------------------------------------------
// Admin: scholarships
// ---------------------------------------------------------------------------------------------------------------

/** POST /api/lms/admin/scholarships */
export const createScholarship = async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!body.title || !String(body.title).trim()) return fail(res, 400, "title is required");
    const opensAt = toDate(body.opensAt);
    const closesAt = toDate(body.closesAt);
    if (!opensAt || !closesAt) return fail(res, 400, "opensAt and closesAt must be valid dates");
    if (closesAt <= opensAt) return fail(res, 400, "closesAt must be after opensAt");

    const eligibility = body.eligibility === undefined ? [] : cleanList(body.eligibility);
    const requiredDocuments = body.requiredDocuments === undefined ? [] : cleanList(body.requiredDocuments);
    if (eligibility === null || requiredDocuments === null) return fail(res, 400, "eligibility and requiredDocuments must be lists of text");

    if (body.trimesterId) {
      if (!isId(body.trimesterId) || !(await Trimester.exists({ _id: body.trimesterId }))) return fail(res, 404, "Trimester not found");
    }

    const scholarship = await Scholarship.create({
      title: String(body.title).trim(),
      summary: body.summary ? String(body.summary).trim() : "",
      description: body.description ? String(body.description).trim() : "",
      eligibility,
      requiredDocuments,
      opensAt,
      closesAt,
      trimesterId: body.trimesterId || null,
      status: "draft",
      createdBy: req.user._id,
    });
    return res.status(201).json({ scholarship });
  } catch (error) {
    next(error);
  }
};

/** GET /api/lms/admin/scholarships */
export const listScholarshipsAdmin = async (req, res, next) => {
  try {
    const scholarships = await Scholarship.find().sort({ createdAt: -1 }).lean();
    const counts = await ScholarshipApplication.aggregate([{ $group: { _id: { s: "$scholarshipId", status: "$status" }, n: { $sum: 1 } } }]);
    const byScholarship = new Map();
    for (const row of counts) {
      const key = String(row._id.s);
      byScholarship.set(key, { ...(byScholarship.get(key) || {}), [row._id.status]: row.n });
    }
    return res.status(200).json({
      scholarships: scholarships.map((s) => {
        const applicationCounts = Object.fromEntries(APPLICATION_STATUSES.map((status) => [status, byScholarship.get(String(s._id))?.[status] ?? 0]));
        return { ...s, state: windowState(s), applicationCounts, applicationTotal: Object.values(applicationCounts).reduce((a, b) => a + b, 0) };
      }),
    });
  } catch (error) {
    next(error);
  }
};

/** PUT /api/lms/admin/scholarships/:id */
export const updateScholarship = async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return fail(res, 400, "Invalid scholarship ID format");
    const scholarship = await Scholarship.findById(req.params.id);
    if (!scholarship) return fail(res, 404, "Scholarship not found");
    const body = req.body || {};

    if (body.title !== undefined) {
      if (!String(body.title).trim()) return fail(res, 400, "title cannot be empty");
      scholarship.title = String(body.title).trim();
    }
    if (body.summary !== undefined) scholarship.summary = String(body.summary).trim();
    if (body.description !== undefined) scholarship.description = String(body.description).trim();
    for (const field of ["eligibility", "requiredDocuments"]) {
      if (body[field] !== undefined) {
        const list = cleanList(body[field]);
        if (list === null) return fail(res, 400, `${field} must be a list of text`);
        scholarship[field] = list;
      }
    }
    if (body.opensAt !== undefined || body.closesAt !== undefined) {
      const opensAt = body.opensAt !== undefined ? toDate(body.opensAt) : scholarship.opensAt;
      const closesAt = body.closesAt !== undefined ? toDate(body.closesAt) : scholarship.closesAt;
      if (!opensAt || !closesAt) return fail(res, 400, "opensAt and closesAt must be valid dates");
      if (closesAt <= opensAt) return fail(res, 400, "closesAt must be after opensAt");
      scholarship.opensAt = opensAt;
      scholarship.closesAt = closesAt;
    }
    if (body.trimesterId !== undefined) {
      if (body.trimesterId === null) scholarship.trimesterId = null;
      else if (!isId(body.trimesterId) || !(await Trimester.exists({ _id: body.trimesterId }))) return fail(res, 404, "Trimester not found");
      else scholarship.trimesterId = body.trimesterId;
    }

    if (body.status !== undefined) {
      if (!SCHOLARSHIP_STATUSES.includes(body.status)) return fail(res, 400, `status must be one of: ${SCHOLARSHIP_STATUSES.join(", ")}`);
      if (body.status === "published") {
        const missing = missingForPublish(scholarship);
        if (missing.length) return fail(res, 422, `Not ready to publish. Missing: ${missing.join(", ")}`, { code: "NOT_READY_TO_PUBLISH", missing });
      }
      if (body.status === "draft" && scholarship.status !== "draft" && (await ScholarshipApplication.exists({ scholarshipId: scholarship._id }))) {
        return fail(res, 409, "A scholarship with applications cannot go back to draft. Archive it instead.", { code: "HAS_APPLICATIONS" });
      }
      scholarship.status = body.status;
    }

    await scholarship.save();
    return res.status(200).json({ scholarship });
  } catch (error) {
    next(error);
  }
};

/** GET /api/lms/admin/scholarships/:id/applications?status= */
export const listApplicationsAdmin = async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return fail(res, 400, "Invalid scholarship ID format");
    if (req.query.status && !APPLICATION_STATUSES.includes(req.query.status)) return fail(res, 400, `status must be one of: ${APPLICATION_STATUSES.join(", ")}`);
    const scholarship = await Scholarship.findById(req.params.id).lean();
    if (!scholarship) return fail(res, 404, "Scholarship not found");

    const filter = { scholarshipId: scholarship._id, ...(req.query.status ? { status: req.query.status } : {}) };
    const applications = await ApplicationsWithApplicant(filter);
    return res.status(200).json({ scholarship: { _id: scholarship._id, title: scholarship.title, requiredDocuments: scholarship.requiredDocuments }, applications });
  } catch (error) {
    next(error);
  }
};

const ApplicationsWithApplicant = async (filter) => {
  const applications = await ScholarshipApplication.find(filter).sort({ submittedAt: 1 }).populate("userId", "firstName lastName email").lean();
  return applications.map((application) => {
    const { userId, ...rest } = application;
    return { ...rest, applicant: userId ? { _id: userId._id, name: [userId.firstName, userId.lastName].filter(Boolean).join(" "), email: userId.email } : null };
  });
};

/** PUT /api/lms/admin/scholarship-applications/:id/status  { status, note, internalNote } */
export const setApplicationStatus = async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return fail(res, 400, "Invalid application ID format");
    const { status } = req.body || {};
    const note = req.body?.note ? String(req.body.note).trim() : "";
    const internalNote = req.body?.internalNote ? String(req.body.internalNote).trim() : "";
    if (!APPLICATION_STATUSES.includes(status)) return fail(res, 400, `status must be one of: ${APPLICATION_STATUSES.join(", ")}`);

    const application = await ScholarshipApplication.findById(req.params.id);
    if (!application) return fail(res, 404, "Application not found");

    const allowed = TRANSITIONS[application.status] ?? [];
    if (!allowed.includes(status)) {
      return fail(res, 409, `An application that is ${application.status.replace("_", " ")} cannot move to ${status.replace("_", " ")}`, { code: "INVALID_TRANSITION", allowed });
    }
    if (status === "rejected" && !note) return fail(res, 400, "A rejection needs a note the applicant can see", { code: "REJECTION_NEEDS_NOTE" });

    // Moves only from the status we just read, so two reviewers cannot both apply a move from the same state
    const updated = await ScholarshipApplication.findOneAndUpdate(
      { _id: application._id, status: application.status },
      { $set: { status }, $push: { history: { status, note, internalNote, by: req.user._id, at: new Date() } } },
      { returnDocument: "after" }
    );
    if (!updated) return fail(res, 409, "This application was changed by someone else. Reload and try again.", { code: "CONCURRENT_CHANGE" });

    const scholarship = await Scholarship.findById(updated.scholarshipId).select("title");
    await notifyApplicant(updated, scholarship ?? { title: "your scholarship" }, note);
    return res.status(200).json({ application: updated });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------------------------------------------
// Public and student
// ---------------------------------------------------------------------------------------------------------------

/** GET /api/lms/public/scholarships */
export const getPublicScholarships = async (req, res, next) => {
  try {
    const scholarships = await Scholarship.find({ status: "published" }).sort({ closesAt: 1 }).lean();
    const mine = req.user
      ? await ScholarshipApplication.find({ userId: req.user._id, scholarshipId: { $in: scholarships.map((s) => s._id) } }).lean()
      : [];
    const byScholarship = new Map(mine.map((application) => [String(application.scholarshipId), application]));
    return res.status(200).json({ scholarships: scholarships.map((s) => publicScholarship(s, byScholarship.get(String(s._id)))) });
  } catch (error) {
    next(error);
  }
};

/** POST /api/lms/scholarships/:id/applications  { statement, documents } */
export const applyToScholarship = async (req, res, next) => {
  try {
    if (req.user.role !== "student") return fail(res, 403, "Only students can apply for a scholarship");
    if (!isId(req.params.id)) return fail(res, 400, "Invalid scholarship ID format");

    const scholarship = await Scholarship.findOne({ _id: req.params.id, status: "published" });
    if (!scholarship) return fail(res, 404, "Scholarship not found");

    const state = windowState(scholarship);
    if (state === "upcoming") return fail(res, 409, "Applications for this scholarship have not opened yet", { code: "SCHOLARSHIP_NOT_OPEN" });
    if (state === "closed") return fail(res, 409, "Applications for this scholarship are closed", { code: "SCHOLARSHIP_CLOSED" });

    const statement = String(req.body?.statement ?? "").trim();
    if (statement.length < 20 || statement.length > 3000) return fail(res, 400, "statement must be between 20 and 3000 characters");

    const documents = req.body?.documents === undefined ? [] : req.body.documents;
    if (!Array.isArray(documents) || documents.length > MAX_DOCUMENTS) return fail(res, 400, `documents must be a list of at most ${MAX_DOCUMENTS} items`);
    const cleaned = [];
    for (const doc of documents) {
      const label = String(doc?.label ?? "").trim();
      const key = String(doc?.key ?? "").trim();
      if (!label || !key) return fail(res, 400, "Each document needs a label and a key");
      if (!key.startsWith("documents/") || key.includes("..")) return fail(res, 400, "Each document key must be a file uploaded to the documents folder");
      cleaned.push({ label, key });
    }
    const provided = new Set(cleaned.map((doc) => doc.label.toLowerCase()));
    const missingDocs = (scholarship.requiredDocuments ?? []).filter((label) => !provided.has(label.toLowerCase()));
    if (missingDocs.length) return fail(res, 400, `Missing required documents: ${missingDocs.join(", ")}`, { code: "DOCUMENTS_MISSING", missing: missingDocs });

    if (await ScholarshipApplication.exists({ scholarshipId: scholarship._id, userId: req.user._id })) {
      return fail(res, 409, "You have already applied for this scholarship", { code: "ALREADY_APPLIED" });
    }

    let application;
    try {
      application = await ScholarshipApplication.create({
        scholarshipId: scholarship._id,
        userId: req.user._id,
        statement,
        documents: cleaned,
        status: "submitted",
        history: [{ status: "submitted", note: "", by: req.user._id, at: new Date() }],
      });
    } catch (error) {
      // The unique index also catches two simultaneous submissions
      if (error?.code === 11000) return fail(res, 409, "You have already applied for this scholarship", { code: "ALREADY_APPLIED" });
      throw error;
    }
    return res.status(201).json({ message: "Application submitted", application: { _id: application._id, status: application.status, submittedAt: application.submittedAt } });
  } catch (error) {
    next(error);
  }
};

/** GET /api/lms/scholarships/applications/me */
export const getMyApplications = async (req, res, next) => {
  try {
    if (req.user.role !== "student") return fail(res, 403, "Only students have scholarship applications");
    const applications = await ScholarshipApplication.find({ userId: req.user._id }).sort({ submittedAt: -1 }).populate("scholarshipId", "title closesAt").lean();
    return res.status(200).json({
      applications: applications.map((application) => ({
        _id: application._id,
        scholarship: application.scholarshipId ? { _id: application.scholarshipId._id, title: application.scholarshipId.title, closesAt: application.scholarshipId.closesAt } : null,
        status: application.status,
        statement: application.statement,
        documents: application.documents,
        submittedAt: application.submittedAt,
        history: withoutStaffNotes(application.history),
        latest: latestOf(application.history),
      })),
    });
  } catch (error) {
    next(error);
  }
};

/** PUT /api/lms/scholarship-applications/:id/withdraw */
export const withdrawApplication = async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return fail(res, 400, "Invalid application ID format");
    // Ownership is part of the filter, so someone else's application looks like it does not exist
    const application = await ScholarshipApplication.findOne({ _id: req.params.id, userId: req.user._id });
    if (!application) return fail(res, 404, "Application not found");
    if (!WITHDRAWABLE.includes(application.status)) {
      return fail(res, 409, `An application that is ${application.status.replace("_", " ")} cannot be withdrawn`, { code: "INVALID_TRANSITION" });
    }
    const updated = await ScholarshipApplication.findOneAndUpdate(
      { _id: application._id, status: application.status },
      { $set: { status: "withdrawn" }, $push: { history: { status: "withdrawn", note: "Withdrawn by the applicant", by: req.user._id, at: new Date() } } },
      { returnDocument: "after" }
    );
    if (!updated) return fail(res, 409, "This application was changed by someone else. Reload and try again.", { code: "CONCURRENT_CHANGE" });
    return res.status(200).json({ message: "Application withdrawn", application: { _id: updated._id, status: updated.status, latest: latestOf(updated.history) } });
  } catch (error) {
    next(error);
  }
};
