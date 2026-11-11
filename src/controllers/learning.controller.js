import mongoose from 'mongoose';
import { Course } from '../models/Course.model.js';
import { Enrollment } from '../models/Enrollment.model.js';
import { Question, Note, Announcement } from '../models/QuestionNoteMisc.model.js';
import { LmsCertificate } from '../models/LmsCertificate.model.js';
import { buildLinkedInShare } from './lmsCertificate.controller.js';
import {
  checkModuleAccess,
  checkQuizAttemptAllowed,
  calculateCourseProgress
} from '../utils/moduleGate.js';

/**
 * Update student playback position and lesson completion status
 * POST /api/learning/:courseId/progress
 */
export const updateProgressController = async (req, res, next) => {
  try {
    const { lessonId, playbackPosition } = req.body;
    const isCompleted = req.body.isCompleted ?? req.body.completed;

    if (!lessonId) {
      return res.status(400).json({ error: 'lessonId is required' });
    }

    // Verify lesson exists within the course modules
    let lessonFound = false;
    let moduleWithLesson = null;
    if (req.course.modules && req.course.modules.length > 0) {
      for (const mod of req.course.modules) {
        if (mod.lessons && mod.lessons.length > 0) {
          const found = mod.lessons.find((l) => l._id.toString() === lessonId.toString());
          if (found) {
            lessonFound = true;
            moduleWithLesson = mod;
            break;
          }
        }
      }
    }

    if (!lessonFound) {
      return res.status(404).json({ error: 'Lesson not found in course' });
    }

    // Find or create enrollment record
    let enrollment = await Enrollment.findOne({
      user: req.user._id,
      course: req.course._id,
    });

    if (!enrollment) {
      enrollment = new Enrollment({
        user: req.user._id,
        course: req.course._id,
        enrolledAt: new Date(),
      });
    }

    // Check sequential module gating
    if (req.course.sequentialModules && moduleWithLesson) {
      const access = checkModuleAccess(req.course, enrollment, moduleWithLesson._id);
      if (!access.allowed) {
        return res.status(access.status || 403).json({
          error: access.error,
          code: access.code,
        });
      }
    }

    enrollment.lastAccessedLesson = lessonId;
    if (playbackPosition !== undefined) {
      enrollment.lastPlaybackPosition = Number(playbackPosition);
    }

    if (isCompleted === true) {
      const alreadyCompleted = enrollment.completedLessons.some(
        (id) => id.toString() === lessonId.toString()
      );
      if (!alreadyCompleted) {
        enrollment.completedLessons.push(lessonId);
      }
    }

    // Recalculate course completion progress percentage using sequential rules if applicable
    enrollment.progressPercentage = calculateCourseProgress(req.course, enrollment);

    if (enrollment.progressPercentage === 100) {
      enrollment.isCompleted = true;
      if (!enrollment.completedAt) {
        enrollment.completedAt = new Date();
      }
    }

    await enrollment.save();

    return res.status(200).json({
      message: 'Lesson progress updated successfully',
      progress: {
        courseId: req.course._id,
        lastAccessedLesson: enrollment.lastAccessedLesson,
        lastPlaybackPosition: enrollment.lastPlaybackPosition,
        completedLessons: enrollment.completedLessons,
        progressPercentage: enrollment.progressPercentage,
        isCompleted: enrollment.isCompleted,
        completedAt: enrollment.completedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Server-side quiz submission & grading engine
 * POST /api/learning/:courseId/quiz/:quizId/submit
 */
export const submitQuizController = async (req, res, next) => {
  try {
    const { quizId } = req.params;
    const { answers } = req.body;

    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'Invalid or missing answers array' });
    }

    // Find target quiz within course modules
    let quiz = null;
    let moduleWithQuiz = null;
    if (req.course.modules && req.course.modules.length > 0) {
      for (const mod of req.course.modules) {
        if (mod.quizzes && mod.quizzes.length > 0) {
          const found = mod.quizzes.find((q) => q._id.toString() === quizId.toString());
          if (found) {
            quiz = found;
            moduleWithQuiz = mod;
            break;
          }
        }
      }
    }

    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    // Find or create enrollment record
    let enrollment = await Enrollment.findOne({
      user: req.user._id,
      course: req.course._id,
    });

    if (!enrollment) {
      enrollment = new Enrollment({
        user: req.user._id,
        course: req.course._id,
        enrolledAt: new Date(),
      });
    }

    // Check sequential gating for quiz attempt
    if (req.course.sequentialModules && moduleWithQuiz) {
      const gateCheck = checkQuizAttemptAllowed(req.course, enrollment, moduleWithQuiz._id);
      if (!gateCheck.allowed) {
        return res.status(gateCheck.status || 409).json({
          error: gateCheck.error,
          code: gateCheck.code,
        });
      }
    }

    const totalQuestions = quiz.questions ? quiz.questions.length : 0;
    let correctAnswers = 0;
    const breakdown = [];

    if (quiz.questions && quiz.questions.length > 0) {
      quiz.questions.forEach((question, index) => {
        let selectedOptionIndex = null;

        const userAns = answers.find(
          (a) => typeof a === 'object' && a !== null && a.questionId && a.questionId.toString() === question._id.toString()
        );

        if (userAns && typeof userAns.selectedOptionIndex === 'number') {
          selectedOptionIndex = userAns.selectedOptionIndex;
        } else if (typeof answers[index] === 'number') {
          selectedOptionIndex = answers[index];
        }

        const isCorrect =
          selectedOptionIndex !== null && selectedOptionIndex === question.correctOptionIndex;

        if (isCorrect) {
          correctAnswers++;
        }

        breakdown.push({
          questionId: question._id,
          selectedOptionIndex,
          correctOptionIndex: question.correctOptionIndex,
          isCorrect,
        });
      });
    }

    const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
    const passingScore = quiz.passingScore !== undefined ? quiz.passingScore : 70;
    const passed = score >= passingScore;

    enrollment.quizScores.push({
      quizId: quiz._id,
      moduleId: moduleWithQuiz ? String(moduleWithQuiz._id) : undefined,
      score,
      passingScore,
      passed,
      attemptedAt: new Date(),
    });

    // Recalculate progress
    enrollment.progressPercentage = calculateCourseProgress(req.course, enrollment);
    if (enrollment.progressPercentage === 100) {
      enrollment.isCompleted = true;
      if (!enrollment.completedAt) {
        enrollment.completedAt = new Date();
      }
    }

    await enrollment.save();

    return res.status(200).json({
      message: 'Quiz evaluated successfully',
      result: {
        quizId: quiz._id,
        quizTitle: quiz.title,
        score,
        passingScore,
        passed,
        totalQuestions,
        correctAnswers,
        breakdown,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve Q&A discussion threads for a course
 * GET /api/learning/:courseId/questions
 */
export const getQuestionsController = async (req, res, next) => {
  try {
    const { lessonId } = req.query;
    const filter = { course: req.course._id };

    if (lessonId) {
      filter.lessonId = lessonId;
    }

    const questions = await Question.find(filter)
      .populate('user', 'firstName lastName avatarUrl role')
      .populate('replies.user', 'firstName lastName avatarUrl role')
      .sort({ createdAt: -1 });

    return res.status(200).json({ questions });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new Q&A discussion question
 * POST /api/learning/:courseId/questions
 */
export const createQuestionController = async (req, res, next) => {
  try {
    const { lessonId, title, content } = req.body;

    if (!title || !title.trim() || !content || !content.trim()) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const question = await Question.create({
      course: req.course._id,
      lessonId: lessonId || null,
      user: req.user._id,
      title: title.trim(),
      content: content.trim(),
      replies: [],
    });

    const populated = await Question.findById(question._id).populate(
      'user',
      'firstName lastName avatarUrl role'
    );

    return res.status(201).json({
      message: 'Question created successfully',
      question: populated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Post a reply to a Q&A question
 * POST /api/learning/:courseId/questions/:questionId/reply
 */
export const replyQuestionController = async (req, res, next) => {
  try {
    const { questionId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Reply content is required' });
    }

    const question = await Question.findOne({
      _id: questionId,
      course: req.course._id,
    });

    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    question.replies.push({
      user: req.user._id,
      content: content.trim(),
      createdAt: new Date(),
    });

    await question.save();

    const updated = await Question.findById(question._id)
      .populate('user', 'firstName lastName avatarUrl role')
      .populate('replies.user', 'firstName lastName avatarUrl role');

    return res.status(200).json({
      message: 'Reply added successfully',
      question: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get private notes for authenticated student
 * GET /api/learning/:courseId/notes
 */
export const getNotesController = async (req, res, next) => {
  try {
    const { lessonId } = req.query;
    const filter = {
      course: req.course._id,
      user: req.user._id,
    };

    if (lessonId) {
      filter.lessonId = lessonId;
    }

    const notes = await Note.find(filter).sort({ timestamp: 1, createdAt: -1 });

    return res.status(200).json({ notes });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a private study note
 * POST /api/learning/:courseId/notes
 */
export const createNoteController = async (req, res, next) => {
  try {
    const { lessonId, timestamp, content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    const note = await Note.create({
      course: req.course._id,
      lessonId: lessonId || null,
      user: req.user._id,
      timestamp: timestamp !== undefined ? Number(timestamp) : 0,
      content: content.trim(),
    });

    return res.status(201).json({
      message: 'Note created successfully',
      note,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a private study note
 * DELETE /api/learning/:courseId/notes/:noteId
 */
export const deleteNoteController = async (req, res, next) => {
  try {
    const { noteId } = req.params;

    const note = await Note.findOne({
      _id: noteId,
      course: req.course._id,
    });

    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    if (note.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied: cannot delete another user's note" });
    }

    await Note.findByIdAndDelete(note._id);

    return res.status(200).json({ message: 'Note deleted successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Get course announcements
 * GET /api/learning/:courseId/announcements
 */
export const getAnnouncementsController = async (req, res, next) => {
  try {
    const announcements = await Announcement.find({ course: req.course._id })
      .populate('instructor', 'firstName lastName avatarUrl')
      .sort({ createdAt: -1 });

    return res.status(200).json({ announcements });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a course announcement (Instructor/Admin)
 * POST /api/learning/:courseId/announcements
 */
export const createAnnouncementController = async (req, res, next) => {
  try {
    const { title, content } = req.body;

    if (
      req.user.role !== 'admin' &&
      req.course.instructor &&
      req.course.instructor.toString() !== req.user._id.toString()
    ) {
      return res
        .status(403)
        .json({ error: 'Only the course instructor or an admin can post announcements' });
    }

    if (!title || !title.trim() || !content || !content.trim()) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const announcement = await Announcement.create({
      course: req.course._id,
      instructor: req.user._id,
      title: title.trim(),
      content: content.trim(),
    });

    const populated = await Announcement.findById(announcement._id).populate(
      'instructor',
      'firstName lastName avatarUrl'
    );

    return res.status(201).json({
      message: 'Announcement created successfully',
      announcement: populated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve verifiable completion certificate
 * GET /api/learning/:courseId/certificate
 */
export const getCertificateController = async (req, res, next) => {
  try {
    const enrollment = await Enrollment.findOne({
      user: req.user._id,
      course: req.course._id,
    });

    if (!enrollment || enrollment.progressPercentage < 100 || !enrollment.isCompleted) {
      return res.status(400).json({
        error:
          'Course incomplete. Certificate can only be issued upon 100% course progress completion.',
      });
    }

    if (!enrollment.certificateId) {
      const userSuffix = req.user._id.toString().slice(-4).toUpperCase();
      const courseSuffix = req.course._id.toString().slice(-4).toUpperCase();
      enrollment.certificateId = `GLX-CERT-${userSuffix}-${courseSuffix}`;
      await enrollment.save();
    }

    const courseDoc = await Course.findById(req.course._id).populate(
      'instructor',
      'firstName lastName'
    );

    const studentName = `${req.user.firstName} ${req.user.lastName}`.trim();
    const instructorName =
      courseDoc && courseDoc.instructor
        ? `${courseDoc.instructor.firstName} ${courseDoc.instructor.lastName}`.trim()
        : 'Gloxad Academy';

    const issuedAt = enrollment.completedAt || enrollment.updatedAt || new Date();
    const host = req.get('host') || 'localhost:3001';
    const protocol = req.protocol || 'http';
    const verificationUrl = `${protocol}://${host}/api/learning/verify-certificate/${enrollment.certificateId}`;

    return res.status(200).json({
      message: 'Certificate retrieved successfully',
      certificate: {
        certificateId: enrollment.certificateId,
        studentName,
        courseTitle: req.course.title,
        instructorName,
        issuedAt,
        verificationUrl,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify completion certificate (Public API)
 * GET /api/learning/verify-certificate/:certificateId
 */
export const verifyCertificateController = async (req, res, next) => {
  try {
    const { certificateId } = req.params;

    // Check LMS Certificate collection first
    const lmsCert = await LmsCertificate.findOne({ certificateId })
      .populate('userId', 'firstName lastName email')
      .populate('courseId', 'title instructor')
      .populate('cohortId', 'name');

    if (lmsCert) {
      const studentName = lmsCert.userId
        ? `${lmsCert.userId.firstName || ''} ${lmsCert.userId.lastName || ''}`.trim()
        : 'Student';
      const courseTitle = lmsCert.courseId?.title || lmsCert.title;
      const isValid = !lmsCert.revokedAt;

      return res.status(200).json({
        valid: isValid,
        message: isValid
          ? 'Certificate verified successfully'
          : 'Certificate has been revoked',
        certificate: {
          certificateId: lmsCert.certificateId,
          studentName,
          courseTitle,
          cohortName: lmsCert.cohortId?.name || '',
          badge: lmsCert.badge,
          issuedAt: lmsCert.issuedAt,
          isRevoked: Boolean(lmsCert.revokedAt),
          revokedAt: lmsCert.revokedAt || null,
          revokedReason: lmsCert.revokedReason || null,
        },
        linkedInShare: isValid ? buildLinkedInShare(lmsCert) : null,
      });
    }

    const enrollment = await Enrollment.findOne({ certificateId })
      .populate('user', 'firstName lastName')
      .populate({
        path: 'course',
        select: 'title instructor',
        populate: {
          path: 'instructor',
          select: 'firstName lastName',
        },
      });

    if (!enrollment) {
      return res.status(404).json({ error: 'Certificate not found or invalid certificate ID' });
    }

    const studentName = enrollment.user
      ? `${enrollment.user.firstName} ${enrollment.user.lastName}`.trim()
      : 'Student';
    const courseTitle = enrollment.course ? enrollment.course.title : 'Course';
    const instructorName =
      enrollment.course && enrollment.course.instructor
        ? `${enrollment.course.instructor.firstName} ${enrollment.course.instructor.lastName}`.trim()
        : 'Gloxad Academy';

    const issuedDate = new Date(enrollment.completedAt || enrollment.updatedAt || Date.now());
    const certId = enrollment.certificateId;
    const frontendUrl = process.env.FRONTEND_URL || 'https://gloxadacademy.com';
    const certUrl = `${frontendUrl}/verify-certificate/${certId}`;

    const linkedInShare = {
      name: courseTitle,
      organizationName: 'Gloxad Academy',
      issueMonth: issuedDate.getMonth() + 1,
      issueYear: issuedDate.getFullYear(),
      certId,
      certUrl,
      shareUrl: `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(
        courseTitle
      )}&organizationName=${encodeURIComponent('Gloxad Academy')}&issueYear=${issuedDate.getFullYear()}&issueMonth=${
        issuedDate.getMonth() + 1
      }&certUrl=${encodeURIComponent(certUrl)}&certId=${encodeURIComponent(certId)}`,
    };

    return res.status(200).json({
      valid: true,
      message: 'Certificate verified successfully',
      certificate: {
        certificateId: enrollment.certificateId,
        studentName,
        courseTitle,
        instructorName,
        issuedAt: enrollment.completedAt || enrollment.updatedAt,
      },
      linkedInShare,
    });
  } catch (error) {
    next(error);
  }
};
