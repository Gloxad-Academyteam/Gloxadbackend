import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../src/config/db.js";
import { Course } from "../src/models/Course.model.js";
import { User } from "../src/models/User.model.js";
import { Enrollment } from "../src/models/Enrollment.model.js";
import { Review } from "../src/models/Review.model.js";

async function cleanTestData() {
  console.log("\x1b[36m====================================================\x1b[0m");
  console.log("\x1b[36m   [DATABASE CLEANUP] Gloxad Academy Live Purge     \x1b[0m");
  console.log("\x1b[36m====================================================\x1b[0m\n");

  try {
    await connectDB();
    console.log("✓ MongoDB Connected\n");

    const auditLog = {
      timestamp: new Date().toISOString(),
      coursesRemoved: [],
      usersRemoved: [],
      enrollmentsRemoved: 0,
      reviewsRemoved: 0,
    };

    // 1. Identify test courses to delete
    const testCourseQuery = {
      $or: [
        { title: { $regex: /^Smoke/i } },
        { title: { $regex: /^Test/i } },
        { title: "Python Data Science Bootcamp" },
        { title: "Fullstack JavaScript Mastery" },
        { slug: "python-data-science-bootcamp" },
        { slug: "fullstack-javascript-mastery" },
      ],
    };

    const testCourses = await Course.find(testCourseQuery);
    console.log(`Found ${testCourses.length} test/placeholder course(s) to remove:`);
    for (const c of testCourses) {
      console.log(`  - [COURSE] ID: ${c._id} | Title: "${c.title}" | Slug: ${c.slug}`);
      auditLog.coursesRemoved.push({ _id: c._id, title: c.title, slug: c.slug });
    }

    const testCourseIds = testCourses.map((c) => c._id);

    // 2. Identify test instructor & test users
    const testUsers = await User.find({
      $or: [
        { email: "jane.tutor@gloxad.com" },
        { username: "janetutor" },
        { name: "Jane Tutor" },
        { firstName: "Jane", lastName: "Tutor" },
      ],
    });

    console.log(`\nFound ${testUsers.length} test user account(s) to remove:`);
    for (const u of testUsers) {
      console.log(`  - [USER] ID: ${u._id} | Name: "${u.name || u.firstName}" | Email: ${u.email}`);
      auditLog.usersRemoved.push({ _id: u._id, email: u.email, role: u.role });
    }

    const testUserIds = testUsers.map((u) => u._id);

    // 3. Remove enrollments and reviews pointing to test courses or test users
    if (testCourseIds.length > 0 || testUserIds.length > 0) {
      const enrollmentDeleteResult = await Enrollment.deleteMany({
        $or: [
          { course: { $in: testCourseIds } },
          { user: { $in: testUserIds } },
        ],
      });
      auditLog.enrollmentsRemoved = enrollmentDeleteResult.deletedCount;
      console.log(`\n✓ Purged ${enrollmentDeleteResult.deletedCount} related test enrollment(s)`);

      const reviewDeleteResult = await Review.deleteMany({
        $or: [
          { course: { $in: testCourseIds } },
          { student: { $in: testUserIds } },
        ],
      });
      auditLog.reviewsRemoved = reviewDeleteResult.deletedCount;
      console.log(`✓ Purged ${reviewDeleteResult.deletedCount} related test review(s)`);
    }

    // 4. Delete the courses
    if (testCourseIds.length > 0) {
      const courseDeleteResult = await Course.deleteMany({ _id: { $in: testCourseIds } });
      console.log(`✓ Successfully deleted ${courseDeleteResult.deletedCount} test course(s)`);
    }

    // 5. Delete the test users
    if (testUserIds.length > 0) {
      const userDeleteResult = await User.deleteMany({ _id: { $in: testUserIds } });
      console.log(`✓ Successfully deleted ${userDeleteResult.deletedCount} test user(s)`);
    }

    console.log("\n====================================================");
    console.log("   AUDIT SUMMARY OF PURGED DATA");
    console.log("====================================================");
    console.log(JSON.stringify(auditLog, null, 2));
    console.log("\n✓ Database cleanup completed successfully.");
  } catch (error) {
    console.error("❌ Cleanup failed:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

cleanTestData();
