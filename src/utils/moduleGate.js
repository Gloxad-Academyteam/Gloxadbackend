/**
 * Module-by-Module Progression & Gating Engine
 * Implements strict sequential gating for free courses:
 * Lessons -> Quiz -> Written Task -> Unlock Next Module
 */

/**
 * Checks whether all lessons in a module have been completed by the student
 */
export const isModuleLessonsCompleted = (module, completedLessonIds = []) => {
  if (!module || !Array.isArray(module.lessons) || module.lessons.length === 0) {
    return true;
  }
  const completedSet = new Set(completedLessonIds.map((id) => String(id)));
  return module.lessons.every((lesson) => completedSet.has(String(lesson._id)));
};

/**
 * Checks whether all quizzes in a module have been passed by the student
 */
export const isModuleQuizPassed = (module, quizScores = []) => {
  if (!module || !Array.isArray(module.quizzes) || module.quizzes.length === 0) {
    return true;
  }
  return module.quizzes.every((quiz) => {
    return quizScores.some(
      (score) =>
        (String(score.quizId) === String(quiz._id) || String(score.moduleId) === String(module._id)) &&
        score.passed === true
    );
  });
};

/**
 * Checks whether the written reflection task for a module has been submitted
 */
export const isModuleTaskSubmitted = (module, taskSubmissions = []) => {
  if (!module || !module.task || !module.task.prompt) {
    return true;
  }
  return taskSubmissions.some(
    (submission) => String(submission.moduleId) === String(module._id)
  );
};

/**
 * Checks whether a module has satisfied all 3 completion criteria:
 * Lessons complete + Quiz passed + Written task submitted
 */
export const isModuleFullyCompleted = (module, enrollment) => {
  if (!enrollment) return false;
  const lessonsDone = isModuleLessonsCompleted(module, enrollment.completedLessons || []);
  const quizDone = isModuleQuizPassed(module, enrollment.quizScores || []);
  const taskDone = isModuleTaskSubmitted(module, enrollment.taskSubmissions || []);
  return lessonsDone && quizDone && taskDone;
};

/**
 * Calculates unlock state for every module in a course
 */
export const getCourseModulesLockState = (course, enrollment) => {
  const modules = course?.modules || [];
  const completedLessonIds = enrollment?.completedLessons || [];
  const quizScores = enrollment?.quizScores || [];
  const taskSubmissions = enrollment?.taskSubmissions || [];

  let previousModuleCompleted = true; // Module 0 is always unlocked

  return modules.map((mod, index) => {
    const lessonsCount = Array.isArray(mod.lessons) ? mod.lessons.length : 0;
    const lessonsCompletedCount = Array.isArray(mod.lessons)
      ? mod.lessons.filter((l) =>
          completedLessonIds.some((id) => String(id) === String(l._id))
        ).length
      : 0;

    const lessonsCompleted = isModuleLessonsCompleted(mod, completedLessonIds);
    const hasQuiz = Array.isArray(mod.quizzes) && mod.quizzes.length > 0;
    const quizPassed = isModuleQuizPassed(mod, quizScores);
    const hasTask = Boolean(mod.task && mod.task.prompt);
    const taskSubmitted = isModuleTaskSubmitted(mod, taskSubmissions);
    const isCompleted = lessonsCompleted && quizPassed && taskSubmitted;

    // Gating rule: sequential courses lock module N unless module N-1 is complete
    let isLocked = false;
    if (course.sequentialModules) {
      isLocked = !previousModuleCompleted;
    }

    // Set previous module completion flag for next iteration
    previousModuleCompleted = isCompleted;

    return {
      _id: mod._id,
      index,
      title: mod.title,
      isLocked,
      lessonsCount,
      lessonsCompletedCount,
      lessonsCompleted,
      hasQuiz,
      quizPassed,
      hasTask,
      taskSubmitted,
      isCompleted
    };
  });
};

/**
 * Verifies module access permission before student can view or update lessons
 */
export const checkModuleAccess = (course, enrollment, targetModuleId) => {
  if (!course?.sequentialModules) {
    return { allowed: true };
  }

  const moduleStates = getCourseModulesLockState(course, enrollment);
  const targetState = moduleStates.find(
    (m) => String(m._id) === String(targetModuleId)
  );

  if (!targetState) {
    return { allowed: true };
  }

  if (targetState.isLocked) {
    return {
      allowed: false,
      status: 403,
      code: "MODULE_LOCKED",
      error: "Previous module must be completed before accessing this module"
    };
  }

  return { allowed: true };
};

/**
 * Verifies that a student is allowed to attempt a module quiz
 */
export const checkQuizAttemptAllowed = (course, enrollment, targetModuleId) => {
  if (!course?.sequentialModules) {
    return { allowed: true };
  }

  // Check if module is locked
  const access = checkModuleAccess(course, enrollment, targetModuleId);
  if (!access.allowed) {
    return access;
  }

  const targetModule = course.modules?.find(
    (m) => String(m._id) === String(targetModuleId)
  );

  if (!targetModule) {
    return { allowed: true };
  }

  // Check if all lessons in this module are complete
  const lessonsCompleted = isModuleLessonsCompleted(
    targetModule,
    enrollment?.completedLessons || []
  );

  if (!lessonsCompleted) {
    return {
      allowed: false,
      status: 409,
      code: "LESSONS_INCOMPLETE",
      error: "All lessons in this module must be completed before attempting the quiz"
    };
  }

  return { allowed: true };
};

/**
 * Verifies that a student is allowed to submit a module written task
 */
export const checkTaskSubmissionAllowed = (course, enrollment, targetModuleId) => {
  if (!course?.sequentialModules) {
    return { allowed: true };
  }

  // Check if module is locked
  const access = checkModuleAccess(course, enrollment, targetModuleId);
  if (!access.allowed) {
    return access;
  }

  const targetModule = course.modules?.find(
    (m) => String(m._id) === String(targetModuleId)
  );

  if (!targetModule) {
    return { allowed: true };
  }

  // Check if all lessons are complete
  const lessonsCompleted = isModuleLessonsCompleted(
    targetModule,
    enrollment?.completedLessons || []
  );

  if (!lessonsCompleted) {
    return {
      allowed: false,
      status: 409,
      code: "LESSONS_INCOMPLETE",
      error: "All lessons in this module must be completed before submitting written task"
    };
  }

  // Check if quiz is passed
  const quizPassed = isModuleQuizPassed(
    targetModule,
    enrollment?.quizScores || []
  );

  if (!quizPassed) {
    return {
      allowed: false,
      status: 409,
      code: "QUIZ_NOT_PASSED",
      error: "Module quiz must be passed before submitting written task"
    };
  }

  return { allowed: true };
};

/**
 * Progress calculation rule:
 * On sequential courses progress counts lessons + quizzes + tasks.
 * A finished course stays finished if quizzes are added later.
 */
export const calculateCourseProgress = (course, enrollment) => {
  if (!course || !enrollment) return 0;

  // A finished course stays finished
  if (enrollment.isCompleted) {
    return 100;
  }

  const modules = course.modules || [];

  if (!course.sequentialModules) {
    // Non-sequential courses base progress on lessons
    const totalLessons = modules.reduce(
      (sum, m) => sum + ((m.lessons && m.lessons.length) || 0),
      0
    );
    if (totalLessons === 0) return 100;
    const completedCount = (enrollment.completedLessons || []).length;
    return Math.min(100, Math.round((completedCount / totalLessons) * 100));
  }

  // Sequential courses: lessons + quizzes + tasks
  let totalLessons = 0;
  let totalQuizzes = 0;
  let totalTasks = 0;

  modules.forEach((mod) => {
    totalLessons += (mod.lessons && mod.lessons.length) || 0;
    totalQuizzes += (mod.quizzes && mod.quizzes.length) || 0;
    if (mod.task && mod.task.prompt) totalTasks += 1;
  });

  const totalRequired = totalLessons + totalQuizzes + totalTasks;
  if (totalRequired === 0) return 100;

  const completedLessonsCount = (enrollment.completedLessons || []).length;
  const passedQuizzesCount = (enrollment.quizScores || []).filter((q) => q.passed).length;
  const submittedTasksCount = (enrollment.taskSubmissions || []).length;

  const totalDone = completedLessonsCount + passedQuizzesCount + submittedTasksCount;
  return Math.min(100, Math.round((totalDone / totalRequired) * 100));
};

export default {
  isModuleLessonsCompleted,
  isModuleQuizPassed,
  isModuleTaskSubmitted,
  isModuleFullyCompleted,
  getCourseModulesLockState,
  checkModuleAccess,
  checkQuizAttemptAllowed,
  checkTaskSubmissionAllowed,
  calculateCourseProgress
};
