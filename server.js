import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaClient } from '@prisma/client';
import cron from 'node-cron';
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
// Crear el directorio si no existe
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    // Sanitizar nombre: quitar caracteres especiales (ñ, acentos, espacios, etc.)
    const name = path.basename(file.originalname, ext)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar acentos/tildes
      .replace(/[^a-zA-Z0-9_-]/g, '_');                // reemplazar caracteres especiales
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
    let { data: { user: supabaseUser }, error: authError } = await supabase.auth.getUser(token);

    // Si el token expiró, intentar renovarlo con el refresh_token
    if (authError || !supabaseUser) {
      const refreshToken = req.cookies.refresh_token;
      if (refreshToken) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
        if (!refreshError && refreshed?.session) {
          const cookieOpts = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 365 * 24 * 60 * 60 * 1000
          };
          res.cookie('access_token', refreshed.session.access_token, cookieOpts);
          res.cookie('refresh_token', refreshed.session.refresh_token, cookieOpts);
          supabaseUser = refreshed.session.user;
          console.log(`🔄 Token renovado automáticamente para: ${supabaseUser?.email}`);
        } else {
          // No se pudo renovar: decodificar el token localmente para mantener la sesión activa
          // La sesión solo se cierra cuando el usuario hace click en "Cerrar sesión"
          console.log(`⚠️  No se pudo renovar el token: ${refreshError?.message}. Usando sesión local.`);
          const decoded = jwt.decode(token);
          if (!decoded?.sub) {
            res.clearCookie('access_token');
            res.clearCookie('refresh_token');
            return res.redirect('/login');
          }
          supabaseUser = { id: decoded.sub, email: decoded.email };
        }
      } else {
        // Sin refresh_token: decodificar el token localmente para mantener la sesión activa
        console.log(`⚠️  Token inválido/expirado sin refresh_token. Usando sesión local.`);
        const decoded = jwt.decode(token);
        if (!decoded?.sub) {
          res.clearCookie('access_token');
          return res.redirect('/login');
        }
        supabaseUser = { id: decoded.sub, email: decoded.email };
      }
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
    // Si hay error de conexión con Supabase, intentar continuar con el token decodificado
    const token = req.cookies.access_token;
    if (token) {
      try {
        const decoded = jwt.decode(token);
        if (decoded?.sub) {
          const medico = await prisma.medico.findUnique({ where: { supabase_id: decoded.sub } });
          if (medico && medico.activo) {
            req.user = {
              id: medico.id.toString(),
              medicoId: medico.id.toString(),
              supabaseId: medico.supabase_id,
              email: medico.email,
              nombre: medico.nombre,
              apellido: medico.apellido,
              role: (medico.role || 'user').toLowerCase()
            };
            return next();
          }
        }
      } catch (fallbackError) {
        console.error('❌ Error en fallback auth:', fallbackError.message);
      }
    }
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
  res.render('secretaria/pages/dashboard-agenda', {
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
  return res.redirect('/doctor/turnos');
}

  // Fallback para otros roles o si no coincide
  res.render('secretaria/pages/dashboard-agenda', {
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
  res.render('doctor/pages/pacientes', {
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

    res.render('doctor/pages/agendar-turno', {
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
    res.render('doctor/pages/agendar-turno', {
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
  res.render('secretaria/pages/turnos-simple', {
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

// Notificaciones (solicitudes de turno por paciente)
app.get('/notificaciones', requireAuth, requireRole(['secretaria', 'doctor', 'admin']), (req, res) => {
  res.render('secretaria/pages/notificaciones', {
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
  res.render('doctor/pages/agendar-turno-nuevo', {
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

    res.render('doctor/pages/historias', {
      title: 'Historias Clínicas',
      historias: historiasFormato || [],
      error: null,
      user: req.user || {}
    });
  } catch (error) {
    console.error('Error al obtener historias:', error);
    res.render('doctor/pages/historias', {
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
    const { turno_id } = req.query;
    
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
            estudios: true
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
              estudios: true
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

    res.render('doctor/pages/historia-detalle', {
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
      is_new_consulta: false,
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

    // Si no hay paciente_id pero hay turno_id, buscar o crear paciente por turno
    let resolvedPacienteId = paciente_id;
    if (!resolvedPacienteId && turno_id) {
      const turno = await prisma.turno.findUnique({
        where: { id: BigInt(turno_id) },
        include: { persona: { include: { paciente: true } } }
      });
      if (turno?.persona) {
        if (turno.persona.paciente) {
          // Ya tiene registro de paciente
          resolvedPacienteId = turno.persona.paciente.id.toString();
        } else {
          // Crear registro de paciente vinculado a la persona existente
          const nuevoPaciente = await prisma.paciente.create({
            data: { persona_id: turno.persona.id }
          });
          resolvedPacienteId = nuevoPaciente.id.toString();
          console.log(`✅ Paciente creado automáticamente para persona ${turno.persona.id}`);
        }
      }
    }

    if (!resolvedPacienteId) {
      return res.status(400).send('<h2 style="font-family:sans-serif;padding:20px">Error: no se pudo determinar el paciente. Volvé al dashboard e intentá de nuevo.</h2>');
    }

    // Obtener datos del paciente
    const paciente = await prisma.paciente.findUnique({
      where: { id: BigInt(resolvedPacienteId) },
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
      return res.status(404).send('<h2 style="font-family:sans-serif;padding:20px">Paciente no encontrado.</h2>');
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

    console.log(`📂 Historia Nueva - Paciente: ${paciente.persona?.nombre}, Turno: ${turno_id}`);

    // Obtener HC existente para mostrar consultas anteriores
    let historia = await prisma.historiaClinica.findFirst({
      where: { paciente_id: BigInt(resolvedPacienteId) },
      orderBy: { fecha_apertura: 'desc' },
      include: {
        consultas: {
          include: {
            medico: { select: { nombre: true, apellido: true } },
            signos_vitales: true,
            diagnosticos: true,
            tratamientos: true,
            estudios: true
          },
          orderBy: { fecha: 'desc' }
        },
        medico_apertura: { select: { nombre: true, apellido: true } }
      }
    });

    const historiaSerializada = historia ? JSON.parse(JSON.stringify(serializeBigInt(historia))) : null;

    // Renderizar con HC existente pero flag de nueva consulta
    res.render('doctor/pages/historia-detalle', {
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
      historia: historiaSerializada,
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
            const imcCalc = Math.round((pesoNum / (tallaMt * tallaMt)) * 10) / 10;
            imc = imcCalc <= 999.99 ? imcCalc : null; // Limitar para no hacer overflow en DB
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

// Recuperar contraseña (página pública)
app.get('/forgot-password', (req, res) => {
  res.render('shared/forgot-password', { title: 'Recuperar Contraseña' });
});

// Restablecer contraseña (página pública - llega desde el email de Supabase)
app.get('/reset-password', (req, res) => {
  res.render('shared/reset-password', { title: 'Nueva Contraseña' });
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
  
  res.render('shared/login', {
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
  res.render('shared/admin-dashboard', {
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

    // 🔄 RESETEAR: Cambiar turnos EN_CONSULTA de días anteriores a PENDIENTE
    const estadoEnConsulta = await prisma.estadoTurno.findFirst({
      where: { nombre: 'EN_CONSULTA' }
    });
    const estadoPendiente = await prisma.estadoTurno.findFirst({
      where: { nombre: 'PENDIENTE' }
    });

    if (estadoEnConsulta && estadoPendiente) {
      const turnosAnterioresEnConsulta = await prisma.turno.findMany({
        where: {
          estado_id: estadoEnConsulta.id,
          fecha: { lt: hoy }
        }
      });

      if (turnosAnterioresEnConsulta.length > 0) {
        console.log(`⚠️ Reseteando ${turnosAnterioresEnConsulta.length} turnos EN_CONSULTA de días anteriores a PENDIENTE`);
        await prisma.turno.updateMany({
          where: {
            estado_id: estadoEnConsulta.id,
            fecha: { lt: hoy }
          },
          data: {
            estado_id: estadoPendiente.id
          }
        });
      }
    }

    // Obtener turnos de hoy + cualquier EN_CONSULTA abierto de días anteriores
    const turnos = await prisma.turno.findMany({
      where: {
        OR: [
          { fecha: { gte: hoy, lt: mañana } },
          { estado: { nombre: 'EN_CONSULTA' } }
        ]
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
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const mañana = new Date(hoy);
    mañana.setDate(mañana.getDate() + 1);

    // Obtener turnos de hoy con datos de persona y paciente
    const turnos = await prisma.turno.findMany({
      where: { fecha: { gte: hoy, lt: mañana } },
      include: {
        persona: {
          select: {
            nombre: true,
            apellido: true,
            fecha_nacimiento: true,
            telefono: true,
            paciente: {
              select: {
                obra_social: true,
                historias_clinicas: {
                  select: {
                    id: true,
                    consultas: {
                      select: {
                        id: true,
                        resumen: true,
                        diagnosticos: { select: { id: true }, take: 1 },
                        tratamientos: { select: { id: true }, take: 1 }
                      },
                      orderBy: { fecha: 'desc' },
                      take: 5
                    }
                  }
                }
              }
            }
          }
        },
        estado: { select: { nombre: true } }
      }
    });

    const alertas = [];

    // === SOLICITUDES DE TURNO (pendientes o notificadas) ===
    try {
      const medicoId = req.user.medicoId ? Number(req.user.medicoId) : null;
      const esSecretaria = req.user.role === 'secretaria' || req.user.role === 'admin';
      if (medicoId || esSecretaria) {
        const solicitudes = esSecretaria
          ? await prisma.$queryRaw`
              SELECT s.id, s.fecha_sugerida, s.motivo, s.observaciones, s.estado, s.fecha_notificacion,
                     p.nombre AS pnombre, p.apellido AS papellido, p.telefono AS ptel, p.email AS pemail
              FROM solicitudes_turno s
              JOIN pacientes pac ON pac.id = s.paciente_id
              JOIN personas p ON p.id = pac.persona_id
              WHERE s.estado IN ('Pendiente','Notificado')
              ORDER BY s.fecha_sugerida ASC
            `
          : await prisma.$queryRaw`
              SELECT s.id, s.fecha_sugerida, s.motivo, s.observaciones, s.estado, s.fecha_notificacion,
                     p.nombre AS pnombre, p.apellido AS papellido, p.telefono AS ptel, p.email AS pemail
              FROM solicitudes_turno s
              JOIN pacientes pac ON pac.id = s.paciente_id
              JOIN personas p ON p.id = pac.persona_id
              WHERE s.medico_id = ${medicoId}
                AND s.estado IN ('Pendiente','Notificado')
              ORDER BY s.fecha_sugerida ASC
            `;
        for (const sol of solicitudes) {
          const fechaStr = sol.fecha_sugerida ? new Date(sol.fecha_sugerida).toLocaleDateString('es-AR') : '-';
          const tel = (sol.ptel || '').replace(/\D/g, '');
          const msg = encodeURIComponent(`Hola ${sol.pnombre}! Le recordamos que el Dr. Carlos Alberto Lemes le ha sugerido una consulta para el ${fechaStr}. Motivo: ${sol.motivo || 'control médico'}. Por favor comuníquese con el consultorio. Consultorio L & L.`);
          alertas.push({
            prioridad: 'solicitud_turno',
            titulo: `Solicitud de turno: ${fechaStr}`,
            descripcion: sol.motivo || 'Control médico',
            paciente: `${sol.pnombre} ${sol.papellido}`,
            icono: 'bi-calendar-plus',
            solicitud_id: sol.id.toString(),
            estado: sol.estado,
            telefono: sol.ptel || '',
            email: sol.pemail || '',
            whatsapp_url: tel ? `https://wa.me/549${tel}?text=${msg}` : null
          });
        }
      }
    } catch(eSol) {
      console.warn('⚠️ Error cargando solicitudes en alertas:', eSol.message);
    }

    for (const turno of turnos) {
      const persona = turno.persona;
      if (!persona) continue;
      const nombre = `${persona.nombre} ${persona.apellido}`;
      const paciente = persona.paciente;

      // === INFORMATIVAS / IMPORTANTES ===
      if (!paciente || !paciente.historias_clinicas || paciente.historias_clinicas.length === 0) {
        alertas.push({
          prioridad: 'informativa',
          titulo: 'Primera consulta con este médico',
          descripcion: 'El paciente no tiene historia clínica previa en el sistema.',
          paciente: nombre,
          turno_hora: turno.hora,
          icono: 'bi-person-plus',
          color: '#0D6EFD'
        });
      } else {
        // Revisar si hay consultas sin diagnóstico ni tratamiento
        const tieneConsultaIncompleta = paciente.historias_clinicas.some(hc =>
          hc.consultas.some(c =>
            c.diagnosticos.length === 0 && c.tratamientos.length === 0 && !c.resumen
          )
        );
        if (tieneConsultaIncompleta) {
          alertas.push({
            prioridad: 'importante',
            titulo: 'HC sin completar de consulta anterior',
            descripcion: 'Una consulta previa no tiene diagnóstico, tratamiento ni resumen cargado.',
            paciente: nombre,
            turno_hora: turno.hora,
            icono: 'bi-exclamation-circle',
            color: '#FFC107'
          });
        }
      }
    }

    res.json({ success: true, alertas, count: alertas.length });
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

    const medicoId = req.user.role === 'secretaria' ? null : BigInt(req.user.medicoId);

    // Obtener todos los turnos del doctor (SIN filtro de fecha)
    // Si es secretaria, trae todos los turnos sin filtrar por médico
    const turnos = await prisma.turno.findMany({
      where: medicoId ? { medico_id: medicoId } : {},
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
        },
        consulta: {
          select: {
            id: true,
            motivo_consulta: true
          }
        }
      },
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }]
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
        hora: (turno.hora || '12:00').substring(0, 5),
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
        observaciones: turno.observaciones || '',
        motivo: turno.consulta?.motivo_consulta || '',
        duracion_minutos: turno.duracion_minutos || 30,
        tiene_consulta: !!turno.consulta
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

    // Auto-update solicitud de turno relacionada
    try {
      if (estado_nombre === 'CANCELADA') {
        await prisma.$executeRaw`
          UPDATE solicitudes_turno SET estado = 'Pendiente', turno_id = NULL
          WHERE turno_id = ${Number(turnoId)} AND estado = 'Turno asignado'
        `;
      }
    } catch(eInc) {
      console.warn('⚠️ Error actualizando incidencia por estado:', eInc.message);
    }

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
// VERIFICAR SI ESTE TURNO TIENE UNA CONSULTA REGISTRADA
// ============================================================================
app.get('/api/turnos/:turnoId/tiene-historia-clinica', requireAuth, async (req, res) => {
  try {
    const { turnoId } = req.params;

    // Verificar si existe una consulta médica asociada a este turno específico
    const consulta = await prisma.consultaMedica.findFirst({
      where: { turno_id: BigInt(turnoId) },
      select: { id: true }
    });

    if (consulta) {
      return res.status(200).json({ success: true, tiene_historia: true });
    } else {
      return res.status(200).json({ success: true, tiene_historia: false });
    }
  } catch (error) {
    console.error('❌ Error al verificar consulta del turno:', error);
    res.status(500).json({ success: false, error: 'Error interno', message: error.message });
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
// Cache en memoria para medicamentos
let _medicamentosCache = null;
app.get('/api/medicamentos', async (req, res) => {
  try {
    if (!_medicamentosCache) {
      const rows = await prisma.$queryRaw`SELECT nombre, categoria FROM medicamentos WHERE activo = true ORDER BY categoria, nombre`;
      _medicamentosCache = rows;
    }
    res.json(_medicamentosCache);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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
    // AUTO-UPDATE SOLICITUD DE TURNO si existe una activa para este paciente
    // ========================================
    try {
      let pacienteTmp = await prisma.paciente.findFirst({ where: { persona_id: persona.id } });
      if (pacienteTmp) {
        const solActivas = await prisma.$queryRaw`
          SELECT id, fecha_sugerida, dias_tolerancia FROM solicitudes_turno
          WHERE paciente_id = ${Number(pacienteTmp.id)}
            AND estado IN ('Pendiente','Notificado')
          ORDER BY fecha_sugerida ASC LIMIT 1
        `;
        if (solActivas.length > 0) {
          await prisma.$executeRaw`
            UPDATE solicitudes_turno SET estado = 'Turno asignado', turno_id = ${turno.id}
            WHERE id = ${Number(solActivas[0].id)}
          `;
          console.log(`📅 Solicitud ${solActivas[0].id} → Turno asignado`);
        }
      }
    } catch(eSol) {
      console.warn('⚠️ Error actualizando solicitud de turno:', eSol.message);
    }

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

    if (!nombre || !apellido || !dni) {
      return res.status(400).json({
        error: 'Faltan datos requeridos: nombre, apellido, dni'
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
        fecha_nacimiento: fecha_nacimiento ? new Date(fecha_nacimiento) : null,
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
// ENDPOINT: BUSCAR PERSONA POR DNI (para migración)
// ============================================================================
app.get('/api/personas/buscar-dni/:dni', requireAuth, requireRole(['doctor', 'admin', 'secretaria']), async (req, res) => {
  try {
    const dni = parseInt(req.params.dni);
    if (!dni) return res.status(400).json({ error: 'DNI inválido' });

    const persona = await prisma.persona.findUnique({
      where: { dni },
      include: {
        paciente: {
          select: { id: true, obra_social: true, numero_afiliado: true }
        }
      }
    });

    if (!persona) return res.json({ encontrado: false });

    res.json({
      encontrado: true,
      persona: {
        id: persona.id.toString(),
        nombre: persona.nombre,
        apellido: persona.apellido,
        dni: persona.dni,
        fecha_nacimiento: persona.fecha_nacimiento ? new Date(persona.fecha_nacimiento).toISOString().split('T')[0] : '',
        sexo: persona.sexo || '',
        telefono: persona.telefono || '',
        email: persona.email || '',
        tiene_paciente: !!persona.paciente,
        paciente_id: persona.paciente?.id?.toString() || null,
        obra_social: persona.paciente?.obra_social || '',
        numero_afiliado: persona.paciente?.numero_afiliado || ''
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// ENDPOINT: ALTA MANUAL DE PACIENTE EXISTENTE (migración)
// ============================================================================
app.post('/api/pacientes/migracion', requireAuth, requireRole(['doctor', 'admin', 'secretaria']), async (req, res) => {
  try {
    const { nombre, apellido, dni, fecha_nacimiento, sexo, telefono, email,
            obra_social, numero_afiliado, consultas } = req.body;

    if (!nombre || !apellido || !dni) {
      return res.status(400).json({ error: 'Nombre, apellido y DNI son obligatorios' });
    }

    // 1. Crear o encontrar Persona
    let persona = await prisma.persona.findUnique({ where: { dni: parseInt(dni) } });
    if (!persona) {
      persona = await prisma.persona.create({
        data: {
          nombre,
          apellido,
          dni: parseInt(dni),
          fecha_nacimiento: fecha_nacimiento ? new Date(fecha_nacimiento) : null,
          sexo: sexo || null,
          telefono: telefono || null,
          email: email || null
        }
      });
    } else {
      // Actualizar datos si ya existía
      persona = await prisma.persona.update({
        where: { id: persona.id },
        data: {
          nombre, apellido,
          ...(fecha_nacimiento && { fecha_nacimiento: new Date(fecha_nacimiento) }),
          ...(sexo && { sexo }),
          ...(telefono && { telefono }),
          ...(email && { email })
        }
      });
    }

    // 2. Crear o encontrar Paciente
    let paciente = await prisma.paciente.findUnique({ where: { persona_id: persona.id } });
    if (!paciente) {
      paciente = await prisma.paciente.create({
        data: {
          persona_id: persona.id,
          obra_social: obra_social || null,
          numero_afiliado: numero_afiliado || null,
          activo: true
        }
      });
    }

    // 3. Crear o encontrar Historia Clínica
    let historia = await prisma.historiaClinica.findFirst({
      where: { paciente_id: paciente.id, activa: true }
    });
    if (!historia) {
      historia = await prisma.historiaClinica.create({
        data: {
          paciente_id: paciente.id,
          creada_por_medico_id: BigInt(req.user.id),
          activa: true
        }
      });
    }

    // 4. Crear consultas previas (migración)
    if (consultas && consultas.length > 0) {
      for (const c of consultas) {
        if (!c.fecha || !c.motivo) continue;
        await prisma.consultaMedica.create({
          data: {
            historia_clinica_id: historia.id,
            medico_id: BigInt(req.user.id),
            turno_id: null,
            estado_id: BigInt(5),
            fecha: new Date(c.fecha),
            motivo_consulta: c.motivo,
            resumen: [
              c.diagnostico ? `Diagnóstico: ${c.diagnostico}` : '',
              c.medicacion ? `Medicación: ${c.medicacion}` : ''
            ].filter(Boolean).join(' | ') || null
          }
        });
      }
    }

    res.json({
      success: true,
      message: 'Paciente cargado exitosamente',
      paciente_id: paciente.id.toString(),
      historia_id: historia.id.toString()
    });
  } catch (error) {
    console.error('❌ Error en migración:', error);
    res.status(500).json({ error: 'Error al cargar paciente', message: error.message });
  }
});

// ============================================================================
// ENDPOINTS: INCIDENCIAS PRÓXIMA VISITA
// ============================================================================

// GET /api/incidencias — listar incidencias activas (todas para secretaria, propias para doctor)
app.get('/api/incidencias', requireAuth, async (req, res) => {
  try {
    const esSecretaria = req.user.role === 'secretaria' || req.user.role === 'admin';
    const medicoId = req.user.medicoId ? Number(req.user.medicoId) : null;
    if (!esSecretaria && !medicoId) return res.json({ success: true, data: [] });
    const rows = esSecretaria
      ? await prisma.$queryRaw`
          SELECT i.id, i.paciente_id, i.fecha_sugerida, i.motivo, i.observaciones,
                 i.prioridad, i.estado, i.turno_id, i.fecha_notificacion, i.dias_tolerancia,
                 p.nombre AS pnombre, p.apellido AS papellido, p.dni AS pdni,
                 p.telefono AS ptelefono, p.email AS pemail,
                 t.fecha AS turno_fecha, t.hora AS turno_hora
          FROM incidencias_proxima_visita i
          JOIN pacientes pac ON pac.id = i.paciente_id
          JOIN personas p ON p.id = pac.persona_id
          LEFT JOIN turnos t ON t.id = i.turno_id
          WHERE i.estado NOT IN ('Finalizada','Cancelada')
          ORDER BY i.fecha_sugerida ASC
        `
      : await prisma.$queryRaw`
          SELECT i.id, i.paciente_id, i.fecha_sugerida, i.motivo, i.observaciones,
                 i.prioridad, i.estado, i.turno_id, i.fecha_notificacion, i.dias_tolerancia,
                 p.nombre AS pnombre, p.apellido AS papellido, p.dni AS pdni,
                 p.telefono AS ptelefono, p.email AS pemail,
                 t.fecha AS turno_fecha, t.hora AS turno_hora
          FROM incidencias_proxima_visita i
          JOIN pacientes pac ON pac.id = i.paciente_id
          JOIN personas p ON p.id = pac.persona_id
          LEFT JOIN turnos t ON t.id = i.turno_id
          WHERE i.medico_id = ${medicoId}
            AND i.estado NOT IN ('Finalizada','Cancelada')
          ORDER BY i.fecha_sugerida ASC
        `;
    res.json({ success: true, data: rows.map(r => ({
      id: r.id.toString(),
      paciente_id: r.paciente_id.toString(),
      paciente: `${r.pnombre} ${r.papellido}`,
      paciente_dni: r.pdni?.toString() || '',
      paciente_telefono: r.ptelefono || '',
      paciente_email: r.pemail || '',
      fecha_sugerida: r.fecha_sugerida,
      motivo: r.motivo || '',
      observaciones: r.observaciones || '',
      prioridad: r.prioridad || 'Normal',
      estado: r.estado,
      turno_id: r.turno_id?.toString() || null,
      turno_fecha: r.turno_fecha || null,
      turno_hora: r.turno_hora || null,
      dias_tolerancia: Number(r.dias_tolerancia) || 7,
      fecha_notificacion: r.fecha_notificacion || null
    })) });
  } catch(e) {
    console.error('❌ GET /api/incidencias:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/incidencias — crear incidencia desde historia clínica
app.post('/api/incidencias', requireAuth, requireRole(['doctor', 'admin']), async (req, res) => {
  try {
    const { paciente_id, fecha_sugerida, motivo, observaciones, prioridad, dias_tolerancia } = req.body;
    if (!paciente_id || !fecha_sugerida) {
      return res.status(400).json({ error: 'paciente_id y fecha_sugerida son requeridos' });
    }
    const medicoId = req.user.medicoId ? Number(req.user.medicoId) : null;
    if (!medicoId) return res.status(403).json({ error: 'Solo médicos pueden crear incidencias' });
    const result = await prisma.$queryRaw`
      INSERT INTO incidencias_proxima_visita
        (paciente_id, medico_id, fecha_sugerida, motivo, observaciones, prioridad, estado, usuario_creacion, dias_tolerancia)
      VALUES
        (${BigInt(paciente_id)}, ${medicoId}, ${new Date(fecha_sugerida)},
         ${motivo || null}, ${observaciones || null}, ${prioridad || 'Normal'},
         'Pendiente', ${medicoId}, ${dias_tolerancia ? parseInt(dias_tolerancia) : 7})
      RETURNING id
    `;
    res.json({ success: true, id: result[0].id.toString() });
  } catch(e) {
    console.error('❌ POST /api/incidencias:', e);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/incidencias/:id/estado — cambiar estado
app.put('/api/incidencias/:id/estado', requireAuth, async (req, res) => {
  try {
    const { estado } = req.body;
    const estadosValidos = ['Pendiente','Notificada','Turno asignado','Reprogramada','Finalizada','Cancelada'];
    if (!estadosValidos.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
    await prisma.$executeRaw`
      UPDATE incidencias_proxima_visita SET estado = ${estado} WHERE id = ${BigInt(req.params.id)}
    `;
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/incidencias/:id — cancelar incidencia
app.delete('/api/incidencias/:id', requireAuth, async (req, res) => {
  try {
    await prisma.$executeRaw`
      UPDATE incidencias_proxima_visita SET estado = 'Cancelada' WHERE id = ${BigInt(req.params.id)}
    `;
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/incidencias/:id/notificar — enviar aviso (email o WhatsApp)
app.post('/api/incidencias/:id/notificar', requireAuth, async (req, res) => {
  try {
    const { canal, email, telefono } = req.body;
    const rows = await prisma.$queryRaw`
      SELECT i.*, p.nombre AS pnom, p.apellido AS pape, p.telefono AS ptel, p.email AS pem,
             mp.nombre AS mnom, mp.apellido AS mape
      FROM incidencias_proxima_visita i
      JOIN pacientes pac ON pac.id = i.paciente_id
      JOIN personas p ON p.id = pac.persona_id
      JOIN medicos m ON m.id = i.medico_id
      JOIN personas mp ON mp.id = m.persona_id
      WHERE i.id = ${BigInt(req.params.id)}
    `;
    if (!rows.length) return res.status(404).json({ error: 'Incidencia no encontrada' });
    const inc = rows[0];
    const fechaStr = inc.fecha_sugerida ? new Date(inc.fecha_sugerida).toLocaleDateString('es-AR') : '-';

    if (canal === 'email') {
      const emailDest = email || inc.pem;
      if (!emailDest) return res.status(400).json({ error: 'No hay email disponible' });
      await enviarEmailBrevo({
        to: emailDest,
        subject: `Recordatorio de próxima visita — Consultorio L&L`,
        html: `<h2>Estimado/a ${inc.pnom} ${inc.pape},</h2>
          <p>Le recordamos que el <strong>Dr. Carlos Alberto Lemes</strong> le ha sugerido una visita para el <strong>${fechaStr}</strong>.</p>
          <p><strong>Motivo:</strong> ${inc.motivo || 'Control médico'}</p>
          ${inc.observaciones ? `<p><strong>Observaciones:</strong> ${inc.observaciones}</p>` : ''}
          <p>Por favor comuníquese con el consultorio para confirmar su turno.</p>
          <p><em>Dr. Carlos Alberto Lemes — Consultorio L &amp; L</em></p>`
      });
    }

    await prisma.$executeRaw`
      UPDATE incidencias_proxima_visita
      SET estado = 'Notificada', fecha_notificacion = NOW()
      WHERE id = ${BigInt(req.params.id)}
    `;

    if (canal === 'whatsapp') {
      const tel = (telefono || inc.ptel || '').replace(/\D/g,'');
      const msg = encodeURIComponent(`Hola ${inc.pnom}! Le recordamos que el Dr. Carlos Alberto Lemes le ha sugerido una visita para el ${fechaStr}. Motivo: ${inc.motivo || 'control médico'}. Comuníquese al consultorio para confirmar su turno. Consultorio L & L.`);
      return res.json({ success: true, whatsapp_url: `https://wa.me/549${tel}?text=${msg}` });
    }
    res.json({ success: true });
  } catch(e) {
    console.error('❌ POST /api/incidencias/:id/notificar:', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// ALERTAS ADMINISTRATIVAS: pacientes con datos incompletos o sin HC
// ============================================================================
app.get('/api/alertas-administrativas', requireAuth, requireRole(['secretaria', 'admin', 'doctor']), async (req, res) => {
  try {
    // Pacientes con datos incompletos (telefono, email, fecha_nacimiento, dni, obra_social)
    const sinDatos = await prisma.$queryRaw`
      SELECT p.id AS persona_id, pac.id AS pac_id, p.nombre, p.apellido, p.dni,
             p.telefono, p.email, p.fecha_nacimiento, p.sexo,
             pac.obra_social, pac.numero_afiliado,
             CASE WHEN hc.id IS NOT NULL THEN true ELSE false END AS tiene_hc
      FROM personas p
      JOIN pacientes pac ON pac.persona_id = p.id
      LEFT JOIN historias_clinicas hc ON hc.paciente_id = pac.id AND hc.activa = true
      WHERE (p.telefono IS NULL OR p.telefono = '')
         OR (p.email IS NULL OR p.email = '')
         OR p.fecha_nacimiento IS NULL
         OR (p.dni IS NULL OR p.dni = 0)
         OR (pac.obra_social IS NULL OR pac.obra_social = '')
      ORDER BY p.apellido ASC
    `;

    // Pacientes sin historia clínica
    const sinHC = await prisma.$queryRaw`
      SELECT p.id AS persona_id, pac.id AS pac_id, p.nombre, p.apellido, p.dni, p.telefono, p.email
      FROM personas p
      JOIN pacientes pac ON pac.persona_id = p.id
      LEFT JOIN historias_clinicas hc ON hc.paciente_id = pac.id
      WHERE hc.id IS NULL
      ORDER BY p.apellido ASC
    `;

    const alertasDatos = sinDatos.map(p => {
      const faltantes = [];
      if (!p.telefono) faltantes.push('teléfono');
      if (!p.email) faltantes.push('email');
      if (!p.fecha_nacimiento) faltantes.push('fecha de nacimiento');
      if (!p.dni) faltantes.push('DNI');
      if (!p.obra_social) faltantes.push('obra social');
      return {
        tipo: 'datos_incompletos',
        paciente_id: p.pac_id.toString(),
        paciente: `${p.nombre} ${p.apellido}`,
        nombre: p.nombre,
        apellido: p.apellido,
        dni: p.dni?.toString() || '',
        telefono: p.telefono || '',
        email: p.email || '',
        fecha_nacimiento: p.fecha_nacimiento ? new Date(p.fecha_nacimiento).toISOString().split('T')[0] : '',
        sexo: p.sexo || '',
        obra_social: p.obra_social || '',
        numero_afiliado: p.numero_afiliado || '',
        tiene_hc: p.tiene_hc === true || p.tiene_hc === 't',
        faltantes
      };
    });

    const alertasHC = sinHC.map(p => ({
      tipo: 'sin_hc',
      paciente_id: p.pac_id.toString(),
      paciente: `${p.nombre} ${p.apellido}`,
      dni: p.dni?.toString() || '',
      telefono: p.telefono || '',
      email: p.email || ''
    }));

    res.json({ success: true, datos_incompletos: alertasDatos, sin_hc: alertasHC });
  } catch(e) {
    console.error('❌ GET /api/alertas-administrativas:', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// ENDPOINTS: SOLICITUDES DE TURNO
// ============================================================================

// GET /api/solicitudes-turno/count — cantidad de solicitudes pendientes (para badge)
app.get('/api/solicitudes-turno/count', requireAuth, async (req, res) => {
  try {
    const esSecretaria = req.user.role === 'secretaria' || req.user.role === 'admin';
    const medicoId = req.user.medicoId ? Number(req.user.medicoId) : null;
    const result = esSecretaria
      ? await prisma.$queryRaw`SELECT COUNT(*) AS total FROM solicitudes_turno WHERE estado IN ('Pendiente','Notificado')`
      : medicoId
        ? await prisma.$queryRaw`SELECT COUNT(*) AS total FROM solicitudes_turno WHERE medico_id = ${medicoId} AND estado IN ('Pendiente','Notificado')`
        : [{ total: 0 }];
    res.json({ success: true, count: Number(result[0]?.total || 0) });
  } catch(e) {
    res.json({ success: true, count: 0 });
  }
});

// ============================================================
// GET /api/notificaciones-escritorio
// Devuelve solicitudes e incidencias pendientes que no recibieron
// aviso en las últimas 12 horas (= máx 2 veces por día)
// ============================================================
app.get('/api/notificaciones-escritorio', requireAuth, async (req, res) => {
  try {
    const esSecretaria = ['secretaria', 'admin'].includes(req.user.role);
    const medicoId = req.user.medicoId ? Number(req.user.medicoId) : null;
    // ?forzar=1 ignora el filtro de 12hs (usado por el botón "Probar ahora")
    const forzar = req.query.forzar === '1';

    let solicitudes = [];
    let incidencias = [];

    if (esSecretaria) {
      solicitudes = await prisma.$queryRaw`
        SELECT s.id, 'solicitud' AS tipo, s.fecha_sugerida, s.motivo, s.estado,
               p.nombre || ' ' || p.apellido AS paciente_nombre
        FROM solicitudes_turno s
        JOIN pacientes pac ON pac.id = s.paciente_id
        JOIN personas p ON p.id = pac.persona_id
        WHERE s.estado IN ('Pendiente','Notificado')
          AND (${forzar} OR s.ultimo_aviso IS NULL OR s.ultimo_aviso < NOW() - INTERVAL '12 hours')
        ORDER BY s.fecha_sugerida ASC
      `;
      incidencias = await prisma.$queryRaw`
        SELECT i.id, 'incidencia' AS tipo, i.fecha_sugerida, i.motivo, i.estado,
               p.nombre || ' ' || p.apellido AS paciente_nombre
        FROM incidencias_proxima_visita i
        JOIN pacientes pac ON pac.id = i.paciente_id
        JOIN personas p ON p.id = pac.persona_id
        WHERE i.estado = 'Pendiente'
          AND (${forzar} OR i.ultimo_aviso IS NULL OR i.ultimo_aviso < NOW() - INTERVAL '12 hours')
        ORDER BY i.fecha_sugerida ASC
      `;
    } else if (medicoId) {
      solicitudes = await prisma.$queryRaw`
        SELECT s.id, 'solicitud' AS tipo, s.fecha_sugerida, s.motivo, s.estado,
               p.nombre || ' ' || p.apellido AS paciente_nombre
        FROM solicitudes_turno s
        JOIN pacientes pac ON pac.id = s.paciente_id
        JOIN personas p ON p.id = pac.persona_id
        WHERE s.estado IN ('Pendiente','Notificado')
          AND s.medico_id = ${medicoId}
          AND (${forzar} OR s.ultimo_aviso IS NULL OR s.ultimo_aviso < NOW() - INTERVAL '12 hours')
        ORDER BY s.fecha_sugerida ASC
      `;
      incidencias = await prisma.$queryRaw`
        SELECT i.id, 'incidencia' AS tipo, i.fecha_sugerida, i.motivo, i.estado,
               p.nombre || ' ' || p.apellido AS paciente_nombre
        FROM incidencias_proxima_visita i
        JOIN pacientes pac ON pac.id = i.paciente_id
        JOIN personas p ON p.id = pac.persona_id
        WHERE i.estado = 'Pendiente'
          AND i.medico_id = ${medicoId}
          AND (${forzar} OR i.ultimo_aviso IS NULL OR i.ultimo_aviso < NOW() - INTERVAL '12 hours')
        ORDER BY i.fecha_sugerida ASC
      `;
    }

    res.json({ items: [...solicitudes, ...incidencias] });
  } catch (e) {
    console.error('❌ notificaciones-escritorio GET:', e.message);
    res.json({ items: [] });
  }
});

// POST /api/notificaciones-escritorio/:tipo/:id/aviso
// El frontend llama esto después de mostrar la notificación de escritorio
// para actualizar ultimo_aviso y evitar repetición antes de 12 horas
app.post('/api/notificaciones-escritorio/:tipo/:id/aviso', requireAuth, async (req, res) => {
  try {
    const numId = Number(req.params.id);
    if (req.params.tipo === 'solicitud') {
      await prisma.$executeRaw`UPDATE solicitudes_turno SET ultimo_aviso = NOW() WHERE id = ${numId}`;
    } else {
      await prisma.$executeRaw`UPDATE incidencias_proxima_visita SET ultimo_aviso = NOW() WHERE id = ${numId}`;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('❌ notificaciones-escritorio POST:', e.message);
    res.json({ ok: false });
  }
});

// GET /api/solicitudes-turno — listar (activas por defecto; ?todos=1 para ver todas)
app.get('/api/solicitudes-turno', requireAuth, async (req, res) => {
  try {
    const esSecretaria = req.user.role === 'secretaria' || req.user.role === 'admin';
    const medicoId = req.user.medicoId ? Number(req.user.medicoId) : null;
    const verTodas = req.query.todos === '1';
    if (!esSecretaria && !medicoId) return res.json({ success: true, data: [] });
    const rows = esSecretaria
      ? verTodas
        ? await prisma.$queryRaw`
            SELECT s.id, s.paciente_id, s.fecha_sugerida, s.motivo, s.observaciones,
                   s.estado, s.turno_id, s.fecha_notificacion, s.dias_tolerancia,
                   p.nombre AS pnombre, p.apellido AS papellido, p.dni AS pdni,
                   p.telefono AS ptelefono, p.email AS pemail
            FROM solicitudes_turno s
            JOIN pacientes pac ON pac.id = s.paciente_id
            JOIN personas p ON p.id = pac.persona_id
            ORDER BY s.fecha_sugerida ASC
          `
        : await prisma.$queryRaw`
            SELECT s.id, s.paciente_id, s.fecha_sugerida, s.motivo, s.observaciones,
                   s.estado, s.turno_id, s.fecha_notificacion, s.dias_tolerancia,
                   p.nombre AS pnombre, p.apellido AS papellido, p.dni AS pdni,
                   p.telefono AS ptelefono, p.email AS pemail
            FROM solicitudes_turno s
            JOIN pacientes pac ON pac.id = s.paciente_id
            JOIN personas p ON p.id = pac.persona_id
            WHERE s.estado NOT IN ('Turno asignado','Vencida','Cancelada','Cerrada')
            ORDER BY s.fecha_sugerida ASC
          `
      : verTodas
        ? await prisma.$queryRaw`
            SELECT s.id, s.paciente_id, s.fecha_sugerida, s.motivo, s.observaciones,
                   s.estado, s.turno_id, s.fecha_notificacion, s.dias_tolerancia,
                   p.nombre AS pnombre, p.apellido AS papellido, p.dni AS pdni,
                   p.telefono AS ptelefono, p.email AS pemail
            FROM solicitudes_turno s
            JOIN pacientes pac ON pac.id = s.paciente_id
            JOIN personas p ON p.id = pac.persona_id
            WHERE s.medico_id = ${medicoId}
            ORDER BY s.fecha_sugerida ASC
          `
        : await prisma.$queryRaw`
            SELECT s.id, s.paciente_id, s.fecha_sugerida, s.motivo, s.observaciones,
                   s.estado, s.turno_id, s.fecha_notificacion, s.dias_tolerancia,
                   p.nombre AS pnombre, p.apellido AS papellido, p.dni AS pdni,
                   p.telefono AS ptelefono, p.email AS pemail
            FROM solicitudes_turno s
            JOIN pacientes pac ON pac.id = s.paciente_id
            JOIN personas p ON p.id = pac.persona_id
            WHERE s.medico_id = ${medicoId}
              AND s.estado NOT IN ('Turno asignado','Vencida','Cancelada','Cerrada')
            ORDER BY s.fecha_sugerida ASC
          `;
    res.json({ success: true, data: rows.map(r => ({
      id: r.id.toString(),
      paciente_id: r.paciente_id.toString(),
      paciente: `${r.pnombre} ${r.papellido}`,
      paciente_nombre: r.pnombre || '',
      paciente_apellido: r.papellido || '',
      paciente_dni: r.pdni?.toString() || '',
      paciente_telefono: r.ptelefono || '',
      paciente_email: r.pemail || '',
      fecha_sugerida: r.fecha_sugerida,
      motivo: r.motivo || '',
      observaciones: r.observaciones || '',
      estado: r.estado,
      turno_id: r.turno_id?.toString() || null,
      dias_tolerancia: Number(r.dias_tolerancia) || 7,
      fecha_notificacion: r.fecha_notificacion || null
    })) });
  } catch(e) {
    console.error('❌ GET /api/solicitudes-turno:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/solicitudes-turno — crear desde historia clínica
app.post('/api/solicitudes-turno', requireAuth, requireRole(['doctor', 'admin']), async (req, res) => {
  try {
    const { paciente_id, fecha_sugerida, motivo, observaciones, dias_tolerancia } = req.body;
    if (!paciente_id || !fecha_sugerida) return res.status(400).json({ error: 'paciente_id y fecha_sugerida son requeridos' });
    const medicoId = req.user.medicoId ? Number(req.user.medicoId) : null;
    if (!medicoId) return res.status(403).json({ error: 'Solo médicos pueden crear solicitudes' });
    const result = await prisma.$queryRaw`
      INSERT INTO solicitudes_turno (paciente_id, medico_id, fecha_sugerida, motivo, observaciones, estado, usuario_creacion, dias_tolerancia)
      VALUES (${Number(paciente_id)}, ${medicoId}, ${new Date(fecha_sugerida)}, ${motivo || null}, ${observaciones || null}, 'Pendiente', ${medicoId}, ${dias_tolerancia ? parseInt(dias_tolerancia) : 7})
      RETURNING id
    `;
    res.json({ success: true, id: result[0].id.toString() });
  } catch(e) {
    console.error('❌ POST /api/solicitudes-turno:', e);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/solicitudes-turno/:id/estado — cambiar estado
app.put('/api/solicitudes-turno/:id/estado', requireAuth, async (req, res) => {
  try {
    const { estado } = req.body;
    const estadosValidos = ['Pendiente','Notificado','Turno asignado','Vencida','Cancelada','Cerrada'];
    if (!estadosValidos.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
    if (estado === 'Cerrada') {
      await prisma.$executeRaw`UPDATE solicitudes_turno SET estado = ${estado}, fecha_cierre = NOW() WHERE id = ${Number(req.params.id)}`;
    } else {
      await prisma.$executeRaw`UPDATE solicitudes_turno SET estado = ${estado} WHERE id = ${Number(req.params.id)}`;
    }
    res.json({ success: true });
  } catch(e) {
    console.error('❌ PUT /api/solicitudes-turno/:id/estado:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/solicitudes-turno/:id/notificar — enviar email o WhatsApp
app.post('/api/solicitudes-turno/:id/notificar', requireAuth, async (req, res) => {
  try {
    const { canal, email, telefono } = req.body;
    const [sol] = await prisma.$queryRaw`
      SELECT s.*, p.nombre AS pnom, p.apellido AS pape, p.telefono AS ptel, p.email AS pem
      FROM solicitudes_turno s
      JOIN pacientes pac ON pac.id = s.paciente_id
      JOIN personas p ON p.id = pac.persona_id
      WHERE s.id = ${Number(req.params.id)}
    `;
    if (!sol) return res.status(404).json({ error: 'Solicitud no encontrada' });
    const fechaStr = sol.fecha_sugerida ? new Date(sol.fecha_sugerida).toLocaleDateString('es-AR') : '-';
    const nombrePaciente = `${sol.pnom} ${sol.pape}`;
    if (canal === 'whatsapp') {
      const tel = (telefono || sol.ptel || '').replace(/\D/g, '');
      if (!tel) return res.status(400).json({ error: 'Sin teléfono' });
      const msg = encodeURIComponent(`Hola ${sol.pnom}! Le recordamos que el Dr. Carlos Alberto Lemes le ha sugerido una consulta para el ${fechaStr}. Motivo: ${sol.motivo || 'control médico'}. Por favor comuníquese con el consultorio para reservar su turno. Consultorio L & L.`);
      await prisma.$executeRaw`UPDATE solicitudes_turno SET estado = 'Notificado', fecha_notificacion = NOW() WHERE id = ${Number(req.params.id)}`;
      return res.json({ success: true, url: `https://wa.me/549${tel}?text=${msg}` });
    } else {
      const emailDest = email || sol.pem;
      if (!emailDest) return res.status(400).json({ error: 'Sin email' });
      await enviarEmailBrevo({
        to: emailDest,
        subject: `Recordatorio de consulta médica — Consultorio L&L`,
        html: `<p>Estimado/a <strong>${nombrePaciente}</strong>,</p>
               <p>Le recordamos que el <strong>Dr. Carlos Alberto Lemes</strong> le ha sugerido una consulta.</p>
               <ul>
                 <li><strong>Fecha sugerida:</strong> ${fechaStr}</li>
                 <li><strong>Motivo:</strong> ${sol.motivo || 'Control médico'}</li>
                 ${sol.observaciones ? `<li><strong>Observaciones:</strong> ${sol.observaciones}</li>` : ''}
               </ul>
               <p>Por favor comuníquese con el consultorio para reservar su turno.</p>
               <p><em>Dr. Carlos Alberto Lemes — Consultorio L & L</em></p>`
      });
      await prisma.$executeRaw`UPDATE solicitudes_turno SET estado = 'Notificado', fecha_notificacion = NOW() WHERE id = ${Number(req.params.id)}`;
      return res.json({ success: true });
    }
  } catch(e) {
    console.error('❌ POST /api/solicitudes-turno/:id/notificar:', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// ENDPOINT: EDITAR DATOS DEL PACIENTE
// ============================================================================
app.put('/api/pacientes/:id', requireAuth, requireRole(['doctor', 'admin', 'secretaria']), async (req, res) => {
  try {
    const pacienteId = BigInt(req.params.id);
    const { nombre, apellido, email, telefono, fecha_nacimiento, sexo, obra_social, numero_afiliado } = req.body;

    // Obtener persona_id del paciente
    const paciente = await prisma.paciente.findUnique({
      where: { id: pacienteId },
      select: { persona_id: true }
    });

    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });

    // Actualizar Persona (campos no-clave)
    await prisma.persona.update({
      where: { id: paciente.persona_id },
      data: {
        ...(nombre    && { nombre }),
        ...(apellido  && { apellido }),
        ...(email     !== undefined && { email: email || null }),
        ...(telefono  !== undefined && { telefono: telefono || null }),
        ...(fecha_nacimiento !== undefined && { fecha_nacimiento: fecha_nacimiento ? new Date(fecha_nacimiento) : null }),
        ...(sexo      !== undefined && { sexo: sexo || null })
      }
    });

    // Actualizar Paciente
    await prisma.paciente.update({
      where: { id: pacienteId },
      data: {
        ...(obra_social      !== undefined && { obra_social: obra_social || null }),
        ...(numero_afiliado  !== undefined && { numero_afiliado: numero_afiliado || null })
      }
    });

    res.json({ success: true, message: 'Paciente actualizado correctamente' });
  } catch (error) {
    console.error('❌ Error al actualizar paciente:', error);
    res.status(500).json({ error: 'Error al actualizar paciente', message: error.message });
  }
});

// ============================================================================
// ELIMINAR PACIENTE (solo si no tiene HC o no tiene consultas)
// ============================================================================
app.delete('/api/pacientes/:id', requireAuth, requireRole(['doctor', 'admin', 'secretaria']), async (req, res) => {
  try {
    const pacienteId = BigInt(req.params.id);

    // Verificar que no tenga consultas
    const paciente = await prisma.paciente.findUnique({
      where: { id: pacienteId },
      include: {
        historias_clinicas: {
          include: { _count: { select: { consultas: true } } }
        }
      }
    });

    if (!paciente) return res.status(404).json({ success: false, message: 'Paciente no encontrado' });

    const tieneConsultas = paciente.historias_clinicas.some(h => h._count.consultas > 0);
    if (tieneConsultas) {
      return res.status(400).json({ success: false, message: 'No se puede eliminar: el paciente tiene consultas registradas' });
    }

    // Eliminar paciente (cascade elimina HC y docs si los hay)
    await prisma.paciente.delete({ where: { id: pacienteId } });

    console.log(`🗑️ Paciente ${pacienteId} eliminado`);
    res.json({ success: true, message: 'Paciente eliminado correctamente' });
  } catch (e) {
    console.error('❌ Error eliminando paciente:', e.message);
    res.status(500).json({ success: false, message: e.message });
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
      where: { id: BigInt(paciente_id) }
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
            historias_clinicas: {
              select: {
                id: true,
                activa: true
              },
              take: 1,
              orderBy: { fecha_apertura: 'desc' }
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
      tiene_historia_clinica: p.paciente?.historias_clinicas?.length > 0,
      historia_clinica_activa: p.paciente?.historias_clinicas?.[0]?.activa || false,
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
app.get('/doctor/dashboard', requireAuth, requireRole(['doctor', 'admin']), (req, res) => {
  res.render('doctor/pages/dashboard-doctor', {
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
app.get('/doctor/agendar-turno', requireAuth, requireRole(['doctor', 'secretaria', 'admin']), async (req, res) => {
  // Si es secretaria o admin, buscar el primer médico activo disponible
  let medico_id = req.user.medicoId;
  if (req.user.role === 'secretaria' || req.user.role === 'admin') {
    const doctor = await prisma.medico.findFirst({
      where: { role: 'doctor', activo: true },
      select: { id: true },
      orderBy: { id: 'asc' }
    });
    medico_id = doctor ? doctor.id.toString() : medico_id;
  }
  res.render('doctor/pages/agendar-turno-nueva', {
    title: 'Agendar Turno',
    token: req.cookies.access_token,
    user: {
      nombre: req.user.nombre,
      apellido: req.user.apellido,
      rol: req.user.role,
      medico_id: medico_id
    }
  });
});

// Pacientes del Doctor
app.get('/doctor/pacientes', requireAuth, requireRole(['doctor', 'admin', 'secretaria']), async (req, res) => {
  try {
    // Obtener pacientes activos (con o sin HC)
    const pacientes = await prisma.paciente.findMany({
      where: { activo: true },
      include: {
        persona: true,
        historias_clinicas: {
          select: {
            id: true,
            activa: true,
            fecha_apertura: true,
            consultas: {
              select: { fecha: true },
              orderBy: { fecha: 'desc' },
              take: 1
            },
            _count: { select: { consultas: true } }
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

        // Calcular estado: Activo si tuvo consulta en el último año, Inactivo si no
        const ultimaConsulta = p.historias_clinicas?.[0]?.consultas?.[0]?.fecha;
        const unAnoAtras = new Date();
        unAnoAtras.setFullYear(unAnoAtras.getFullYear() - 1);
        const estado = ultimaConsulta && new Date(ultimaConsulta) > unAnoAtras ? 'Activo' : 'Inactivo';

        return {
          id: p.id.toString(),
          persona_id: p.persona.id.toString(),
          dni: p.persona.dni || '-',
          nombre: `${p.persona.nombre} ${p.persona.apellido}`,
          nombre_solo: p.persona.nombre || '',
          apellido: p.persona.apellido || '',
          telefono: p.persona.telefono || '',
          email: p.persona.email || '',
          fecha_nacimiento: p.persona.fecha_nacimiento ? new Date(p.persona.fecha_nacimiento).toISOString().split('T')[0] : '',
          sexo: p.persona.sexo || '',
          edad: edad,
          obra_social: p.obra_social || '',
          numero_afiliado: p.numero_afiliado || '',
          estado: estado,
          ultima_consulta: ultimaConsulta ? new Date(ultimaConsulta).toISOString().split('T')[0] : '',
          tiene_historia: p.historias_clinicas && p.historias_clinicas.length > 0,
          historia_activa: p.historias_clinicas && p.historias_clinicas.length > 0 ? p.historias_clinicas[0].activa : false,
          historia_id: p.historias_clinicas && p.historias_clinicas.length > 0 ? p.historias_clinicas[0].id.toString() : null,
          tiene_consultas: p.historias_clinicas?.[0]?._count?.consultas > 0,
          puede_eliminar: !p.historias_clinicas?.length || p.historias_clinicas[0]._count?.consultas === 0
        };
      });

    console.log(`✅ ${pacientesList.length} pacientes con Historia Clínica cargados`);

    const stats = {
      total: pacientesList.length,
      activos: pacientesList.filter(p => p.estado === 'Activo').length,
      inactivos: pacientesList.filter(p => p.estado === 'Inactivo').length,
      sin_obra_social: pacientesList.filter(p => !p.obra_social || p.obra_social === '-').length
    };

    res.render('doctor/pages/pacientes', {
      title: 'Mis Pacientes',
      pacientes: pacientesList,
      stats,
      user: {
        nombre: req.user.nombre,
        apellido: req.user.apellido,
        rol: req.user.role,
        email: req.user.email
      }
    });
  } catch (error) {
    console.error('Error al obtener pacientes:', error);
    res.render('doctor/pages/pacientes', {
      title: 'Mis Pacientes',
      pacientes: [],
      stats: { total: 0, activos: 0, inactivos: 0, sin_obra_social: 0 },
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
app.get('/doctor/pacientes/:paciente_id', requireAuth, requireRole(['doctor', 'admin']), async (req, res) => {
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
    
    // Si no existe historia, la página carga con formulario vacío.
    // La historia se creará cuando el doctor guarde explícitamente.
    
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
          otros_tratamientos: c.otros_tratamientos || '',
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
            frecuencia: t.frecuencia || '',
            duracion_dias: t.duracion_dias || null,
            indicaciones: t.indicaciones || '',
            fecha_inicio: t.fecha_inicio ? new Date(t.fecha_inicio).toISOString().split('T')[0] : null,
            fecha_fin: t.fecha_fin ? new Date(t.fecha_fin).toISOString().split('T')[0] : null
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

    res.render('doctor/pages/historia-detalle', datos);
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
// GET DOCUMENTOS DE UNA HISTORIA CLÍNICA
// ============================================================================
app.get('/api/historia/:historiaId/documentos', requireAuth, async (req, res) => {
  try {
    const historiaId = BigInt(req.params.historiaId);
    const documentos = await prisma.documentoAdjunto.findMany({
      where: { historia_clinica_id: historiaId, eliminado: false },
      select: { id: true, nombre_archivo: true, url_storage: true, tipo_mime: true, fecha_subida: true },
      orderBy: { fecha_subida: 'desc' }
    });
    res.json({ success: true, documentos: documentos.map(d => ({
      id: d.id.toString(),
      nombre: d.nombre_archivo,
      url: d.url_storage,
      tipo: d.tipo_mime,
      fecha: d.fecha_subida ? new Date(d.fecha_subida).toLocaleDateString('es-AR') : ''
    }))});
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

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
// TRATAMIENTOS - CREAR
// ============================================================================
app.post('/api/tratamientos', requireAuth, async (req, res) => {
  try {
    const { consulta_id, medicamento, dosis, frecuencia, fecha_inicio, duracion_dias, indicaciones } = req.body;

    if (!consulta_id || !medicamento || !dosis || !frecuencia || !fecha_inicio) {
      return res.status(400).json({ success: false, message: 'Faltan campos requeridos' });
    }

    const tratamiento = await prisma.tratamiento.create({
      data: {
        consulta_id: BigInt(consulta_id),
        medicamento: medicamento.trim(),
        dosis: dosis.trim(),
        frecuencia: frecuencia.trim(),
        fecha_inicio: new Date(fecha_inicio),
        fecha_fin: duracion_dias
          ? new Date(new Date(fecha_inicio).getTime() + duracion_dias * 86400000)
          : null,
        duracion_dias: duracion_dias ? parseInt(duracion_dias) : null,
        indicaciones: indicaciones || null
      }
    });

    console.log(`✅ Tratamiento creado: ${medicamento} para consulta ${consulta_id}`);
    res.json({
      success: true,
      data: {
        id: tratamiento.id.toString(),
        medicamento: tratamiento.medicamento,
        dosis: tratamiento.dosis,
        frecuencia: tratamiento.frecuencia,
        duracion_dias: tratamiento.duracion_dias,
        indicaciones: tratamiento.indicaciones
      }
    });
  } catch (error) {
    console.error('❌ Error creando tratamiento:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================================
// TRATAMIENTOS - ELIMINAR
// ============================================================================
app.delete('/api/tratamientos/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.tratamiento.delete({ where: { id: BigInt(id) } });
    console.log(`✅ Tratamiento ${id} eliminado`);
    res.json({ success: true, message: 'Tratamiento eliminado' });
  } catch (error) {
    console.error('❌ Error eliminando tratamiento:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================================
// MANEJO DE ERRORES
// ============================================================================

// ============================================================================
// HELPER: ENVIAR EMAIL VÍA BREVO API (HTTP, funciona en Railway)
// ============================================================================
async function enviarEmailBrevo({ to, subject, html, attachments = [] }) {
  const apiKey = process.env.BREVO_API_KEY;
  const gmailUser = process.env.GMAIL_USER || 'lemesconsultorios@gmail.com';

  if (!apiKey) throw new Error('BREVO_API_KEY no configurado en variables de entorno');

  const body = {
    sender: { name: 'Clínica LEMES', email: gmailUser },
    to: [{ email: to }],
    subject,
    htmlContent: html
  };

  if (attachments.length > 0) {
    body.attachment = attachments.map(a => ({
      name: a.filename,
      content: Buffer.from(a.content).toString('base64')
    }));
  }

  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Brevo API error ${resp.status}: ${err}`);
  }
  return await resp.json();
}

// ============================================================================
// ENDPOINTS: DISPONIBILIDAD - BLOQUEAR / DESBLOQUEAR DÍAS Y HORARIOS
// ============================================================================

// GET /api/disponibilidad/bloqueados?medico_id=X&mes=YYYY-MM
app.get('/api/disponibilidad/bloqueados', requireAuth, async (req, res) => {
  try {
    const medicoId = req.user.medicoId ? BigInt(req.user.medicoId) : null;
    if (!medicoId) return res.json({ success: true, bloqueados: [] });
    const rows = await prisma.$queryRaw`
      SELECT id::text, medico_id::text, fecha::text, hora, motivo
      FROM dias_bloqueados
      WHERE medico_id = ${medicoId}
      ORDER BY fecha, hora
    `;
    res.json({ success: true, bloqueados: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/disponibilidad/turnos-del-dia?fecha=YYYY-MM-DD
app.get('/api/disponibilidad/turnos-del-dia', requireAuth, async (req, res) => {
  try {
    const { fecha } = req.query;
    if (!fecha) return res.status(400).json({ success: false, message: 'fecha requerida' });
    const medicoId = req.user.medicoId ? BigInt(req.user.medicoId) : null;
    const where = {
      fecha: new Date(fecha),
      estado: { nombre: { in: ['PENDIENTE', 'EN_CONSULTA'] } }
    };
    if (medicoId) where.medico_id = medicoId;
    const turnos = await prisma.turno.findMany({
      where,
      select: { hora: true, duracion_minutos: true },
      orderBy: { hora: 'asc' }
    });
    // Bloqueados del día
    const bloqueados = medicoId ? await prisma.$queryRaw`
      SELECT hora FROM dias_bloqueados
      WHERE medico_id = ${medicoId}
        AND (fecha = ${fecha}::date OR fecha IS NULL)
        AND hora IS NOT NULL
    ` : [];
    // Normalizar hora a HH:MM (puede venir como "17:00:00" desde la BD)
    const turnosNorm = turnos.map(t => ({
      hora: (t.hora || '').substring(0, 5),
      duracion_minutos: t.duracion_minutos || 30
    }));
    // Expandir horas ocupadas por duración (cada slot es 30 min)
    const ALL_SLOTS_MAÑANA = ['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00'];
    const ALL_SLOTS_TARDE  = ['17:00','17:30','18:00','18:30','19:00','19:30','20:00'];
    const ALL_SLOTS = [...ALL_SLOTS_MAÑANA, ...ALL_SLOTS_TARDE];
    function horaAMin(h) { const [hh,mm] = h.split(':').map(Number); return hh*60+mm; }
    const horasOcupadasSet = new Set();
    turnosNorm.forEach(({hora, duracion_minutos}) => {
      const ini = horaAMin(hora);
      const fin = ini + (duracion_minutos || 30);
      ALL_SLOTS.forEach(s => { const sm = horaAMin(s); if (sm >= ini && sm < fin) horasOcupadasSet.add(s); });
    });
    res.json({
      success: true,
      horasOcupadas: [...horasOcupadasSet],
      turnosConDuracion: turnosNorm,
      horasBloqueadas: bloqueados.map(b => (b.hora || '').substring(0, 5)),
      diaBloqueado: medicoId ? (await prisma.$queryRaw`
        SELECT id FROM dias_bloqueados
        WHERE medico_id = ${medicoId} AND fecha = ${fecha}::date AND hora IS NULL
        LIMIT 1
      `).length > 0 : false
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/disponibilidad/bloquear  { fecha?, hora?, motivo? }
app.post('/api/disponibilidad/bloquear', requireAuth, requireRole(['doctor', 'secretaria', 'admin']), async (req, res) => {
  try {
    const medicoId = req.user.medicoId ? BigInt(req.user.medicoId) : null;
    if (!medicoId) return res.status(400).json({ success: false, message: 'Sin médico asociado' });
    const { fecha, hora, motivo } = req.body;
    await prisma.$executeRaw`
      INSERT INTO dias_bloqueados (medico_id, fecha, hora, motivo)
      VALUES (${medicoId}, ${fecha ? fecha : null}::date, ${hora || null}, ${motivo || null})
    `;
    res.json({ success: true, message: 'Bloqueado correctamente' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE /api/disponibilidad/desbloquear  { fecha?, hora? }
app.delete('/api/disponibilidad/desbloquear', requireAuth, requireRole(['doctor', 'secretaria', 'admin']), async (req, res) => {
  try {
    const medicoId = req.user.medicoId ? BigInt(req.user.medicoId) : null;
    if (!medicoId) return res.status(400).json({ success: false, message: 'Sin médico asociado' });
    const { fecha, hora } = req.body;
    if (hora) {
      await prisma.$executeRaw`
        DELETE FROM dias_bloqueados WHERE medico_id = ${medicoId} AND fecha = ${fecha}::date AND hora = ${hora}
      `;
    } else {
      await prisma.$executeRaw`
        DELETE FROM dias_bloqueados WHERE medico_id = ${medicoId} AND fecha = ${fecha}::date AND hora IS NULL
      `;
    }
    res.json({ success: true, message: 'Desbloqueado correctamente' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============================================================================
// ENDPOINT: NOTIFICAR TURNO POR EMAIL
// ============================================================================
app.post('/api/notificar-turno', requireAuth, async (req, res) => {
  try {
    const { email, nombrePaciente, fechaTurno, horaTurno, medico } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email requerido' });
    }

    const htmlEmail = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #f9f9f9; border-radius: 10px; overflow: hidden;">
        <div style="background: #1a3a3a; color: white; padding: 24px; text-align: center;">
          <h2 style="margin: 0; font-size: 22px;">🏥 Clínica LEMES</h2>
          <p style="margin: 8px 0 0 0; opacity: 0.8; font-size: 14px;">Confirmación de turno médico</p>
        </div>
        <div style="padding: 28px;">
          <p style="font-size: 16px; color: #333;">Hola <strong>${nombrePaciente}</strong>,</p>
          <p style="color: #555;">Tu turno ha sido <strong style="color: #10b981;">CONFIRMADO</strong>.</p>
          <div style="background: white; border-left: 4px solid #5CAEA3; border-radius: 6px; padding: 16px; margin: 20px 0;">
            <p style="margin: 6px 0; color: #333;">📅 <strong>Fecha:</strong> ${fechaTurno}</p>
            <p style="margin: 6px 0; color: #333;">🕐 <strong>Hora:</strong> ${horaTurno}</p>
            <p style="margin: 6px 0; color: #333;">👨‍⚕️ <strong>Médico:</strong> ${medico}</p>
          </div>
          <p style="color: #777; font-size: 13px;">Ante cualquier consulta o necesidad de reprogramar, comuníquese con el consultorio.</p>
        </div>
        <div style="background: #eee; padding: 12px; text-align: center; font-size: 12px; color: #999;">
          Sistema Médico LEMES
        </div>
      </div>
    `;

    await enviarEmailBrevo({
      to: email,
      subject: `✅ Turno confirmado - ${fechaTurno} ${horaTurno}`,
      html: htmlEmail
    });

    console.log('📧 Email de turno enviado a:', email);
    res.json({ success: true, message: 'Email enviado correctamente' });
  } catch (error) {
    console.error('❌ Error al enviar email:', error.message);
    res.status(500).json({ success: false, message: 'Error al enviar email: ' + error.message });
  }
});

// ============================================================================
// ENDPOINT: ENVIAR RECETA POR EMAIL (como PDF adjunto)
// ============================================================================
app.post('/api/enviar-receta', requireAuth, async (req, res) => {
  let browser;
  try {
    const { email, nombrePaciente, fecha, medsHtml, diagHtml, tratHtml, pacienteTexto } = req.body;

    if (!email) return res.status(400).json({ success: false, message: 'Email requerido' });

    // ── Construir HTML idéntico al de imprimirReceta() ──
    const watermark = `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0.06;pointer-events:none;z-index:0;">
      <svg width="320" height="260" viewBox="0 0 420 360" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 130 L35 130 C40 128 44 120 48 132 C52 144 54 118 58 124 C62 130 65 133 70 130 C74 127 76 116 80 128 C84 140 86 120 90 125 C92 129 95 131 100 130 L112 130 C115 127 117 104 120 82 C123 60 126 172 129 186 C131 192 134 133 140 130 L155 130 C158 127 161 118 165 136 C169 154 171 116 175 123 C177 129 180 132 184 130 L198 130 C201 127 204 116 208 138 C212 160 214 110 218 120 C220 128 223 132 228 130 L244 130 C247 127 249 104 252 82 C255 60 258 175 261 190 C263 196 267 134 273 130 L290 130 C293 127 296 118 300 136 C304 154 306 116 310 124 C312 130 315 132 320 130 L350 130 L380 130" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M120 186 Q116 222 110 250 Q102 278 82 298 Q65 315 50 308" fill="none" stroke="#000" stroke-width="7" stroke-linecap="round"/>
        <circle cx="44" cy="312" r="28" fill="#000"/>
        <line x1="44" y1="290" x2="44" y2="334" stroke="white" stroke-width="4"/>
        <line x1="20" y1="312" x2="68" y2="312" stroke="white" stroke-width="4"/>
        <text x="10" y="358" font-family="'Brush Script MT',cursive" font-size="18" fill="#000">L y L  Consultorio privado</text>
      </svg>
    </div>`;

    const header = `<div style="text-align:center;border-bottom:2px solid #222;padding-bottom:10px;margin-bottom:12px;">
      <div style="font-size:17px;font-weight:bold;font-family:'Brush Script MT',cursive;margin-bottom:3px;">Dr. Carlos Alberto Lemes</div>
      <div style="font-size:9.5px;line-height:1.7;">MÉDICO – M.P. 6306 &nbsp;M.N. 158.838<br>Medicina General y Familiar – Endocrinología<br>Ex Residente Hospital San Juan Bautista</div>
      <div style="font-size:9.5px;font-style:italic;color:#444;margin-top:3px;">"El que no vive para servir, no sirve para vivir"</div>
    </div>`;

    const footer = `<div style="margin-top:auto;padding-top:6px;border-top:1px solid #ccc;display:flex;justify-content:space-between;font-size:8.5px;color:#555;">
      <span>Solo WhatsApp: (3756) 619763</span>
      <span>Ángel S. Blanco 121 · Santo Tomé – Ctes.</span>
    </div>`;

    const firma = `<div style="text-align:right;font-size:10px;color:#444;margin-top:20px;">
      <div>${fecha || ''}</div>
      <div style="border-top:1px solid #222;width:150px;margin:8px 0 4px auto;"></div>
      <div>Dr. Carlos Alberto Lemes</div>
      <div style="font-size:8.5px;">M.P. 6306 · M.N. 158.838</div>
    </div>`;

    const pacienteLinea = pacienteTexto
      ? `<div style="font-size:10.5px;margin-bottom:10px;color:#333;">${pacienteTexto}</div>` : '';

    // Mitad izquierda: paciente + Rp./ + medicamentos + diagnósticos
    const mitadIzq = `<div style="width:50%;padding:20px 18px 16px 20px;border-right:1px dashed #bbb;display:flex;flex-direction:column;min-height:100%;box-sizing:border-box;position:relative;overflow:hidden;">
      ${watermark}
      <div style="position:relative;z-index:1;display:flex;flex-direction:column;height:100%;">
        ${header}
        ${pacienteLinea}
        <div style="font-size:14px;font-weight:bold;margin:6px 0;">Rp./</div>
        <div style="font-size:11px;">${medsHtml || '<em style="color:#999;">Sin medicamentos registrados</em>'}</div>
        <div style="margin-top:10px;padding-top:7px;border-top:1px dashed #bbb;">
          <div style="font-size:8.5px;text-transform:uppercase;letter-spacing:0.06em;color:#666;margin-bottom:4px;">Diagnósticos</div>
          <div style="font-size:11px;">${diagHtml || '<em style="color:#999;">Sin diagnósticos</em>'}</div>
        </div>
        <div style="flex:1;"></div>
        ${firma}
        ${footer}
      </div>
    </div>`;

    // Mitad derecha: paciente + tratamiento
    const mitadDer = `<div style="width:50%;padding:20px 20px 16px 18px;display:flex;flex-direction:column;min-height:100%;box-sizing:border-box;position:relative;overflow:hidden;">
      ${watermark}
      <div style="position:relative;z-index:1;display:flex;flex-direction:column;height:100%;">
        ${header}
        ${pacienteLinea}
        <div style="margin-top:4px;">
          <div style="font-size:8.5px;text-transform:uppercase;letter-spacing:0.06em;color:#666;margin-bottom:4px;">Tratamiento</div>
          <div style="font-size:11px;">${tratHtml || '<em style="color:#999;">Sin tratamiento registrado</em>'}</div>
        </div>
        <div style="flex:1;"></div>
        ${firma}
        ${footer}
      </div>
    </div>`;

    const recetaHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:"Times New Roman",serif; font-size:12px; color:#222; background:white; }
    .receta-wrapper { display:flex; flex-direction:row; width:297mm; height:210mm; background:white; overflow:hidden; }
  </style>
</head>
<body>
  <div class="receta-wrapper">
    ${mitadIzq}
    ${mitadDer}
  </div>
</body></html>`;

    // ── Generar PDF con puppeteer ──
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(recetaHtml, { waitUntil: 'domcontentloaded' });
    const pdfBuffer = await page.pdf({
      width: '297mm',
      height: '210mm',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });
    await browser.close();
    browser = null;

    // ── Email simple con PDF adjunto ──
    const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <tr><td style="background:#1a3a3a;padding:26px;text-align:center;border-radius:8px 8px 0 0;">
        <div style="font-size:22px;font-weight:bold;color:white;letter-spacing:1px;">Clínica LEMES</div>
        <div style="font-size:12px;color:#7ec8c0;margin-top:5px;">Sistema Médico Digital</div>
      </td></tr>
      <tr><td style="background:white;padding:32px 36px;">
        <p style="font-size:16px;color:#1a3a3a;margin:0 0 10px;">Hola <strong>${nombrePaciente}</strong>,</p>
        <p style="font-size:14px;color:#444;line-height:1.6;margin:0 0 20px;">El <strong>Dr. Carlos Alberto Lemes</strong> te generó una receta médica.</p>
        <p style="font-size:14px;color:#444;line-height:1.6;margin:0 0 28px;">Podés encontrarla adjunta en este e-mail.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
        <p style="font-size:11px;color:#888;margin:0;">Ante cualquier consulta comuníquese con el consultorio.<br>Solo WhatsApp: (3756) 619763 · Ángel S. Blanco 121, Santo Tomé, Ctes.</p>
      </td></tr>
      <tr><td style="background:#eee;padding:12px;text-align:center;font-size:11px;color:#aaa;border-radius:0 0 8px 8px;">
        Sistema Médico LEMES
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

    await enviarEmailBrevo({
      to: email,
      subject: `Tu receta médica – Dr. Carlos Alberto Lemes`,
      html: emailHtml,
      attachments: [{
        filename: `receta_${nombrePaciente.replace(/\s+/g,'_')}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }]
    });

    console.log('📧 Receta enviada por email a:', email);
    res.json({ success: true, message: 'Receta enviada correctamente' });
  } catch (error) {
    if (browser) { try { await browser.close(); } catch(_){} }
    console.error('❌ Error al enviar receta:', error.message);
    res.status(500).json({ success: false, message: 'Error al enviar receta: ' + error.message });
  }
});

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

    // Migración: convertir turnos CONFIRMADO → PENDIENTE (estado CONFIRMADO eliminado)
    try {
      const migrados = await prisma.$executeRaw`
        UPDATE turnos SET estado_id = 10 WHERE estado_id = 11
      `;
      if (migrados > 0) console.log(`🔄 Migración: ${migrados} turno(s) CONFIRMADO → PENDIENTE`);
    } catch (e) {
      console.warn('⚠️ Migración CONFIRMADO→PENDIENTE omitida:', e.message);
    }

    // Crear tabla dias_bloqueados si no existe
    try {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS dias_bloqueados (
          id BIGSERIAL PRIMARY KEY,
          medico_id BIGINT NOT NULL,
          fecha DATE,
          hora VARCHAR(5),
          motivo VARCHAR(255),
          creado_at TIMESTAMPTZ DEFAULT NOW()
        )
      `;
      console.log('✅ Tabla dias_bloqueados verificada');
    } catch (e) {
      console.warn('⚠️ dias_bloqueados:', e.message);
    }

    // Crear tabla incidencias_proxima_visita si no existe
    try {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS incidencias_proxima_visita (
          id BIGSERIAL PRIMARY KEY,
          paciente_id BIGINT NOT NULL,
          medico_id BIGINT NOT NULL,
          fecha_sugerida DATE NOT NULL,
          motivo VARCHAR(255),
          observaciones TEXT,
          prioridad VARCHAR(50) DEFAULT 'Normal',
          estado VARCHAR(50) DEFAULT 'Pendiente',
          fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
          usuario_creacion BIGINT,
          turno_id BIGINT,
          fecha_notificacion TIMESTAMPTZ,
          dias_tolerancia INT DEFAULT 7
        )
      `;
      console.log('✅ Tabla incidencias_proxima_visita verificada');
    } catch (e) {
      console.warn('⚠️ incidencias_proxima_visita:', e.message);
    }

    // Crear tabla solicitudes_turno si no existe
    try {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS solicitudes_turno (
          id BIGSERIAL PRIMARY KEY,
          paciente_id BIGINT NOT NULL,
          medico_id BIGINT NOT NULL,
          fecha_sugerida DATE NOT NULL,
          motivo VARCHAR(255),
          observaciones TEXT,
          estado VARCHAR(50) DEFAULT 'Pendiente',
          turno_id BIGINT,
          fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
          usuario_creacion BIGINT,
          fecha_notificacion TIMESTAMPTZ,
          fecha_cierre TIMESTAMPTZ,
          dias_tolerancia INT DEFAULT 7
        )
      `;
      console.log('✅ Tabla solicitudes_turno verificada');
    } catch (e) {
      console.warn('⚠️ solicitudes_turno:', e.message);
    }

    // Agregar columna ultimo_aviso si no existe (control de frecuencia notificaciones desktop)
    try {
      await prisma.$executeRaw`ALTER TABLE solicitudes_turno ADD COLUMN IF NOT EXISTS ultimo_aviso TIMESTAMPTZ`;
      await prisma.$executeRaw`ALTER TABLE incidencias_proxima_visita ADD COLUMN IF NOT EXISTS ultimo_aviso TIMESTAMPTZ`;
      console.log('✅ Columna ultimo_aviso verificada');
    } catch (e) {
      console.warn('⚠️ ultimo_aviso:', e.message);
    }

    // ============================================================
    // CRON: revisar solicitudes pendientes 2x/día (8:00 y 14:00)
    // Procesamiento secuencial: de a una por vez con delay de 3s entre cada una
    // ============================================================
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    const procesarSolicitudCron = async (sol, index, total) => {
      const fecha = sol.fecha_sugerida ? new Date(sol.fecha_sugerida).toLocaleDateString('es-AR') : '-';
      console.log(`   [${index + 1}/${total}] 📅 ${sol.nombre} ${sol.apellido} — ${fecha} (${sol.motivo || 'Sin motivo'}) [${sol.estado}]`);
      // TODO: cuando se active envío automático, agregar aquí:
      //   if (sol.email) await enviarEmailBrevo(sol.email, ...)
      //   if (sol.telefono) { /* abrir WA o enviar SMS */ }
    };

    cron.schedule('0 8,14 * * *', async () => {
      try {
        const lista = await prisma.$queryRaw`
          SELECT s.id, s.fecha_sugerida, s.motivo, s.estado,
                 p.nombre, p.apellido, p.email, p.telefono
          FROM solicitudes_turno s
          JOIN pacientes pac ON pac.id = s.paciente_id
          JOIN personas p ON p.id = pac.persona_id
          WHERE s.estado IN ('Pendiente','Notificado')
          ORDER BY s.fecha_sugerida ASC
        `;
        const total = lista.length;
        console.log(`\n🔔 [CRON ${new Date().toLocaleTimeString('es-AR')}] Solicitudes pendientes: ${total}`);
        if (total === 0) return;

        for (let i = 0; i < lista.length; i++) {
          await procesarSolicitudCron(lista[i], i, total);
          if (i < lista.length - 1) await delay(3000); // 3s entre cada una, excepto la última
        }
        console.log(`   ✅ Cron finalizado — ${total} solicitud(es) procesada(s)`);
      } catch(e) {
        console.warn('⚠️ Error en cron solicitudes:', e.message);
      }
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('✅ Cron solicitudes activo (08:00 y 14:00 ARG)');

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
