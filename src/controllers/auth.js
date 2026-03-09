import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { supabase } from '../services/supabase.js';

const prisma = new PrismaClient();

// ============================================================================
// CONTROLLER: REGISTRO (SIGNUP) - Crear usuario en Supabase + BD local
// ============================================================================
export const signup = async (req, res) => {
  try {
    const { email, password, nombre, apellido, role = 'doctor', especialidad } = req.body;

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

    // 2. Crear usuario en BD local (con datos clínicos)
    try {
      const usuarioBD = await prisma.usuario.create({
        data: {
          email,
          password_hash: supabaseUserId, // Guardar UUID de Supabase como "contraseña"
          nombre,
          apellido,
          role,
          especialidad: especialidad || null,
          activo: true
        }
      });

      return res.status(201).json({
        success: true,
        message: 'Usuario registrado exitosamente',
        data: {
          usuario: {
            id: usuarioBD.id.toString(),
            email: usuarioBD.email,
            nombre: usuarioBD.nombre,
            apellido: usuarioBD.apellido,
            role: usuarioBD.role
          }
        }
      });
    } catch (dbError) {
      // Si falla la BD, eliminar usuario de Supabase
      await supabase.auth.admin.deleteUser(supabaseUserId);
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
// CONTROLLER: LOGIN - Autenticar con Supabase Auth + obtener datos BD
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

    // 1. Autenticar con Supabase
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError || !authData.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Email o contraseña incorrectos'
      });
    }

    // 2. Obtener datos del usuario desde BD local
    const usuarioBD = await prisma.usuario.findUnique({
      where: { email }
    });

    if (!usuarioBD) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Usuario no configurado en sistema'
      });
    }

    // Verificar que el usuario está activo
    if (!usuarioBD.activo) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Usuario inactivo'
      });
    }

    // 3. Crear JWT local con datos clínicos (opcional, para rapidez)
    const jwtLocal = jwt.sign(
      {
        id: usuarioBD.id.toString(),
        email: usuarioBD.email,
        nombre: usuarioBD.nombre,
        apellido: usuarioBD.apellido,
        role: usuarioBD.role,
        supabaseId: authData.user.id
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // 4. Guardar token en cookie httpOnly
    res.cookie('auth_token', jwtLocal, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000  // 24 horas
    });

    // También guardar sesión de Supabase
    res.cookie('supabase_session', authData.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000
    });

    // 5. Actualizar último login
    await prisma.usuario.update({
      where: { id: usuarioBD.id },
      data: { ultimo_login: new Date() }
    });

    // 6. Responder
    return res.status(200).json({
      success: true,
      message: 'Login exitoso',
      data: {
        token: jwtLocal,
        usuario: {
          id: usuarioBD.id.toString(),
          email: usuarioBD.email,
          nombre: usuarioBD.nombre,
          apellido: usuarioBD.apellido,
          role: usuarioBD.role,
          especialidad: usuarioBD.especialidad
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
    // Limpiar las cookies HTTP-only
    res.clearCookie('auth_token', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/'
    });

    res.clearCookie('token', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/'
    });

    // Retornar respuesta exitosa
    return res.status(200).json({
      success: true,
      message: 'Logout exitoso'
    });
  } catch (error) {
    console.error('Error en logout:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al procesar el logout'
    });
  }
};

// ============================================================================
// CONTROLLER: OBTENER DATOS DEL USUARIO ACTUAL
// ============================================================================

export const me = async (req, res) => {
  try {
    const usuarioId = req.usuario?.id;

    if (!usuarioId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Usuario no autenticado'
      });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        email: true,
        nombre: true,
        apellido: true,
        role: true,
        telefono: true,
        direccion: true,
        especialidad: true,
        subespecialidad: true,
        activo: true,
        ultimo_login: true,
        created_at: true
      }
    });

    if (!usuario) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Usuario no encontrado'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...usuario,
        id: usuario.id.toString()
      }
    });
  } catch (error) {
    console.error('Error en me:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener datos del usuario'
    });
  }
};

// ============================================================================
// CONTROLLER: CREAR NUEVO USUARIO (Admin)
// ============================================================================

export const crearUsuario = async (req, res) => {
  try {
    const { email, password, nombre, apellido, role = 'secretaria', telefono, direccion } = req.body;

    // Validaciones
    if (!email || !password || !nombre || !apellido) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Email, contraseña, nombre y apellido son requeridos'
      });
    }

    // Verificar que el email no existe
    const usuarioExistente = await prisma.usuario.findUnique({
      where: { email }
    });

    if (usuarioExistente) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'El email ya está registrado'
      });
    }

    // Hashear contraseña
    const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 10);

    // Crear usuario
    const usuario = await prisma.usuario.create({
      data: {
        email,
        password_hash: passwordHash,
        nombre,
        apellido,
        role,
        telefono,
        direccion,
        activo: true
      },
      select: {
        id: true,
        email: true,
        nombre: true,
        apellido: true,
        role: true,
        created_at: true
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Usuario creado exitosamente',
      data: {
        ...usuario,
        id: usuario.id.toString()
      }
    });
  } catch (error) {
    console.error('Error al crear usuario:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al crear el usuario'
    });
  }
};

// ============================================================================
// CONTROLLER: CAMBIAR CONTRASEÑA
// ============================================================================

export const cambiarContrasena = async (req, res) => {
  try {
    const usuarioId = req.usuario?.id;
    const { contraseñaActual, contraseñaNueva } = req.body;

    if (!usuarioId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Usuario no autenticado'
      });
    }

    if (!contraseñaActual || !contraseñaNueva) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Contraseña actual y nueva son requeridas'
      });
    }

    // Obtener usuario
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId }
    });

    if (!usuario) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Usuario no encontrado'
      });
    }

    // Verificar contraseña actual
    const contraseñaValida = await bcrypt.compare(contraseñaActual, usuario.password_hash);

    if (!contraseñaValida) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Contraseña actual incorrecta'
      });
    }

    // Hashear nueva contraseña
    const nuevoHash = await bcrypt.hash(contraseñaNueva, parseInt(process.env.BCRYPT_ROUNDS) || 10);

    // Actualizar
    await prisma.usuario.update({
      where: { id: usuarioId },
      data: { password_hash: nuevoHash }
    });

    return res.status(200).json({
      success: true,
      message: 'Contraseña actualizada exitosamente'
    });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al cambiar la contraseña'
    });
  }
};

export default {
  login,
  logout,
  me,
  crearUsuario,
  cambiarContrasena
};
