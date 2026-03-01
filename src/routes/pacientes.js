import express from 'express';
import { body, param, query } from 'express-validator';
import { authMiddleware } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permissions.js';
import {
  crearPaciente,
  obtenerPacientes,
  obtenerPaciente,
  actualizarPaciente,
  eliminarPaciente
} from '../controllers/pacientes.js';

const router = express.Router();

// ============================================================================
// VALIDADORES REUTILIZABLES
// ============================================================================

const validarCrearPaciente = [
  body('dni')
    .notEmpty().withMessage('DNI es requerido')
    .isLength({ min: 5, max: 20 }).withMessage('DNI debe tener entre 5 y 20 caracteres'),
  body('fecha_nacimiento')
    .notEmpty().withMessage('Fecha de nacimiento es requerida')
    .isISO8601().withMessage('Fecha inválida'),
  body('genero')
    .notEmpty().withMessage('Género es requerido')
    .isIn(['masculino', 'femenino', 'otro']).withMessage('Género inválido'),
  body('numero_emergencia')
    .optional()
    .isLength({ min: 10, max: 20 }).withMessage('Número de emergencia inválido'),
  body('contacto_emergencia')
    .optional()
    .isLength({ min: 5, max: 255 }).withMessage('Contacto de emergencia inválido')
];

const validarActualizarPaciente = [
  body('numero_emergencia')
    .optional()
    .isLength({ min: 10, max: 20 }).withMessage('Número de emergencia inválido'),
  body('contacto_emergencia')
    .optional()
    .isLength({ min: 5, max: 255 }).withMessage('Contacto de emergencia inválido')
];

// ============================================================================
// RUTAS
// ============================================================================

/**
 * POST /api/pacientes
 * Crear nuevo paciente
 * Roles: doctor, secretaria
 */
router.post(
  '/',
  authMiddleware,
  checkPermission('pacientes', 'create'),
  validarCrearPaciente,
  crearPaciente
);

/**
 * GET /api/pacientes
 * Obtener lista de pacientes con paginación y búsqueda
 * Roles: admin, doctor, secretaria
 */
router.get(
  '/',
  authMiddleware,
  checkPermission('pacientes', 'read'),
  obtenerPacientes
);

/**
 * GET /api/pacientes/:id
 * Obtener paciente específico con su historial de turnos e historias clínicas
 * Roles: admin, doctor, secretaria
 */
router.get(
  '/:id',
  authMiddleware,
  checkPermission('pacientes', 'read'),
  param('id').isNumeric().withMessage('ID debe ser un número válido'),
  obtenerPaciente
);

/**
 * PUT /api/pacientes/:id
 * Actualizar datos del paciente
 * Roles: admin, doctor, secretaria
 */
router.put(
  '/:id',
  authMiddleware,
  checkPermission('pacientes', 'update'),
  param('id').isNumeric().withMessage('ID debe ser un número válido'),
  validarActualizarPaciente,
  actualizarPaciente
);

/**
 * DELETE /api/pacientes/:id
 * Eliminar paciente (soft delete)
 * Roles: admin
 */
router.delete(
  '/:id',
  authMiddleware,
  checkPermission('pacientes', 'delete'),
  param('id').isNumeric().withMessage('ID debe ser un número válido'),
  eliminarPaciente
);

export default router;
