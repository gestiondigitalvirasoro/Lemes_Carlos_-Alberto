/**
 * Rutas de administración
 */

import express from 'express';
import { body, validationResult } from 'express-validator';
import {
  getEstadisticasDashboard,
  listarUsuarios,
  crearUsuario,
  obtenerUsuario,
  actualizarUsuario,
  toggleUsuarioActivo,
  eliminarUsuario,
  listarPacientes
} from '../controllers/admin.js';
import { authMiddleware } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/requireRole.js';
import { checkPermission, requireDoctorOrAdmin } from '../middlewares/permissions.js';

const router = express.Router();

// ============================================================================
// MIDDLEWARE: Validar errores de express-validator
// ============================================================================

const validarErrores = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Errores en la validación',
      details: errors.array()
    });
  }
  next();
};

// ============================================================================
// TODAS LAS RUTAS REQUIEREN: Autenticación + Rol DOCTOR O ADMIN
// ============================================================================

router.use(authMiddleware);
router.use(requireDoctorOrAdmin);

// ============================================================================
// ESTADÍSTICAS
// ============================================================================

/**
 * GET /api/admin/estadisticas/dashboard
 * Obtener estadísticas para el dashboard
 */
router.get('/estadisticas/dashboard', getEstadisticasDashboard);

// ============================================================================
// GESTIÓN DE USUARIOS
// ============================================================================

/**
 * GET /api/admin/usuarios
 * Listar todos los usuarios con paginación
 * Query params:
 *   - page: número de página (default: 1)
 *   - limit: registros por página (default: 10)
 *   - role: filtrar por rol (admin, doctor, secretaria)
 */
router.get('/usuarios', listarUsuarios);

/**
 * POST /api/admin/usuarios
 * Crear nuevo usuario
 */
router.post(
  '/usuarios',
  [
    body('nombre').notEmpty().withMessage('Nombre requerido'),
    body('apellido').notEmpty().withMessage('Apellido requerido'),
    body('email').isEmail().withMessage('Email inválido'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Contraseña debe tener al menos 6 caracteres'),
    body('role')
      .isIn(['admin', 'doctor', 'secretaria'])
      .withMessage('Rol inválido'),
    body('especialidad').optional().isString(),
    body('subespecialidad').optional().isString()
  ],
  validarErrores,
  crearUsuario
);

/**
 * GET /api/admin/usuarios/:id
 * Obtener usuario por ID
 */
router.get('/usuarios/:id', obtenerUsuario);

/**
 * PUT /api/admin/usuarios/:id
 * Actualizar usuario
 */
router.put(
  '/usuarios/:id',
  [
    body('nombre').optional().isString(),
    body('apellido').optional().isString(),
    body('role')
      .optional()
      .isIn(['admin', 'doctor', 'secretaria'])
      .withMessage('Rol inválido'),
    body('especialidad').optional().isString(),
    body('subespecialidad').optional().isString()
  ],
  validarErrores,
  actualizarUsuario
);

/**
 * PATCH /api/admin/usuarios/:id/activo
 * Activar/desactivar usuario
 */
router.patch(
  '/usuarios/:id/activo',
  [
    body('activo').isBoolean().withMessage('activo debe ser booleano')
  ],
  validarErrores,
  toggleUsuarioActivo
);

/**
 * DELETE /api/admin/usuarios/:id
 * Eliminar usuario (soft delete)
 */
router.delete('/usuarios/:id', eliminarUsuario);

// ============================================================================
// GESTIÓN DE PACIENTES
// ============================================================================

/**
 * GET /api/admin/pacientes
 * Listar todos los pacientes con paginación y búsqueda
 * Query params:
 *   - page: número de página (default: 1)
 *   - limit: registros por página (default: 10)
 *   - search: buscar por nombre, apellido, DNI o email
 */
router.get('/pacientes', listarPacientes);

export default router;
