import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================================================
// MIDDLEWARE: AUTENTICACIÓN (Verificar Token Supabase)
// ============================================================================

export const authMiddleware = async (req, res, next) => {
  try {
    // Intentar obtener el token de:
    // 1. Header Authorization (Bearer token)
    // 2. Cookie access_token
    const authHeader = req.headers.authorization;
    let token = authHeader?.split(' ')[1]; // Bearer <token>
    
    // Si no hay token en el header, intentar desde la cookie
    if (!token && req.cookies && req.cookies.access_token) {
      token = req.cookies.access_token;
    }
    
    console.log(`🔐 Auth Middleware:`, {
      authHeader: authHeader ? '✅ Presente' : '❌ No',
      cookie: req.cookies?.access_token ? '✅ Presente' : '❌ No',
      token: token ? '✅ Token extraído' : '❌ Sin token'
    });

    if (!token) {
      console.log(`❌ Token no proporcionado`);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token no proporcionado'
      });
    }

    try {
      // Decodificar el JWT de Supabase (sin verificar firma porque es servidor)
      // El claim 'sub' contiene el supabase_id del usuario
      const decoded = jwt.decode(token);
      
      if (!decoded || !decoded.sub) {
        console.log(`❌ Token no contiene sub`);
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Token inválido'
        });
      }

      const supabaseId = decoded.sub;

      // Obtener datos del Medico desde la BD primero por supabase_id
      let medico = await prisma.medico.findUnique({
        where: { supabase_id: supabaseId },
        select: {
          id: true,
          supabase_id: true,
          email: true,
          nombre: true,
          apellido: true,
          role: true,
          activo: true
        }
      });

      // Si no lo encuentra por supabase_id, obtener el email del token y buscar por email
      if (!medico && decoded.email) {
        console.log(`⚠️  Medico no encontrado por supabase_id, buscando por email: ${decoded.email}`);
        medico = await prisma.medico.findUnique({
          where: { email: decoded.email },
          select: {
            id: true,
            supabase_id: true,
            email: true,
            nombre: true,
            apellido: true,
            role: true,
            activo: true
          }
        });

        // Si lo encontró por email pero tiene supabase_id diferente, actualizar
        if (medico && medico.supabase_id !== supabaseId) {
          console.log(`🔄 Actualizando supabase_id del médico ${medico.email}`);
          medico = await prisma.medico.update({
            where: { email: decoded.email },
            data: { supabase_id: supabaseId },
            select: {
              id: true,
              supabase_id: true,
              email: true,
              nombre: true,
              apellido: true,
              role: true,
              activo: true
            }
          });
        }
      }

      if (!medico) {
        console.log(`❌ Medico no encontrado para supabase_id: ${supabaseId}`);
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Medico no configurado en sistema'
        });
      }

      if (!medico.activo) {
        console.log(`❌ Medico inactivo: ${medico.email}`);
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Usuario inactivo'
        });
      }

      // Almacenar datos en req.user
      req.user = {
        id: supabaseId,
        medicoId: medico.id.toString(),
        email: medico.email,
        nombre: medico.nombre,
        apellido: medico.apellido,
        role: medico.role
      };

      console.log(`✅ Token válido - Medico: ${medico.nombre} ${medico.apellido} (${medico.role})`);
      next();
    } catch (tokenError) {
      console.log(`❌ Error al verificar token:`, tokenError.message);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token inválido o expirado',
        detail: tokenError.message
      });
    }
  } catch (error) {
    console.error('❌ Error en authMiddleware:', error);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Error en autenticación'
    });
  }
};

// ============================================================================
// MIDDLEWARE: VERIFICAR ROL
// ============================================================================

export const roleMiddleware = (rolesPermitidos = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Usuario no autenticado'
      });
    }

    if (rolesPermitidos.length > 0 && !rolesPermitidos.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Acceso denegado. Roles permitidos: ${rolesPermitidos.join(', ')}`
      });
    }

    next();
  };
};

// ============================================================================
// MIDDLEWARE: OPCIONAL - Si hay token lo parsea, si no continúa igual
// ============================================================================

export const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token = authHeader?.split(' ')[1];
    
    if (!token && req.cookies && req.cookies.access_token) {
      token = req.cookies.access_token;
    }

    if (token) {
      const decoded = jwt.decode(token);
      if (decoded && decoded.sub) {
        const medico = await prisma.medico.findUnique({
          where: { supabase_id: decoded.sub },
          select: {
            id: true,
            supabase_id: true,
            email: true,
            nombre: true,
            apellido: true,
            role: true
          }
        });

        if (medico) {
          req.user = {
            id: medico.supabase_id,
            medicoId: medico.id.toString(),
            email: medico.email,
            nombre: medico.nombre,
            apellido: medico.apellido,
            role: medico.role
          };
        }
      }
    }

    next();
  } catch (error) {
    // Si hay error con el token, simplemente continuamos sin autenticar
    next();
  }
};

export default {
  authMiddleware,
  roleMiddleware,
  optionalAuthMiddleware
};
