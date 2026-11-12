import mongoose, { Schema } from "mongoose";
import bcrypt from "bcryptjs";

const socialLinksSchema = new Schema(
  {
    website: { type: String, default: "" },
    facebook: { type: String, default: "" },
    instagram: { type: String, default: "" },
    linkedin: { type: String, default: "" },
    twitter: { type: String, default: "" },
    whatsapp: { type: String, default: "" },
    youtube: { type: String, default: "" },
    github: { type: String, default: "" },
  },
  { _id: false }
);

const notificationPreferencesSchema = new Schema(
  {
    coursePurchases: { type: Boolean, default: true },
    courseReviews: { type: Boolean, default: true },
    lectureComments: { type: Boolean, default: true },
    lectureNotesDownloads: { type: Boolean, default: true },
    commentReplies: { type: Boolean, default: true },
    dailyProfileVisits: { type: Boolean, default: false },
    lectureFileDownloads: { type: Boolean, default: true },
    // Also email me each in-app notification. Off until the person turns it on.
    emailAlerts: { type: Boolean, default: false },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
      default: "",
    },
    name: {
      type: String,
      trim: true,
    },
    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
    },
    role: {
      type: String,
      enum: ["student", "instructor", "admin", "institution_admin"],
      default: "student",
    },
    institutionId: {
      type: Schema.Types.ObjectId,
      ref: "Institution",
      default: null,
      index: true,
    },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeactivated: {
      type: Boolean,
      default: false,
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    avatarUrl: {
      type: String,
      default: "",
    },
    avatar: {
      type: String,
      default: "",
    },
    biography: {
      type: String,
      default: "",
      trim: true,
    },
    bio: {
      type: String,
      default: "",
      trim: true,
    },
    title: {
      type: String,
      default: "",
      trim: true,
    },
    phoneNumber: {
      type: String,
      default: "",
      trim: true,
    },
    areaOfExpertise: {
      type: String,
      default: "",
      trim: true,
    },
    experienceYears: {
      type: Number,
      default: 0,
    },
    experienceProofs: {
      type: [String],
      default: [],
    },
    expertiseBio: {
      type: String,
      default: "",
      trim: true,
    },
    certificationsUrl: {
      type: String,
      default: "",
      trim: true,
    },
    university: {
      type: String,
      default: "",
      trim: true,
    },
    level: {
      type: String,
      default: "",
      trim: true,
    },
    skills: {
      type: [String],
      default: [],
    },
    certifications: {
      type: [String],
      default: [],
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
    socialLinks: {
      type: socialLinksSchema,
      default: () => ({}),
    },
    socials: {
      type: socialLinksSchema,
      default: () => ({}),
    },
    notificationPreferences: {
      type: notificationPreferencesSchema,
      default: () => ({}),
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.password;
        delete ret.__v;
        delete ret.id;

        const isVer = ret.isVerified !== undefined ? Boolean(ret.isVerified) : Boolean(ret.isEmailVerified);
        ret.isVerified = isVer;
        ret.isEmailVerified = isVer;

        const bioText = ret.biography || ret.bio || ret.expertiseBio || "";
        ret.biography = bioText;
        ret.bio = bioText;
        ret.expertiseBio = bioText;

        const socialsObj = ret.socialLinks || ret.socials || {};
        ret.socialLinks = socialsObj;
        ret.socials = socialsObj;

        const avatarImg = ret.avatarUrl || ret.avatar || "";
        ret.avatarUrl = avatarImg;
        ret.avatar = avatarImg;

        if (!ret.experienceProofs) ret.experienceProofs = [];
        if (!ret.certifications) ret.certifications = [];
        if (!ret.skills) ret.skills = [];
        if (ret.experienceYears === undefined) ret.experienceYears = 0;
        if (!ret.certificationsUrl) ret.certificationsUrl = "";
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.password;
        delete ret.__v;
        delete ret.id;

        const isVer = ret.isVerified !== undefined ? Boolean(ret.isVerified) : Boolean(ret.isEmailVerified);
        ret.isVerified = isVer;
        ret.isEmailVerified = isVer;

        const bioText = ret.biography || ret.bio || ret.expertiseBio || "";
        ret.biography = bioText;
        ret.bio = bioText;
        ret.expertiseBio = bioText;

        const socialsObj = ret.socialLinks || ret.socials || {};
        ret.socialLinks = socialsObj;
        ret.socials = socialsObj;

        const avatarImg = ret.avatarUrl || ret.avatar || "";
        ret.avatarUrl = avatarImg;
        ret.avatar = avatarImg;

        if (!ret.experienceProofs) ret.experienceProofs = [];
        if (!ret.certifications) ret.certifications = [];
        if (!ret.skills) ret.skills = [];
        if (ret.experienceYears === undefined) ret.experienceYears = 0;
        if (!ret.certificationsUrl) ret.certificationsUrl = "";
        return ret;
      },
    },
  }
);

// Pre-save hook: auto-compute full name, sync biography/bio/expertiseBio, and default approvalStatus for instructors
userSchema.pre("save", async function () {
  if (this.isModified("firstName") || this.isModified("lastName") || !this.name) {
    this.name = `${this.firstName || ""} ${this.lastName || ""}`.trim();
  }

  if (this.isModified("expertiseBio") && (!this.biography || !this.bio)) {
    if (!this.bio) this.bio = this.expertiseBio;
    if (!this.biography) this.biography = this.expertiseBio;
  } else if (this.isModified("biography") && !this.bio) {
    this.bio = this.biography;
    if (!this.expertiseBio) this.expertiseBio = this.biography;
  } else if (this.isModified("bio") && !this.biography) {
    this.biography = this.bio;
    if (!this.expertiseBio) this.expertiseBio = this.bio;
  }

  if (this.isModified("socialLinks") && (!this.socials || Object.keys(this.socials).length === 0)) {
    this.socials = this.socialLinks;
  }

  if (this.isNew && this.role === "instructor" && !this.isModified("approvalStatus")) {
    this.approvalStatus = "pending";
  }

  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
});

// Method to compare entered password with hashed password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.model("User", userSchema);
export default User;