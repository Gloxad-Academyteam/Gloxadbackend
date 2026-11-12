import mongoose, { Schema } from "mongoose";

const LmsCertificateSchema = new Schema(
  {
    certificateId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    cohortId: {
      type: Schema.Types.ObjectId,
      ref: "Cohort",
      required: true,
      index: true,
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    subtitle: {
      type: String,
      default: "Full-Stack Web Development",
      trim: true,
    },
    badge: {
      type: String,
      default: "Gloxad Certified",
      trim: true,
    },
    pdfKey: {
      type: String,
      default: "",
      trim: true,
    },
    issuedAt: {
      type: Date,
      default: Date.now,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    revokedReason: {
      type: String,
      default: null,
    },
    revokedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // How the certificate was issued. "override" means an admin issued it to a learner who was not yet eligible and wrote why.
    issuedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    issuedBasis: {
      type: String,
      enum: ["eligible", "override"],
      default: "eligible",
    },
    overrideReason: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: "lmscertificates",
  }
);

export const LmsCertificate = mongoose.model("LmsCertificate", LmsCertificateSchema);
export default LmsCertificate;
