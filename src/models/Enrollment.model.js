import mongoose from 'mongoose';

const enrollmentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    enrolledAt: {
      type: Date,
      default: Date.now,
    },
    completedLessons: [
      {
        type: mongoose.Schema.Types.ObjectId,
      },
    ],
    lastAccessedLesson: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    lastPlaybackPosition: {
      type: Number,
      default: 0,
    },
    quizScores: [
      {
        quizId: { type: mongoose.Schema.Types.ObjectId },
        moduleId: { type: String },
        score: { type: Number, required: true },
        passingScore: { type: Number, default: 70 },
        passed: { type: Boolean, required: true },
        attemptedAt: { type: Date, default: Date.now },
      },
    ],
    taskSubmissions: [
      {
        moduleId: { type: mongoose.Schema.Types.ObjectId, required: true },
        text: { type: String, default: "" },
        link: { type: String, default: "" },
        wordCount: { type: Number, default: 0 },
        submittedAt: { type: Date, default: Date.now },
      },
    ],
    progressPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    certificateId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index to prevent duplicate enrollment records per user & course
enrollmentSchema.index({ user: 1, course: 1 }, { unique: true });

export const Enrollment = mongoose.models.Enrollment || mongoose.model('Enrollment', enrollmentSchema);
export default Enrollment;
