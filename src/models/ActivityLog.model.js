import mongoose, { Schema } from "mongoose";

// One row for each thing that happens on the app: a sign-in, a change, a payment, a failure.
// It stores who did it, what it was and how it went. It never stores request bodies, passwords or tokens.
const ActivityLogSchema = new Schema(
  {
    label: { type: String, required: true },
    category: {
      type: String,
      enum: ["auth", "course", "learning", "payment", "live", "message", "admin", "tutor", "institution", "other"],
      default: "other",
      index: true,
    },
    method: { type: String, required: true },
    path: { type: String, required: true },
    status: { type: Number, required: true },
    ok: { type: Boolean, required: true, index: true },
    durationMs: { type: Number, default: 0 },
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    actorName: { type: String, default: "" },
    actorEmail: { type: String, default: "" },
    actorRole: { type: String, default: "" },
    targetId: { type: String, default: "" },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ActivityLogSchema.index({ createdAt: -1 });
// Keep six months, then let the database tidy up
ActivityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

export const ActivityLog = mongoose.models.ActivityLog || mongoose.model("ActivityLog", ActivityLogSchema);
export default ActivityLog;
