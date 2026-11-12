/**
 * Unit 29: coding labs, access and authoring (spec 29).
 *   node scripts/test-unit29-labs.js   # starts its own server
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
import { LmsLab, LmsLabSubmission } from "../src/models/LmsLab.model.js";
import { generateToken } from "../src/utils/jwt.js";

const PORT = 3029;
const API = `http://localhost:${PORT}/api/lms`;
let failures = 0, total = 0;
const check = (label, ok, detail) => {
  total += 1;
  if (ok) console.log(`  ✓ ${label}`);
  else { failures += 1; console.log(`  ✗ ${label}${detail !== undefined ? `  -> ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`); }
};
const call = async (method, path, token, body) => {
  const res = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined || method === "GET" ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const created = { users: [], courses: [], cohorts: [] };
const make = async (role, label, extra = {}) => {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const user = await User.create({ firstName: label, lastName: "Unit29", username: `u29_${label}_${stamp}`.toLowerCase(), email: `u29_${label}_${stamp}@test.com`.toLowerCase(), password: "Password123!", role, isEmailVerified: true, ...extra });
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
    const otherTutor = await make("instructor", "othertutor", { approvalStatus: "approved" });
    const alice = await make("student", "alice");
    const outsider = await make("student", "outsider");
    const course = await Course.create({ title: "U29 Course", slug: `u29-${Date.now()}`, category: { name: "Software Development", slug: "software-development" }, courseType: "trimester", status: "published", instructor: tutor.user._id, modules: [] });
    created.courses.push(course._id);
    const cohort = await Cohort.create({ name: `U29 Cohort ${Date.now()}`, courseId: course._id, trimesterId: new mongoose.Types.ObjectId(), instructorIds: [tutor.user._id], studentIds: [alice.user._id], status: "active" });
    created.cohorts.push(cohort._id);

    console.log("\n1. Authoring a lab");
    const body = { title: "Sum of two numbers", description: "Add two numbers.", instructions: "Read two numbers and print their sum.", language: "javascript", starterCode: "// read input, print the sum\n", dueAt: new Date(Date.now() + 86400000).toISOString(), testCases: [{ name: "2 + 3", input: "2 3", expectedOutput: "5" }, { name: "negative", input: "-1 1", expectedOutput: "0" }, { name: "secret", input: "10 20", expectedOutput: "30", hidden: true }] };
    check("a student cannot create a lab", (await call("POST", `/cohorts/${cohort._id}/labs`, alice.token, body)).status === 403);
    check("a tutor of another cohort cannot", (await call("POST", `/cohorts/${cohort._id}/labs`, otherTutor.token, body)).status === 403);
    check("signed-out is 401", (await call("POST", `/cohorts/${cohort._id}/labs`, null, body)).status === 401);
    check("a missing title is 400", (await call("POST", `/cohorts/${cohort._id}/labs`, tutor.token, { ...body, title: " " })).status === 400);
    check("an unknown language is 400", (await call("POST", `/cohorts/${cohort._id}/labs`, tutor.token, { ...body, language: "cobol" })).status === 400);
    check("a test without an expected output is 400", (await call("POST", `/cohorts/${cohort._id}/labs`, tutor.token, { ...body, testCases: [{ name: "x" }] })).status === 400);
    check("an invalid cohort id is 400", (await call("POST", "/cohorts/nope/labs", tutor.token, body)).status === 400);
    const made = await call("POST", `/cohorts/${cohort._id}/labs`, tutor.token, body);
    const labId = made.data.lab?._id;
    check("the cohort's tutor creates a lab", made.status === 201 && made.data.lab.testCount === 3, made.data);
    check("an admin can also create one", (await call("POST", `/cohorts/${cohort._id}/labs`, admin.token, { ...body, title: "Admin lab" })).status === 201);
    check("a tutor updates it", (await call("PUT", `/labs/${labId}`, tutor.token, { title: "Sum of two numbers (v2)" })).status === 200);
    check("another tutor cannot update it", (await call("PUT", `/labs/${labId}`, otherTutor.token, { title: "Hijack" })).status === 403);

    console.log("\n2. Students use the lab");
    const list = await call("GET", `/cohorts/${cohort._id}/labs`, alice.token);
    check("a student lists the cohort's labs", list.status === 200 && list.data.labs.length === 2 && list.data.labs.find((l) => l._id === labId).totalTests === 3, list.data);
    const detail = await call("GET", `/labs/${labId}`, alice.token);
    check("the lab detail has instructions, starter code and the draft", detail.status === 200 && detail.data.instructions.includes("sum") && detail.data.draftCode.startsWith("// read input") && detail.data.status === "not_started", detail.data);
    check("hidden test answers are never sent", detail.data.testCases[2].expectedOutput === "[HIDDEN]" && !JSON.stringify(detail.data).includes('"30"') && detail.data.solutionCode === undefined);
    check("autosave stores a draft", (await call("PUT", `/labs/${labId}/autosave`, alice.token, { code: "console.log(5)" })).data.saved === true);
    check("the draft comes back", (await call("GET", `/labs/${labId}/draft`, alice.token)).data.draftCode === "console.log(5)");
    check("the detail now returns the draft instead of the starter", (await call("GET", `/labs/${labId}`, alice.token)).data.draftCode === "console.log(5)");
    check("code over 100000 characters is refused", (await call("PUT", `/labs/${labId}/autosave`, alice.token, { code: "x".repeat(100001) })).status === 400);
    check("non-text code is 400", (await call("PUT", `/labs/${labId}/autosave`, alice.token, { code: 5 })).status === 400);
    const submitted = await call("POST", `/labs/${labId}/submit`, alice.token, { code: "console.log(5)", passedTests: 2, totalTests: 2 });
    check("a student submits, stored as unverified", submitted.status === 200 && submitted.data.submission.unverified === true && submitted.data.submission.passedTests === 2, submitted.data);
    check("the list shows the submission", (await call("GET", `/cohorts/${cohort._id}/labs`, alice.token)).data.labs.find((l) => l._id === labId).status === "submitted");

    console.log("\n3. Outsiders are kept out");
    check("an outsider cannot list the cohort's labs", (await call("GET", `/cohorts/${cohort._id}/labs`, outsider.token)).status === 403);
    check("an outsider cannot read the lab", (await call("GET", `/labs/${labId}`, outsider.token)).status === 403);
    check("an outsider cannot autosave to it", (await call("PUT", `/labs/${labId}/autosave`, outsider.token, { code: "x" })).status === 403);
    check("an outsider cannot read the draft", (await call("GET", `/labs/${labId}/draft`, outsider.token)).status === 403);
    check("an outsider cannot submit", (await call("POST", `/labs/${labId}/submit`, outsider.token, { code: "x", passedTests: 1, totalTests: 1 })).status === 403);
    check("nothing was stored for the outsider", (await LmsLabSubmission.countDocuments({ userId: outsider.user._id })) === 0);
    check("an invalid lab id is 400 and an unknown one is 404", (await call("GET", "/labs/nope", alice.token)).status === 400 && (await call("GET", `/labs/${new mongoose.Types.ObjectId()}`, alice.token)).status === 404);
  } catch (error) {
    failures += 1;
    console.error("Unexpected error:", error);
  } finally {
    await LmsLabSubmission.deleteMany({ cohortId: { $in: created.cohorts } });
    await LmsLab.deleteMany({ cohortId: { $in: created.cohorts } });
    await Cohort.deleteMany({ _id: { $in: created.cohorts } });
    await Course.deleteMany({ _id: { $in: created.courses } });
    await User.deleteMany({ _id: { $in: created.users } });
    await new Promise((r) => server.close(r));
    await mongoose.disconnect();
  }
  console.log(failures === 0 ? `\n   UNIT 29 VERIFICATION COMPLETE: ${total}/${total} PASSED` : `\n   UNIT 29: ${failures} FAILED of ${total}`);
  process.exit(failures === 0 ? 0 : 1);
};
run();
