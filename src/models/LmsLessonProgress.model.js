import mongoose, { Schema } from "mongoose";

const LmsLessonProgressSchema = new Schema(
  {
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
    lessonId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    moduleId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    status: {
      type: String,
      enum: ["not_started", "in_progress", "completed"],
      default: "not_started",
    },
    watchedSeconds: {
      type: Number,
      default: 0,
    },
    watchProgressPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    scrollPosition: {
      type: Number,
      default: 0,
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      default: "",
    },
    objectivesDone: [
      {
        type: String,
      },
    ],
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index per student per cohort per lesson
LmsLessonProgressSchema.index(
  { cohortId: 1, userId: 1, lessonId: 1 },
  { unique: true }
);

export const LmsLessonProgress = mongoose.model(
  "LmsLessonProgress",
  LmsLessonProgressSchema
);
export default LmsLessonProgress;
