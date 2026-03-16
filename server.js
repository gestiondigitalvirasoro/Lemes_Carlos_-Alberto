import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaClient } from '@prisma/client';
import authRoutes from './src/routes/auth.js';
import pacientesRoutes from './src/routes/pacientes.js';
import turnosRoutes from './src/routes/turnos.js';
import dashboardRoutes from './src/routes/dashboard.js';
import historiasClinicasRoutes from './src/routes/historias-clinicas.js';
import consultasMedicasRoutes from './src/routes/consultas-medicas.js';
import estudiosAdjuntosRoutes from './src/routes/estudios-adjuntos.js';
import documentosRoutes from './src/routes/documentos.js';
import adminRoutes from './src/routes/admin.js';
import doctorRoutes from './src/routes/doctor.js';
import cie10Routes from './src/routes/cie10.js';
import roleMiddleware from './src/middlewares/role.js';
import { supabase } from './src/services/supabase.js';

// ============================================================================
// SOLUCIÓN PARA BIGINT EN JSON
// ============================================================================
BigInt.prototype.toJSON = function() {
  return this.toString();
};

// Cargar variables de entorno
dotenv.config();

// Setup __dirname para ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inicializar Prisma
const prisma = new PrismaClient();

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

// Helper function para convertir BigInt a string recursivamente
function serializeBigInt(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInt(value);
    }
    return result;
  }
  return obj;
}

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
 * Middleware que verifica si el usuario tiene una sesión válida en Supabase
 * SUPABASE es la única fuente de verdad para autenticación
 * Si no, redirige a /login
 */
const requireAuth = async (req, res, next) => {
  const token = req.cookies.access_token;

  if (!token) {
    return res.redirect('/login');
  }

  try {
    // 🔐 VALIDAR EL TOKEN DIRECTAMENTE CON SUPABASE AUTH
    // Esto asegura que Supabase sea la única fuente de verdad para sesiones
    const { data: { user: supabaseUser }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !supabaseUser) {
      console.log(`⚠️  Token inválido o expirado en Supabase: ${authError?.message || 'Sin usuario'}`);
      res.clearCookie('access_token');
      return res.redirect('/login');
    }

    const supabaseId = supabaseUser.id; // UUID de Supabase
    const email = supabaseUser.email;
    
    // SINCRONIZAR AUTOMÁTICAMENTE: Buscar o crear el médico en BD local
    let medico = await prisma.medico.findUnique({
      where: { supabase_id: supabaseId }
    });
    
    if (!medico) {
      // El usuario se autenticó en Supabase pero no existe en nuestra BD → CREAR AUTOMÁTICAMENTE
      console.log(`📝 Sincronizando nuevo usuario Supabase (${email}) a tabla medicos...`);
      
      try {
        medico = await prisma.medico.create({
          data: {
            supabase_id: supabaseId,
            email: email,
            nombre: supabaseUser.user_metadata?.nombre || 'Usuario',
            apellido: supabaseUser.user_metadata?.apellido || 'Supabase',
            role: supabaseUser.user_metadata?.role || 'doctor',
            especialidad: supabaseUser.user_metadata?.especialidad || null,
            telefono: supabaseUser.user_metadata?.telefono || null,
            activo: true
          }
        });
        
        console.log(`✅ Médico creado automáticamente: ID ${medico.id}, Email: ${medico.email}`);
      } catch (createError) {
        console.error('❌ Error creando médico sincronizado:', createError.message);
        res.clearCookie('access_token');
        return res.redirect('/login?error=sync_failed');
      }
    }
    
    // Verificar que el médico está activo en el sistema
    if (!medico.activo) {
      console.log(`⚠️  Médico inactivo: ${medico.email}`);
      res.clearCookie('access_token');
      return res.redirect('/login');
    }

    // Adjuntar datos del usuario autenticado al request
    req.user = {
      id: medico.id.toString(),
      medicoId: medico.id.toString(),
      supabaseId: medico.supabase_id,
      supabaseUser: supabaseUser,  // Guardar también los datos de Supabase
      email: medico.email,
      nombre: medico.nombre,
      apellido: medico.apellido,
      role: (medico.role || 'user').toLowerCase()
    };
    next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error.message);
    // Token inválido, expirado o error de conexión con Supabase
    res.clearCookie('access_token');
    return res.redirect('/login');
  }
};

/**
 * Middleware que verifica el rol del usuario
 * Valida que el usuario tenga uno de los roles permitidos
 */
const requireRole = (rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).redirect('/login');
    }

    if (!rolesPermitidos.includes(req.user.role)) {
      return res.status(403).render('pages/403', {
        title: 'Acceso Denegado',
        message: 'No tienes permiso para acceder a esta página',
        usuarioRole: req.user.role
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
  const token = req.cookies.access_token;
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
      nombre: req.user.nombre,
      apellido: req.user.apellido,
      rol: req.user.role,
      email: req.user.email
    }
  });
});

// Dashboard General (Redirección)
app.get('/dashboard', requireAuth, (req, res) => {
  const { role } = req.user;

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
      nombre: req.user.nombre,
      apellido: req.user.apellido,
      rol: req.user.role,
      email: req.user.email
    }
  });
});

// Pacientes
app.get('/pacientes', requireAuth, (req, res) => {
  res.render('pages/pacientes', {
    title: 'Pacientes',
    user: {
      nombre: req.user.nombre,
      apellido: req.user.apellido,
      rol: req.user.role,
      email: req.user.email
    }
  });
});

// Agendar Turno
app.get('/agendar-turno', requireAuth, async (req, res) => {
  try {
    // Obtener lista de doctores
    const doctores = await prisma.medico.findMany({
      where: { role: 'doctor', activo: true },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        especialidad: true,
        email: true
      },
      orderBy: { nombre: 'asc' }
    });

    res.render('pages/agendar-turno', {
      title: 'Agendar Turno',
      user: {
        nombre: req.user.nombre,
        apellido: req.user.apellido,
        rol: req.user.role,
        email: req.user.email
      },
      doctores: doctores
    });
  } catch (error) {
    console.error('Error al obtener doctores:', error);
    res.render('pages/agendar-turno', {
      title: 'Agendar Turno',
      user: {
        nombre: req.user.nombre,
        apellido: req.user.apellido,
        rol: req.user.role,
        email: req.user.email
      },
      doctores: []
    });
  }
});

// Turnos - Solo SECRETARIA y DOCTOR
app.get('/doctor/turnos', requireAuth, requireRole(['secretaria', 'doctor']), (req, res) => {
  res.render('pages/turnos-simple', {
    title: 'Mis Turnos',
    page: 'turnos',
    user: {
      nombre: req.user.nombre,
      apellido: req.user.apellido,
      rol: req.user.role,
      email: req.user.email
    }
  });
});

// Agendar Nuevo Turno
app.get('/agendar-turno', requireAuth, (req, res) => {
  res.render('pages/agendar-turno-nuevo', {
    title: 'Agendar Turno'
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
      user: req.user || {}
    });
  } catch (error) {
    console.error('Error al obtener historias:', error);
    res.render('pages/historias', {
      title: 'Historias Clínicas',
      historias: [],
      error: error.message || 'Error al cargar historias',
      user: req.user || {}
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
            estudios: true,
            documentos: true
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
              estudios: true,
              documentos: true
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

    // Serializar BigInts antes de renderizar
    const historiaSerializada = historia ? JSON.parse(JSON.stringify(serializeBigInt(historia))) : null;
    
    // ========== AGREGAR LOG DE FECHA ESTUDIO ==========
    if (historiaSerializada && historiaSerializada.consultas) {
      historiaSerializada.consultas.forEach((consulta, idx) => {
        if (consulta.estudios && consulta.estudios.length > 0) {
          console.log(`📋 Consulta ${idx}:`, consulta.estudios.length, 'estudios');
          consulta.estudios.forEach((est, estIdx) => {
            console.log(`   ✏️ Estudio ${estIdx}: tipo="${est.tipo_estudio}", fecha_estudio="${est.fecha_estudio}" (tipo: ${typeof est.fecha_estudio})`);
          });
        }
      });
    }
    
    // ========== CONVERTIR FECHAS DE ESTUDIOS A STRING ==========
    if (historiaSerializada && historiaSerializada.consultas) {
      historiaSerializada.consultas.forEach(consulta => {
        if (consulta.estudios && consulta.estudios.length > 0) {
          consulta.estudios = consulta.estudios.map(est => {
            let fechaIso = null;
            let fechaFormateada = '-';
            
            console.log(`   🔍 Procesando: fecha_estudio="${est.fecha_estudio}", tipo=${typeof est.fecha_estudio}`);
            
            if (est.fecha_estudio) {
              try {
                let fechaStr = est.fecha_estudio;
                
                // Caso 1: Ya es string ISO completo "2026-03-16T00:00:00.000Z"
                if (typeof fechaStr === 'string' && fechaStr.includes('T')) {
                  fechaIso = fechaStr.split('T')[0];
                  console.log(`   ✅ Tipo 1 (ISO completo): ${fechaIso}`);
                }
                // Caso 2: Ya es string ISO corto "2026-03-16"
                else if (typeof fechaStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
                  fechaIso = fechaStr;
                  console.log(`   ✅ Tipo 2 (ISO corto): ${fechaIso}`);
                }
                // Caso 3: Es un Date object (aunque no debería llegar aquí después de JSON.parse)
                else if (typeof fechaStr === 'object' && fechaStr instanceof Date) {
                  fechaIso = fechaStr.toISOString().split('T')[0];
                  console.log(`   ✅ Tipo 3 (Date object): ${fechaIso}`);
                }
                // Caso 4: Intentar parsear como Date
                else if (typeof fechaStr === 'string') {
                  const d = new Date(fechaStr);
                  if (!isNaN(d.getTime())) {
                    fechaIso = d.toISOString().split('T')[0];
                    console.log(`   ✅ Tipo 4 (Parse genérico): ${fechaIso}`);
                  } else {
                    console.log(`   ❌ Tipo 4 fallo: no es una fecha válida`);
                  }
                }
                
                // Si tenemos una fecha válida, formatear a DD/MM/YYYY
                if (fechaIso && /^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) {
                  const [año, mes, dia] = fechaIso.split('-');
                  fechaFormateada = `${dia}/${mes}/${año}`;
                  console.log(`   📅 Formateada: ${fechaFormateada}`);
                }
              } catch (e) {
                console.warn(`   ⚠️ Error procesando fecha: ${e.message}`);
              }
            } else {
              console.log(`   ⚠️ fecha_estudio es null/undefined`);
            }
            
            return {
              ...est,
              fecha_estudio: fechaIso,
              fecha_formateada: fechaFormateada
            };
          });
        }
      });
    }
    
    // ========== LOGGING DE ESTUDIOS ==========
    if (historiaSerializada && historiaSerializada.consultas) {
      historiaSerializada.consultas.forEach(consulta => {
        if (consulta.estudios && consulta.estudios.length > 0) {
          console.log(`🧹 Estudios en consulta ${consulta.id}: ${consulta.estudios.length} registros`);
          if (consulta.estudios.length > 0) {
            console.log(`📅 Datos de ejemplo:`, {
              tipo: consulta.estudios[0].tipo_estudio,
              resultado: consulta.estudios[0].resultado,
              fecha_iso: consulta.estudios[0].fecha_estudio,
              fecha_formateada: consulta.estudios[0].fecha_formateada
            });
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
        fecha_nacimiento: fecha_nacimiento ? fecha_nacimiento.toISOString().split('T')[0] : '',
        direccion: paciente.persona?.direccion || 'N/A',
        obra_social: paciente.obra_social || 'N/A',
        numero_afiliado: paciente.numero_afiliado || 'N/A',
        observaciones_generales: paciente.observaciones_generales || ''
      },
      historia: historiaSerializada || null,
      turno_id: turno_id || '',
      is_new_consulta: !historia,
      user: {
        nombre: req.user.nombre,
        apellido: req.user.apellido,
        rol: req.user.role,
        email: req.user.email
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

// ============================================================================
// NUEVA RUTA: Historia Clínica Nueva para Doctor (VACÍA PARA RELLENAR)
// ============================================================================
app.get('/doctor/historia-nueva', requireAuth, async (req, res) => {
  try {
    const { paciente_id, turno_id } = req.query;

    if (!paciente_id) {
      return res.status(404).render('pages/404', {
        title: 'Paciente no encontrado',
        message: 'El paciente que buscas no existe'
      });
    }

    // Obtener datos del paciente
    const paciente = await prisma.paciente.findUnique({
      where: { id: BigInt(paciente_id) },
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

    console.log(`📂 Historia Nueva Vacía - Paciente: ${paciente.persona?.nombre}, Turno: ${turno_id}`);

    // Renderizar historia clínica VACÍA (sin datos, para que el doctor la complete)
    res.render('pages/historia-detalle-full', {
      title: 'Historia Clínica - Nueva Consulta',
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
      historia: null, // ✅ VACÍO - sin historia previa
      turno_id: turno_id || null,
      is_new_consulta: true, // Flag para indicar que es nueva consulta
      user: {
        nombre: req.user.nombre,
        apellido: req.user.apellido,
        rol: req.user.role,
        email: req.user.email
      }
    });
  } catch (error) {
    console.error('Error en historia nueva:', error);
    res.status(500).render('pages/500', {
      title: 'Error',
      message: 'Ocurrió un error al cargar la historia clínica: ' + error.message
    });
  }
});

// ============================================================================
// ACTUALIZAR CONSULTA MÉDICA (Con todos sus campos relacionados)
// ============================================================================
app.put('/api/historia/:historiaId', requireAuth, async (req, res) => {
  try {
    const { historiaId } = req.params;
    const { 
      consulta_id,
      motivo_consulta, 
      anamnesis,
      antecedentes,
      resumen,
      presion_sistolica,
      presion_diastolica,
      frecuencia_cardiaca,
      temperatura,
      peso,
      talla,
      diagnosticos = [],
      estudios = [],
      adjuntos = []
    } = req.body;

    console.log('📝 Guardando consulta:', consulta_id, '| Historia:', historiaId);

    // ========== 1. ACTUALIZAR CONSULTA MÉDICA ==========
    const updateConsultaData = {};
    if (motivo_consulta) updateConsultaData.motivo_consulta = motivo_consulta.trim();
    if (resumen) updateConsultaData.resumen = resumen.trim();

    if (Object.keys(updateConsultaData).length > 0) {
      await prisma.consultaMedica.update({
        where: { id: BigInt(consulta_id) },
        data: updateConsultaData
      });
      console.log('✅ Consulta médica actualizada');
    }

    // ========== 1.5 ANAMNESIS (tabla Anamnesis - Enfermedad Actual) ==========
    if (anamnesis && anamnesis.trim() !== '') {
      console.log('📝 Guardando Anamnesis:', anamnesis);
      const anamnesisExistente = await prisma.anamnesis.findFirst({
        where: { consulta_id: BigInt(consulta_id) }
      });

      if (anamnesisExistente) {
        console.log('🔄 Actualizando anamnesis existente:', anamnesisExistente.id);
        const actualizada = await prisma.anamnesis.update({
          where: { id: anamnesisExistente.id },
          data: { 
            enfermedad_actual: anamnesis.trim()
          }
        });
        console.log('✅ Anamnesis actualizada. Nuevo valor:', actualizada.enfermedad_actual);
      } else {
        console.log('🆕 Creando anamnesis nueva para consulta:', consulta_id);
        const nuevaAnamnesis = await prisma.anamnesis.create({
          data: {
            consulta_id: BigInt(consulta_id),
            enfermedad_actual: anamnesis.trim()
          }
        });
        console.log('✅ Anamnesis creada. ID:', nuevaAnamnesis.id, 'Valor:', nuevaAnamnesis.enfermedad_actual);
      }
    } else {
      console.log('⚠️ Anamnesis vacía, no se guarda');
    }

    // ========== 2. ANTECEDENTES (tabla Antecedente) ==========
    if (antecedentes && antecedentes.trim() !== '') {
      console.log('📝 Guardando Antecedentes:', antecedentes);
      // Buscar si ya existe un antecedente PERSONAL para esta historia
      const antecedenteExistente = await prisma.antecedente.findFirst({
        where: {
          historia_clinica_id: BigInt(historiaId),
          tipo: 'PERSONAL'
        }
      });

      if (antecedenteExistente) {
        console.log('🔄 Actualizando antecedente existente:', antecedenteExistente.id);
        const actualizado = await prisma.antecedente.update({
          where: { id: antecedenteExistente.id },
          data: { 
            descripcion: antecedentes.trim()
          }
        });
        console.log('✅ Antecedente actualizado. Nuevo valor:', actualizado.descripcion);
      } else {
        console.log('🆕 Creando antecedente nuevo para historia:', historiaId);
        const nuevoAntecedente = await prisma.antecedente.create({
          data: {
            historia_clinica_id: BigInt(historiaId),
            tipo: 'PERSONAL',
            descripcion: antecedentes.trim()
          }
        });
        console.log('✅ Antecedente creado. ID:', nuevoAntecedente.id, 'Valor:', nuevoAntecedente.descripcion);
      }
    } else {
      console.log('⚠️ Antecedentes vacíos, no se guardan');
    }

    // ========== 3. SIGNOS VITALES ==========
    const tieneSignos = presion_sistolica || presion_diastolica || 
                        frecuencia_cardiaca || temperatura || peso || talla;

    if (tieneSignos) {
      // Calcular IMC automáticamente si hay peso y talla
      let imc = null;
      if (peso && talla) {
        try {
          const pesoNum = parseFloat(peso);
          const tallaNum = parseFloat(talla);
          if (pesoNum > 0 && tallaNum > 0) {
            const tallaMt = tallaNum / 100;
            imc = Math.round((pesoNum / (tallaMt * tallaMt)) * 10) / 10; // Redondear a 1 decimal
          }
        } catch (e) {
          console.warn('⚠️ Error calculando IMC:', e.message);
          imc = null;
        }
      }

      const signosData = {
        presion_sistolica:  presion_sistolica  ? parseInt(presion_sistolica)    : null,
        presion_diastolica: presion_diastolica ? parseInt(presion_diastolica)   : null,
        frecuencia_cardiaca: frecuencia_cardiaca ? parseInt(frecuencia_cardiaca) : null,
        temperatura_c:      temperatura ? parseFloat(temperatura) : null,
        peso_kg:            peso        ? parseFloat(peso)        : null,
        talla_cm:           talla       ? parseFloat(talla)       : null,
        imc:                imc ? parseFloat(imc) : null
      };

      const signoExistente = await prisma.signoVital.findFirst({
        where: { consulta_id: BigInt(consulta_id) }
      });

      if (signoExistente) {
        await prisma.signoVital.update({
          where: { id: signoExistente.id },
          data: signosData
        });
      } else {
        await prisma.signoVital.create({
          data: { consulta_id: BigInt(consulta_id), ...signosData }
        });
      }
      console.log('✅ Signos vitales guardados, IMC:', imc);
    }

    // ========== 4. DIAGNÓSTICOS ==========
    if (diagnosticos.length > 0) {
      await prisma.diagnostico.deleteMany({
        where: { consulta_id: BigInt(consulta_id) }
      });
      for (const diag of diagnosticos) {
        await prisma.diagnostico.create({
          data: {
            consulta_id: BigInt(consulta_id),
            codigo_cie10: diag.codigo || '',
            descripcion:  diag.descripcion || '',
            principal:    diag.principal || false
          }
        });
      }
      console.log('✅ Diagnósticos guardados:', diagnosticos.length);
    }

    // ========== 5. ESTUDIOS ==========
    console.log('🔍 Procesando estudios - Total recibido:', estudios.length);
    
    // PRIMERO: Eliminar TODOS los estudios existentes para esta consulta
    const estudiosEliminados = await prisma.estudioComplementario.deleteMany({
      where: { consulta_id: BigInt(consulta_id) }
    });
    if (estudiosEliminados.count > 0) {
      console.log(`🧹 Estudios existentes eliminados: ${estudiosEliminados.count}`);
    }
    
    // LUEGO: Procesar los nuevos/actualizados estudios que viene del frontend
    if (estudios && estudios.length > 0) {
      console.log('   📋 Primer estudio recibido:', JSON.stringify(estudios[0], null, 2));
      
      const estudiosVistosSet = new Set();
      
      for (const est of estudios) {
        // Validar que tenga TODOS los campos requeridos
        if (est.tipo_estudio?.trim() && est.resultado?.trim() && est.observaciones?.trim() && est.fecha_estudio) {
          
          // Validar no duplicados
          const clave = `${est.tipo_estudio.trim()}|${est.resultado.trim()}|${est.observaciones.trim()}`;
          if (estudiosVistosSet.has(clave)) {
            console.log('⚠️ Estudio duplicado, ignorando:', clave);
            continue;
          }
          estudiosVistosSet.add(clave);
          
          console.log('🆕 Creando estudio nuevo:', est.tipo_estudio);
          console.log('   📋 Datos recibidos:', {
            tipo_estudio: est.tipo_estudio,
            resultado: est.resultado,
            observaciones: est.observaciones,
            fecha_estudio_raw: est.fecha_estudio,
            fecha_tipo: typeof est.fecha_estudio
          });
          
          // Parsear fecha correctamente
          let fechaParsed = new Date();
          if (est.fecha_estudio) {
            console.log('   📅 Parseando fecha:', est.fecha_estudio);
            
            // Si viene como yyyy-mm-dd (input type="date")
            if (typeof est.fecha_estudio === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(est.fecha_estudio)) {
              fechaParsed = new Date(est.fecha_estudio + 'T00:00:00Z');
              console.log('   ✅ Formato detectado: yyyy-mm-dd');
            }
            // Si viene como dd/mm/yyyy
            else if (typeof est.fecha_estudio === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(est.fecha_estudio)) {
              const partes = est.fecha_estudio.split('/');
              fechaParsed = new Date(`${partes[2]}-${partes[1]}-${partes[0]}T00:00:00Z`);
              console.log('   ✅ Formato detectado: dd/mm/yyyy');
            }
            // Fallback
            else {
              fechaParsed = new Date(est.fecha_estudio);
              if (isNaN(fechaParsed.getTime())) {
                console.log('   ⚠️ Fecha inválida, usando hoy');
                fechaParsed = new Date();
              } else {
                console.log('   ✅ Formato detectado: fallback');
              }
            }
          }
          
          console.log('   💾 Guardando en BD - fecha final:', fechaParsed.toISOString());
          
          await prisma.estudioComplementario.create({
            data: {
              consulta_id:   BigInt(consulta_id),
              tipo_estudio:  est.tipo_estudio.trim(),
              resultado:     est.resultado.trim(),
              observaciones: est.observaciones.trim(),
              medico_id:     BigInt(req.user.id),
              fecha_estudio: fechaParsed
            }
          });
        }
      }
      console.log('✅ Estudios procesados:', estudios.length);
    }

    // ========== 6. ADJUNTOS ==========
    let archivosGuardados = 0;
    for (const adj of adjuntos) {
      if (!adj.cloudinary_id) continue;
      const yaExiste = await prisma.documentoAdjunto.findFirst({
        where: { cloudinary_id: adj.cloudinary_id }
      });
      if (!yaExiste) {
        await prisma.documentoAdjunto.create({
          data: {
            historia_clinica_id:   BigInt(historiaId),
            nombre_archivo:        adj.nombre_archivo || '',
            url_storage:           adj.url_storage || '',
            cloudinary_id:         adj.cloudinary_id,
            tamano_bytes:          BigInt(adj.size || 0),
            tipo_mime:             adj.tipo_mime || 'application/octet-stream',
            subido_por_medico_id:  BigInt(req.user.id)
          }
        });
        archivosGuardados++;
      }
    }

    res.json(serializeBigInt({
      success: true,
      message: 'Consulta guardada exitosamente',
      data: { consulta_id, diagnosticos_guardados: diagnosticos.length, archivos_guardados: archivosGuardados }
    }));

  } catch (error) {
    console.error('❌ Error al guardar:', error);
    res.status(500).json({ success: false, message: error.message });
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
app.get('/login', async (req, res) => {
  // Si ya está logueado, redirige a dashboard según rol
  const token = req.cookies.access_token;
  if (token) {
    try {
      const decoded = jwt.decode(token);
      
      // Obtener datos del usuario para saber su rol
      const usuario = await prisma.usuario.findUnique({
        where: { email: decoded.email },
        select: { role: true }
      });
      
      if (usuario) {
        // Redireccionar según el rol
        if (usuario.role === 'admin') {
          return res.redirect('/admin/dashboard');
        } else if (usuario.role === 'doctor') {
          return res.redirect('/doctor/dashboard');
        } else if (usuario.role === 'secretaria') {
          return res.redirect('/secretaria/dashboard');
        } else {
          return res.redirect('/dashboard');
        }
      }
    } catch (error) {
      console.error('Login check error:', error);
      res.clearCookie('access_token');
    }
  }
  
  res.render('pages/login', {
    title: 'Iniciar Sesión'
  });
});

// Logout - Limpiar cookie y redirigir a login
app.get('/logout', (req, res) => {
  res.clearCookie('access_token');
  res.redirect('/login');
});

// ============================================================================
// RUTAS DE FRONTEND ADMIN (VISTAS EJS) - CON AUTENTICACIÓN
// ============================================================================

// Dashboard Admin
app.get('/admin/dashboard', requireAuth, requireRole(['admin']), (req, res) => {
  res.render('pages/admin-dashboard', {
    title: 'Panel Administrativo',
    user: {
      nombre: req.user.nombre,
      apellido: req.user.apellido,
      rol: req.user.role,
      email: req.user.email
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
        medico: true,
        estado: {
          select: {
            id: true,
            nombre: true,
            descripcion: true,
            activo: true
          }
        }
      }
    });
    
    // Convertir BigInt a string para JSON
    const turnosSerializables = turnos.map(t => ({
      id: t.id.toString(),
      paciente_id: t.paciente_id.toString(),
      medico_id: t.medico_id.toString(),
      fecha: t.fecha,
      hora: t.hora,
      estado: {
        id: t.estado.id.toString(),
        nombre: t.estado.nombre,
        descripcion: t.estado.descripcion,
        activo: t.estado.activo
      },
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
            fecha_nacimiento: true
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
        estado: {
          select: {
            id: true,
            nombre: true,
            descripcion: true,
            activo: true
          }
        },
        consulta: {
          select: {
            id: true,
            estado: {
              select: {
                id: true,
                nombre: true,
                descripcion: true,
                activo: true
              }
            },
            motivo_consulta: true,
            fecha: true
          }
        }
      },
      orderBy: { hora: 'asc' }
    });

    console.log('✅ Turnos encontrados:', turnos.length);

    // Obtener todos los pacientes para estos turnos (por persona_id)
    const personasIds = turnos.map(t => t.persona_id);
    const pacientes = await prisma.paciente.findMany({
      where: {
        persona_id: {
          in: personasIds
        }
      },
      select: {
        id: true,
        persona_id: true,
        obra_social: true,
        numero_afiliado: true
      }
    });

    // Crear un mapeo persona_id -> paciente
    const pacienteMap = {};
    pacientes.forEach(p => {
      pacienteMap[p.persona_id.toString()] = {
        id: p.id.toString(),
        obraSocial: p.obra_social,
        numeroAfiliado: p.numero_afiliado
      };
    });

    // Mapear a formato para el frontend
    const datos = turnos.map(turno => {
      const persona = turno.persona;
      const paciente = pacienteMap[turno.persona_id.toString()] || {};
      
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

      return {
        id: turno.id.toString(),
        hora: turno.hora,
        fecha: turno.fecha.toLocaleDateString('es-AR'),
        estado: turno.estado.nombre,
        estadoColor: {
          'PENDIENTE': '#FFC107',
          'EN_CONSULTA': '#007BFF',
          'FINALIZADA': '#28A745',
          'CANCELADA': '#DC3545'
        }[turno.estado.nombre] || '#6C757D',
        paciente: {
          id: paciente.id || null,
          nombre: persona.nombre,
          apellido: persona.apellido,
          dni: persona.dni,
          telefono: persona.telefono || '-',
          edad: edad,
          obraSocial: paciente.obraSocial || '-'
        },
        consulta: turno.consulta ? {
          id: turno.consulta.id.toString(),
          estado: turno.consulta.estado.nombre,
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
    const medico_id = BigInt(req.user.medicoId || req.user.id);
    
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
            fecha_nacimiento: true
          }
        },
        medico: {
          select: {
            id: true,
            nombre: true,
            apellido: true
          }
        },
        estado: {
          select: {
            id: true,
            nombre: true
          }
        }
      },
      orderBy: [
        { fecha: 'asc' },
        { hora: 'asc' }
      ]
    });

    console.log('✅ Turnos encontrados para semana:', turnos.length);

    // Obtener datos de pacientes
    const personasIds = turnos.map(t => t.persona_id);
    const pacientes = await prisma.paciente.findMany({
      where: {
        persona_id: {
          in: personasIds
        }
      },
      select: {
        id: true,
        persona_id: true,
        obra_social: true
      }
    });

    const pacienteMap = {};
    pacientes.forEach(p => {
      pacienteMap[p.persona_id.toString()] = {
        obraSocial: p.obra_social
      };
    });

    // Mapear datos para el frontend
    const datos = turnos.map(turno => {
      const persona = turno.persona;
      const paciente = pacienteMap[turno.persona_id.toString()] || {};
      
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
        estado: turno.estado.nombre,
        persona: {
          id: turno.persona_id.toString(),
          nombre: persona.nombre,
          apellido: persona.apellido,
          dni: persona.dni,
          telefono: persona.telefono || '-',
          edad: edad,
          obraSocial: paciente.obraSocial || '-'
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
    // Devolver alertas vacías por ahora (hay mismatch con BD real)
    res.json({
      success: true,
      alertas: [],
      count: 0
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
// ENDPOINT OBTENER MIS TURNOS (para la sección Turnos)
// ============================================================================
// ============================================================================
// ENDPOINT: TODOS LOS TURNOS DEL DOCTOR (No solo de hoy)
// ============================================================================
app.get('/api/doctor-todos-turnos', requireAuth, async (req, res) => {
  try {
    console.log('\n🔍 DEBUG /api/doctor-todos-turnos:');
    console.log(`   req.user.medicoId: ${req.user.medicoId}`);
    console.log(`   req.user.role: ${req.user.role}`);
    console.log(`   req.user.email: ${req.user.email}\n`);

    const medicoId = BigInt(req.user.medicoId);

    // Obtener todos los turnos del doctor (SIN filtro de fecha)
    const turnos = await prisma.turno.findMany({
      where: {
        medico_id: medicoId
      },
      include: {
        persona: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            dni: true,
            telefono: true,
            email: true,
            fecha_nacimiento: true,
            paciente: {
              select: {
                id: true,
                obra_social: true,
                numero_afiliado: true,
                observaciones_generales: true
              }
            }
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
        estado: {
          select: {
            id: true,
            nombre: true
          }
        }
      },
      orderBy: { fecha: 'desc' }
    });

    console.log(`📅 Turnos encontrados: ${turnos.length}\n`);

    // Mapear a formato para el frontend
    const datos = turnos.map(turno => {
      const persona = turno.persona;
      
      // DEBUG: Log para turno 50
      if (turno.id === BigInt(50)) {
        console.log(`🔍 TURNO 50 DEBUG:`, {
          id: turno.id.toString(),
          estado_id: turno.estado_id.toString(),
          estado: turno.estado,
          estado_nombre: turno.estado?.nombre
        });
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

      return {
        id: turno.id.toString(),
        hora: turno.hora || '12:00',
        fecha: turno.fecha.toLocaleDateString('es-AR'),
        estado: turno.estado ? {
          id: turno.estado.id.toString(),
          nombre: turno.estado.nombre
        } : {
          id: null,
          nombre: 'PENDIENTE'
        },
        estadoColor: {
          'PENDIENTE': '#FFC107',
          'EN_CONSULTA': '#007BFF',
          'FINALIZADA': '#28A745',
          'CANCELADA': '#DC3545'
        }[turno.estado?.nombre || 'PENDIENTE'] || '#6C757D',
        persona: {
          id: persona.id.toString(),
          nombre: persona.nombre,
          apellido: persona.apellido,
          dni: persona.dni,
          telefono: persona.telefono || '-',
          email: persona.email || '',
          edad: edad,
          paciente: persona.paciente ? {
            id: persona.paciente.id.toString(),
            obra_social: persona.paciente.obra_social || '',
            numero_afiliado: persona.paciente.numero_afiliado || '',
            observaciones_generales: persona.paciente.observaciones_generales || ''
          } : null
        },
        medico: {
          id: turno.medico?.id.toString() || '',
          nombre: turno.medico?.nombre || 'N/A',
          apellido: turno.medico?.apellido || 'N/A',
          especialidad: turno.medico?.especialidad || 'General'
        },
        observaciones: turno.observaciones || '-'
      };
    });

    return res.status(200).json({
      success: true,
      data: datos,
      count: datos.length
    });
  } catch (error) {
    console.error('❌ Error en /api/doctor-todos-turnos:', error);
    res.status(500).json({
      error: 'Error al obtener turnos',
      message: error.message
    });
  }
});

// ============================================================================
// ENDPOINT: CAMBIAR ESTADO DEL TURNO (PENDIENTE -> CONFIRMADO)
// ============================================================================
app.put('/api/turnos/:turnoId/estado', requireAuth, async (req, res) => {
  try {
    const { turnoId } = req.params;
    const { estado_nombre } = req.body;

    console.log('📝 Cambiando estado del turno:', turnoId, 'a:', estado_nombre);

    if (!estado_nombre) {
      return res.status(400).json({
        error: 'Error de validación',
        message: 'Estado es requerido'
      });
    }

    // Obtener el estado
    const estado = await prisma.estadoTurno.findUnique({
      where: { nombre: estado_nombre }
    });

    if (!estado) {
      return res.status(404).json({
        error: 'Not found',
        message: `Estado "${estado_nombre}" no encontrado`
      });
    }

    // Actualizar el turno con el nuevo estado
    const turnoActualizado = await prisma.turno.update({
      where: { id: BigInt(turnoId) },
      data: {
        estado_id: estado.id
      },
      select: {
        id: true,
        estado: {
          select: {
            id: true,
            nombre: true
          }
        },
        persona: {
          select: {
            nombre: true,
            apellido: true
          }
        }
      }
    });

    console.log('✅ Turno actualizado - Nuevo estado:', estado_nombre);

    return res.status(200).json({
      success: true,
      message: `Estado del turno cambiado a ${estado_nombre}`,
      turno: {
        id: turnoActualizado.id.toString(),
        estado: turnoActualizado.estado.nombre,
        persona: `${turnoActualizado.persona.nombre} ${turnoActualizado.persona.apellido}`
      }
    });
  } catch (error) {
    console.error('❌ Error al cambiar estado del turno:', error);
    res.status(500).json({
      error: 'Error interno',
      message: error.message
    });
  }
});

// ============================================================================
// ENDPOINT: OBTENER DATOS DEL PACIENTE DESDE TURNO (para formulario)
// ============================================================================
app.get('/api/turnos/:turnoId/paciente-datos', requireAuth, async (req, res) => {
  try {
    const { turnoId } = req.params;

    console.log('📋 Obteniendo datos del paciente para turno:', turnoId);

    // Obtener turno con datos de persona y paciente
    const turno = await prisma.turno.findUnique({
      where: { id: BigInt(turnoId) },
      select: {
        id: true,
        persona_id: true,
        persona: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            dni: true,
            telefono: true,
            email: true,
            fecha_nacimiento: true,
            sexo: true,
            direccion: true,
            paciente: {
              select: {
                id: true,
                obra_social: true,
                numero_afiliado: true,
                observaciones_generales: true
              }
            }
          }
        }
      }
    });

    if (!turno) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Turno no encontrado'
      });
    }

    if (!turno.persona) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Persona no encontrada para este turno'
      });
    }

    const paciente = turno.persona.paciente;
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

    console.log('✅ Datos obtenidos para paciente:', persona.nombre, persona.apellido);

    return res.status(200).json({
      success: true,
      turno_id: turno.id.toString(),
      paciente: {
        id: paciente ? paciente.id.toString() : null,
        persona: {
          id: persona.id.toString(),
          nombre: persona.nombre,
          apellido: persona.apellido,
          dni: persona.dni,
          edad: edad,
          sexo: persona.sexo,
          telefono: persona.telefono,
          email: persona.email,
          direccion: persona.direccion,
          fecha_nacimiento: persona.fecha_nacimiento ? new Date(persona.fecha_nacimiento).toLocaleDateString('es-AR') : null
        },
        datos_salud: {
          obra_social: paciente?.obra_social || '',
          numero_afiliado: paciente?.numero_afiliado || '',
          observaciones_generales: paciente?.observaciones_generales || ''
        }
      }
    });
  } catch (error) {
    console.error('❌ Error al obtener datos del paciente:', error);
    res.status(500).json({
      error: 'Error interno',
      message: error.message
    });
  }
});

// ============================================================================
// ENDPOINT: CONFIRMAR TURNO CON DATOS COMPLETOS (PENDIENTE -> CONFIRMADO)
// ============================================================================
app.post('/api/turnos/:turnoId/confirmar', requireAuth, async (req, res) => {
  try {
    const { turnoId } = req.params;
    const { 
      obra_social,
      numero_afiliado,
      observaciones_generales
    } = req.body;

    console.log('✅ Confirmando turno:', turnoId);
    console.log('   - Obra Social:', obra_social);
    console.log('   - Número Afiliado:', numero_afiliado);

    // Obtener el turno
    const turno = await prisma.turno.findUnique({
      where: { id: BigInt(turnoId) },
      select: {
        id: true,
        persona_id: true,
        persona: {
          select: {
            paciente: {
              select: { id: true }
            }
          }
        },
        estado: {
          select: { nombre: true }
        }
      }
    });

    if (!turno) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Turno no encontrado'
      });
    }

    // Obtener estado CONFIRMADO
    const estadoConfirmado = await prisma.estadoTurno.findUnique({
      where: { nombre: 'CONFIRMADO' }
    });

    if (!estadoConfirmado) {
      return res.status(500).json({
        error: 'Error',
        message: 'Estado CONFIRMADO no existe en la BD'
      });
    }

    // Si hay paciente, actualizar datos de salud
    if (turno.persona?.paciente?.id) {
      await prisma.paciente.update({
        where: { id: turno.persona.paciente.id },
        data: {
          obra_social: obra_social || undefined,
          numero_afiliado: numero_afiliado || undefined,
          observaciones_generales: observaciones_generales || undefined
        }
      });
      console.log('✅ Datos del paciente actualizados');
    }

    // Cambiar estado a CONFIRMADO
    const turnoConfirmado = await prisma.turno.update({
      where: { id: BigInt(turnoId) },
      data: {
        estado_id: estadoConfirmado.id
      },
      select: {
        id: true,
        estado: {
          select: { nombre: true }
        },
        persona: {
          select: {
            nombre: true,
            apellido: true
          }
        }
      }
    });

    console.log('✅ Turno confirmado - Estado cambiado a CONFIRMADO');

    return res.status(200).json({
      success: true,
      message: 'Turno confirmado exitosamente',
      turno: {
        id: turnoConfirmado.id.toString(),
        estado: turnoConfirmado.estado.nombre,
        persona: `${turnoConfirmado.persona.nombre} ${turnoConfirmado.persona.apellido}`
      }
    });
  } catch (error) {
    console.error('❌ Error al confirmar turno:', error);
    res.status(500).json({
      error: 'Error interno',
      message: error.message
    });
  }
});

// ============================================================================
// VERIFICAR SI EXISTE HISTORIA CLÍNICA PARA UN TURNO
// ============================================================================
app.get('/api/turnos/:turnoId/tiene-historia-clinica', requireAuth, async (req, res) => {
  try {
    const { turnoId } = req.params;

    console.log('📋 Verificando si existe historia clínica para turno:', turnoId);

    // Obtener turno para obtener el paciente_id
    const turno = await prisma.turno.findUnique({
      where: { id: BigInt(turnoId) },
      select: {
        id: true,
        persona: {
          select: {
            paciente: {
              select: {
                id: true
              }
            }
          }
        }
      }
    });

    if (!turno) {
      return res.status(404).json({
        success: false,
        message: 'Turno no encontrado'
      });
    }

    if (!turno.persona?.paciente) {
      return res.status(400).json({
        success: false,
        message: 'El turno no tiene un paciente asociado'
      });
    }

    const paciente_id = turno.persona.paciente.id;

    // Buscar si existe historia clínica
    const historiaClinica = await prisma.historiaClinica.findUnique({
      where: { paciente_id: paciente_id },
      select: {
        id: true,
        activa: true,
        fecha_apertura: true
      }
    });

    if (historiaClinica) {
      console.log('✅ Historia clínica encontrada para paciente:', paciente_id);
      return res.status(200).json({
        success: true,
        tiene_historia: true,
        historia_clinica: {
          id: historiaClinica.id.toString(),
          activa: historiaClinica.activa,
          fecha_apertura: historiaClinica.fecha_apertura
        }
      });
    } else {
      console.log('❌ No existe historia clínica para paciente:', paciente_id);
      return res.status(200).json({
        success: true,
        tiene_historia: false,
        message: 'No existe historia clínica para este paciente'
      });
    }
  } catch (error) {
    console.error('❌ Error al verificar historia clínica:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno',
      message: error.message
    });
  }
});

// ============================================================================
// ENDPOINT: OBTENER TODOS LOS ESTADOS DE TURNOS
// ============================================================================
app.get('/api/estados-turnos', async (req, res) => {
  try {
    console.log('📡 GET /api/estados-turnos - Iniciando...');
    
    // Obtener todos los estados
    let estados = [];
    try {
      console.log('🔄 Consultando BD para estadoTurno...');
      estados = await prisma.estadoTurno.findMany({
        select: {
          id: true,
          nombre: true,
          descripcion: true
        },
        orderBy: { nombre: 'asc' }
      });
      console.log(`✅ BD query exitosa: ${estados.length} estados encontrados`);
    } catch (prismaError) {
      console.error('⚠️  Error en query Prisma:', prismaError.message);
      console.error(prismaError);
    }

    console.log(`✅ Estados cargados: ${estados.length}`);
    estados.forEach(e => console.log(`   - ID: ${e.id}, Nombre: "${e.nombre}", Desc: "${e.descripcion}"`));

    // Convertir BigInt a string para serialización JSON
    const estadosSerializados = estados.map(e => ({
      id: e.id.toString(),
      nombre: e.nombre,
      descripcion: e.descripcion
    }));

    return res.status(200).json({
      success: true,
      data: estadosSerializados,
      count: estadosSerializados.length
    });
  } catch (error) {
    console.error('❌ Error en /api/estados-turnos:', error);
    console.error('   Stack:', error.stack);
    res.status(500).json({
      error: 'Error al obtener estados',
      message: error.message
    });
  }
});

// ============================================================================
// ENDPOINT: BUSCAR CÓDIGOS CIE-10
// ============================================================================
app.get('/api/cie10/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    
    if (query.length < 1) {
      return res.json([]);
    }

    console.log(`🔍 Buscando CIE-10: "${query}"`);

    // Buscar en código o descripción - ordenar por frecuencia_uso (más usados primero)
    const resultados = await prisma.cIE10.findMany({
      where: {
        activo: true,
        OR: [
          {
            codigo: {
              contains: query.toUpperCase(),
              mode: 'insensitive'
            }
          },
          {
            descripcion: {
              contains: query,
              mode: 'insensitive'
            }
          }
        ]
      },
      select: {
        id: true,
        codigo: true,
        descripcion: true,
        capitulo: true,
        subcapitulo: true,
        frecuencia_uso: true
      },
      orderBy: [
        { frecuencia_uso: 'desc' },
        { codigo: 'asc' }
      ],
      take: 20
    });

    console.log(`✅ Se encontraron ${resultados.length} resultados`);

    const respuesta = resultados.map(r => ({
      id: r.id.toString(),
      codigo: r.codigo || '',
      descripcion: r.descripcion || '',
      capitulo: r.capitulo || '',
      subcapitulo: r.subcapitulo || '',
      frecuencia_uso: r.frecuencia_uso || 0
    }));

    res.json(respuesta);
  } catch (error) {
    console.error('❌ Error en búsqueda CIE-10:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// ENDPOINT: ACTUALIZAR ESTADO DEL TURNO (PUT)
// ============================================================================
app.put('/api/turno/:id/estado', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    console.log(`\n🔍 DEBUG /api/turno/:id/estado - START`);
    console.log(`   req.user.medicoId: ${req.user.medicoId}`);
    console.log(`   req.user.role: ${req.user.role}`);
    console.log(`   req.user.email: ${req.user.email}`);
    console.log(`   id (param): ${id} (type: ${typeof id})`);
    console.log(`   estado (body): ${estado}`);

    if (!id || !estado) {
      console.log(`❌ Validation failed: id=${id}, estado=${estado}`);
      return res.status(400).json({
        error: 'Bad request',
        message: 'ID del turno y estado son requeridos'
      });
    }

    // Buscar el estado en BD
    console.log(`🔍 Buscando EstadoTurno con nombre: ${estado}`);
    const estadoTurno = await prisma.estadoTurno.findUnique({
      where: { nombre: estado }
    });

    if (!estadoTurno) {
      console.log(`❌ Estado no encontrado: ${estado}`);
      return res.status(400).json({
        error: 'Bad request',
        message: `Estado "${estado}" no existe`
      });
    }
    
    console.log(`✅ Estado encontrado: id=${estadoTurno.id}, nombre=${estadoTurno.nombre}`);

    // Intentar convertir el ID a BigInt
    let turnoId;
    try {
      turnoId = BigInt(id);
      console.log(`✅ ID convertido a BigInt: ${turnoId}`);
    } catch (e) {
      console.log(`❌ Error convirtiendo ID a BigInt: ${e.message}`);
      return res.status(400).json({
        error: 'Bad request',
        message: `ID inválido: ${id}`
      });
    }

    // Actualizar turno
    console.log(`🔄 Actualizando turno ${turnoId} a estado ${estado}...`);
    const turnoActualizado = await prisma.turno.update({
      where: { id: turnoId },
      data: { 
        estado_id: estadoTurno.id,
        actualizado_en: new Date()
      },
      include: {
        estado: true,
        persona: true,
        medico: true
      }
    });

    console.log(`✅ Turno actualizado exitosamente`);
    console.log(`   Turno ID: ${turnoActualizado.id}`);
    console.log(`   Nuevo estado: ${turnoActualizado.estado.nombre}`);

    return res.status(200).json({
      success: true,
      message: `Estado actualizado a ${estado}`,
      data: {
        id: turnoActualizado.id.toString(),
        estado: turnoActualizado.estado.nombre,
        persona: {
          nombre: turnoActualizado.persona.nombre,
          apellido: turnoActualizado.persona.apellido
        }
      }
    });
  } catch (error) {
    console.error(`❌ Error en /api/turno/:id/estado:`, error);
    console.error(`   Message: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
    
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      details: error.stack
    });
  }
});

// ============================================================================
// ENDPOINT: MIS TURNOS (DEPRECATED - usar /api/doctor-todos-turnos)
// ============================================================================
app.get('/api/mis-turnos', requireAuth, async (req, res) => {
  try {
    console.log('\n🔍 DEBUG /api/mis-turnos:');
    console.log(`   req.user.medicoId: ${req.user.medicoId} (tipo: ${typeof req.user.medicoId})`);
    console.log(`   req.user.role: ${req.user.role}`);
    console.log(`   req.user.email: ${req.user.email}\n`);

    const medicoId = BigInt(req.user.medicoId);
    const userRole = req.user.role;

    let turnos = [];

    if (userRole === 'DOCTOR') {
      console.log(`✅ Rol es DOCTOR, buscando turnos con medico_id: ${medicoId}`);
      // Los doctores ven SUS turnos (como médico)
      turnos = await prisma.turno.findMany({
        where: {
          medico_id: medicoId
        },
        include: {
          persona: true,
          medico: true,
          estado: true
        },
        orderBy: { fecha: 'desc' }
      });

      console.log(`📅 Turnos encontrados: ${turnos.length}\n`);

      // Formatear respuesta para doctores
      const formatted = turnos.map(t => ({
        id: t.id.toString(),
        fecha: t.fecha.toISOString().split('T')[0],
        hora: t.hora || '12:00',
        estado: t.estado?.nombre || 'PENDIENTE',
        persona: {
          nombre: t.persona?.nombre || 'N/A',
          apellido: t.persona?.apellido || 'N/A',
          documento: t.persona?.dni || 'N/A'
        },
        observaciones: t.observaciones || '',
        medico: {
          nombre: t.medico?.nombre || 'N/A',
          apellido: t.medico?.apellido || 'N/A',
          especialidad: t.medico?.especialidad || 'General'
        }
      }));

      return res.json({
        success: true,
        data: formatted,
        count: formatted.length
      });
    }

    console.log(`❌ Rol NO es DOCTOR, es: "${userRole}"\n`);

    // Para PACIENTE: obtener sus turnos por persona_id
    turnos = await prisma.turno.findMany({
      where: {
        persona_id: BigInt(req.user.personaId || 0)
      },
      include: {
        persona: true,
        medico: true,
        estado: true
      },
      orderBy: { fecha: 'desc' }
    });

    // Formatear respuesta para pacientes
    const formatted = turnos.map(t => ({
      id: t.id.toString(),
      fecha: t.fecha.toISOString().split('T')[0],
      hora: t.hora || '12:00',
      estado: t.estado?.nombre || 'PENDIENTE',
      medico: {
        nombre: t.medico?.nombre || 'N/A',
        apellido: t.medico?.apellido || 'N/A',
        especialidad: t.medico?.especialidad || 'General'
      },
      observaciones: t.observaciones || ''
    }));

    res.json({
      success: true,
      data: formatted,
      count: formatted.length
    });
  } catch (error) {
    console.error('❌ Error en /api/mis-turnos:', error);
    res.status(500).json({
      error: 'Error al obtener turnos',
      message: error.message
    });
  }
});

// ============================================================================
// ENDPOINT AGENDAR TURNO (POST) - Para Secretarias y Doctores
// Paso 1: Buscar o crear PERSONA (por DNI)
// Paso 2: Crear TURNO
// Paso 3: Crear PACIENTE (si es primera consulta)
// ============================================================================
app.post('/api/agendar-turno', requireAuth, requireRole(['secretaria', 'doctor']), async (req, res) => {
  try {
    const {
      nombre,
      apellido,
      dni,
      telefono,
      email,
      fecha_nacimiento,
      obra_social,
      numero_afiliado,
      fecha,
      hora,
      medico_id,
      motivo,
      observaciones
    } = req.body;

    // Validaciones
    if (!nombre || !apellido || !dni || !fecha || !hora || !medico_id) {
      return res.status(400).json({
        error: 'Faltan datos requeridos',
        message: 'Nombre, Apellido, DNI, Fecha, Hora y Médico son obligatorios'
      });
    }

    // ========================================
    // PASO 1: BUSCAR O CREAR PERSONA
    // ========================================
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
          email: email?.trim() || null,
          fecha_nacimiento: fecha_nacimiento ? new Date(fecha_nacimiento) : null,
          sexo: null,
          direccion: null
        }
      });
      console.log('✅ Persona CREADA:', persona.id, `(${persona.nombre} ${persona.apellido})`);
    } else {
      console.log('✅ Persona ENCONTRADA:', persona.id, `(${persona.nombre} ${persona.apellido})`);
      
      // Actualizar datos si vinieron nuevos
      if (telefono && !persona.telefono) {
        persona = await prisma.persona.update({
          where: { id: persona.id },
          data: { telefono: telefono.trim() }
        });
      }
      if (email && !persona.email) {
        persona = await prisma.persona.update({
          where: { id: persona.id },
          data: { email: email.trim() }
        });
      }
    }

    // ========================================
    // PASO 2: CREAR TURNO
    // ========================================
    // Buscar el estado PENDIENTE
    const estadoPendiente = await prisma.estadoTurno.findUnique({
      where: { nombre: 'PENDIENTE' }
    });
    
    if (!estadoPendiente) {
      return res.status(400).json({
        error: 'Estado PENDIENTE no encontrado en la base de datos'
      });
    }

    const turno = await prisma.turno.create({
      data: {
        persona_id: persona.id,
        medico_id: BigInt(medico_id),
        fecha: new Date(fecha),
        hora: hora,
        estado_id: estadoPendiente.id, // PENDIENTE (default)
        motivo: motivo?.trim() || null,
        observaciones: observaciones?.trim() || null,
        creado_por: req.user.medicoId || BigInt(req.user.id)
      },
      include: {
        persona: true,
        medico: {
          include: {
            persona: true,
            especialidad: true
          }
        }
      }
    });

    console.log('✅ Turno CREADO:', turno.id, `para ${persona.nombre} ${persona.apellido}`);

    // ========================================
    // PASO 3: CREAR PACIENTE (si es primera consulta)
    // ========================================
    let paciente = await prisma.paciente.findFirst({
      where: { persona_id: persona.id }
    });

    if (!paciente && (obra_social || numero_afiliado)) {
      // Si NO existe PACIENTE y vinieron datos de cobertura, crear paciente
      paciente = await prisma.paciente.create({
        data: {
          persona_id: persona.id,
          obra_social: obra_social?.trim() || null,
          numero_afiliado: numero_afiliado?.trim() || null
        }
      });
      console.log('✅ Paciente CREADO:', paciente.id);
    }

    // Respuesta exitosa
    res.status(201).json({
      success: true,
      message: 'Turno agendado exitosamente',
      turno: {
        id: turno.id.toString(),
        fecha: turno.fecha.toISOString().split('T')[0],
        hora: turno.hora,
        persona: `${persona.nombre} ${persona.apellido}`,
        medico: `${turno.medico?.persona?.nombre} ${turno.medico?.persona?.apellido}`,
        especialidad: turno.medico?.especialidad?.nombre || 'General',
        motivo: turno.motivo,
        observaciones: turno.observaciones
      }
    });
  } catch (error) {
    console.error('❌ Error al agendar turno:', error);
    res.status(500).json({
      error: 'Error al agendar turno',
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

    // Buscar estado PENDIENTE
    const estadoPendiente = await prisma.estadoTurno.findUnique({
      where: { nombre: 'PENDIENTE' }
    });

    if (!estadoPendiente) {
      return res.status(400).json({
        error: 'Estado PENDIENTE no encontrado en la base de datos'
      });
    }

    const turno = await prisma.turno.create({
      data: {
        persona_id: BigInt(persona_id),
        medico_id: BigInt(req.user.id),
        fecha: new Date(fecha),
        hora: hora,
        estado_id: estadoPendiente.id, // PENDIENTE
        observaciones: observaciones || null
      },
      include: {
        persona: true,
        estado: {
          select: { id: true, nombre: true }
        }
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
        estado: turno.estado.nombre,
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

    // Buscar estado PENDIENTE
    const estadoPendiente = await prisma.estadoTurno.findUnique({
      where: { nombre: 'PENDIENTE' }
    });

    if (!estadoPendiente) {
      return res.status(400).json({
        error: 'Estado PENDIENTE no encontrado en la base de datos'
      });
    }

    // Crear el turno
    const turno = await prisma.turno.create({
      data: {
        persona_id: persona.id,
        medico_id: BigInt(req.user.id),
        fecha: new Date(fecha),
        hora: hora,
        estado_id: estadoPendiente.id, // PENDIENTE
        observaciones: observaciones || null
      },
      include: {
        persona: true,
        estado: {
          select: { id: true, nombre: true }
        }
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
        estado: turno.estado.nombre,
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
    const { paciente_id, historia_id, turno_id, motivo_consulta } = req.body;

    // Aceptar tanto paciente_id como historia_id
    let targetPacienteId = paciente_id;
    let targetHistoriaId = historia_id;
    
    if (!targetPacienteId && !targetHistoriaId) {
      return res.status(400).json({
        error: 'Se requiere paciente_id o historia_id'
      });
    }

    // Si tenemos historia_id pero no paciente_id, obtener el paciente from historia
    if (targetHistoriaId && !targetPacienteId) {
      const historia = await prisma.historiaClinica.findUnique({
        where: { id: BigInt(targetHistoriaId) }
      });
      if (historia) {
        targetPacienteId = historia.paciente_id;
      }
    }

    if (!targetPacienteId) {
      return res.status(400).json({
        error: 'No se pudo determinar el paciente_id'
      });
    }

    // Obtener o usar historia clínica existente
    let historia = targetHistoriaId ? 
      await prisma.historiaClinica.findUnique({
        where: { id: BigInt(targetHistoriaId) }
      }) :
      await prisma.historiaClinica.findFirst({
        where: {
          paciente_id: BigInt(targetPacienteId),
          activa: true
        }
      });

    if (!historia) {
      historia = await prisma.historiaClinica.create({
        data: {
          paciente_id: BigInt(targetPacienteId),
          creada_por_medico_id: BigInt(req.user.id),
          activa: true
        }
      });
    }

    const consulta = await prisma.consultaMedica.create({
      data: {
        historia_clinica_id: historia.id,
        medico_id: BigInt(req.user.id),
        turno_id: turno_id ? BigInt(turno_id) : null,
        motivo_consulta: motivo_consulta || 'Sin especificar',
        fecha: new Date()
      }
    });

    console.log(`✅ Consulta creada: #${consulta.id} para historia #${historia.id}`);
    res.json({
      success: true,
      data: {
        id: consulta.id.toString(),
        historia_clinica_id: consulta.historia_clinica_id.toString(),
        fecha: consulta.fecha,
        medico_id: consulta.medico_id.toString()
      },
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
    const historiaExistente = await prisma.historiaClinica.findFirst({
      where: {
        paciente_id: BigInt(paciente_id),
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
    const historia = await prisma.historiaClinica.create({
      data: {
        paciente_id: BigInt(paciente_id),
        creada_por_medico_id: BigInt(req.user.id),
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
    // Obtener personas que tengan:
    // 1. Un Paciente registrado
    // 2. Una Historia Clínica asociada (confirmación completa)
    const personas = await prisma.persona.findMany({
      where: {
        AND: [
          {
            paciente: {
              isNot: null // Debe tener un registro de Paciente
            }
          },
          {
            paciente: {
              historias_clinicas: {
                some: {} // Debe tener una Historia Clínica
              }
            }
          }
        ]
      },
      include: {
        turnos: {
          include: {
            estado: {
              select: {
                id: true,
                nombre: true,
                descripcion: true,
                activo: true
              }
            }
          },
          orderBy: { fecha: 'desc' },
          take: 1 // Solo el más reciente
        },
        paciente: {
          select: {
            id: true,
            obra_social: true,
            historiaClinica: {
              select: {
                id: true,
                activa: true
              }
            }
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
      tiene_historia_clinica: p.paciente?.historiaClinica ? true : false,
      historia_clinica_activa: p.paciente?.historiaClinica?.activa || false,
      ultimo_turno: p.turnos[0] ? {
        id: p.turnos[0].id.toString(),
        estado: {
          id: p.turnos[0].estado.id.toString(),
          nombre: p.turnos[0].estado.nombre,
          descripcion: p.turnos[0].estado.descripcion,
          activo: p.turnos[0].estado.activo
        },
        fecha: p.turnos[0].fecha.toISOString()
      } : null
    }));

    console.log(`✅ ${resultado.length} pacientes con Historia Clínica encontrados`);

    res.json({
      success: true,
      data: resultado,
      count: resultado.length
    });
  } catch (error) {
    console.error('❌ Error en obtener pacientes con historia clínica:', error);
    res.status(500).json({
      error: 'Error al obtener pacientes con historia clínica',
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
      nombre: req.user.nombre,
      apellido: req.user.apellido,
      rol: req.user.role,
      email: req.user.email
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
        nombre: req.user.nombre,
        apellido: req.user.apellido,
        rol: req.user.role,
        email: req.user.email
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
        nombre: req.user.nombre,
        apellido: req.user.apellido,
        rol: req.user.role,
        email: req.user.email
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
      nombre: req.user.nombre,
      apellido: req.user.apellido,
      rol: req.user.role,
      email: req.user.email
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
      nombre: req.user.nombre,
      apellido: req.user.apellido,
      rol: req.user.role,
      email: req.user.email
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
    token: req.cookies.access_token,
    user: {
      nombre: req.user.nombre,
      apellido: req.user.apellido,
      rol: req.user.role,
      email: req.user.email
    }
  });
});

// Agendar Turno
app.get('/doctor/agendar-turno', requireAuth, requireRole(['doctor']), (req, res) => {
  res.render('pages/agendar-turno-nueva', {
    title: 'Agendar Turno',
    token: req.cookies.access_token,
    user: {
      nombre: req.user.nombre,
      apellido: req.user.apellido,
      rol: req.user.role,
      medico_id: req.user.medicoId
    }
  });
});

// Pacientes del Doctor
app.get('/doctor/pacientes', requireAuth, requireRole(['doctor']), async (req, res) => {
  try {
    // Obtener solo pacientes ACTIVOS que tengan Historia Clínica
    const pacientes = await prisma.paciente.findMany({
      where: {
        AND: [
          { activo: true },
          {
            historias_clinicas: {
              some: {} // Debe tener al menos una Historia Clínica
            }
          }
        ]
      },
      include: {
        persona: true,
        historias_clinicas: {
          select: { 
            id: true,
            activa: true,
            fecha_apertura: true
          },
          take: 1
        }
      },
      orderBy: { creado_en: 'desc' }
    });

    // Mapear datos para la vista
    const pacientesList = pacientes
      .filter(p => p.persona)
      .map(p => {
        const fechaNac = p.persona.fecha_nacimiento ? new Date(p.persona.fecha_nacimiento) : null;
        const hoy = new Date();
        let edad = '-';
        
        if (fechaNac) {
          edad = hoy.getFullYear() - fechaNac.getFullYear();
          const mes = hoy.getMonth() - fechaNac.getMonth();
          if (mes < 0 || (mes === 0 && hoy.getDate() < fechaNac.getDate())) {
            edad--;
          }
        }

        return {
          id: p.id.toString(),
          dni: p.persona.dni || '-',
          nombre: `${p.persona.nombre} ${p.persona.apellido}`,
          telefono: p.persona.telefono || '-',
          email: p.persona.email || '-',
          edad: edad,
          obra_social: p.obra_social || '-',
          estado: 'Activo',
          tiene_historia: p.historias_clinicas && p.historias_clinicas.length > 0,
          historia_activa: p.historias_clinicas && p.historias_clinicas.length > 0 ? p.historias_clinicas[0].activa : false
        };
      });

    console.log(`✅ ${pacientesList.length} pacientes con Historia Clínica cargados`);

    res.render('pages/pacientes', {
      title: 'Mis Pacientes',
      pacientes: pacientesList,
      user: {
        nombre: req.user.nombre,
        apellido: req.user.apellido,
        rol: req.user.role,
        email: req.user.email
      }
    });
  } catch (error) {
    console.error('Error al obtener pacientes:', error);
    res.render('pages/pacientes', {
      title: 'Mis Pacientes',
      pacientes: [],
      user: {
        nombre: req.user.nombre,
        apellido: req.user.apellido,
        rol: req.user.role,
        email: req.user.email
      }
    });
  }
});

// Ruta para ver detalles de paciente (historia completa)
app.get('/doctor/pacientes/:paciente_id', requireAuth, requireRole(['doctor']), async (req, res) => {
  try {
    const paciente_id = BigInt(req.params.paciente_id);
    const { turno_id } = req.query;

    // Obtener paciente con su historia clínica
    let paciente = await prisma.paciente.findUnique({
      where: { id: paciente_id },
      include: {
        persona: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            dni: true,
            email: true,
            telefono: true,
            fecha_nacimiento: true,
            sexo: true
          }
        },
        historias_clinicas: {
          where: { activa: true },
          include: {
            documentos: {
              where: {
                eliminado: false,
                estudio_id: null
              }
            },
            antecedentes: true,
            consultas: {
              include: {
                medico: {
                  select: {
                    nombre: true,
                    apellido: true
                  }
                },
                anamnesis: true,
                tratamientos: true,
                signos_vitales: true,
                diagnosticos: true,
                estudios: true
              },
              orderBy: { fecha: 'desc' }
            },
            medico_apertura: {
              select: {
                nombre: true,
                apellido: true
              }
            }
          },
          orderBy: { fecha_apertura: 'desc' },
          take: 1
        }
      }
    });

    // Si NO existe el paciente, intentar crearlo automáticamente
    if (!paciente && turno_id) {
      console.log(`📝 Paciente ${paciente_id} no existe. Intentando crear desde turno ${turno_id}...`);
      
      try {
        // Obtener el turno para conseguir los datos de la persona
        const turno = await prisma.turno.findUnique({
          where: { id: BigInt(turno_id) },
          include: { 
            persona: { 
              select: { id: true, nombre: true, apellido: true, dni: true, obra_social: true, numero_afiliado: true } 
            } 
          }
        });

        if (turno && turno.persona) {
          console.log(`📝 Creando paciente para: ${turno.persona.nombre} ${turno.persona.apellido}`);
          
          // Crear el paciente
          paciente = await prisma.paciente.create({
            data: {
              persona_id: turno.persona.id,
              obra_social: turno.persona.obra_social,
              numero_afiliado: turno.persona.numero_afiliado,
              activo: true
            },
            include: {
              persona: {
                select: {
                  id: true,
                  nombre: true,
                  apellido: true,
                  dni: true,
                  email: true,
                  telefono: true,
                  fecha_nacimiento: true,
                  sexo: true
                }
              }
            }
          });
          
          console.log(`✅ Paciente creado exitosamente: ID ${paciente.id}`);
        }
      } catch (createError) {
        console.error(`❌ Error al crear paciente: ${createError.message}`);
      }
    }

    // Si aún no existe, retornar error
    if (!paciente) {
      return res.status(404).render('pages/500', {
        title: 'Error',
        message: 'Paciente no encontrado y no se pudo crear automáticamente'
      });
    }

    // Obtener historia clínica activa
    let historias = paciente.historias_clinicas || [];
    let historia = historias.length > 0 ? historias[0] : null;
    
    // Si no existe historia y viene de un turno, crear automáticamente
    if (!historia && turno_id) {
      try {
        console.log(`📝 Creando história clínica automáticamente para paciente ${paciente_id} desde turno ${turno_id}`);
        historia = await prisma.historiaClinica.create({
          data: {
            paciente_id: paciente_id,
            creada_por_medico_id: BigInt(req.user.id),
            activa: true
          }
        });
        
        // Crear consulta médica automáticamente asociada al turno
        const nuevaConsulta = await prisma.consultaMedica.create({
          data: {
            historia_clinica_id: historia.id,
            medico_id: BigInt(req.user.id),
            turno_id: BigInt(turno_id),
            estado: 'INICIADA',
            fecha: new Date()
          }
        });
        
        console.log(`✅ Historia clínica creada automáticamente: ID ${historia.id}`);
        console.log(`✅ Consulta médica creada automáticamente: ID ${nuevaConsulta.id}`);
        
        // Recargar historia con todas las relaciones
        historia = await prisma.historiaClinica.findUnique({
          where: { id: historia.id },
          include: {
            documentos: {
              where: {
                eliminado: false,
                estudio_id: null
              }
            },
            antecedentes: true,
            consultas: {
              include: {
                medico: {
                  select: {
                    nombre: true,
                    apellido: true
                  }
                },
                tratamientos: true,
                signos_vitales: true,
                diagnosticos: true,
                estudios: true
              },
              orderBy: { fecha: 'desc' }
            },
            medico_apertura: {
              select: {
                nombre: true,
                apellido: true
              }
            }
          }
        });
      } catch (createHistoriaError) {
        console.error(`❌ Error al crear historia automáticamente:`, createHistoriaError);
      }
    }
    
    const consultas = historia?.consultas || [];
    const consulta = consultas.length > 0 ? consultas[0] : null;
    const signosVitales = consulta?.signos_vitales?.length > 0 ? consulta.signos_vitales[0] : null;

    console.log(`📊 Historia #${historia?.id}: ${consultas.length} consultas cargadas`);
    if (consultas.length > 0) {
      console.log(`   └─ Primera consulta: #${consultas[0].id}, estado: ${consultas[0].estado}`);
      const anamRecuperada = consultas[0].anamnesis?.enfermedad_actual;
      console.log(`   └─ Anamnesis recuperada de BD: "${anamRecuperada}" (${anamRecuperada ? 'CON VALOR' : 'VACÍA'})`);
      
      // ANTECEDENTES
      const antPersonal = historia.antecedentes?.find(a => a.tipo === 'PERSONAL');
      console.log(`   └─ Antecedentes en historia:`, {
        totalAntecedentes: historia.antecedentes?.length || 0,
        antecedentesArray: historia.antecedentes,
        antPersonalEncontrado: antPersonal ? `SÍ - valor: "${antPersonal.descripcion}"` : 'NO'
      });
    }

    // Preparar datos para la vista
    const edad = paciente.persona?.fecha_nacimiento 
      ? new Date().getFullYear() - new Date(paciente.persona.fecha_nacimiento).getFullYear()
      : 0;

    const datos = {
      title: 'Historia Clínica',
      paciente: {
        id: paciente.id.toString(),
        nombre: paciente.persona?.nombre || '',
        apellido: paciente.persona?.apellido || '',
        edad: edad,
        sexo: paciente.persona?.sexo || '',
        fecha_nacimiento: paciente.persona?.fecha_nacimiento ? 
          new Date(paciente.persona.fecha_nacimiento).toLocaleDateString('es-AR') : 'N/A',
        dni: paciente.persona?.dni || '',
        email: paciente.persona?.email || '',
        telefono: paciente.persona?.telefono || '',
        obra_social: paciente.obra_social || ''
      },
      historia: historia ? {
        id: historia.id.toString(),
        fecha_apertura: historia.fecha_apertura ? new Date(historia.fecha_apertura).toLocaleDateString('es-AR') : '-',
        medico_apertura: historia.medico_apertura ? `Dr/Dra. ${historia.medico_apertura.nombre} ${historia.medico_apertura.apellido}` : '-',
        activa: historia.activa,
        antecedentes: historia.antecedentes?.find(a => a.tipo === 'PERSONAL')?.descripcion || '',
        documentos: (historia.documentos || []).map(doc => ({
          id: String(doc.id || ''),
          nombre_archivo: doc.nombre_archivo || 'documento',
          url: doc.url_storage || '',
          fecha_carga: doc.fecha_subida || doc.creado_en
        })),
        anamnesis: historia.consultas?.[0]?.anamnesis?.enfermedad_actual || '',
        diagnosticos: historia.consultas?.[0]?.diagnosticos || [],
        consultas: consultas.map(c => ({
          id: String(c.id || ''),
          historia_clinica_id: String(c.historia_clinica_id || ''),
          medico_id: String(c.medico_id || ''),
          turno_id: String(c.turno_id || ''),
          estado_id: String(c.estado_id || ''),
          fecha: c.fecha ? new Date(c.fecha).toLocaleDateString('es-AR') : '-',
          motivo_consulta: c.motivo_consulta || '-',
          resumen: c.resumen || '-',
          anamnesis: c.anamnesis?.enfermedad_actual || '',
          medico: c.medico ? `Dr/Dra. ${c.medico.nombre} ${c.medico.apellido}` : '-',
          signos_vitales: (c.signos_vitales || []).map(sv => ({
            id: String(sv.id || ''),
            peso_kg: sv.peso_kg,
            talla_cm: sv.talla_cm,
            imc: sv.imc,
            presion_sistolica: sv.presion_sistolica,
            presion_diastolica: sv.presion_diastolica,
            frecuencia_cardiaca: sv.frecuencia_cardiaca,
            temperatura_c: sv.temperatura_c,
            glucemia_mg_dl: sv.glucemia_mg_dl,
            circunferencia_abd_cm: sv.circunferencia_abd_cm,
            fecha_registro: sv.fecha_registro
          })),
          diagnosticos: (c.diagnosticos || []).map(d => ({
            id: String(d.id || ''),
            codigo: d.codigo || '',
            descripcion: d.descripcion || '',
            tipo: d.tipo || '',
            principal: d.principal || false
          })),
          tratamientos: (c.tratamientos || []).map(t => ({
            id: String(t.id || ''),
            medicamento: t.medicamento || '',
            dosis: t.dosis || '',
            unidad: t.unidad || '',
            duracion: t.duracion || '',
            instrucciones: t.instrucciones || ''
          })),
          estudios: (c.estudios || []).map(e => ({
            id: String(e.id || ''),
            tipo_estudio: e.tipo_estudio || '',
            resultado: e.resultado || '',
            observaciones: e.observaciones || '',
            fecha_estudio: e.fecha_estudio ? new Date(e.fecha_estudio).toISOString().split('T')[0] : null
          }))
        }))
      } : null,
      documentos: historia ? (historia.documentos || []).map(doc => ({
        id: String(doc.id || ''),
        nombre_archivo: doc.nombre_archivo || 'documento',
        url: doc.url_storage || '',
        fecha_carga: doc.fecha_subida || doc.creado_en
      })) : [],
      user: {
        nombre: req.user.nombre,
        apellido: req.user.apellido,
        rol: req.user.role,
        email: req.user.email
      },
      turno_id: turno_id || '',
      is_new_consulta: !historia
    };

    res.render('pages/historia-detalle', datos);
  } catch (error) {
    console.error('Error al obtener historia clínica:', error);
    res.status(500).render('pages/500', {
      title: 'Error',
      message: 'Error al cargar la historia clínica: ' + error.message
    });
  }
});

// ============================================================================
// ACTUALIZAR CONSULTA MÉDICA
// ============================================================================
app.put('/api/consulta/:consultaId', requireAuth, async (req, res) => {
  try {
    const { motivo_consulta, anamnesis } = req.body;
    const { consultaId } = req.params;

    const consulta = await prisma.consultaMedica.update({
      where: { id: BigInt(consultaId) },
      data: {
        motivo_consulta: motivo_consulta || undefined,
        resumen: anamnesis || undefined,
        actualizado_en: new Date()
      }
    });

    console.log(`✅ Consulta ${consultaId} actualizada`);
    res.json({ success: true, message: 'Consulta actualizada correctamente', consulta });

  } catch (error) {
    console.error('❌ Error actualizando consulta:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================================
// ACTUALIZAR SIGNOS VITALES
// ============================================================================
app.put('/api/signos-vitales/:signosVitalesId', requireAuth, async (req, res) => {
  try {
    const { signosVitalesId } = req.params;
    const {
      peso_kg,
      talla_cm,
      presion_sistolica,
      presion_diastolica,
      frecuencia_cardiaca,
      temperatura_c,
      glucemia_mg_dl,
      circunferencia_abd_cm,
      saturacion_o2
    } = req.body;

    // Calcular IMC si hay peso y talla
    let imc = undefined;
    if (peso_kg && talla_cm) {
      const talla_m = talla_cm / 100;
      imc = parseFloat((peso_kg / (talla_m * talla_m)).toFixed(2));
    }

    const signosVitales = await prisma.signosVitales.update({
      where: { id: BigInt(signosVitalesId) },
      data: {
        peso_kg: peso_kg ? parseFloat(peso_kg) : undefined,
        talla_cm: talla_cm ? parseFloat(talla_cm) : undefined,
        imc: imc,
        presion_sistolica: presion_sistolica ? parseInt(presion_sistolica) : undefined,
        presion_diastolica: presion_diastolica ? parseInt(presion_diastolica) : undefined,
        frecuencia_cardiaca: frecuencia_cardiaca ? parseInt(frecuencia_cardiaca) : undefined,
        temperatura_c: temperatura_c ? parseFloat(temperatura_c) : undefined,
        glucemia_mg_dl: glucemia_mg_dl ? parseFloat(glucemia_mg_dl) : undefined,
        circunferencia_abd_cm: circunferencia_abd_cm ? parseFloat(circunferencia_abd_cm) : undefined,
        saturacion_o2: saturacion_o2 ? parseInt(saturacion_o2) : undefined
      }
    });

    console.log(`✅ Signos Vitales ${signosVitalesId} actualizados`);
    res.json({ success: true, message: 'Signos vitales actualizados correctamente', signosVitales });

  } catch (error) {
    console.error('❌ Error actualizando signos vitales:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================================
// UPLOAD DOCUMENTO A CLOUDINARY
// ============================================================================
app.post('/api/upload-documento', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const { historia_id } = req.body;
    const file = req.file;
    
    console.log(`📤 Subiendo documento a Cloudinary: ${file.originalname}`);

    // Subir a Cloudinary
    let cloudinaryResult;
    try {
      // Detectar tipo de recurso basado en MIME type
      const resourceType = file.mimetype.startsWith('image/') ? 'image' : 'raw';
      
      cloudinaryResult = await cloudinary.uploader.upload(file.path, {
        folder: 'medical_files',
        resource_type: resourceType,
        public_id: `documento_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9]/g, '_')}`,
        use_filename: true
      });
      
      console.log(`✅ Archivo subido a Cloudinary:`, cloudinaryResult.public_id);
    } catch (cloudinaryError) {
      console.error('❌ Error subiendo a Cloudinary:', cloudinaryError.message);
      throw new Error(`Error subiendo a Cloudinary: ${cloudinaryError.message}`);
    }

    // Guardar referencia en base de datos
    const documento = await prisma.documentoAdjunto.create({
      data: {
        historia_clinica_id: BigInt(historia_id),
        nombre_archivo: file.originalname,
        tipo_mime: file.mimetype,
        tamano_bytes: BigInt(file.size),
        url_storage: cloudinaryResult.secure_url,
        cloudinary_id: cloudinaryResult.public_id,
        subido_por_medico_id: BigInt(req.user.id)
      }
    });

    // Eliminar archivo temporal
    fs.unlink(file.path, (err) => {
      if (err) console.error('Error eliminando archivo temporal:', err.message);
    });

    console.log(`✅ Documento ${file.originalname} registrado en BD`);
    res.json({ 
      success: true, 
      message: 'Documento subido correctamente a Cloudinary', 
      documento: {
        id: documento.id.toString(),
        nombre_archivo: documento.nombre_archivo,
        url_storage: documento.url_storage,
        cloudinary_id: documento.cloudinary_id
      }
    });

  } catch (error) {
    console.error('❌ Error subiendo documento:', error.message);
    
    // Limpiar archivo temporal en caso de error
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error eliminando archivo temporal:', err.message);
      });
    }
    
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================================
// AGREGAR ANTECEDENTE A HISTORIA
// ============================================================================
app.post('/api/antecedente', requireAuth, async (req, res) => {
  try {
    const { historia_id, descripcion } = req.body;

    if (!historia_id || !descripcion) {
      return res.status(400).json({ success: false, message: 'historia_id y descripcion son requeridos' });
    }

    const antecedente = await prisma.antecedente.create({
      data: {
        historia_clinica_id: BigInt(historia_id),
        descripcion: descripcion,
        registrado_en: new Date()
      }
    });

    console.log(`✅ Antecedente ${antecedente.id} agregado a historia ${historia_id}`);
    res.json({ success: true, message: 'Antecedente agregado correctamente', antecedente });

  } catch (error) {
    console.error('❌ Error agregando antecedente:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================================
// ACTUALIZAR ANTECEDENTE
// ============================================================================
app.put('/api/antecedente/:antecedenteId', requireAuth, async (req, res) => {
  try {
    const { antecedenteId } = req.params;
    const { descripcion } = req.body;

    const antecedente = await prisma.antecedente.update({
      where: { id: BigInt(antecedenteId) },
      data: {
        descripcion: descripcion || undefined
      }
    });

    console.log(`✅ Antecedente ${antecedenteId} actualizado`);
    res.json({ success: true, message: 'Antecedente actualizado correctamente', antecedente });

  } catch (error) {
    console.error('❌ Error actualizando antecedente:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================================
// ELIMINAR ANTECEDENTE
// ============================================================================
app.delete('/api/antecedente/:antecedenteId', requireAuth, async (req, res) => {
  try {
    const { antecedenteId } = req.params;

    await prisma.antecedente.delete({
      where: { id: BigInt(antecedenteId) }
    });

    console.log(`✅ Antecedente ${antecedenteId} eliminado`);
    res.json({ success: true, message: 'Antecedente eliminado correctamente' });

  } catch (error) {
    console.error('❌ Error eliminando antecedente:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================================
// ELIMINAR DOCUMENTO ADJUNTO
// ============================================================================
app.delete('/api/documento/:documentoId', requireAuth, async (req, res) => {
  try {
    const { documentoId } = req.params;

    // Obtener el documento para conseguir el cloudinary_id
    const documento = await prisma.documentoAdjunto.findUnique({
      where: { id: BigInt(documentoId) }
    });

    if (!documento) {
      return res.status(404).json({ success: false, message: 'Documento no encontrado' });
    }

    // Eliminar de Cloudinary
    if (documento.cloudinary_id) {
      try {
        await cloudinary.uploader.destroy(documento.cloudinary_id, {
          resource_type: documento.tipo_mime?.startsWith('image/') ? 'image' : 'raw'
        });
        console.log(`✅ Documento eliminado de Cloudinary: ${documento.cloudinary_id}`);
      } catch (cloudinaryError) {
        console.error('⚠️ Error eliminando de Cloudinary:', cloudinaryError.message);
        // Continuar de todas formas para eliminar de la BD
      }
    }

    // Marcar como eliminado en la BD (soft delete)
    await prisma.documentoAdjunto.update({
      where: { id: BigInt(documentoId) },
      data: { eliminado: true }
    });

    console.log(`✅ Documento ${documentoId} marcado como eliminado`);
    res.json({ success: true, message: 'Documento eliminado correctamente' });

  } catch (error) {
    console.error('❌ Error eliminando documento:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================================
// RUTAS API
// ============================================================================

// Buscar Persona por DNI
app.get('/api/personas/search', requireAuth, async (req, res) => {
  try {
    const { dni } = req.query;

    if (!dni) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'DNI es requerido'
      });
    }

    // Convertir DNI a Int para comparar correctamente
    const dniInt = parseInt(dni);
    
    if (isNaN(dniInt)) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'DNI debe ser un número válido'
      });
    }

    const persona = await prisma.persona.findUnique({
      where: { dni: dniInt },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        dni: true,
        email: true,
        telefono: true,
        fecha_nacimiento: true,
        sexo: true,
        direccion: true,
        obra_social: true,
        numero_afiliado: true
      }
    });

    if (persona) {
      return res.json({
        success: true,
        persona: persona
      });
    } else {
      return res.json({
        success: true,
        persona: null,
        message: 'Persona no encontrada'
      });
    }
  } catch (error) {
    console.error('Error al buscar persona:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// ============================================================================
// GET /api/medicos - Obtener lista de médicos disponibles
// ============================================================================
app.get('/api/medicos', async (req, res) => {
  try {
    const medicos = await prisma.medico.findMany({
      where: { activo: true },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        especialidad: true,
        subespecialidad: true,
        email: true
      },
      orderBy: { apellido: 'asc' }
    });

    return res.status(200).json({
      success: true,
      data: medicos.map(m => ({
        id: m.id.toString(),
        nombre: m.nombre,
        apellido: m.apellido,
        nombre_completo: `${m.nombre} ${m.apellido}`,
        especialidad: m.especialidad,
        subespecialidad: m.subespecialidad,
        email: m.email
      }))
    });
  } catch (error) {
    console.error('Error al obtener médicos:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// ============================================================================
// POST /api/verificar-paciente - Verificar si paciente existe por DNI
// ============================================================================
app.post('/api/verificar-paciente', async (req, res) => {
  try {
    const { dni } = req.body;

    if (!dni) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'DNI es requerido'
      });
    }

    // Buscar persona por DNI
    const persona = await prisma.persona.findUnique({
      where: { dni: parseInt(dni) },
      include: {
        paciente: true
      }
    });

    if (!persona) {
      return res.status(200).json({
        success: true,
        existe: false,
        message: 'Paciente no registrado',
        data: null
      });
    }

    // Paciente existe
    return res.status(200).json({
      success: true,
      existe: true,
      message: 'Paciente encontrado',
      data: {
        persona_id: persona.id.toString(),
        nombre: persona.nombre,
        apellido: persona.apellido,
        dni: persona.dni,
        telefono: persona.telefono,
        email: persona.email,
        fecha_nacimiento: persona.fecha_nacimiento,
        paciente: persona.paciente ? {
          id: persona.paciente.id.toString(),
          obra_social: persona.paciente.obra_social,
          numero_afiliado: persona.paciente.numero_afiliado,
          activo: persona.paciente.activo
        } : null
      }
    });
  } catch (error) {
    console.error('Error al verificar paciente:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

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

// Rutas de consultas médicas
app.use('/api/consultas-medicas', consultasMedicasRoutes);

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

// FIN

export { app, prisma };
