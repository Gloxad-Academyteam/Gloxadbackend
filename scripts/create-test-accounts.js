// Adds the admin, a tutor and two students for testing, WITHOUT deleting anything.
// Unlike `npm run seed` this never wipes a collection. Accounts that already exist are left untouched.
//
// Run it against the database you want, passing that connection string yourself:
//   MONGODB_URI="<your connection string>" node scripts/create-test-accounts.js
// Optional: TEST_ACCOUNT_PASSWORD="something-else" (default Password123!)
//
// Delete these accounts when you finish testing.
import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import connectDB from "../src/config/db.js";
import { User } from "../src/models/User.model.js";

const password = process.env.TEST_ACCOUNT_PASSWORD || "Password123!";

const accounts = [
  { firstName: "System", lastName: "Admin", username: "admin", email: "admin@gloxad.com", role: "admin" },
  { firstName: "Jane", lastName: "Tutor", username: "jane.tutor", email: "jane.tutor@gloxad.com", role: "instructor" },
  { firstName: "Alice", lastName: "Student", username: "alice.student", email: "alice.student@gloxad.com", role: "student" },
  { firstName: "Bob", lastName: "Student", username: "bob.student", email: "bob.student@gloxad.com", role: "student" },
];

const run = async () => {
  const connection = await connectDB();
  console.log(`Target database host: ${connection.connection.host}`);
  const hashed = await bcrypt.hash(password, 10);

  for (const account of accounts) {
    const existing = await User.findOne({ email: account.email }).select("_id role");
    if (existing) {
      console.log(`skipped  ${account.email} (already exists as ${existing.role})`);
      continue;
    }
    await User.create({
      ...account,
      name: `${account.firstName} ${account.lastName}`,
      password: hashed,
      approvalStatus: "approved",
      isVerified: true,
      isActive: true,
    });
    console.log(`created  ${account.email} (${account.role})`);
  }

  await mongoose.disconnect();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
