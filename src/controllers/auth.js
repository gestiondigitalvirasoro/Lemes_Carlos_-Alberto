import { PrismaClient } from '@prisma/client';
import { supabase } from '../services/supabase.js';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

// ============================================================================
// CONTROLLER: REGISTRO (SIGNUP) - Crear usuario en Supabase + BD local
// ============================================================================
export const signup = async (req, res) => {
  try {
    const { email, password, nombre, apellido, role = 'doctor', especialidad, telefono, direccion } = req.body;

    // Validaciones
    if (!email || !password || !nombre || !apellido) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Email, contraseña, nombre y apellido son requeridos'
      });
    }

    // 1. Crear usuario en Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true // Auto-confirmar
    });

    if (authError) {
      return res.status(400).json({
        error: 'Bad request',
        message: authError.message || 'Error al crear usuario en Supabase'
      });
    }

    const supabaseUserId = authData.user.id;

    // 2. Crear registro Medico en BD local
    try {
      const medico = await prisma.medico.create({
        data: {
          supabase_id: supabaseUserId,
          email,
          nombre,
          apellido,
          role,
          especialidad: especialidad || null,
          telefono: telefono || null,
          direccion: direccion || null,
          activo: true
        }
      });

      // 3. Obtener token para el usuario recién creado
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
        return res.status(201).json({
          success: true,
          message: 'Médico registrado exitosamente (sin token de sesión)',
          data: {
            medico: {
              id: medico.id.toString(),
              email: medico.email,
              nombre: medico.nombre,
              apellido: medico.apellido,
              role: medico.role
            }
          }
        });
      }

      // Guardar token en cookie httpOnly
      res.cookie('access_token', signInData.session.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días
      });

      return res.status(201).json({
        success: true,
        message: 'Médico registrado exitosamente',
        data: {
          access_token: signInData.session.access_token,
          medico: {
            id: medico.id.toString(),
            email: medico.email,
            nombre: medico.nombre,
            apellido: medico.apellido,
            role: medico.role
          }
        }
      });
    } catch (dbError) {
      console.error('Error al crear médico en BD:', dbError);
      throw dbError;
    }
  } catch (error) {
    console.error('Error en signup:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

// ============================================================================
// CONTROLLER: LOGIN - Autenticar con Supabase Auth
// ============================================================================
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validaciones básicas
    if (!email || !password) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Email y contraseña son requeridos'
      });
    }

    // 1. Autenticar con Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError || !authData.user) {
      console.error('Supabase auth error:', authError);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Email o contraseña incorrectos'
      });
    }

    const supabaseUserId = authData.user.id;

    // 2. Obtener médico desde BD local usando supabase_id
    let medico = await prisma.medico.findUnique({
      where: { supabase_id: supabaseUserId },
      select: {
        id: true,
        email: true,
        nombre: true,
        apellido: true,
        role: true,
        especialidad: true,
        telefono: true,
        direccion: true,
        activo: true,
        supabase_id: true
      }
    });

    // Si NO existe por supabase_id, buscar por email
    if (!medico) {
      console.log(`🔍 Buscando médico por email: ${email}`);
      medico = await prisma.medico.findUnique({
        where: { email: email },
        select: {
          id: true,
          email: true,
          nombre: true,
          apellido: true,
          role: true,
          especialidad: true,
          telefono: true,
          direccion: true,
          activo: true,
          supabase_id: true
        }
      });

      // Si lo encontró por email pero tiene supabase_id diferente, actualizar
      if (medico && medico.supabase_id !== supabaseUserId) {
        console.log(`🔄 Actualizando supabase_id para: ${email}`);
        medico = await prisma.medico.update({
          where: { email: email },
          data: { supabase_id: supabaseUserId },
          select: {
            id: true,
            email: true,
            nombre: true,
            apellido: true,
            role: true,
            especialidad: true,
            telefono: true,
            direccion: true,
            activo: true,
            supabase_id: true
          }
        });
      }
    }

    // Si aún no existe, crear uno nuevo
    if (!medico) {
      console.log(`📝 Sincronizando usuario Supabase en login: ${email}`);
      
      try {
        const nuevoMedico = await prisma.medico.create({
          data: {
            supabase_id: supabaseUserId,
            email: email,
            nombre: authData.user.user_metadata?.nombre || 'Usuario',
            apellido: authData.user.user_metadata?.apellido || 'Supabase',
            role: authData.user.user_metadata?.role || 'doctor',
            especialidad: authData.user.user_metadata?.especialidad || null,
            telefono: authData.user.user_metadata?.telefono || null,
            activo: true
          },
          select: {
            id: true,
            email: true,
            nombre: true,
            apellido: true,
            role: true,
            especialidad: true,
            telefono: true,
            direccion: true,
            activo: true,
            supabase_id: true
          }
        });
        
        medico = nuevoMedico;
        console.log(`✅ Médico sincronizado en login: ID ${medico.id}`);
      } catch (syncError) {
        console.error('❌ Error sincronizando médico en login:', syncError.message);
        return res.status(500).json({
          error: 'Internal server error',
          message: 'Error sincronizando usuario'
        });
      }
    }

    // 3. Verificar que el médico está activo
    if (!medico.activo) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Médico inactivo'
      });
    }

    // 4. Actualizar último login
    await prisma.medico.update({
      where: { id: medico.id },
      data: { ultimo_login: new Date() }
    });

    // 5. Guardar token en cookie httpOnly
    res.cookie('access_token', authData.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días
    });

    // 6. Responder con datos del médico y token de Supabase
    return res.status(200).json({
      success: true,
      message: 'Login exitoso',
      data: {
        access_token: authData.session.access_token,
        medico: {
          id: medico.id.toString(),
          email: medico.email,
          nombre: medico.nombre,
          apellido: medico.apellido,
          role: medico.role,
          especialidad: medico.especialidad
        }
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

// ============================================================================
// CONTROLLER: LOGOUT
// ============================================================================
export const logout = async (req, res) => {
  try {
    // Limpiar las cookies
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });

    return res.status(200).json({
      success: true,
      message: 'Logout exitoso'
    });
  } catch (error) {
    console.error('Error en logout:', error);
    // No fallar el logout si hay error, solo limpiar cookies
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });

    return res.status(200).json({
      success: true,
      message: 'Logout exitoso'
    });
  }
};

// ============================================================================
// CONTROLLER: OBTENER DATOS DEL USUARIO ACTUAL
// ============================================================================
export const me = async (req, res) => {
  try {
    const supabaseId = req.user?.id; // Del middleware que verifica autenticación (supabase_id)

    if (!supabaseId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Usuario no autenticado'
      });
    }

    const medico = await prisma.medico.findUnique({
      where: { supabase_id: supabaseId },
      select: {
        id: true,
        email: true,
        nombre: true,
        apellido: true,
        role: true,
        telefono: true,
        direccion: true,
        especialidad: true,
        activo: true,
        ultimo_login: true,
        created_at: true
      }
    });

    if (!medico) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Médico no encontrado'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...medico,
        id: medico.id.toString()
      }
    });
  } catch (error) {
    console.error('Error en me:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

// ============================================================================
// CONTROLLER: ACTUALIZAR PERFIL DEL USUARIO ACTUAL
// ============================================================================
export const updateProfile = async (req, res) => {
  try {
    const supabaseId = req.user?.id; // supabase_id del middleware
    const { nombre, apellido, telefono, direccion, especialidad } = req.body;

    if (!supabaseId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Usuario no autenticado'
      });
    }

    const medico = await prisma.medico.update({
      where: { supabase_id: supabaseId },
      data: {
        ...(nombre && { nombre }),
        ...(apellido && { apellido }),
        ...(telefono && { telefono }),
        ...(direccion && { direccion }),
        ...(especialidad && { especialidad })
      },
      select: {
        id: true,
        email: true,
        nombre: true,
        apellido: true,
        role: true,
        especialidad: true
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Perfil actualizado',
      data: {
        ...medico,
        id: medico.id.toString()
      }
    });
  } catch (error) {
    console.error('Error en updateProfile:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

export default {
  signup,
  login,
  logout,
  me,
  updateProfile
};

