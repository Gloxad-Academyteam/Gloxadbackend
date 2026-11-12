import mongoose, { Schema } from "mongoose";

const CohortSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    trimesterId: {
      type: Schema.Types.ObjectId,
      ref: "Trimester",
      required: true,
      index: true,
    },
    instructorIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },
    ],
    studentIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },
    ],
    capacity: {
      type: Number,
      default: 50,
    },
    timezone: {
      type: String,
      default: "Africa/Lagos",
    },
    currentWeek: {
      type: Number,
      default: 1,
    },
    status: {
      type: String,
      enum: ["enrolling", "active", "completed", "archived"],
      default: "enrolling",
      index: true,
    },
    completionWeights: {
      quizzes: { type: Number, default: 15 },
      assignments: { type: Number, default: 15 },
      practicals: { type: Number, default: 15 },
      codingChallenges: { type: Number, default: 10 },
      attendance: { type: Number, default: 10 },
      weeklyTasks: { type: Number, default: 10 },
      finalProject: { type: Number, default: 25 },
      lessons: { type: Number, default: 0 },
      passingThreshold: { type: Number, default: 70 },
    },
    latePolicyCaps: {
      onTimePercent: { type: Number, default: 100 },
      firstMissedDeadlinePercent: { type: Number, default: 66.7 },
      secondAttemptPercent: { type: Number, default: 33.3 },
      laterAttemptsPercent: { type: Number, default: 13.3 },
      unsubmittedPercent: { type: Number, default: 0 },
    },
    // Rules that flag learners who may need support. Admin-configurable per cohort (spec 27).
    supportThresholds: {
      lowProgressPercent: { type: Number, default: 40 },
      lowAttendancePercent: { type: Number, default: 60 },
      lateSubmissions: { type: Number, default: 2 },
    },
    announcements: [
      {
        title: { type: String, required: true, trim: true },
        message: { type: String, required: true, trim: true },
        author: { type: Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

export const Cohort = mongoose.model("Cohort", CohortSchema);
export default Cohort;
