import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import authRoutes from './src/routes/auth.js';
import pacientesRoutes from './src/routes/pacientes.js';
import turnosRoutes from './src/routes/turnos.js';
import dashboardRoutes from './src/routes/dashboard.js';
import historiasClinicasRoutes from './src/routes/historias-clinicas.js';
import estudiosAdjuntosRoutes from './src/routes/estudios-adjuntos.js';
import documentosRoutes from './src/routes/documentos.js';
import adminRoutes from './src/routes/admin.js';
import doctorRoutes from './src/routes/doctor.js';
import cie10Routes from './src/routes/cie10.js';
import roleMiddleware from './src/middlewares/role.js';

// Cargar variables de entorno
dotenv.config();

// Setup __dirname para ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inicializar Prisma
const prisma = new PrismaClient();

// Crear aplicación Express
const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================================================
// MIDDLEWARES GLOBALES
// ============================================================================

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie parser
app.use(cookieParser());

// Configurar multer para uploads
const uploadDir = path.join(__dirname, 'uploads', 'documentos');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, name + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
    }
  }
});

// Middleware de logging básico
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// CONFIGURACIÓN DE VISTAS (EJS) Y ARCHIVOS ESTÁTICOS
// ============================================================================

// Configurar EJS como view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================================
// MIDDLEWARE DE AUTENTICACIÓN PARA RUTAS FRONTEND
// ============================================================================

/**
 * Middleware que verifica si el usuario tiene una sesión válida
 * Si no, redirige a /login
 */
const requireAuth = (req, res, next) => {
  const token = req.cookies.auth_token;

  if (!token) {
    return res.redirect('/login');
  }

  try {
    // Verificar y decodificar el token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (error) {
    // Token inválido o expirado
    res.clearCookie('auth_token');
    return res.redirect('/login');
  }
};

/**
 * Middleware que verifica el rol del usuario
 * Valida que el usuario tenga uno de los roles permitidos
 */
const requireRole = (rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).redirect('/login');
    }

    if (!rolesPermitidos.includes(req.usuario.role)) {
      return res.status(403).render('pages/403', {
        title: 'Acceso Denegado',
        message: 'No tienes permiso para acceder a esta página',
        usuarioRole: req.usuario.role
      });
    }

    next();
  };
};

// ============================================================================
// RUTAS
// ============================================================================

// Ruta de salud
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'LEMES Medical API is running',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV
  });
});

// Ruta raíz - Redirigir a /login
app.get('/', (req, res) => {
  const token = req.cookies.auth_token;
  if (token) {
    res.redirect('/dashboard');
  } else {
    res.redirect('/login');
  }
});

// ============================================================================
// RUTAS DE FRONTEND (VISTAS EJS) - CON AUTENTICACIÓN
// ============================================================================

// Dashboard Secretaria
app.get('/secretaria/dashboard', requireAuth, requireRole(['secretaria']), (req, res) => {
  res.render('pages/dashboard-agenda', {
    title: 'Dashboard Secretaría',
    user: {
      nombre: req.usuario.nombre,
      apellido: req.usuario.apellido,
      rol: req.usuario.role,
      email: req.usuario.email
    }
  });
});

// Dashboard General (Redirección)
app.get('/dashboard', requireAuth, (req, res) => {
  const { role } = req.usuario;

  if (role === 'admin') {
    return res.redirect('/admin/dashboard');
  }
  
  if (role === 'doctor') {
    return res.redirect('/doctor/dashboard');
  }

  if (role === 'secretaria') {
    return res.redirect('/secretaria/dashboard');
  }

  // Fallback para otros roles o si no coincide
  res.render('pages/dashboard-agenda', {
    title: 'Dashboard',
    user: {
      nombre: req.usuario.nombre,
      apellido: req.usuario.apellido,
      rol: req.usuario.role,
      email: req.usuario.email
    }
  });
});

// Pacientes
app.get('/pacientes', requireAuth, (req, res) => {
  res.render('pages/pacientes', {
    title: 'Pacientes',
    user: {
      nombre: req.usuario.nombre,
      apellido: req.usuario.apellido,
      rol: req.usuario.role,
      email: req.usuario.email
    }
  });
});

// Turnos
app.get('/turnos', requireAuth, (req, res) => {
  res.render('pages/turnos', {
    title: 'Turnos',
    user: {
      nombre: req.usuario.nombre,
      apellido: req.usuario.apellido,
      rol: req.usuario.role,
      email: req.usuario.email
    }
  });
});

// Historias Clínicas - Listado de Pacientes
app.get('/historias', requireAuth, async (req, res) => {
  try {
    // Obtener pacientes con historias clínicas activas
    const historias = await prisma.historiaClinica.findMany({
      where: { activa: true },
      include: {
        paciente: {
          include: {
            persona: true
          }
        },
        medico_apertura: {
          select: {
            id: true,
            nombre: true,
            apellido: true
          }
        }
      },
      orderBy: { fecha_apertura: 'desc' }
    });

    // Mapear datos para la vista - mostrar PACIENTES con historia
    const historiasFormato = historias
      .filter(h => h.paciente && h.paciente.persona)
      .map(h => {
        // Calcular edad
        const fechaNac = new Date(h.paciente.persona.fecha_nacimiento);
        const hoy = new Date();
        let edad = hoy.getFullYear() - fechaNac.getFullYear();
        const mes = hoy.getMonth() - fechaNac.getMonth();
        if (mes < 0 || (mes === 0 && hoy.getDate() < fechaNac.getDate())) {
          edad--;
        }
        
        return {
          paciente_id: h.paciente_id ? h.paciente_id.toString() : '',
          nombre_paciente: `${h.paciente.persona.nombre || ''} ${h.paciente.persona.apellido || ''}`.trim(),
          dni: h.paciente.persona.dni || '-',
          edad: edad || '-',
          telefono: h.paciente.persona.telefono || '-',
          email: h.paciente.persona.email || '-',
          obra_social: h.paciente.obra_social || '-',
          numero_afiliado: h.paciente.numero_afiliado || '-',
          medico: h.medico_apertura ? `Dr/Dra. ${h.medico_apertura.nombre || ''} ${h.medico_apertura.apellido || ''}`.trim() : '-'
        };
      });

    res.render('pages/historias', {
      title: 'Historias Clínicas',
      historias: historiasFormato || [],
      error: null,
      user: req.usuario || {}
    });
  } catch (error) {
    console.error('Error al obtener historias:', error);
    res.render('pages/historias', {
      title: 'Historias Clínicas',
      historias: [],
      error: error.message || 'Error al cargar historias',
      user: req.usuario || {}
    });
  }
});

// Historia Clínica Detallada
app.get('/historia/:pacienteId', requireAuth, async (req, res) => {
  try {
    const { pacienteId } = req.params;
    
    // Obtener datos del paciente con persona relacionada
    const paciente = await prisma.paciente.findUnique({
      where: { id: BigInt(pacienteId) },
      include: {
        persona: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            email: true,
            telefono: true,
            dni: true,
            fecha_nacimiento: true,
            sexo: true,
            direccion: true
          }
        }
      }
    });

    if (!paciente) {
      return res.status(404).render('pages/404', {
        title: 'Paciente no encontrado',
        message: 'El paciente que buscas no existe'
      });
    }

    // Calcular edad
    const hoy = new Date();
    const fecha_nacimiento = paciente.persona?.fecha_nacimiento ? new Date(paciente.persona.fecha_nacimiento) : null;
    let edad = 0;
    
    if (fecha_nacimiento) {
      edad = hoy.getFullYear() - fecha_nacimiento.getFullYear();
      const mes = hoy.getMonth() - fecha_nacimiento.getMonth();
      if (mes < 0 || (mes === 0 && hoy.getDate() < fecha_nacimiento.getDate())) {
        edad--;
      }
    }

    // Obtener la historia clínica más reciente (activa)
    let historia = await prisma.historiaClinica.findFirst({
      where: {
        paciente_id: BigInt(pacienteId),
        activa: true
      },
      orderBy: {
        fecha_apertura: 'desc'
      },
      include: {
        consultas: {
          include: {
            medico: {
              select: {
                nombre: true,
                apellido: true
              }
            },
            signos_vitales: true,
            diagnosticos: true,
            tratamientos: true,
            estudios_complementarios: true,
            documentos_adjuntos: true
          },
          orderBy: {
            fecha: 'desc'
          }
        },
        medico_apertura: {
          select: {
            nombre: true,
            apellido: true
          }
        }
      }
    });

    // Si no hay historia activa, obtener la más reciente aunque esté inactiva
    if (!historia) {
      historia = await prisma.historiaClinica.findFirst({
        where: {
          paciente_id: BigInt(pacienteId)
        },
        orderBy: {
          fecha_apertura: 'desc'
        },
        include: {
          consultas: {
            include: {
              medico: {
                select: {
                  nombre: true,
                  apellido: true
                }
              },
              signos_vitales: true,
              diagnosticos: true,
              tratamientos: true,
              estudios_complementarios: true,
              documentos_adjuntos: true
            },
            orderBy: {
              fecha: 'desc'
            }
          },
          medico_apertura: {
            select: {
              nombre: true,
              apellido: true
            }
          }
        }
      });
    }

    res.render('pages/historia-detalle', {
      title: `Historia Clínica - ${paciente.persona?.nombre || 'Paciente'} ${paciente.persona?.apellido || ''}`,
      paciente: {
        id: paciente.id.toString(),
        nombre: paciente.persona?.nombre || 'Sin nombre',
        apellido: paciente.persona?.apellido || 'Sin apellido',
        edad: edad || 'N/A',
        sexo: paciente.persona?.sexo || 'N/A',
        dni: paciente.persona?.dni || 'N/A',
        email: paciente.persona?.email || 'N/A',
        telefono: paciente.persona?.telefono || 'N/A',
        fecha_nacimiento: fecha_nacimiento ? fecha_nacimiento.toLocaleDateString('es-AR') : 'N/A',
        direccion: paciente.persona?.direccion || 'N/A',
        obra_social: paciente.obra_social || 'N/A',
        numero_afiliado: paciente.numero_afiliado || 'N/A'
      },
      historia: historia ? {
        id: historia.id.toString(),
        fecha_apertura: historia.fecha_apertura ? new Date(historia.fecha_apertura).toLocaleDateString('es-AR') : '-',
        medico_apertura: historia.medico_apertura ? `Dr/Dra. ${historia.medico_apertura.nombre} ${historia.medico_apertura.apellido}` : '-',
        activa: historia.activa,
        consultas: historia.consultas ? historia.consultas.map(c => ({
          id: c.id.toString(),
          fecha: c.fecha ? new Date(c.fecha).toLocaleDateString('es-AR') : '-',
          medico: c.medico ? `Dr/Dra. ${c.medico.nombre} ${c.medico.apellido}` : '-',
          motivo: c.motivo_consulta || '-',
          signos_vitales: c.signos_vitales || [],
          diagnosticos: c.diagnosticos || [],
          tratamientos: c.tratamientos || [],
          estudios: c.estudios_complementarios || [],
          documentos: c.documentos_adjuntos || []
        })) : []
      } : null,
      user: {
        nombre: req.usuario.nombre,
        apellido: req.usuario.apellido,
        rol: req.usuario.role,
        email: req.usuario.email
      }
    });
  } catch (error) {
    console.error('Error en historia detallada:', error);
    res.status(500).render('pages/500', {
      title: 'Error',
      message: 'Ocurrió un error al cargar la historia clínica: ' + error.message
    });
  }
});

// Actualizar historia clínica
app.put('/api/historia/:historiaId', requireAuth, upload.array('documentos', 10), async (req, res) => {
  try {
    const { historiaId } = req.params;
    const { 
      motivo_consulta, 
      anamnesis, 
      antecedentes, 
      diagnostico_principal, 
      impresion_clinica,
      presion_arterial,
      frecuencia_cardiaca,
      temperatura,
      saturacion_o2
    } = req.body;

    console.log('📝 Guardando historia clínica...');
    console.log('   - Historia ID:', historiaId);
    console.log('   - Archivos recibidos:', req.files?.length || 0);
    console.log('   - Campos recibidos:', { motivo_consulta: !!motivo_consulta, anamnesis: !!anamnesis, antecedentes: !!antecedentes, diagnostico_principal: !!diagnostico_principal, impresion_clinica: !!impresion_clinica });
    console.log('   - Signos vitales:', { presion_arterial, frecuencia_cardiaca, temperatura, saturacion_o2 });

    // Verificar que la historia clínica existe
    const historia = await prisma.historiaClinica.findUnique({
      where: { id: BigInt(historiaId) }
    });

    if (!historia) {
      return res.status(404).json({
        success: false,
        message: 'Historia clínica no encontrada'
      });
    }

    // Preparar datos para actualizar (solo incluir valores no vacíos)
    const updateData = {};
    if (motivo_consulta !== undefined && motivo_consulta !== '') {
      updateData.motivo_consulta = motivo_consulta.trim();
    }
    if (anamnesis !== undefined && anamnesis !== '') {
      updateData.anamnesis = anamnesis.trim();
    }
    if (antecedentes !== undefined && antecedentes !== '') {
      updateData.antecedentes_patologicos_personales = antecedentes.trim();
    }
    if (diagnostico_principal !== undefined && diagnostico_principal !== '') {
      updateData.diagnostico_principal = diagnostico_principal.trim();
    }
    if (impresion_clinica !== undefined && impresion_clinica !== '') {
      updateData.impresion_clinica = impresion_clinica.trim();
    }

    // Actualizar historia existente
    updateData.updated_at = new Date();
    const historiaActualizada = await prisma.historiaClinica.update({
      where: { id: BigInt(historiaId) },
      data: updateData
    });
    console.log('✅ Historia clínica actualizada:', historiaId);

    // Procesar signos vitales
    if (presion_arterial || frecuencia_cardiaca || temperatura) {
      console.log('📊 Procesando signos vitales...');
      
      let presion_sistolica, presion_diastolica;
      if (presion_arterial && presion_arterial.includes('/')) {
        const [sist, diast] = presion_arterial.split('/');
        presion_sistolica = parseInt(sist);
        presion_diastolica = parseInt(diast);
      }

      // Buscar si ya existe un registro de signos vitales para esta historia
      const signoVitalExisting = await prisma.signoVital.findFirst({
        where: { historia_clinica_id: BigInt(historiaId) }
      });

      const signoVitalData = {};
      if (presion_sistolica) signoVitalData.presion_sistolica = presion_sistolica;
      if (presion_diastolica) signoVitalData.presion_diastolica = presion_diastolica;
      if (frecuencia_cardiaca) signoVitalData.frecuencia_cardiaca = parseInt(frecuencia_cardiaca);
      if (temperatura) signoVitalData.temperatura_c = parseFloat(temperatura);

      if (signoVitalExisting) {
        // Actualizar signos vitales existentes
        console.log('🔄 Actualizando SignoVital...');
        await prisma.signoVital.update({
          where: { id: signoVitalExisting.id },
          data: signoVitalData
        });
        console.log('✅ SignoVital actualizado');
      } else {
        // Crear nuevos signos vitales
        console.log('🆕 Creando nuevo SignoVital...');
        await prisma.signoVital.create({
          data: {
            historia_clinica_id: BigInt(historiaId),
            ...signoVitalData
          }
        });
        console.log('✅ SignoVital creado');
      }
    }

    // Procesar archivos si existen
    let filesCount = 0;
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const estudio = await prisma.estudioAdjunto.create({
            data: {
              historia_clinica_id: BigInt(historiaId),
              tipo_estudio: 'Documento Adjunto',
              nombre_archivo: file.originalname,
              archivo_url: `/uploads/documentos/${file.filename}`,
              archivo_mime_type: file.mimetype,
              tama_o_bytes: BigInt(file.size),
              descripcion: `Archivo cargado: ${file.originalname}`
            }
          });
          filesCount++;
          console.log(`   ✅ Archivo guardado: ${file.originalname} (${file.size} bytes)`);
        } catch (err) {
          console.error(`   ❌ Error guardando archivo ${file.originalname}:`, err.message);
        }
      }
    }

    console.log(`✅ Historia clínica actualizada con ${filesCount} documento(s)`);

    res.json({
      success: true,
      message: `Historia clínica guardada exitosamente (${filesCount} documento(s))`,
      historia: {
        id: historiaId,
        fecha: historiaActualizada.fecha,
        campos_guardados: {
          motivo_consulta: !!motivo_consulta,
          anamnesis: !!anamnesis,
          antecedentes: !!antecedentes,
          diagnostico_principal: !!diagnostico_principal,
          impresion_clinica: !!impresion_clinica,
          signos_vitales: !!(presion_arterial || frecuencia_cardiaca || temperatura)
        },
        documentos_guardados: filesCount
      }
    });

  } catch (error) {
    console.error('❌ Error al guardar historia:', error);
    res.status(500).json({
      success: false,
      message: 'Error al guardar historia clínica',
      error: error.message
    });
  }
});

// DELETE /api/documentos/:docId - Eliminar documento adjunto
app.delete('/api/documentos/:docId', requireAuth, async (req, res) => {
  try {
    const { docId } = req.params;
    const userId = req.user.id;

    console.log('🗑️ Eliminando documento:', docId, 'Usuario:', userId);

    // Obtener el documento para verificación
    const documento = await prisma.estudioAdjunto.findUnique({
      where: { id: BigInt(docId) },
      include: {
        historia_clinica: {
          include: {
            paciente: true
          }
        }
      }
    });

    if (!documento) {
      return res.status(404).json({
        success: false,
        message: 'Documento no encontrado'
      });
    }

    // Verificar permisos: solo el doctor que creó la historia puede eliminar
    if (documento.historia_clinica.doctor_id !== BigInt(userId)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar este documento'
      });
    }

    // Eliminar archivo del sistema de archivos si existe
    if (documento.archivo_url) {
      const filePath = path.join(process.cwd(), 'uploads', 'documentos', path.basename(documento.archivo_url));
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log('📄 Archivo eliminado:', filePath);
        }
      } catch (err) {
        console.warn('⚠️ Error al eliminar archivo físico:', err.message);
      }
    }

    // Eliminar documento de la base de datos
    await prisma.estudioAdjunto.delete({
      where: { id: BigInt(docId) }
    });

    console.log('✅ Documento eliminado correctamente');
    res.status(200).json({
      success: true,
      message: 'Documento eliminado correctamente'
    });

  } catch (error) {
    console.error('❌ Error al eliminar documento:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar documento',
      error: error.message
    });
  }
});

// POST /api/pacientes - Crear nuevo paciente
app.post('/api/pacientes', requireAuth, async (req, res) => {
  try {
    const { nombre, apellido, email, telefono, dni, fecha_nacimiento, genero, alergias, patologias_cronicas, numero_emergencia, contacto_emergencia } = req.body;

    console.log('➕ Creando nuevo paciente...', {
      nombre, apellido, email, dni, fecha_nacimiento, genero
    });
    
    // Validar datos requeridos
    if (!nombre || !apellido || !email) {
      console.warn('⚠️ Faltan datos requeridos');
      return res.status(400).json({
        success: false,
        message: 'Faltan datos requeridos: nombre, apellido, email'
      });
    }

    // Validar que el email no exista
    const existingUser = await prisma.usuario.findUnique({
      where: { email }
    });

    if (existingUser) {
      console.warn('⚠️ Email ya existe:', email);
      return res.status(400).json({
        success: false,
        message: 'El email ya está en uso'
      });
    }

    // Crear usuario para el paciente
    const newUser = await prisma.usuario.create({
      data: {
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        email: email.trim(),
        password_hash: 'temp_hash_' + Date.now(),
        role: 'paciente',
        telefono: telefono ? telefono.trim() : null,
        activo: true
      }
    });
    
    console.log(`✅ Usuario creado: ${newUser.nombre} ${newUser.apellido} (ID: ${newUser.id})`);

    // Crear paciente con todos los datos
    const newPaciente = await prisma.paciente.create({
      data: {
        usuario_id: newUser.id,
        dni: dni ? dni.trim() : null,
        fecha_nacimiento: fecha_nacimiento ? new Date(fecha_nacimiento) : null,
        genero: genero || 'M',
        alergias: alergias ? alergias.trim() : null,
        patologias_cronicas: patologias_cronicas ? patologias_cronicas.trim() : null,
        numero_emergencia: numero_emergencia ? numero_emergencia.trim() : null,
        contacto_emergencia: contacto_emergencia ? contacto_emergencia.trim() : null,
        numero_historia_clinica: 'HC-' + Date.now(),
        activo: true
      }
    });

    console.log(`✅ Paciente creado: ${newPaciente.id}`);

    res.status(201).json({
      success: true,
      message: 'Paciente creado exitosamente',
      paciente: {
        id: newPaciente.id.toString(),
        nombre: newUser.nombre,
        apellido: newUser.apellido,
        email: newUser.email,
        dni: newPaciente.dni,
        usuario_id: newUser.id.toString()
      }
    });

  } catch (error) {
    console.error('❌ Error al crear paciente:', error.message);
    console.error('Error stack:', error);
    
    // Manejo de email duplicado
    if (error.code === 'P2002' || error.message.includes('Unique constraint')) {
      return res.status(400).json({
        success: false,
        message: 'El email ya está en uso'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error al crear paciente: ' + error.message,
      error: error.message
    });
  }
});

// 🔐 Actualizar Token - Página Helper
app.get('/update-token', (req, res) => {
  res.sendFile(path.join(__dirname, 'TOKEN_UPDATE_HELPER.html'));
});

// Login (SIN autenticación - página pública)
app.get('/login', (req, res) => {
  // Si ya está logueado, redirige a dashboard según rol
  const token = req.cookies.auth_token;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // Redireccionar según el rol
      if (decoded.role === 'admin') {
        return res.redirect('/admin/dashboard');
      } else if (decoded.role === 'doctor') {
        return res.redirect('/doctor/dashboard');
      } else if (decoded.role === 'secretaria') {
        return res.redirect('/secretaria/dashboard');
      } else {
        return res.redirect('/dashboard');
      }
    } catch (error) {
      res.clearCookie('auth_token');
    }
  }
  
  res.render('pages/login', {
    title: 'Iniciar Sesión'
  });
});

// ============================================================================
// RUTAS DE FRONTEND ADMIN (VISTAS EJS) - CON AUTENTICACIÓN
// ============================================================================

// Dashboard Admin
app.get('/admin/dashboard', requireAuth, requireRole(['admin']), (req, res) => {
  res.render('pages/admin-dashboard', {
    title: 'Panel Administrativo',
    user: {
      nombre: req.usuario.nombre,
      apellido: req.usuario.apellido,
      rol: req.usuario.role,
      email: req.usuario.email
    }
  });
});

// DEBUG: Ver datos de turnos
app.get('/api/debug/turnos', async (req, res) => {
  try {
    const turnos = await prisma.turno.findMany({
      include: {
        paciente: {
          include: {
            persona: true
          }
        },
        medico: true
      }
    });
    
    // Convertir BigInt a string para JSON
    const turnosSerializables = turnos.map(t => ({
      id: t.id.toString(),
      paciente_id: t.paciente_id.toString(),
      medico_id: t.medico_id.toString(),
      fecha: t.fecha,
      hora: t.hora,
      estado: t.estado,
      observaciones: t.observaciones,
      paciente: {
        id: t.paciente.id.toString(),
        persona_id: t.paciente.persona_id.toString(),
        persona: {
          nombre: t.paciente.persona.nombre,
          apellido: t.paciente.persona.apellido,
          dni: t.paciente.persona.dni,
          telefono: t.paciente.persona.telefono
        }
      },
      medico: {
        id: t.medico.id.toString(),
        nombre: t.medico.nombre,
        apellido: t.medico.apellido
      }
    }));
    
    console.log('✅ Turnos encontrados:', turnosSerializables.length);
    res.json({
      success: true,
      count: turnosSerializables.length,
      data: turnosSerializables
    });
  } catch (error) {
    console.error('Error en debug:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para dashboard - obtener turnos de hoy CON INFORMACIÓN COMPLETA
app.get('/api/dashboard-turnos', requireAuth, async (req, res) => {
  try {
    console.log('📅 Dashboard request iniciado');

    // Obtener fecha de hoy en la BD (zona horaria local)
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const mañana = new Date(hoy);
    mañana.setDate(mañana.getDate() + 1);

    console.log('📅 Buscando turnos entre:', hoy.toISOString(), 'y', mañana.toISOString());

    // Obtener turnos de hoy CON toda la información relacionada
    const turnos = await prisma.turno.findMany({
      where: {
        fecha: {
          gte: hoy,
          lt: mañana
        }
      },
      include: {
        persona: {
          select: {
            nombre: true,
            apellido: true,
            dni: true,
            telefono: true,
            fecha_nacimiento: true,
            obra_social: true
          }
        },
        medico: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            especialidad: true
          }
        },
        consulta: {
          select: {
            id: true,
            estado: true,
            motivo_consulta: true,
            fecha: true
          }
        }
      },
      orderBy: { hora: 'asc' }
    });

    console.log('✅ Turnos encontrados:', turnos.length);

    // Mapear a formato para el frontend
    const datos = turnos.map(turno => {
      const persona = turno.persona;
      
      // Calcular edad
      let edad = '--';
      if (persona.fecha_nacimiento) {
        const hoy = new Date();
        const nacimiento = new Date(persona.fecha_nacimiento);
        edad = hoy.getFullYear() - nacimiento.getFullYear();
        const mes = hoy.getMonth() - nacimiento.getMonth();
        if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
          edad--;
        }
      }

      const estadoColores = {
        'PENDIENTE': '#FFC107',
        'CONFIRMADO': '#17A2B8',
        'EN_CONSULTA': '#007BFF',
        'ATENDIDO': '#28A745',
        'AUSENTE': '#6C757D',
        'CANCELADO': '#DC3545'
      };

      return {
        id: turno.id.toString(),
        hora: turno.hora,
        fecha: turno.fecha.toLocaleDateString('es-AR'),
        estado: turno.estado,
        estadoColor: estadoColores[turno.estado] || '#007BFF',
        paciente: {
          nombre: persona.nombre,
          apellido: persona.apellido,
          dni: persona.dni,
          telefono: persona.telefono || '-',
          edad: edad,
          obraSocial: persona.obra_social || '-'
        },
        consulta: turno.consulta ? {
          id: turno.consulta.id.toString(),
          estado: turno.consulta.estado,
          motivo: turno.consulta.motivo_consulta || '-',
          fecha: turno.consulta.fecha
        } : null,
        observaciones: turno.observaciones || '-'
      };
    });

    console.log('📊 Datos procesados:', datos.length);

    return res.status(200).json({
      success: true,
      data: datos,
      count: datos.length
    });
  } catch (error) {
    console.error('❌ Error al obtener dashboard turnos:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// ============================================================================
// ENDPOINT TURNOS SEMANA (para calendario)
// ============================================================================
app.get('/api/agenda-semanal', requireAuth, async (req, res) => {
  try {
    const medico_id = BigInt(req.usuario.id);
    
    // Obtener próximos 7 días desde hoy
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const hace7Dias = new Date(hoy);
    hace7Dias.setDate(hace7Dias.getDate() + 7);

    console.log('📅 Buscando turnos semana para doctor:', medico_id.toString());
    console.log('📅 Rango:', hoy.toISOString(), 'a', hace7Dias.toISOString());

    // Obtener turnos con todos los datos
    const turnos = await prisma.turno.findMany({
      where: {
        medico_id: medico_id,
        fecha: {
          gte: hoy,
          lt: hace7Dias
        }
      },
      include: {
        persona: {
          select: {
            nombre: true,
            apellido: true,
            dni: true,
            telefono: true,
            fecha_nacimiento: true,
            obra_social: true
          }
        },
        medico: {
          select: {
            id: true,
            nombre: true,
            apellido: true
          }
        }
      },
      orderBy: [
        { fecha: 'asc' },
        { hora: 'asc' }
      ]
    });

    console.log('✅ Turnos encontrados para semana:', turnos.length);

    // Mapear datos para el frontend
    const datos = turnos.map(turno => {
      const persona = turno.persona;
      
      if (!persona) {
        console.warn('⚠️ Turno sin persona:', turno.id);
        return null;
      }

      // Calcular edad
      let edad = '--';
      if (persona.fecha_nacimiento) {
        const hoy = new Date();
        const nacimiento = new Date(persona.fecha_nacimiento);
        edad = hoy.getFullYear() - nacimiento.getFullYear();
        const mes = hoy.getMonth() - nacimiento.getMonth();
        if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
          edad--;
        }
      }

      // Convertir fecha al formato YYYY-MM-DD
      const fechaY = turno.fecha.getFullYear();
      const fechaM = String(turno.fecha.getMonth() + 1).padStart(2, '0');
      const fechaD = String(turno.fecha.getDate()).padStart(2, '0');
      const fechaKey = `${fechaY}-${fechaM}-${fechaD}`;

      return {
        id: turno.id.toString(),
        fecha: fechaKey, // Formato YYYY-MM-DD para que el frontend lo agrupe correctamente
        hora: turno.hora,
        estado: turno.estado,
        persona: {
          id: turno.persona_id.toString(),
          nombre: persona.nombre,
          apellido: persona.apellido,
          dni: persona.dni,
          telefono: persona.telefono || '-',
          edad: edad,
          obraSocial: persona.obra_social || '-'
        }
      };
    }).filter(d => d !== null);

    console.log('📊 Datos procesados para calendario:', datos.length);

    return res.status(200).json({
      success: true,
      data: datos,
      count: datos.length
    });

  } catch (error) {
    console.error('❌ Error en agenda semanal:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// ============================================================================
// ENDPOINT ALERTAS CLÍNICAS
// ============================================================================
app.get('/api/alertas-clinicas', requireAuth, async (req, res) => {
  try {
    const alertas = [];

    // 1. Pacientes con glucemia > 250
    const glucemiaAlta = await prisma.signoVital.findMany({
      where: {
        glucemia_mg_dl: {
          gt: 250
        }
      },
      include: {
        consulta: {
          include: {
            historia: {
              include: {
                paciente: {
                  include: {
                    persona: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { fecha_registro: 'desc' },
      take: 50
    });

    glucemiaAlta.forEach(sv => {
      if (sv.consulta?.historia?.paciente) {
        alertas.push({
          tipo: 'glucemia',
          titulo: '🔴 Glucemia Alta',
          paciente: `${sv.consulta.historia.paciente.persona.nombre} ${sv.consulta.historia.paciente.persona.apellido}`,
          valor: `${sv.glucemia_mg_dl} mg/dL`,
          color: '#DC3545',
          fecha: sv.fecha_registro
        });
      }
    });

    // 2. Pacientes con IMC > 30
    const imcAlto = await prisma.signoVital.findMany({
      where: {
        imc: {
          gt: 30
        }
      },
      include: {
        consulta: {
          include: {
            historia: {
              include: {
                paciente: {
                  include: {
                    persona: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { fecha_registro: 'desc' },
      take: 50
    });

    imcAlto.forEach(sv => {
      if (sv.consulta?.historia?.paciente) {
        alertas.push({
          tipo: 'imc',
          titulo: '⚠️ IMC Elevado',
          paciente: `${sv.consulta.historia.paciente.persona.nombre} ${sv.consulta.historia.paciente.persona.apellido}`,
          valor: `IMC: ${sv.imc.toFixed(1)}`,
          color: '#FFC107',
          fecha: sv.fecha_registro
        });
      }
    });

    // 3. Pacientes sin control en 6 meses
    const seisAtrasMeses = new Date();
    seisAtrasMeses.setMonth(seisAtrasMeses.getMonth() - 6);

    const sinControl = await prisma.historiaClinica.findMany({
      where: {
        activa: true,
        consultas: {
          none: {
            fecha: {
              gte: seisAtrasMeses
            }
          }
        }
      },
      include: {
        paciente: {
          include: {
            persona: true
          }
        },
        consultas: {
          orderBy: { fecha: 'desc' },
          take: 1
        }
      },
      take: 50
    });

    sinControl.forEach(hc => {
      const ultimaConsulta = hc.consultas[0];
      alertas.push({
        tipo: 'control',
        titulo: '📋 Control Pendiente',
        paciente: `${hc.paciente.persona.nombre} ${hc.paciente.persona.apellido}`,
        valor: ultimaConsulta ? `Última: ${new Date(ultimaConsulta.fecha).toLocaleDateString('es-AR')}` : 'Sin consultorio',
        color: '#0D6EFD',
        fecha: ultimaConsulta?.fecha
      });
    });

    res.json({
      success: true,
      alertas: alertas,
      count: alertas.length
    });
  } catch (error) {
    console.error('❌ Error en alertas clínicas:', error);
    res.status(500).json({
      error: 'Error al obtener alertas',
      message: error.message
    });
  }
});

// ============================================================================
// ENDPOINT HISTORIA CLÍNICA COMPLETA
// ============================================================================
app.get('/api/historia-clinica/:pacienteId', requireAuth, async (req, res) => {
  try {
    const { pacienteId } = req.params;

    const historia = await prisma.historiaClinica.findFirst({
      where: {
        paciente_id: parseInt(pacienteId),
        activa: true
      },
      include: {
        paciente: {
          include: {
            persona: true
          }
        },
        consultas: {
          include: {
            signos_vitales: true,
            diagnosticos: true,
            tratamientos: true,
            estudios: true,
            documentos: true
          },
          orderBy: { fecha: 'desc' }
        },
        antecedentes: true
      }
    });

    if (!historia) {
      return res.status(404).json({
        error: 'Historia clínica no encontrada'
      });
    }

    res.json({
      success: true,
      data: historia
    });
  } catch (error) {
    console.error('❌ Error en historia clínica:', error);
    res.status(500).json({
      error: 'Error al obtener historia clínica',
      message: error.message
    });
  }
});

// ============================================================================
// ENDPOINT CREAR TURNO (MÉDICO) - Para una PERSONA existente
// ============================================================================
app.post('/api/turnos/crear', requireAuth, async (req, res) => {
  try {
    const { persona_id, fecha, hora, observaciones } = req.body;

    if (!persona_id || !fecha || !hora) {
      return res.status(400).json({
        error: 'Faltan datos requeridos',
        message: 'persona_id, fecha y hora son obligatorios'
      });
    }

    // Verificar que la persona exista
    const persona = await prisma.persona.findUnique({
      where: { id: BigInt(persona_id) }
    });

    if (!persona) {
      return res.status(404).json({
        error: 'Persona no encontrada'
      });
    }

    const turno = await prisma.turno.create({
      data: {
        persona_id: BigInt(persona_id),
        medico_id: BigInt(req.usuario.id),
        fecha: new Date(fecha),
        hora: hora,
        estado: 'PENDIENTE',
        observaciones: observaciones || null
      },
      include: {
        persona: true
      }
    });

    res.status(201).json({
      success: true,
      data: {
        id: turno.id.toString(),
        persona: {
          id: turno.persona.id.toString(),
          nombre: turno.persona.nombre,
          apellido: turno.persona.apellido,
          dni: turno.persona.dni,
          telefono: turno.persona.telefono
        },
        fecha: turno.fecha.toISOString(),
        hora: turno.hora,
        estado: turno.estado,
        observaciones: turno.observaciones
      },
      message: 'Turno creado exitosamente'
    });
  } catch (error) {
    console.error('❌ Error al crear turno:', error);
    res.status(500).json({
      error: 'Error al crear turno',
      message: error.message
    });
  }
});

// ============================================================================
// ENDPOINT CREAR TURNO (con PERSONA existente o nueva)
// ============================================================================
app.post('/api/turnos/crear-con-paciente', requireAuth, async (req, res) => {
  try {
    const {
      nombre,
      apellido,
      dni,
      telefono,
      fecha_nacimiento,
      obra_social,
      numero_afiliado,
      fecha,
      hora,
      observaciones
    } = req.body;

    // Validaciones
    if (!nombre || !apellido || !dni || !fecha || !hora) {
      return res.status(400).json({
        error: 'Faltan datos requeridos',
        message: 'Nombre, Apellido, DNI, Fecha y Hora son obligatorios'
      });
    }

    // BUSCAR PERSONA por DNI (si existe, reutilizar)
    let persona = await prisma.persona.findFirst({
      where: { dni: parseInt(dni) }
    });

    if (!persona) {
      // Si NO existe, crearla
      persona = await prisma.persona.create({
        data: {
          nombre: nombre.trim(),
          apellido: apellido.trim(),
          dni: parseInt(dni),
          telefono: telefono?.trim() || null,
          fecha_nacimiento: fecha_nacimiento ? new Date(fecha_nacimiento) : null,
          obra_social: obra_social?.trim() || null,
          numero_afiliado: numero_afiliado?.trim() || null,
          email: null,
          sexo: null,
          direccion: null
        }
      });
      console.log('✅ Persona CREADA:', persona.id, `(${persona.nombre} ${persona.apellido})`);
    } else {
      console.log('✅ Persona ENCONTRADA:', persona.id, `(${persona.nombre} ${persona.apellido})`);
    }

    // BUSCAR O CREAR PACIENTE para esa Persona
    // ELIMINADO: Ya no se crea PACIENTE aquí, se crea cuando se INICIA LA CONSULTA

    // Crear el turno
    const turno = await prisma.turno.create({
      data: {
        persona_id: persona.id,
        medico_id: BigInt(req.usuario.id),
        fecha: new Date(fecha),
        hora: hora,
        estado: 'PENDIENTE',
        observaciones: observaciones || null
      },
      include: {
        persona: true
      }
    });

    console.log('✅ Turno CREADO:', turno.id);


    // Respuesta
    res.status(201).json({
      success: true,
      data: {
        id: turno.id.toString(),
        persona: {
          id: persona.id.toString(),
          nombre: persona.nombre,
          apellido: persona.apellido,
          dni: persona.dni,
          telefono: persona.telefono,
          fecha_nacimiento: persona.fecha_nacimiento?.toISOString(),
          obra_social: persona.obra_social,
          numero_afiliado: persona.numero_afiliado
        },
        fecha: turno.fecha.toISOString(),
        hora: turno.hora,
        estado: turno.estado,
        observaciones: turno.observaciones
      },
      message: 'Turno creado exitosamente (Persona registrada como PENDIENTE)'
    });

  } catch (error) {
    console.error('❌ Error al crear turno:', error);
    res.status(500).json({
      error: 'Error al crear turno',
      message: error.message
    });
  }
});

// ============================================================================
// ENDPOINT CREAR CONSULTA SIN TURNO
// ============================================================================
app.post('/api/consultas/crear', requireAuth, async (req, res) => {
  try {
    const { paciente_id, turno_id, motivo_consulta } = req.body;

    if (!paciente_id || !motivo_consulta) {
      return res.status(400).json({
        error: 'Faltan paciente_id y motivo_consulta'
      });
    }

    // Obtener o crear historia clínica
    let historia = await prisma.historia_clinica.findFirst({
      where: {
        paciente_id: parseInt(paciente_id),
        activa: true
      }
    });

    if (!historia) {
      historia = await prisma.historia_clinica.create({
        data: {
          paciente_id: parseInt(paciente_id),
          creada_por_medico: req.usuario.id,
          activa: true
        }
      });
    }

    const consulta = await prisma.consulta_medica.create({
      data: {
        historia_clinica_id: historia.id,
        medico_id: req.usuario.id,
        turno_id: turno_id ? parseInt(turno_id) : null,
        estado: 'INICIADA',
        motivo_consulta: motivo_consulta,
        fecha: new Date()
      },
      include: {
        historia_clinica: {
          include: {
            paciente: {
              include: {
                persona: true
              }
            }
          }
        }
      }
    });

    res.json({
      success: true,
      data: consulta,
      message: 'Consulta creada exitosamente'
    });
  } catch (error) {
    console.error('❌ Error al crear consulta:', error);
    res.status(500).json({
      error: 'Error al crear consulta',
      message: error.message
    });
  }
});

// ============================================================================
// ENDPOINT: ALTA DE PACIENTE (crear Persona + Paciente)
// ============================================================================
app.post('/api/pacientes/alta', requireAuth, async (req, res) => {
  try {
    const { nombre, apellido, dni, fecha_nacimiento, sexo, telefono, email, direccion, obra_social, numero_afiliado, observaciones } = req.body;

    if (!nombre || !apellido || !dni || !fecha_nacimiento) {
      return res.status(400).json({
        error: 'Faltan datos requeridos: nombre, apellido, dni, fecha_nacimiento'
      });
    }

    // Verificar si DNI ya existe
    const personaExistente = await prisma.persona.findUnique({
      where: { dni: parseInt(dni) }
    });

    if (personaExistente) {
      return res.status(409).json({
        error: 'El DNI ya está registrado'
      });
    }

    // Crear Persona primero
    const persona = await prisma.persona.create({
      data: {
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        dni: parseInt(dni),
        fecha_nacimiento: new Date(fecha_nacimiento),
        sexo: sexo || 'OTRO',
        telefono: telefono || null,
        email: email || null,
        direccion: direccion || null
      }
    });

    // Crear Paciente asociado
    const paciente = await prisma.paciente.create({
      data: {
        persona_id: persona.id,
        obra_social: obra_social || null,
        numero_afiliado: numero_afiliado || null,
        observaciones_generales: observaciones || null,
        activo: true
      },
      include: {
        persona: true
      }
    });

    res.json({
      success: true,
      message: 'Paciente dado de alta exitosamente',
      data: {
        id: paciente.id.toString(),
        persona_id: paciente.persona_id.toString(),
        nombre: persona.nombre,
        apellido: persona.apellido,
        dni: persona.dni,
        edad: calcularEdad(persona.fecha_nacimiento),
        obra_social: paciente.obra_social,
        telefono: persona.telefono
      }
    });
  } catch (error) {
    console.error('❌ Error en alta de paciente:', error);
    res.status(500).json({
      error: 'Error al dar de alta paciente',
      message: error.message
    });
  }
});

// ============================================================================
// ENDPOINT: ALTA DE HISTORIA CLÍNICA
// ============================================================================
app.post('/api/historia-clinica/crear', requireAuth, async (req, res) => {
  try {
    const { paciente_id } = req.body;

    if (!paciente_id) {
      return res.status(400).json({
        error: 'Falta paciente_id'
      });
    }

    // Verificar si paciente existe
    const paciente = await prisma.paciente.findUnique({
      where: { id: parseInt(paciente_id) }
    });

    if (!paciente) {
      return res.status(404).json({
        error: 'Paciente no encontrado'
      });
    }

    // Verificar si ya tiene historia activa
    const historiaExistente = await prisma.historia_clinica.findFirst({
      where: {
        paciente_id: parseInt(paciente_id),
        activa: true
      }
    });

    if (historiaExistente) {
      return res.status(409).json({
        error: 'El paciente ya tiene una historia clínica activa',
        historia_id: historiaExistente.id.toString()
      });
    }

    // Crear historia clínica
    const historia = await prisma.historia_clinica.create({
      data: {
        paciente_id: parseInt(paciente_id),
        creada_por_medico: req.usuario.id,
        activa: true
      }
    });

    res.json({
      success: true,
      message: 'Historia clínica creada exitosamente',
      data: {
        id: historia.id.toString(),
        paciente_id: historia.paciente_id.toString(),
        fecha_apertura: historia.fecha_apertura
      }
    });
  } catch (error) {
    console.error('❌ Error en alta de historia:', error);
    res.status(500).json({
      error: 'Error al crear historia clínica',
      message: error.message
    });
  }
});

// Función auxiliar para calcular edad
function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return '--';
  const hoy = new Date();
  const nacimiento = new Date(fechaNacimiento);
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mes = hoy.getMonth() - nacimiento.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
    edad--;
  }
  return edad;
}

// ============================================================================
// ENDPOINT: OBTENER PERSONAS CON TURNOS (para búsqueda/dropdown)
// ============================================================================
app.get('/api/pacientes-lista', requireAuth, async (req, res) => {
  try {
    // Obtener personas que tengan al menos UN turno
    const personas = await prisma.persona.findMany({
      where: {
        turnos: {
          some: {} // Tiene al menos un turno
        }
      },
      include: {
        turnos: {
          select: {
            id: true,
            estado: true,
            fecha: true
          },
          orderBy: { fecha: 'desc' },
          take: 1 // Solo el más reciente
        },
        paciente: {
          select: {
            id: true,
            obra_social: true
          }
        }
      },
      orderBy: { apellido: 'asc' },
      take: 100
    });

    const resultado = personas.map(p => ({
      id: p.id.toString(),
      persona_id: p.id.toString(),
      nombre: p.nombre,
      apellido: p.apellido,
      dni: p.dni,
      edad: calcularEdad(p.fecha_nacimiento),
      telefono: p.telefono,
      email: p.email,
      obra_social: p.obra_social || (p.paciente?.obra_social || null),
      es_paciente: p.paciente ? true : false,
      ultimo_turno: p.turnos[0] ? {
        id: p.turnos[0].id.toString(),
        estado: p.turnos[0].estado,
        fecha: p.turnos[0].fecha.toISOString()
      } : null
    }));

    res.json({
      success: true,
      data: resultado,
      count: resultado.length
    });
  } catch (error) {
    console.error('❌ Error en obtener personas con turnos:', error);
    res.status(500).json({
      error: 'Error al obtener personas con turnos',
      message: error.message
    });
  }
});

// Usuarios Admin
app.get('/admin/usuarios', requireAuth, requireRole(['admin']), (req, res) => {
  res.render('admin/admin-layout', {
    title: 'Gestión de Usuarios',
    page: 'usuarios',
    currentPage: 'usuarios',
    user: {
      nombre: req.usuario.nombre,
      apellido: req.usuario.apellido,
      rol: req.usuario.role,
      email: req.usuario.email
    },
    contentView: 'pages/usuarios'
  });
});

// Pacientes Admin
app.get('/admin/pacientes', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    // Obtener pacientes con historias clínicas
    const historias = await prisma.historiaClinica.findMany({
      where: { activa: true },
      include: {
        paciente: {
          include: {
            persona: true
          }
        },
        medico_apertura: {
          select: {
            nombre: true,
            apellido: true
          }
        }
      },
      orderBy: { fecha_apertura: 'desc' }
    });

    // Mapear datos para la vista
    const pacientesList = historias
      .filter(h => h.paciente && h.paciente.persona)
      .map(h => {
        const fechaNac = new Date(h.paciente.persona.fecha_nacimiento);
        const hoy = new Date();
        let edad = hoy.getFullYear() - fechaNac.getFullYear();
        const mes = hoy.getMonth() - fechaNac.getMonth();
        if (mes < 0 || (mes === 0 && hoy.getDate() < fechaNac.getDate())) {
          edad--;
        }

        return {
          id: h.paciente_id.toString(),
          dni: h.paciente.persona.dni || '-',
          nombre: `${h.paciente.persona.nombre} ${h.paciente.persona.apellido}`,
          telefono: h.paciente.persona.telefono || '-',
          email: h.paciente.persona.email || '-',
          edad: edad,
          obra_social: h.paciente.obra_social || '-',
          estado: 'Activo'
        };
      });

    res.render('admin/admin-layout', {
      title: 'Gestión de Pacientes',
      page: 'pacientes',
      currentPage: 'pacientes',
      pacientes: pacientesList,
      user: {
        nombre: req.usuario.nombre,
        apellido: req.usuario.apellido,
        rol: req.usuario.role,
        email: req.usuario.email
      },
      contentView: 'pages/pacientes'
    });
  } catch (error) {
    console.error('Error al obtener pacientes:', error);
    res.render('admin/admin-layout', {
      title: 'Gestión de Pacientes',
      page: 'pacientes',
      currentPage: 'pacientes',
      pacientes: [],
      error: 'Error al cargar pacientes',
      user: {
        nombre: req.usuario.nombre,
        apellido: req.usuario.apellido,
        rol: req.usuario.role,
        email: req.usuario.email
      },
      contentView: 'pages/pacientes'
    });
  }
});

// Turnos Admin
app.get('/admin/turnos', requireAuth, (req, res) => {
  res.render('admin/admin-layout', {
    title: 'Gestión de Turnos',
    page: 'turnos',
    currentPage: 'turnos',
    user: {
      nombre: req.usuario.nombre,
      apellido: req.usuario.apellido,
      rol: req.usuario.role,
      email: req.usuario.email
    },
    contentView: 'pages/turnos'
  });
});

// Estadísticas Admin
app.get('/admin/estadisticas', requireAuth, (req, res) => {
  res.render('admin/admin-layout', {
    title: 'Reportes y Estadísticas',
    page: 'estadisticas',
    currentPage: 'estadisticas',
    user: {
      nombre: req.usuario.nombre,
      apellido: req.usuario.apellido,
      rol: req.usuario.role,
      email: req.usuario.email
    },
    contentView: 'pages/estadisticas'
  });
});

// ============================================================================
// RUTAS DE FRONTEND DOCTOR (VISTAS EJS) - CON AUTENTICACIÓN
// ============================================================================



// Dashboard Doctor
app.get('/doctor/dashboard', requireAuth, requireRole(['doctor']), (req, res) => {
  res.render('pages/dashboard-doctor', {
    title: 'Mi Agenda',
    token: req.cookies.auth_token,
    user: {
      nombre: req.usuario.nombre,
      apellido: req.usuario.apellido,
      rol: req.usuario.role,
      email: req.usuario.email
    }
  });
});

// Pacientes del Doctor
app.get('/doctor/pacientes', requireAuth, requireRole(['doctor']), async (req, res) => {
  try {
    // Obtener pacientes con historias clínicas
    const historias = await prisma.historiaClinica.findMany({
      where: { activa: true },
      include: {
        paciente: {
          include: {
            persona: true
          }
        },
        medico_apertura: {
          select: {
            nombre: true,
            apellido: true
          }
        }
      },
      orderBy: { fecha_apertura: 'desc' }
    });

    // Mapear datos para la vista
    const pacientesList = historias
      .filter(h => h.paciente && h.paciente.persona)
      .map(h => {
        const fechaNac = new Date(h.paciente.persona.fecha_nacimiento);
        const hoy = new Date();
        let edad = hoy.getFullYear() - fechaNac.getFullYear();
        const mes = hoy.getMonth() - fechaNac.getMonth();
        if (mes < 0 || (mes === 0 && hoy.getDate() < fechaNac.getDate())) {
          edad--;
        }

        return {
          id: h.paciente_id.toString(),
          dni: h.paciente.persona.dni || '-',
          nombre: `${h.paciente.persona.nombre} ${h.paciente.persona.apellido}`,
          telefono: h.paciente.persona.telefono || '-',
          email: h.paciente.persona.email || '-',
          edad: edad,
          obra_social: h.paciente.obra_social || '-',
          estado: 'Activo'
        };
      });

    res.render('pages/pacientes', {
      title: 'Mis Pacientes',
      pacientes: pacientesList,
      user: {
        nombre: req.usuario.nombre,
        apellido: req.usuario.apellido,
        rol: req.usuario.role,
        email: req.usuario.email
      }
    });
  } catch (error) {
    console.error('Error al obtener pacientes:', error);
    res.render('pages/pacientes', {
      title: 'Mis Pacientes',
      pacientes: [],
      user: {
        nombre: req.usuario.nombre,
        apellido: req.usuario.apellido,
        rol: req.usuario.role,
        email: req.usuario.email
      }
    });
  }
});

// Ruta para ver detalles de paciente (historia completa)
app.get('/doctor/pacientes/:paciente_id', requireAuth, requireRole(['doctor']), async (req, res) => {
  try {
    const paciente_id = parseInt(req.params.paciente_id);

    // Obtener paciente con su historia clínica
    const paciente = await prisma.paciente.findUnique({
      where: { id: paciente_id },
      include: {
        persona: true,
        historias_clinicas: {
          where: { activa: true },
          include: {
            consultas: {
              include: {
                signos_vitales: true,
                anamnesis: true,
                diagnosticos: true,
                estudios: true,
                tratamientos: true,
                documentos: true
              },
              orderBy: { fecha: 'desc' },
              take: 1
            },
            antecedentes: true,
            documentos: true
          },
          orderBy: { fecha_apertura: 'desc' },
          take: 1
        }
      }
    });

    if (!paciente) {
      return res.status(404).render('pages/500', {
        message: 'Paciente no encontrado'
      });
    }

    // Obtener historia clínica activa
    const historia = paciente.historias_clinicas[0];
    const consulta = historia?.consultas[0];

    // Preparar datos para la vista
    const edad = paciente.persona.fecha_nacimiento 
      ? new Date().getFullYear() - new Date(paciente.persona.fecha_nacimiento).getFullYear()
      : 0;

    const datos = {
      title: 'Historia Clínica',
      paciente: {
        id: paciente.id,
        nombre: paciente.persona.nombre,
        apellido: paciente.persona.apellido,
        edad: edad,
        sexo: paciente.persona.sexo,
        fecha_nacimiento: paciente.persona.fecha_nacimiento ? 
          new Date(paciente.persona.fecha_nacimiento).toLocaleDateString('es-AR') : 'N/A',
        dni: paciente.persona.dni,
        email: paciente.persona.email,
        telefono: paciente.persona.telefono,
        obra_social: paciente.obra_social
      },
      historia: {
        id: historia?.id || null,
        motivo_consulta: consulta?.motivo_consulta || '',
        anamnesis: consulta?.anamnesis?.enfermedad_actual || '',
        antecedentes: historia?.antecedentes?.map(a => a.descripcion).join(', ') || '',
        diagnosticos: consulta?.diagnosticos || [],
        signos_vitales: consulta?.signos_vitales ? consulta.signos_vitales[0] : null,
        estudios: consulta?.estudios || [],
        tratamientos: consulta?.tratamientos || [],
        documentos: historia?.documentos || [],
        impresion_clinica: ''
      },
      user: {
        nombre: req.usuario.nombre,
        apellido: req.usuario.apellido,
        rol: req.usuario.role,
        email: req.usuario.email
      }
    };

    res.render('pages/historia-detalle', datos);
  } catch (error) {
    console.error('Error al obtener historia clínica:', error);
    res.status(500).render('pages/500', {
      message: 'Error al cargar la historia clínica'
    });
  }
});

// ============================================================================
// RUTAS API
// ============================================================================

// Rutas de autenticación
app.use('/api/auth', authRoutes);

// Rutas de pacientes
app.use('/api/pacientes', pacientesRoutes);

// Rutas de turnos
app.use('/api/turnos', turnosRoutes);

// Rutas de dashboard
app.use('/api/dashboard', dashboardRoutes);

// Rutas de historias clínicas
app.use('/api/historias-clinicas', historiasClinicasRoutes);

// Rutas de estudios adjuntos
app.use('/api/estudios-adjuntos', estudiosAdjuntosRoutes);

// Rutas de documentos
app.use('/api/documentos', documentosRoutes);

// Rutas de CIE-10
app.use('/api/cie10', cie10Routes);

// Rutas de administración
app.use('/api/admin', adminRoutes);

// Rutas de doctor
app.use('/api/doctor', doctorRoutes);

// ============================================================================
// MANEJO DE ERRORES
// ============================================================================

// Ruta 404
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `La ruta ${req.method} ${req.path} no existe`,
    timestamp: new Date().toISOString()
  });
});

// Middleware de error global
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: err.message || 'Ocurrió un error en el servidor',
    timestamp: new Date().toISOString(),
    ...(NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================================================
// INICIAR SERVIDOR
// ============================================================================

async function startServer() {
  try {
    // Verificar conexión a BD
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Conexión a base de datos exitosa');

    // Iniciar servidor
    app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════════════════╗
║  🏥 LEMES Medical System - Backend API                         ║
╚════════════════════════════════════════════════════════════════╝

  🚀 Servidor corriendo en: http://localhost:${PORT}
  📝 Entorno: ${NODE_ENV}
  🗄️  Base de datos: ${process.env.DATABASE_URL?.split('@')[1] || 'Configurada'}
  
  📖 Documentación:
     • Health Check: http://localhost:${PORT}/health
     • Login: POST http://localhost:${PORT}/api/auth/login
     • Logout: POST http://localhost:${PORT}/api/auth/logout

═══════════════════════════════════════════════════════════════════
      `);
    });
  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error.message);
    process.exit(1);
  }
}

// Manejar SIGINT para cerrar Prisma
process.on('SIGINT', async () => {
  console.log('\n\n👋 Cerrando servidor...');
  await prisma.$disconnect();
  process.exit(0);
});

// Iniciar
startServer();

export { app, prisma };
