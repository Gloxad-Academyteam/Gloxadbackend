import mongoose from "mongoose";

export const slugify = (text) => {
  if (!text) return "";
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s\W-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const providerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Provider name is required"],
      unique: true,
      trim: true,
      index: true
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    type: {
      type: String,
      enum: ["creator", "institution", "company", "research_body", "platform", "gloxad"],
      default: "creator"
    },
    platform: {
      type: String,
      enum: ["youtube", "s3", "external", "vimeo"],
      default: "youtube"
    },
    originalUrl: {
      type: String,
      default: "",
      trim: true
    },
    channelUrl: {
      type: String,
      default: "",
      trim: true
    },
    avatarUrl: {
      type: String,
      default: "",
      trim: true
    },
    ownershipClass: {
      type: String,
      enum: ["gloxad_produced", "licensed_partner", "externally_curated"],
      default: "externally_curated",
      index: true
    },
    embedAllowed: {
      type: Boolean,
      default: true
    },
    bio: {
      type: String,
      default: "",
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.__v;
        return ret;
      }
    }
  }
);

providerSchema.pre("validate", function () {
  if (this.name && !this.slug) {
    this.slug = slugify(this.name);
  }
});

export const Provider = mongoose.models.Provider || mongoose.model("Provider", providerSchema);
export default Provider;
