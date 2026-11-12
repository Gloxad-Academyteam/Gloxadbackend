import mongoose, { Schema } from "mongoose";

export const SCHOLARSHIP_STATUSES = ["draft", "published", "archived"];

const ScholarshipSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    summary: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
    // Plain-language rules shown to applicants
    eligibility: [{ type: String, trim: true }],
    // Labels of the documents an applicant must upload, e.g. "Proof of enrolment"
    requiredDocuments: [{ type: String, trim: true }],
    opensAt: { type: Date, required: true },
    closesAt: { type: Date, required: true },
    // Informational link to a Trimester; approval does not create access
    trimesterId: { type: Schema.Types.ObjectId, ref: "Trimester", default: null },
    status: { type: String, enum: SCHOLARSHIP_STATUSES, default: "draft", index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const Scholarship = mongoose.model("Scholarship", ScholarshipSchema);
export default Scholarship;
