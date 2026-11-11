import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import connectDB from "../src/config/db.js";
import { Category, slugify } from "../src/models/Category.model.js";
import { Course } from "../src/models/Course.model.js";
import { User } from "../src/models/User.model.js";
import { Provider } from "../src/models/Provider.model.js";
import { attachAssessmentsToModules } from "../src/utils/moduleAssessments.js";

// The 18 Primary Categories Dynamic Taxonomy (Phase 1 Q1)
const OFFICIAL_18_CATEGORIES = [
  {
    name: "Software Development",
    slug: "software-development",
    icon: "code",
    order: 1,
    tags: ["Frontend", "Backend", "Fullstack", "DevOps", "Mobile", "APIs"],
    pathways: ["Web Architecture", "Cloud Software Engineering"],
    aliases: ["software-dev"],
    subCategories: [
      { name: "Frontend", slug: "frontend", topics: ["React", "Vue", "CSS", "TypeScript"] },
      { name: "Backend", slug: "backend", topics: ["Node.js", "Express", "Go", "Python"] },
      { name: "Fullstack", slug: "fullstack", topics: ["MERN", "Next.js", "APIs"] },
      { name: "Mobile Development", slug: "mobile-development", topics: ["Flutter", "React Native"] }
    ]
  },
  {
    name: "AI",
    slug: "ai",
    icon: "cpu",
    order: 2,
    tags: ["Machine Learning", "Deep Learning", "LLMs", "Generative AI", "Neural Networks"],
    pathways: ["AI for Agriculture", "AI in Healthcare", "AI for Finance"],
    aliases: ["data-science-ai", "artificial-intelligence"],
    subCategories: [
      { name: "Machine Learning", slug: "machine-learning", topics: ["Scikit-Learn", "Regression", "Supervised Learning"] },
      { name: "Deep Learning", slug: "deep-learning", topics: ["PyTorch", "TensorFlow", "Transformers"] },
      { name: "Generative AI", slug: "generative-ai", topics: ["LLMs", "Prompt Engineering", "RAG"] },
      { name: "Computer Vision", slug: "computer-vision", topics: ["OpenCV", "Object Detection"] }
    ]
  },
  {
    name: "Data Science",
    slug: "data-science",
    icon: "bar-chart-2",
    order: 3,
    tags: ["Data Analytics", "Pandas", "SQL", "Tableau", "Big Data", "Data Visualization"],
    pathways: ["Business Intelligence", "Scientific Computing"],
    aliases: ["data-analytics"],
    subCategories: [
      { name: "Data Analysis", slug: "data-analysis", topics: ["Pandas", "NumPy", "SQL", "EDA"] },
      { name: "Data Engineering", slug: "data-engineering", topics: ["Pipelines", "Airflow", "dbt"] },
      { name: "Data Visualization", slug: "data-visualization", topics: ["Tableau", "PowerBI", "D3.js"] }
    ]
  },
  {
    name: "Cloud",
    slug: "cloud",
    icon: "cloud",
    order: 4,
    tags: ["AWS", "Azure", "GCP", "Kubernetes", "Docker", "DevOps", "Terraform"],
    pathways: ["Cloud Native", "Site Reliability Engineering"],
    aliases: ["cloud-devops"],
    subCategories: [
      { name: "AWS", slug: "aws", topics: ["Cloud Practitioner", "Solutions Architect", "S3", "Lambda"] },
      { name: "Containers & Orchestration", slug: "containers-orchestration", topics: ["Docker", "Kubernetes", "Pods"] },
      { name: "CI/CD & GitOps", slug: "cicd-gitops", topics: ["GitHub Actions", "ArgoCD"] },
      { name: "Infrastructure as Code", slug: "infrastructure-as-code", topics: ["Terraform", "Ansible"] }
    ]
  },
  {
    name: "Cybersecurity",
    slug: "cybersecurity",
    icon: "shield",
    order: 5,
    tags: ["Ethical Hacking", "Network Defense", "AppSec", "SOC Operations", "Cryptography"],
    pathways: ["Enterprise Security", "Defensive Systems"],
    aliases: ["cyber-security"],
    subCategories: [
      { name: "Ethical Hacking", slug: "ethical-hacking", topics: ["Kali Linux", "Reconnaissance", "Penetration Testing"] },
      { name: "Network Defense", slug: "network-defense", topics: ["Wireshark", "Firewalls", "Intrusion Detection"] },
      { name: "Application Security", slug: "application-security", topics: ["OWASP Top 10", "Code Auditing"] },
      { name: "SOC Operations", slug: "soc-operations", topics: ["Incident Response", "SIEM", "Threat Hunting"] }
    ]
  },
  {
    name: "Product and UI/UX Design",
    slug: "product-and-ui-ux-design",
    icon: "palette",
    order: 6,
    tags: ["Figma", "User Research", "Design Systems", "Prototyping", "Interaction Design"],
    pathways: ["Design Leadership", "Product Strategy"],
    aliases: ["product-ui-ux-design"],
    subCategories: [
      { name: "Figma Mastery", slug: "figma-mastery", topics: ["Auto-Layout", "Components", "Variables"] },
      { name: "User Research", slug: "user-research", topics: ["Interviews", "Persona Mapping", "Usability Testing"] },
      { name: "Design Systems", slug: "design-systems", topics: ["Design Tokens", "Component Libraries"] },
      { name: "Interaction Design", slug: "interaction-design", topics: ["Micro-Interactions", "Wireframing"] }
    ]
  },
  {
    name: "Digital Marketing",
    slug: "digital-marketing",
    icon: "trending-up",
    order: 7,
    tags: ["SEO", "Social Media", "Content Strategy", "PPC", "Email Marketing"],
    pathways: ["Growth Hacking", "E-commerce Growth"],
    aliases: ["digital-marketing-growth"],
    subCategories: [
      { name: "SEO & SEM", slug: "seo-sem", topics: ["Search Console", "Keyword Research", "Technical SEO"] },
      { name: "Social Media Growth", slug: "social-media-growth", topics: ["Viral Hooks", "Short Form Video", "Community"] },
      { name: "Content Marketing", slug: "content-marketing", topics: ["Editorial Funnels", "Copywriting"] },
      { name: "Email Marketing", slug: "email-marketing", topics: ["Newsletters", "Drip Campaigns", "Automation"] }
    ]
  },
  {
    name: "Business and Innovation",
    slug: "business-and-innovation",
    icon: "briefcase",
    order: 8,
    tags: ["Startups", "Product Management", "Sales Strategy", "Entrepreneurship", "Venture Capital"],
    pathways: ["Venture Creation", "Technology Strategy"],
    aliases: ["business-entrepreneurship"],
    subCategories: [
      { name: "Startup Fundamentals", slug: "startup-fundamentals", topics: ["Lean Startup", "MVP Validation", "Pitch Decks"] },
      { name: "Product Management", slug: "product-management", topics: ["PRDs", "Agile Sprints", "Roadmapping"] },
      { name: "B2B Sales Strategy", slug: "b2b-sales-strategy", topics: ["Outreach", "Closing Deals", "Pipeline Management"] },
      { name: "Executive Leadership", slug: "executive-leadership", topics: ["Team Dynamics", "Execution", "Culture"] }
    ]
  },
  {
    name: "Fintech",
    slug: "fintech",
    icon: "credit-card",
    order: 9,
    tags: ["Payment Rails", "Financial Modeling", "Open Banking", "RegTech", "DeFi"],
    pathways: ["Climate Fintech", "Algorithmic Trading"],
    aliases: ["finance-fintech"],
    subCategories: [
      { name: "Financial Modeling", slug: "financial-modeling", topics: ["DCF", "Forecasting", "Excel Sheets"] },
      { name: "FinTech APIs", slug: "fintech-apis", topics: ["Open Banking", "Card Rails", "Payment Gateways"] },
      { name: "Investment Principles", slug: "investment-principles", topics: ["Equities", "Risk Management"] },
      { name: "Decentralized Finance", slug: "decentralized-finance", topics: ["DEXs", "Liquidity Pools"] }
    ]
  },
  {
    name: "Blockchain",
    slug: "blockchain",
    icon: "link",
    order: 10,
    tags: ["Solidity", "Smart Contracts", "Web3", "EVM", "Cryptography"],
    pathways: ["DeFi Systems", "Decentralized Governance"],
    aliases: ["blockchain-web3"],
    subCategories: [
      { name: "Solidity Development", slug: "solidity-development", topics: ["Smart Contracts", "ERC-20", "ERC-721"] },
      { name: "Contract Security", slug: "contract-security", topics: ["Auditing", "Reentrancy Protection", "Fuzzing"] },
      { name: "EVM Architecture", slug: "evm-architecture", topics: ["Opcodes", "Gas Optimization"] },
      { name: "Zero Knowledge Proofs", slug: "zero-knowledge-proofs", topics: ["ZK-Rollups", "Circom", "SNARKs"] }
    ]
  },
  {
    name: "Agritech",
    slug: "agritech",
    icon: "feather",
    order: 11,
    tags: ["Smart Farming", "Crop Monitoring", "Agricultural IoT", "Supply Chain", "Precision Ag"],
    pathways: ["AI for Agriculture", "Sustainable Food Systems"],
    subCategories: [
      { name: "Precision Agriculture", slug: "precision-agriculture", topics: ["Sensor Networks", "Drone Imaging"] },
      { name: "Agri Supply Chains", slug: "agri-supply-chains", topics: ["Traceability", "Cold Chain Logistics"] }
    ]
  },
  {
    name: "Food Technology",
    slug: "food-technology",
    icon: "coffee",
    order: 12,
    tags: ["Food Processing", "Quality Assurance", "Biotechnology", "Food Packaging"],
    pathways: ["Sustainable Nutrition", "Food Supply Chains"],
    subCategories: [
      { name: "Food Safety & QA", slug: "food-safety-qa", topics: ["HACCP", "Microbiology Testing"] },
      { name: "Novel Food Processing", slug: "novel-food-processing", topics: ["Alternative Proteins", "Shelf-Life Extension"] }
    ]
  },
  {
    name: "Climate Tech",
    slug: "climate-tech",
    icon: "sun",
    order: 13,
    tags: ["Carbon Accounting", "Renewable Energy", "Green Architecture", "CleanTech", "Decarbonization"],
    pathways: ["Climate Fintech", "Circular Systems"],
    subCategories: [
      { name: "Carbon Analytics", slug: "carbon-analytics", topics: ["GHG Protocol", "Scope 1-3 Measurement"] },
      { name: "Renewable Energy Systems", slug: "renewable-energy-systems", topics: ["Solar PV", "Grid Integration"] }
    ]
  },
  {
    name: "Environment and Circular Economy",
    slug: "environment-and-circular-economy",
    icon: "globe",
    order: 14,
    tags: ["Waste Management", "Lifecycle Analysis", "Conservation", "ESG", "Resource Recovery"],
    pathways: ["Circular Manufacturing", "Environmental Governance"],
    subCategories: [
      { name: "Circular Product Design", slug: "circular-product-design", topics: ["Cradle to Cradle", "Material Recycling"] },
      { name: "Environmental Policy & ESG", slug: "environmental-policy-esg", topics: ["Compliance", "Corporate Reporting"] }
    ]
  },
  {
    name: "Robotics and IoT",
    slug: "robotics-and-iot",
    icon: "terminal",
    order: 15,
    tags: ["Embedded Systems", "Sensors", "Automation", "ROS", "Edge AI", "Microcontrollers"],
    pathways: ["Industrial Robotics", "Smart Cities"],
    subCategories: [
      { name: "Embedded Programming", slug: "embedded-programming", topics: ["C/C++", "ESP32", "Raspberry Pi"] },
      { name: "Robotics Operating System", slug: "robotics-operating-system", topics: ["ROS 2", "Kinematics", "Gazebo"] }
    ]
  },
  {
    name: "HealthTech and Biotech",
    slug: "healthtech-and-biotech",
    icon: "activity",
    order: 16,
    tags: ["Digital Health", "Bioinformatics", "Telemedicine", "Medical Devices", "Genomics"],
    pathways: ["AI in Healthcare", "Precision Medicine"],
    subCategories: [
      { name: "Health Informatics", slug: "health-informatics", topics: ["FHIR", "HIPAA Compliance", "EHR Systems"] },
      { name: "Bioinformatics Fundamentals", slug: "bioinformatics-fundamentals", topics: ["DNA Sequencing", "BLAST Analysis"] }
    ]
  },
  {
    name: "Geospatial and Emerging Computing",
    slug: "geospatial-and-emerging-computing",
    icon: "map-pin",
    order: 17,
    tags: ["GIS", "Satellite Imagery", "Quantum Computing", "Spatial AI", "Remote Sensing"],
    pathways: ["Climate Geospatial", "Autonomous Systems"],
    subCategories: [
      { name: "GIS & Remote Sensing", slug: "gis-remote-sensing", topics: ["QGIS", "GeoPandas", "LiDAR"] },
      { name: "Quantum Computing Basics", slug: "quantum-computing-basics", topics: ["Qubits", "Qiskit Algorithms"] }
    ]
  },
  {
    name: "Foundations and Test Preparation",
    slug: "foundations-and-test-preparation",
    icon: "book-open",
    order: 18,
    tags: ["Mathematics", "Algorithms", "Interview Prep", "System Design", "Computer Architecture"],
    pathways: ["Software Career Accelerator", "Academic Readiness"],
    subCategories: [
      { name: "Technical Interview Prep", slug: "technical-interview-prep", topics: ["LeetCode Mastery", "Data Structures"] },
      { name: "System Design Essentials", slug: "system-design-essentials", topics: ["Distributed Systems", "Load Balancing"] }
    ]
  }
];

// Content Providers (Phase 1 Q2)
const OFFICIAL_PROVIDERS = [
  {
    name: "freeCodeCamp.org",
    slug: "freecodecamp",
    type: "institution",
    platform: "youtube",
    channelUrl: "https://www.youtube.com/@freecodecamp",
    originalUrl: "https://www.freecodecamp.org",
    avatarUrl: "https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/logos/gloxad-logo.png",
    ownershipClass: "externally_curated",
    embedAllowed: true,
    bio: "Global non-profit community teaching people to code with accessible open-source curricula."
  },
  {
    name: "Harvard / CS50",
    slug: "cs50-harvard",
    type: "institution",
    platform: "youtube",
    channelUrl: "https://www.youtube.com/@cs50",
    originalUrl: "https://cs50.harvard.edu",
    avatarUrl: "https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/logos/gloxad-logo.png",
    ownershipClass: "externally_curated",
    embedAllowed: true,
    bio: "Harvard University's introduction to the intellectual enterprises of computer science."
  },
  {
    name: "MIT OpenCourseWare",
    slug: "mit-ocw",
    type: "institution",
    platform: "youtube",
    channelUrl: "https://www.youtube.com/@mitocw",
    originalUrl: "https://ocw.mit.edu",
    avatarUrl: "https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/logos/gloxad-logo.png",
    ownershipClass: "externally_curated",
    embedAllowed: true,
    bio: "Publication of virtually all MIT course content, open to the world."
  },
  {
    name: "Programming with Mosh",
    slug: "programming-with-mosh",
    type: "creator",
    platform: "youtube",
    channelUrl: "https://www.youtube.com/@programmingwithmosh",
    originalUrl: "https://codewithmosh.com",
    avatarUrl: "https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/logos/gloxad-logo.png",
    ownershipClass: "externally_curated",
    embedAllowed: true,
    bio: "Clear, concise tutorials on software development and architecture."
  },
  {
    name: "Gloxad Academy Official",
    slug: "gloxad-academy",
    type: "gloxad",
    platform: "youtube",
    channelUrl: "https://www.youtube.com/@gloxadacademy",
    originalUrl: "https://gloxad.com",
    avatarUrl: "https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/logos/gloxad-logo.png",
    ownershipClass: "gloxad_produced",
    embedAllowed: true,
    bio: "Official verified curricula, live masterclasses, and capstones produced by Gloxad Academy."
  }
];

async function importCatalogue() {
  console.log("\x1b[36m====================================================\x1b[0m");
  console.log("\x1b[36m [CATALOGUE IMPORT] Gloxad Academy 18 Categories &  \x1b[0m");
  console.log("\x1b[36m Sequential Free Courses with Gated Assessments     \x1b[0m");
  console.log("\x1b[36m====================================================\x1b[0m\n");

  try {
    await connectDB();
    console.log("✓ Database connected\n");

    // 1. Upsert the 18 official categories (Phase 1 Q1)
    console.log("1. Upserting the 18 official dynamic course categories...");
    for (const cat of OFFICIAL_18_CATEGORIES) {
      await Category.findOneAndUpdate(
        { $or: [{ slug: cat.slug }, { name: cat.name }] },
        {
          name: cat.name,
          slug: cat.slug,
          icon: cat.icon,
          order: cat.order,
          tags: cat.tags,
          pathways: cat.pathways,
          aliases: cat.aliases || [],
          isActive: true,
          subCategories: cat.subCategories
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    console.log("✓ All 18 categories synchronized.\n");

    // 2. Upsert Provider Registry (Phase 1 Q2)
    console.log("2. Upserting provider registry attribution entities...");
    const providerMap = new Map();
    for (const prov of OFFICIAL_PROVIDERS) {
      const savedProvider = await Provider.findOneAndUpdate(
        { slug: prov.slug },
        { ...prov, isActive: true },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      providerMap.set(prov.name, savedProvider);
      providerMap.set(prov.slug, savedProvider);
    }
    const defaultProvider = providerMap.get("freeCodeCamp.org");
    console.log(`✓ Synchronized ${OFFICIAL_PROVIDERS.length} attribution providers.\n`);

    // 3. Ensure official platform instructor exists
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

    // 4. Read 74 courses from src/data/gloxadCourses2026.json
    const catalogPath = path.resolve("src/data/gloxadCourses2026.json");
    if (!fs.existsSync(catalogPath)) {
      throw new Error(`Catalogue file not found at ${catalogPath}. Run scripts/generate-catalog-data.js first.`);
    }

    const courseList = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));
    console.log(`\n3. Processing ${courseList.length} courses from ${catalogPath}...`);

    let createdCount = 0;
    let updatedCount = 0;

    for (const item of courseList) {
      // Inrich modules with deterministic quizzes (5 questions) and written task (min 50 words)
      attachAssessmentsToModules(item);

      const existing = await Course.findOne({ slug: item.slug });

      const courseCategoryObj = {
        name: item.category,
        slug: item.categorySlug || slugify(item.category),
      };

      const sourceObj = {
        platform: "youtube",
        creatorName: item.creator || "freeCodeCamp.org",
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
          sequentialModules: true,
          provider: defaultProvider?._id || null,
          source: sourceObj,
          enrollmentOpen: true,
          price: 0,
          discountPrice: 0,
          thumbnail: item.thumbnail,
          trailerVideoUrl: item.trailerVideoUrl,
          description: item.description,
          skills: item.skills || [],
          tags: [item.category, item.subCategory].filter(Boolean),
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
        // Idempotent update: set sequentialModules and ensure modules have quizzes and tasks
        existing.title = item.title;
        existing.subtitle = item.subtitle;
        existing.category = courseCategoryObj;
        existing.subCategory = item.subCategory;
        existing.topic = item.topic;
        existing.sequentialModules = true;
        if (defaultProvider && !existing.provider) {
          existing.provider = defaultProvider._id;
        }
        existing.modules = item.modules;
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
    console.log(`✓ Sequential Modules:      Enabled for free courses`);
    console.log(`✓ Quizzes & Written Tasks: Deterministically Seeded`);
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
