/**
 * Unit 26: enrolment lifecycle and Trimester publishing (spec 26).
 *   node scripts/test-unit26-enrolment-lifecycle.js   # starts its own server
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
import { Trimester } from "../src/models/Trimester.model.js";
import { Enrollment } from "../src/models/Enrollment.model.js";
import { CohortEnrolment } from "../src/models/CohortEnrolment.model.js";
import { Notification } from "../src/models/Notification.model.js";
import { generateToken } from "../src/utils/jwt.js";

const PORT = 3026;
const API = `http://localhost:${PORT}/api/lms`;
const DAY = 24 * 60 * 60 * 1000;
const iso = (d) => new Date(Date.now() + d * DAY).toISOString();
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
const created = { users: [], courses: [], trimesters: [], cohorts: [] };
const make = async (role, label, extra = {}) => {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const user = await User.create({ firstName: label, lastName: "Unit26", username: `u26_${label}_${stamp}`.toLowerCase(), email: `u26_${label}_${stamp}@test.com`.toLowerCase(), password: "Password123!", role, isEmailVerified: true, ...extra });
  created.users.push(user._id);
  return { user, token: generateToken(user) };
};

const run = async () => {
  await connectDB();
  const server = http.createServer(app);
  await new Promise((r) => server.listen(PORT, r));
  try {
    const admin = await make("admin", "admin");
    const tutor = await make("instructor", "tutor", { approvalStatus: "approved" });
    const alice = await make("student", "alice");
    const bob = await make("student", "bob");
    const carol = await make("student", "carol");
    const dave = await make("student", "dave");
    const erin = await make("student", "erin");

    const course = await Course.create({ title: "U26 Programme", slug: `u26-${Date.now()}`, category: { name: "Software Development", slug: "software-development" }, courseType: "trimester", status: "published", price: 0, instructor: tutor.user._id, modules: [{ title: "Week 1", lessons: [] }] });
    created.courses.push(course._id);

    section("1. Publish readiness checklist and preview");
    const made = await call("POST", "/admin/trimesters", admin.token, { number: 2, title: "U26 Trimester", startDate: iso(30), endDate: iso(114), enrollmentClosesAt: iso(20) });
    const trimester = made.data.trimester;
    created.trimesters.push(trimester._id);
    const earlyPublish = await call("PUT", `/admin/trimesters/${trimester._id}`, admin.token, { isPublished: true });
    check("an empty draft cannot be published: 422 NOT_READY_TO_PUBLISH", earlyPublish.status === 422 && earlyPublish.data.code === "NOT_READY_TO_PUBLISH" && earlyPublish.data.missing.includes("a description") && earlyPublish.data.missing.includes("at least one programme (cohort)"), earlyPublish.data);
    check("and it stayed a draft", (await Trimester.findById(trimester._id)).isPublished === false);

    const cohortRes = await call("POST", "/admin/cohorts", admin.token, { trimesterId: trimester._id, courseId: course._id, name: "U26 Cohort", capacity: 3, instructorIds: [tutor.user._id] });
    const cohort = cohortRes.data.cohort;
    created.cohorts.push(cohort._id);
    await Cohort.updateOne({ _id: cohort._id }, { instructorIds: [] });
    const noTutor = await call("PUT", `/admin/trimesters/${trimester._id}`, admin.token, { description: "Twelve weeks.", isPublished: true });
    check("a cohort without a tutor blocks publishing and names it", noTutor.status === 422 && noTutor.data.missing.some((m) => m.includes("a tutor for \"U26 Cohort\"")), noTutor.data);
    await Cohort.updateOne({ _id: cohort._id }, { instructorIds: [tutor.user._id] });
    check("a refused publish saves nothing (the description is still empty)", (await Trimester.findById(trimester._id)).description === "");
    check("the description is saved on its own", (await call("PUT", `/admin/trimesters/${trimester._id}`, admin.token, { description: "Twelve weeks." })).status === 200);

    const preview = await call("GET", `/admin/trimesters/${trimester._id}/preview`, admin.token);
    check("admin previews the draft with its readiness", preview.status === 200 && preview.data.trimester.isPublished === false && preview.data.readiness.ready === true && preview.data.trimester.programmes[0].weeks.length === 1, preview.data);
    check("a student cannot preview", (await call("GET", `/admin/trimesters/${trimester._id}/preview`, alice.token)).status === 403);
    check("an unknown preview is 404", (await call("GET", `/admin/trimesters/${new mongoose.Types.ObjectId()}/preview`, admin.token)).status === 404);
    check("the draft is still hidden from the public", (await call("GET", `/public/trimesters/${trimester._id}`, null)).status === 404);
    check("now it publishes", (await call("PUT", `/admin/trimesters/${trimester._id}`, admin.token, { isPublished: true })).status === 200);

    section("2. Archiving hides without deleting");
    check("archived must be a boolean", (await call("PUT", `/admin/trimesters/${trimester._id}`, admin.token, { archived: "yes" })).status === 400);
    check("a student cannot enrol before archiving? (control: enrolment works)", (await call("POST", `/cohorts/${cohort._id}/enrol`, erin.token)).status === 201);
    check("admin archives the Trimester", (await call("PUT", `/admin/trimesters/${trimester._id}`, admin.token, { archived: true })).data.trimester?.archivedAt != null);
    check("it leaves the public list", !(await call("GET", "/public/trimesters", null)).data.trimesters.some((t) => t._id === trimester._id));
    check("its detail is 404", (await call("GET", `/public/trimesters/${trimester._id}`, null)).status === 404);
    check("new learners cannot enrol", (await call("POST", `/cohorts/${cohort._id}/enrol`, dave.token)).status === 404);
    check("nothing was deleted", Boolean(await Cohort.findById(cohort._id)) && (await Trimester.findById(trimester._id)).archivedAt != null);
    check("admin can still preview an archived Trimester", (await call("GET", `/admin/trimesters/${trimester._id}/preview`, admin.token)).data.trimester?.archivedAt != null);
    await call("PUT", `/admin/trimesters/${trimester._id}`, admin.token, { archived: false });
    check("unarchiving brings it back", (await call("GET", `/public/trimesters/${trimester._id}`, null)).status === 200);
    // reset Erin's control enrolment so counts below are exact
    await Cohort.updateOne({ _id: cohort._id }, { $pull: { studentIds: erin.user._id } });
    await CohortEnrolment.deleteMany({ userId: erin.user._id });

    section("3. Enrolment records, confirmation and admin list");
    check("Alice enrols herself", (await call("POST", `/cohorts/${cohort._id}/enrol`, alice.token)).status === 201);
    const aliceRecord = await CohortEnrolment.findOne({ cohortId: cohort._id, userId: alice.user._id });
    check("an active record with history exists", aliceRecord?.status === "active" && aliceRecord.history[0].note === "Enrolled", aliceRecord);
    check("she got an enrolment confirmation", (await Notification.countDocuments({ recipient: alice.user._id, type: "enrolment_confirmed" })) === 1);
    check("admin adds Bob", (await call("POST", `/admin/cohorts/${cohort._id}/students`, admin.token, { userId: bob.user._id })).status === 201);
    check("Bob's record says added by an administrator", (await CohortEnrolment.findOne({ cohortId: cohort._id, userId: bob.user._id })).history[0].note === "Added by an administrator");
    // Carol joins the old way (no record), like members from before this unit
    await Cohort.updateOne({ _id: cohort._id }, { $addToSet: { studentIds: carol.user._id } });
    const list = await call("GET", `/admin/cohorts/${cohort._id}/enrolments`, admin.token);
    check("the admin list counts all three as active, including the one with no record", list.status === 200 && list.data.counts.active === 3 && list.data.enrolments.some((e) => e.email === carol.user.email && e.status === "active"), list.data.counts);
    check("a student cannot read the list", (await call("GET", `/admin/cohorts/${cohort._id}/enrolments`, alice.token)).status === 403);

    section("4. A student withdraws");
    check("a tutor cannot withdraw", (await call("PUT", `/cohorts/${cohort._id}/withdraw`, tutor.token, {})).status === 403);
    check("someone who is not enrolled gets 404", (await call("PUT", `/cohorts/${cohort._id}/withdraw`, dave.token, {})).status === 404);
    const withdrew = await call("PUT", `/cohorts/${cohort._id}/withdraw`, alice.token, { reason: "Moving abroad" });
    check("Alice withdraws", withdrew.status === 200 && withdrew.data.enrolment.status === "withdrawn", withdrew.data);
    check("her seat is free and she is off the access list", (await Cohort.findById(cohort._id)).studentIds.length === 2 && !(await Cohort.findById(cohort._id)).studentIds.some((i) => String(i) === String(alice.user._id)));
    check("her record and progress stay, with the reason", (await CohortEnrolment.findOne({ cohortId: cohort._id, userId: alice.user._id })).history.at(-1).note === "Moving abroad" && Boolean(await Enrollment.findOne({ user: alice.user._id, course: course._id })));
    check("she loses access to the cohort's content", (await call("GET", `/cohorts/${cohort._id}/curriculum`, alice.token)).status === 403);
    check("withdrawing twice is 409", (await call("PUT", `/cohorts/${cohort._id}/withdraw`, alice.token, {})).status === 409);
    const reEnrol = await call("POST", `/cohorts/${cohort._id}/enrol`, alice.token);
    check("while the window is open she can re-enrol", reEnrol.status === 201, reEnrol.data);
    check("history now shows enrolled, withdrawn, re-enrolled", (await CohortEnrolment.findOne({ cohortId: cohort._id, userId: alice.user._id })).history.map((h) => h.status).join(",") === "active,withdrawn,active");
    await Cohort.updateOne({ _id: cohort._id }, { status: "completed" });
    check("a finished programme cannot be withdrawn from", (await call("PUT", `/cohorts/${cohort._id}/withdraw`, bob.token, {})).data.code === "COHORT_FINISHED");
    await Cohort.updateOne({ _id: cohort._id }, { status: "enrolling" });

    section("5. Admin moves: suspend, reinstate, complete");
    const move = (uid, body, token = admin.token) => call("PUT", `/admin/cohorts/${cohort._id}/enrolments/${uid}/status`, token, body);
    check("a student cannot move enrolments", (await move(bob.user._id, { status: "suspended", reason: "x" }, alice.token)).status === 403);
    check("an invalid status is 400", (await move(bob.user._id, { status: "maybe" })).status === 400);
    check("suspending without a reason is 400 REASON_REQUIRED", (await move(bob.user._id, { status: "suspended" })).data.code === "REASON_REQUIRED");
    check("an unknown student is 404", (await move(dave.user._id, { status: "suspended", reason: "x" })).status === 404);
    const suspended = await move(bob.user._id, { status: "suspended", reason: "Payment dispute" });
    check("Bob is suspended", suspended.status === 200 && suspended.data.enrolment.status === "suspended", suspended.data);
    check("he is off the access list and lost access", !(await Cohort.findById(cohort._id)).studentIds.some((i) => String(i) === String(bob.user._id)) && (await call("GET", `/cohorts/${cohort._id}/curriculum`, bob.token)).status === 403);
    check("he was told, with the reason", (await Notification.findOne({ recipient: bob.user._id, type: "enrolment_update" }))?.message.includes("Payment dispute"));
    const sneak = await call("POST", `/cohorts/${cohort._id}/enrol`, bob.token);
    check("a suspended student cannot re-enrol himself: 409 ENROLMENT_SUSPENDED", sneak.status === 409 && sneak.data.code === "ENROLMENT_SUSPENDED", sneak.data);
    check("and cannot withdraw (409)", (await call("PUT", `/cohorts/${cohort._id}/withdraw`, bob.token, {})).status === 409);

    await Cohort.updateOne({ _id: cohort._id }, { $addToSet: { studentIds: dave.user._id }, capacity: 3 });
    check("the cohort is full again (Alice, Carol, Dave)", (await Cohort.findById(cohort._id)).studentIds.length === 3);
    const noSeat = await move(bob.user._id, { status: "active" });
    check("reinstating into a full cohort is 409 COHORT_FULL", noSeat.status === 409 && noSeat.data.code === "COHORT_FULL", noSeat.data);
    check("and he stays suspended", (await CohortEnrolment.findOne({ cohortId: cohort._id, userId: bob.user._id })).status === "suspended");
    await Cohort.updateOne({ _id: cohort._id }, { capacity: 4 });
    const reinstated = await move(bob.user._id, { status: "active" });
    check("with a free seat he is reinstated", reinstated.status === 200 && (await Cohort.findById(cohort._id)).studentIds.some((i) => String(i) === String(bob.user._id)), reinstated.data);

    const completed = await move(carol.user._id, { status: "completed" });
    check("a member with no record can be marked completed (record is created)", completed.status === 200 && completed.data.enrolment.status === "completed" && completed.data.enrolment.history.length === 2, completed.data);
    check("a completed student keeps access", (await Cohort.findById(cohort._id)).studentIds.some((i) => String(i) === String(carol.user._id)));
    const afterDone = await move(carol.user._id, { status: "active" });
    check("completed is final: 409 INVALID_TRANSITION", afterDone.status === 409 && afterDone.data.code === "INVALID_TRANSITION" && afterDone.data.allowed.length === 0, afterDone.data);
    check("a completed student cannot withdraw", (await call("PUT", `/cohorts/${cohort._id}/withdraw`, carol.token, {})).status === 409);
    const adminWithdraw = await move(dave.user._id, { status: "withdrawn", reason: "Requested by email" });
    check("admin withdraws Dave with a reason", adminWithdraw.status === 200, adminWithdraw.data);
    check("a withdrawn enrolment cannot be reinstated by an admin move", (await move(dave.user._id, { status: "active" })).status === 409);

    section("6. Two admins at once");
    const both = await Promise.all([move(alice.user._id, { status: "suspended", reason: "first" }), move(alice.user._id, { status: "suspended", reason: "second" })]);
    check("exactly one of two identical simultaneous moves succeeds", both.filter((r) => r.status === 200).length === 1 && both.filter((r) => r.status === 409).length === 1, both.map((r) => r.status));
    check("and the history holds the suspension once", (await CohortEnrolment.findOne({ cohortId: cohort._id, userId: alice.user._id })).history.filter((h) => h.status === "suspended").length === 1);

    section("7. The student's own view");
    const mine = await call("GET", "/enrolments/me", bob.token);
    const mineEntry = mine.data.enrolments?.find((e) => e.cohortId === cohort._id);
    check("Bob sees his enrolment with names, status and history", mine.status === 200 && mineEntry?.status === "active" && mineEntry.cohortName === "U26 Cohort" && mineEntry.programmeTitle === "U26 Programme" && mineEntry.trimester?.title === "U26 Trimester" && mineEntry.history.length >= 3, mineEntry);
    check("Carol (no original record) sees completed", (await call("GET", "/enrolments/me", carol.token)).data.enrolments.find((e) => e.cohortId === cohort._id)?.status === "completed");
    check("signed-out is 401", (await call("GET", "/enrolments/me", null)).status === 401);

    section("8. Admin removal is recorded");
    const removed = await call("DELETE", `/admin/cohorts/${cohort._id}/students/${bob.user._id}`, admin.token);
    check("admin removes Bob", removed.status === 200);
    const bobRecord = await CohortEnrolment.findOne({ cohortId: cohort._id, userId: bob.user._id });
    check("it is recorded as withdrawn by an administrator", bobRecord.status === "withdrawn" && bobRecord.history.at(-1).note === "Removed by an administrator", bobRecord.history.at(-1));
  } catch (error) {
    failures += 1;
    console.error("Unexpected error:", error);
  } finally {
    await CohortEnrolment.deleteMany({ cohortId: { $in: created.cohorts } });
    await Enrollment.deleteMany({ course: { $in: created.courses } });
    await Notification.deleteMany({ recipient: { $in: created.users } });
    await Cohort.deleteMany({ _id: { $in: created.cohorts } });
    await Trimester.deleteMany({ _id: { $in: created.trimesters } });
    await Course.deleteMany({ _id: { $in: created.courses } });
    await User.deleteMany({ _id: { $in: created.users } });
    await new Promise((r) => server.close(r));
    await mongoose.disconnect();
  }
  console.log(failures === 0 ? `\n   UNIT 26 VERIFICATION COMPLETE: ${total}/${total} PASSED` : `\n   UNIT 26: ${failures} FAILED of ${total}`);
  process.exit(failures === 0 ? 0 : 1);
};
run();
