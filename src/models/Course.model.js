import mongoose from "mongoose";

// Lesson Subdocument Schema
const lessonSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    videoUrl: { type: String, default: "" },
    duration: { type: String, default: "00:00" },
    isFreePreview: { type: Boolean, default: false },
    creator: { type: String, default: "" },
    sourceUrl: { type: String, default: "" },
    embedAllowed: { type: Boolean, default: true }
  },
  { _id: true }
);

// Quiz Question Subdocument Schema
const quizQuestionSchema = new mongoose.Schema(
  {
    questionText: { type: String, required: true, trim: true },
    options: [{ type: String, required: true, trim: true }],
    correctOptionIndex: { type: Number, required: true }
  },
  { _id: true }
);

// Quiz Subdocument Schema
const quizSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    passingScore: { type: Number, default: 70 },
    questions: [quizQuestionSchema]
  },
  { _id: true }
);

// Module Subdocument Schema
const moduleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    lessons: [lessonSchema],
    quizzes: [quizSchema]
  },
  { _id: true }
);

// Master Course Schema
const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, index: true },
    subtitle: { type: String, trim: true, default: "" },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    category: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      index: true
    },
    subCategory: { type: String, trim: true, default: "" },
    topic: { type: String, trim: true, default: "" },
    language: { type: String, default: "English" },
    level: {
      type: String,
      enum: ["beginner", "intermediate", "advanced", "all-levels"],
      default: "beginner"
    },
    courseType: {
      type: String,
      enum: ["free", "paid", "trimester"],
      required: true,
      index: true
    },
    enrollmentOpen: {
      type: Boolean,
      default: true,
      index: true
    },
    price: { type: Number, default: 0, min: 0 },
    discountPrice: { type: Number, default: 0, min: 0 },
    thumbnail: { type: String, default: "" },
    trailerVideoUrl: { type: String, default: "" },
    description: { type: String, default: "" },
    skills: [{ type: String, trim: true }],
    targetAudience: [{ type: String, trim: true }],
    requirements: [{ type: String, trim: true }],
    modules: [moduleSchema],
    welcomeMessage: { type: String, default: "" },
    congratsMessage: { type: String, default: "" },
    status: {
      type: String,
      enum: ["draft", "pending", "published", "rejected"],
      default: "draft",
      index: true
    },
    rejectionReason: {
      type: String,
      default: null
    },
    reviewedAt: {
      type: Date,
      default: null
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    enrolledCount: { type: Number, default: 0, index: true },
    ratingsCount: { type: Number, default: 0 },
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 }
    }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.__v;
        if (ret.rating && ret.rating.count !== undefined) {
          ret.ratingsCount = ret.rating.count;
        } else if (ret.ratingsCount !== undefined) {
          if (!ret.rating) ret.rating = { average: 0, count: ret.ratingsCount };
          else ret.rating.count = ret.ratingsCount;
        }
        return ret;
      }
    }
  }
);

// MongoDB Compound & Full-Text Indexes
courseSchema.index({
  title: "text",
  subtitle: "text",
  description: "text",
  topic: "text",
  skills: "text"
});

export const generateSlug = (title) => {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export const Course = mongoose.models.Course || mongoose.model("Course", courseSchema);
export default Course;

