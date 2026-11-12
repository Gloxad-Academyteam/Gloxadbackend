/**
 * Unit 27: notifications, Continue Learning, support flags, certificate issuing (spec 27).
 *   node scripts/test-unit27-engagement.js   # starts its own server
 */
import dotenv from "dotenv";
dotenv.config();
import http from "http";
import mongoose from "mongoose";
import connectDB from "../src/config/db.js";
import { app } from "../src/app.js";
import { User } from "../src/models/User.model.js";
import { Course } from "../src/models/Course.model.js";
import { Cohort } from "../src/models/Cohort.model.js";
import { LmsLessonProgress } from "../src/models/LmsLessonProgress.model.js";
import { LmsLiveSession } from "../src/models/LmsLiveSession.model.js";
import { LmsAttendance } from "../src/models/LmsAttendance.model.js";
import { LmsAssignment } from "../src/models/LmsAssignment.model.js";
import { LmsSubmission } from "../src/models/LmsSubmission.model.js";
import { LmsCertificate } from "../src/models/LmsCertificate.model.js";
import { Notification } from "../src/models/Notification.model.js";
import { generateToken } from "../src/utils/jwt.js";

const PORT = 3027;
const API = `http://localhost:${PORT}/api/lms`;
const DAY = 24 * 60 * 60 * 1000;
let failures = 0, total = 0;
const check = (label, ok, detail) => {
  total += 1;
  if (ok) console.log(`  ✓ ${label}`);
  else { failures += 1; console.log(`  ✗ ${label}${detail !== undefined ? `  -> ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`); }
};
const section = (t) => console.log(`\n${t}`);
const call = async (method, path, token, body) => {
  const res = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined || method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const created = { users: [], courses: [], cohorts: [] };
const make = async (role, label, extra = {}) => {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const user = await User.create({ firstName: label, lastName: "Unit27", username: `u27_${label}_${stamp}`.toLowerCase(), email: `u27_${label}_${stamp}@test.com`.toLowerCase(), password: "Password123!", role, isEmailVerified: true, ...extra });
  created.users.push(user._id);
  return { user, token: generateToken(user) };
};
const types = (userId, type) => Notification.countDocuments({ recipient: userId, type });

const run = async () => {
  await connectDB();
  const server = http.createServer(app);
  await new Promise((r) => server.listen(PORT, r));
  try {
    const admin = await make("admin", "admin");
    const tutor = await make("instructor", "tutor", { approvalStatus: "approved" });
    const otherTutor = await make("instructor", "othertutor", { approvalStatus: "approved" });
    const alice = await make("student", "alice");
    const bob = await make("student", "bob");
    const carol = await make("student", "carol");
    const outsider = await make("student", "outsider");

    const course = await Course.create({
      title: "U27 Course", slug: `u27-${Date.now()}`, category: { name: "Software Development", slug: "software-development" }, courseType: "trimester", status: "published", instructor: tutor.user._id,
      modules: [{ title: "Week 1", lessons: [{ title: "Lesson A" }, { title: "Lesson B" }] }, { title: "Week 2", lessons: [{ title: "Lesson C" }] }],
    });
    const emptyCourse = await Course.create({ title: "U27 Empty", slug: `u27e-${Date.now()}`, category: { name: "Software Development", slug: "software-development" }, courseType: "trimester", status: "published", instructor: tutor.user._id, modules: [] });
    created.courses.push(course._id, emptyCourse._id);
    const cohort = await Cohort.create({ name: `U27 Cohort ${Date.now()}`, courseId: course._id, trimesterId: new mongoose.Types.ObjectId(), instructorIds: [tutor.user._id], studentIds: [alice.user._id, bob.user._id, carol.user._id], status: "active", currentWeek: 1 });
    const emptyCohort = await Cohort.create({ name: `U27 EmptyC ${Date.now()}`, courseId: emptyCourse._id, trimesterId: new mongoose.Types.ObjectId(), instructorIds: [tutor.user._id], studentIds: [alice.user._id], status: "active" });
    created.cohorts.push(cohort._id, emptyCohort._id);
    const lessons = course.modules.flatMap((m) => m.lessons.map((l) => ({ lessonId: l._id, moduleId: m._id })));

    section("1. Notifications");
    const posted = await call("POST", `/cohorts/${cohort._id}/announcements`, tutor.token, { title: "Week 2 schedule", message: "Details inside." });
    check("a tutor posts an announcement", posted.status === 201, posted.data);
    check("every student is notified, the tutor and outsiders are not", (await types(alice.user._id, "new_announcement")) === 1 && (await types(bob.user._id, "new_announcement")) === 1 && (await types(carol.user._id, "new_announcement")) === 1 && (await types(tutor.user._id, "new_announcement")) === 0 && (await types(outsider.user._id, "new_announcement")) === 0);
    const assignment = await LmsAssignment.create({ cohortId: cohort._id, moduleId: course.modules[0]._id, title: "Build a page", summary: "s", description: "d", dueAt: new Date(Date.now() + 2 * DAY), maxPoints: 100, totalPoints: 100 }).catch((e) => { throw new Error(`Assignment fixture invalid: ${e.message}`); });
    const submitted = await call("POST", `/assignments/${assignment._id}/submissions`, alice.token, { repoUrl: "https://github.com/alice/project", comment: "done" });
    check("a student submits an assignment", submitted.status === 201, submitted.data);
    check("the cohort's tutor is told", (await types(tutor.user._id, "submission_received")) === 1 && (await types(otherTutor.user._id, "submission_received")) === 0);

    section("2. Continue Learning");
    const at = (token, id = cohort._id) => call("GET", `/continue-learning?cohortId=${id}`, token);
    const start = await at(alice.token);
    check("with no activity it starts at the first lesson", start.status === 200 && start.data.continueLearning.reason === "start" && start.data.continueLearning.title === "Lesson A" && start.data.continueLearning.weekNumber === 1, start.data);
    await LmsLessonProgress.create({ cohortId: cohort._id, userId: alice.user._id, lessonId: lessons[0].lessonId, moduleId: lessons[0].moduleId, status: "in_progress", scrollPosition: 340, lastActivityAt: new Date() });
    const resume = await at(alice.token);
    check("with a lesson in progress it resumes there with the scroll position", resume.data.continueLearning.reason === "resume" && resume.data.continueLearning.title === "Lesson A" && resume.data.continueLearning.scrollPosition === 340, resume.data);
    await LmsLessonProgress.updateOne({ cohortId: cohort._id, userId: alice.user._id, lessonId: lessons[0].lessonId }, { status: "completed" });
    const next = await at(alice.token);
    check("when that lesson is completed it opens the next one", next.data.continueLearning.reason === "next" && next.data.continueLearning.title === "Lesson B", next.data);
    await LmsLessonProgress.create({ cohortId: cohort._id, userId: alice.user._id, lessonId: lessons[2].lessonId, moduleId: lessons[2].moduleId, status: "completed", lastActivityAt: new Date(Date.now() + 1000) });
    const finished = await at(alice.token);
    check("after the last lesson it says finished", finished.data.continueLearning.reason === "finished" && finished.data.continueLearning.title === "Lesson C" && finished.data.continueLearning.weekNumber === 2, finished.data);
    check("another student's pointer is not affected", (await at(bob.token)).data.continueLearning.reason === "start");
    check("an outsider is refused", (await at(outsider.token)).status === 403);
    check("a course with no lessons gives null", (await at(alice.token, emptyCohort._id)).data.continueLearning === null);
    check("signed-out is 401", (await call("GET", "/continue-learning", null)).status === 401);

    section("3. Support flags");
    const flags = (token, id = cohort._id) => call("GET", `/instructor/cohorts/${id}/support-flags`, token);
    check("a student cannot read flags", (await flags(alice.token)).status === 403);
    check("a tutor of another cohort cannot", (await flags(otherTutor.token)).status === 403);
    check("an invalid id is 400", (await flags(tutor.token, "nope")).status === 400);
    check("an unknown cohort is 404", (await flags(tutor.token, new mongoose.Types.ObjectId())).status === 404);
    const week1 = await flags(tutor.token);
    check("in week 1 nobody is flagged for low progress", week1.status === 200 && week1.data.students.every((s) => !s.flags.includes("low_progress")) && week1.data.thresholds.lowProgressPercent === 40, week1.data.summary);
    await Cohort.updateOne({ _id: cohort._id }, { currentWeek: 3 });
    // two ended classes: Alice attended both, Bob none, Carol one but the other excused
    const sessions = await LmsLiveSession.insertMany([1, 2].map((n) => ({ cohortId: cohort._id, title: `Class ${n}`, instructorId: tutor.user._id, startsAt: new Date(Date.now() - n * DAY), endsAt: new Date(Date.now() - n * DAY + 3600000), roomName: `u27-room-${n}-${Date.now()}`, status: "ended" })));
    await LmsAttendance.insertMany([
      { sessionId: sessions[0]._id, cohortId: cohort._id, userId: alice.user._id, status: "present" },
      { sessionId: sessions[1]._id, cohortId: cohort._id, userId: alice.user._id, status: "present" },
      { sessionId: sessions[0]._id, cohortId: cohort._id, userId: carol.user._id, status: "present" },
      { sessionId: sessions[1]._id, cohortId: cohort._id, userId: carol.user._id, status: "excused" },
    ]);
    const lateOne = await LmsAssignment.create({ cohortId: cohort._id, moduleId: course.modules[0]._id, title: "Late one", summary: "s", description: "d", dueAt: new Date(Date.now() - DAY), maxPoints: 10, totalPoints: 10, allowLate: true });
    await LmsSubmission.insertMany([assignment, lateOne].map((a) => ({ assignmentId: a._id, cohortId: cohort._id, userId: bob.user._id, isLate: true, status: "pending_review" })));
    const week3 = await flags(tutor.token);
    const byName = (n) => week3.data.students.find((s) => s.name.startsWith(n));
    check("Alice: 100 percent attendance, finished lessons, no flags", byName("alice").attendancePercent === 100 && byName("alice").progressPercent === 67 && byName("alice").flags.length === 0, byName("alice"));
    check("Bob is flagged for low progress, low attendance and late work", ["low_progress", "low_attendance", "late_work"].every((f) => byName("bob").flags.includes(f)) && byName("bob").attendancePercent === 0 && byName("bob").lateSubmissions === 2, byName("bob"));
    check("Carol's excused class does not count against her (100 percent)", byName("carol").attendancePercent === 100 && !byName("carol").flags.includes("low_attendance"), byName("carol"));
    check("Carol is still flagged for low progress (no lessons done)", byName("carol").flags.includes("low_progress"));
    check("flagged learners come first and the summary counts them", week3.data.students[0].name.startsWith("bob") && week3.data.summary.flagged === 2 && week3.data.summary.total === 3, week3.data.summary);
    check("an admin can read the flags of any cohort", (await flags(admin.token)).status === 200);

    section("4. Thresholds");
    const put = (token, body, id = cohort._id) => call("PUT", `/admin/cohorts/${id}/support-thresholds`, token, body);
    check("a tutor cannot change thresholds", (await put(tutor.token, { lowProgressPercent: 10 })).status === 403);
    check("a percentage above 100 is 400", (await put(admin.token, { lowProgressPercent: 150 })).status === 400);
    check("a late count of 0 is 400", (await put(admin.token, { lateSubmissions: 0 })).status === 400);
    check("an unknown cohort is 404", (await put(admin.token, { lowProgressPercent: 10 }, new mongoose.Types.ObjectId())).status === 404);
    const changed = await put(admin.token, { lowProgressPercent: 0, lateSubmissions: 3 });
    check("admin changes the thresholds", changed.status === 200 && changed.data.supportThresholds.lowProgressPercent === 0 && changed.data.supportThresholds.lateSubmissions === 3 && changed.data.supportThresholds.lowAttendancePercent === 60, changed.data);
    const after = await flags(tutor.token);
    const bobAfter = after.data.students.find((s) => s.name.startsWith("bob"));
    check("the rules follow the new thresholds", !bobAfter.flags.includes("low_progress") && !bobAfter.flags.includes("late_work") && bobAfter.flags.includes("low_attendance"), bobAfter);

    section("5. Issuing and revoking certificates");
    const issue = (token, body, id = cohort._id) => call("POST", `/admin/cohorts/${id}/certificates`, token, body);
    check("a student cannot issue", (await issue(alice.token, { userId: alice.user._id })).status === 403);
    check("a tutor cannot issue", (await issue(tutor.token, { userId: alice.user._id })).status === 403);
    check("an invalid user id is 400", (await issue(admin.token, { userId: "nope" })).status === 400);
    check("a student outside the cohort is 404", (await issue(admin.token, { userId: outsider.user._id })).status === 404);
    const notYet = await issue(admin.token, { userId: bob.user._id });
    check("a learner who is not eligible is 422 NOT_ELIGIBLE with the states", notYet.status === 422 && notYet.data.code === "NOT_ELIGIBLE" && notYet.data.states?.certificateEligibility === false, notYet.data);
    check("a short override reason is 400", (await issue(admin.token, { userId: bob.user._id, overrideReason: "ok" })).data.code === "OVERRIDE_REASON_TOO_SHORT");
    check("nothing was issued by the refused attempts", (await LmsCertificate.countDocuments({ cohortId: cohort._id })) === 0);
    const reason = "Completed the work offline with the tutor; approved by the academic board.";
    const overridden = await issue(admin.token, { userId: bob.user._id, overrideReason: reason });
    check("an override with a written reason issues the certificate", overridden.status === 201 && overridden.data.certificate.issuedBasis === "override" && overridden.data.certificate.overrideReason === reason && /^GLX-\d{4}-[0-9A-F]{8}$/.test(overridden.data.certificate.certificateId), overridden.data);
    check("the certificate records who issued it", overridden.data.certificate.issuedBy === String(admin.user._id));
    check("the learner is notified", (await types(bob.user._id, "certificate_issued")) === 1);
    const dupe = await issue(admin.token, { userId: bob.user._id, overrideReason: reason });
    check("issuing twice is 409 ALREADY_ISSUED", dupe.status === 409 && dupe.data.code === "ALREADY_ISSUED", dupe.data);

    const certId = overridden.data.certificate._id;
    check("revoking without a reason is 400 REASON_REQUIRED", (await call("PUT", `/certificates/${certId}/revoke`, admin.token, {})).data.code === "REASON_REQUIRED");
    check("a student cannot revoke", (await call("PUT", `/certificates/${certId}/revoke`, bob.token, { reason: "x" })).status === 403);
    const revoked = await call("PUT", `/certificates/${certId}/revoke`, admin.token, { reason: "Issued in error" });
    check("an admin revokes with a reason", revoked.status === 200 && revoked.data.certificate.revokedReason === "Issued in error", revoked.data);
    check("the learner is told why", (await Notification.findOne({ recipient: bob.user._id, type: "certificate_revoked" }))?.message.includes("Issued in error"));
    check("revoking twice is 409 ALREADY_REVOKED", (await call("PUT", `/certificates/${certId}/revoke`, admin.token, { reason: "again" })).data.code === "ALREADY_REVOKED");
    check("a revoked certificate must be reissued: 409 REVOKED_USE_REISSUE", (await issue(admin.token, { userId: bob.user._id, overrideReason: reason })).data.code === "REVOKED_USE_REISSUE");
  } catch (error) {
    failures += 1;
    console.error("Unexpected error:", error);
  } finally {
    await LmsSubmission.deleteMany({ cohortId: { $in: created.cohorts } });
    await LmsAssignment.deleteMany({ cohortId: { $in: created.cohorts } });
    await LmsAttendance.deleteMany({ cohortId: { $in: created.cohorts } });
    await LmsLiveSession.deleteMany({ cohortId: { $in: created.cohorts } });
    await LmsLessonProgress.deleteMany({ cohortId: { $in: created.cohorts } });
    await LmsCertificate.deleteMany({ cohortId: { $in: created.cohorts } });
    await Notification.deleteMany({ recipient: { $in: created.users } });
    await Cohort.deleteMany({ _id: { $in: created.cohorts } });
    await Course.deleteMany({ _id: { $in: created.courses } });
    await User.deleteMany({ _id: { $in: created.users } });
    await new Promise((r) => server.close(r));
    await mongoose.disconnect();
  }
  console.log(failures === 0 ? `\n   UNIT 27 VERIFICATION COMPLETE: ${total}/${total} PASSED` : `\n   UNIT 27: ${failures} FAILED of ${total}`);
  process.exit(failures === 0 ? 0 : 1);
};
run();
