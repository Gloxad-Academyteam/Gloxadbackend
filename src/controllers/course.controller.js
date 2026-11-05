import mongoose from "mongoose";
import { Course } from "../models/Course.model.js";
import { Review } from "../models/Review.model.js";
import { Enrollment } from "../models/Enrollment.model.js";

/**
 * Normalizes course category output to { _id, name, slug } everywhere
 */
export const normalizeCategory = (cat) => {
  if (!cat) return { _id: null, name: "General", slug: "general" };
  if (typeof cat === "object" && cat.name) {
    return {
      _id: cat._id || null,
      name: cat.name,
      slug: cat.slug || String(cat.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
    };
  }
  const nameStr = String(cat);
  const slugStr = nameStr.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return {
    _id: null,
    name: nameStr,
    slug: slugStr,
  };
};

/**
 * Content Shielding Helper: Redacts video URLs and quiz answers per Rule 3.
 */
export const applyContentShield = (courseObj, isEnrolled, isInstructorOrAdmin) => {
  const sanitized = JSON.parse(JSON.stringify(courseObj));

  if (Array.isArray(sanitized.modules)) {
    sanitized.modules.forEach((mod) => {
      // Shield Lesson Videos
      if (Array.isArray(mod.lessons)) {
        mod.lessons.forEach((lesson) => {
          if (!isEnrolled && !isInstructorOrAdmin && !lesson.isFreePreview) {
            lesson.videoUrl = null;
          }
        });
      }

      // Shield Quiz Answer Keys
      if (Array.isArray(mod.quizzes)) {
        mod.quizzes.forEach((quiz) => {
          if (Array.isArray(quiz.questions)) {
            quiz.questions.forEach((q) => {
              if (!isInstructorOrAdmin) {
                delete q.correctOptionIndex;
              }
            });
          }
        });
      }
    });
  }

  return sanitized;
};

/**
 * GET /api/courses
 * Public course catalog with full-text search, multi-filters, sorting, and pagination.
 */
export const getCourses = async (req, res, next) => {
  try {
    const {
      search,
      category,
      subCategory,
      courseType,
      level,
      minPrice,
      maxPrice,
      sort = "newest",
      page = 1,
      limit = 10,
      platform,
      source,
      isYouTube,
      isFree,
      excludeEnrolled
    } = req.query;

    const query = { status: "published" };

    // Full-text search
    if (search && search.trim() !== "") {
      query.$text = { $search: search.trim() };
    }

    // Category and subcategory filtering (case-insensitive slug or name match)
    if (category && category.trim() !== "") {
      const parts = category.trim().toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      if (parts.length > 0) {
        const slugPattern = parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s\\&\\-_]+");
        query.category = new RegExp(`^${slugPattern}$`, "i");
      }
    }
    if (subCategory && subCategory.trim() !== "") {
      const parts = subCategory.trim().toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      if (parts.length > 0) {
        const slugPattern = parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s\\&\\-_]+");
        query.subCategory = new RegExp(`^${slugPattern}$`, "i");
      }
    }

    // Enum filters
    const targetType = isFree === "true" || isFree === true ? "free" : courseType;
    if (targetType && ["free", "paid", "trimester"].includes(targetType.toLowerCase())) {
      query.courseType = targetType.toLowerCase();
    }
    if (level && ["beginner", "intermediate", "advanced", "all-levels"].includes(level.toLowerCase())) {
      query.level = level.toLowerCase();
    }

    // Platform / YouTube filter (applied strictly before pagination)
    const targetPlatform = (platform || source || (isYouTube === "true" || isYouTube === true ? "youtube" : "")).toLowerCase().trim();
    if (targetPlatform === "youtube") {
      query.$or = [
        { "source.platform": "youtube" },
        { trailerVideoUrl: /youtube\.com|youtu\.be/i },
        { "modules.lessons.videoUrl": /youtube\.com|youtu\.be/i }
      ];
    } else if (targetPlatform) {
      query["source.platform"] = targetPlatform;
    }

    // Exclude enrolled courses if requested
    if ((excludeEnrolled === "true" || excludeEnrolled === true) && req.user?._id) {
      const enrolledCourseIds = await Enrollment.find({ student: req.user._id }).distinct("course");
      if (enrolledCourseIds.length > 0) {
        query._id = { $nin: enrolledCourseIds };
      }
    }

    // Price range filtering
    if (minPrice !== undefined || maxPrice !== undefined) {
      query.price = {};
      if (minPrice !== undefined && !isNaN(Number(minPrice))) {
        query.price.$gte = Number(minPrice);
      }
      if (maxPrice !== undefined && !isNaN(Number(maxPrice))) {
        query.price.$lte = Number(maxPrice);
      }
    }

    // Sort mapping
    let sortOptions = { createdAt: -1 };
    switch (sort) {
      case "popular":
        sortOptions = { enrolledCount: -1 };
        break;
      case "price-asc":
        sortOptions = { price: 1 };
        break;
      case "price-desc":
        sortOptions = { price: -1 };
        break;
      case "rating":
        sortOptions = { "rating.average": -1 };
        break;
      case "newest":
      default:
        sortOptions = { createdAt: -1 };
        break;
    }

    // Pagination bounds
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const [courses, total] = await Promise.all([
      Course.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .populate("instructor", "firstName lastName avatarUrl bio")
        .select("-modules.lessons.videoUrl -modules.quizzes.questions.correctOptionIndex")
        .lean(),
      Course.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / limitNum);

    const formattedCourses = courses.map((c) => ({
      ...c,
      category: normalizeCategory(c.category),
      source: c.source || {
        platform: (c.trailerVideoUrl && c.trailerVideoUrl.includes("youtube")) ? "youtube" : "external",
        creatorName: "freeCodeCamp.org",
        creatorAvatar: "https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/logos/gloxad-logo.png",
        channelUrl: "https://www.youtube.com/@freecodecamp",
        url: c.trailerVideoUrl || "",
      },
    }));

    return res.status(200).json({
      courses: formattedCourses,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/courses/free-youtube
 * Dedicated discovery endpoint for student dashboard "Free Courses Available" section.
 * Returns up to 6 free YouTube courses (excluding enrolled ones if user is authenticated).
 */
export const getFreeYouTubeCourses = async (req, res, next) => {
  try {
    const limitNum = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 6));
    const query = {
      status: "published",
      courseType: "free",
      $or: [
        { "source.platform": "youtube" },
        { trailerVideoUrl: /youtube\.com|youtu\.be/i },
        { "modules.lessons.videoUrl": /youtube\.com|youtu\.be/i }
      ]
    };

    if (req.user?._id) {
      const enrolled = await Enrollment.find({ student: req.user._id }).distinct("course");
      if (enrolled.length > 0) {
        query._id = { $nin: enrolled };
      }
    }

    const courses = await Course.find(query)
      .sort({ enrolledCount: -1, createdAt: -1 })
      .limit(limitNum)
      .populate("instructor", "firstName lastName avatarUrl bio")
      .select("-modules.lessons.videoUrl -modules.quizzes.questions.correctOptionIndex")
      .lean();

    const formattedCourses = courses.map((c) => ({
      ...c,
      category: normalizeCategory(c.category),
      source: c.source || {
        platform: "youtube",
        creatorName: "freeCodeCamp.org",
        creatorAvatar: "https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/logos/gloxad-logo.png",
        channelUrl: "https://www.youtube.com/@freecodecamp",
        url: c.trailerVideoUrl || "",
      },
    }));

    return res.status(200).json({
      courses: formattedCourses,
      count: formattedCourses.length
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/courses/:slugOrId
 * Public single course view with role-based content protection.
 */
export const getCourseBySlugOrId = async (req, res, next) => {
  try {
    const { slugOrId } = req.params;
    const isObjectId = mongoose.Types.ObjectId.isValid(slugOrId);
    const query = isObjectId ? { _id: slugOrId } : { slug: slugOrId.toLowerCase().trim() };

    const course = await Course.findOne({ ...query, status: "published" })
      .populate("instructor", "firstName lastName avatarUrl bio expertiseBio")
      .lean();

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    let isEnrolled = false;
    let isInstructorOrAdmin = false;

    if (req.user) {
      const userId = req.user._id.toString();
      const userRole = req.user.role;

      const instructorId = course.instructor?._id
        ? course.instructor._id.toString()
        : course.instructor?.toString();

      if (userRole === "admin" || (instructorId && instructorId === userId)) {
        isInstructorOrAdmin = true;
      }

      if (!isInstructorOrAdmin && mongoose.models.Enrollment) {
        const enrollment = await mongoose.model("Enrollment").findOne({
          user: req.user._id,
          course: course._id
        });
        isEnrolled = !!enrollment;
      }
    }

    const sanitizedCourse = applyContentShield(course, isEnrolled, isInstructorOrAdmin);
    sanitizedCourse.category = normalizeCategory(sanitizedCourse.category);
    sanitizedCourse.source = sanitizedCourse.source || {
      platform: (sanitizedCourse.trailerVideoUrl && sanitizedCourse.trailerVideoUrl.includes("youtube")) ? "youtube" : "external",
      creatorName: "freeCodeCamp.org",
      creatorAvatar: "https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/logos/gloxad-logo.png",
      channelUrl: "https://www.youtube.com/@freecodecamp",
      url: sanitizedCourse.trailerVideoUrl || "",
    };

    return res.status(200).json({
      course: sanitizedCourse,
      isEnrolled: isInstructorOrAdmin ? true : isEnrolled
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/courses/:id/reviews
 * Submit rating & review for an enrolled course. Updates course rating.
 */
export const createCourseReviewController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rating, comment, reviewText } = req.body || {};
    const effectiveComment = (comment || reviewText || "").trim();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: "Course not found" });
    }

    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    const numRating = Number(rating);
    if (!rating || isNaN(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({ error: "Rating must be a number between 1 and 5" });
    }

    if (!effectiveComment) {
      return res.status(400).json({ error: "Review comment is required" });
    }

    // Verify enrollment
    const enrollment = await Enrollment.findOne({
      user: req.user._id,
      course: course._id
    });

    if (!enrollment && req.user.role !== "admin") {
      return res.status(403).json({ error: "You must be enrolled in this course to leave a review" });
    }

    // Upsert review
    const review = await Review.findOneAndUpdate(
      { course: course._id, student: req.user._id },
      {
        rating: numRating,
        comment: effectiveComment
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // Recalculate course rating
    await Review.recalculateCourseRating(course._id);

    return res.status(201).json({
      message: "Review submitted successfully",
      review
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/courses/:id/reviews
 * Paginated list of student reviews for a course.
 */
export const getCourseReviewsController = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: "Course not found" });
    }

    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);

    const total = await Review.countDocuments({ course: course._id });
    const reviews = await Review.find({ course: course._id })
      .populate("student", "name firstName lastName avatar avatarUrl")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      reviews,
      pagination: {
        total,
        page,
        limit,
        totalPages
      }
    });
  } catch (error) {
    next(error);
  }
};
