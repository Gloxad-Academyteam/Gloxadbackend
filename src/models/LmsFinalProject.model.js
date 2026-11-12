import mongoose, { Schema } from "mongoose";

export const FINAL_PROJECT_STAGES = [
  { stage: 1, key: "topic_submission", label: "Topic & Scope Submission" },
  { stage: 2, key: "proposal_review", label: "Proposal Review & Approval" },
  { stage: 3, key: "architecture_spec", label: "Architecture & System Spec" },
  { stage: 4, key: "milestone_1", label: "Milestone 1 (Core Foundations)" },
  { stage: 5, key: "milestone_2", label: "Milestone 2 (Feature Implementation)" },
  { stage: 6, key: "code_submission", label: "Final Code & PR Submission" },
  { stage: 7, key: "presentation_defense", label: "Project Presentation & Defense" },
  { stage: 8, key: "final_evaluation", label: "Final Evaluation & Sign-off" },
];

const LmsFinalProjectSchema = new Schema(
  {
    cohortId: {
      type: Schema.Types.ObjectId,
      ref: "Cohort",
      required: true,
      index: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    repositoryUrl: {
      type: String,
      default: "",
      trim: true,
    },
    liveDemoUrl: {
      type: String,
      default: "",
      trim: true,
    },
    currentStage: {
      type: Number,
      min: 1,
      max: 8,
      default: 1,
      index: true,
    },
    stageKey: {
      type: String,
      enum: [
        "topic_submission",
        "proposal_review",
        "architecture_spec",
        "milestone_1",
        "milestone_2",
        "code_submission",
        "presentation_defense",
        "final_evaluation",
      ],
      default: "topic_submission",
    },
    stageStatus: {
      type: String,
      enum: [
        "pending_submission",
        "submitted",
        "under_review",
        "approved",
        "revisions_required",
        "pending_admin_approval",
      ],
      default: "pending_submission",
      index: true,
    },
    deliverables: {
      type: Schema.Types.Mixed,
      default: {},
    },
    stageSubmissions: [
      {
        stage: { type: Number, required: true },
        stageKey: { type: String, required: true },
        deliverables: { type: Schema.Types.Mixed, default: {} },
        status: { type: String, enum: ["submitted", "approved", "revisions_required"], default: "submitted" },
        feedback: { type: String, default: "" },
        submittedAt: { type: Date, default: Date.now },
        reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
        reviewedAt: { type: Date, default: null },
      },
    ],
    tutorRecommendation: {
      score: { type: Number, min: 0, max: 100, default: null },
      notes: { type: String, default: "" },
      recommendedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
      recommendedAt: { type: Date, default: null },
    },
    adminSignOff: {
      isApproved: { type: Boolean, default: false },
      approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
      approvedAt: { type: Date, default: null },
      notes: { type: String, default: "" },
    },
    auditTrail: [
      {
        stage: { type: Number, required: true },
        stageKey: { type: String, required: true },
        status: { type: String, required: true },
        action: { type: String, required: true },
        actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
        actorRole: { type: String, default: "student" },
        notes: { type: String, default: "" },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    score: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    isApproved: {
      type: Boolean,
      default: false,
      index: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "lmsfinalprojects",
  }
);

LmsFinalProjectSchema.index({ cohortId: 1, studentId: 1 }, { unique: true });

export const LmsFinalProject = mongoose.model("LmsFinalProject", LmsFinalProjectSchema);
export default LmsFinalProject;

