import mongoose, { Schema } from "mongoose";

const GradeAuditSchema = new Schema(
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
      default: null,
      index: true,
    },
    assessmentType: {
      type: String,
      enum: [
        "assignment",
        "quiz",
        "practical",
        "coding_challenge",
        "attendance",
        "weekly_task",
        "final_project",
        "override",
        "completion_weights",
      ],
      required: true,
      index: true,
    },
    assessmentId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    itemTitle: {
      type: String,
      default: "",
    },
    previousMark: {
      type: Number,
      default: null,
    },
    newMark: {
      type: Number,
      default: null,
    },
    previousWeights: {
      type: Schema.Types.Mixed,
      default: null,
    },
    newWeights: {
      type: Schema.Types.Mixed,
      default: null,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    actor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    actorRole: {
      type: String,
      enum: ["instructor", "admin", "system"],
      default: "instructor",
    },
  },
  {
    timestamps: true,
    collection: "gradeaudits",
  }
);

export const GradeAudit = mongoose.model("GradeAudit", GradeAuditSchema);
export default GradeAudit;

