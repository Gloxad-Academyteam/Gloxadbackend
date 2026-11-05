import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import connectDB from "../src/config/db.js";
import { Category, slugify } from "../src/models/Category.model.js";
import { Course } from "../src/models/Course.model.js";
import { User } from "../src/models/User.model.js";

const OFFICIAL_CATEGORIES = [
  {
    name: "Software Development",
    slug: "software-development",
    icon: "code",
    order: 1,
    subCategories: [
      { name: "Frontend", slug: "frontend", topics: ["React", "Vue", "CSS"] },
      { name: "Backend", slug: "backend", topics: ["Node.js", "Express", "Go", "Python"] },
      { name: "Fullstack", slug: "fullstack", topics: ["MERN", "Next.js", "APIs"] },
      { name: "Mobile Development", slug: "mobile-development", topics: ["Flutter", "React Native"] }
    ]
  },
  {
    name: "Data Science & AI",
    slug: "data-science-ai",
    icon: "cpu",
    order: 2,
    subCategories: [
      { name: "Machine Learning", slug: "machine-learning", topics: ["Scikit-Learn", "Regression"] },
      { name: "Deep Learning", slug: "deep-learning", topics: ["PyTorch", "TensorFlow", "Neural Networks"] },
      { name: "Data Analysis", slug: "data-analysis", topics: ["Pandas", "SQL", "Tableau"] },
      { name: "Computer Vision", slug: "computer-vision", topics: ["OpenCV"] }
    ]
  },
  {
    name: "Cloud & DevOps",
    slug: "cloud-devops",
    icon: "cloud",
    order: 3,
    subCategories: [
      { name: "AWS", slug: "aws", topics: ["Cloud Practitioner", "Solutions Architect"] },
      { name: "Docker & Kubernetes", slug: "docker-kubernetes", topics: ["Containers", "Pods", "K8s"] },
      { name: "CI/CD", slug: "cicd", topics: ["GitHub Actions", "ArgoCD"] },
      { name: "Terraform & IaC", slug: "terraform-iac", topics: ["Terraform", "Infrastructure as Code"] }
    ]
  },
  {
    name: "Cyber Security",
    slug: "cyber-security",
    icon: "shield",
    order: 4,
    subCategories: [
      { name: "Ethical Hacking", slug: "ethical-hacking", topics: ["Kali Linux", "Reconnaissance"] },
      { name: "Network Defense", slug: "network-defense", topics: ["Wireshark", "Firewalls"] },
      { name: "Application Security", slug: "application-security", topics: ["OWASP Top 10"] },
      { name: "SOC Operations", slug: "soc-operations", topics: ["Incident Response", "SIEM"] }
    ]
  },
  {
    name: "Product & UI/UX Design",
    slug: "product-ui-ux-design",
    icon: "palette",
    order: 5,
    subCategories: [
      { name: "Figma Mastery", slug: "figma-mastery", topics: ["Auto-Layout", "Components", "Variables"] },
      { name: "User Research", slug: "user-research", topics: ["Interviews", "Persona Mapping"] },
      { name: "Design Systems", slug: "design-systems", topics: ["Design Tokens", "Component Libraries"] },
      { name: "Interaction Design", slug: "interaction-design", topics: ["Micro-Interactions", "Wireframing"] }
    ]
  },
  {
    name: "Digital Marketing & Growth",
    slug: "digital-marketing-growth",
    icon: "trending-up",
    order: 6,
    subCategories: [
      { name: "SEO & SEM", slug: "seo-sem", topics: ["Google Search Console", "Keyword Research"] },
      { name: "Social Media Growth", slug: "social-media-growth", topics: ["Viral Hooks", "Short Form Video"] },
      { name: "Content Strategy", slug: "content-strategy", topics: ["Editorial Calendars", "Storytelling"] },
      { name: "Email Marketing", slug: "email-marketing", topics: ["Newsletters", "Drip Campaigns"] }
    ]
  },
  {
    name: "Business & Entrepreneurship",
    slug: "business-entrepreneurship",
    icon: "briefcase",
    order: 7,
    subCategories: [
      { name: "Startup Fundamentals", slug: "startup-fundamentals", topics: ["Lean Startup", "MVP Validation"] },
      { name: "Product Management", slug: "product-management", topics: ["PRDs", "Agile Sprints"] },
      { name: "Sales Strategy", slug: "sales-strategy", topics: ["B2B SaaS Sales", "Closing Deals"] },
      { name: "Leadership", slug: "leadership", topics: ["Team Dynamics", "Execution"] }
    ]
  },
  {
    name: "Finance & FinTech",
    slug: "finance-fintech",
    icon: "credit-card",
    order: 8,
    subCategories: [
      { name: "Financial Modeling", slug: "financial-modeling", topics: ["DCF", "Forecasting", "Excel"] },
      { name: "FinTech APIs", slug: "fintech-apis", topics: ["Open Banking", "Card Rails"] },
      { name: "Investment Principles", slug: "investment-principles", topics: ["Equities", "Risk Management"] },
      { name: "Decentralized Finance", slug: "decentralized-finance", topics: ["DEXs", "Liquidity Pools"] }
    ]
  },
  {
    name: "Blockchain & Web3",
    slug: "blockchain-web3",
    icon: "link",
    order: 9,
    subCategories: [
      { name: "Solidity", slug: "solidity", topics: ["Smart Contracts", "ERC-20", "ERC-721"] },
      { name: "Smart Contract Security", slug: "smart-contract-security", topics: ["Auditing", "Reentrancy"] },
      { name: "EVM Architecture", slug: "evm-architecture", topics: ["Opcodes", "Gas Optimization"] },
      { name: "Zero Knowledge Proofs", slug: "zero-knowledge-proofs", topics: ["ZK-Rollups", "Circom"] }
    ]
  },
  {
    name: "Creative Arts & Media",
    slug: "creative-arts-media",
    icon: "film",
    order: 10,
    subCategories: [
      { name: "Video Editing", slug: "video-editing", topics: ["Premiere Pro", "DaVinci Resolve"] },
      { name: "Motion Graphics", slug: "motion-graphics", topics: ["After Effects", "Kinetic Typography"] },
      { name: "Audio Engineering", slug: "audio-engineering", topics: ["Vocal Tuning", "Audio Cleanup"] },
      { name: "Brand Storytelling", slug: "brand-storytelling", topics: ["Commercials", "Visual Directing"] }
    ]
  }
];

async function importCatalogue() {
  console.log("\x1b[36m====================================================\x1b[0m");
  console.log("\x1b[36m [CATALOGUE IMPORT] Gloxad Academy 74 Free Courses  \x1b[0m");
  console.log("\x1b[36m====================================================\x1b[0m\n");

  try {
    await connectDB();
    console.log("✓ Database connected\n");

    // 1. Upsert the 10 official categories
    console.log("1. Upserting the 10 official course categories...");
    for (const cat of OFFICIAL_CATEGORIES) {
      await Category.findOneAndUpdate(
        { slug: cat.slug },
        {
          name: cat.name,
          slug: cat.slug,
          icon: cat.icon,
          order: cat.order,
          subCategories: cat.subCategories,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    console.log("✓ All 10 categories synchronized.\n");

    // 2. Ensure official platform instructor exists
    let platformInstructor = await User.findOne({ email: "instructor@gloxad.com" });
    if (!platformInstructor) {
      const hashedPassword = await bcrypt.hash("GloxadPassword2026!", 10);
      platformInstructor = await User.create({
        firstName: "Gloxad",
        lastName: "Academy",
        name: "Gloxad Academy",
        username: "gloxadacademy",
        email: "instructor@gloxad.com",
        password: hashedPassword,
        role: "instructor",
        approvalStatus: "approved",
        isVerified: true,
        isEmailVerified: true,
        isActive: true,
        title: "Official Open Curriculum",
        bio: "Curated open-access university and industry courses provided by Gloxad Academy.",
        avatarUrl: "https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/logos/gloxad-logo.png",
      });
      console.log("✓ Created official instructor account: Gloxad Academy");
    } else {
      console.log("✓ Found official instructor account: Gloxad Academy");
    }

    // 3. Read 74 courses from src/data/gloxadCourses2026.json
    const catalogPath = path.resolve("src/data/gloxadCourses2026.json");
    if (!fs.existsSync(catalogPath)) {
      throw new Error(`Catalogue file not found at ${catalogPath}. Run scripts/generate-catalog-data.js first.`);
    }

    const courseList = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));
    console.log(`\n2. Processing ${courseList.length} courses from ${catalogPath}...`);

    let createdCount = 0;
    let updatedCount = 0;

    for (const item of courseList) {
      const existing = await Course.findOne({ slug: item.slug });

      const courseCategoryObj = {
        name: item.category,
        slug: item.categorySlug || slugify(item.category),
      };

      const sourceObj = {
        platform: "youtube",
        creatorName: "freeCodeCamp.org",
        creatorAvatar: "https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/logos/gloxad-logo.png",
        channelUrl: "https://www.youtube.com/@freecodecamp",
        url: item.trailerVideoUrl || "",
      };

      if (!existing) {
        await Course.create({
          title: item.title,
          slug: item.slug,
          subtitle: item.subtitle,
          category: courseCategoryObj,
          subCategory: item.subCategory,
          topic: item.topic,
          language: item.language || "English",
          level: item.level || "beginner",
          courseType: "free",
          source: sourceObj,
          enrollmentOpen: true,
          price: 0,
          discountPrice: 0,
          thumbnail: item.thumbnail,
          trailerVideoUrl: item.trailerVideoUrl,
          description: item.description,
          skills: item.skills || [],
          targetAudience: item.targetAudience || [],
          requirements: item.requirements || [],
          status: "published",
          instructor: platformInstructor._id,
          modules: item.modules || [],
          enrolledCount: 0,
          rating: { average: 5.0, count: 0 },
        });
        createdCount++;
      } else {
        // Idempotent update: preserve any custom price admin might have configured
        existing.title = item.title;
        existing.subtitle = item.subtitle;
        existing.category = courseCategoryObj;
        existing.subCategory = item.subCategory;
        existing.topic = item.topic;
        existing.modules = item.modules || existing.modules;
        existing.description = item.description;
        existing.status = "published";
        existing.enrollmentOpen = true;
        existing.source = sourceObj;
        if (existing.price === 0) {
          existing.courseType = "free";
        }
        await existing.save();
        updatedCount++;
      }
    }

    console.log("\n====================================================");
    console.log("   CATALOGUE IMPORT SUMMARY");
    console.log("====================================================");
    console.log(`✓ Total Courses Processed: ${courseList.length}`);
    console.log(`✓ Newly Created:           ${createdCount}`);
    console.log(`✓ Synchronized / Updated:  ${updatedCount}`);
    console.log("✓ Safe to re-run at any time without creating duplicates.");
    console.log("====================================================\n");

  } catch (error) {
    console.error("❌ Catalogue import failed:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

importCatalogue();
