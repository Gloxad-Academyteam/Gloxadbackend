import mongoose from "mongoose";
import { User } from "../models/User.model.js";
import { Course, generateSlug } from "../models/Course.model.js";
import { Appeal } from "../models/Appeal.model.js";
import { Review } from "../models/Review.model.js";

/**
 * @desc    Submit tutor qualification credentials for admin verification & upgrade student role to instructor
 * @route   POST /api/tutor/showcase-expertise
 * @access  Private (Student or Instructor)
 */
export const showcaseExpertiseController = async (req, res, next) => {
  try {
    const {
      title,
      areaOfExpertise,
      experienceYears,
      expertiseBio,
      university,
      skills,
      certificationsUrl,
      certifications,
    } = req.body || {};

    if (!areaOfExpertise || !expertiseBio || !areaOfExpertise.trim() || !expertiseBio.trim()) {
      return res.status(400).json({
        error: "Area of expertise and expertise bio are required",
      });
    }

    const updateFields = {
      areaOfExpertise: areaOfExpertise.trim(),
      expertiseBio: expertiseBio.trim(),
      approvalStatus: "pending",
    };

    if (title !== undefined) updateFields.title = String(title).trim();
    if (experienceYears !== undefined) updateFields.experienceYears = Number(experienceYears) || 0;
    if (university !== undefined) updateFields.university = String(university).trim();
    if (certificationsUrl !== undefined) updateFields.certificationsUrl = String(certificationsUrl).trim();

    if (skills !== undefined) {
      updateFields.skills = Array.isArray(skills) ? skills.map((s) => String(s).trim()) : [];
    }

    if (certifications !== undefined) {
      updateFields.certifications = Array.isArray(certifications)
        ? certifications.map((c) => String(c).trim())
        : [];
    }

    // Upgrade role to instructor if caller is currently a student
    if (req.user.role === "student") {
      updateFields.role = "instructor";
    }

    // Non-destructive update preserving existing user attributes and _id
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      message:
        "Tutor expertise showcase submitted successfully and is currently under administrative review",
      user: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get aggregated performance stats for authenticated instructor
 * @route   GET /api/tutor/dashboard-stats
 * @access  Private (Instructor)
 */
export const getDashboardStatsController = async (req, res, next) => {
  try {
    const instructorId = req.user._id;

    // Fetch all courses owned by this instructor
    const courses = await Course.find({ instructor: instructorId });

    const totalCourses = courses.length;
    const publishedCourses = courses.filter((c) => c.status === "published").length;
    const pendingCourses = courses.filter((c) => c.status === "pending").length;
    const draftCourses = courses.filter((c) => c.status === "draft").length;

    let totalStudents = 0;
    let totalRevenue = 0;
    let totalReviews = 0;
    let weightedRatingSum = 0;

    courses.forEach((c) => {
      totalStudents += c.enrolledCount || 0;
      const coursePrice = c.discountPrice > 0 ? c.discountPrice : c.price || 0;
      totalRevenue += (c.enrolledCount || 0) * coursePrice;

      if (c.rating) {
        const count = c.rating.count || 0;
        const avg = c.rating.average || 0;
        totalReviews += count;
        weightedRatingSum += avg * count;
      }
    });

    let averageRating = 0;
    if (totalReviews > 0) {
      averageRating = Math.round((weightedRatingSum / totalReviews) * 100) / 100;
    } else {
      const publishedWithRating = courses.filter((c) => c.status === "published" && c.rating && c.rating.average > 0);
      if (publishedWithRating.length > 0) {
        const sum = publishedWithRating.reduce((acc, curr) => acc + curr.rating.average, 0);
        averageRating = Math.round((sum / publishedWithRating.length) * 100) / 100;
      }
    }

    // Check if Transaction or Enrollment model exists in Mongoose for richer dynamic aggregation
    if (mongoose.models.Transaction) {
      try {
        const courseIds = courses.map((c) => c._id);
        const txStats = await mongoose.models.Transaction.aggregate([
          { $match: { course: { $in: courseIds }, status: "success" } },
          { $group: { _id: null, totalRevenue: { $sum: "$amount" } } },
        ]);
        if (txStats.length > 0 && txStats[0].totalRevenue > 0) {
          totalRevenue = txStats[0].totalRevenue;
        }
      } catch (err) {
        // Fallback to computed totalRevenue
      }
    }

    return res.status(200).json({
      totalCourses,
      publishedCourses,
      pendingCourses,
      draftCourses,
      totalStudents,
      averageRating,
      totalReviews,
      totalRevenue,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get detailed financial breakdown & revenue share balance for authenticated instructor
 * @route   GET /api/tutor/earnings
 * @access  Private (Instructor)
 */
export const getEarningsController = async (req, res, next) => {
  try {
    const instructorId = req.user._id;

    // Fetch courses owned by instructor
    const courses = await Course.find({ instructor: instructorId });

    let grossRevenue = 0;
    courses.forEach((c) => {
      const price = c.discountPrice > 0 ? c.discountPrice : c.price || 0;
      grossRevenue += (c.enrolledCount || 0) * price;
    });

    let monthlyBreakdown = [];
    let recentTransactions = [];

    // If Transaction model exists, use actual transactions if available
    if (mongoose.models.Transaction) {
      try {
        const courseIds = courses.map((c) => c._id);
        const successfulTxs = await mongoose.models.Transaction.find({
          course: { $in: courseIds },
          status: "success",
        })
          .sort({ createdAt: -1 })
          .populate("course", "title")
          .populate("user", "name firstName lastName");

        if (successfulTxs.length > 0) {
          grossRevenue = successfulTxs.reduce((sum, tx) => sum + (tx.amount || 0), 0);

          recentTransactions = successfulTxs.slice(0, 10).map((tx) => ({
            _id: tx._id,
            courseTitle: tx.course?.title || "Course Purchase",
            studentName:
              tx.user?.name ||
              `${tx.user?.firstName || ""} ${tx.user?.lastName || ""}`.trim() ||
              "Student",
            amount: tx.amount || 0,
            instructorShare: Math.round((tx.amount || 0) * 0.8),
            status: tx.status,
            createdAt: tx.createdAt,
          }));

          // Monthly aggregation
          const monthMap = {};
          successfulTxs.forEach((tx) => {
            const monthStr = new Date(tx.createdAt).toISOString().slice(0, 7);
            if (!monthMap[monthStr]) {
              monthMap[monthStr] = { grossRevenue: 0, enrollments: 0 };
            }
            monthMap[monthStr].grossRevenue += tx.amount || 0;
            monthMap[monthStr].enrollments += 1;
          });

          monthlyBreakdown = Object.keys(monthMap)
            .sort()
            .map((month) => ({
              month,
              grossRevenue: monthMap[month].grossRevenue,
              instructorEarnings: Math.round(monthMap[month].grossRevenue * 0.8),
              enrollments: monthMap[month].enrollments,
            }));
        }
      } catch (err) {
        // Fallback calculation below
      }
    }

    const totalEarnings = Math.round(grossRevenue * 0.8);
    const withdrawableBalance = Math.round(totalEarnings * 0.75);
    const pendingBalance = totalEarnings - withdrawableBalance;
    const revenueSharePercentage = 80;

    return res.status(200).json({
      totalEarnings,
      withdrawableBalance,
      pendingBalance,
      revenueSharePercentage,
      monthlyBreakdown,
      recentTransactions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/tutor/courses
 * Step 1: Create Initial Course Draft
 */
export const createCourseDraft = async (req, res, next) => {
  try {
    const { title, subtitle, category, subCategory, topic, language, level, courseType, price, discountPrice } = req.body || {};

    if (!title || !category || !courseType) {
      return res.status(400).json({ error: "Title, category, and course type are required" });
    }

    // Trimester courses are created by tutors only (product decision). Admins moderate and run cohorts, they do not author them.
    if (String(courseType).toLowerCase() === "trimester" && req.user.role !== "instructor") {
      return res.status(403).json({ error: "Only tutors can create Trimester courses", code: "TRIMESTER_COURSE_TUTOR_ONLY" });
    }

    let baseSlug = generateSlug(title);
    let slug = baseSlug;
    let count = 1;
    while (await Course.exists({ slug })) {
      slug = `${baseSlug}-${count++}`;
    }

    const course = await Course.create({
      title,
      subtitle: subtitle || "",
      slug,
      category,
      subCategory: subCategory || "",
      topic: topic || "",
      language: language || "English",
      level: level || "beginner",
      courseType: courseType.toLowerCase(),
      price: courseType === "free" ? 0 : Number(price) || 0,
      discountPrice: discountPrice ? Number(discountPrice) : 0,
      status: "draft",
      instructor: req.user._id
    });

    return res.status(201).json({
      message: "Course draft created successfully",
      course
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/tutor/courses/:id
 * Steps 2–4: Incremental Wizard Update
 */
export const updateCourseDraft = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: "Course not found" });
    }

    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({ error: "You do not have permission to edit this course" });
    }

    if (["pending", "published"].includes(course.status)) {
      return res.status(400).json({ error: "Cannot edit a course that is currently pending review or published" });
    }

    const updateFields = { ...req.body };

    if (updateFields.title && updateFields.title !== course.title) {
      let baseSlug = generateSlug(updateFields.title);
      let slug = baseSlug;
      let count = 1;
      while (await Course.exists({ slug, _id: { $ne: course._id } })) {
        slug = `${baseSlug}-${count++}`;
      }
      updateFields.slug = slug;
    }

    delete updateFields.status;
    delete updateFields.instructor;

    const updatedCourse = await Course.findByIdAndUpdate(id, { $set: updateFields }, { returnDocument: "after", runValidators: true });

    return res.status(200).json({
      message: "Course draft updated successfully",
      course: updatedCourse
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/tutor/courses
 * List Instructor Owned Courses
 */
export const getInstructorCourses = async (req, res, next) => {
  try {
    const courses = await Course.find({ instructor: req.user._id })
      .sort({ createdAt: -1 })
      .select("title slug category courseType price status enrolledCount createdAt updatedAt")
      .lean();

    return res.status(200).json({ courses });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/tutor/courses/:id
 * Unshielded Author Draft Preview
 */
export const getInstructorCourseById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: "Course not found" });
    }

    const course = await Course.findById(id).lean();
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({ error: "You do not have permission to view this course draft" });
    }

    return res.status(200).json({ course });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/tutor/courses/:id/submit
 * Step 5: Submit Course for Admin Moderation
 */
export const submitCourseForReview = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: "Course not found" });
    }

    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    if (course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "You do not have permission to submit this course" });
    }

    // Step 1 Validation
    if (!course.title || !course.category || !course.courseType) {
      return res.status(400).json({ error: "Course incomplete: Step 1 basic info (title, category, courseType) is required" });
    }
    if (course.courseType === "paid" && (!course.price || course.price <= 0)) {
      return res.status(400).json({ error: "Course incomplete: Paid courses must have a price greater than 0" });
    }

    // Step 2 Validation
    if (!course.thumbnail || !course.description || course.description.trim().length < 20) {
      return res.status(400).json({ error: "Course incomplete: Step 2 thumbnail and detailed description (at least 20 chars) are required" });
    }
    if (!Array.isArray(course.skills) || course.skills.length === 0) {
      return res.status(400).json({ error: "Course incomplete: Step 2 requires at least one target skill" });
    }

    // Step 3 Validation
    if (!Array.isArray(course.modules) || course.modules.length === 0) {
      return res.status(400).json({ error: "Course incomplete: Step 3 requires at least one curriculum module" });
    }
    const hasLesson = course.modules.some(mod => Array.isArray(mod.lessons) && mod.lessons.length > 0 && mod.lessons.some(l => l.videoUrl && l.videoUrl.trim() !== ""));
    if (!hasLesson) {
      return res.status(400).json({ error: "Course incomplete: At least one module with a lesson video is required before submitting for review" });
    }

    // Step 4 Validation
    if (!course.welcomeMessage || !course.congratsMessage) {
      return res.status(400).json({ error: "Course incomplete: Step 4 welcome and congratulations messages are required" });
    }

    course.status = "pending";
    await course.save();

    return res.status(200).json({
      message: "Course submitted successfully for administrative review",
      course
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/tutor/courses/:id/appeal
 * Submit Appeal for Rejected Course
 */
export const appealCourseRejection = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: "Course not found" });
    }

    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    if (course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "You do not have permission to appeal for this course" });
    }

    if (course.status !== "rejected") {
      return res.status(400).json({ error: "Appeals can only be submitted for rejected courses" });
    }

    if (!message || message.trim() === "") {
      return res.status(400).json({ error: "Appeal message is required" });
    }

    const appeal = await Appeal.create({
      courseId: course._id,
      instructorId: req.user._id,
      message: message.trim(),
      status: "pending"
    });

    return res.status(201).json({
      message: "Course rejection appeal submitted successfully",
      appeal
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/tutor/search-instructors?q=
 * Search approved instructors by name/email/username for co-instructors.
 */
export const searchInstructorsController = async (req, res, next) => {
  try {
    const { q } = req.query;
    const filter = {
      role: "instructor",
      approvalStatus: "approved"
    };

    if (q && q.trim()) {
      const regex = new RegExp(q.trim(), "i");
      filter.$or = [
        { name: regex },
        { firstName: regex },
        { lastName: regex },
        { username: regex },
        { email: regex }
      ];
    }

    const instructors = await User.find(filter)
      .select("_id name firstName lastName email username avatar avatarUrl title areaOfExpertise role approvalStatus")
      .limit(50);

    return res.status(200).json({
      instructors,
      count: instructors.length
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/tutor/reviews
 * Fetch student reviews for courses created by signed-in instructor.
 */
export const getTutorReviewsController = async (req, res, next) => {
  try {
    const instructorCourses = await Course.find({ instructor: req.user._id }).select("_id");
    const courseIds = instructorCourses.map((c) => c._id);

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const total = await Review.countDocuments({ course: { $in: courseIds } });
    const reviews = await Review.find({ course: { $in: courseIds } })
      .populate("course", "title slug thumbnail")
      .populate("student", "name firstName lastName avatar avatarUrl email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      reviews,
      count: reviews.length,
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

/**
 * POST /api/tutor/reviews/:id/reply
 * Post an instructor response to a student review on their course.
 */
export const replyToReviewController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { comment, text, reply: replyBody } = req.body || {};
    const replyText = (comment || text || replyBody || "").trim();

    if (!replyText) {
      return res.status(400).json({ error: "Reply comment is required" });
    }

    const review = await Review.findById(id).populate("course");
    if (!review) {
      return res.status(404).json({ error: "Review not found" });
    }

    const courseInstructor = review.course?.instructor ? review.course.instructor.toString() : null;
    if (courseInstructor !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({ error: "You do not have permission to reply to this review" });
    }

    review.tutorReply = {
      comment: replyText,
      createdAt: new Date()
    };
    await review.save();

    return res.status(200).json({
      message: "Reply posted successfully",
      review
    });
  } catch (error) {
    next(error);
  }
};

