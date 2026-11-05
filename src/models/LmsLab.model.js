import mongoose, { Schema } from "mongoose";

const LmsLabSchema = new Schema(
  {
    cohortId: {
      type: Schema.Types.ObjectId,
      ref: "Cohort",
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
    instructions: {
      type: String,
      default: "",
    },
    language: {
      type: String,
      enum: ["javascript", "typescript", "python", "html", "css", "sql"],
      default: "javascript",
    },
    starterCode: {
      type: String,
      default: "// Write your solution here\n",
    },
    solutionCode: {
      type: String,
      default: "",
    },
    testCases: [
      {
        name: { type: String, required: true },
        input: { type: String, default: "" },
        expectedOutput: { type: String, required: true },
        hidden: { type: Boolean, default: false },
      },
    ],
    dueAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const LmsLabSubmissionSchema = new Schema(
  {
    labId: {
      type: Schema.Types.ObjectId,
      ref: "LmsLab",
      required: true,
      index: true,
    },
    cohortId: {
      type: Schema.Types.ObjectId,
      ref: "Cohort",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    draftCode: {
      type: String,
      default: "",
    },
    lastAutosavedAt: {
      type: Date,
      default: null,
    },
    submittedCode: {
      type: String,
      default: "",
    },
    passedTests: {
      type: Number,
      default: 0,
    },
    totalTests: {
      type: Number,
      default: 0,
    },
    unverified: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ["draft", "submitted", "graded"],
      default: "draft",
      index: true,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

LmsLabSubmissionSchema.index({ labId: 1, userId: 1 }, { unique: true });

export const LmsLab = mongoose.model("LmsLab", LmsLabSchema);
export const LmsLabSubmission = mongoose.model("LmsLabSubmission", LmsLabSubmissionSchema);

export default {
  LmsLab,
  LmsLabSubmission,
};

