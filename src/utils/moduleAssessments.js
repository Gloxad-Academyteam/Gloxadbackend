import crypto from "crypto";
import mongoose from "mongoose";

/**
 * Deterministically generates a 24-character hexadecimal ObjectId
 * based on input string so IDs remain constant across imports.
 */
export const deterministicObjectId = (seed) => {
  const hex = crypto.createHash("md5").update(String(seed)).digest("hex").slice(0, 24);
  return new mongoose.Types.ObjectId(hex);
};

/**
 * Question templates tailored to module context and concepts
 */
const QUESTION_TEMPLATES = [
  {
    pattern: (moduleTitle, topic) => `What is the primary architectural purpose of ${topic || moduleTitle}?`,
    options: [
      (topic) => `To establish scalable, predictable state management and maintainable separation of concerns`,
      (topic) => `To minimize memory usage by eliminating all asynchronous operations entirely`,
      (topic) => `To serve as a strictly browser-only styling configuration`,
      (topic) => `To replace all database transaction layers with flat-file storage`
    ],
    correct: 0,
    explanation: "Core architecture patterns prioritize separation of concerns, predictability, and scalable structure."
  },
  {
    pattern: (moduleTitle, topic) => `When implementing ${moduleTitle}, which engineering trade-off is most critical to evaluate?`,
    options: [
      (topic) => `Sacrificing system stability for zero compile-time type safety`,
      (topic) => `Balancing runtime execution throughput against code readability and cognitive load`,
      (topic) => `Hardcoding credentials directly in repository sources for faster onboarding`,
      (topic) => `Avoiding automated unit and integration tests to maximize deployment frequency`
    ],
    correct: 1,
    explanation: "Production engineering prioritizes maintainability and cognitive overhead alongside runtime performance."
  },
  {
    pattern: (moduleTitle, topic) => `Which error-handling strategy is recommended when working with ${topic || moduleTitle}?`,
    options: [
      (topic) => `Catching all exceptions silently and suppressing logs to protect disk space`,
      (topic) => `Restarting the host operating system upon encountering any unhandled exception`,
      (topic) => `Propagating structured domain errors with uniform HTTP status codes and centralized logging`,
      (topic) => `Exposing raw database stack traces directly to end users in client responses`
    ],
    correct: 2,
    explanation: "Enterprise systems mandate structured error formatting, centralized logging, and uniform status responses."
  },
  {
    pattern: (moduleTitle, topic) => `How does idempotency benefit implementations involving ${moduleTitle}?`,
    options: [
      (topic) => `It ensures repeated requests produce identical system state without unintended side effects`,
      (topic) => `It triples the latency of database reads to ensure eventual consistency`,
      (topic) => `It prevents any network requests from executing more than once across the application lifecycle`,
      (topic) => `It automatically decrypts private keys stored in the platform settings`
    ],
    correct: 0,
    explanation: "Idempotent design guarantees safety when operations are retried due to network interruptions or timeouts."
  },
  {
    pattern: (moduleTitle, topic) => `Which security best practice should be strictly enforced in ${topic || moduleTitle}?`,
    options: [
      (topic) => `Relying exclusively on client-side form validation without server verification`,
      (topic) => `Storing API secrets and JWT signing keys in public frontend build bundles`,
      (topic) => `Validating inputs server-side, enforcing least privilege, and sanitizing parameters`,
      (topic) => `Disabling TLS and CORS protections in development and production environments`
    ],
    correct: 2,
    explanation: "Defense-in-depth requires strict server-side validation, parameterized queries, and least privilege access."
  }
];

/**
 * Builds deterministic 5-question quiz for a given course module
 */
export const generateDeterministicQuiz = (courseSlug, moduleTitle, moduleIndex = 0, topic = "") => {
  const quizId = deterministicObjectId(`${courseSlug}-mod-${moduleIndex}-quiz`);
  const effectiveTopic = topic || moduleTitle.replace(/^(Module\s*\d+\s*:\s*)/i, "").trim();

  const questions = QUESTION_TEMPLATES.map((tmpl, qIdx) => {
    const questionId = deterministicObjectId(`${courseSlug}-mod-${moduleIndex}-q-${qIdx}`);
    const questionText = tmpl.pattern(moduleTitle, effectiveTopic);
    const options = tmpl.options.map((optFn) => optFn(effectiveTopic));

    return {
      _id: questionId,
      questionText,
      options,
      correctOptionIndex: tmpl.correct
    };
  });

  return {
    _id: quizId,
    title: `${moduleTitle} Checkpoint Assessment`,
    passingScore: 70,
    questions
  };
};

/**
 * Builds deterministic written task for a given course module
 */
export const generateDeterministicTask = (courseSlug, moduleTitle, moduleIndex = 0) => {
  const effectiveTitle = moduleTitle.replace(/^(Module\s*\d+\s*:\s*)/i, "").trim();
  return {
    prompt: `In at least 50 words, synthesize the core architectural principles covered in "${effectiveTitle}". Describe how you would implement these concepts in a production system, and analyze key trade-offs regarding scalability, security, or maintainability. Optional: include an HTTPS link to your code repository or proof of work.`,
    minWords: 50,
    submissionLinkAllowed: true
  };
};

/**
 * Inriches course modules with deterministic quizzes and tasks if missing
 */
export const attachAssessmentsToModules = (courseData) => {
  if (!courseData || !Array.isArray(courseData.modules)) return courseData;

  const slug = courseData.slug || "course";
  const topic = courseData.topic || courseData.title || "";

  courseData.modules = courseData.modules.map((mod, modIdx) => {
    // If no quizzes exist, generate deterministic 5-question quiz
    let quizzes = mod.quizzes;
    if (!quizzes || quizzes.length === 0) {
      quizzes = [generateDeterministicQuiz(slug, mod.title || `Module ${modIdx + 1}`, modIdx, topic)];
    }

    // If no task exists, generate deterministic written task
    let task = mod.task;
    if (!task || !task.prompt) {
      task = generateDeterministicTask(slug, mod.title || `Module ${modIdx + 1}`, modIdx);
    }

    return {
      ...mod,
      quizzes,
      task
    };
  });

  return courseData;
};

export default {
  deterministicObjectId,
  generateDeterministicQuiz,
  generateDeterministicTask,
  attachAssessmentsToModules
};
