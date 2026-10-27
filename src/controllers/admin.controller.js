import mongoose from 'mongoose';
import User from '../models/User.model.js';
import Course from '../models/Course.model.js';
import Appeal from '../models/Appeal.model.js';
import Notification from '../models/Notification.model.js';
import Enrollment from '../models/Enrollment.model.js';
import Transaction from '../models/Transaction.model.js';
import Category from '../models/Category.model.js';
import Review from '../models/Review.model.js';
import PlatformSettings from '../models/PlatformSettings.model.js';

/**
 * 1. GET /api/admin/dashboard-stats
 * Retrieves high-level platform health metrics.
 */
export const getDashboardStatsController = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalStudents = await User.countDocuments({ role: 'student' });
    const totalInstructors = await User.countDocuments({ role: 'instructor' });
    const pendingTutors = await User.countDocuments({ approvalStatus: 'pending' });

    const totalCourses = await Course.countDocuments();
    const publishedCourses = await Course.countDocuments({ status: 'published' });
    const pendingCourses = await Course.countDocuments({ status: 'pending' });
    const rejectedCourses = await Course.countDocuments({ status: 'rejected' });

    const totalEnrollments = await Enrollment.countDocuments();

    const revenueResult = await Transaction.aggregate([
      { $match: { status: 'success' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const grossRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

    return res.status(200).json({
      stats: {
        totalUsers,
        totalStudents,
        totalInstructors,
        pendingTutors,
        totalCourses,
        publishedCourses,
        pendingCourses,
        rejectedCourses,
        totalEnrollments,
        grossRevenue
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 2. GET /api/admin/recent-registrations
 * Retrieves recent user registrations sorted descending.
 */
export const getRecentRegistrationsController = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);

    const users = await User.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('-password');

    return res.status(200).json({
      users,
      count: users.length
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 3. GET /api/admin/recent-transactions
 * Retrieves recent financial transactions with user and course metadata.
 */
export const getRecentTransactionsController = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);

    const transactions = await Transaction.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('user', 'firstName lastName email')
      .populate('course', 'title');

    return res.status(200).json({
      transactions,
      count: transactions.length
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 4. GET /api/admin/users
 * Searchable, paginated user directory.
 */
export const getUsersController = async (req, res, next) => {
  try {
    const { role, status, search, isDeactivated, isActive } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const filter = {};
    if (role) filter.role = role;
    if (status) filter.approvalStatus = status;
    if (isDeactivated !== undefined) {
      filter.isDeactivated = isDeactivated === 'true';
    }
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }
    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
        { username: regex },
        { name: regex },
      ];
    }

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-password');

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      users,
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
 * 5. DELETE /api/admin/users/:id
 * Deactivates (soft-deletes) a user account. Guards active admin self-deactivation.
 */
export const deactivateUserController = async (req, res, next) => {
  try {
    const userId = req.params.id;

    if (userId === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot deactivate your own admin account' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User account not found' });
    }

    user.isDeactivated = true;
    user.isActive = false;
    await user.save();

    return res.status(200).json({
      message: 'User account deactivated successfully',
      user: {
        _id: user._id,
        email: user.email,
        isActive: false,
        isDeactivated: true
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 5b. PUT /api/admin/users/:id/reactivate
 * Reactivates a deactivated user account.
 */
export const reactivateUserController = async (req, res, next) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User account not found' });
    }

    user.isDeactivated = false;
    user.isActive = true;
    await user.save();

    return res.status(200).json({
      message: 'User account reactivated successfully',
      user: {
        _id: user._id,
        email: user.email,
        isActive: true,
        isDeactivated: false
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 6. PUT /api/admin/tutors/:id/approval
 * Moderates tutor application (approve/reject).
 */
export const moderateTutorApprovalController = async (req, res, next) => {
  try {
    const { rejectionReason } = req.body;
    const status = req.body.status || req.body.approvalStatus;

    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be approved or rejected' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User account not found' });
    }

    user.approvalStatus = status;
    if (status === 'approved') {
      user.role = 'instructor';
    } else if (status === 'rejected') {
      user.rejectionReason = rejectionReason || null;
    }
    await user.save();

    return res.status(200).json({
      message: `Tutor application status updated to ${status}`,
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        approvalStatus: user.approvalStatus,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 7. GET /api/admin/courses/pending
 * Retrieves courses awaiting admin moderation.
 */
export const getPendingCoursesController = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const filter = { status: 'pending' };
    const total = await Course.countDocuments(filter);
    let courses = await Course.find(filter)
      .populate('instructor', 'firstName lastName email avatar avatarUrl')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    for (const course of courses) {
      if (course.category && (typeof course.category === 'string' || !course.category.name)) {
        let catDoc = null;
        if (mongoose.Types.ObjectId.isValid(course.category)) {
          catDoc = await Category.findById(course.category).select('_id name slug icon imageUrl').lean();
        }
        if (!catDoc && typeof course.category === 'string') {
          catDoc = await Category.findOne({
            $or: [{ name: course.category }, { slug: course.category }]
          }).select('_id name slug icon imageUrl').lean();
        }
        if (catDoc) {
          course.category = catDoc;
        } else if (typeof course.category === 'string') {
          course.category = {
            _id: null,
            name: course.category,
            slug: course.category.toLowerCase().replace(/\s+/g, '-'),
            icon: null,
            imageUrl: null
          };
        }
      }
    }

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      courses,
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
 * 8. GET /api/admin/courses/all
 * Retrieves all courses with status and search filter.
 */
export const getAllCoursesController = async (req, res, next) => {
  try {
    const { status, search } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const filter = {};
    if (status) filter.status = status;
    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [{ title: regex }, { topic: regex }, { subtitle: regex }];
    }

    const total = await Course.countDocuments(filter);
    const courses = await Course.find(filter)
      .populate('instructor', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      courses,
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
 * 9. PUT /api/admin/courses/:id/status
 * Moderates course status (publish / reject).
 */
export const moderateCourseStatusController = async (req, res, next) => {
  try {
    const { status, rejectionReason } = req.body;

    if (!status || !['published', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be published or rejected' });
    }

    if (status === 'rejected' && (!rejectionReason || !rejectionReason.trim())) {
      return res.status(400).json({ error: 'Rejection reason is required when rejecting a course' });
    }

    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    course.status = status;
    course.rejectionReason = status === 'rejected' ? rejectionReason.trim() : null;
    course.reviewedAt = new Date();
    course.reviewedBy = req.user._id;
    await course.save();

    return res.status(200).json({
      message: `Course status updated to ${status} successfully`,
      course: {
        _id: course._id,
        title: course.title,
        status: course.status,
        rejectionReason: course.rejectionReason,
        reviewedAt: course.reviewedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 10. GET /api/admin/appeals
 * Retrieves course rejection appeals.
 */
export const getAppealsController = async (req, res, next) => {
  try {
    const { status } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const filter = {};
    if (status) filter.status = status;

    const total = await Appeal.countDocuments(filter);
    const appeals = await Appeal.find(filter)
      .populate('courseId', 'title status')
      .populate('instructorId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      appeals,
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
 * 11. PUT /api/admin/appeals/:id/status
 * Moderates appeal status (resolve / dismiss).
 */
export const moderateAppealStatusController = async (req, res, next) => {
  try {
    const { status, resolutionNotes } = req.body;

    if (!status || !['resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Status must be resolved or dismissed' });
    }

    const appeal = await Appeal.findById(req.params.id);
    if (!appeal) {
      return res.status(404).json({ error: 'Course appeal not found' });
    }

    appeal.status = status;
    appeal.resolutionNotes = resolutionNotes || appeal.resolutionNotes || null;
    appeal.adminNotes = resolutionNotes || appeal.adminNotes || '';
    await appeal.save();

    // If appeal resolved and notes indicate publication, optionally update course status
    if (status === 'resolved' && appeal.courseId) {
      const course = await Course.findById(appeal.courseId);
      if (course && course.status === 'rejected') {
        course.status = 'pending';
        await course.save();
      }
    }

    return res.status(200).json({
      message: 'Course appeal status updated successfully',
      appeal: {
        _id: appeal._id,
        status: appeal.status,
        resolutionNotes: appeal.resolutionNotes,
        updatedAt: appeal.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 12. GET /api/admin/finance
 * Aggregates platform financial metrics.
 */
export const getFinanceMetricsController = async (req, res, next) => {
  try {
    const aggregateResult = await Transaction.aggregate([
      { $match: { status: 'success' } },
      {
        $group: {
          _id: null,
          grossRevenue: { $sum: '$amount' },
          platformCommission: { $sum: '$platformShare' },
          instructorPayoutsTotal: { $sum: '$instructorShare' },
          totalSuccessfulTransactions: { $sum: 1 }
        }
      }
    ]);

    const stats = aggregateResult.length > 0 ? aggregateResult[0] : {
      grossRevenue: 0,
      platformCommission: 0,
      instructorPayoutsTotal: 0,
      totalSuccessfulTransactions: 0
    };

    // Monthly breakdown
    const monthlyBreakdown = await Transaction.aggregate([
      { $match: { status: 'success' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          revenue: { $sum: '$amount' },
          transactions: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } },
      {
        $project: {
          _id: 0,
          month: '$_id',
          revenue: 1,
          transactions: 1
        }
      }
    ]);

    return res.status(200).json({
      finance: {
        grossRevenue: stats.grossRevenue,
        platformCommission: stats.platformCommission || Math.round(stats.grossRevenue * 0.3),
        instructorPayoutsTotal: stats.instructorPayoutsTotal || Math.round(stats.grossRevenue * 0.7),
        currency: 'NGN',
        totalSuccessfulTransactions: stats.totalSuccessfulTransactions,
        monthlyBreakdown
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 13. POST /api/admin/broadcast
 * Dispatches broadcast notification to targeted user roles.
 */
export const broadcastNotificationController = async (req, res, next) => {
  try {
    const { targetRole, title, message, link } = req.body;

    if (!targetRole || !['all', 'student', 'instructor'].includes(targetRole)) {
      return res.status(400).json({ error: 'Target role must be all, student, or instructor' });
    }

    if (!title || !title.trim() || !message || !message.trim()) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    const userQuery = {};
    if (targetRole !== 'all') {
      userQuery.role = targetRole;
    }

    const targetUsers = await User.find(userQuery, '_id');
    const dispatchedCount = targetUsers.length;

    if (dispatchedCount > 0) {
      const notificationDocs = targetUsers.map((u) => ({
        recipient: u._id,
        targetRole,
        title: title.trim(),
        message: message.trim(),
        link: link || null,
        type: 'system_broadcast'
      }));

      await Notification.insertMany(notificationDocs);
    }

    return res.status(201).json({
      message: `Broadcast notification dispatched successfully to ${dispatchedCount} users`,
      broadcast: {
        targetRole,
        title: title.trim(),
        dispatchedCount,
        createdAt: new Date()
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 14. GET /api/admin/users/:id
 * Fetch complete user profile including onboarding credential fields.
 */
export const getUserDetailsController = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
};

/**
 * 15. GET /api/admin/courses/:id
 * Fetch full unshielded course details for review regardless of status.
 */
export const getAdminCourseDetailsController = async (req, res, next) => {
  try {
    let course = await Course.findById(req.params.id)
      .populate('instructor', 'firstName lastName name email avatar avatarUrl areaOfExpertise')
      .lean();

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    if (course.category && (typeof course.category === 'string' || !course.category.name)) {
      let catDoc = null;
      if (mongoose.Types.ObjectId.isValid(course.category)) {
        catDoc = await Category.findById(course.category).select('_id name slug icon imageUrl').lean();
      }
      if (!catDoc && typeof course.category === 'string') {
        catDoc = await Category.findOne({
          $or: [{ name: course.category }, { slug: course.category }]
        }).select('_id name slug icon imageUrl').lean();
      }
      if (catDoc) {
        course.category = catDoc;
      } else if (typeof course.category === 'string') {
        course.category = {
          _id: null,
          name: course.category,
          slug: course.category.toLowerCase().replace(/\s+/g, '-'),
          icon: null,
          imageUrl: null
        };
      }
    }

    return res.status(200).json({ course });
  } catch (error) {
    next(error);
  }
};

/**
 * 16. GET /api/admin/settings
 * Retrieve current platform settings singleton.
 */
export const getPlatformSettingsController = async (req, res, next) => {
  try {
    const settings = await PlatformSettings.getOrCreateSettings();
    return res.status(200).json({ settings });
  } catch (error) {
    next(error);
  }
};

/**
 * 17. PUT /api/admin/settings
 * Update platform settings toggles, grace days, and signature image.
 */
export const updatePlatformSettingsController = async (req, res, next) => {
  try {
    const settings = await PlatformSettings.getOrCreateSettings();
    const { allowSignups, allowPasswordReset, deletionGraceDays, signatureUrl } = req.body || {};

    if (allowSignups !== undefined) settings.allowSignups = Boolean(allowSignups);
    if (allowPasswordReset !== undefined) settings.allowPasswordReset = Boolean(allowPasswordReset);
    if (deletionGraceDays !== undefined) settings.deletionGraceDays = Number(deletionGraceDays) || 30;
    if (signatureUrl !== undefined) settings.signatureUrl = String(signatureUrl).trim();

    await settings.save();
    return res.status(200).json({
      message: 'Platform settings updated successfully',
      settings
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 18. GET /api/admin/reviews
 * List all platform course reviews with optional rating/course filtering.
 */
export const getAdminReviewsController = async (req, res, next) => {
  try {
    const { course, rating } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const filter = {};
    if (course) filter.course = course;
    if (rating) filter.rating = Number(rating);

    const total = await Review.countDocuments(filter);
    const reviews = await Review.find(filter)
      .populate('course', 'title slug thumbnail')
      .populate('student', 'name firstName lastName email avatar avatarUrl')
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

/**
 * 19. DELETE /api/admin/reviews/:id
 * Moderation delete of a review and auto-recalculate course rating.
 */
export const deleteAdminReviewController = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const courseId = review.course;
    await Review.findByIdAndDelete(req.params.id);
    await Review.recalculateCourseRating(courseId);

    return res.status(200).json({
      message: 'Review deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};
