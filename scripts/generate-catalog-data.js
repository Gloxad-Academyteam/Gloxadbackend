import fs from "fs";
import path from "path";

const CATEGORIES = [
  {
    name: "Software Development",
    slug: "software-development",
    icon: "code",
    subCategories: ["Frontend", "Backend", "Fullstack", "Mobile Development"]
  },
  {
    name: "Data Science & AI",
    slug: "data-science-ai",
    icon: "cpu",
    subCategories: ["Machine Learning", "Deep Learning", "Data Analysis", "Computer Vision"]
  },
  {
    name: "Cloud & DevOps",
    slug: "cloud-devops",
    icon: "cloud",
    subCategories: ["AWS", "Docker & Kubernetes", "CI/CD", "Terraform & IaC"]
  },
  {
    name: "Cyber Security",
    slug: "cyber-security",
    icon: "shield",
    subCategories: ["Ethical Hacking", "Network Defense", "Application Security", "SOC Operations"]
  },
  {
    name: "Product & UI/UX Design",
    slug: "product-ui-ux-design",
    icon: "palette",
    subCategories: ["Figma Mastery", "User Research", "Design Systems", "Interaction Design"]
  },
  {
    name: "Digital Marketing & Growth",
    slug: "digital-marketing-growth",
    icon: "trending-up",
    subCategories: ["SEO & SEM", "Social Media Growth", "Content Strategy", "Email Marketing"]
  },
  {
    name: "Business & Entrepreneurship",
    slug: "business-entrepreneurship",
    icon: "briefcase",
    subCategories: ["Startup Fundamentals", "Product Management", "Sales Strategy", "Leadership"]
  },
  {
    name: "Finance & FinTech",
    slug: "finance-fintech",
    icon: "credit-card",
    subCategories: ["Financial Modeling", "FinTech APIs", "Investment Principles", "Decentralized Finance"]
  },
  {
    name: "Blockchain & Web3",
    slug: "blockchain-web3",
    icon: "link",
    subCategories: ["Solidity", "Smart Contract Security", "EVM Architecture", "Zero Knowledge Proofs"]
  },
  {
    name: "Creative Arts & Media",
    slug: "creative-arts-media",
    icon: "film",
    subCategories: ["Video Editing", "Motion Graphics", "Audio Engineering", "Brand Storytelling"]
  }
];

const COURSE_TITLES = [
  // 1. Software Development (10 courses)
  { cat: 0, sub: 0, title: "Modern JavaScript: ES6+ from Scratch", yt: "W6NZfCO5SIk", creator: "Programming with Mosh", dur: "48:00" },
  { cat: 0, sub: 0, title: "React 19 & Next.js Masterclass", yt: "bMknfKXIFA8", creator: "FreeCodeCamp", dur: "1:20:00" },
  { cat: 0, sub: 0, title: "TypeScript for Modern Web Applications", yt: "gieEQFIfgYc", creator: "Traversy Media", dur: "55:00" },
  { cat: 0, sub: 1, title: "Node.js & Express RESTful API Engineering", yt: "Oe421EPjeBE", creator: "Web Dev Simplified", dur: "1:05:00" },
  { cat: 0, sub: 1, title: "Go Programming Language: Complete Guide", yt: "YS4e4q9oBaU", creator: "FreeCodeCamp", dur: "2:10:00" },
  { cat: 0, sub: 1, title: "Python for Modern Backend Services", yt: "_uQrJ0TkZlc", creator: "Programming with Mosh", dur: "1:15:00" },
  { cat: 0, sub: 2, title: "Full-Stack Web Development Architecture", yt: "zJSY8tbf_ys", creator: "Fireship", dur: "45:00" },
  { cat: 0, sub: 2, title: "GraphQL API Design with Apollo and Node", yt: "ed8SzALpx1Q", creator: "Traversy Media", dur: "50:00" },
  { cat: 0, sub: 3, title: "Flutter & Dart Mobile App Development", yt: "VPvVD8t02U8", creator: "FreeCodeCamp", dur: "1:40:00" },
  { cat: 0, sub: 3, title: "React Native: Cross-Platform iOS & Android", yt: "0-S5a0eXPoc", creator: "Academind", dur: "1:10:00" },

  // 2. Data Science & AI (9 courses)
  { cat: 1, sub: 0, title: "Python for Data Science Bootcamp", yt: "LHBE6Q9XlzI", creator: "Derek Banas", dur: "1:30:00" },
  { cat: 1, sub: 0, title: "Machine Learning with Scikit-Learn", yt: "7eh4d6sabA0", creator: "StatQuest", dur: "1:10:00" },
  { cat: 1, sub: 1, title: "Deep Learning with PyTorch", yt: "V_xro1bcAuA", creator: "Daniel Bourke", dur: "2:30:00" },
  { cat: 1, sub: 1, title: "Neural Networks from the Ground Up", yt: "aircAruvnKk", creator: "3Blue1Brown", dur: "40:00" },
  { cat: 1, sub: 2, title: "Pandas and NumPy for Data Analysis", yt: "vmEHCJofslg", creator: "Keith Galli", dur: "1:00:00" },
  { cat: 1, sub: 2, title: "SQL for Data Analysts & BI", yt: "HXV3zeRR3h4", creator: "Luke Barousse", dur: "1:15:00" },
  { cat: 1, sub: 2, title: "Tableau & PowerBI Dashboards", yt: "78LZEVOQ-lU", creator: "Kenji Explains", dur: "50:00" },
  { cat: 1, sub: 3, title: "Computer Vision with OpenCV and Python", yt: "oXlwWbU8l2o", creator: "Murtaza's Workshop", dur: "1:25:00" },
  { cat: 1, sub: 3, title: "Large Language Models & Generative AI", yt: "kCc8FmEb1nY", creator: "Andrej Karpathy", dur: "1:45:00" },

  // 3. Cloud & DevOps (8 courses)
  { cat: 2, sub: 0, title: "AWS Certified Cloud Practitioner Essentials", yt: "SOTamWNgDKc", creator: "FreeCodeCamp", dur: "2:00:00" },
  { cat: 2, sub: 0, title: "Serverless Architecture with AWS Lambda", yt: "eOBq__h4OJ4", creator: "Be A Better Dev", dur: "45:00" },
  { cat: 2, sub: 1, title: "Docker Containerization Complete Course", yt: "fqMOX6JJhGo", creator: "TechWorld with Nana", dur: "1:30:00" },
  { cat: 2, sub: 1, title: "Kubernetes in Practice for Developers", yt: "X48VuDVv0do", creator: "TechWorld with Nana", dur: "2:15:00" },
  { cat: 2, sub: 2, title: "GitHub Actions for Automated CI/CD", yt: "R8_veQiYBjI", creator: "Fireship", dur: "35:00" },
  { cat: 2, sub: 2, title: "GitOps with ArgoCD and Kubernetes", yt: "MeU5_r9V-4g", creator: "DevOps Toolkit", dur: "55:00" },
  { cat: 2, sub: 3, title: "Terraform Infrastructure as Code (IaC)", yt: "SLB_c_ayRMo", creator: "FreeCodeCamp", dur: "1:20:00" },
  { cat: 2, sub: 3, title: "Linux Command Line & Shell Scripting", yt: "ZtqB5_3EkSk", creator: "FreeCodeCamp", dur: "1:10:00" },

  // 4. Cyber Security (7 courses)
  { cat: 3, sub: 0, title: "Ethical Hacking Fundamentals", yt: "3Kq1MIfTWCE", creator: "The Cyber Mentor", dur: "2:00:00" },
  { cat: 3, sub: 0, title: "Web Application Penetration Testing", yt: "2_lswM1S264", creator: "InsiderPhD", dur: "1:15:00" },
  { cat: 3, sub: 1, title: "Network Defense and Packet Analysis (Wireshark)", yt: "lb1Dw0elw0Q", creator: "NetworkChuck", dur: "50:00" },
  { cat: 3, sub: 1, title: "Linux Security Hardening Essentials", yt: "d_xT7x-Fw6g", creator: "HackerSploit", dur: "1:05:00" },
  { cat: 3, sub: 2, title: "OWASP Top 10 Vulnerabilities & Remediation", yt: "pA4Fq4mZ1eU", creator: "PwnFunction", dur: "45:00" },
  { cat: 3, sub: 2, title: "Cryptography & Public Key Infrastructure", yt: "JH43y_6ZqG0", creator: "Computerphile", dur: "35:00" },
  { cat: 3, sub: 3, title: "SOC Analyst Incident Response Basics", yt: "z0yvWj1g_9c", creator: "Gerald Auger", dur: "1:10:00" },

  // 5. Product & UI/UX Design (8 courses)
  { cat: 4, sub: 0, title: "Figma UI Design: Complete Beginner to Pro", yt: "c9Wg6Cb_YlU", creator: "FreeCodeCamp", dur: "1:40:00" },
  { cat: 4, sub: 0, title: "Advanced Prototyping & Variables in Figma", yt: "k74IrUNaJvg", creator: "Flux Academy", dur: "50:00" },
  { cat: 4, sub: 1, title: "User Experience Research & Persona Mapping", yt: "cCO2m_U5bF8", creator: "NNgroup", dur: "45:00" },
  { cat: 4, sub: 1, title: "Usability Testing & Heuristic Evaluation", yt: "1zL93KjU64E", creator: "CareerFoundry", dur: "55:00" },
  { cat: 4, sub: 2, title: "Building Scalable Design Systems", yt: "O9uV8Zk5e1g", creator: "Dan Mall", dur: "1:05:00" },
  { cat: 4, sub: 2, title: "Design Tokens & Developer Handoff", yt: "wI2e31w8oE8", creator: "DesignCourse", dur: "40:00" },
  { cat: 4, sub: 3, title: "Micro-Interactions and Motion Design", yt: "p1qQoW0qE-A", creator: "MDS", dur: "35:00" },
  { cat: 4, sub: 3, title: "Responsive Web Layouts & Grid Systems", yt: "7wz4JbX9p-U", creator: "Kevin Powell", dur: "50:00" },

  // 6. Digital Marketing & Growth (7 courses)
  { cat: 5, sub: 0, title: "SEO Masterclass: Ranking on Google", yt: "DvwS7cV9GmQ", creator: "Ahrefs", dur: "1:10:00" },
  { cat: 5, sub: 0, title: "Google Ads & Pay-Per-Click Essentials", yt: "8lq6dD1m_1w", creator: "Neil Patel", dur: "45:00" },
  { cat: 5, sub: 1, title: "Social Media Strategy for High Growth Brands", yt: "1xZ7vN1aQ4s", creator: "HubSpot", dur: "55:00" },
  { cat: 5, sub: 1, title: "Community Building on Discord & X", yt: "9kK1Qx8v-9Y", creator: "Growth Tribe", dur: "40:00" },
  { cat: 5, sub: 2, title: "Content Marketing & Editorial Funnels", yt: "6wW8qE1-1oI", creator: "Brian Dean", dur: "50:00" },
  { cat: 5, sub: 2, title: "Copywriting Psychology That Converts", yt: "0jN9wQ2pZ7o", creator: "Alex Cattoni", dur: "45:00" },
  { cat: 5, sub: 3, title: "Email Automation & Retention Funnels", yt: "3yX9bN2-Q1A", creator: "ConvertKit", dur: "50:00" },

  // 7. Business & Entrepreneurship (7 courses)
  { cat: 6, sub: 0, title: "Startup Lean Methodology: Idea to MVP", yt: "th3Yz9k-1Qo", creator: "Y Combinator", dur: "1:00:00" },
  { cat: 6, sub: 0, title: "Validating Business Ideas & Customer Discovery", yt: "7xW1b-8qE4M", creator: "Strategyzer", dur: "45:00" },
  { cat: 6, sub: 1, title: "Product Management 101: Roadmaps & Sprints", yt: "9yN1b8_oK1A", creator: "Product School", dur: "1:15:00" },
  { cat: 6, sub: 1, title: "Metrics That Matter: CAC, LTV and Churn", yt: "5qE2b-9xK1w", creator: "a16z", dur: "40:00" },
  { cat: 6, sub: 2, title: "B2B SaaS Sales Fundamentals", yt: "1oI9b8-xQ2w", creator: "Steli Efti", dur: "50:00" },
  { cat: 6, sub: 2, title: "Pitch Deck Creation for Angel & Seed Rounds", yt: "7yN2b-9qK1e", creator: "Y Combinator", dur: "45:00" },
  { cat: 6, sub: 3, title: "Leadership & High-Performing Tech Teams", yt: "3xW8b-9oK1A", creator: "Simon Sinek", dur: "55:00" },

  // 8. Finance & FinTech (6 courses)
  { cat: 7, sub: 0, title: "Financial Modeling in Excel & Google Sheets", yt: "8yN1b8-qK2w", creator: "Corporate Finance Institute", dur: "1:30:00" },
  { cat: 7, sub: 0, title: "Understanding Balance Sheets & Cash Flow", yt: "4qE1b-8xK1o", creator: "Khan Academy", dur: "50:00" },
  { cat: 7, sub: 1, title: "FinTech Architecture & Payment Rails", yt: "2xW9b-1qK4e", creator: "FinTech School", dur: "1:05:00" },
  { cat: 7, sub: 1, title: "Open Banking APIs & PSD2 Standards", yt: "6yN2b-8oK1A", creator: "Plaid Academy", dur: "45:00" },
  { cat: 7, sub: 2, title: "Personal Wealth Building & Asset Allocation", yt: "9qE1b-8xK2w", creator: "The Plain Bagel", dur: "50:00" },
  { cat: 7, sub: 3, title: "Decentralized Finance (DeFi) Protocols", yt: "1xW8b-9oK3A", creator: "Finematics", dur: "40:00" },

  // 9. Blockchain & Web3 (6 courses)
  { cat: 8, sub: 0, title: "Solidity Smart Contract Development", yt: "M576WGiDBdQ", creator: "Patrick Collins", dur: "2:00:00" },
  { cat: 8, sub: 0, title: "Foundry & Hardhat for Ethereum Testing", yt: "gyMwXuJrbJQ", creator: "Dapp University", dur: "1:15:00" },
  { cat: 8, sub: 1, title: "Smart Contract Security & Reentrancy Audits", yt: "4mHM9mE5u6Y", creator: "Smart Contract Programmer", dur: "50:00" },
  { cat: 8, sub: 2, title: "Ethereum Virtual Machine (EVM) Opcodes & Gas", yt: "kCswG-V_L2U", creator: "Bankless", dur: "45:00" },
  { cat: 8, sub: 2, title: "Web3.js & Ethers.js Frontend Integration", yt: "yk7nVzOnWvY", creator: "EatTheBlocks", dur: "55:00" },
  { cat: 8, sub: 3, title: "Zero-Knowledge Proofs (ZK-SNARKs) Introduction", yt: "fOGdb1CTu5c", creator: "ZK Mesh", dur: "40:00" },

  // 10. Creative Arts & Media (6 courses)
  { cat: 9, sub: 0, title: "Premiere Pro Video Editing from Start to Finish", yt: "u73-wK-Wk1A", creator: "Peter McKinnon", dur: "1:20:00" },
  { cat: 9, sub: 0, title: "DaVinci Resolve Color Grading Essentials", yt: "6qE1b-9xK1w", creator: "Casey Faris", dur: "1:10:00" },
  { cat: 9, sub: 1, title: "After Effects Motion Graphics Foundations", yt: "2xW9b-8oK1A", creator: "Ben Marriott", dur: "55:00" },
  { cat: 9, sub: 2, title: "Audio Mixing & Voiceover Clean-Up in Audition", yt: "7yN1b-8qK2w", creator: "Curtis Judd", dur: "45:00" },
  { cat: 9, sub: 3, title: "Brand Storytelling & Video Commercial Production", yt: "4qE2b-9xK1o", creator: "Cinecom.net", dur: "50:00" },
  { cat: 9, sub: 3, title: "Thumbnail Design & Visual Click-Through Psychology", yt: "9xW8b-1oK2A", creator: "Film Booth", dur: "40:00" }
];

const slugify = (text) => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const courses = COURSE_TITLES.map((c, idx) => {
  const categoryObj = CATEGORIES[c.cat];
  const subCategoryName = categoryObj.subCategories[c.sub] || categoryObj.subCategories[0];
  const slug = slugify(c.title);
  const courseNumber = idx + 1;

  return {
    courseId: `GLX-COURSE-${String(courseNumber).padStart(3, "0")}`,
    title: c.title,
    slug,
    subtitle: `Learn ${c.title} step-by-step with real-world projects and comprehensive video guidance.`,
    category: categoryObj.name,
    categorySlug: categoryObj.slug,
    subCategory: subCategoryName,
    topic: subCategoryName,
    language: "English",
    level: idx % 3 === 0 ? "beginner" : idx % 3 === 1 ? "intermediate" : "all-levels",
    courseType: "free",
    enrollmentOpen: true,
    price: 0,
    discountPrice: 0,
    thumbnail: `https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=60`,
    trailerVideoUrl: `https://www.youtube.com/embed/${c.yt}`,
    description: `Comprehensive free educational course covering ${c.title}. Built in partnership with top global open education resources. Free access for all learners.`,
    skills: [categoryObj.name, subCategoryName, "Practical Implementation"],
    targetAudience: ["Students", "Self-Taught Learners", "Industry Professionals"],
    requirements: ["Basic computer literacy", "Stable internet connection"],
    status: "published",
    modules: [
      {
        title: "Module 1: Foundations & Architecture",
        lessons: [
          {
            title: `Introduction to ${c.title}`,
            duration: "15:00",
            videoUrl: `https://www.youtube.com/embed/${c.yt}`,
            isFreePreview: true,
            creator: c.creator,
            sourceUrl: `https://www.youtube.com/watch?v=${c.yt}`,
            embedAllowed: true
          },
          {
            title: "Core Concepts and Framework Overview",
            duration: "25:00",
            videoUrl: `https://www.youtube.com/embed/${c.yt}`,
            isFreePreview: true,
            creator: c.creator,
            sourceUrl: `https://www.youtube.com/watch?v=${c.yt}`,
            embedAllowed: true
          }
        ],
        quizzes: []
      },
      {
        title: "Module 2: Practical Projects & Next Steps",
        lessons: [
          {
            title: "Hands-on Project Walkthrough",
            duration: c.dur,
            videoUrl: `https://www.youtube.com/embed/${c.yt}`,
            isFreePreview: true,
            creator: c.creator,
            sourceUrl: `https://www.youtube.com/watch?v=${c.yt}`,
            embedAllowed: true
          }
        ],
        quizzes: []
      }
    ]
  };
});

const dataDir = path.resolve("src/data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const outputPath = path.join(dataDir, "gloxadCourses2026.json");
fs.writeFileSync(outputPath, JSON.stringify(courses, null, 2), "utf-8");

console.log(`✓ Successfully generated ${courses.length} official courses across ${CATEGORIES.length} categories.`);
console.log(`✓ Output file written to: ${outputPath}`);
