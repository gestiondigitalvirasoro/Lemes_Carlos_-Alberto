import express from 'express';
import { body, validationResult } from 'express-validator';
import { login, logout, me, signup, updateProfile } from '../controllers/auth.js';
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
 * POST /api/auth/signup
 * Registrar nuevo usuario (Supabase Auth + BD local)
 */
router.post(
  '/signup',
  [
    body('email').isEmail().withMessage('Email inválido'),
    body('password').isLength({ min: 6 }).withMessage('Contraseña debe tener al menos 6 caracteres'),
    body('nombre').notEmpty().withMessage('Nombre requerido'),
    body('apellido').notEmpty().withMessage('Apellido requerido'),
    body('role').optional().isIn(['doctor', 'secretaria', 'admin']).withMessage('Rol inválido'),
    body('especialidad').optional().isString().withMessage('Especialidad inválida')
  ],
  validarErrores,
  signup
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
 * PUT /api/auth/profile
 * Actualizar perfil del usuario
 */
router.put('/profile', authMiddleware, updateProfile);

export default router;
