import { PrismaClient } from '@prisma/client';
import { validationResult } from 'express-validator';

const prisma = new PrismaClient();

// ============================================================================
// CONTROLLER: CREAR PACIENTE
// ============================================================================
export const crearPaciente = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Errores en la validación',
        details: errors.array()
      });
    }

    const { dni, fecha_nacimiento, genero, numero_emergencia, contacto_emergencia, alergias, patologias_cronicas } = req.body;

    // Verificar DNI único
    const pacienteExistente = await prisma.paciente.findUnique({
      where: { dni }
    });

    if (pacienteExistente) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'El DNI ya está registrado'
      });
    }

    // Generar número de historia clínica
    const ultimaHistoria = await prisma.paciente.findFirst({
      orderBy: { id: 'desc' },
      select: { numero_historia_clinica: true }
    });

    let numeroHistoria = 'HC-001';
    if (ultimaHistoria && ultimaHistoria.numero_historia_clinica) {
      const numero = parseInt(ultimaHistoria.numero_historia_clinica.split('-')[1]) + 1;
      numeroHistoria = `HC-${String(numero).padStart(3, '0')}`;
    }

    // Crear paciente
    const paciente = await prisma.paciente.create({
      data: {
        dni,
        fecha_nacimiento: new Date(fecha_nacimiento),
        genero,
        numero_historia_clinica: numeroHistoria,
        numero_emergencia,
        contacto_emergencia,
        alergias,
        patologias_cronicas,
        activo: true
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Paciente creado exitosamente',
      data: {
        ...paciente,
        id: paciente.id.toString()
      }
    });
  } catch (error) {
    console.error('Error al crear paciente:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al crear el paciente'
    });
  }
};

// ============================================================================
// CONTROLLER: OBTENER TODOS LOS PACIENTES
// ============================================================================
export const obtenerPacientes = async (req, res) => {
  try {
    const { skip = 0, take = 10, activo = true, buscar } = req.query;

    const where = {
      activo: activo === 'false' ? false : true,
      ...(buscar && {
        OR: [
          { dni: { contains: buscar, mode: 'insensitive' } },
          { numero_historia_clinica: { contains: buscar, mode: 'insensitive' } }
        ]
      })
    };

    const [pacientes, total] = await Promise.all([
      prisma.paciente.findMany({
        where,
        skip: parseInt(skip),
        take: parseInt(take),
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          dni: true,
          fecha_nacimiento: true,
          genero: true,
          numero_historia_clinica: true,
          numero_emergencia: true,
          activo: true,
          created_at: true
        }
      }),
      prisma.paciente.count({ where })
    ]);

    return res.status(200).json({
      success: true,
      data: pacientes.map(p => ({
        ...p,
        id: p.id.toString()
      })),
      pagination: {
        total,
        skip: parseInt(skip),
        take: parseInt(take),
        pages: Math.ceil(total / parseInt(take))
      }
    });
  } catch (error) {
    console.error('Error al obtener pacientes:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener los pacientes'
    });
  }
};

// ============================================================================
// CONTROLLER: OBTENER PACIENTE POR ID
// ============================================================================
export const obtenerPaciente = async (req, res) => {
  try {
    const { id } = req.params;

    const paciente = await prisma.paciente.findUnique({
      where: { id: BigInt(id) }
    });

    if (!paciente) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Paciente no encontrado'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...paciente,
        id: paciente.id.toString()
      }
    });
  } catch (error) {
    console.error('Error al obtener paciente:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener el paciente'
    });
  }
};

// ============================================================================
// CONTROLLER: ACTUALIZAR PACIENTE
// ============================================================================
export const actualizarPaciente = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, apellido, numero_emergencia, contacto_emergencia, alergias, patologias_cronicas } = req.body;

    // Verificar que el paciente existe
    const pacienteExistente = await prisma.paciente.findUnique({
      where: { id: BigInt(id) }
    });

    if (!pacienteExistente) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Paciente no encontrado'
      });
    }

    // Actualizar paciente
    const pacienteActualizado = await prisma.paciente.update({
      where: { id: BigInt(id) },
      data: {
        ...(nombre && { nombre }),
        ...(apellido && { apellido }),
        ...(numero_emergencia && { numero_emergencia }),
        ...(contacto_emergencia && { contacto_emergencia }),
        ...(alergias !== undefined && { alergias }),
        ...(patologias_cronicas !== undefined && { patologias_cronicas })
      },
      select: {
        id: true,
        dni: true,
        nombre: true,
        apellido: true,
        fecha_nacimiento: true,
        genero: true,
        numero_historia_clinica: true,
        numero_emergencia: true,
        contacto_emergencia: true,
        alergias: true,
        patologias_cronicas: true,
        activo: true,
        updated_at: true
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Paciente actualizado exitosamente',
      data: {
        ...pacienteActualizado,
        id: pacienteActualizado.id.toString()
      }
    });
  } catch (error) {
    console.error('Error al actualizar paciente:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al actualizar el paciente'
    });
  }
};

// ============================================================================
// CONTROLLER: ELIMINAR PACIENTE (soft delete)
// ============================================================================
export const eliminarPaciente = async (req, res) => {
  try {
    const { id } = req.params;

    const pacienteExistente = await prisma.paciente.findUnique({
      where: { id: BigInt(id) }
    });

    if (!pacienteExistente) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Paciente no encontrado'
      });
    }

    // Soft delete
    await prisma.paciente.update({
      where: { id: BigInt(id) },
      data: { activo: false }
    });

    return res.status(200).json({
      success: true,
      message: 'Paciente eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar paciente:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al eliminar el paciente'
    });
  }
};

export default {
  crearPaciente,
  obtenerPacientes,
  obtenerPaciente,
  actualizarPaciente,
  eliminarPaciente
};
