import { model, Schema } from "mongoose";
import { roles } from "../../shared/constants/roles.js";

const membershipSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", index: true },
    roles: [{ type: String, enum: roles }],
    active: { type: Boolean, default: true },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    phone: String,
    passwordHash: { type: String, required: true },
    platformRoles: [{ type: String, enum: roles }],
    memberships: [membershipSchema],
    refreshTokenHash: String,
    twoFaEnabled: { type: Boolean, default: true },
    loginOtpHash: String,
    loginOtpTokenHash: String,
    loginOtpExpiresAt: Date,
    passwordResetTokenHash: String,
    passwordResetExpiresAt: Date,
    disabledAt: Date,
  },
  { timestamps: true }
);

export const User = model("User", userSchema);
