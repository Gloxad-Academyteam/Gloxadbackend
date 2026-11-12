import mongoose, { Schema } from "mongoose";

export const ENROLMENT_STATUSES = ["active", "suspended", "completed", "withdrawn"];

// Cohort.studentIds stays the access list (active and completed students). This record keeps the status and the
// history for every student, including those who withdrew or were suspended and so are no longer in that list.
const HistorySchema = new Schema(
  {
    status: { type: String, enum: ENROLMENT_STATUSES, required: true },
    note: { type: String, default: "", trim: true },
    by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const CohortEnrolmentSchema = new Schema(
  {
    cohortId: { type: Schema.Types.ObjectId, ref: "Cohort", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: ENROLMENT_STATUSES, required: true, index: true },
    enrolledAt: { type: Date, default: Date.now },
    history: [HistorySchema],
  },
  { timestamps: true }
);

CohortEnrolmentSchema.index({ cohortId: 1, userId: 1 }, { unique: true });

export const CohortEnrolment = mongoose.model("CohortEnrolment", CohortEnrolmentSchema);
export default CohortEnrolment;
