import express from 'express';
import { body, validationResult } from 'express-validator';
import { login, logout, me, crearUsuario, cambiarContrasena } from '../controllers/auth.js';
import { authMiddleware, roleMiddleware } from '../middlewares/auth.js';

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
// RUTAS PÚBLICAS
// ============================================================================

/**
 * POST /api/auth/login
 * Autenticar usuario y obtener JWT
 */
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Email inválido'),
    body('password').notEmpty().withMessage('Contraseña requerida')
  ],
  validarErrores,
  login
);

/**
 * POST /api/auth/logout
 * Desconectar usuario (SIN requerir autenticación, para poder limpiar cookies)
 */
router.post('/logout', logout);

// ============================================================================
// RUTAS PROTEGIDAS (Requieren autenticación)
// ============================================================================

/**
 * GET /api/auth/me
 * Obtener datos del usuario actual
 */
router.get('/me', authMiddleware, me);

/**
 * POST /api/auth/cambiar-contrasena
 * Cambiar contraseña del usuario actual
 */
router.post(
  '/cambiar-contrasena',
  authMiddleware,
  [
    body('contraseñaActual').notEmpty().withMessage('Contraseña actual requerida'),
    body('contraseñaNueva')
      .isLength({ min: 6 })
      .withMessage('Contraseña nueva debe tener al menos 6 caracteres')
  ],
  validarErrores,
  cambiarContrasena
);

// ============================================================================
// RUTAS PROTEGIDAS - Solo ADMIN
// ============================================================================

/**
 * POST /api/auth/crear-usuario
 * Crear nuevo usuario (Solo admin)
 */
router.post(
  '/crear-usuario',
  authMiddleware,
  roleMiddleware(['admin']),
  [
    body('email').isEmail().withMessage('Email inválido'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Contraseña debe tener al menos 6 caracteres'),
    body('nombre').notEmpty().withMessage('Nombre requerido'),
    body('apellido').notEmpty().withMessage('Apellido requerido'),
    body('role')
      .optional()
      .isIn(['admin', 'doctor', 'secretaria'])
      .withMessage('Rol inválido')
  ],
  validarErrores,
  crearUsuario
);

export default router;
