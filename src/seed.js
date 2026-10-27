import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import connectDB from './config/db.js';

import { User } from './models/User.model.js';
import { Otp } from './models/Otp.model.js';
import { Category } from './models/Category.model.js';
import { Course } from './models/Course.model.js';
import { Enrollment } from './models/Enrollment.model.js';
import { Transaction } from './models/Transaction.model.js';
import { Question, Note, Announcement } from './models/QuestionNoteMisc.model.js';
import { Conversation } from './models/Conversation.model.js';
import { Message } from './models/Message.model.js';
import crypto from 'crypto';
import { Notification } from './models/Notification.model.js';
import { Appeal } from './models/Appeal.model.js';
import { Review } from './models/Review.model.js';
import { PlatformSettings } from './models/PlatformSettings.model.js';
import { InstitutionApplication } from './models/InstitutionApplication.model.js';
import { ReviewEvent } from './models/ReviewEvent.model.js';
import { Institution } from './models/Institution.model.js';
import { Department } from './models/Department.model.js';
import { InstitutionMember } from './models/InstitutionMember.model.js';
import { Subscription } from './models/Subscription.model.js';
import { Trimester } from './models/Trimester.model.js';
import { Cohort } from './models/Cohort.model.js';
import { LmsLessonProgress } from './models/LmsLessonProgress.model.js';
import { LmsQuizAttempt } from './models/LmsQuizAttempt.model.js';
import { LmsAssignment } from './models/LmsAssignment.model.js';
import { LmsSubmission } from './models/LmsSubmission.model.js';
import { LmsLessonComment } from './models/LmsLessonComment.model.js';
import { LmsLiveSession } from './models/LmsLiveSession.model.js';
import { LmsAttendance } from './models/LmsAttendance.model.js';
import { LmsPoll } from './models/LmsPoll.model.js';
import { LmsChatMessage } from './models/LmsChatMessage.model.js';
import { LmsChannel } from './models/LmsChannel.model.js';
import { LmsPost } from './models/LmsPost.model.js';
import { LmsReply } from './models/LmsReply.model.js';
import { LmsCertificate } from './models/LmsCertificate.model.js';

async function seedDatabase() {
  console.log('\x1b[36m==================================================\x1b[0m');
  console.log('\x1b[36m [SEEDING DATABASE] Gloxad Academy Seed Engine \x1b[0m');
  console.log('\x1b[36m==================================================\x1b[0m');

  // Safety check against production databases
  if (process.env.NODE_ENV === 'production') {
    console.error('\x1b[31m[ERROR] Database seeding is not permitted in production environment!\x1b[0m');
    process.exit(1);
  }

  try {
    // 1. Connect to MongoDB database
    await connectDB();
    console.log('\x1b[32m✔ Database connected\x1b[0m');

    // 2. Sequential Collection Teardown
    await User.deleteMany({});
    await Otp.deleteMany({});
    await Category.deleteMany({});
    await Course.deleteMany({});
    await Enrollment.deleteMany({});
    await Transaction.deleteMany({});
    await Question.deleteMany({});
    await Note.deleteMany({});
    await Announcement.deleteMany({});
    await Conversation.deleteMany({});
    await Message.deleteMany({});
    await Notification.deleteMany({});
    await Appeal.deleteMany({});
    await Review.deleteMany({});
    await PlatformSettings.deleteMany({});
    await InstitutionApplication.deleteMany({});
    await ReviewEvent.deleteMany({});
    await Institution.deleteMany({});
    await Department.deleteMany({});
    await InstitutionMember.deleteMany({});
    await Subscription.deleteMany({});
    await Trimester.deleteMany({});
    await Cohort.deleteMany({});
    await LmsLessonProgress.deleteMany({});
    await LmsQuizAttempt.deleteMany({});
    await LmsAssignment.deleteMany({});
    await LmsSubmission.deleteMany({});
    await LmsLessonComment.deleteMany({});
    await LmsLiveSession.deleteMany({});
    await LmsAttendance.deleteMany({});
    await LmsPoll.deleteMany({});
    await LmsChatMessage.deleteMany({});
    await LmsChannel.deleteMany({});
    await LmsPost.deleteMany({});
    await LmsReply.deleteMany({});
    await LmsCertificate.deleteMany({});
    console.log('\x1b[32m✔ Collections purged\x1b[0m');

    // 3. Pre-hash password for performance
    const plainPassword = 'Password123!';
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    console.log('\x1b[32m✔ Pre-hashed credentials ready\x1b[0m');

    // 4. Create Seed Users
    const adminUser = {
      firstName: 'System',
      lastName: 'Admin',
      name: 'System Admin',
      username: 'admin',
      email: 'admin@gloxad.com',
      password: hashedPassword,
      role: 'admin',
      approvalStatus: 'approved',
      isVerified: true,
      isActive: true,
      bio: 'Platform Lead Administrator',
      biography: 'Platform Lead Administrator',
      expertiseBio: 'Platform Lead Administrator'
    };

    const janeTutor = {
      firstName: 'Jane',
      lastName: 'Tutor',
      name: 'Jane Tutor',
      username: 'janetutor',
      email: 'jane.tutor@gloxad.com',
      password: hashedPassword,
      role: 'instructor',
      approvalStatus: 'approved',
      isVerified: true,
      isActive: true,
      title: 'Senior Fullstack Lead',
      bio: '10+ years building web applications.',
      biography: '10+ years building web applications.',
      expertiseBio: '10+ years building web applications.',
      areaOfExpertise: 'Web Development',
      experienceProofs: ['https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/certifications/jane-degree.pdf'],
      avatarUrl: 'https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/avatars/jane.jpg',
      socials: { github: 'https://github.com/janetutor', twitter: 'https://twitter.com/janetutor' }
    };

    const johnTutor = {
      firstName: 'John',
      lastName: 'Tutor',
      name: 'John Tutor',
      username: 'johntutor',
      email: 'john.tutor@gloxad.com',
      password: hashedPassword,
      role: 'instructor',
      approvalStatus: 'approved',
      isVerified: true,
      isActive: true,
      title: 'Data Science Expert',
      bio: 'Specializing in Python and Machine Learning.',
      biography: 'Specializing in Python and Machine Learning.',
      expertiseBio: 'Specializing in Python and Machine Learning.',
      areaOfExpertise: 'Data Science',
      experienceProofs: ['https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/certifications/john-cert.pdf'],
      avatarUrl: 'https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/avatars/john.jpg'
    };

    const pendingTutor = {
      firstName: 'Pending',
      lastName: 'Tutor',
      name: 'Pending Tutor',
      username: 'pendingtutor',
      email: 'pending.tutor@gloxad.com',
      password: hashedPassword,
      role: 'instructor',
      approvalStatus: 'pending',
      isVerified: false,
      isActive: true,
      title: 'Aspiring Tutor',
      bio: 'Awaiting admin approval.',
      biography: 'Awaiting admin approval.',
      expertiseBio: 'Awaiting admin approval.',
      areaOfExpertise: 'Design & UX',
      experienceProofs: ['https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/certifications/pending-proof.pdf']
    };

    const aliceStudent = {
      firstName: 'Alice',
      lastName: 'Student',
      name: 'Alice Student',
      username: 'alicestudent',
      email: 'alice.student@gloxad.com',
      password: hashedPassword,
      role: 'student',
      approvalStatus: 'approved',
      isVerified: true,
      isActive: true,
      avatarUrl: 'https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/avatars/alice.jpg'
    };

    const bobStudent = {
      firstName: 'Bob',
      lastName: 'Student',
      name: 'Bob Student',
      username: 'bobstudent',
      email: 'bob.student@gloxad.com',
      password: hashedPassword,
      role: 'student',
      approvalStatus: 'approved',
      isVerified: true,
      isActive: true,
      avatarUrl: 'https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/avatars/bob.jpg'
    };

    const insertedUsers = await User.insertMany([
      adminUser,
      janeTutor,
      johnTutor,
      pendingTutor,
      aliceStudent,
      bobStudent
    ]);

    const admin = insertedUsers.find((u) => u.email === 'admin@gloxad.com');
    const jane = insertedUsers.find((u) => u.email === 'jane.tutor@gloxad.com');
    const john = insertedUsers.find((u) => u.email === 'john.tutor@gloxad.com');
    const alice = insertedUsers.find((u) => u.email === 'alice.student@gloxad.com');
    const bob = insertedUsers.find((u) => u.email === 'bob.student@gloxad.com');

    // 5. Create Seed Categories
    const categories = [
      {
        name: 'Web Development',
        slug: 'web-development',
        icon: 'code',
        imageUrl: 'https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/categories/web-dev.jpg',
        order: 1,
        subCategories: [
          { name: 'Frontend', slug: 'frontend', topics: ['React'] },
          { name: 'Backend', slug: 'backend', topics: ['Node.js', 'Express'] }
        ]
      },
      {
        name: 'Data Science',
        slug: 'data-science',
        icon: 'bar-chart',
        imageUrl: 'https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/categories/data-science.jpg',
        order: 2,
        subCategories: [
          { name: 'Machine Learning', slug: 'machine-learning', topics: ['PyTorch'] },
          { name: 'Python', slug: 'python', topics: ['Pandas'] }
        ]
      },
      {
        name: 'Design & UX',
        slug: 'design-ux',
        icon: 'figma',
        imageUrl: 'https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/categories/design-ux.jpg',
        order: 3,
        subCategories: [
          { name: 'Figma', slug: 'figma', topics: ['Prototyping'] },
          { name: 'UI Design', slug: 'ui-design', topics: ['Wireframing'] }
        ]
      }
    ];

    const insertedCategories = await Category.insertMany(categories);

    // 6. Create Seed Courses
    const course1Data = {
      title: 'Fullstack JavaScript Mastery',
      subtitle: 'Master Node.js, Express, and Modern Web APIs',
      slug: 'fullstack-javascript-mastery',
      category: 'Web Development',
      subCategory: 'Backend',
      topic: 'Node.js',
      language: 'English',
      level: 'intermediate',
      courseType: 'paid',
      price: 49.99,
      discountPrice: 39.99,
      thumbnail: 'https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/courses/fs-js-thumb.jpg',
      trailerVideoUrl: 'https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/courses/fs-js-trailer.mp4',
      description: 'Comprehensive guide to backend development with JavaScript and Node.js.',
      skills: ['Node.js', 'Express', 'MongoDB', 'REST APIs'],
      targetAudience: ['Frontend Developers', 'Fullstack Engineers'],
      requirements: ['Basic JavaScript knowledge'],
      status: 'published',
      instructor: jane._id,
      enrolledCount: 1,
      rating: { average: 4.8, count: 12 },
      modules: [
        {
          title: 'Module 1: Introduction & Setup',
          lessons: [
            {
              title: 'Welcome & Setup',
              videoUrl: 'https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/courses/welcome.mp4',
              duration: '05:00',
              isFreePreview: true
            },
            {
              title: 'Node.js Fundamentals',
              videoUrl: 'https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/courses/node-fund.mp4',
              duration: '10:00',
              isFreePreview: false
            }
          ],
          quizzes: []
        },
        {
          title: 'Module 2: Express APIs & Quizzes',
          lessons: [
            {
              title: 'Express Routing',
              videoUrl: 'https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/courses/express-routes.mp4',
              duration: '15:00',
              isFreePreview: false
            },
            {
              title: 'Middleware Deep Dive',
              videoUrl: 'https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/courses/middleware.mp4',
              duration: '20:00',
              isFreePreview: false
            }
          ],
          quizzes: [
            {
              title: 'Express Concepts Quiz',
              passingScore: 70,
              questions: [
                {
                  questionText: 'What is Express?',
                  options: ['Framework', 'Database', 'Browser', 'OS'],
                  correctOptionIndex: 0
                },
                {
                  questionText: 'Which method defines a GET route?',
                  options: ['app.post()', 'app.get()', 'app.fetch()', 'app.put()'],
                  correctOptionIndex: 1
                }
              ]
            }
          ]
        }
      ]
    };

    const course2Data = {
      title: 'Python Data Science Bootcamp',
      subtitle: 'Learn Python, Pandas, and Data Analysis from scratch',
      slug: 'python-data-science-bootcamp',
      category: 'Data Science',
      subCategory: 'Python',
      topic: 'Pandas',
      language: 'English',
      level: 'beginner',
      courseType: 'free',
      price: 0,
      thumbnail: 'https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/courses/py-ds-thumb.jpg',
      description: 'Hands-on intro to Data Science with Python and Pandas.',
      skills: ['Python', 'Pandas', 'Data Analysis'],
      status: 'published',
      instructor: john._id,
      enrolledCount: 1,
      rating: { average: 4.9, count: 8 },
      modules: [
        {
          title: 'Module 1: Python Basics',
          lessons: [
            {
              title: 'Intro to Python',
              videoUrl: 'https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/courses/py-intro.mp4',
              duration: '08:00',
              isFreePreview: true
            },
            {
              title: 'Pandas DataFrames',
              videoUrl: 'https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/courses/pandas.mp4',
              duration: '12:00',
              isFreePreview: true
            }
          ],
          quizzes: [
            {
              title: 'Python Quiz',
              passingScore: 70,
              questions: [
                {
                  questionText: 'What is Pandas?',
                  options: ['Data Analysis library', 'Animal', 'Compiler', 'Game'],
                  correctOptionIndex: 0
                }
              ]
            }
          ]
        }
      ]
    };

    const course3Data = {
      title: 'Figma UI/UX Design Essentials',
      subtitle: 'Design modern web and mobile apps using Figma',
      slug: 'figma-ui-ux-design-essentials',
      category: 'Design & UX',
      subCategory: 'Figma',
      topic: 'Prototyping',
      language: 'English',
      level: 'beginner',
      courseType: 'paid',
      price: 29.99,
      thumbnail: 'https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/courses/figma-thumb.jpg',
      description: 'Master UI/UX prototyping with Figma.',
      skills: ['Figma', 'UI Design', 'Wireframing'],
      status: 'draft',
      instructor: jane._id,
      modules: []
    };

    const course4Data = {
      title: 'Advanced Figma Design Systems',
      subtitle: 'Build production-ready tokenized design systems',
      slug: 'advanced-figma-design-systems',
      category: insertedCategories[2]._id,
      subCategory: 'Figma',
      topic: 'Prototyping',
      language: 'English',
      level: 'intermediate',
      courseType: 'paid',
      price: 39.99,
      thumbnail: 'https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/courses/figma-sys.jpg',
      description: 'Master advanced design systems and tokens.',
      skills: ['Figma', 'Design Systems', 'Tokens'],
      status: 'pending',
      instructor: jane._id,
      modules: []
    };

    const insertedCourses = await Course.insertMany([course1Data, course2Data, course3Data, course4Data]);
    const course1 = insertedCourses[0];
    const course2 = insertedCourses[1];
    const course4 = insertedCourses[3];

    const c1Lesson1Id = course1.modules[0].lessons[0]._id;
    const c1Lesson2Id = course1.modules[0].lessons[1]._id;
    const c2Lesson1Id = course2.modules[0].lessons[0]._id;
    const c2Lesson2Id = course2.modules[0].lessons[1]._id;

    // 7. Create Seed Enrollments & Transactions
    const enrollments = [
      {
        user: alice._id,
        course: course1._id,
        enrolledAt: new Date(),
        completedLessons: [c1Lesson1Id, c1Lesson2Id],
        progressPercentage: 50
      },
      {
        user: bob._id,
        course: course2._id,
        enrolledAt: new Date(),
        completedLessons: [c2Lesson1Id, c2Lesson2Id],
        progressPercentage: 100,
        isCompleted: true,
        completedAt: new Date(),
        certificateId: 'CERT-SEED-BOB-001'
      }
    ];

    const insertedEnrollments = await Enrollment.insertMany(enrollments);

    const transactions = [
      {
        reference: 'SEED_REF_1001',
        user: alice._id,
        course: course1._id,
        amount: 49.99,
        currency: 'NGN',
        status: 'success',
        instructorShare: 34.99,
        platformShare: 15.00,
        gatewayResponse: { status: 'success', message: 'Seed transaction' }
      },
      {
        reference: 'SEED_REF_1002',
        user: bob._id,
        course: course2._id,
        amount: 0,
        currency: 'NGN',
        status: 'success',
        instructorShare: 0,
        platformShare: 0,
        gatewayResponse: { status: 'success', message: 'Free course enrollment' }
      }
    ];

    const insertedTransactions = await Transaction.insertMany(transactions);

    // 8. Create Seed Conversations & Messages
    const groupConv = {
      isGroup: true,
      courseId: course1._id,
      participants: [jane._id, alice._id, bob._id]
    };

    const directConv = {
      isGroup: false,
      participants: [jane._id, alice._id]
    };

    const insertedConversations = await Conversation.insertMany([groupConv, directConv]);
    const groupConvDoc = insertedConversations[0];
    const directConvDoc = insertedConversations[1];

    const messages = [
      {
        conversationId: directConvDoc._id,
        sender: jane._id,
        text: 'Hi Alice, welcome to Fullstack JavaScript Mastery!',
        readBy: [jane._id, alice._id]
      },
      {
        conversationId: directConvDoc._id,
        sender: alice._id,
        text: 'Thanks Jane! Excited to start learning.',
        readBy: [jane._id, alice._id]
      },
      {
        conversationId: groupConvDoc._id,
        sender: jane._id,
        text: 'Welcome everyone to the course channel!',
        readBy: [jane._id]
      },
      {
        conversationId: groupConvDoc._id,
        sender: alice._id,
        text: 'Hello everyone!',
        readBy: [alice._id]
      }
    ];

    const insertedMessages = await Message.insertMany(messages);

    await Conversation.findByIdAndUpdate(directConvDoc._id, { lastMessage: insertedMessages[1]._id });
    await Conversation.findByIdAndUpdate(groupConvDoc._id, { lastMessage: insertedMessages[3]._id });

    // 9. Create Seed Notifications
    const notifications = [
      {
        recipient: alice._id,
        title: 'Welcome to Gloxad Academy',
        message: 'Welcome to the platform! Explore our catalog and start learning.',
        type: 'system_broadcast',
        read: false
      },
      {
        recipient: jane._id,
        title: 'Course Published',
        message: 'Your course "Fullstack JavaScript Mastery" is live on Gloxad Academy.',
        type: 'course_update',
        read: true
      }
    ];

    const insertedNotifications = await Notification.insertMany(notifications);

    // 10. Create Seed Platform Settings
    const platformSettings = await PlatformSettings.create({
      allowSignups: true,
      allowPasswordReset: true,
      deletionGraceDays: 30,
      signatureUrl: 'https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/signatures/dean-signature.png'
    });

    // 11. Create Seed Course Reviews
    const reviews = [
      {
        course: course1._id,
        student: alice._id,
        rating: 5,
        comment: 'Exceptional course! Very clear and easy to follow.',
        tutorReply: {
          comment: 'Thank you Alice! Keep building amazing projects.',
          createdAt: new Date()
        }
      },
      {
        course: course2._id,
        student: bob._id,
        rating: 5,
        comment: 'The Pandas section was thorough and well structured.',
        tutorReply: {
          comment: '',
          createdAt: null
        }
      }
    ];

    const insertedReviews = await Review.insertMany(reviews);
    await Review.recalculateCourseRating(course1._id);
    await Review.recalculateCourseRating(course2._id);

    // 12. Create Seed Partner Applications
    const applications = [
      {
        referenceId: "GLX-2026-1001",
        institutionName: "Apex Institute of Technology",
        type: "Technical College",
        website: "https://apextech.edu",
        address: {
          line1: "42 Innovation Boulevard",
          city: "Lagos",
          country: "NG"
        },
        representative: {
          name: "Dr. Sarah Adams",
          role: "Academic Dean",
          email: "sarah.adams@apextech.edu",
          phone: "+2348012345678"
        },
        expectedStudents: "1,000 - 2,500",
        expectedStudentsCount: 1800,
        requestedFeatures: "LMS, WebRTC Classrooms, API Access",
        message: "We would like to partner with Gloxad Academy for our upcoming engineering semester.",
        documents: [
          {
            name: "Apex_Accreditation.pdf",
            key: "documents/seed-apex-accreditation.pdf",
            size: 1048576,
            verifiedAt: null
          }
        ],
        status: "pending",
        plan: "Enterprise",
        accessCode: "APX101",
        submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      },
      {
        referenceId: "GLX-2026-1002",
        institutionName: "Horizon Vocational Academy",
        type: "Vocational School",
        website: "https://horizon.edu.ng",
        address: {
          line1: "15 Marina Way",
          city: "Abuja",
          country: "NG"
        },
        representative: {
          name: "Marcus Vance",
          role: "Director of Studies",
          email: "marcus.vance@horizon.edu.ng",
          phone: "+2348098765432"
        },
        expectedStudents: "500 - 1,000",
        expectedStudentsCount: 750,
        requestedFeatures: "Automated Certificate Issuance",
        message: "Requesting onboarding for our vocational training programs.",
        documents: [
          {
            name: "Horizon_License.pdf",
            key: "documents/seed-horizon-license.pdf",
            size: 524288,
            verifiedAt: null
          }
        ],
        status: "under_review",
        plan: "Premium",
        accessCode: "HRZ202",
        submittedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      },
      {
        referenceId: "GLX-2026-1003",
        institutionName: "Heritage Maritime University",
        type: "Private University",
        website: "https://heritagemaritime.edu",
        address: {
          line1: "8 Harbor View Drive",
          city: "Port Harcourt",
          country: "NG"
        },
        representative: {
          name: "Capt. David Cole",
          role: "Registrar",
          email: "david.cole@heritagemaritime.edu",
          phone: "+2348033334444"
        },
        expectedStudents: "2,500 - 5,000",
        expectedStudentsCount: 3200,
        requestedFeatures: "Full Campus Isolation and White-Label LMS",
        message: "Full enterprise workspace requested for maritime studies.",
        documents: [
          {
            name: "Heritage_Federal_Charter.pdf",
            key: "documents/seed-heritage-charter.pdf",
            size: 2097152,
            verifiedAt: new Date()
          }
        ],
        status: "approved",
        plan: "Enterprise",
        accessCode: "HRT303",
        submittedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        reviewedBy: admin._id,
        updatedBy: "System Admin"
      },
      {
        referenceId: "GLX-2026-1004",
        institutionName: "Nova Online College",
        type: "Online University",
        website: "https://novacollege.com",
        address: {
          line1: "100 Virtual Boulevard",
          city: "Accra",
          country: "GH"
        },
        representative: {
          name: "Alan Miller",
          role: "Admissions Head",
          email: "alan.miller@novacollege.com",
          phone: "+233201112222"
        },
        expectedStudents: "100 - 500",
        expectedStudentsCount: 250,
        requestedFeatures: "Course Quizzes only",
        message: "Looking for an external LMS for short courses.",
        documents: [],
        status: "rejected",
        plan: "Premium",
        accessCode: "NOV404",
        submittedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        reviewedBy: admin._id,
        updatedBy: "System Admin"
      }
    ];

    const insertedApps = await InstitutionApplication.insertMany(applications);

    // 13. Create Seed Institutions, Departments, Members & Subscriptions
    const approvedApp = insertedApps.find(a => a.status === "approved");
    const underReviewApp = insertedApps.find(a => a.status === "under_review");
    const rejectedApp = insertedApps.find(a => a.status === "rejected");

    const seedToken = "seed_activation_token_1234567890abcdef1234567890abcdef";
    const hashedSeedToken = crypto.createHash("sha256").update(seedToken).digest("hex");

    // A. Pending Activation Institution (ready to test activation flow)
    const pendingInstitution = await Institution.create({
      name: approvedApp.institutionName,
      slug: "heritage-maritime-university",
      logoUrl: "logos/heritage-maritime-logo.png",
      branding: {
        displayName: "Heritage Maritime University",
        color: "#1E3A8A",
        tagline: "Excellence in Oceanic Leadership"
      },
      plan: "Enterprise",
      billing: "monthly",
      status: "pending_activation",
      representativeEmail: approvedApp.representative.email,
      applicationId: approvedApp._id,
      activationToken: hashedSeedToken,
      activationExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      activationUsed: false,
      seatLimit: 5000,
      onboarding: { currentStep: 1, completedSteps: [] }
    });

    // B. Expired Token Institution (ready to test 410 TOKEN_EXPIRED)
    const expiredToken = "expired_token_test_1234567890abcdef";
    const hashedExpiredToken = crypto.createHash("sha256").update(expiredToken).digest("hex");
    await Institution.create({
      name: "St. Jude Classical Academy",
      slug: "st-jude-classical-academy",
      logoUrl: "logos/st-jude-logo.png",
      branding: { displayName: "St. Jude Academy", color: "#DC2626", tagline: "Knowledge & Faith" },
      plan: "Premium",
      billing: "monthly",
      status: "pending_activation",
      representativeEmail: "stjude.rep@stjude.edu",
      applicationId: underReviewApp._id,
      activationToken: hashedExpiredToken,
      activationExpiresAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // Expired 2 days ago
      activationUsed: false,
      seatLimit: 500
    });

    // C. Fully Activated Workspace (Apex Technical University)
    const activeInstitution = await Institution.create({
      name: "Apex Technical University",
      slug: "apex-technical-university",
      logoUrl: "logos/apex-tech-logo.png",
      branding: {
        displayName: "Apex Tech Portal",
        color: "#4F46E5",
        tagline: "Empowering Tomorrow's Engineers"
      },
      plan: "Premium",
      billing: "annual",
      status: "active",
      representativeEmail: "sarah.conner@apextech.edu",
      applicationId: rejectedApp._id,
      activationToken: crypto.createHash("sha256").update("already_used_token_12345").digest("hex"),
      activationExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      activationUsed: true,
      seatLimit: 500,
      onboarding: { currentStep: 6, completedSteps: [1, 2, 3, 4, 5, 6] }
    });

    // D. Institution Admin User for Apex Tech
    const instAdminUser = await User.create({
      firstName: "Dr. Sarah",
      lastName: "Conner",
      name: "Dr. Sarah Conner",
      username: "sarahconner",
      email: "sarah.conner@apextech.edu",
      password: plainPassword,
      role: "institution_admin",
      institutionId: activeInstitution._id,
      isVerified: true,
      approvalStatus: "approved",
      isActive: true,
      title: "Dean of Academic Technology",
      bio: "Academic administrator leading institutional tech programs."
    });

    activeInstitution.adminUserId = instAdminUser._id;
    await activeInstitution.save();

    // E. Seed Departments for Apex Tech
    const deptCse = await Department.create({
      institutionId: activeInstitution._id,
      name: "Computer Science & Engineering",
      code: "CSE-100",
      faculty: "Faculty of Technology",
      headName: "Prof. David Miller",
      description: "Undergraduate & Graduate Computer Science Programs"
    });

    const deptEe = await Department.create({
      institutionId: activeInstitution._id,
      name: "Electrical & Electronics Engineering",
      code: "EEE-101",
      faculty: "Faculty of Technology",
      headName: "Dr. Eleanor Vance",
      description: "Department of Electrical & Systems Engineering"
    });

    // F. Seed Members for Apex Tech
    const memberTutor = await InstitutionMember.create({
      institutionId: activeInstitution._id,
      role: "tutor",
      name: "Dr. Grace Hopper",
      email: "ghopper@apextech.edu",
      departmentIds: [deptCse._id],
      designation: "Senior Lecturer",
      inviteStatus: "accepted",
      userId: jane._id
    });

    const memberStudent = await InstitutionMember.create({
      institutionId: activeInstitution._id,
      role: "student",
      name: "Alex River",
      email: "alex.student@apextech.edu",
      departmentIds: [deptCse._id],
      inviteStatus: "accepted",
      userId: alice._id
    });

    // G. Seed Active Subscription for Apex Tech
    const seedSubscription = await Subscription.create({
      institutionId: activeInstitution._id,
      plan: "Premium",
      billing: "annual",
      currency: "USD",
      amountGross: 2988,
      discount: 597.6,
      amountTotal: 2390.4,
      status: "active",
      provider: "paystack",
      providerReference: "PAYSTACK_SUB_SEED_001",
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      invoices: [
        {
          invoiceId: "INV-SEED-2026-001",
          amount: 2390.4,
          currency: "USD",
          paidAt: new Date(),
          status: "paid",
          receiptUrl: "https://checkout.paystack.com/receipts/mock_receipt_001.pdf"
        }
      ]
    });

    const reviewEvents = [
      {
        applicationId: approvedApp._id,
        actorId: admin._id,
        actorName: "System Admin",
        action: "approve",
        from: "under_review",
        to: "approved",
        note: "Verified Federal Charter accreditation. Enterprise tier approved.",
        createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000)
      },
      {
        applicationId: underReviewApp._id,
        actorId: admin._id,
        actorName: "System Admin",
        action: "request_info",
        from: "pending",
        to: "under_review",
        note: "Please provide updated state vocational council certification.",
        createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
      },
      {
        applicationId: rejectedApp._id,
        actorId: admin._id,
        actorName: "System Admin",
        action: "reject",
        from: "pending",
        to: "rejected",
        note: "Does not meet minimum student body accreditation threshold.",
        createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      }
    ];

    const insertedEvents = await ReviewEvent.insertMany(reviewEvents);

    // 14. Seed Trimester LMS Core (Cohorts, Curriculum, Quizzes & Assignments)
    const activeTrimester = await Trimester.create({
      number: 1,
      title: "Trimester 1 - 2026",
      startDate: new Date("2026-01-15"),
      endDate: new Date("2026-04-15"),
      weeks: 12,
      enrollmentClosesAt: new Date("2026-01-30"),
      status: "active"
    });

    const upcomingTrimester = await Trimester.create({
      number: 2,
      title: "Trimester 2 - 2026",
      startDate: new Date("2026-05-01"),
      endDate: new Date("2026-08-01"),
      weeks: 12,
      enrollmentClosesAt: new Date("2026-05-15"),
      status: "upcoming"
    });

    const cohortAlpha = await Cohort.create({
      name: "Cohort Alpha - Fullstack JS",
      courseId: course1._id,
      trimesterId: activeTrimester._id,
      instructorIds: [jane._id],
      studentIds: [alice._id, bob._id],
      capacity: 50,
      timezone: "Africa/Lagos",
      currentWeek: 1,
      status: "active"
    });

    const cohortBeta = await Cohort.create({
      name: "Cohort Beta - Data Science",
      courseId: course2._id,
      trimesterId: upcomingTrimester._id,
      instructorIds: [jane._id],
      studentIds: [alice._id, bob._id],
      capacity: 50,
      timezone: "Africa/Lagos",
      currentWeek: 1,
      status: "enrolling"
    });

    const seedLessonProgress = await LmsLessonProgress.create({
      cohortId: cohortAlpha._id,
      userId: alice._id,
      lessonId: c1Lesson1Id,
      moduleId: course1.modules[0]._id,
      status: "completed",
      watchedSeconds: 300,
      objectivesDone: ["Master fundamental concepts of Welcome & Setup"],
      completedAt: new Date()
    });

    const quiz1 = course1.modules[1]?.quizzes[0];
    let seedQuizAttempt = null;
    if (quiz1) {
      seedQuizAttempt = await LmsQuizAttempt.create({
        cohortId: cohortAlpha._id,
        quizId: quiz1._id,
        userId: alice._id,
        attemptNumber: 1,
        startedAt: new Date(Date.now() - 3600000),
        expiresAt: new Date(Date.now() - 2700000),
        status: "submitted",
        score: 2,
        total: 2,
        percent: 100,
        passed: true,
        submittedAt: new Date(Date.now() - 3000000),
        answers: [
          {
            questionId: quiz1.questions[0]._id,
            optionId: "0",
            flagged: false,
            checkedAt: new Date(),
            isCorrect: true
          },
          {
            questionId: quiz1.questions[1]._id,
            optionId: "1",
            flagged: false,
            checkedAt: new Date(),
            isCorrect: true
          }
        ]
      });
    }

    const assignment1 = await LmsAssignment.create({
      cohortId: cohortAlpha._id,
      moduleId: course1.modules[0]._id,
      title: "Week 1 Project: Node.js Backend Server",
      summary: "Build an Express REST server with health checks",
      description: "Implement a fully functional Node.js server with routes and error handling. Submit GitHub URL or ZIP archive.",
      dueAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      rubric: [
        { criterion: "Architecture & Clean Code", points: 50 },
        { criterion: "Error Handling & Tests", points: 50 }
      ],
      maxFileMB: 50,
      allowedTypes: ["zip", "pdf"],
      allowRepoLink: true,
      allowLate: true,
      latePenaltyPercent: 5
    });

    const assignment2 = await LmsAssignment.create({
      cohortId: cohortAlpha._id,
      moduleId: course1.modules[1]._id,
      title: "Week 2 Project: Express Middleware Pipeline",
      summary: "Build custom middleware stack with auth and logging",
      description: "Implement JWT auth middleware and custom rate limiter.",
      dueAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      rubric: [{ criterion: "Middleware Design", points: 100 }],
      allowRepoLink: true,
      allowLate: true
    });

    const submission1 = await LmsSubmission.create({
      assignmentId: assignment1._id,
      cohortId: cohortAlpha._id,
      userId: alice._id,
      repoUrl: "https://github.com/alice-student/express-backend-project",
      comment: "Here is my week 1 project repository",
      submittedAt: new Date(),
      isLate: false,
      status: "pending_review"
    });

    const comment1 = await LmsLessonComment.create({
      lessonId: c1Lesson1Id,
      cohortId: cohortAlpha._id,
      userId: alice._id,
      authorRole: "student",
      body: "Loved the breakdown of asynchronous event loops in this lesson!",
      likes: [jane._id]
    });

    const reply1 = await LmsLessonComment.create({
      lessonId: c1Lesson1Id,
      cohortId: cohortAlpha._id,
      userId: jane._id,
      authorRole: "instructor",
      body: "Glad to hear that, Alice! Let me know if you have questions on promises.",
      parentId: comment1._id
    });

    // 15. LMS Live Sessions, Attendance & Real-Time Classroom
    const liveSession1 = await LmsLiveSession.create({
      cohortId: cohortAlpha._id,
      title: "Architecture Deep Dive & Live Q&A",
      description: "Comprehensive live review of microservices, WebRTC streaming, and event loop architecture.",
      instructorId: jane._id,
      startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
      status: "scheduled",
      provider: "livekit",
      roomName: `cohort-${cohortAlpha._id}-session-1`,
    });

    const liveSessionPast = await LmsLiveSession.create({
      cohortId: cohortAlpha._id,
      title: "Cohort Kickoff & Live Orientation",
      description: "Welcome to Trimester 1! Setting up dev environment and cohort expectations.",
      instructorId: jane._id,
      startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() - 22 * 60 * 60 * 1000),
      status: "ended",
      provider: "livekit",
      roomName: `cohort-${cohortAlpha._id}-session-0`,
    });

    await LmsAttendance.create({
      sessionId: liveSessionPast._id,
      cohortId: cohortAlpha._id,
      userId: alice._id,
      status: "present",
      joinedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      leftAt: new Date(Date.now() - 22 * 60 * 60 * 1000),
      durationMinutes: 120,
    });

    await LmsPoll.create({
      sessionId: liveSession1._id,
      question: "Which state management pattern do you prefer for WebRTC signaling?",
      options: ["Socket.io Namespaces", "Server-Sent Events (SSE)", "Peer-to-peer Data Channels"],
      status: "open",
      votes: [{ userId: alice._id, optionIndex: 0 }],
    });

    await LmsChatMessage.create({
      sessionId: liveSession1._id,
      authorId: jane._id,
      authorName: "Jane Doe",
      authorRole: "instructor",
      text: "Welcome everyone! Please verify your mic and webcam before we begin.",
    });

    // 16. LMS Community Channels, Posts & Replies
    const channelGeneral = await LmsChannel.create({
      cohortId: cohortAlpha._id,
      name: "General",
      slug: "general",
      postCount: 1,
      isNew: false,
    });
    await LmsChannel.create({
      cohortId: cohortAlpha._id,
      name: "Q&A",
      slug: "qa",
      postCount: 0,
      isNew: false,
    });
    await LmsChannel.create({
      cohortId: cohortAlpha._id,
      name: "Project Showcase",
      slug: "project-showcase",
      postCount: 0,
      isNew: false,
    });
    await LmsChannel.create({
      cohortId: cohortAlpha._id,
      name: "Study Groups",
      slug: "study-groups",
      postCount: 0,
      isNew: false,
    });

    const post1 = await LmsPost.create({
      cohortId: cohortAlpha._id,
      channelId: channelGeneral._id,
      authorId: alice._id,
      tag: "Discussion",
      title: "Excited to collaborate with everyone in Cohort Alpha!",
      body: "Hey everyone! I just finished the week 1 assignments and look forward to the live lecture today.",
      likes: [jane._id],
      likesCount: 1,
      repliesCount: 1,
      isReported: false,
      isDeleted: false,
    });

    await LmsReply.create({
      postId: post1._id,
      authorId: jane._id,
      body: "Welcome Alice! Don't hesitate to post any questions here.",
    });

    // 17. LMS Verifiable Certificate
    await LmsCertificate.create({
      certificateId: "GLX-CERT-9A8B7C6D5E4F",
      userId: alice._id,
      cohortId: cohortAlpha._id,
      courseId: course1._id,
      title: course1.title || "Full-Stack Web Development Mastery",
      subtitle: "Full-Stack Web Development",
      badge: "Gloxad Certified",
      pdfKey: "certificates/GLX-CERT-9A8B7C6D5E4F.pdf",
      issuedAt: new Date(),
    });

    // 18. Print Visual Summary Table
    console.log('\x1b[32m✔ Seed data generated & inserted successfully!\x1b[0m\n');
    console.log('+--------------------------+-------+');
    console.log('| Entity                   | Count |');
    console.log('+--------------------------+-------+');
    console.log(`| Users                    | ${insertedUsers.length.toString().padEnd(5)} |`);
    console.log(`| Categories               | ${insertedCategories.length.toString().padEnd(5)} |`);
    console.log(`| Courses                  | ${insertedCourses.length.toString().padEnd(5)} |`);
    console.log(`| Enrollments              | ${insertedEnrollments.length.toString().padEnd(5)} |`);
    console.log(`| Transactions             | ${insertedTransactions.length.toString().padEnd(5)} |`);
    console.log(`| Messages                 | ${insertedMessages.length.toString().padEnd(5)} |`);
    console.log(`| Conversations            | ${insertedConversations.length.toString().padEnd(5)} |`);
    console.log(`| Notifications            | ${insertedNotifications.length.toString().padEnd(5)} |`);
    console.log(`| Reviews                  | ${insertedReviews.length.toString().padEnd(5)} |`);
    console.log(`| Platform Settings        | 1     |`);
    console.log(`| Partner Applications     | ${insertedApps.length.toString().padEnd(5)} |`);
    console.log(`| Review Events            | ${insertedEvents.length.toString().padEnd(5)} |`);
    console.log(`| Institutions             | 3     |`);
    console.log(`| Departments              | 2     |`);
    console.log(`| Institution Members      | 2     |`);
    console.log(`| Subscriptions            | 1     |`);
    console.log(`| Trimesters               | 2     |`);
    console.log(`| Cohorts                  | 2     |`);
    console.log(`| LMS Lesson Progress      | 1     |`);
    console.log(`| LMS Quiz Attempts        | 1     |`);
    console.log(`| LMS Assignments          | 2     |`);
    console.log(`| LMS Submissions          | 1     |`);
    console.log(`| LMS Comments & Replies   | 2     |`);
    console.log(`| LMS Live Sessions        | 2     |`);
    console.log(`| LMS Attendance           | 1     |`);
    console.log(`| LMS Polls & Chat         | 2     |`);
    console.log(`| LMS Community Channels   | 4     |`);
    console.log(`| LMS Posts & Replies      | 2     |`);
    console.log(`| LMS Certificates         | 1     |`);
    console.log('+--------------------------+-------+\n');

    console.log('\x1b[32m[SEED SUCCESS] Database seeding completed cleanly!\x1b[0m');
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('\x1b[31m[ERROR] Database seeding failed:\x1b[0m', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

seedDatabase();
