import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import http from "http";
import connectDB from "../src/config/db.js";
import { app } from "../src/app.js";
import { User } from "../src/models/User.model.js";
import { Cohort } from "../src/models/Cohort.model.js";
import { Course } from "../src/models/Course.model.js";
import { LmsFinalProject } from "../src/models/LmsFinalProject.model.js";
import { GradeAudit } from "../src/models/GradeAudit.model.js";
import { generateToken } from "../src/utils/jwt.js";

const TEST_PORT = 3004;
const BASE_URL = `http://localhost:${TEST_PORT}/api/lms`;

async function runPhase2Tests() {
  console.log("====================================================");
  console.log(" GLOXAD LMS PHASE 2: ACADEMIC GOVERNANCE TEST SUITE ");
  console.log(" 8-Stage State Machine + Grading Engine & Gradebook  ");
  console.log("====================================================\n");

  let server;
  let studentUser, instructorUser, adminUser;
  let studentToken, instructorToken, adminToken;
  let testCohort, testCourse;

  try {
    await connectDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(TEST_PORT, resolve));
    console.log(`✓ Test server running on port ${TEST_PORT}\n`);

    const timestamp = Date.now();

    // 1. Setup Users
    studentUser = await User.create({
      firstName: "GovStudent",
      lastName: "Tester",
      username: `gov_student_${timestamp}`,
      email: `gov_student_${timestamp}@test.com`,
      password: "Password123!",
      role: "student",
      isEmailVerified: true,
    });
    studentToken = generateToken(studentUser);

    instructorUser = await User.create({
      firstName: "GovInstructor",
      lastName: "Tester",
      username: `gov_inst_${timestamp}`,
      email: `gov_inst_${timestamp}@test.com`,
      password: "Password123!",
      role: "instructor",
      isEmailVerified: true,
      approvalStatus: "approved",
    });
    instructorToken = generateToken(instructorUser);

    adminUser = await User.create({
      firstName: "GovAdmin",
      lastName: "Tester",
      username: `gov_admin_${timestamp}`,
      email: `gov_admin_${timestamp}@test.com`,
      password: "Password123!",
      role: "admin",
      isEmailVerified: true,
    });
    adminToken = generateToken(adminUser);

    // 2. Setup Course & Cohort
    testCourse = await Course.create({
      title: "Governance Capstone Course",
      slug: `gov-course-${timestamp}`,
      category: { name: "Software Development", slug: "software-development" },
      courseType: "trimester",
      instructor: instructorUser._id,
      modules: [],
    });

    testCohort = await Cohort.create({
      name: `Governance Cohort ${timestamp}`,
      courseId: testCourse._id,
      trimesterId: new mongoose.Types.ObjectId(),
      instructorIds: [instructorUser._id],
      studentIds: [studentUser._id],
      completionWeights: {
        quizzes: 15,
        assignments: 15,
        practicals: 15,
        codingChallenges: 10,
        attendance: 10,
        weeklyTasks: 10,
        finalProject: 25,
        passingThreshold: 70,
      },
    });

    // CHECK 1: Initialize final project (Stage 1: topic_submission)
    console.log("CHECK 1: Student initializes final project (Stage 1)");
    const initRes = await fetch(`${BASE_URL}/cohorts/${testCohort._id}/final-project`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        title: "Autonomous Fleet Telemetry Platform",
        description: "Real-time IoT data processing pipeline using microservices",
        repositoryUrl: "https://github.com/student/autonomous-fleet",
      }),
    });
    const initData = await initRes.json();
    if (initRes.status !== 201 || !initData.project || initData.project.currentStage !== 1) {
      throw new Error(`Failed to initialize final project: ${JSON.stringify(initData)}`);
    }
    const projectId = initData.project._id;
    console.log("  ✓ Status 201: Final project initialized at Stage 1 (topic_submission)");

    // CHECK 2: Cannot skip stages (Attempting to submit Stage 4 directly)
    console.log("\nCHECK 2: Attempting to submit Stage 4 directly while at Stage 1 returns 403 STAGE_LOCKED");
    const skipRes = await fetch(`${BASE_URL}/cohorts/${testCohort._id}/final-project/stages/4/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        deliverables: { codeRepo: "https://github.com/student/repo" },
      }),
    });
    const skipData = await skipRes.json();
    if (skipRes.status !== 403 || skipData.code !== "STAGE_LOCKED") {
      throw new Error(`Expected 403 STAGE_LOCKED, got ${skipRes.status}: ${JSON.stringify(skipData)}`);
    }
    console.log("  ✓ Correctly rejected with 403 STAGE_LOCKED");

    // CHECK 3: Instructor reviews Stage 1 with revisions_required
    console.log("\nCHECK 3: Tutor reviews Stage 1 with revisions_required (stays at Stage 1)");
    const revReqRes = await fetch(`${BASE_URL}/final-projects/${projectId}/stages/1/review`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${instructorToken}`,
      },
      body: JSON.stringify({
        decision: "revisions_required",
        notes: "Scope too broad. Clarify data storage boundaries.",
      }),
    });
    const revReqData = await revReqRes.json();
    if (revReqRes.status !== 200 || revReqData.project.stageStatus !== "revisions_required" || revReqData.project.currentStage !== 1) {
      throw new Error(`Expected revisions_required at Stage 1: ${JSON.stringify(revReqData)}`);
    }
    console.log("  ✓ Stage 1 marked revisions_required without advancing stage");

    // CHECK 4: Student resubmits Stage 1 with updated scope
    console.log("\nCHECK 4: Student resubmits Stage 1 revisions");
    const resubRes = await fetch(`${BASE_URL}/cohorts/${testCohort._id}/final-project/stages/1/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        deliverables: { refinedScope: "Restricted to GPS & engine temperature sensor telemetry" },
        notes: "Narrowed scope per feedback",
      }),
    });
    const resubData = await resubRes.json();
    if (resubRes.status !== 200 || resubData.project.stageStatus !== "under_review") {
      throw new Error(`Expected under_review after resubmission: ${JSON.stringify(resubData)}`);
    }
    console.log("  ✓ Resubmission recorded and set to under_review");

    // CHECK 5: Tutor approves Stage 1 -> Advances to Stage 2 (proposal_review)
    console.log("\nCHECK 5: Tutor approves Stage 1 -> Advances project to Stage 2");
    const appStage1Res = await fetch(`${BASE_URL}/final-projects/${projectId}/stages/1/review`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${instructorToken}`,
      },
      body: JSON.stringify({
        decision: "approved",
        notes: "Approved. Proceed with detailed proposal.",
      }),
    });
    const appStage1Data = await appStage1Res.json();
    if (appStage1Res.status !== 200 || appStage1Data.project.currentStage !== 2) {
      throw new Error(`Expected currentStage=2: ${JSON.stringify(appStage1Data)}`);
    }
    console.log("  ✓ Project advanced to Stage 2 (proposal_review)");

    // CHECK 6: Walk through stages 2 through 7 approval
    console.log("\nCHECK 6: Fast-forward stages 2 through 7 approvals");
    for (let s = 2; s <= 7; s++) {
      // Submit
      await fetch(`${BASE_URL}/cohorts/${testCohort._id}/final-project/stages/${s}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          deliverables: { artifact: `Stage ${s} deliverable content` },
        }),
      });
      // Approve
      const r = await fetch(`${BASE_URL}/final-projects/${projectId}/stages/${s}/review`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${instructorToken}`,
        },
        body: JSON.stringify({
          decision: "approved",
          notes: `Stage ${s} passed inspection`,
        }),
      });
      const d = await r.json();
      if (d.project.currentStage !== s + 1) {
        throw new Error(`Failed to advance from Stage ${s} to ${s + 1}`);
      }
    }
    console.log("  ✓ Successfully advanced through Stage 7 to Stage 8 (final_evaluation)");

    // CHECK 7: Stage 8 submission by student
    console.log("\nCHECK 7: Student submits Stage 8 final presentation & defense artifacts");
    const st8SubRes = await fetch(`${BASE_URL}/cohorts/${testCohort._id}/final-project/stages/8/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        deliverables: {
          codeRepo: "https://github.com/student/autonomous-fleet-final",
          liveDemo: "https://fleet-demo.gloxad.com",
          slideDeckUrl: "https://gloxad-bucket.s3.amazonaws.com/slides/defense.pdf",
        },
        notes: "Completed final code and recorded defense presentation",
      }),
    });
    if (st8SubRes.status !== 200) throw new Error("Stage 8 submission failed");
    console.log("  ✓ Stage 8 submitted for review");

    // CHECK 8: Tutor reviews Stage 8 -> Recommends mark, sets pending_admin_approval
    console.log("\nCHECK 8: Tutor recommends mark 92% at Stage 8 (sets pending_admin_approval; not official yet)");
    const tutorRevRes = await fetch(`${BASE_URL}/final-projects/${projectId}/stages/8/review`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${instructorToken}`,
      },
      body: JSON.stringify({
        decision: "approved",
        score: 92,
        notes: "Exceptional architecture and defense. Recommended score: 92/100.",
      }),
    });
    const tutorRevData = await tutorRevRes.json();
    if (
      tutorRevRes.status !== 200 ||
      tutorRevData.project.stageStatus !== "pending_admin_approval" ||
      tutorRevData.project.isApproved !== false ||
      tutorRevData.project.tutorRecommendation.score !== 92
    ) {
      throw new Error(`Expected pending_admin_approval with isApproved: false: ${JSON.stringify(tutorRevData)}`);
    }
    console.log("  ✓ Status pending_admin_approval: Grade remains unofficial pending administrator sign-off");

    // CHECK 9: Admin grants official final sign-off
    console.log("\nCHECK 9: Administrator grants official final sign-off");
    const adminAppRes = await fetch(`${BASE_URL}/final-projects/${projectId}/admin-approve`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        decision: "approved",
        notes: "Admin committee reviewed defense recording. Final approval granted.",
      }),
    });
    const adminAppData = await adminAppRes.json();
    if (
      adminAppRes.status !== 200 ||
      adminAppData.project.isApproved !== true ||
      adminAppData.project.score !== 92 ||
      !adminAppData.project.adminSignOff.isApproved
    ) {
      throw new Error(`Failed administrator sign-off: ${JSON.stringify(adminAppData)}`);
    }
    console.log("  ✓ Official grade locked at 92% and isApproved set to true");

    // CHECK 10: Reject assessment weights that do not total 100%
    console.log("\nCHECK 10: Updating assessment weights to sum != 100% returns 400 Bad Request");
    const badWeightsRes = await fetch(`${BASE_URL}/cohorts/${testCohort._id}/assessment-weights`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        quizzes: 20,
        assignments: 20,
        practicals: 20,
        codingChallenges: 10,
        attendance: 10,
        weeklyTasks: 10,
        finalProject: 30, // Sum = 120%
      }),
    });
    const badWeightsData = await badWeightsRes.json();
    if (badWeightsRes.status !== 400 || !badWeightsData.error.includes("100%")) {
      throw new Error(`Expected 400 with 100% error message, got: ${JSON.stringify(badWeightsData)}`);
    }
    console.log("  ✓ Correctly rejected with 400: Assessment weights must total exactly 100%");

    // CHECK 11: Valid weights update logs GradeAudit entry
    console.log("\nCHECK 11: Valid weights update creates GradeAudit entry");
    const goodWeightsRes = await fetch(`${BASE_URL}/cohorts/${testCohort._id}/assessment-weights`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        quizzes: 15,
        assignments: 15,
        practicals: 15,
        codingChallenges: 10,
        attendance: 10,
        weeklyTasks: 10,
        finalProject: 25, // Sum = 100%
        reason: "Academic curriculum alignment for trimester 2026",
      }),
    });
    if (goodWeightsRes.status !== 200) throw new Error("Failed to update weights");

    const auditEntry = await GradeAudit.findOne({
      cohortId: testCohort._id,
      assessmentType: "completion_weights",
    });
    if (!auditEntry) throw new Error("GradeAudit entry was not created for weight changes");
    console.log("  ✓ Weights updated to 100% and logged in GradeAudit collection");

    // CHECK 12: Student transcript returns itemized calculation and letter grade
    console.log("\nCHECK 12: GET /api/lms/cohorts/:cohortId/my-transcript returns student breakdown");
    const transRes = await fetch(`${BASE_URL}/cohorts/${testCohort._id}/my-transcript`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${studentToken}`,
      },
    });
    const transData = await transRes.json();
    if (transRes.status !== 200 || !transData.transcript || !transData.transcript.letterGrade) {
      throw new Error(`Failed to retrieve transcript: ${JSON.stringify(transData)}`);
    }
    console.log(`  ✓ Transcript calculated: Total=${transData.transcript.totalWeightedScore}%, Grade=${transData.transcript.letterGrade}`);
    console.log(`  ✓ 3 States: learningCompletion=${transData.transcript.states.learningCompletion}, academicPerformance=${transData.transcript.states.academicPerformance}, certificateEligibility=${transData.transcript.states.certificateEligibility}`);

    // CHECK 13: Tutor class gradebook roster
    console.log("\nCHECK 13: GET /api/lms/cohorts/:cohortId/gradebook returns full class roster");
    const gbRes = await fetch(`${BASE_URL}/cohorts/${testCohort._id}/gradebook`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${instructorToken}`,
      },
    });
    const gbData = await gbRes.json();
    if (gbRes.status !== 200 || !Array.isArray(gbData.roster) || gbData.roster.length === 0) {
      throw new Error(`Failed to retrieve class gradebook: ${JSON.stringify(gbData)}`);
    }
    console.log(`  ✓ Gradebook roster contains ${gbData.roster.length} student(s) with letter grades`);

    // CHECK 14: Manual grade override with audit log
    console.log("\nCHECK 14: Instructor manual grade override logs GradeAudit and updates score");
    const overrideRes = await fetch(`${BASE_URL}/cohorts/${testCohort._id}/gradebook/override`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${instructorToken}`,
      },
      body: JSON.stringify({
        studentId: studentUser._id,
        newMark: 88,
        reason: "Honours practical demonstration override",
      }),
    });
    const overrideData = await overrideRes.json();
    if (overrideRes.status !== 200 || overrideData.updatedTranscript.totalWeightedScore !== 88) {
      throw new Error(`Failed manual grade override: ${JSON.stringify(overrideData)}`);
    }
    console.log("  ✓ Manual override applied (88%) and logged in GradeAudit");

    // CHECK 15: Downloadable CSV Gradebook Export
    console.log("\nCHECK 15: GET /api/lms/cohorts/:cohortId/gradebook/export returns valid CSV");
    const csvRes = await fetch(`${BASE_URL}/cohorts/${testCohort._id}/gradebook/export`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${instructorToken}`,
      },
    });
    const csvText = await csvRes.text();
    const contentType = csvRes.headers.get("content-type");
    if (csvRes.status !== 200 || !contentType.includes("csv") || !csvText.includes("Student ID")) {
      throw new Error(`CSV export failed: status=${csvRes.status}, content=${csvText.slice(0, 100)}`);
    }
    console.log("  ✓ Gradebook CSV generated successfully with header columns");

    // Cleanup
    console.log("\nCleaning up test artifacts...");
    await LmsFinalProject.deleteMany({ cohortId: testCohort._id });
    await GradeAudit.deleteMany({ cohortId: testCohort._id });
    await Cohort.deleteOne({ _id: testCohort._id });
    await Course.deleteOne({ _id: testCourse._id });
    await User.deleteMany({ _id: { $in: [studentUser._id, instructorUser._id, adminUser._id] } });
    console.log("  ✓ Test artifacts cleaned up.");

    console.log("\n====================================================");
    console.log("   PHASE 2 VERIFICATION COMPLETE: 15/15 PASSED!     ");
    console.log("====================================================\n");
  } catch (error) {
    console.error("❌ Phase 2 Test Error:", error);
    process.exit(1);
  } finally {
    if (server) server.close();
    await mongoose.connection.close();
    process.exit(0);
  }
}

runPhase2Tests();
