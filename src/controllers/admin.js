/**
 * Controlador para funcionalidades de administración
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ============================================================================
// GET ESTADÍSTICAS DASHBOARD
// ============================================================================

export const getEstadisticasDashboard = async (req, res) => {
  try {
    // Total de pacientes
    const totalPacientes = await prisma.paciente.count({
      where: { activo: true }
    });

    // Total de turnos
    const totalTurnos = await prisma.turno.count({
      where: {
        // No usar activo para turnos, solo contar todos
      }
    });

    // Turnos de hoy
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const mañana = new Date(hoy);
    mañana.setDate(mañana.getDate() + 1);

    const turnosHoy = await prisma.turno.count({
      where: {
        fecha_hora: {
          gte: hoy,
          lt: mañana
        }
      }
    });

    // Médicos activos
    const medicosActivos = await prisma.usuario.count({
      where: {
        role: 'doctor',
        activo: true
      }
    });

    // Secretarias activas
    const secretariasActivas = await prisma.usuario.count({
      where: {
        role: 'secretaria',
        activo: true
      }
    });

    // Turnos pendientes (últimos 30 días)
    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);

    const turnosPendientes = await prisma.turno.count({
      where: {
        estado: 'pendiente',
        fecha_hora: {
          gte: hace30Dias
        }
      }
    });

    // Historias clínicas recientes (últimos 7 días)
    const hace7Dias = new Date();
    hace7Dias.setDate(hace7Dias.getDate() - 7);

    const historiasRecientes = await prisma.historiaClinica.count({
      where: {
        created_at: {
          gte: hace7Dias
        }
      }
    });

    return res.json({
      success: true,
      data: {
        totalPacientes,
        totalTurnos,
        turnosHoy,
        medicosActivos,
        secretariasActivas,
        turnosPendientes,
        historiasRecientes
      }
    });
  } catch (error) {
    console.error('Error en getEstadisticasDashboard:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener estadísticas'
    });
  }
};

// ============================================================================
// LISTAR USUARIOS (CON PAGINACIÓN)
// ============================================================================

export const listarUsuarios = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const role = req.query.role || null;
    const skip = (page - 1) * limit;

    const whereCondition = role ? { role } : {};

    // Obtener usuarios
    const usuarios = await prisma.usuario.findMany({
      where: whereCondition,
      select: {
        id: true,
        nombre: true,
        apellido: true,
        email: true,
        role: true,
        activo: true,
        especialidad: true,
        subespecialidad: true,
        created_at: true
      },
      skip,
      take: limit,
      orderBy: { created_at: 'desc' }
    });

    // Total de registros
    const total = await prisma.usuario.count({ where: whereCondition });

    return res.json({
      success: true,
      data: {
        usuarios: usuarios.map(u => ({
          ...u,
          id: u.id.toString()
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error en listarUsuarios:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al listar usuarios'
    });
  }
};

// ============================================================================
// CREAR USUARIO
// ============================================================================

export const crearUsuario = async (req, res) => {
  try {
    const { nombre, apellido, email, password, role, especialidad, subespecialidad } = req.body;

    // Validaciones
    if (!nombre || !apellido || !email || !password || !role) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Faltan campos requeridos: nombre, apellido, email, password, role'
      });
    }

    // Validar que el rol sea válido
    const rolesValidos = ['admin', 'doctor', 'secretaria'];
    if (!rolesValidos.includes(role)) {
      return res.status(400).json({
        error: 'Bad request',
        message: `Rol inválido. Debe ser uno de: ${rolesValidos.join(', ')}`
      });
    }

    // Verificar que el email no exista
    const usuarioExistente = await prisma.usuario.findUnique({
      where: { email }
    });

    if (usuarioExistente) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'El email ya está registrado'
      });
    }

    // Hash de contraseña
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Crear usuario
    const nuevoUsuario = await prisma.usuario.create({
      data: {
        nombre,
        apellido,
        email,
        password_hash: passwordHash,
        role,
        especialidad: role === 'doctor' ? especialidad : null,
        subespecialidad: role === 'doctor' ? subespecialidad : null,
        activo: true
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Usuario creado exitosamente',
      data: {
        id: nuevoUsuario.id.toString(),
        nombre: nuevoUsuario.nombre,
        apellido: nuevoUsuario.apellido,
        email: nuevoUsuario.email,
        role: nuevoUsuario.role,
        activo: nuevoUsuario.activo
      }
    });
  } catch (error) {
    console.error('Error en crearUsuario:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al crear usuario'
    });
  }
};

// ============================================================================
// OBTENER USUARIO POR ID
// ============================================================================

export const obtenerUsuario = async (req, res) => {
  try {
    const { id } = req.params;

    const usuario = await prisma.usuario.findUnique({
      where: { id: BigInt(id) },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        email: true,
        role: true,
        activo: true,
        especialidad: true,
        subespecialidad: true,
        created_at: true,
        ultimo_login: true
      }
    });

    if (!usuario) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Usuario no encontrado'
      });
    }

    return res.json({
      success: true,
      data: {
        ...usuario,
        id: usuario.id.toString()
      }
    });
  } catch (error) {
    console.error('Error en obtenerUsuario:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener usuario'
    });
  }
};

// ============================================================================
// ACTUALIZAR USUARIO
// ============================================================================

export const actualizarUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, apellido, role, especialidad, subespecialidad } = req.body;

    // Verificar que el usuario existe
    const usuarioExistente = await prisma.usuario.findUnique({
      where: { id: BigInt(id) }
    });

    if (!usuarioExistente) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Usuario no encontrado'
      });
    }

    // Datos a actualizar
    const dataActualizar = {};
    
    if (nombre) dataActualizar.nombre = nombre;
    if (apellido) dataActualizar.apellido = apellido;
    if (role) {
      const rolesValidos = ['admin', 'doctor', 'secretaria'];
      if (!rolesValidos.includes(role)) {
        return res.status(400).json({
          error: 'Bad request',
          message: `Rol inválido. Debe ser uno de: ${rolesValidos.join(', ')}`
        });
      }
      dataActualizar.role = role;
    }
    
    if (role === 'doctor' || (usuarioExistente.role === 'doctor' && !role)) {
      if (especialidad) dataActualizar.especialidad = especialidad;
      if (subespecialidad) dataActualizar.subespecialidad = subespecialidad;
    }

    // Actualizar
    const usuarioActualizado = await prisma.usuario.update({
      where: { id: BigInt(id) },
      data: dataActualizar,
      select: {
        id: true,
        nombre: true,
        apellido: true,
        email: true,
        role: true,
        activo: true,
        especialidad: true,
        subespecialidad: true
      }
    });

    return res.json({
      success: true,
      message: 'Usuario actualizado exitosamente',
      data: {
        ...usuarioActualizado,
        id: usuarioActualizado.id.toString()
      }
    });
  } catch (error) {
    console.error('Error en actualizarUsuario:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al actualizar usuario'
    });
  }
};

// ============================================================================
// ACTIVAR/DESACTIVAR USUARIO
// ============================================================================

export const toggleUsuarioActivo = async (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;

    // Validar que activo sea booleano
    if (typeof activo !== 'boolean') {
      return res.status(400).json({
        error: 'Bad request',
        message: 'El campo activo debe ser booleano (true/false)'
      });
    }

    // Verificar que no sea el único admin
    if (activo === false) {
      const usuarioActual = await prisma.usuario.findUnique({
        where: { id: BigInt(id) }
      });

      if (usuarioActual.role === 'admin') {
        const adminCount = await prisma.usuario.count({
          where: { role: 'admin', activo: true }
        });

        if (adminCount <= 1) {
          return res.status(400).json({
            error: 'Bad request',
            message: 'No puedes desactivar el único administrador del sistema'
          });
        }
      }
    }

    // Actualizar
    const usuarioActualizado = await prisma.usuario.update({
      where: { id: BigInt(id) },
      data: { activo },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        email: true,
        role: true,
        activo: true
      }
    });

    return res.json({
      success: true,
      message: `Usuario ${activo ? 'activado' : 'desactivado'} exitosamente`,
      data: {
        ...usuarioActualizado,
        id: usuarioActualizado.id.toString()
      }
    });
  } catch (error) {
    console.error('Error en toggleUsuarioActivo:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al cambiar estado del usuario'
    });
  }
};

// ============================================================================
// ELIMINAR USUARIO (SOFT DELETE)
// ============================================================================

export const eliminarUsuario = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que no sea el único admin
    const usuarioActual = await prisma.usuario.findUnique({
      where: { id: BigInt(id) }
    });

    if (!usuarioActual) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Usuario no encontrado'
      });
    }

    if (usuarioActual.role === 'admin') {
      const adminCount = await prisma.usuario.count({
        where: { role: 'admin', activo: true }
      });

      if (adminCount <= 1) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'No puedes eliminar el único administrador del sistema'
        });
      }
    }

    // Soft delete (desactivar)
    const usuarioEliminado = await prisma.usuario.update({
      where: { id: BigInt(id) },
      data: { activo: false },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        email: true
      }
    });

    return res.json({
      success: true,
      message: 'Usuario eliminado exitosamente',
      data: {
        ...usuarioEliminado,
        id: usuarioEliminado.id.toString()
      }
    });
  } catch (error) {
    console.error('Error en eliminarUsuario:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al eliminar usuario'
    });
  }
};

// ============================================================================
// LISTAR PACIENTES (CON PAGINACIÓN)
// ============================================================================

export const listarPacientes = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const skip = (page - 1) * limit;

    // Construir where condition para búsqueda
    const whereCondition = search
      ? {
          OR: [
            { usuario: { nombre: { contains: search, mode: 'insensitive' } } },
            { usuario: { apellido: { contains: search, mode: 'insensitive' } } },
            { dni: { contains: search, mode: 'insensitive' } },
            { usuario: { email: { contains: search, mode: 'insensitive' } } }
          ]
        }
      : {};

    // Obtener pacientes con información del usuario asociado
    const pacientes = await prisma.paciente.findMany({
      where: whereCondition,
      select: {
        id: true,
        dni: true,
        activo: true,
        created_at: true,
        usuario: {
          select: {
            nombre: true,
            apellido: true,
            email: true,
            telefono: true
          }
        }
      },
      skip,
      take: limit,
      orderBy: { created_at: 'desc' }
    });

    // Total de registros
    const total = await prisma.paciente.count({ where: whereCondition });

    // Formatear datos para que sea más cómodo usarlos en el frontend
    const pacientesFormato = pacientes.map(p => ({
      id: p.id.toString(),
      nombre: p.usuario?.nombre || '-',
      apellido: p.usuario?.apellido || '-',
      DNI: p.dni || '-',
      email: p.usuario?.email || '-',
      telefono: p.usuario?.telefono || '-',
      activo: p.activo !== false,
      created_at: p.created_at
    }));

    return res.json({
      success: true,
      data: {
        pacientes: pacientesFormato,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error en listarPacientes:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al listar pacientes',
      details: error.message
    });
  }
};

export default {
  getEstadisticasDashboard,
  listarUsuarios,
  crearUsuario,
  obtenerUsuario,
  actualizarUsuario,
  toggleUsuarioActivo,
  eliminarUsuario,
  listarPacientes
};
