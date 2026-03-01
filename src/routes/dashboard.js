import express from 'express';
import { param } from 'express-validator';
import { authMiddleware, roleMiddleware } from '../middlewares/auth.js';
import {
  obtenerEstadisticas,
  obtenerEstadisticasDoctor
} from '../controllers/dashboard.js';

const router = express.Router();

// ============================================================================
// RUTAS
// ============================================================================

/**
 * GET /api/dashboard
 * Obtener estadísticas generales del sistema
 * - Total de pacientes activos
 * - Turnos hoy (pendientes y confirmados)
 * - Turnos atendidos hoy
 * - Turnos cancelados/ausentes hoy
 * - Pacientes nuevos este mes
 * - Tasa de completitud
 * - Doctores con más turnos hoy
 * Roles: admin, doctor
 */
router.get(
  '/',
  authMiddleware,
  roleMiddleware(['admin', 'doctor']),
  obtenerEstadisticas
);

/**
 * GET /api/dashboard/doctor/:doctor_id
 * Obtener estadísticas específicas de un doctor
 * - Turnos del doctor hoy
 * - Turnos atendidos hoy
 * - Total de pacientes atendidos
 * - Tasa de completitud
 * - Próximos turnos
 * Roles: admin, doctor
 */
router.get(
  '/doctor/:doctor_id',
  authMiddleware,
  roleMiddleware(['admin', 'doctor']),
  param('doctor_id').isNumeric().withMessage('ID del doctor debe ser un número válido'),
  obtenerEstadisticasDoctor
);

export default router;
