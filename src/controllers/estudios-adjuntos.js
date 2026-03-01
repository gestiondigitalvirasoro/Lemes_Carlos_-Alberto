import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { validationResult } from 'express-validator';
import multer from 'multer';
import path from 'path';

const prisma = new PrismaClient();

// Inicializar cliente Supabase con Service Role Key
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Configuración multer para manejo en memoria
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  },
  fileFilter: (req, file, cb) => {
    // Permitir documentos y imágenes comunes
    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'), false);
    }
  }
});

// ============================================================================
// CONTROLLER: CREAR ESTUDIO ADJUNTO (CON SUBIDA A SUPABASE STORAGE)
// ============================================================================
export const crearEstudioAdjunto = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { historia_clinica_id, tipo_estudio, descripcion, resultado, observaciones } = req.body;
    const file = req.file;

    // Validar que historia clínica existe
    const historia = await prisma.historiaClinica.findUnique({
      where: { id: BigInt(historia_clinica_id) }
    });

    if (!historia) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Historia clínica no encontrada'
      });
    }

    let archivo_url = null;
    let nombre_archivo = null;
    let archivo_mime_type = null;
    let tamaño_bytes = null;

    // Si hay archivo, subirlo a Supabase Storage
    if (file) {
      try {
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(7);
        const fileName = `${timestamp}_${randomStr}_${file.originalname}`;
        const bucketPath = `estudios/${historia_clinica_id}/${fileName}`;

        // Subir archivo a Supabase Storage
        const { data, error: uploadError } = await supabase.storage
          .from('documentos')
          .upload(bucketPath, file.buffer, {
            contentType: file.mimetype,
            upsert: false
          });

        if (uploadError) {
          console.error('Error subiendo archivo:', uploadError);
          return res.status(400).json({
            error: 'Bad request',
            message: 'Error al subir el archivo a almacenamiento'
          });
        }

        // Obtener URL pública del archivo
        const { data: urlData } = supabase.storage
          .from('documentos')
          .getPublicUrl(bucketPath);

        archivo_url = urlData.publicUrl;
        nombre_archivo = file.originalname;
        archivo_mime_type = file.mimetype;
        tamaño_bytes = BigInt(file.size);
      } catch (uploadError) {
        console.error('Error procesando archivo:', uploadError);
        return res.status(500).json({
          error: 'Internal server error',
          message: 'Error al procesar el archivo'
        });
      }
    }

    const estudio = await prisma.estudioAdjunto.create({
      data: {
        historia_clinica_id: BigInt(historia_clinica_id),
        tipo_estudio,
        descripcion,
        archivo_url,
        nombre_archivo,
        archivo_mime_type,
        tama_o_bytes: tamaño_bytes,
        resultado,
        observaciones
      },
      select: {
        id: true,
        historia_clinica_id: true,
        tipo_estudio: true,
        descripcion: true,
        archivo_url: true,
        nombre_archivo: true,
        archivo_mime_type: true,
        tama_o_bytes: true,
        resultado: true,
        observaciones: true,
        created_at: true,
        updated_at: true
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Estudio adjunto creado exitosamente',
      data: {
        ...estudio,
        id: estudio.id.toString(),
        historia_clinica_id: estudio.historia_clinica_id.toString(),
        tama_o_bytes: estudio.tama_o_bytes?.toString() || null
      }
    });
  } catch (error) {
    console.error('Error al crear estudio adjunto:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al crear el estudio adjunto'
    });
  }
};

// ============================================================================
// CONTROLLER: OBTENER ESTUDIOS ADJUNTOS
// ============================================================================
export const obtenerEstudiosAdjuntos = async (req, res) => {
  try {
    const { skip = 0, take = 10, historia_clinica_id, tipo_estudio } = req.query;

    const where = {};

    if (historia_clinica_id) {
      where.historia_clinica_id = BigInt(historia_clinica_id);
    }

    if (tipo_estudio) {
      where.tipo_estudio = {
        contains: tipo_estudio,
        mode: 'insensitive'
      };
    }

    const [estudios, total] = await Promise.all([
      prisma.estudioAdjunto.findMany({
        where,
        skip: parseInt(skip),
        take: parseInt(take),
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          historia_clinica_id: true,
          tipo_estudio: true,
          descripcion: true,
          archivo_url: true,
          nombre_archivo: true,
          archivo_mime_type: true,
          tama_o_bytes: true,
          resultado: true,
          observaciones: true,
          created_at: true,
          updated_at: true
        }
      }),
      prisma.estudioAdjunto.count({ where })
    ]);

    return res.status(200).json({
      success: true,
      data: estudios.map(e => ({
        ...e,
        id: e.id.toString(),
        historia_clinica_id: e.historia_clinica_id.toString(),
        tama_o_bytes: e.tama_o_bytes?.toString() || null
      })),
      pagination: {
        total,
        skip: parseInt(skip),
        take: parseInt(take),
        pages: Math.ceil(total / parseInt(take))
      }
    });
  } catch (error) {
    console.error('Error al obtener estudios adjuntos:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener los estudios adjuntos'
    });
  }
};

// ============================================================================
// CONTROLLER: OBTENER UN ESTUDIO ADJUNTO
// ============================================================================
export const obtenerEstudioAdjunto = async (req, res) => {
  try {
    const { id } = req.params;

    const estudio = await prisma.estudioAdjunto.findUnique({
      where: { id: BigInt(id) },
      select: {
        id: true,
        historia_clinica_id: true,
        tipo_estudio: true,
        descripcion: true,
        archivo_url: true,
        nombre_archivo: true,
        archivo_mime_type: true,
        tama_o_bytes: true,
        resultado: true,
        observaciones: true,
        created_at: true,
        updated_at: true,
        historia_clinica: {
          select: {
            id: true,
            paciente_id: true,
            doctor_id: true,
            fecha: true
          }
        }
      }
    });

    if (!estudio) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Estudio adjunto no encontrado'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...estudio,
        id: estudio.id.toString(),
        historia_clinica_id: estudio.historia_clinica_id.toString(),
        tama_o_bytes: estudio.tama_o_bytes?.toString() || null,
        historia_clinica: {
          ...estudio.historia_clinica,
          id: estudio.historia_clinica.id.toString(),
          paciente_id: estudio.historia_clinica.paciente_id.toString(),
          doctor_id: estudio.historia_clinica.doctor_id.toString()
        }
      }
    });
  } catch (error) {
    console.error('Error al obtener estudio adjunto:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener el estudio adjunto'
    });
  }
};

// ============================================================================
// CONTROLLER: ACTUALIZAR ESTUDIO ADJUNTO
// ============================================================================
export const actualizarEstudioAdjunto = async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo_estudio, descripcion, resultado, observaciones } = req.body;

    const estudio = await prisma.estudioAdjunto.update({
      where: { id: BigInt(id) },
      data: {
        tipo_estudio,
        descripcion,
        resultado,
        observaciones
      },
      select: {
        id: true,
        historia_clinica_id: true,
        tipo_estudio: true,
        descripcion: true,
        archivo_url: true,
        nombre_archivo: true,
        resultado: true,
        observaciones: true,
        created_at: true,
        updated_at: true
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Estudio adjunto actualizado',
      data: {
        ...estudio,
        id: estudio.id.toString(),
        historia_clinica_id: estudio.historia_clinica_id.toString()
      }
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        error: 'Not found',
        message: 'Estudio adjunto no encontrado'
      });
    }
    console.error('Error al actualizar estudio adjunto:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al actualizar el estudio adjunto'
    });
  }
};

// ============================================================================
// CONTROLLER: ELIMINAR ESTUDIO ADJUNTO
// ============================================================================
export const eliminarEstudioAdjunto = async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener el estudio para acceder al archivo
    const estudio = await prisma.estudioAdjunto.findUnique({
      where: { id: BigInt(id) }
    });

    if (!estudio) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Estudio adjunto no encontrado'
      });
    }

    // Eliminar archivo de Supabase Storage si existe
    if (estudio.archivo_url) {
      try {
        // Extraer ruta del archivo de la URL pública
        const urlParts = estudio.archivo_url.split('/');
        const bucketName = 'documentos';
        const filePath = urlParts.slice(urlParts.indexOf(bucketName) + 1).join('/');

        await supabase.storage
          .from(bucketName)
          .remove([filePath]);
      } catch (deleteError) {
        console.warn('Advertencia: No se pudo eliminar archivo de storage:', deleteError);
        // Continuar con eliminación de BD aunque falle storage
      }
    }

    // Eliminar registro de BD
    await prisma.estudioAdjunto.delete({
      where: { id: BigInt(id) }
    });

    return res.status(200).json({
      success: true,
      message: 'Estudio adjunto eliminado exitosamente'
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        error: 'Not found',
        message: 'Estudio adjunto no encontrado'
      });
    }
    console.error('Error al eliminar estudio adjunto:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al eliminar el estudio adjunto'
    });
  }
};

export default {
  upload,
  crearEstudioAdjunto,
  obtenerEstudiosAdjuntos,
  obtenerEstudioAdjunto,
  actualizarEstudioAdjunto,
  eliminarEstudioAdjunto
};
