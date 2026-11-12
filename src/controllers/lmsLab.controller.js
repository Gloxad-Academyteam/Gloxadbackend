import { LmsLab, LmsLabSubmission } from "../models/LmsLab.model.js";
import mongoose from "mongoose";
import { Cohort } from "../models/Cohort.model.js";

const LANGUAGES = ["javascript", "typescript", "python", "html", "css", "sql"];
const MAX_CODE_CHARS = 100000;

/** Students of the cohort, its tutors and admins may use a lab. Before this check any signed-in user could. */
const canUseLab = async (lab, user) => {
  if (user.role === "admin") return true;
  const cohort = await Cohort.findById(lab.cohortId).select("studentIds instructorIds");
  const id = String(user._id);
  return Boolean(cohort) && (cohort.studentIds.some((s) => String(s) === id) || cohort.instructorIds.some((i) => String(i) === id));
};
const denied = (res) => res.status(403).json({ error: "You are not enrolled in this cohort", code: "COHORT_ACCESS_DENIED" });
const badId = (res) => res.status(400).json({ error: "Invalid lab ID format" });

/**
 * GET /api/lms/cohorts/:cohortId/labs
 * Lists all coding labs scheduled for the cohort
 */
export const getCohortLabs = async (req, res, next) => {
  try {
    const cohort = req.cohort;
    const userId = req.user._id;

    const labs = await LmsLab.find({ cohortId: cohort._id }).sort({ createdAt: 1 }).lean();

    const submissions = await LmsLabSubmission.find({
      cohortId: cohort._id,
      userId,
    }).lean();

    const subMap = new Map(submissions.map((s) => [String(s.labId), s]));

    const formattedLabs = labs.map((lab) => {
      const sub = subMap.get(String(lab._id));
      return {
        _id: lab._id,
        title: lab.title,
        description: lab.description,
        language: lab.language,
        dueAt: lab.dueAt,
        status: sub?.status || "not_started",
        passedTests: sub?.passedTests || 0,
        totalTests: sub?.totalTests || lab.testCases?.length || 0,
        submittedAt: sub?.submittedAt || null,
        hasDraft: !!sub?.draftCode,
      };
    });

    return res.status(200).json({
      cohortId: cohort._id,
      labs: formattedLabs,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/lms/labs/:labId
 * Returns lab instructions, starter code, test case definitions, and current student draft
 */
export const getLabDetail = async (req, res, next) => {
  try {
    const { labId } = req.params;
    const userId = req.user._id;

    if (!mongoose.isValidObjectId(labId)) return badId(res);
    const lab = await LmsLab.findById(labId).lean();
    if (!lab) {
      return res.status(404).json({ error: "Coding lab not found" });
    }
    if (!(await canUseLab(lab, req.user))) return denied(res);

    const submission = await LmsLabSubmission.findOne({
      labId,
      userId,
    }).lean();

    const sanitizedTestCases = (lab.testCases || []).map((t) => ({
      name: t.name,
      input: t.input,
      expectedOutput: t.hidden ? "[HIDDEN]" : t.expectedOutput,
      hidden: t.hidden,
    }));

    return res.status(200).json({
      _id: lab._id,
      title: lab.title,
      description: lab.description,
      instructions: lab.instructions,
      language: lab.language,
      starterCode: lab.starterCode,
      testCases: sanitizedTestCases,
      dueAt: lab.dueAt,
      draftCode: submission?.draftCode || lab.starterCode,
      lastAutosavedAt: submission?.lastAutosavedAt || null,
      status: submission?.status || "not_started",
      passedTests: submission?.passedTests || 0,
      totalTests: sanitizedTestCases.length,
      unverified: submission?.unverified !== undefined ? submission.unverified : true,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/lms/labs/:labId/autosave
 * Autosaves student code draft silently without formal submission
 */
export const autosaveLabCode = async (req, res, next) => {
  try {
    const { labId } = req.params;
    const userId = req.user._id;
    const { code } = req.body;

    if (!mongoose.isValidObjectId(labId)) return badId(res);
    if (typeof code !== "string") {
      return res.status(400).json({ error: "code string is required for autosave" });
    }
    if (code.length > MAX_CODE_CHARS) return res.status(400).json({ error: `Code is too long (limit ${MAX_CODE_CHARS} characters)` });

    const lab = await LmsLab.findById(labId);
    if (!lab) {
      return res.status(404).json({ error: "Coding lab not found" });
    }
    if (!(await canUseLab(lab, req.user))) return denied(res);

    const submission = await LmsLabSubmission.findOneAndUpdate(
      { labId, userId },
      {
        $set: {
          cohortId: lab.cohortId,
          draftCode: code,
          lastAutosavedAt: new Date(),
        },
      },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      saved: true,
      lastAutosavedAt: submission.lastAutosavedAt,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/lms/labs/:labId/draft
 * Retrieves student's current code draft
 */
export const getLabDraft = async (req, res, next) => {
  try {
    const { labId } = req.params;
    const userId = req.user._id;

    if (!mongoose.isValidObjectId(labId)) return badId(res);
    const draftLab = await LmsLab.findById(labId).select("cohortId");
    if (!draftLab) return res.status(404).json({ error: "Coding lab not found" });
    if (!(await canUseLab(draftLab, req.user))) return denied(res);

    const submission = await LmsLabSubmission.findOne({ labId, userId });
    return res.status(200).json({
      draftCode: submission?.draftCode || "",
      lastAutosavedAt: submission?.lastAutosavedAt || null,
      status: submission?.status || "not_started",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/lms/labs/:labId/submit
 * Submits lab solution with browser-evaluated test results (unverified: true)
 */
export const submitLab = async (req, res, next) => {
  try {
    const { labId } = req.params;
    const userId = req.user._id;
    const { code, passedTests, totalTests } = req.body;

    if (!mongoose.isValidObjectId(labId)) return badId(res);
    const lab = await LmsLab.findById(labId);
    if (!lab) {
      return res.status(404).json({ error: "Coding lab not found" });
    }
    if (!(await canUseLab(lab, req.user))) return denied(res);
    if (typeof code === "string" && code.length > MAX_CODE_CHARS) return res.status(400).json({ error: `Code is too long (limit ${MAX_CODE_CHARS} characters)` });

    const submission = await LmsLabSubmission.findOneAndUpdate(
      { labId, userId },
      {
        $set: {
          cohortId: lab.cohortId,
          submittedCode: code || "",
          passedTests: typeof passedTests === "number" ? passedTests : 0,
          totalTests: typeof totalTests === "number" ? totalTests : (lab.testCases?.length || 0),
          unverified: true,
          status: "submitted",
          submittedAt: new Date(),
        },
      },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      message: "Coding lab submitted successfully",
      submission: {
        _id: submission._id,
        labId: submission.labId,
        passedTests: submission.passedTests,
        totalTests: submission.totalTests,
        unverified: submission.unverified,
        status: submission.status,
        submittedAt: submission.submittedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/** Checks the lab body shared by create and update. Returns { fields } or { error }. */
const cleanLab = (body, partial) => {
  const fields = {};
  if (!partial || body.title !== undefined) {
    if (!String(body.title ?? "").trim()) return { error: "title is required" };
    fields.title = String(body.title).trim();
  }
  for (const key of ["description", "instructions", "starterCode"]) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "string" || body[key].length > MAX_CODE_CHARS) return { error: `${key} must be text of at most ${MAX_CODE_CHARS} characters` };
      fields[key] = body[key];
    }
  }
  if (body.language !== undefined) {
    if (!LANGUAGES.includes(body.language)) return { error: `language must be one of: ${LANGUAGES.join(", ")}` };
    fields.language = body.language;
  }
  if (body.dueAt !== undefined) {
    const due = body.dueAt === null ? null : new Date(body.dueAt);
    if (due !== null && Number.isNaN(due.getTime())) return { error: "dueAt must be a valid date" };
    fields.dueAt = due;
  }
  if (body.testCases !== undefined) {
    if (!Array.isArray(body.testCases) || body.testCases.length > 50) return { error: "testCases must be a list of at most 50 tests" };
    const tests = [];
    for (const test of body.testCases) {
      const name = String(test?.name ?? "").trim();
      if (!name || test?.expectedOutput === undefined) return { error: "Each test needs a name and an expectedOutput" };
      tests.push({ name, input: String(test.input ?? ""), expectedOutput: String(test.expectedOutput), hidden: Boolean(test.hidden) });
    }
    fields.testCases = tests;
  }
  return { fields };
};

const canAuthor = (cohort, user) => user.role === "admin" || cohort.instructorIds.some((id) => String(id) === String(user._id));

/**
 * POST /api/lms/cohorts/:cohortId/labs  (tutor of the cohort or admin)
 */
export const createLab = async (req, res, next) => {
  try {
    const { cohortId } = req.params;
    if (!mongoose.isValidObjectId(cohortId)) return res.status(400).json({ error: "Invalid cohort ID format" });
    const cohort = await Cohort.findById(cohortId).select("instructorIds");
    if (!cohort) return res.status(404).json({ error: "Cohort not found" });
    if (!canAuthor(cohort, req.user)) return res.status(403).json({ error: "You are not assigned to this cohort", code: "COHORT_ACCESS_DENIED" });

    const { fields, error } = cleanLab(req.body || {}, false);
    if (error) return res.status(400).json({ error });
    const lab = await LmsLab.create({ cohortId, ...fields });
    return res.status(201).json({ lab: { _id: lab._id, title: lab.title, language: lab.language, testCount: lab.testCases.length } });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/lms/labs/:labId  (tutor of the cohort or admin)
 */
export const updateLab = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.labId)) return badId(res);
    const lab = await LmsLab.findById(req.params.labId);
    if (!lab) return res.status(404).json({ error: "Coding lab not found" });
    const cohort = await Cohort.findById(lab.cohortId).select("instructorIds");
    if (!cohort || !canAuthor(cohort, req.user)) return res.status(403).json({ error: "You are not assigned to this cohort", code: "COHORT_ACCESS_DENIED" });

    const { fields, error } = cleanLab(req.body || {}, true);
    if (error) return res.status(400).json({ error });
    Object.assign(lab, fields);
    await lab.save();
    return res.status(200).json({ lab: { _id: lab._id, title: lab.title, language: lab.language, testCount: lab.testCases.length } });
  } catch (error) {
    next(error);
  }
};

export default {
  createLab,
  updateLab,
  getCohortLabs,
  getLabDetail,
  autosaveLabCode,
  getLabDraft,
  submitLab,
};

