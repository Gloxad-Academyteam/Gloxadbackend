/**
 * Unit 28: public landing page data for a Trimester course (spec 28).
 *   node scripts/test-unit28-programme-landing.js   # starts its own server
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
import { LmsLiveSession } from "../src/models/LmsLiveSession.model.js";
import { generateToken } from "../src/utils/jwt.js";

const PORT = 3028;
const API = `http://localhost:${PORT}/api/lms`;
const DAY = 24 * 60 * 60 * 1000;
let failures = 0, total = 0;
const check = (label, ok, detail) => {
  total += 1;
  if (ok) console.log(`  ✓ ${label}`);
  else { failures += 1; console.log(`  ✗ ${label}${detail !== undefined ? `  -> ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`); }
};
const call = async (path, token) => {
  const res = await fetch(`${API}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const created = { users: [], courses: [], cohorts: [], trimesters: [], sessions: [] };
const make = async (role, label, extra = {}) => {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const user = await User.create({ firstName: label, lastName: "Unit28", username: `u28_${label}_${stamp}`.toLowerCase(), email: `u28_${label}_${stamp}@test.com`.toLowerCase(), password: "Password123!", role, isEmailVerified: true, ...extra });
  created.users.push(user._id);
  return { user, token: generateToken(user) };
};

const run = async () => {
  await connectDB();
  const server = http.createServer(app);
  await new Promise((r) => server.listen(PORT, r));
  try {
    const tutor = await make("instructor", "tutor", { approvalStatus: "approved" });
    const alice = await make("student", "alice");
    const bob = await make("student", "bob");

    const course = await Course.create({
      title: "U28 Fullstack Programme", slug: `u28-fullstack-${Date.now()}`, category: { name: "Software Development", slug: "software-development" }, courseType: "trimester", status: "published", price: 0, instructor: tutor.user._id,
      description: "Build and ship real web apps.", thumbnail: "https://cdn.example.com/courses/thumbnails/fullstack.jpg", trailerVideoUrl: "https://www.youtube.com/watch?v=abc123", level: "beginner", language: "English",
      skills: ["Build responsive pages", "Create REST APIs"], targetAudience: ["Career changers", "Self-taught developers"], requirements: ["A laptop", "Curiosity"],
      modules: [{ title: "Week 1: Foundations", lessons: [{ title: "a" }, { title: "b" }] }, { title: "Week 2: Backend", lessons: [{ title: "c" }] }],
    });
    const bareCourse = await Course.create({ title: "U28 Bare Programme", slug: `u28-bare-${Date.now()}`, category: { name: "Software Development", slug: "software-development" }, courseType: "trimester", status: "published", price: 0, instructor: tutor.user._id, modules: [] });
    created.courses.push(course._id, bareCourse._id);
    const trimester = await Trimester.create({ number: 1, title: "U28 Trimester", description: "Twelve weeks.", startDate: new Date(Date.now() + 30 * DAY), endDate: new Date(Date.now() + 114 * DAY), enrollmentClosesAt: new Date(Date.now() + 20 * DAY), isPublished: true });
    const draftTrimester = await Trimester.create({ number: 2, title: "U28 Draft", startDate: new Date(Date.now() + 130 * DAY), endDate: new Date(Date.now() + 214 * DAY), enrollmentClosesAt: new Date(Date.now() + 120 * DAY), isPublished: false });
    created.trimesters.push(trimester._id, draftTrimester._id);
    const cohort = await Cohort.create({ name: "U28 Cohort", courseId: course._id, trimesterId: trimester._id, instructorIds: [tutor.user._id], studentIds: [alice.user._id], capacity: 10, status: "enrolling" });
    const bare = await Cohort.create({ name: "U28 Bare", courseId: bareCourse._id, trimesterId: trimester._id, instructorIds: [], studentIds: [], capacity: 5, status: "enrolling" });
    const hidden = await Cohort.create({ name: "U28 Hidden", courseId: course._id, trimesterId: draftTrimester._id, instructorIds: [], studentIds: [], status: "enrolling" });
    const finished = await Cohort.create({ name: "U28 Finished", courseId: course._id, trimesterId: trimester._id, instructorIds: [], studentIds: [], status: "completed" });
    created.cohorts.push(cohort._id, bare._id, hidden._id, finished._id);
    const session = await LmsLiveSession.create({ cohortId: cohort._id, title: "Welcome class", instructorId: tutor.user._id, startsAt: new Date(Date.now() + 2 * DAY), endsAt: new Date(Date.now() + 2 * DAY + 3600000), roomName: `u28-${Date.now()}` });
    created.sessions.push(session._id);

    console.log("\n1. The landing page of one programme (signed out)");
    const page = await call(`/public/programmes/${cohort._id}`, null);
    const prog = page.data.programme;
    check("a visitor gets the programme and its Trimester", page.status === 200 && page.data.trimester?.title === "U28 Trimester" && prog?.title === "U28 Fullstack Programme", page.data);
    check("the cover image comes from the course", prog?.thumbnail === "https://cdn.example.com/courses/thumbnails/fullstack.jpg");
    check("trailer, level, language and slug are included", prog?.trailerVideoUrl?.includes("youtube") && prog.level === "beginner" && prog.language === "English" && prog.slug.startsWith("u28-fullstack"), prog);
    check("what you will learn, who it is for and requirements", prog?.skills.length === 2 && prog.targetAudience[0] === "Career changers" && prog.requirements.includes("A laptop"));
    check("the week journey has one entry per module with lesson counts", prog?.weeks.length === 2 && prog.weeks[0].lessonCount === 2 && prog.weeks[1].title === "Week 2: Backend", prog?.weeks);
    check("upcoming live classes and the tutor are shown", prog?.sessions?.[0]?.title === "Welcome class" && prog.instructors[0].name === "tutor Unit28", prog?.instructors);
    check("seats and the registration state are computed", prog?.seats === 10 && prog.seatsLeft === 9 && prog.enrolmentState === "open" && prog.enrolled === false);
    check("the Trimester summary has dates and no programme list", page.data.trimester.programmes === undefined && Boolean(page.data.trimester.startDate) && Boolean(page.data.trimester.enrollmentClosesAt));
    check("no student data is exposed to visitors", !JSON.stringify(page.data).includes(String(alice.user._id)) && !JSON.stringify(page.data).includes("studentIds"));

    console.log("\n2. Viewer state");
    check("Alice (enrolled) sees enrolled: true", (await call(`/public/programmes/${cohort._id}`, alice.token)).data.programme.enrolled === true);
    check("Bob (not enrolled) sees enrolled: false", (await call(`/public/programmes/${cohort._id}`, bob.token)).data.programme.enrolled === false);
    check("a stale or invalid token is treated as a visitor, not an error", (await call(`/public/programmes/${cohort._id}`, "not-a-real-token")).status === 200);

    console.log("\n3. Missing content is null or empty, never invented");
    const bareRes = (await call(`/public/programmes/${bare._id}`, null)).data.programme;
    check("a course with no image, trailer or lists gives null and empty lists", bareRes.thumbnail === null && bareRes.trailerVideoUrl === null && bareRes.skills.length === 0 && bareRes.targetAudience.length === 0 && bareRes.weeks.length === 0 && bareRes.instructors.length === 0, bareRes);

    console.log("\n4. What stays hidden");
    check("a programme of an unpublished Trimester is 404", (await call(`/public/programmes/${hidden._id}`, null)).status === 404);
    check("a finished cohort is 404", (await call(`/public/programmes/${finished._id}`, null)).status === 404);
    check("an unknown id is 404", (await call(`/public/programmes/${new mongoose.Types.ObjectId()}`, null)).status === 404);
    check("an invalid id is 400", (await call("/public/programmes/nope", null)).status === 400);
    await Trimester.updateOne({ _id: trimester._id }, { archivedAt: new Date() });
    check("archiving the Trimester hides the programme", (await call(`/public/programmes/${cohort._id}`, null)).status === 404);
    await Trimester.updateOne({ _id: trimester._id }, { archivedAt: null });

    console.log("\n5. The Trimester list and detail carry the same content");
    const list = (await call("/public/trimesters", null)).data.trimesters.find((t) => t._id === String(trimester._id));
    const inList = list?.programmes.find((p) => p._id === String(cohort._id));
    check("the list has the image, level and skills", inList?.thumbnail === prog.thumbnail && inList.level === "beginner" && inList.skills.length === 2, inList);
    check("the list leaves weeks and sessions out", inList?.weeks === undefined && inList?.sessions === undefined);
    check("the detail has weeks and the image", (await call(`/public/trimesters/${trimester._id}`, null)).data.trimester.programmes.find((p) => p._id === String(cohort._id)).weeks.length === 2);
  } catch (error) {
    failures += 1;
    console.error("Unexpected error:", error);
  } finally {
    await LmsLiveSession.deleteMany({ _id: { $in: created.sessions } });
    await Cohort.deleteMany({ _id: { $in: created.cohorts } });
    await Trimester.deleteMany({ _id: { $in: created.trimesters } });
    await Course.deleteMany({ _id: { $in: created.courses } });
    await User.deleteMany({ _id: { $in: created.users } });
    await new Promise((r) => server.close(r));
    await mongoose.disconnect();
  }
  console.log(failures === 0 ? `\n   UNIT 28 VERIFICATION COMPLETE: ${total}/${total} PASSED` : `\n   UNIT 28: ${failures} FAILED of ${total}`);
  process.exit(failures === 0 ? 0 : 1);
};
run();
