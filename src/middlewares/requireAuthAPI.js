import { PrismaClient } from '@prisma/client';
import { supabase } from '../services/supabase.js';

const prisma = new PrismaClient();

/**
 * Middleware de autenticación para rutas API
 * Valida el token directamente con Supabase Auth
 * Supabase es la única fuente de verdad para sesiones
 * 
 * Devuelve 401 Unauthorized si el token es inválido/expirado
 * Sincroniza automáticamente usuarios nuevos de Supabase a tabla medicos
 */
export const requireAuthAPI = async (req, res, next) => {
  try {
    // Obtener token de headers (Authorization: Bearer TOKEN)
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '')?.trim();

    // Si no hay token en header, intentar desde cookie
    const cookieToken = req.cookies?.access_token;
    const tokenToValidate = token || cookieToken;

    if (!tokenToValidate) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No se proporcionó token de autenticación'
      });
    }

    // 🔐 VALIDAR EL TOKEN DIRECTAMENTE CON SUPABASE AUTH
    // Esto asegura que Supabase sea la única fuente de verdad
    const { data: { user: supabaseUser }, error: authError } = await supabase.auth.getUser(tokenToValidate);
    
    if (authError || !supabaseUser) {
      console.log(`⚠️  Token inválido/expirado en API: ${authError?.message || 'Sin usuario'}`);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token inválido o expirado',
        details: authError?.message
      });
    }

    const supabaseId = supabaseUser.id;
    const email = supabaseUser.email;

    // SINCRONIZAR AUTOMÁTICAMENTE: Buscar o crear el médico en BD local
    let medico = await prisma.medico.findUnique({
      where: { supabase_id: supabaseId }
    });
    
    if (!medico) {
      // Usuario autenticado en Supabase pero no en BD local → CREAR AUTOMÁTICAMENTE
      console.log(`📝 Sincronizando nuevo usuario API (${email}) a tabla medicos...`);
      
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
        
        console.log(`✅ Médico sincronizado en API: ID ${medico.id}, Email: ${medico.email}`);
      } catch (createError) {
        console.error('❌ Error creando médico en API:', createError.message);
        return res.status(500).json({
          error: 'Internal Server Error',
          message: 'Error sincronizando usuario'
        });
      }
    }
    
    // Verificar que el médico está activo
    if (!medico.activo) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Usuario inactivo'
      });
    }

    // Adjuntar datos del usuario al request
    req.user = {
      id: medico.id.toString(),
      medicoId: medico.id.toString(),
      supabaseId: medico.supabase_id,
      supabaseUser: supabaseUser,
      email: medico.email,
      nombre: medico.nombre,
      apellido: medico.apellido,
      role: (medico.role || 'user').toLowerCase()
    };
    
    next();
  } catch (error) {
    console.error('❌ API Auth middleware error:', error.message);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Error validando autenticación'
    });
  }
};

export default requireAuthAPI;
