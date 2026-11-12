/**
 * Unit 21: Trimester administration and programme enrolment (spec 21).
 *
 *   node scripts/test-unit21-trimester.js   # starts its own server; needs MONGODB_URI and JWT_SECRET
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
import { LmsLiveSession } from "../src/models/LmsLiveSession.model.js";
import { generateToken } from "../src/utils/jwt.js";

const PORT = 3021;
const API = `http://localhost:${PORT}/api/lms`;
const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString();

let failures = 0;
let total = 0;
const check = (label, condition, detail) => {
  total += 1;
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.log(`  ✗ ${label}${detail !== undefined ? `  -> ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  }
};
const section = (title) => console.log(`\n${title}`);

const call = async (method, path, token, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined || method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

const created = { users: [], courses: [], trimesters: [], cohorts: [], sessions: [] };

const makeUser = async (role, label, extra = {}) => {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const user = await User.create({
    firstName: label,
    lastName: "Unit21",
    username: `u21_${label}_${stamp}`.toLowerCase(),
    email: `u21_${label}_${stamp}@test.com`.toLowerCase(),
    password: "Password123!",
    role,
    isEmailVerified: true,
    ...extra,
  });
  created.users.push(user._id);
  return { user, token: generateToken(user) };
};

const makeCourse = async (title, fields) => {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const course = await Course.create({
    title,
    slug: `u21-${stamp}`,
    category: { name: "Software Development", slug: "software-development" },
    instructor: tutor.user._id,
    description: `${title} description`,
    modules: [
      { title: "Week 1: Foundations", lessons: [{ title: "Intro", videoUrl: "https://example.com/v.mp4" }] },
      { title: "Week 2: Practice", lessons: [] },
    ],
    ...fields,
  });
  created.courses.push(course._id);
  return course;
};

let tutor;

const run = async () => {
  await connectDB();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(PORT, resolve));

  try {
    const admin = await makeUser("admin", "admin");
    tutor = await makeUser("instructor", "tutor", { approvalStatus: "approved" });
    const pendingTutor = await makeUser("instructor", "pendingtutor", { approvalStatus: "pending" });
    const alice = await makeUser("student", "alice");
    const bob = await makeUser("student", "bob");

    const freeCourse = await makeCourse("U21 Free Programme", { courseType: "trimester", status: "published", price: 0 });
    const paidCourse = await makeCourse("U21 Paid Programme", { courseType: "trimester", status: "published", price: 5000 });
    const draftCourse = await makeCourse("U21 Draft Programme", { courseType: "trimester", status: "draft" });
    const regularCourse = await makeCourse("U21 Regular Course", { courseType: "free", status: "published" });

    // ---------------------------------------------------------------------------------------------------------
    section("1. Access control on every admin route");
    const someId = new mongoose.Types.ObjectId().toString();
    const adminRoutes = [
      ["POST", "/admin/trimesters"],
      ["GET", "/admin/trimesters"],
      ["PUT", `/admin/trimesters/${someId}`],
      ["POST", "/admin/cohorts"],
      ["GET", "/admin/cohorts"],
      ["PUT", `/admin/cohorts/${someId}`],
      ["POST", `/admin/cohorts/${someId}/students`],
      ["DELETE", `/admin/cohorts/${someId}/students/${someId}`],
    ];
    for (const [method, path] of adminRoutes) {
      const [none, student, instructor] = await Promise.all([call(method, path, null, {}), call(method, path, alice.token, {}), call(method, path, tutor.token, {})]);
      check(`${method} ${path.replace(someId, ":id")} refuses signed-out, student and tutor`, none.status === 401 && student.status === 403 && instructor.status === 403, [none.status, student.status, instructor.status]);
    }

    // ---------------------------------------------------------------------------------------------------------
    section("2. Creating and validating a Trimester");
    const good = { number: 1, title: "Trimester 1 - Unit21", description: "Twelve weeks.", startDate: iso(10), endDate: iso(94), enrollmentClosesAt: iso(8), weeks: 12 };
    check("number outside 1 to 3 is rejected", (await call("POST", "/admin/trimesters", admin.token, { ...good, number: 4 })).status === 400);
    check("missing title is rejected", (await call("POST", "/admin/trimesters", admin.token, { ...good, title: "" })).status === 400);
    check("end before start is rejected", (await call("POST", "/admin/trimesters", admin.token, { ...good, endDate: iso(1) })).status === 400);
    check("enrolment closing after the end is rejected", (await call("POST", "/admin/trimesters", admin.token, { ...good, enrollmentClosesAt: iso(200) })).status === 400);
    check("opening after closing is rejected", (await call("POST", "/admin/trimesters", admin.token, { ...good, enrollmentOpensAt: iso(9) })).status === 400);
    check("weeks above 52 is rejected", (await call("POST", "/admin/trimesters", admin.token, { ...good, weeks: 60 })).status === 400);

    const createdTrimester = await call("POST", "/admin/trimesters", admin.token, good);
    const trimester = createdTrimester.data.trimester;
    if (trimester) created.trimesters.push(trimester._id);
    check("valid Trimester is created unpublished and upcoming", createdTrimester.status === 201 && trimester?.isPublished === false && trimester?.status === "upcoming", createdTrimester.data);
    if (!trimester) throw new Error("Cannot continue without a Trimester");

    section("3. Updating a Trimester");
    check("invalid id is 400", (await call("PUT", "/admin/trimesters/not-an-id", admin.token, {})).status === 400);
    check("unknown id is 404", (await call("PUT", `/admin/trimesters/${someId}`, admin.token, {})).status === 404);
    check("invalid status is 400", (await call("PUT", `/admin/trimesters/${trimester._id}`, admin.token, { status: "paused" })).status === 400);
    check("isPublished must be a boolean", (await call("PUT", `/admin/trimesters/${trimester._id}`, admin.token, { isPublished: "yes" })).status === 400);
    check("dates are re-checked on update", (await call("PUT", `/admin/trimesters/${trimester._id}`, admin.token, { endDate: iso(2) })).status === 400);
    const retitled = await call("PUT", `/admin/trimesters/${trimester._id}`, admin.token, { title: "Trimester 1 - Renamed" });
    check("title can be changed", retitled.status === 200 && retitled.data.trimester.title === "Trimester 1 - Renamed");

    // ---------------------------------------------------------------------------------------------------------
    section("4. Creating cohorts");
    const cohortBody = { trimesterId: trimester._id, courseId: freeCourse._id, name: "Cohort Free", capacity: 3, instructorIds: [tutor.user._id] };
    check("a regular (non-trimester) course is refused", (await call("POST", "/admin/cohorts", admin.token, { ...cohortBody, courseId: regularCourse._id })).status === 422);
    check("an unpublished course is refused", (await call("POST", "/admin/cohorts", admin.token, { ...cohortBody, courseId: draftCourse._id })).status === 422);
    check("an unapproved tutor is refused", (await call("POST", "/admin/cohorts", admin.token, { ...cohortBody, instructorIds: [pendingTutor.user._id] })).status === 422);
    check("a student as tutor is refused", (await call("POST", "/admin/cohorts", admin.token, { ...cohortBody, instructorIds: [alice.user._id] })).status === 422);
    check("unknown Trimester is 404", (await call("POST", "/admin/cohorts", admin.token, { ...cohortBody, trimesterId: someId })).status === 404);
    check("capacity 0 is 400", (await call("POST", "/admin/cohorts", admin.token, { ...cohortBody, capacity: 0 })).status === 400);
    check("bad id format is 400", (await call("POST", "/admin/cohorts", admin.token, { ...cohortBody, courseId: "nope" })).status === 400);

    const freeCohortRes = await call("POST", "/admin/cohorts", admin.token, cohortBody);
    const freeCohort = freeCohortRes.data.cohort;
    if (freeCohort) created.cohorts.push(freeCohort._id);
    check("valid cohort is created as enrolling with seats", freeCohortRes.status === 201 && freeCohort?.status === "enrolling" && freeCohort?.seatsLeft === 3 && freeCohort?.instructors?.length === 1, freeCohortRes.data);
    check("duplicate name in the same Trimester is 409", (await call("POST", "/admin/cohorts", admin.token, cohortBody)).status === 409);

    const paidRes = await call("POST", "/admin/cohorts", admin.token, { ...cohortBody, courseId: paidCourse._id, name: "Cohort Paid" });
    const paidCohort = paidRes.data.cohort;
    if (paidCohort) created.cohorts.push(paidCohort._id);
    check("a paid programme cohort is created", paidRes.status === 201, paidRes.data);
    if (!freeCohort || !paidCohort) throw new Error("Cannot continue without cohorts");

    // ---------------------------------------------------------------------------------------------------------
    section("5. Public routes hide anything unpublished");
    const hiddenList = await call("GET", "/public/trimesters", null);
    check("unpublished Trimester is not listed", hiddenList.status === 200 && !hiddenList.data.trimesters.some((t) => t._id === trimester._id), hiddenList.status);
    check("unpublished Trimester detail is 404", (await call("GET", `/public/trimesters/${trimester._id}`, null)).status === 404);
    check("enrolling in an unpublished Trimester's cohort is 404", (await call("POST", `/cohorts/${freeCohort._id}/enrol`, alice.token)).status === 404);

    check("publish works", (await call("PUT", `/admin/trimesters/${trimester._id}`, admin.token, { isPublished: true })).status === 200);

    section("6. Public Trimester list and detail (signed out)");
    const listRes = await call("GET", "/public/trimesters", null);
    const listed = listRes.data.trimesters?.find((t) => t._id === trimester._id);
    check("published Trimester is listed without signing in", listRes.status === 200 && Boolean(listed), listRes.status);
    check("it carries both programmes", listed?.programmes?.length === 2, listed?.programmes?.length);
    const listedFree = listed?.programmes?.find((p) => p._id === freeCohort._id);
    check("programme shape: title, price, currency, seats", listedFree?.title === "U21 Free Programme" && listedFree?.price === 0 && listedFree?.currency === "NGN" && listedFree?.seats === 3 && listedFree?.seatsLeft === 3, listedFree);
    check("tutor name is shown", listedFree?.instructors?.[0]?.name === "tutor Unit21", listedFree?.instructors);
    check("enrolment is open and not enrolled", listedFree?.enrolmentState === "open" && listedFree?.enrolled === false, listedFree);
    check("the list does not include weeks or sessions", listedFree?.weeks === undefined && listedFree?.sessions === undefined);

    const session = await LmsLiveSession.create({ cohortId: freeCohort._id, title: "Welcome class", instructorId: tutor.user._id, startsAt: new Date(Date.now() + 2 * DAY), endsAt: new Date(Date.now() + 2 * DAY + 3600000), roomName: `u21-room-${Date.now()}` });
    created.sessions.push(session._id);
    const detail = await call("GET", `/public/trimesters/${trimester._id}`, null);
    const detailFree = detail.data.trimester?.programmes?.find((p) => p._id === freeCohort._id);
    check("detail lists a week per course module", detail.status === 200 && detailFree?.weeks?.length === 2 && detailFree.weeks[0].title === "Week 1: Foundations" && detailFree.weeks[0].lessonCount === 1, detailFree?.weeks);
    check("detail lists upcoming live sessions", detailFree?.sessions?.length === 1 && detailFree.sessions[0].title === "Welcome class", detailFree?.sessions);
    check("invalid detail id is 400", (await call("GET", "/public/trimesters/nope", null)).status === 400);

    // ---------------------------------------------------------------------------------------------------------
    section("7. Self-enrolment rules");
    check("signed-out enrol is 401", (await call("POST", `/cohorts/${freeCohort._id}/enrol`, null)).status === 401);
    check("a tutor cannot enrol", (await call("POST", `/cohorts/${freeCohort._id}/enrol`, tutor.token)).status === 403);
    check("an admin cannot enrol", (await call("POST", `/cohorts/${freeCohort._id}/enrol`, admin.token)).status === 403);
    check("invalid cohort id is 400", (await call("POST", "/cohorts/nope/enrol", alice.token)).status === 400);
    check("unknown cohort is 404", (await call("POST", `/cohorts/${someId}/enrol`, alice.token)).status === 404);

    const paidAttempt = await call("POST", `/cohorts/${paidCohort._id}/enrol`, alice.token);
    check("a paid programme answers 409 PAYMENT_REQUIRED", paidAttempt.status === 409 && paidAttempt.data.code === "PAYMENT_REQUIRED", paidAttempt.data);
    check("and nobody was added", (await Cohort.findById(paidCohort._id)).studentIds.length === 0);

    const enrolled = await call("POST", `/cohorts/${freeCohort._id}/enrol`, alice.token);
    check("a student enrols in a free programme", enrolled.status === 201 && enrolled.data.cohortId === freeCohort._id, enrolled.data);
    const afterCohort = await Cohort.findById(freeCohort._id);
    check("the seat is taken", afterCohort.studentIds.some((id) => String(id) === String(alice.user._id)));
    check("a course enrolment exists", Boolean(await Enrollment.findOne({ user: alice.user._id, course: freeCourse._id })));
    check("the course enrolled count went up once", (await Course.findById(freeCourse._id)).enrolledCount === 1);

    const again = await call("POST", `/cohorts/${freeCohort._id}/enrol`, alice.token);
    check("enrolling twice is 409 ALREADY_ENROLLED", again.status === 409 && again.data.code === "ALREADY_ENROLLED", again.data);
    check("the count did not move", (await Course.findById(freeCourse._id)).enrolledCount === 1 && (await Cohort.findById(freeCohort._id)).studentIds.length === 1);

    const asAlice = await call("GET", "/public/trimesters", alice.token);
    const aliceView = asAlice.data.trimesters?.find((t) => t._id === trimester._id)?.programmes?.find((p) => p._id === freeCohort._id);
    check("the public list now shows enrolled: true for Alice only", aliceView?.enrolled === true && aliceView?.seatsLeft === 2, aliceView);
    const asBob = await call("GET", "/public/trimesters", bob.token);
    check("and enrolled: false for Bob", asBob.data.trimesters?.find((t) => t._id === trimester._id)?.programmes?.find((p) => p._id === freeCohort._id)?.enrolled === false);

    // ---------------------------------------------------------------------------------------------------------
    section("8. Enrolment window and cohort status");
    await Trimester.updateOne({ _id: trimester._id }, { enrollmentOpensAt: new Date(Date.now() + DAY) });
    const notOpen = await call("POST", `/cohorts/${freeCohort._id}/enrol`, bob.token);
    check("before the window opens: 409 ENROLMENT_NOT_OPEN", notOpen.status === 409 && notOpen.data.code === "ENROLMENT_NOT_OPEN", notOpen.data);
    const upcomingList = await call("GET", "/public/trimesters", null);
    check("and the public state is upcoming", upcomingList.data.trimesters.find((t) => t._id === trimester._id).programmes.find((p) => p._id === freeCohort._id).enrolmentState === "upcoming");

    await Trimester.updateOne({ _id: trimester._id }, { enrollmentOpensAt: null, enrollmentClosesAt: new Date(Date.now() - DAY) });
    const windowClosed = await call("POST", `/cohorts/${freeCohort._id}/enrol`, bob.token);
    check("after the window closes: 409 ENROLMENT_CLOSED", windowClosed.status === 409 && windowClosed.data.code === "ENROLMENT_CLOSED", windowClosed.data);

    await Trimester.updateOne({ _id: trimester._id }, { enrollmentClosesAt: new Date(Date.now() + DAY) });
    await Cohort.updateOne({ _id: freeCohort._id }, { status: "active" });
    const cohortActive = await call("POST", `/cohorts/${freeCohort._id}/enrol`, bob.token);
    check("a cohort that is no longer enrolling refuses: ENROLMENT_CLOSED", cohortActive.status === 409 && cohortActive.data.code === "ENROLMENT_CLOSED", cohortActive.data);
    await Cohort.updateOne({ _id: freeCohort._id }, { status: "enrolling" });

    // ---------------------------------------------------------------------------------------------------------
    section("9. The last seat goes to exactly one of many racers");
    const raceCohortRes = await call("POST", "/admin/cohorts", admin.token, { trimesterId: trimester._id, courseId: freeCourse._id, name: "Cohort Race", capacity: 1 });
    const raceCohort = raceCohortRes.data.cohort;
    if (raceCohort) created.cohorts.push(raceCohort._id);
    check("a one-seat cohort is created", raceCohortRes.status === 201, raceCohortRes.data);
    const racers = await Promise.all(Array.from({ length: 8 }, (_, i) => makeUser("student", `racer${i}`)));
    const results = await Promise.all(racers.map((racer) => call("POST", `/cohorts/${raceCohort._id}/enrol`, racer.token)));
    const winners = results.filter((r) => r.status === 201);
    const full = results.filter((r) => r.status === 409 && r.data.code === "COHORT_FULL");
    check("exactly one racer wins", winners.length === 1, results.map((r) => r.status));
    check("the other seven get 409 COHORT_FULL", full.length === 7, results.map((r) => r.status));
    check("the cohort holds exactly one student", (await Cohort.findById(raceCohort._id)).studentIds.length === 1);

    // ---------------------------------------------------------------------------------------------------------
    section("10. Admin roster management");
    const addBob = await call("POST", `/admin/cohorts/${freeCohort._id}/students`, admin.token, { email: bob.user.email });
    check("admin adds a student by email", addBob.status === 201 && addBob.data.studentCount === 2, addBob.data);
    check("the course enrolment exists too", Boolean(await Enrollment.findOne({ user: bob.user._id, course: freeCourse._id })));
    check("adding the same student again is 409", (await call("POST", `/admin/cohorts/${freeCohort._id}/students`, admin.token, { userId: bob.user._id })).status === 409);
    const carol = await makeUser("student", "carol");
    const dave = await makeUser("student", "dave");
    check("admin adds the third student (capacity 3)", (await call("POST", `/admin/cohorts/${freeCohort._id}/students`, admin.token, { userId: carol.user._id })).status === 201);
    const overflow = await call("POST", `/admin/cohorts/${freeCohort._id}/students`, admin.token, { userId: dave.user._id });
    check("a full cohort refuses even an admin: 409 COHORT_FULL", overflow.status === 409 && overflow.data.code === "COHORT_FULL", overflow.data);
    check("a tutor cannot be added as a student", (await call("POST", `/admin/cohorts/${freeCohort._id}/students`, admin.token, { userId: tutor.user._id })).status === 422);
    check("an unknown user is 404", (await call("POST", `/admin/cohorts/${freeCohort._id}/students`, admin.token, { userId: someId })).status === 404);
    check("missing userId and email is 400", (await call("POST", `/admin/cohorts/${freeCohort._id}/students`, admin.token, {})).status === 400);

    const adminPaid = await call("POST", `/admin/cohorts/${paidCohort._id}/students`, admin.token, { userId: dave.user._id });
    check("admin can sponsor a seat in a paid programme", adminPaid.status === 201, adminPaid.data);

    const removed = await call("DELETE", `/admin/cohorts/${freeCohort._id}/students/${carol.user._id}`, admin.token);
    check("admin removes a student", removed.status === 200 && removed.data.studentCount === 2, removed.data);
    check("removing again is 404", (await call("DELETE", `/admin/cohorts/${freeCohort._id}/students/${carol.user._id}`, admin.token)).status === 404);
    check("removing from an unknown cohort is 404", (await call("DELETE", `/admin/cohorts/${someId}/students/${carol.user._id}`, admin.token)).status === 404);

    section("11. Updating cohorts");
    const lower = await call("PUT", `/admin/cohorts/${freeCohort._id}`, admin.token, { capacity: 1 });
    check("capacity below the roster is 422", lower.status === 422, lower.data);
    const raise = await call("PUT", `/admin/cohorts/${freeCohort._id}`, admin.token, { capacity: 20, currentWeek: 2, name: "Cohort Free (renamed)" });
    check("capacity, week and name can change", raise.status === 200 && raise.data.cohort.capacity === 20 && raise.data.cohort.seatsLeft === 18 && raise.data.cohort.currentWeek === 2, raise.data);
    check("an unapproved tutor cannot be assigned", (await call("PUT", `/admin/cohorts/${freeCohort._id}`, admin.token, { instructorIds: [pendingTutor.user._id] })).status === 422);
    check("an invalid status is 400", (await call("PUT", `/admin/cohorts/${freeCohort._id}`, admin.token, { status: "paused" })).status === 400);
    check("status can move to active", (await call("PUT", `/admin/cohorts/${freeCohort._id}`, admin.token, { status: "active" })).data.cohort?.status === "active");

    section("12. Admin lists");
    const trimesters = await call("GET", "/admin/trimesters", admin.token);
    const mine = trimesters.data.trimesters?.find((t) => t._id === trimester._id);
    check("Trimester list shows cohort and student counts", trimesters.status === 200 && mine?.cohortCount === 3 && mine?.studentCount === 4, mine && { cohortCount: mine.cohortCount, studentCount: mine.studentCount });
    const cohorts = await call("GET", `/admin/cohorts?trimesterId=${trimester._id}`, admin.token);
    check("cohort list is filtered by Trimester and shows the course title", cohorts.status === 200 && cohorts.data.cohorts.length === 3 && cohorts.data.cohorts.every((c) => c.courseTitle), cohorts.data.cohorts?.length);
    check("an invalid trimesterId filter is 400", (await call("GET", "/admin/cohorts?trimesterId=nope", admin.token)).status === 400);
  } catch (error) {
    failures += 1;
    console.error("\nTest run stopped by an unexpected error:", error);
  } finally {
    console.log("\nCleaning up test records...");
    await Enrollment.deleteMany({ course: { $in: created.courses } });
    await LmsLiveSession.deleteMany({ _id: { $in: created.sessions } });
    await Cohort.deleteMany({ _id: { $in: created.cohorts } });
    await Trimester.deleteMany({ _id: { $in: created.trimesters } });
    await Course.deleteMany({ _id: { $in: created.courses } });
    await User.deleteMany({ _id: { $in: created.users } });
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }

  console.log("\n====================================================");
  console.log(failures === 0 ? `   UNIT 21 VERIFICATION COMPLETE: ${total}/${total} PASSED` : `   UNIT 21: ${failures} FAILED of ${total} checks`);
  console.log("====================================================");
  process.exit(failures === 0 ? 0 : 1);
};

run();
