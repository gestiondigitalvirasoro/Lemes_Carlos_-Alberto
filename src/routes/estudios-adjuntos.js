import express from 'express';
import { body, param, query } from 'express-validator';
import { authMiddleware } from '../middlewares/auth.js';
import roleMiddleware from '../middlewares/role.js';
import estudiosAdjuntosController from '../controllers/estudios-adjuntos.js';

const router = express.Router();

// Proteger todas las rutas
router.use(authMiddleware);

// POST - Crear estudio adjunto (con subida de archivo)
router.post(
  '/',
  roleMiddleware(['admin', 'doctor']),
  estudiosAdjuntosController.upload.single('archivo'),
  [
    body('historia_clinica_id').isNumeric().withMessage('historia_clinica_id debe ser un número válido'),
    body('tipo_estudio').isString().trim().notEmpty().withMessage('tipo_estudio es requerido'),
    body('descripcion').optional().isString().trim(),
    body('resultado').optional().isString().trim(),
    body('observaciones').optional().isString().trim()
  ],
  estudiosAdjuntosController.crearEstudioAdjunto
);

// GET - Listar estudios adjuntos
router.get(
  '/',
  [
    query('skip').optional().isInt({ min: 0 }).toInt(),
    query('take').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('historia_clinica_id').optional().isNumeric(),
    query('tipo_estudio').optional().isString().trim()
  ],
  estudiosAdjuntosController.obtenerEstudiosAdjuntos
);

// GET - Obtener un estudio adjunto
router.get(
  '/:id',
  [param('id').isNumeric().withMessage('ID debe ser un número válido')],
  estudiosAdjuntosController.obtenerEstudioAdjunto
);

// PUT - Actualizar estudio adjunto
router.put(
  '/:id',
  roleMiddleware(['admin', 'doctor']),
  [
    param('id').isNumeric().withMessage('ID debe ser un número válido'),
    body('tipo_estudio').optional().isString().trim(),
    body('descripcion').optional().isString().trim(),
    body('resultado').optional().isString().trim(),
    body('observaciones').optional().isString().trim()
  ],
  estudiosAdjuntosController.actualizarEstudioAdjunto
);

// DELETE - Eliminar estudio adjunto
router.delete(
  '/:id',
  roleMiddleware(['admin', 'doctor']),
  [param('id').isNumeric().withMessage('ID debe ser un número válido')],
  estudiosAdjuntosController.eliminarEstudioAdjunto
);

export default router;
