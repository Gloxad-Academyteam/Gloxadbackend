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
      lessons: { type: Number, default: 25 },
      quizzes: { type: Number, default: 25 },
      assignments: { type: Number, default: 25 },
      attendance: { type: Number, default: 10 },
      finalProject: { type: Number, default: 15 },
      passingThreshold: { type: Number, default: 70 },
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
