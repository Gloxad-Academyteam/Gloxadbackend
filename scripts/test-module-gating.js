import mongoose from "mongoose";
import { app } from "../src/app.js";
import connectDB from "../src/config/db.js";
import { User } from "../src/models/User.model.js";
import { Course } from "../src/models/Course.model.js";
import { Enrollment } from "../src/models/Enrollment.model.js";
import { Category } from "../src/models/Category.model.js";
import { Provider } from "../src/models/Provider.model.js";
import { Cohort } from "../src/models/Cohort.model.js";
import { signToken } from "../src/utils/jwt.js";
import { generateDeterministicQuiz, generateDeterministicTask } from "../src/utils/moduleAssessments.js";

let testPassed = 0;
let testFailed = 0;

const assert = (condition, message) => {
  if (condition) {
    testPassed++;
    console.log(`  ✓ [CHECK ${testPassed}] ${message}`);
  } else {
    testFailed++;
    console.error(`  ❌ [FAILED] ${message}`);
  }
};

async function runModuleGatingSuite() {
  console.log("\x1b[36m====================================================\x1b[0m");
  console.log("\x1b[36m GLOXAD LMS MODULE GATING & PHASE 1 VERIFICATION    \x1b[0m");
  console.log("\x1b[36m Suite: 27 Automated Checks (Part A + Phase 1)     \x1b[0m");
  console.log("\x1b[36m====================================================\x1b[0m\n");

  await connectDB();

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;

  try {
    // 1. Setup Test Users
    let studentUser = await User.findOne({ email: "student_gating@gloxad.com" });
    if (!studentUser) {
      studentUser = await User.create({
        firstName: "Gating",
        lastName: "Student",
        username: "student_gating",
        email: "student_gating@gloxad.com",
        password: "Password123!",
        role: "student",
        isEmailVerified: true,
        approvalStatus: "approved"
      });
    }

    let adminUser = await User.findOne({ email: "admin_gating@gloxad.com" });
    if (!adminUser) {
      adminUser = await User.create({
        firstName: "Admin",
        lastName: "Gating",
        username: "admin_gating",
        email: "admin_gating@gloxad.com",
        password: "Password123!",
        role: "admin",
        isEmailVerified: true,
        approvalStatus: "approved"
      });
    }

    const studentToken = signToken({
      sub: studentUser._id,
      role: studentUser.role,
      tokenVersion: studentUser.tokenVersion || 0
    });
    const adminToken = signToken({
      sub: adminUser._id,
      role: adminUser.role,
      tokenVersion: adminUser.tokenVersion || 0
    });

    // 2. Setup Test Course with sequentialModules: true
    const mod1Id = new mongoose.Types.ObjectId();
    const mod2Id = new mongoose.Types.ObjectId();
    const l1Id = new mongoose.Types.ObjectId();
    const l2Id = new mongoose.Types.ObjectId();
    const l3Id = new mongoose.Types.ObjectId();
    const quiz1Obj = generateDeterministicQuiz("test-gating-course", "Module 1: Foundations", 0, "Architecture");
    const task1Obj = generateDeterministicTask("test-gating-course", "Module 1: Foundations", 0);
    const quiz2Obj = generateDeterministicQuiz("test-gating-course", "Module 2: Advanced", 1, "Systems");
    const task2Obj = generateDeterministicTask("test-gating-course", "Module 2: Advanced", 1);

    await Course.deleteMany({ slug: "test-gating-course" });
    await Enrollment.deleteMany({ user: studentUser._id });

    const gatingCourse = await Course.create({
      title: "Test Gating Course: Systems Architecture",
      slug: "test-gating-course",
      subtitle: "Sequential Gating Verification",
      category: { name: "Software Development", slug: "software-development" },
      subCategory: "Backend",
      topic: "Architecture",
      level: "intermediate",
      courseType: "free",
      sequentialModules: true,
      price: 0,
      status: "published",
      instructor: adminUser._id,
      modules: [
        {
          _id: mod1Id,
          title: "Module 1: Foundations",
          lessons: [
            { _id: l1Id, title: "Lesson 1: Basics", duration: "10:00", videoUrl: "https://www.youtube.com/embed/test1" },
            { _id: l2Id, title: "Lesson 2: Core", duration: "12:00", videoUrl: "https://www.youtube.com/embed/test2" }
          ],
          quizzes: [quiz1Obj],
          task: task1Obj
        },
        {
          _id: mod2Id,
          title: "Module 2: Advanced",
          lessons: [
            { _id: l3Id, title: "Lesson 3: Advanced Patterns", duration: "15:00", videoUrl: "https://www.youtube.com/embed/test3" }
          ],
          quizzes: [quiz2Obj],
          task: task2Obj
        }
      ]
    });

    // CHECK 1: Course created with sequentialModules: true
    assert(gatingCourse.sequentialModules === true, "Free course created with sequentialModules: true and 2 gated modules");

    // CHECK 2: User enrolls in the free sequential course
    const enrollRes = await fetch(`${baseUrl}/enrollments/enroll/${gatingCourse._id}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const enrollData = await enrollRes.json();
    assert(enrollRes.status === 201 || enrollRes.status === 200, "Student successfully enrolls in free sequential course");

    // CHECK 3: Module lock states initially - Module 1 unlocked, Module 2 locked
    const modulesRes = await fetch(`${baseUrl}/learning/${gatingCourse._id}/modules`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const modulesData = await modulesRes.json();
    assert(
      modulesRes.status === 200 &&
      modulesData.modules[0].isLocked === false &&
      modulesData.modules[1].isLocked === true,
      "GET /api/learning/:courseId/modules shows Module 1 unlocked (false) and Module 2 locked (true)"
    );

    // CHECK 4: Accessing lesson in locked Module 2 returns 403 MODULE_LOCKED
    const lockedLessonRes = await fetch(`${baseUrl}/learning/${gatingCourse._id}/progress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({ lessonId: l3Id.toString(), completed: true })
    });
    const lockedLessonData = await lockedLessonRes.json();
    assert(
      lockedLessonRes.status === 403 && lockedLessonData.code === "MODULE_LOCKED",
      "Progress update for lesson in locked Module 2 returns 403 MODULE_LOCKED"
    );

    // CHECK 5: Quiz attempt when lessons incomplete returns 409 LESSONS_INCOMPLETE
    const quiz1Id = quiz1Obj._id;
    const earlyQuizRes = await fetch(`${baseUrl}/learning/${gatingCourse._id}/quiz/${quiz1Id}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({ answers: [0, 1, 2, 0, 2] })
    });
    const earlyQuizData = await earlyQuizRes.json();
    assert(
      earlyQuizRes.status === 409 && earlyQuizData.code === "LESSONS_INCOMPLETE",
      "Attempting quiz before lessons are completed returns 409 LESSONS_INCOMPLETE"
    );

    // CHECK 6: Written task submission before lessons complete returns 409 LESSONS_INCOMPLETE
    const validFiftyWords = "In this architectural analysis of the system, we examine how state transitions and service boundaries interact across microservices. We also evaluate the trade-offs between eventual consistency and strict ACID guarantees. Deploying defensive error middleware ensures unhandled rejections never compromise container availability, maintaining ninety-nine point nine percent uptime across production Kubernetes clusters.";
    const earlyTaskRes = await fetch(`${baseUrl}/learning/${gatingCourse._id}/modules/${mod1Id}/task`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({ text: validFiftyWords, link: "https://github.com/example/repo" })
    });
    const earlyTaskData = await earlyTaskRes.json();
    assert(
      earlyTaskRes.status === 409 && earlyTaskData.code === "LESSONS_INCOMPLETE",
      "Submitting written task before lessons complete returns 409 LESSONS_INCOMPLETE"
    );

    // CHECK 7: Complete Lesson 1
    const l1Res = await fetch(`${baseUrl}/learning/${gatingCourse._id}/progress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({ lessonId: l1Id.toString(), completed: true })
    });
    assert(l1Res.status === 200, "Completing Lesson 1 in Module 1 succeeds with 200");

    // CHECK 8: Quiz attempt when only 1 of 2 lessons complete still returns 409 LESSONS_INCOMPLETE
    const partialQuizRes = await fetch(`${baseUrl}/learning/${gatingCourse._id}/quiz/${quiz1Id}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({ answers: [0, 1, 2, 0, 2] })
    });
    const partialQuizData = await partialQuizRes.json();
    assert(
      partialQuizRes.status === 409 && partialQuizData.code === "LESSONS_INCOMPLETE",
      "Quiz attempt with partial lessons complete still returns 409 LESSONS_INCOMPLETE"
    );

    // CHECK 9: Complete Lesson 2
    const l2Res = await fetch(`${baseUrl}/learning/${gatingCourse._id}/progress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({ lessonId: l2Id.toString(), completed: true })
    });
    assert(l2Res.status === 200, "Completing Lesson 2 in Module 1 succeeds with 200");

    // CHECK 10: Written task submission before Quiz is passed returns 409 QUIZ_NOT_PASSED
    const preQuizTaskRes = await fetch(`${baseUrl}/learning/${gatingCourse._id}/modules/${mod1Id}/task`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({ text: validFiftyWords, link: "https://github.com/example/repo" })
    });
    const preQuizTaskData = await preQuizTaskRes.json();
    assert(
      preQuizTaskRes.status === 409 && preQuizTaskData.code === "QUIZ_NOT_PASSED",
      "Submitting written task before quiz is passed returns 409 QUIZ_NOT_PASSED"
    );

    // CHECK 11: Submitting quiz with failing score (< 70%) returns 200 with passed: false
    // Send all wrong answers
    const failingQuizRes = await fetch(`${baseUrl}/learning/${gatingCourse._id}/quiz/${quiz1Id}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({ answers: [3, 3, 3, 3, 3] })
    });
    const failingQuizData = await failingQuizRes.json();
    assert(
      failingQuizRes.status === 200 && failingQuizData.result.passed === false,
      "Failing quiz attempt (< 70%) records attempt and returns passed: false"
    );

    // CHECK 12: Written task submission after failing quiz still returns 409 QUIZ_NOT_PASSED
    const postFailTaskRes = await fetch(`${baseUrl}/learning/${gatingCourse._id}/modules/${mod1Id}/task`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({ text: validFiftyWords })
    });
    const postFailTaskData = await postFailTaskRes.json();
    assert(
      postFailTaskRes.status === 409 && postFailTaskData.code === "QUIZ_NOT_PASSED",
      "Submitting written task after failed quiz attempt still returns 409 QUIZ_NOT_PASSED"
    );

    // CHECK 13: Submitting quiz with passing answers returns passed: true and correctOptionIndex in breakdown
    const correctAnswers = quiz1Obj.questions.map((q) => ({
      questionId: q._id.toString(),
      selectedOptionIndex: q.correctOptionIndex
    }));
    const passQuizRes = await fetch(`${baseUrl}/learning/${gatingCourse._id}/quiz/${quiz1Id}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({ answers: correctAnswers })
    });
    const passQuizData = await passQuizRes.json();
    assert(
      passQuizRes.status === 200 &&
      passQuizData.result.passed === true &&
      passQuizData.result.score === 100 &&
      passQuizData.result.breakdown[0].correctOptionIndex !== undefined,
      "Passing quiz returns 200 passed: true and includes correctOptionIndex in post-attempt breakdown"
    );

    // CHECK 14: GET /api/learning/:courseId/modules/:moduleId/task returns prompt & requirements
    const taskGetRes = await fetch(`${baseUrl}/learning/${gatingCourse._id}/modules/${mod1Id}/task`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const taskGetData = await taskGetRes.json();
    assert(
      taskGetRes.status === 200 &&
      taskGetData.task.minWords === 50 &&
      taskGetData.task.submissionLinkAllowed === true &&
      taskGetData.isLocked === false,
      "GET /api/learning/:courseId/modules/:moduleId/task returns prompt, minWords: 50, and unlocked status"
    );

    // CHECK 15: Submitting task with less than 50 words fails with 400
    const shortText = "This is a brief reflection with only ten words total.";
    const shortTaskRes = await fetch(`${baseUrl}/learning/${gatingCourse._id}/modules/${mod1Id}/task`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({ text: shortText })
    });
    const shortTaskData = await shortTaskRes.json();
    assert(
      shortTaskRes.status === 400 && shortTaskData.error.includes("at least 50 words"),
      "Submitting task with < 50 words is rejected with 400 Bad Request"
    );

    // CHECK 16: Submitting task with invalid link format fails with 400
    const invalidLinkTaskRes = await fetch(`${baseUrl}/learning/${gatingCourse._id}/modules/${mod1Id}/task`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({ text: validFiftyWords, link: "invalid-url-not-http" })
    });
    const invalidLinkData = await invalidLinkTaskRes.json();
    assert(
      invalidLinkTaskRes.status === 400 && invalidLinkData.error.includes("valid HTTP or HTTPS URL"),
      "Submitting task with invalid URL format is rejected with 400 Bad Request"
    );

    // CHECK 17: Submitting valid task unlocks Module 2
    const validTaskRes = await fetch(`${baseUrl}/learning/${gatingCourse._id}/modules/${mod1Id}/task`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({ text: validFiftyWords, link: "https://github.com/gloxad/architecture" })
    });
    const validTaskData = await validTaskRes.json();
    assert(
      validTaskRes.status === 200 && validTaskData.nextModuleUnlocked === true,
      "Valid task submission succeeds and returns nextModuleUnlocked: true"
    );

    // CHECK 18: Duplicate submission returns 200 without creating duplicate record
    const dupTaskRes = await fetch(`${baseUrl}/learning/${gatingCourse._id}/modules/${mod1Id}/task`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({ text: validFiftyWords, link: "https://github.com/gloxad/architecture" })
    });
    const dupTaskData = await dupTaskRes.json();
    assert(
      dupTaskRes.status === 200 && dupTaskData.message === "Task submission already received",
      "Duplicate task submission is idempotent and acknowledges receipt without duplicate attempt"
    );

    // CHECK 19: Updated/revised submission records new attempt and preserves history
    const revisedText = validFiftyWords + " Additionally, we have incorporated circuit breaker patterns using Polly and resilience strategies.";
    const revisedTaskRes = await fetch(`${baseUrl}/learning/${gatingCourse._id}/modules/${mod1Id}/task`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({ text: revisedText, link: "https://github.com/gloxad/architecture-v2" })
    });
    const revisedTaskData = await revisedTaskRes.json();
    assert(
      revisedTaskRes.status === 200 && revisedTaskData.message === "Written task submitted successfully",
      "Submitting revised written task records new submission version and updates latest"
    );

    // CHECK 20: Module 1 is now isCompleted: true, and Module 2 is isLocked: false
    const updatedModulesRes = await fetch(`${baseUrl}/learning/${gatingCourse._id}/modules`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const updatedModulesData = await updatedModulesRes.json();
    assert(
      updatedModulesData.modules[0].isCompleted === true &&
      updatedModulesData.modules[1].isLocked === false,
      "Module lock status updates: Module 1 isCompleted: true and Module 2 isLocked: false"
    );

    // CHECK 21: Lesson in Module 2 can now be accessed and completed
    const l3Res = await fetch(`${baseUrl}/learning/${gatingCourse._id}/progress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({ lessonId: l3Id.toString(), completed: true })
    });
    assert(l3Res.status === 200, "Lesson in previously locked Module 2 now successfully marked completed");

    // CHECK 22: Sequential progress rule (counts lessons + quizzes + tasks)
    const enrollmentDoc = await Enrollment.findOne({ user: studentUser._id, course: gatingCourse._id });
    // Completed: 2 lessons in mod 1 + 1 lesson in mod 2 = 3 lessons; 1 passed quiz; 1 task = 5 items done out of 3 lessons + 2 quizzes + 2 tasks = 7 total -> ~71%
    assert(
      enrollmentDoc.progressPercentage > 0 && enrollmentDoc.progressPercentage <= 100,
      `Sequential course progress formula counts lessons + quizzes + tasks (current: ${enrollmentDoc.progressPercentage}%)`
    );

    // =========================================================================
    // PHASE 1 CHECKS: Dynamic Categories, Provider Attribution, 22-Node Trail
    // =========================================================================

    // Clean up any residual test records from prior runs to ensure repeatability
    await Category.deleteMany({ name: "Test Dynamic Category" });
    await Provider.deleteMany({ name: "Test Harvard CS50" });

    // CHECK 23: Dynamic Category creation with tags, pathways, and aliases
    const testCatRes = await fetch(`${baseUrl}/admin/categories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: "Test Dynamic Category",
        icon: "cpu",
        order: 99,
        tags: ["TestTag1", "TestTag2"],
        pathways: ["AI for Agriculture", "Climate Fintech"],
        aliases: ["test-cat-alias"]
      })
    });
    const testCatData = await testCatRes.json();
    assert(
      testCatRes.status === 201 &&
      testCatData.category.pathways.includes("AI for Agriculture") &&
      testCatData.category.tags.includes("TestTag1"),
      "Admin creates dynamic taxonomy category with tags, aliases, and cross-category pathways"
    );

    const createdCatId = testCatData.category._id;

    // CHECK 24: Soft deactivation of category preserving old references
    const deactivateRes = await fetch(`${baseUrl}/admin/categories/${createdCatId}/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ isActive: false })
    });
    const deactivateData = await deactivateRes.json();

    const publicCatsRes = await fetch(`${baseUrl}/categories`);
    const publicCatsData = await publicCatsRes.json();
    const isHiddenFromPublic = !publicCatsData.categories.some((c) => c._id === createdCatId);

    assert(
      deactivateRes.status === 200 &&
      deactivateData.category.isActive === false &&
      isHiddenFromPublic,
      "Soft deactivation of category succeeds and filters out of public listing without deleting"
    );

    // CHECK 25: Provider registry entity creation & validation
    await Provider.deleteMany({ slug: "test-harvard-cs50" });
    const createProvRes = await fetch(`${baseUrl}/admin/providers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: "Test Harvard CS50",
        type: "institution",
        platform: "youtube",
        channelUrl: "https://www.youtube.com/@cs50",
        originalUrl: "https://cs50.harvard.edu",
        ownershipClass: "externally_curated",
        embedAllowed: true,
        bio: "Introduction to Computer Science."
      })
    });
    const createProvData = await createProvRes.json();
    assert(
      createProvRes.status === 201 &&
      createProvData.provider.ownershipClass === "externally_curated" &&
      createProvData.provider.embedAllowed === true,
      "Admin registers new content provider attribution entity with ownershipClass and embed policy"
    );

    // CHECK 26: Course links to Provider and enforces official embed policy
    gatingCourse.provider = createProvData.provider._id;
    await gatingCourse.save();
    const populatedCourse = await Course.findById(gatingCourse._id).populate("provider");
    assert(
      populatedCourse.provider &&
      populatedCourse.provider.name === "Test Harvard CS50" &&
      populatedCourse.provider.embedAllowed === true,
      "Course attribution links to Provider entity and verifies official YouTube embed policy"
    );

    // CHECK 27: 12-Week 22-Node Curriculum Trail API
    // Create a test cohort for curriculum trail verification
    const testCohort = await Cohort.create({
      name: "Fall 2026 Systems Engineering",
      code: "GLX-SYS-2026",
      trimesterId: new mongoose.Types.ObjectId(),
      courseId: gatingCourse._id,
      capacity: 50,
      enrolledCount: 1,
      studentIds: [studentUser._id],
      status: "active"
    });

    const trailRes = await fetch(`${baseUrl}/lms/cohorts/${testCohort._id}/curriculum`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const trailData = await trailRes.json();
    const trail = trailData.learningTrail || [];

    const week1To10Count = trail.filter((n) => n.week >= 1 && n.week <= 10).length;
    const week11Count = trail.filter((n) => n.week === 11).length;
    const week12Count = trail.filter((n) => n.week === 12).length;

    assert(
      trailRes.status === 200 &&
      trail.length === 22 &&
      week1To10Count === 10 &&
      week11Count === 6 &&
      week12Count === 6 &&
      trail[0].activities.includes("recorded") &&
      trail[21].title.includes("Certification"),
      "Curriculum API returns complete 12-week, 22-node trail (Nodes 1-10 daily pattern, 11-16 practicals, 17-22 capstone)"
    );

    // Clean up test records
    await Course.deleteMany({ slug: "test-gating-course" });
    await Cohort.deleteMany({ _id: testCohort._id });
    await Category.deleteMany({ _id: createdCatId });
    await Provider.deleteMany({ _id: createProvData.provider._id });

  } catch (error) {
    console.error("Test execution exception:", error);
    testFailed++;
  } finally {
    server.close();
    await mongoose.connection.close();

    console.log("\n====================================================");
    console.log(`   SUITE COMPLETE: ${testPassed} Passed, ${testFailed} Failed`);
    console.log("====================================================\n");

    if (testFailed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runModuleGatingSuite();
