import express from 'express';
import { body, param, query } from 'express-validator';
import { authMiddleware } from '../middlewares/auth.js';
import { checkPermission, requireSecretariaOrDoctor } from '../middlewares/permissions.js';
import {
  agendarTurno,
  crearTurno,
  obtenerTurnos,
  obtenerSiguienteTurno,
  cambiarEstadoTurno,
  obtenerTurno,
  eliminarTurno,
  obtenerTurnosAgenda,
  obtenerConsultaActiva,
  obtenerTurnosDePersona,
  obtenerTurnosDePaciente,
  confirmarLlegada
} from '../controllers/turnos.js';
import { agendarTurno as agendarTurnoNuevo, buscarPersonaPorDni, actualizarTurno } from '../controllers/turnos-agendar.js';

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
    .isIn(['PENDIENTE', 'CONFIRMADO', 'EN_CONSULTA', 'ATENDIDA', 'FINALIZADA', 'CANCELADA'])
    .withMessage('Estado inválido')
];

// ============================================================================
// RUTAS
// ============================================================================

/**
 * POST /api/turnos/agendar
 * Agendar turno con upsert automático de Persona
 * Acepta datos de Persona (nombre, apellido, DNI, etc.)
 * Si la Persona existe (por DNI), actualiza sus datos
 * Si no existe, la crea automáticamente
 * También auto-crea Paciente si no existe
 * Roles: doctor, secretaria
 */
const validarAgendarTurno = [
  // 👤 Datos de Persona (requeridos)
  body('persona_nombre')
    .notEmpty().withMessage('Nombre es requerido')
    .isLength({ min: 2 }).withMessage('Nombre debe tener al menos 2 caracteres'),
  body('persona_apellido')
    .notEmpty().withMessage('Apellido es requerido')
    .isLength({ min: 2 }).withMessage('Apellido debe tener al menos 2 caracteres'),
  body('persona_dni')
    .notEmpty().withMessage('DNI es requerido'),
  body('persona_email')
    .optional()
    .isEmail().withMessage('Email debe ser válido'),
  body('persona_telefono')
    .optional()
    .isString(),
  body('persona_fecha_nacimiento')
    .optional()
    .isISO8601().withMessage('Fecha de nacimiento debe ser un formato válido'),
  body('persona_sexo')
    .optional()
    .isIn(['M', 'F', 'O']).withMessage('Sexo debe ser M, F u O'),
  body('persona_direccion')
    .optional()
    .isString(),
  body('persona_obra_social')
    .optional()
    .isString(),
  body('persona_numero_afiliado')
    .optional()
    .isString(),
  // 📅 Datos de Turno (requeridos)
  body('medico_id')
    .notEmpty().withMessage('médico_id es requerido')
    .isNumeric().withMessage('médico_id debe ser un número'),
  body('fecha')
    .notEmpty().withMessage('Fecha es requerida')
    .isISO8601().withMessage('Fecha debe ser un formato válido'),
  body('hora')
    .notEmpty().withMessage('Hora es requerida'),
  body('motivo')
    .optional()
    .isLength({ min: 5, max: 500 }).withMessage('Motivo debe tener entre 5 y 500 caracteres'),
  body('observaciones')
    .optional()
    .isString()
];

router.post(
  '/agendar',
  authMiddleware,
  requireSecretariaOrDoctor,
  validarAgendarTurno,
  agendarTurnoNuevo
);

/**
 * POST /api/turnos
 * Crear nuevo turno (requiere persona_id existente)
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
 * GET /api/turnos/buscar-persona?dni=12345678
 * Buscar persona por DNI (para el formulario de agendar)
 * ⚠️ IMPORTANTE: Esta ruta DEBE ir ANTES de /:id para evitar conflicto
 * Roles: doctor, secretaria
 */
router.get(
  '/buscar-persona',
  authMiddleware,
  query('dni').notEmpty().withMessage('DNI es requerido'),
  buscarPersonaPorDni
);

/**
 * GET /api/turnos/persona/:persona_id
 * Obtener todos los turnos de una persona
 * Query params: skip, take, estado
 * Roles: doctor, secretaria, admin
 */
router.get(
  '/persona/:persona_id',
  authMiddleware,
  checkPermission('turnos', 'read'),
  param('persona_id').isNumeric().withMessage('ID de la persona debe ser un número válido'),
  obtenerTurnosDePersona
);

/**
 * GET /api/turnos/paciente/:paciente_id
 * Obtener todos los turnos de un paciente (con historia clínica)
 * Query params: skip, take, estado
 * Roles: doctor, secretaria, admin
 */
router.get(
  '/paciente/:paciente_id',
  authMiddleware,
  checkPermission('turnos', 'read'),
  param('paciente_id').isNumeric().withMessage('ID del paciente debe ser un número válido'),
  obtenerTurnosDePaciente
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
  param('id').isNumeric().withMessage('ID debe ser un número válido'),
  validarCambiarEstado,
  cambiarEstadoTurno
);

/**
 * POST /api/turnos/:id/confirmar-llegada
 * Confirmar llegada del paciente y cambiar estado a CONFIRMADO
 * Solo se ejecuta cuando usuario guarda el formulario de datos del paciente
 * Si cancela el formulario, este endpoint NO se ejecuta (estado NO cambia)
 * Body:
 *  - obra_social (opcional)
 *  - numero_afiliado (opcional)
 * Roles: secretaria, doctor
 */
router.post(
  '/:id/confirmar-llegada',
  authMiddleware,
  checkPermission('turnos', 'update'),
  param('id').isNumeric().withMessage('ID debe ser un número válido'),
  [
    body('nombre').optional().isString().trim(),
    body('apellido').optional().isString().trim(),
    body('telefono').optional().isString().trim(),
    body('email').optional().isEmail().withMessage('Email inválido'),
    body('fecha_nacimiento').optional().isISO8601().withMessage('Fecha inválida'),
    body('sexo').optional().isIn(['M', 'F', 'O']),
    body('direccion').optional().isString().trim(),
    body('obra_social').optional().isString().trim(),
    body('numero_afiliado').optional().isString().trim()
  ],
  confirmarLlegada
);

/**
 * DELETE /api/turnos/:id
 * Eliminar turno (solo si estado es pendiente)
 * Roles: doctor, secretaria
 */
router.delete(
  '/:id',
  authMiddleware,
  (req, res, next) => {
    console.log(`✅ DELETE middleware - ID: ${req.params.id}`);
    // Validar que sea numérico manualmente
    if (!/^\d+$/.test(req.params.id)) {
      return res.status(400).json({ error: 'ID debe ser un número válido' });
    }
    next();
  },
  eliminarTurno
);

// ============================================================================
// 🆕 RUTAS NUEVAS - AGENDAR TURNO CON UPSERT DE PERSONA
// ============================================================================

/**
 * POST /api/turnos/agendar
 * Agendar turno con upsert automático de Persona
 * Body:
 *  - nombre, apellido, dni, telefono, email, fecha_nacimiento, sexo, direccion
 *  - obra_social, numero_afiliado, observaciones_generales
 *  - medico_id, fecha, hora, turno_observaciones
 * Roles: doctor, secretaria
 */
router.post(
  '/agendar',
  authMiddleware,
  [
    body('nombre').notEmpty().withMessage('Nombre es requerido'),
    body('apellido').notEmpty().withMessage('Apellido es requerido'),
    body('dni')
      .notEmpty().withMessage('DNI es requerido')
      .isNumeric().withMessage('DNI debe ser un número válido'),
    body('telefono').optional(),
    body('email').optional().isEmail().withMessage('Email inválido'),
    body('fecha_nacimiento').optional().isISO8601().withMessage('Fecha inválida'),
    body('sexo').optional().isIn(['M', 'F', 'O']).withMessage('Sexo inválido'),
    body('direccion').optional(),
    body('obra_social').optional(),
    body('numero_afiliado').optional(),
    body('observaciones_generales').optional(),
    body('medico_id').optional().isNumeric().withMessage('medico_id inválido'),
    body('fecha')
      .notEmpty().withMessage('Fecha es requerida')
      .isISO8601().withMessage('Fecha inválida'),
    body('hora')
      .notEmpty().withMessage('Hora es requerida')
      .matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Hora debe ser HH:mm'),
    body('turno_observaciones').optional()
  ],
  agendarTurnoNuevo
);

/**
 * PUT /api/turnos/:id
 * Actualizar turno existente
 * Body:
 *  - nombre, apellido, dni, telefono, email, fecha_nacimiento, sexo, direccion (opcional)
 *  - obra_social, numero_afiliado, observaciones_generales (opcional)
 *  - fecha, hora, observaciones (opcional)
 * Roles: doctor, secretaria
 */
router.put(
  '/:id',
  authMiddleware,
  requireSecretariaOrDoctor,
  [
    param('id').isNumeric().withMessage('ID debe ser un número válido'),
    body('persona_nombre').optional().isLength({ min: 2 }).withMessage('Nombre debe tener al menos 2 caracteres'),
    body('persona_apellido').optional().isLength({ min: 2 }).withMessage('Apellido debe tener al menos 2 caracteres'),
    body('persona_dni').optional().isNumeric().withMessage('DNI debe ser un número válido'),
    body('persona_telefono').optional(),
    body('persona_email').optional().isEmail().withMessage('Email inválido'),
    body('persona_fecha_nacimiento').optional().isISO8601().withMessage('Fecha de nacimiento inválida'),
    body('persona_sexo').optional().isIn(['M', 'F', 'O']).withMessage('Sexo inválido'),
    body('persona_direccion').optional(),
    body('persona_obra_social').optional(),
    body('persona_numero_afiliado').optional(),
    body('persona_observaciones_generales').optional(),
    body('fecha').optional().isISO8601().withMessage('Fecha inválida'),
    body('hora').optional().matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Hora debe ser HH:mm'),
    body('observaciones').optional(),
    body('motivo').optional()
  ],
  actualizarTurno
);

export default router;
