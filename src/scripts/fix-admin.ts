import "dotenv/config";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { User } from "../v1/users/user.model.js";

async function fixAdmin() {
  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB_NAME });
  console.log("Connected to MongoDB.");

  const email = "louisdiaz43@gmail.com";
  const user = await User.findOne({ email });

  if (!user) {
    console.error(`User ${email} not found. Run the seed script first.`);
    process.exit(1);
  }

  console.log("Before:", {
    email: user.email,
    platformRoles: user.platformRoles,
    twoFaEnabled: user.twoFaEnabled,
  });

  await User.updateOne(
    { email },
    {
      $set: {
        platformRoles: ["platform_owner"],
        twoFaEnabled: false,
        "loginOtpHash": undefined,
        "loginOtpTokenHash": undefined,
        "loginOtpExpiresAt": undefined,
      },
      $unset: {
        loginOtpHash: "",
        loginOtpTokenHash: "",
        loginOtpExpiresAt: "",
      },
    }
  );

  const updated = await User.findOne({ email });
  console.log("After:", {
    email: updated?.email,
    platformRoles: updated?.platformRoles,
    twoFaEnabled: updated?.twoFaEnabled,
  });

  console.log("✓ Admin user fixed. You can now log in without OTP.");
  await mongoose.disconnect();
}

fixAdmin().catch((e) => { console.error(e); process.exit(1); });
