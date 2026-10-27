import mongoose from 'mongoose';
import { Enrollment } from '../models/Enrollment.model.js';
import { Transaction } from '../models/Transaction.model.js';
import { Course } from '../models/Course.model.js';
import { verifyPaystackTransaction } from '../utils/paystack.js';

// Constant revenue share ratios
const INSTRUCTOR_SHARE_RATIO = 0.70; // 70%
const PLATFORM_SHARE_RATIO = 0.30;   // 30%

/**
 * Instant enrollment for free courses
 * POST /api/enrollments/enroll/:courseId
 */
export const enrollFreeCourse = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const userId = req.user._id;

    let course = null;
    if (mongoose.Types.ObjectId.isValid(courseId)) {
      course = await Course.findById(courseId);
    }
    if (!course) {
      course = await Course.findOne({ slug: courseId });
    }

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    if (course.status !== 'published') {
      return res.status(400).json({ error: 'Cannot enroll in a course that is not published' });
    }

    const isFree = course.courseType === 'free' || course.price === 0;
    if (!isFree) {
      return res.status(400).json({ error: 'This course is a paid course. Please proceed to payment checkout.' });
    }

    if (course.enrollmentOpen === false) {
      return res.status(400).json({ error: 'Enrollment for this course is currently closed.' });
    }

    // Check if already enrolled
    let enrollment = await Enrollment.findOne({ user: userId, course: course._id });
    if (enrollment) {
      return res.status(200).json({
        message: 'Already enrolled in this course',
        enrollment,
      });
    }

    // Create enrollment
    enrollment = await Enrollment.create({
      user: userId,
      course: course._id,
      enrolledAt: new Date(),
    });

    // Increment course enrollment count
    await Course.findByIdAndUpdate(course._id, { $inc: { enrolledCount: 1 } });

    return res.status(201).json({
      message: 'Enrolled successfully in free course',
      enrollment,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Paid course checkout verification
 * POST /api/enrollments/checkout
 */
export const checkoutPaidCourse = async (req, res, next) => {
  try {
    const { courseId, reference } = req.body;
    const userId = req.user._id;

    if (!courseId || !reference) {
      return res.status(400).json({ error: 'courseId and reference are required' });
    }

    let course = null;
    if (mongoose.Types.ObjectId.isValid(courseId)) {
      course = await Course.findById(courseId);
    }
    if (!course) {
      course = await Course.findOne({ slug: courseId });
    }

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    if (course.status !== 'published') {
      return res.status(400).json({ error: 'Cannot enroll in a course that is not published' });
    }

    // Idempotency check: check if reference has already been processed successfully
    let existingTx = await Transaction.findOne({ reference });
    if (existingTx && existingTx.status === 'success') {
      const existingEnrollment = await Enrollment.findOne({ user: userId, course: course._id });
      return res.status(200).json({
        message: 'Payment already verified and course unlocked',
        enrollment: existingEnrollment,
        transaction: existingTx,
      });
    }

    // Verify transaction with Paystack API
    let paystackData;
    try {
      paystackData = await verifyPaystackTransaction(reference);
    } catch (paystackErr) {
      return res.status(400).json({ error: `Paystack transaction verification failed: ${paystackErr.message}` });
    }

    if (!paystackData || paystackData.status !== 'success') {
      return res.status(400).json({ error: 'Payment verification failed: Transaction was not successful' });
    }

    // Paystack amount is in Kobo (1 NGN = 100 Kobo)
    const paidAmountNaira = paystackData.amount / 100;
    const expectedPrice = (course.discountPrice && course.discountPrice > 0) ? course.discountPrice : course.price;

    if (paidAmountNaira < expectedPrice) {
      return res.status(400).json({
        error: `Payment amount mismatch. Expected: ${expectedPrice} NGN, Paid: ${paidAmountNaira} NGN`,
      });
    }

    // Calculate shares
    const instructorShare = Math.round(paidAmountNaira * INSTRUCTOR_SHARE_RATIO * 100) / 100;
    const platformShare = Math.round(paidAmountNaira * PLATFORM_SHARE_RATIO * 100) / 100;

    // Create or update Transaction document
    const transaction = await Transaction.create({
      reference,
      user: userId,
      course: course._id,
      amount: paidAmountNaira,
      currency: paystackData.currency || 'NGN',
      status: 'success',
      gatewayResponse: paystackData,
      instructorShare,
      platformShare,
    });

    // Create Enrollment document
    let enrollment = await Enrollment.findOne({ user: userId, course: course._id });
    if (!enrollment) {
      enrollment = await Enrollment.create({
        user: userId,
        course: course._id,
        enrolledAt: new Date(),
      });
      // Increment enrolled count
      await Course.findByIdAndUpdate(course._id, { $inc: { enrolledCount: 1 } });
    }

    return res.status(201).json({
      message: 'Payment verified and course enrollment completed successfully',
      enrollment,
      transaction,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get authenticated user's enrolled courses
 * GET /api/enrollments/my-courses
 */
export const getMyCourses = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const [enrollments, total] = await Promise.all([
      Enrollment.find({ user: userId })
        .populate({
          path: 'course',
          select: 'title subtitle slug thumbnail level courseType price instructor',
          populate: {
            path: 'instructor',
            select: 'firstName lastName avatarUrl',
          },
        })
        .sort({ enrolledAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Enrollment.countDocuments({ user: userId }),
    ]);

    return res.status(200).json({
      enrollments,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Check enrollment status for a specific course
 * GET /api/enrollments/check/:courseId
 */
export const checkEnrollmentStatus = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const userId = req.user._id;

    // Resolve course by ID or slug
    let course = null;
    if (mongoose.Types.ObjectId.isValid(courseId)) {
      course = await Course.findById(courseId);
    }
    if (!course) {
      course = await Course.findOne({ slug: courseId });
    }

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const enrollment = await Enrollment.findOne({ user: userId, course: course._id }).lean();

    return res.status(200).json({
      isEnrolled: !!enrollment,
      enrollment: enrollment || null,
    });
  } catch (error) {
    next(error);
  }
};
