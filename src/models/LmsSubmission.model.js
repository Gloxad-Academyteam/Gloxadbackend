import mongoose, { Schema } from "mongoose";

const LmsSubmissionSchema = new Schema(
  {
    assignmentId: {
      type: Schema.Types.ObjectId,
      ref: "LmsAssignment",
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
    fileKey: {
      type: String,
      default: "",
    },
    repoUrl: {
      type: String,
      default: "",
      trim: true,
    },
    comment: {
      type: String,
      default: "",
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    isLate: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["submitted", "pending_review", "revisions_requested", "graded"],
      default: "pending_review",
      index: true,
    },
    revisions: [
      {
        fileKey: { type: String, default: "" },
        repoUrl: { type: String, default: "" },
        comment: { type: String, default: "" },
        submittedAt: { type: Date, default: Date.now },
        feedback: { type: String, default: "" },
      },
    ],
    grade: {
      score: {
        type: Number,
        default: null,
      },
      max: {
        type: Number,
        default: 100,
      },
      feedback: {
        type: String,
        default: "",
      },
      rubricScores: [
        {
          criterion: {
            type: String,
          },
          pointsAwarded: {
            type: Number,
          },
        },
      ],
      gradedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      gradedAt: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to guarantee one submission document per student per assignment
LmsSubmissionSchema.index({ assignmentId: 1, userId: 1 }, { unique: true });

export const LmsSubmission = mongoose.model(
  "LmsSubmission",
  LmsSubmissionSchema
);
export default LmsSubmission;
