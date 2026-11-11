import mongoose from "mongoose";

export const slugify = (text) => {
  if (!text) return "";
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s\W-]+/g, "-") // Replace spaces and non-word chars with hyphen
    .replace(/^-+|-+$/g, ""); // Strip leading and trailing hyphens
};

const subCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, lowercase: true, trim: true },
    topics: [{ type: String, trim: true }]
  },
  { _id: true }
);

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
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
    icon: {
      type: String,
      default: ""
    },
    imageUrl: {
      type: String,
      default: "",
      trim: true
    },
    order: {
      type: Number,
      default: 0
    },
    tags: [{ type: String, trim: true }],
    pathways: [{ type: String, trim: true }],
    aliases: [{ type: String, lowercase: true, trim: true }],
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    subCategories: [subCategorySchema]
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.__v;
        delete ret.id;
        return ret;
      }
    }
  }
);

categorySchema.pre("validate", function () {
  if (this.name) {
    this.slug = slugify(this.name);
  }
  if (Array.isArray(this.subCategories)) {
    this.subCategories.forEach((sub) => {
      if (sub.name) {
        sub.slug = slugify(sub.name);
      }
    });
  }
});

export const Category = mongoose.model("Category", categorySchema);
export default Category;
