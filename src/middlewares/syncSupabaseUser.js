import { PrismaClient } from '@prisma/client';
import { supabase } from '../services/supabase.js';

const prisma = new PrismaClient();

/**
 * Middleware para sincronizar usuario autenticado de Supabase con tabla medicos
 * Se ejecuta después de verificar el JWT, antes de acceder a rutas protegidas
 */
export const syncSupabaseUser = async (req, res, next) => {
  try {
    // El user ya fue verificado por el middleware de autenticación previo
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const supabaseId = req.user.id; // UUID de Supabase
    const email = req.user.email;

    // Buscar si el médico ya existe en nuestra BD
    let medico = await prisma.medico.findUnique({
      where: { supabase_id: supabaseId }
    });

    // Si NO existe en la BD local, crearlo automáticamente
    if (!medico) {
      console.log(`📝 Sincronizando usuario Supabase ${supabaseId} a tabla medicos...`);

      try {
        medico = await prisma.medico.create({
          data: {
            supabase_id: supabaseId,
            email: email || 'unknown@example.com',
            nombre: req.user.user_metadata?.nombre || 'Usuario',
            apellido: req.user.user_metadata?.apellido || 'Supabase',
            role: req.user.user_metadata?.role || 'doctor',
            especialidad: req.user.user_metadata?.especialidad || null,
            telefono: req.user.user_metadata?.telefono || null,
            activo: true
          }
        });

        console.log(`✅ Usuario ${email} sincronizado. Médico ID: ${medico.id}`);
      } catch (createError) {
        console.error('❌ Error sincronizando usuario:', createError.message);
        // NO bloquear la solicitud, solo logear el error
      }
    }

    // Pasar los datos del médico al siguiente middleware
    req.medico = medico;
    next();
  } catch (error) {
    console.error('Error en syncSupabaseUser:', error);
    // NO bloquear la solicitud, solo logear el error
    next();
  }
};

export default syncSupabaseUser;
