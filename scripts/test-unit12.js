import mongoose from 'mongoose';
import { app } from '../src/app.js';
import connectDB from '../src/config/db.js';
import { User } from '../src/models/User.model.js';
import { Course } from '../src/models/Course.model.js';
import { Enrollment } from '../src/models/Enrollment.model.js';
import { Question, Note, Announcement } from '../src/models/QuestionNoteMisc.model.js';
import { signToken } from '../src/utils/jwt.js';

async function runTests() {
  console.log("🚀 Initializing Unit 12 (Learning Engine & Quiz Grading) Verification Suite...\n");

  await connectDB();

  // Setup test users
  let studentUser = await User.findOne({ email: "student_unit12@gloxad.com" });
  if (!studentUser) {
    studentUser = await User.create({
      firstName: "Jane",
      lastName: "Student",
      username: "student_unit12",
      email: "student_unit12@gloxad.com",
      password: "Password123!",
      role: "student",
      isEmailVerified: true,
      approvalStatus: "approved",
    });
  }

  let unenrolledUser = await User.findOne({ email: "unenrolled_unit12@gloxad.com" });
  if (!unenrolledUser) {
    unenrolledUser = await User.create({
      firstName: "Bob",
      lastName: "Unenrolled",
      username: "unenrolled_unit12",
      email: "unenrolled_unit12@gloxad.com",
      password: "Password123!",
      role: "student",
      isEmailVerified: true,
      approvalStatus: "approved",
    });
  }

  let instructorUser = await User.findOne({ email: "instructor_unit12@gloxad.com" });
  if (!instructorUser) {
    instructorUser = await User.create({
      firstName: "Alex",
      lastName: "Instructor",
      username: "instructor_unit12",
      email: "instructor_unit12@gloxad.com",
      password: "Password123!",
      role: "instructor",
      isEmailVerified: true,
      approvalStatus: "approved",
    });
  }

  const studentToken = signToken({ sub: studentUser._id, role: studentUser.role, tokenVersion: studentUser.tokenVersion });
  const unenrolledToken = signToken({ sub: unenrolledUser._id, role: unenrolledUser.role, tokenVersion: unenrolledUser.tokenVersion });
  const instructorToken = signToken({ sub: instructorUser._id, role: instructorUser.role, tokenVersion: instructorUser.tokenVersion });

  // Clean test artifacts
  await Course.deleteMany({ slug: { $in: ["unit-12-test-course", "unit-12-other-course"] } });
  await Enrollment.deleteMany({ user: { $in: [studentUser._id, unenrolledUser._id] } });

  const lesson1Id = new mongoose.Types.ObjectId();
  const lesson2Id = new mongoose.Types.ObjectId();
  const question1Id = new mongoose.Types.ObjectId();
  const question2Id = new mongoose.Types.ObjectId();
  const quiz1Id = new mongoose.Types.ObjectId();

  // Create course with 1 module containing 2 lessons and 1 quiz with 2 questions
  const testCourse = await Course.create({
    title: "Unit 12 Test Course",
    slug: "unit-12-test-course",
    subtitle: "Learning engine testing course",
    description: "Testing progress, grading, QA, notes, and certificates.",
    instructor: instructorUser._id,
    category: new mongoose.Types.ObjectId(),
    subCategory: "General",
    topic: "Node.js",
    level: "intermediate",
    courseType: "free",
    price: 0,
    status: "published",
    publishedAt: new Date(),
    modules: [
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Module 1: Foundations",
        lessons: [
          {
            _id: lesson1Id,
            title: "Lesson 1: Introduction",
            videoUrl: "https://s3.amazonaws.com/gloxard/courses/videos/lesson1.mp4",
            duration: "10:00",
            isFreePreview: true,
          },
          {
            _id: lesson2Id,
            title: "Lesson 2: Advanced Concepts",
            videoUrl: "https://s3.amazonaws.com/gloxard/courses/videos/lesson2.mp4",
            duration: "15:00",
            isFreePreview: false,
          },
        ],
        quizzes: [
          {
            _id: quiz1Id,
            title: "Module 1 Quiz",
            passingScore: 70,
            questions: [
              {
                _id: question1Id,
                questionText: "What is Express?",
                options: ["Library", "Web Framework", "Database", "OS"],
                correctOptionIndex: 1,
              },
              {
                _id: question2Id,
                questionText: "What is Node.js?",
                options: ["Runtime", "Framework", "CSS tool", "Browser"],
                correctOptionIndex: 0,
              },
            ],
          },
        ],
      },
    ],
  });

  const otherCourse = await Course.create({
    title: "Unit 12 Other Course",
    slug: "unit-12-other-course",
    subtitle: "Unenrolled course",
    description: "Course student is not enrolled in.",
    instructor: instructorUser._id,
    category: new mongoose.Types.ObjectId(),
    subCategory: "General",
    topic: "Node.js",
    level: "beginner",
    courseType: "free",
    price: 0,
    status: "published",
    publishedAt: new Date(),
  });

  // Create enrollment for studentUser
  await Enrollment.create({
    user: studentUser._id,
    course: testCourse._id,
    enrolledAt: new Date(),
  });

  // Clean Q&A, Notes, Announcements for test course
  await Question.deleteMany({ course: testCourse._id });
  await Note.deleteMany({ course: testCourse._id });
  await Announcement.deleteMany({ course: testCourse._id });

  // Start test server
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/learning`;

  let passed = 0;
  let failed = 0;

  async function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${message}`);
      failed++;
    }
  }

  try {
    console.log("--- 1. Enrollment Authorization Guards ---");
    const unauthRes = await fetch(`${baseUrl}/${testCourse._id}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId: lesson1Id.toString(), playbackPosition: 10 }),
    });
    const unauthData = await unauthRes.json();
    await assert(
      unauthRes.status === 401 && unauthData.error === "Authentication token missing or malformed",
      "Unauthenticated request returns HTTP 401"
    );

    const forbiddenRes = await fetch(`${baseUrl}/${otherCourse._id}/progress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${unenrolledToken}`,
      },
      body: JSON.stringify({ lessonId: lesson1Id.toString(), playbackPosition: 10 }),
    });
    const forbiddenData = await forbiddenRes.json();
    await assert(
      forbiddenRes.status === 403 &&
        forbiddenData.error === "You must be enrolled in this course to access learning content",
      "Un-enrolled student request returns HTTP 403 forbidden"
    );

    console.log("\n--- 2. Lesson Progress Tracking & Completion ---");
    // Update Lesson 1 progress (50% course completion)
    const progress1Res = await fetch(`${baseUrl}/${testCourse.slug}/progress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        lessonId: lesson1Id.toString(),
        playbackPosition: 245,
        isCompleted: true,
      }),
    });
    const progress1Data = await progress1Res.json();
    await assert(
      progress1Res.status === 200 &&
        progress1Data.progress.lastPlaybackPosition === 245 &&
        progress1Data.progress.progressPercentage === 50 &&
        progress1Data.progress.isCompleted === false,
      "Lesson 1 completion updates progress to 50% with isCompleted: false"
    );

    // Update Lesson 2 progress (100% course completion)
    const progress2Res = await fetch(`${baseUrl}/${testCourse._id}/progress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        lessonId: lesson2Id.toString(),
        playbackPosition: 900,
        isCompleted: true,
      }),
    });
    const progress2Data = await progress2Res.json();
    await assert(
      progress2Res.status === 200 &&
        progress2Data.progress.progressPercentage === 100 &&
        progress2Data.progress.isCompleted === true &&
        progress2Data.progress.completedAt !== null,
      "Lesson 2 completion updates progress to 100% and auto-sets isCompleted: true & completedAt"
    );

    console.log("\n--- 3. Server-Side Quiz Grading Engine ---");
    // Submit malformed body -> 400 Bad Request
    const malformedQuizRes = await fetch(`${baseUrl}/${testCourse._id}/quiz/${quiz1Id}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ answers: "not-an-array" }),
    });
    const malformedQuizData = await malformedQuizRes.json();
    await assert(
      malformedQuizRes.status === 400 && malformedQuizData.error === "Invalid or missing answers array",
      "Malformed answers array rejects with HTTP 400"
    );

    // Submit partial/wrong answers -> 50% score (Failed)
    const partialQuizRes = await fetch(`${baseUrl}/${testCourse._id}/quiz/${quiz1Id}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        answers: [
          { questionId: question1Id.toString(), selectedOptionIndex: 1 }, // Correct (1)
          { questionId: question2Id.toString(), selectedOptionIndex: 2 }, // Wrong (0 expected)
        ],
      }),
    });
    const partialQuizData = await partialQuizRes.json();
    await assert(
      partialQuizRes.status === 200 &&
        partialQuizData.result.score === 50 &&
        partialQuizData.result.passed === false &&
        partialQuizData.result.correctAnswers === 1 &&
        partialQuizData.result.breakdown.length === 2 &&
        partialQuizData.result.breakdown[0].correctOptionIndex !== undefined,
      "Partial quiz submission scores 50%, marks passed: false, and returns correctOptionIndex after attempt"
    );

    // Submit all correct answers -> 100% score (Passed)
    const fullQuizRes = await fetch(`${baseUrl}/${testCourse._id}/quiz/${quiz1Id}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        answers: [
          { questionId: question1Id.toString(), selectedOptionIndex: 1 }, // Correct (1)
          { questionId: question2Id.toString(), selectedOptionIndex: 0 }, // Correct (0)
        ],
      }),
    });
    const fullQuizData = await fullQuizRes.json();
    await assert(
      fullQuizRes.status === 200 &&
        fullQuizData.result.score === 100 &&
        fullQuizData.result.passed === true &&
        fullQuizData.result.correctAnswers === 2,
      "All correct answers submission scores 100% and marks passed: true"
    );

    console.log("\n--- 4. Course Q&A Discussion Board ---");
    // Create Question
    const createQRes = await fetch(`${baseUrl}/${testCourse.slug}/questions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        lessonId: lesson1Id.toString(),
        title: "Question about Async/Await",
        content: "How do we handle unhandled promise rejections?",
      }),
    });
    const createQData = await createQRes.json();
    await assert(
      createQRes.status === 201 &&
        createQData.question._id &&
        createQData.question.user.firstName === "Jane",
      "Student creates Q&A question successfully (HTTP 201)"
    );

    const questionId = createQData.question._id;

    // Reply to Question
    const replyQRes = await fetch(`${baseUrl}/${testCourse.slug}/questions/${questionId}/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${instructorToken}`,
      },
      body: JSON.stringify({
        content: "Express v5 automatically handles rejected promises!",
      }),
    });
    const replyQData = await replyQRes.json();
    await assert(
      replyQRes.status === 200 &&
        replyQData.question.replies.length === 1 &&
        replyQData.question.replies[0].content.includes("Express v5"),
      "Instructor replies to Q&A question successfully (HTTP 200)"
    );

    // Retrieve Questions List
    const getQRes = await fetch(`${baseUrl}/${testCourse.slug}/questions?lessonId=${lesson1Id}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const getQData = await getQRes.json();
    await assert(
      getQRes.status === 200 &&
        Array.isArray(getQData.questions) &&
        getQData.questions.length === 1 &&
        getQData.questions[0].user.role === "student",
      "Retrieves Q&A discussion threads with populated user profile"
    );

    console.log("\n--- 5. Private Student Notes ---");
    // Create Private Note
    const createNoteRes = await fetch(`${baseUrl}/${testCourse._id}/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        lessonId: lesson1Id.toString(),
        timestamp: 120,
        content: "Remember to use try-catch blocks for async operations.",
      }),
    });
    const createNoteData = await createNoteRes.json();
    await assert(
      createNoteRes.status === 201 && createNoteData.note.timestamp === 120,
      "Student creates timestamped private note (HTTP 201)"
    );

    const noteId = createNoteData.note._id;

    // Get Private Notes
    const getNotesRes = await fetch(`${baseUrl}/${testCourse._id}/notes`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const getNotesData = await getNotesRes.json();
    await assert(
      getNotesRes.status === 200 &&
        Array.isArray(getNotesData.notes) &&
        getNotesData.notes.length === 1,
      "Retrieves private study notes for authenticated student"
    );

    // Delete Note
    const delNoteRes = await fetch(`${baseUrl}/${testCourse._id}/notes/${noteId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const delNoteData = await delNoteRes.json();
    await assert(
      delNoteRes.status === 200 && delNoteData.message === "Note deleted successfully",
      "Student deletes private note (HTTP 200)"
    );

    console.log("\n--- 6. Course Announcements ---");
    // Non-instructor student attempt to post announcement -> 403
    const studentAnnRes = await fetch(`${baseUrl}/${testCourse._id}/announcements`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        title: "Student Announcement",
        content: "This should fail.",
      }),
    });
    const studentAnnData = await studentAnnRes.json();
    await assert(
      studentAnnRes.status === 403,
      "Student posting announcement is rejected with HTTP 403 Forbidden"
    );

    // Instructor posts announcement -> 201
    const createAnnRes = await fetch(`${baseUrl}/${testCourse._id}/announcements`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${instructorToken}`,
      },
      body: JSON.stringify({
        title: "Live Q&A Session Scheduled",
        content: "Join us live this Friday at 4 PM UTC!",
      }),
    });
    const createAnnData = await createAnnRes.json();
    await assert(
      createAnnRes.status === 201 &&
        createAnnData.announcement.instructor.firstName === "Alex",
      "Course instructor posts announcement successfully (HTTP 201)"
    );

    // Get Announcements
    const getAnnRes = await fetch(`${baseUrl}/${testCourse._id}/announcements`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const getAnnData = await getAnnRes.json();
    await assert(
      getAnnRes.status === 200 &&
        Array.isArray(getAnnData.announcements) &&
        getAnnData.announcements.length === 1,
      "Enrolled student retrieves course announcements"
    );

    console.log("\n--- 7. Verifiable Completion Certificate System ---");
    // Test certificate retrieval for 100% completed course
    const certRes = await fetch(`${baseUrl}/${testCourse._id}/certificate`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const certData = await certRes.json();
    await assert(
      certRes.status === 200 &&
        certData.certificate.certificateId.startsWith("GLX-CERT-") &&
        certData.certificate.studentName === "Jane Student" &&
        certData.certificate.courseTitle === "Unit 12 Test Course",
      "Completed course returns verifiable certificate with unique code"
    );

    const certificateId = certData.certificate.certificateId;

    // Test public verification endpoint
    const verifyRes = await fetch(`${baseUrl}/verify-certificate/${certificateId}`);
    const verifyData = await verifyRes.json();
    await assert(
      verifyRes.status === 200 &&
        verifyData.valid === true &&
        verifyData.certificate.certificateId === certificateId &&
        verifyData.certificate.studentName === "Jane Student",
      "Public verification endpoint validates certificate successfully"
    );

    // Test incomplete course certificate rejection -> 400
    const incompleteEnrollment = await Enrollment.findOne({
      user: studentUser._id,
      course: testCourse._id,
    });
    incompleteEnrollment.progressPercentage = 50;
    incompleteEnrollment.isCompleted = false;
    await incompleteEnrollment.save();

    const badCertRes = await fetch(`${baseUrl}/${testCourse._id}/certificate`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const badCertData = await badCertRes.json();
    await assert(
      badCertRes.status === 400 &&
        badCertData.error ===
          "Course incomplete. Certificate can only be issued upon 100% course progress completion.",
      "Incomplete course certificate request is rejected with HTTP 400 error schema"
    );

  } catch (err) {
    console.error("Critical test execution error:", err);
    failed++;
  } finally {
    server.close();
    await mongoose.connection.close();
    console.log(`\n========================================`);
    console.log(`Results: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
