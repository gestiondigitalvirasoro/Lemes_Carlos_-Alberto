import express from 'express';
import { body, param, query } from 'express-validator';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authMiddleware } from '../middlewares/auth.js';
import roleMiddleware from '../middlewares/role.js';
import { PrismaClient } from '@prisma/client';
import {
  crearHistoriaClinica,
  obtenerHistoriasClinicas,
  obtenerHistoriaClinica,
  actualizarHistoriaClinica,
  eliminarHistoriaClinica,
  registrarDiagnostico,
  eliminarDiagnostico
} from '../controllers/historias-clinicas.js';

const prisma = new PrismaClient();
const router = express.Router();

// Configurar multer para subida de archivos
const uploadDir = 'uploads/documentos';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const filename = `${timestamp}-${file.originalname}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'));
    }
  }
});

// Proteger todas las rutas
router.use(authMiddleware);

// POST - Crear historia clínica
router.post(
  '/',
  roleMiddleware(['admin', 'doctor']),
  [
    body('paciente_id').isNumeric().withMessage('paciente_id debe ser un número válido'),
    body('doctor_id').isNumeric().withMessage('doctor_id debe ser un número válido'),
    body('diagnostico').optional().isString().trim(),
    body('tratamiento').optional().isString().trim(),
    body('medicamentos').optional().isString().trim(),
    body('antecedentes').optional().isString().trim(),
    body('examen_fisico').optional().isString().trim(),
    body('observaciones').optional().isString().trim(),
    body('peso').optional().isFloat({ min: 1, max: 500 }).withMessage('peso debe estar entre 1 y 500 kg'),
    body('talla').optional().isFloat({ min: 50, max: 300 }).withMessage('talla debe estar entre 50 y 300 cm'),
    body('turno_id').optional().isNumeric().withMessage('turno_id debe ser un número válido')
  ],
  crearHistoriaClinica
);

// GET - Listar historias clínicas
router.get(
  '/',
  [
    query('skip').optional().isInt({ min: 0 }).toInt(),
    query('take').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('paciente_id').optional().isNumeric(),
    query('doctor_id').optional().isNumeric(),
    query('fecha_desde').optional().isISO8601(),
    query('fecha_hasta').optional().isISO8601()
  ],
  obtenerHistoriasClinicas
);

// GET - Obtener una historia clínica
router.get(
  '/:id',
  [param('id').isNumeric().withMessage('ID debe ser un número válido')],
  obtenerHistoriaClinica
);

// PUT - Actualizar historia clínica
router.put(
  '/:id',
  roleMiddleware(['admin', 'doctor']),
  [
    param('id').isNumeric().withMessage('ID debe ser un número válido'),
    body('motivo_consulta').optional().isString().trim(),
    body('anamnesis').optional().isString().trim(),
    body('antecedentes').optional().isString().trim(),
    body('diagnostico_principal').optional().isString().trim(),
    body('impresion_clinica').optional().isString().trim(),
    body('presion_arterial').optional().isString().trim(),
    body('frecuencia_cardiaca').optional().isString().trim(),
    body('temperatura').optional().isString().trim(),
    body('saturacion_o2').optional().isString().trim()
  ],
  actualizarHistoriaClinica
);

// DELETE - Eliminar historia clínica
router.delete(
  '/:id',
  roleMiddleware(['admin', 'doctor']),
  [param('id').isNumeric().withMessage('ID debe ser un número válido')],
  eliminarHistoriaClinica
);

// ============================================================================
// RUTAS DE DIAGNÓSTICOS
// ============================================================================

// POST - Registrar diagnóstico
router.post(
  '/:historia_id/diagnosticos',
  roleMiddleware(['admin', 'doctor']),
  [
    param('historia_id').isNumeric().withMessage('historia_id debe ser un número válido'),
    body('codigo_cie10').notEmpty().withMessage('codigo_cie10 es requerido'),
    body('descripcion').notEmpty().withMessage('descripcion es requerida'),
    body('principal').optional().isBoolean().toBoolean()
  ],
  registrarDiagnostico
);

// DELETE - Eliminar diagnóstico
router.delete(
  '/diagnosticos/:diagnostico_id',
  roleMiddleware(['admin', 'doctor']),
  [param('diagnostico_id').isNumeric().withMessage('diagnostico_id debe ser un número válido')],
  eliminarDiagnostico
);

// ============================================================================
// RUTAS DE DOCUMENTOS
// ============================================================================

// POST - Subir documento
router.post(
  '/:historia_id/documentos',
  roleMiddleware(['admin', 'doctor']),
  upload.single('file'),
  async (req, res) => {
    try {
      const { historia_id } = req.params;

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No se proporcionó archivo' });
      }

      // Guardar en base de datos
      // Obtener user_id del token
      const userId = req.user?.id || 1; // fallback to 1 if not available
      
      const documento = await prisma.documentoAdjunto.create({
        data: {
          historia_clinica_id: parseInt(historia_id),
          nombre_archivo: req.file.originalname,
          tipo_mime: req.file.mimetype,
          tamano_bytes: req.file.size,
          url_storage: path.join(uploadDir, req.file.filename),
          subido_por_medico_id: userId,
          fecha_subida: new Date(),
          eliminado: false
        }
      });

      console.log('✅ Documento subido:', documento);

      // Convertir BigInt a string para JSON
      const docResponse = {
        id: documento.id.toString(),
        nombre_archivo: documento.nombre_archivo,
        tamaño: documento.tamano_bytes,
        fecha_subida: documento.fecha_subida
      };

      res.json({
        success: true,
        message: 'Documento subido exitosamente',
        data: docResponse
      });
    } catch (error) {
      console.error('❌ Error al subir documento:', error);
      res.status(500).json({
        success: false,
        message: 'Error al subir documento: ' + error.message
      });
    }
  }
);

// GET - Descargar documento
router.get(
  '/documentos/:documento_id/descargar',
  roleMiddleware(['admin', 'doctor']),
  async (req, res) => {
    try {
      const { documento_id } = req.params;

      const documento = await prisma.documentoAdjunto.findUnique({
        where: { id: parseInt(documento_id) }
      });

      if (!documento) {
        return res.status(404).json({ success: false, message: 'Documento no encontrado' });
      }

      if (!fs.existsSync(documento.url_storage)) {
        return res.status(404).json({ success: false, message: 'Archivo no encontrado en servidor' });
      }

      res.download(documento.url_storage, documento.nombre_archivo);
    } catch (error) {
      console.error('❌ Error al descargar documento:', error);
      res.status(500).json({
        success: false,
        message: 'Error al descargar documento: ' + error.message
      });
    }
  }
);

// DELETE - Eliminar documento
router.delete(
  '/documentos/:documento_id',
  roleMiddleware(['admin', 'doctor']),
  async (req, res) => {
    try {
      const { documento_id } = req.params;

      const documento = await prisma.documentoAdjunto.findUnique({
        where: { id: parseInt(documento_id) }
      });

      if (!documento) {
        return res.status(404).json({ success: false, message: 'Documento no encontrado' });
      }

      // Eliminar archivo del servidor
      if (fs.existsSync(documento.url_storage)) {
        fs.unlinkSync(documento.url_storage);
      }

      // Marcar como eliminado
      await prisma.documentoAdjunto.update({
        where: { id: parseInt(documento_id) },
        data: {
          eliminado: true,
          fecha_eliminacion: new Date()
        }
      });

      console.log('✅ Documento eliminado:', documento_id);

      res.json({
        success: true,
        message: 'Documento eliminado exitosamente'
      });
    } catch (error) {
      console.error('❌ Error al eliminar documento:', error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar documento: ' + error.message
      });
    }
  }
);

export default router;

