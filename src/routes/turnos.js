import express from 'express';
import { body, param, query } from 'express-validator';
import { authMiddleware } from '../middlewares/auth.js';
import { checkPermission, requireSecretariaOrDoctor } from '../middlewares/permissions.js';
import {
  crearTurno,
  obtenerTurnos,
  obtenerSiguienteTurno,
  cambiarEstadoTurno,
  obtenerTurno,
  eliminarTurno,
  obtenerTurnosAgenda,
  obtenerConsultaActiva
} from '../controllers/turnos.js';

const router = express.Router();

// ============================================================================
// VALIDADORES REUTILIZABLES
// ============================================================================

const validarCrearTurno = [
  body('persona_id')
    .notEmpty().withMessage('ID de la persona es requerido')
    .isNumeric().withMessage('ID de la persona debe ser un número válido'),
  body('doctor_id')
    .notEmpty().withMessage('ID del doctor es requerido')
    .isNumeric().withMessage('ID del doctor debe ser un número válido'),
  body('fecha_hora')
    .notEmpty().withMessage('Fecha y hora son requeridas')
    .isISO8601().withMessage('Fecha y hora inválidas'),
  body('duracion_minutos')
    .optional()
    .isInt({ min: 15, max: 480 }).withMessage('Duración debe ser entre 15 y 480 minutos'),
  body('motivo')
    .optional()
    .isLength({ min: 5, max: 500 }).withMessage('Motivo debe tener entre 5 y 500 caracteres')
];

const validarCambiarEstado = [
  body('estado')
    .notEmpty().withMessage('Nuevo estado es requerido')
    .isIn(['PENDIENTE', 'CONFIRMADO', 'EN_CONSULTA', 'COMPLETA', 'SUSPENDIDA', 'CANCELADA', 'NO_PRESENTADO', 'ATENDIDO', 'AUSENTE'])
    .withMessage('Estado inválido')
];

// ============================================================================
// RUTAS
// ============================================================================

/**
 * POST /api/turnos
 * Crear nuevo turno
 * Roles: doctor, secretaria
 */
router.post(
  '/',
  authMiddleware,
  checkPermission('turnos', 'create'),
  validarCrearTurno,
  crearTurno
);

/**
 * GET /api/turnos
 * Obtener lista de turnos con filtros y paginación
 * Roles: doctor, secretaria
 */
router.get(
  '/',
  authMiddleware,
  checkPermission('turnos', 'read'),
  obtenerTurnos
);

/**
 * GET /api/turnos/consulta-activa
 * Obtener la consulta activa actual del doctor
 * Permite verificar si hay una consulta EN_CONSULTA activa
 * Roles: doctor
 */
router.get(
  '/consulta-activa',
  authMiddleware,
  obtenerConsultaActiva
);

/**
 * GET /api/turnos/siguiente
 * Obtener siguiente turno pendiente o confirmado
 * IMPORTANTE: Esta ruta debe ir ANTES de /:id para evitar conflicto
 * Roles: doctor, secretaria
 */
router.get(
  '/siguiente',
  authMiddleware,
  checkPermission('turnos', 'read'),
  obtenerSiguienteTurno
);

/**
 * GET /api/turnos/agenda
 * Obtener turnos en formato de agenda/calendario
 * Query params: inicio, fin, medico_id
 * IMPORTANTE: Esta ruta debe ir ANTES de /:id para evitar conflicto
 * Roles: doctor, secretaria, admin
 */
router.get(
  '/agenda',
  authMiddleware,
  checkPermission('turnos', 'read'),
  obtenerTurnosAgenda
);

/**
 * GET /api/turnos/dashboard
 * Obtener turnos para dashboard (sin permisos estrictos)
 * Query params: inicio, fin
 */
router.get(
  '/dashboard',
  authMiddleware,
  obtenerTurnosAgenda
);

/**
 * GET /api/turnos/:id
 * Obtener turno específico
 * Roles: doctor, secretaria
 */
router.get(
  '/:id',
  authMiddleware,
  checkPermission('turnos', 'read'),
  param('id').isNumeric().withMessage('ID debe ser un número válido'),
  obtenerTurno
);

/**
 * PATCH /api/turnos/:id/estado
 * Cambiar estado del turno
 * Roles: admin, doctor
 */
router.patch(
  '/:id/estado',
  authMiddleware,
  checkPermission('turnos', 'update'),
  param('id').isNumeric().withMessage('ID debe ser un número válido'),
  validarCambiarEstado,
  cambiarEstadoTurno
);

/**
 * DELETE /api/turnos/:id
 * Eliminar turno (solo si estado es pendiente)
 * Roles: secretaria
 */
router.delete(
  '/:id',
  authMiddleware,
  checkPermission('turnos', 'delete'),
  param('id').isNumeric().withMessage('ID debe ser un número válido'),
  eliminarTurno
);

export default router;
