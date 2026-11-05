import { Course } from "../models/Course.model.js";
import { LmsQuizAttempt } from "../models/LmsQuizAttempt.model.js";

/**
 * Helper to locate a quiz within a course's module hierarchy
 */
const findQuizInCourse = (course, quizId) => {
  let targetQuiz = null;
  let targetModule = null;

  course?.modules?.forEach((mod) => {
    (mod.quizzes || []).forEach((q) => {
      if (String(q._id) === String(quizId)) {
        targetQuiz = q;
        targetModule = mod;
      }
    });
  });

  return { quiz: targetQuiz, module: targetModule };
};

/**
 * GET /api/lms/quizzes/:quizId
 * Quiz overview: returns metadata while strictly shielding answers (Rule 3)
 */
export const getQuizOverview = async (req, res, next) => {
  try {
    const cohort = req.cohort;
    const { quizId } = req.params;

    const course = await Course.findById(cohort.courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    const { quiz, module: targetModule } = findQuizInCourse(course, quizId);
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    const timeLimitMinutes = quiz.timeLimitMinutes || 15;
    const questionCount = quiz.questions?.length || 0;
    const passMarkPercent = quiz.passingScore || 70;

    res.status(200).json({
      _id: quiz._id,
      title: quiz.title,
      programTitle: course.title,
      moduleName: targetModule?.title || "Curriculum Module",
      timeLimitMinutes,
      questionCount,
      passMarkPercent,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/lms/quizzes/:quizId/attempts
 * Starts or resumes a timed quiz attempt with 3-attempt limit and server timer
 */
export const startQuizAttempt = async (req, res, next) => {
  try {
    const cohort = req.cohort;
    const userId = req.user._id;
    const { quizId } = req.params;

    const course = await Course.findById(cohort.courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    const { quiz } = findQuizInCourse(course, quizId);
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    // Check past submitted/expired attempts
    const pastAttempts = await LmsQuizAttempt.find({
      cohortId: cohort._id,
      quizId,
      userId,
    }).sort({ attemptNumber: 1 });

    const submittedCount = pastAttempts.filter(
      (a) => a.status === "submitted" || a.status === "expired"
    ).length;

    if (submittedCount >= 3) {
      return res.status(400).json({
        error: "Maximum attempt limit of 3 reached",
        code: "MAX_ATTEMPTS_REACHED",
      });
    }

    // Check for an active in-progress attempt that hasn't expired
    let activeAttempt = pastAttempts.find(
      (a) =>
        a.status === "in_progress" &&
        new Date(a.expiresAt).getTime() + 15000 > Date.now()
    );

    const timeLimitMinutes = quiz.timeLimitMinutes || 15;

    if (!activeAttempt) {
      const startedAt = new Date();
      const expiresAt = new Date(startedAt.getTime() + timeLimitMinutes * 60 * 1000);
      const attemptNumber = submittedCount + 1;

      activeAttempt = await LmsQuizAttempt.create({
        cohortId: cohort._id,
        quizId,
        userId,
        attemptNumber,
        startedAt,
        expiresAt,
        status: "in_progress",
        answers: [],
      });
    }

    // Sanitize questions: omit correctOptionIndex (Rule 3 Server Content Protection)
    const sanitizedQuestions = (quiz.questions || []).map((q) => ({
      _id: q._id,
      questionText: q.questionText,
      options: q.options,
    }));

    res.status(201).json({
      attemptId: activeAttempt._id,
      startedAt: activeAttempt.startedAt,
      expiresAt: activeAttempt.expiresAt,
      timeLimitMinutes,
      questions: sanitizedQuestions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/lms/quiz-attempts/:attemptId/answers
 * Saves answer choice. With check: true, verifies correctness server-side and locks answer.
 */
export const answerQuestion = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const { questionId, optionId, check } = req.body;

    const attempt = await LmsQuizAttempt.findById(attemptId);
    if (!attempt || attempt.status !== "in_progress") {
      return res.status(400).json({
        error: "Quiz attempt is not in progress",
        code: "ATTEMPT_NOT_IN_PROGRESS",
      });
    }

    // Check if question is already locked
    const existingIndex = attempt.answers.findIndex(
      (a) => String(a.questionId) === String(questionId)
    );

    if (existingIndex >= 0 && attempt.answers[existingIndex].checkedAt) {
      return res.status(400).json({
        error: "Question is locked and cannot be re-answered",
        code: "QUESTION_LOCKED",
      });
    }

    // Find question in course
    const course = await Course.findById(req.cohort.courseId);
    const { quiz } = findQuizInCourse(course, attempt.quizId);
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    const question = quiz.questions.find(
      (q) => String(q._id) === String(questionId)
    );
    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    const isCorrect = String(question.correctOptionIndex) === String(optionId);

    if (check === true) {
      const answerData = {
        questionId: question._id,
        optionId: String(optionId),
        flagged: false,
        checkedAt: new Date(),
        isCorrect,
      };

      if (existingIndex >= 0) {
        attempt.answers[existingIndex] = answerData;
      } else {
        attempt.answers.push(answerData);
      }
      await attempt.save();

      // Rule 3: Do not reveal answer keys/explanations during in-progress attempt.
      // Reveal only upon final submission.
      return res.status(200).json({
        saved: true,
        locked: true,
      });
    }

    // Check === false, save choice without locking
    const answerData = {
      questionId: question._id,
      optionId: String(optionId),
      flagged: false,
      isCorrect,
    };

    if (existingIndex >= 0) {
      attempt.answers[existingIndex].optionId = String(optionId);
      attempt.answers[existingIndex].isCorrect = isCorrect;
    } else {
      attempt.answers.push(answerData);
    }
    await attempt.save();

    res.status(200).json({
      saved: true,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/lms/quiz-attempts/:attemptId/submit
 * Submits attempt, enforces 15-second grace window, auto-grades, and records best score
 */
export const submitQuizAttempt = async (req, res, next) => {
  try {
    const { attemptId } = req.params;

    const attempt = await LmsQuizAttempt.findById(attemptId);
    if (!attempt) {
      return res.status(404).json({ error: "Attempt not found" });
    }

    // Enforce 15-second network grace window
    const graceWindowMs = 15 * 1000;
    const isExpired =
      Date.now() > new Date(attempt.expiresAt).getTime() + graceWindowMs;
    const status = isExpired ? "expired" : "submitted";

    const course = await Course.findById(req.cohort.courseId);
    const { quiz } = findQuizInCourse(course, attempt.quizId);
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    let score = 0;
    const total = quiz.questions?.length || 0;

    (quiz.questions || []).forEach((q) => {
      const userAns = attempt.answers.find(
        (a) => String(a.questionId) === String(q._id)
      );
      if (userAns && String(userAns.optionId) === String(q.correctOptionIndex)) {
        score += 1;
        userAns.isCorrect = true;
      } else if (userAns) {
        userAns.isCorrect = false;
      }
    });

    const percent = total > 0 ? Math.round((score / total) * 100) : 0;
    const passMark = quiz.passingScore || 70;
    const passed = percent >= passMark;

    attempt.score = score;
    attempt.total = total;
    attempt.percent = percent;
    attempt.passed = passed;
    attempt.status = status;
    attempt.submittedAt = new Date();
    await attempt.save();

    // Query best score across all completed attempts
    const allAttempts = await LmsQuizAttempt.find({
      cohortId: attempt.cohortId,
      quizId: attempt.quizId,
      userId: attempt.userId,
      status: { $in: ["submitted", "expired"] },
    });
    const bestScore = Math.max(...allAttempts.map((a) => a.score || 0));

    const results = (quiz.questions || []).map((q) => {
      const userAns = attempt.answers.find(
        (a) => String(a.questionId) === String(q._id)
      );
      return {
        questionId: q._id,
        questionText: q.questionText,
        options: q.options,
        selectedOptionId: userAns ? userAns.optionId : null,
        correctOptionIndex: q.correctOptionIndex,
        isCorrect: userAns ? userAns.isCorrect : false,
        explanation: q.explanation || "Evaluated from curriculum syllabus.",
      };
    });

    res.status(200).json({
      status,
      score,
      total,
      percent,
      passed,
      bestScore,
      results,
    });
  } catch (error) {
    next(error);
  }
};
