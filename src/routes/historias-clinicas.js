import express from 'express';
import { body, param, query } from 'express-validator';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v2 as cloudinary } from 'cloudinary';
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

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const prisma = new PrismaClient();
const router = express.Router();

// Configurar multer para recibir archivos en memoria (no guardar en disco)
// Los archivos se subirán directamente a Cloudinary
const storage = multer.memoryStorage();

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
    body('paciente_id')
      .notEmpty().withMessage('paciente_id es requerido')
      .isNumeric().withMessage('paciente_id debe ser un número válido'),
    body('doctor_id').optional().isNumeric().withMessage('doctor_id debe ser un número válido'),
    body('motivo_consulta')
      .notEmpty().withMessage('Motivo de Consulta es obligatorio')
      .isString().trim()
      .isLength({ min: 5 }).withMessage('Motivo de Consulta debe tener al menos 5 caracteres'),
    body('diagnostico').optional().isString().trim(),
    body('tratamiento').optional().isString().trim(),
    body('medicamentos').optional().isString().trim(),
    body('antecedentes').optional().isString().trim(),
    body('anamnesis').optional().isString().trim(),
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

// POST - Subir documento a Cloudinary
router.post(
  '/:historia_id/documentos',
  roleMiddleware(['admin', 'doctor']),
  upload.single('file'),
  async (req, res) => {
    try {
      const { historia_id } = req.params;
      // Leer estudio_id de req.body (si se envía con FormData)
      const estudio_id = req.body?.estudio_id;

      // Log de diagnóstico
      console.log('📋 POST /documentos - Diagnóstico:');
      console.log('  Historia ID:', historia_id);
      console.log('  Estudio ID:', estudio_id || 'N/A');
      console.log('  Archivo:', req.file?.originalname || 'NO RECIBIDO');
      console.log('  Cloudinary Config:', {
        cloud_name: cloudinary.config().cloud_name,
        api_key: cloudinary.config().api_key ? '***' : 'NO CONFIGURADO',
        api_secret: cloudinary.config().api_secret ? '***' : 'NO CONFIGURADO'
      });

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No se proporcionó archivo' });
      }

      // Obtener medico_id del token (medicoId está en formato string)
      const medicoId = req.user?.medicoId;
      if (!medicoId) {
        console.error('❌ No se encontró medicoId en el token');
        return res.status(401).json({ 
          success: false, 
          message: 'No autorizado para subir documentos' 
        });
      }

      // Verificar que cloudinary está configurado
      if (!cloudinary.config().cloud_name) {
        console.error('❌ Cloudinary no está configurado - cloud_name faltante');
        return res.status(500).json({ 
          success: false, 
          message: 'Cloudinary no está configurado correctamente' 
        });
      }

      console.log('📤 Iniciando upload a Cloudinary...');

      // Subir a Cloudinary directamente desde el buffer
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'auto',
            public_id: `clinicalemes/documentos/${Date.now()}-${req.file.originalname.split('.')[0]}`,
            folder: 'clinicalemes/documentos',
            secure: true
          },
          (error, result) => {
            if (error) {
              console.error('❌ Error de Cloudinary:', error);
              reject(error);
            } else {
              console.log('✅ Upload a Cloudinary exitoso');
              resolve(result);
            }
          }
        );
        stream.end(req.file.buffer);
      });

      // Guardar en base de datos con URL de Cloudinary
      const documentoData = {
        historia_clinica_id: BigInt(historia_id),
        nombre_archivo: req.file.originalname,
        tipo_mime: req.file.mimetype,
        tamano_bytes: BigInt(req.file.size),
        url_storage: uploadResult.secure_url,
        cloudinary_id: uploadResult.public_id,
        subido_por_medico_id: BigInt(medicoId),
        fecha_subida: new Date(),
        eliminado: false
      };

      // Si hay estudio_id, asociarlo al documento
      if (estudio_id) {
        documentoData.estudio_id = BigInt(estudio_id);
        console.log('📎 Documento asociado al estudio:', estudio_id);
      }

      const documento = await prisma.documentoAdjunto.create({
        data: documentoData
      });

      console.log('✅ Documento guardado en BD:', documento.id);

      // Convertir BigInt a string para JSON
      const docResponse = {
        id: documento.id.toString(),
        nombre_archivo: documento.nombre_archivo,
        tamaño: documento.tamano_bytes.toString(),
        fecha_subida: documento.fecha_subida,
        url: uploadResult.secure_url
      };

      res.json({
        success: true,
        message: 'Documento subido exitosamente',
        data: docResponse
      });
    } catch (error) {
      console.error('❌ Error al subir documento:', error.message);
      console.error('Error completo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al subir documento: ' + error.message
      });
    }
  }
);

// GET - Obtener documentos de una Historia Clínica
router.get(
  '/:historia_id/documentos',
  authMiddleware,
  async (req, res) => {
    try {
      const { historia_id } = req.params;

      const documentos = await prisma.documentoAdjunto.findMany({
        where: {
          historia_clinica_id: BigInt(historia_id),
          eliminado: false,
          estudio_id: null  // Solo documentos generales, NO los vinculados a estudios
        },
        orderBy: { fecha_subida: 'desc' }
      });

      // Convertir BigInt a string
      const docsResponse = documentos.map(doc => ({
        id: doc.id.toString(),
        nombre_archivo: doc.nombre_archivo,
        tamaño: doc.tamano_bytes.toString(),
        fecha_subida: doc.fecha_subida,
        url_storage: doc.url_storage
      }));

      res.json({
        success: true,
        data: docsResponse
      });
    } catch (error) {
      console.error('❌ Error al obtener documentos:', error.message);
      res.status(500).json({
        success: false,
        message: 'Error al obtener documentos: ' + error.message
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
        where: { id: BigInt(documento_id) }
      });

      if (!documento) {
        return res.status(404).json({ success: false, message: 'Documento no encontrado' });
      }

      // Redirigir a la URL de Cloudinary (ya es pública)
      // O descargar directamente si prefieres
      res.redirect(documento.url_storage);
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
        where: { id: BigInt(documento_id) }
      });

      if (!documento) {
        return res.status(404).json({ success: false, message: 'Documento no encontrado' });
      }

      // Eliminar de Cloudinary si existe cloudinary_id
      if (documento.cloudinary_id) {
        try {
          await cloudinary.uploader.destroy(documento.cloudinary_id);
          console.log('✅ Archivo eliminado de Cloudinary:', documento.cloudinary_id);
        } catch (cloudinaryError) {
          console.error('⚠️ Error al eliminar de Cloudinary:', cloudinaryError);
          // Continuar incluso si falla en Cloudinary
        }
      }

      // Marcar como eliminado en BD
      await prisma.documentoAdjunto.update({
        where: { id: BigInt(documento_id) },
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

// ============================================================================
// CREAR HISTORIA CLÍNICA NUEVA DURANTE CONSULTA (Doctor rellena y guarda)
// ============================================================================
router.post(
  '/nueva-consulta/guardar',
  roleMiddleware(['doctor']),
  [
    body('paciente_id').notEmpty().withMessage('paciente_id es requerido'),
    body('turno_id').optional(),
    body('motivo_consulta').optional().isString().trim(),
    body('anamnesis').optional().isString().trim(),
    body('diagnostico').optional().isString().trim(),
    body('tratamiento').optional().isString().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { paciente_id, turno_id, motivo_consulta, anamnesis, diagnostico, tratamiento } = req.body;
      const medico_id = req.user.medicoId || req.user.id;

      console.log(`📋 Creando historia clínica nueva - Paciente: ${paciente_id}, Turno: ${turno_id}`);

      // Verificar que Paciente existe
      const paciente = await prisma.paciente.findUnique({
        where: { id: BigInt(paciente_id) }
      });

      if (!paciente) {
        return res.status(404).json({
          error: 'Paciente no encontrado',
          message: 'El paciente no existe'
        });
      }

      // Crear HISTORIA_CLÍNICA
      const historiaClinica = await prisma.historiaClinica.create({
        data: {
          paciente_id: BigInt(paciente_id),
          creada_por_medico_id: BigInt(medico_id),
          activa: true
        }
      });

      console.log(`✅ Historia clínica creada: ID ${historiaClinica.id.toString()}`);

      // Crear CONSULTA MÉDICA si hay datos
      let consulta = null;
      if (motivo_consulta) {
        // Obtener estado EN_CONSULTA
        const estadoEnConsulta = await prisma.estadoConsulta.findFirst({
          where: { nombre: 'EN_CONSULTA' }
        });

        consulta = await prisma.consultaMedica.create({
          data: {
            historia_clinica_id: historiaClinica.id,
            medico_id: BigInt(medico_id),
            fecha: new Date(),
            motivo_consulta: motivo_consulta,
            estado_id: estadoEnConsulta?.id || 3n
          }
        });

        console.log(`✅ Consulta médica creada: ID ${consulta.id.toString()}`);

        // Crear ANAMNESIS si hay datos
        if (anamnesis) {
          await prisma.anamnesis.create({
            data: {
              consulta_id: consulta.id,
              descripcion: anamnesis
            }
          });
          console.log(`✅ Anamnesis creada`);
        }

        // Crear DIAGNÓSTICO si hay datos
        if (diagnostico) {
          await prisma.diagnostico.create({
            data: {
              consulta_id: consulta.id,
              descripcion: diagnostico,
              principal: true
            }
          });
          console.log(`✅ Diagnóstico creado`);
        }

        // Crear TRATAMIENTO si hay datos
        if (tratamiento) {
          await prisma.tratamiento.create({
            data: {
              consulta_id: consulta.id,
              descripcion: tratamiento
            }
          });
          console.log(`✅ Tratamiento creado`);
        }
      }

      return res.status(201).json({
        success: true,
        message: 'Historia clínica creada exitosamente',
        data: {
          historia_id: historiaClinica.id.toString(),
          paciente_id: paciente_id.toString(),
          consulta_id: consulta?.id.toString() || null,
          fecha_apertura: historiaClinica.fecha_apertura
        }
      });
    } catch (error) {
      console.error('Error al crear historia clínica:', error);
      return res.status(500).json({
        error: 'Error interno',
        message: 'Error al crear la historia clínica: ' + error.message
      });
    }
  }
);

export default router;

