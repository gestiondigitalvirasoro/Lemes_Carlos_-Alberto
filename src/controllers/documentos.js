import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { validationResult } from 'express-validator';
import multer from 'multer';

const prisma = new PrismaClient();

// Inicializar cliente Supabase
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

// ============================================================================
// CONFIGURACIÓN MULTER - Upload Genérico (POST /)
// ============================================================================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  }
});

// ============================================================================
// CONFIGURACIÓN MULTER - Upload Específico (POST /upload) - ESTRICTO
// ============================================================================
const uploadDocumento = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB máximo
  },
  fileFilter: (req, file, cb) => {
    // Solo permite: PDF, JPEG, PNG
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}. Solo PDF, JPEG y PNG.`));
    }
  }
});

// ============================================================================
// CONTROLLER: CREAR DOCUMENTO
// ============================================================================
export const crearDocumento = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      paciente_id,
      tipo_documento,
      numero_documento,
      descripcion,
      fecha_vencimiento
    } = req.body;
    const file = req.file;

    // Validar que paciente existe
    const paciente = await prisma.paciente.findUnique({
      where: { id: BigInt(paciente_id) }
    });

    if (!paciente) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Paciente no encontrado'
      });
    }

    let archivo_url = null;
    let nombre_archivo = null;
    let archivo_mime_type = null;
    let tamaño_bytes = null;

    // Si hay archivo, subirlo
    if (file) {
      try {
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(7);
        const fileName = `${timestamp}_${randomStr}_${file.originalname}`;
        const bucketPath = `documentos_paciente/${paciente_id}/${fileName}`;

        const { data, error: uploadError } = await supabase.storage
          .from('documentos')
          .upload(bucketPath, file.buffer, {
            contentType: file.mimetype
          });

        if (uploadError) {
          console.error('Error subiendo archivo:', uploadError);
          return res.status(400).json({
            error: 'Bad request',
            message: 'Error al subir el documento'
          });
        }

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
          message: 'Error al procesar el documento'
        });
      }
    }

    const documento = await prisma.documento.create({
      data: {
        paciente_id: BigInt(paciente_id),
        tipo_documento,
        numero_documento,
        descripcion,
        archivo_url,
        nombre_archivo,
        archivo_mime_type,
        tama_o_bytes: tamaño_bytes,
        fecha_vencimiento: fecha_vencimiento ? new Date(fecha_vencimiento) : null
      },
      select: {
        id: true,
        paciente_id: true,
        tipo_documento: true,
        numero_documento: true,
        descripcion: true,
        archivo_url: true,
        nombre_archivo: true,
        archivo_mime_type: true,
        tama_o_bytes: true,
        fecha_vencimiento: true,
        activo: true,
        created_at: true,
        updated_at: true
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Documento creado exitosamente',
      data: {
        ...documento,
        id: documento.id.toString(),
        paciente_id: documento.paciente_id.toString(),
        tama_o_bytes: documento.tama_o_bytes?.toString() || null
      }
    });
  } catch (error) {
    console.error('Error al crear documento:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al crear el documento'
    });
  }
};

// ============================================================================
// CONTROLLER: CREAR DOCUMENTO CON UPLOAD VERIFICADO (POST /upload)
// ============================================================================
export const crearDocumentoUpload = async (req, res) => {
  try {
    // Validar que hay archivo
    if (!req.file) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'El archivo es obligatorio'
      });
    }

    // Validar datos en body
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        errors: errors.array() 
      });
    }

    const {
      paciente_id,
      tipo_documento,
      numero_documento,
      descripcion,
      fecha_vencimiento
    } = req.body;
    const file = req.file;

    // Validar que paciente existe
    const paciente = await prisma.paciente.findUnique({
      where: { id: BigInt(paciente_id) }
    });

    if (!paciente) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Paciente no encontrado'
      });
    }

    // Validaciones estrictas del archivo
    // - Tamaño máximo 10MB (detectado por multer, pero validamos aquí también)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      return res.status(400).json({
        error: 'Bad request',
        message: `Archivo demasiado grande. Máximo 10MB, recibido ${(file.size / 1024 / 1024).toFixed(2)}MB`
      });
    }

    // - Solo tipos permitidos: PDF, JPEG, PNG
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedMimes.includes(file.mimetype)) {
      return res.status(400).json({
        error: 'Bad request',
        message: `Tipo de archivo no permitido: ${file.mimetype}. Solo PDF, JPEG y PNG.`
      });
    }

    let archivo_url = null;
    let nombre_archivo = null;
    let archivo_mime_type = null;
    let tamaño_bytes = null;

    // Subir a Supabase Storage
    try {
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(7);
      const extension = file.originalname.split('.').pop();
      const fileName = `${timestamp}_${randomStr}.${extension}`;
      const bucketPath = `documentos_paciente/${paciente_id}/${fileName}`;

      // Subir archivo
      const { data: uploadedFile, error: uploadError } = await supabase.storage
        .from(process.env.SUPABASE_STORAGE_BUCKET || 'documentos')
        .upload(bucketPath, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        });

      if (uploadError) {
        console.error('Error Supabase Storage:', uploadError);
        return res.status(400).json({
          error: 'Storage error',
          message: `No se pudo subir el archivo: ${uploadError.message}`
        });
      }

      // Obtener URL pública
      const { data: urlData } = supabase.storage
        .from(process.env.SUPABASE_STORAGE_BUCKET || 'documentos')
        .getPublicUrl(bucketPath);

      archivo_url = urlData.publicUrl;
      nombre_archivo = file.originalname;
      archivo_mime_type = file.mimetype;
      tamaño_bytes = BigInt(file.size);

    } catch (storageError) {
      console.error('Error procesando archivo Supabase:', storageError);
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Error al procesar el archivo',
        details: process.env.NODE_ENV === 'development' ? storageError.message : undefined
      });
    }

    // Guardar registro en base de datos
    try {
      const documento = await prisma.documento.create({
        data: {
          paciente_id: BigInt(paciente_id),
          tipo_documento,
          numero_documento,
          descripcion,
          archivo_url,
          nombre_archivo,
          archivo_mime_type,
          tama_o_bytes: tamaño_bytes,
          fecha_vencimiento: fecha_vencimiento ? new Date(fecha_vencimiento) : null,
          activo: true
        },
        select: {
          id: true,
          paciente_id: true,
          tipo_documento: true,
          numero_documento: true,
          descripcion: true,
          archivo_url: true,
          nombre_archivo: true,
          archivo_mime_type: true,
          tama_o_bytes: true,
          fecha_vencimiento: true,
          activo: true,
          created_at: true,
          updated_at: true
        }
      });

      return res.status(201).json({
        success: true,
        message: 'Documento subido y registrado exitosamente',
        data: {
          ...documento,
          id: documento.id.toString(),
          paciente_id: documento.paciente_id.toString(),
          tama_o_bytes: documento.tama_o_bytes?.toString() || null,
          archivo_url: archivo_url // Confirmar URL pública
        }
      });

    } catch (dbError) {
      console.error('Error guardando documento en BD:', dbError);
      
      // Intenta eliminar el archivo de Storage si falló el guardado en BD
      try {
        const bucketPath = `documentos_paciente/${paciente_id}/${archivo_url.split('/').pop()}`;
        await supabase.storage
          .from(process.env.SUPABASE_STORAGE_BUCKET || 'documentos')
          .remove([bucketPath]);
      } catch (deleteError) {
        console.error('Error intentando limpiar archivo:', deleteError);
      }

      return res.status(500).json({
        error: 'Internal server error',
        message: 'Error al guardar el documento en la base de datos',
        details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      });
    }

  } catch (error) {
    console.error('Error general en crearDocumentoUpload:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error inesperado procesando el documento',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ============================================================================
// CONTROLLER: OBTENER DOCUMENTOS POR PACIENTE
// ============================================================================
export const obtenerDocumentosPorPaciente = async (req, res) => {
  try {
    const { paciente_id } = req.params;
    const { skip = 0, take = 10, tipo_documento, activo = true } = req.query;

    // Validar que paciente existe
    const paciente = await prisma.paciente.findUnique({
      where: { id: BigInt(paciente_id) }
    });

    if (!paciente) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Paciente no encontrado'
      });
    }

    const where = {
      paciente_id: BigInt(paciente_id),
      activo: activo === 'false' ? false : true
    };

    if (tipo_documento) {
      where.tipo_documento = tipo_documento;
    }

    const [documentos, total] = await Promise.all([
      prisma.documento.findMany({
        where,
        skip: parseInt(skip),
        take: parseInt(take),
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          paciente_id: true,
          tipo_documento: true,
          numero_documento: true,
          descripcion: true,
          archivo_url: true,
          nombre_archivo: true,
          archivo_mime_type: true,
          tama_o_bytes: true,
          fecha_vencimiento: true,
          activo: true,
          created_at: true,
          updated_at: true
        }
      }),
      prisma.documento.count({ where })
    ]);

    return res.status(200).json({
      success: true,
      data: documentos.map(d => ({
        ...d,
        id: d.id.toString(),
        paciente_id: d.paciente_id.toString(),
        tama_o_bytes: d.tama_o_bytes?.toString() || null
      })),
      pagination: {
        total,
        skip: parseInt(skip),
        take: parseInt(take),
        pages: Math.ceil(total / parseInt(take))
      }
    });
  } catch (error) {
    console.error('Error al obtener documentos:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener los documentos'
    });
  }
};

// ============================================================================
// CONTROLLER: OBTENER UN DOCUMENTO
// ============================================================================
export const obtenerDocumento = async (req, res) => {
  try {
    const { id } = req.params;

    const documento = await prisma.documento.findUnique({
      where: { id: BigInt(id) },
      select: {
        id: true,
        paciente_id: true,
        tipo_documento: true,
        numero_documento: true,
        descripcion: true,
        archivo_url: true,
        nombre_archivo: true,
        archivo_mime_type: true,
        tama_o_bytes: true,
        fecha_vencimiento: true,
        activo: true,
        created_at: true,
        updated_at: true,
        paciente: {
          select: {
            id: true,
            dni: true,
            numero_historia_clinica: true
          }
        }
      }
    });

    if (!documento) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Documento no encontrado'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...documento,
        id: documento.id.toString(),
        paciente_id: documento.paciente_id.toString(),
        tama_o_bytes: documento.tama_o_bytes?.toString() || null,
        paciente: {
          ...documento.paciente,
          id: documento.paciente.id.toString()
        }
      }
    });
  } catch (error) {
    console.error('Error al obtener documento:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener el documento'
    });
  }
};

// ============================================================================
// CONTROLLER: ACTUALIZAR DOCUMENTO
// ============================================================================
export const actualizarDocumento = async (req, res) => {
  try {
    const { id } = req.params;
    const { numero_documento, descripcion, fecha_vencimiento, activo } = req.body;

    const documento = await prisma.documento.update({
      where: { id: BigInt(id) },
      data: {
        numero_documento,
        descripcion,
        fecha_vencimiento: fecha_vencimiento ? new Date(fecha_vencimiento) : null,
        activo
      },
      select: {
        id: true,
        paciente_id: true,
        tipo_documento: true,
        numero_documento: true,
        descripcion: true,
        archivo_url: true,
        nombre_archivo: true,
        fecha_vencimiento: true,
        activo: true,
        created_at: true,
        updated_at: true
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Documento actualizado',
      data: {
        ...documento,
        id: documento.id.toString(),
        paciente_id: documento.paciente_id.toString()
      }
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        error: 'Not found',
        message: 'Documento no encontrado'
      });
    }
    console.error('Error al actualizar documento:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al actualizar el documento'
    });
  }
};

// ============================================================================
// CONTROLLER: ELIMINAR DOCUMENTO (SOFT DELETE)
// ============================================================================
export const eliminarDocumento = async (req, res) => {
  try {
    const { id } = req.params;

    // Soft delete: marcar como inactivo
    await prisma.documento.update({
      where: { id: BigInt(id) },
      data: { activo: false }
    });

    return res.status(200).json({
      success: true,
      message: 'Documento eliminado exitosamente'
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        error: 'Not found',
        message: 'Documento no encontrado'
      });
    }
    console.error('Error al eliminar documento:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al eliminar el documento'
    });
  }
};

export default {
  upload,
  uploadDocumento,
  crearDocumento,
  crearDocumentoUpload,
  obtenerDocumentosPorPaciente,
  obtenerDocumento,
  actualizarDocumento,
  eliminarDocumento
};
