import { LmsLab, LmsLabSubmission } from "../models/LmsLab.model.js";
import { Cohort } from "../models/Cohort.model.js";

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

    const lab = await LmsLab.findById(labId).lean();
    if (!lab) {
      return res.status(404).json({ error: "Coding lab not found" });
    }

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

    if (typeof code !== "string") {
      return res.status(400).json({ error: "code string is required for autosave" });
    }

    const lab = await LmsLab.findById(labId);
    if (!lab) {
      return res.status(404).json({ error: "Coding lab not found" });
    }

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

    const lab = await LmsLab.findById(labId);
    if (!lab) {
      return res.status(404).json({ error: "Coding lab not found" });
    }

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

export default {
  getCohortLabs,
  getLabDetail,
  autosaveLabCode,
  getLabDraft,
  submitLab,
};

