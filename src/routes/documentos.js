import express from 'express';
import { body, param, query } from 'express-validator';
import { authMiddleware } from '../middlewares/auth.js';
import roleMiddleware from '../middlewares/role.js';
import documentosController from '../controllers/documentos.js';

const router = express.Router();

// Proteger todas las rutas
router.use(authMiddleware);

// POST - Crear documento con UPLOAD VERIFICADO (NUEVO - POST /upload)
// Validaciones estrictas: máximo 10MB, solo PDF/JPEG/PNG
router.post(
  '/upload',
  roleMiddleware(['admin', 'secretaria', 'doctor']),
  documentosController.uploadDocumento.single('archivo'),
  [
    body('paciente_id').isNumeric().withMessage('paciente_id debe ser un número válido'),
    body('tipo_documento').isIn(['cedula_identidad', 'pasaporte', 'licencia_conducir', 'otro']).withMessage('tipo_documento inválido'),
    body('numero_documento').optional().isString().trim(),
    body('descripcion').optional().isString().trim(),
    body('fecha_vencimiento').optional().isISO8601().toDate()
  ],
  documentosController.crearDocumentoUpload
);

// POST - Crear documento (con subida de archivo - genérico)
router.post(
  '/',
  roleMiddleware(['admin', 'secretaria', 'doctor']),
  documentosController.upload.single('archivo'),
  [
    body('paciente_id').isNumeric().withMessage('paciente_id debe ser un número válido'),
    body('tipo_documento').isIn(['cedula_identidad', 'pasaporte', 'licencia_conducir', 'otro']).withMessage('tipo_documento inválido'),
    body('numero_documento').optional().isString().trim(),
    body('descripcion').optional().isString().trim(),
    body('fecha_vencimiento').optional().isISO8601().toDate()
  ],
  documentosController.crearDocumento
);

// GET - Obtener documentos por paciente
router.get(
  '/paciente/:paciente_id',
  [
    param('paciente_id').isNumeric().withMessage('paciente_id debe ser un número válido'),
    query('skip').optional().isInt({ min: 0 }).toInt(),
    query('take').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('tipo_documento').optional().isString(),
    query('activo').optional()
  ],
  documentosController.obtenerDocumentosPorPaciente
);

// GET - Obtener un documento
router.get(
  '/:id',
  [param('id').isNumeric().withMessage('ID debe ser un número válido')],
  documentosController.obtenerDocumento
);

// PUT - Actualizar documento
router.put(
  '/:id',
  roleMiddleware(['admin', 'secretaria']),
  [
    param('id').isNumeric().withMessage('ID debe ser un número válido'),
    body('numero_documento').optional().isString().trim(),
    body('descripcion').optional().isString().trim(),
    body('fecha_vencimiento').optional().isISO8601().toDate(),
    body('activo').optional().isBoolean()
  ],
  documentosController.actualizarDocumento
);

// DELETE - Eliminar documento (soft delete)
router.delete(
  '/:id',
  roleMiddleware(['admin', 'secretaria']),
  [param('id').isNumeric().withMessage('ID debe ser un número válido')],
  documentosController.eliminarDocumento
);

export default router;
