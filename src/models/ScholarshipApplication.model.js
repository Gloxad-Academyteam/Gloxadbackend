import mongoose, { Schema } from "mongoose";

export const APPLICATION_STATUSES = ["submitted", "under_review", "shortlisted", "approved", "rejected", "withdrawn"];

// History entries are only ever appended. internalNote is staff-only and never shown to the applicant.
const HistorySchema = new Schema(
  {
    status: { type: String, enum: APPLICATION_STATUSES, required: true },
    note: { type: String, default: "", trim: true },
    internalNote: { type: String, default: "", trim: true },
    by: { type: Schema.Types.ObjectId, ref: "User" },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ScholarshipApplicationSchema = new Schema(
  {
    scholarshipId: { type: Schema.Types.ObjectId, ref: "Scholarship", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    statement: { type: String, required: true, trim: true, minlength: 20, maxlength: 3000 },
    documents: [
      {
        label: { type: String, required: true, trim: true },
        key: { type: String, required: true, trim: true },
        _id: false,
      },
    ],
    status: { type: String, enum: APPLICATION_STATUSES, default: "submitted", index: true },
    history: [HistorySchema],
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One application per student per scholarship, including after withdrawing
ScholarshipApplicationSchema.index({ scholarshipId: 1, userId: 1 }, { unique: true });

export const ScholarshipApplication = mongoose.model("ScholarshipApplication", ScholarshipApplicationSchema);
export default ScholarshipApplication;
