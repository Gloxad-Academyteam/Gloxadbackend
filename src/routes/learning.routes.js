import express from 'express';
import { authGuard } from '../middlewares/auth.middleware.js';
import { roleGuard } from '../middlewares/role.middleware.js';
import { checkEnrollment } from '../middlewares/enrollment.middleware.js';
import {
  updateProgressController,
  submitQuizController,
  getQuestionsController,
  createQuestionController,
  replyQuestionController,
  getNotesController,
  createNoteController,
  deleteNoteController,
  getAnnouncementsController,
  createAnnouncementController,
  getCertificateController,
  verifyCertificateController,
} from '../controllers/learning.controller.js';
import {
  getModuleLockStates,
  getModuleTask,
  submitModuleTask,
} from '../controllers/moduleLearning.controller.js';

const router = express.Router();

// Public certificate verification route
router.get('/verify-certificate/:certificateId', verifyCertificateController);

// Sequential module lock state & tasks
router.get('/:courseId/modules', authGuard, checkEnrollment, getModuleLockStates);
router.get('/:courseId/modules/:moduleId/task', authGuard, checkEnrollment, getModuleTask);
router.post('/:courseId/modules/:moduleId/task', authGuard, checkEnrollment, submitModuleTask);

// Lesson progress tracking
router.post('/:courseId/progress', authGuard, checkEnrollment, updateProgressController);

// Server-side quiz submission & grading
router.post('/:courseId/quiz/:quizId/submit', authGuard, checkEnrollment, submitQuizController);

// Course Q&A discussion board
router.get('/:courseId/questions', authGuard, checkEnrollment, getQuestionsController);
router.post('/:courseId/questions', authGuard, checkEnrollment, createQuestionController);
router.post(
  '/:courseId/questions/:questionId/reply',
  authGuard,
  checkEnrollment,
  replyQuestionController
);

// Private student notes
router.get('/:courseId/notes', authGuard, checkEnrollment, getNotesController);
router.post('/:courseId/notes', authGuard, checkEnrollment, createNoteController);
router.delete('/:courseId/notes/:noteId', authGuard, checkEnrollment, deleteNoteController);

// Course announcements
router.get('/:courseId/announcements', authGuard, checkEnrollment, getAnnouncementsController);
router.post(
  '/:courseId/announcements',
  authGuard,
  roleGuard('instructor', 'admin'),
  checkEnrollment,
  createAnnouncementController
);

// Completion certificate
router.get('/:courseId/certificate', authGuard, checkEnrollment, getCertificateController);

export default router;
