import { PrismaClient } from '@prisma/client';
import { validationResult } from 'express-validator';

const prisma = new PrismaClient();

// ============================================================================
// MÁQUINA DE ESTADOS VÁLIDOS
// ============================================================================
const estadosValidos = {
  PENDIENTE: ['CONFIRMADO', 'EN_CONSULTA', 'COMPLETA', 'CANCELADA', 'NO_PRESENTADO'],
  CONFIRMADO: ['EN_CONSULTA', 'CANCELADA', 'NO_PRESENTADO', 'COMPLETA'],
  EN_CONSULTA: ['COMPLETA', 'SUSPENDIDA', 'CANCELADA'],
  COMPLETA: [],
  SUSPENDIDA: ['COMPLETA', 'CANCELADA'],
  CANCELADA: [],
  NO_PRESENTADO: [],
  ATENDIDO: [],
  AUSENTE: []
};

// ============================================================================
// CONTROLLER: CREAR TURNO
// ============================================================================
export const crearTurno = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Errores en la validación',
        details: errors.array()
      });
    }

    const { persona_id, medico_id, fecha, hora, observaciones, estado = 'PENDIENTE' } = req.body;

    // Verificar que persona existe
    const persona = await prisma.persona.findUnique({
      where: { id: BigInt(persona_id) }
    });

    if (!persona) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Persona no encontrada'
      });
    }

    // Verificar que doctor existe
    const doctor = await prisma.usuario.findUnique({
      where: { id: BigInt(medico_id) }
    });

    if (!doctor || doctor.role !== 'doctor') {
      return res.status(404).json({
        error: 'Not found',
        message: 'Doctor no encontrado'
      });
    }

    // Verificar no haya conflicto temporal (mismo doctor, misma hora)
    const turnoConflictivo = await prisma.turno.findFirst({
      where: {
        medico_id: BigInt(medico_id),
        fecha: new Date(fecha),
        hora: hora,
        estado: { in: ['PENDIENTE', 'CONFIRMADO', 'EN_CONSULTA'] }
      }
    });

    if (turnoConflictivo) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'El doctor ya tiene un turno en ese horario'
      });
    }

    // Crear turno
    const turno = await prisma.turno.create({
      data: {
        persona_id: BigInt(persona_id),
        medico_id: BigInt(medico_id),
        fecha: new Date(fecha),
        hora: hora,
        observaciones: observaciones,
        estado: estado
      },
      include: {
        persona: {
          select: { id: true, nombre: true, apellido: true, dni: true }
        },
        medico: {
          select: { id: true, nombre: true, apellido: true, especialidad: true }
        }
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Turno creado exitosamente',
      data: {
        ...turno,
        id: turno.id.toString(),
        persona_id: turno.persona_id.toString(),
        medico_id: turno.medico_id.toString(),
        persona: {
          ...turno.persona,
          id: turno.persona.id.toString()
        },
        medico: {
          ...turno.medico,
          id: turno.medico.id.toString()
        }
      }
    });
  } catch (error) {
    console.error('Error al crear turno:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al crear el turno'
    });
  }
};

// ============================================================================
// CONTROLLER: OBTENER TODOS LOS TURNOS
// ============================================================================
export const obtenerTurnos = async (req, res) => {
  try {
    const { skip = 0, take = 10, estado, medico_id, persona_id, fecha } = req.query;

    const where = {
      ...(estado && { estado }),
      ...(medico_id && { medico_id: BigInt(medico_id) }),
      ...(persona_id && { persona_id: BigInt(persona_id) }),
      ...(fecha && {
        fecha: {
          gte: new Date(`${fecha}T00:00:00`),
          lt: new Date(`${fecha}T23:59:59`)
        }
      })
    };

    const [turnos, total] = await Promise.all([
      prisma.turno.findMany({
        where,
        skip: parseInt(skip),
        take: parseInt(take),
        orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
        include: {
          persona: {
            select: { id: true, nombre: true, apellido: true, dni: true }
          },
          medico: {
            select: { id: true, nombre: true, apellido: true, especialidad: true }
          }
        }
      }),
      prisma.turno.count({ where })
    ]);

    return res.status(200).json({
      success: true,
      data: turnos.map(t => {
        const turnoObj = {
          id: t.id.toString(),
          persona_id: t.persona_id.toString(),
          medico_id: t.medico_id.toString(),
          fecha: t.fecha,
          hora: t.hora,
          estado: t.estado,
          observaciones: t.observaciones,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          persona: {
            id: t.persona.id.toString(),
            nombre: t.persona.nombre,
            apellido: t.persona.apellido,
            dni: t.persona.dni
          },
          medico: {
            id: t.medico.id.toString(),
            nombre: t.medico.nombre,
            apellido: t.medico.apellido,
            especialidad: t.medico.especialidad
          }
        };
        return turnoObj;
      }),
      pagination: {
        total,
        skip: parseInt(skip),
        take: parseInt(take),
        pages: Math.ceil(total / parseInt(take))
      }
    });
  } catch (error) {
    console.error('Error al obtener turnos:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener los turnos'
    });
  }
};

// ============================================================================
// CONTROLLER: OBTENER SIGUIENTE TURNO PENDIENTE
// ============================================================================
export const obtenerSiguienteTurno = async (req, res) => {
  try {
    const ahora = new Date();

    const siguienteTurno = await prisma.turno.findFirst({
      where: {
        fecha: { gte: ahora },
        estado: { in: ['PENDIENTE', 'CONFIRMADO'] }
      },
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
      include: {
        persona: {
          select: { id: true, nombre: true, apellido: true, dni: true }
        },
        medico: {
          select: { id: true, nombre: true, apellido: true, especialidad: true }
        }
      }
    });

    if (!siguienteTurno) {
      return res.status(404).json({
        error: 'Not found',
        message: 'No hay turnos pendientes'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...siguienteTurno,
        id: siguienteTurno.id.toString(),
        persona_id: siguienteTurno.persona_id.toString(),
        medico_id: siguienteTurno.medico_id.toString(),
        persona: {
          ...siguienteTurno.persona,
          id: siguienteTurno.persona.id.toString()
        },
        medico: {
          ...siguienteTurno.medico,
          id: siguienteTurno.medico.id.toString()
        }
      }
    });
  } catch (error) {
    console.error('Error al obtener siguiente turno:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener el siguiente turno'
    });
  }
};

// ============================================================================
// CONTROLLER: CAMBIAR ESTADO DE TURNO
// ============================================================================
export const cambiarEstadoTurno = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado: nuevoEstado } = req.body;

    console.log(`🔄 Cambiar estado - Turno ID: ${id}, Nuevo estado: ${nuevoEstado}`);
    console.log(`👤 Usuario: ${req.usuario?.nombre || 'desconocido'}, Rol: ${req.usuario?.role}`);

    // ✅ VALIDACIÓN DE PERMISOS: Solo DOCTOR o SECRETARIA pueden cambiar estado
    if (!req.usuario || !['doctor', 'secretaria'].includes(req.usuario.role)) {
      console.log(`❌ Permiso denegado - Rol: ${req.usuario?.role}`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Solo doctor o secretaria pueden cambiar el estado de un turno'
      });
    }

    // Obtener turno actual (ahora con persona, no paciente)
    const turno = await prisma.turno.findUnique({
      where: { id: BigInt(id) },
      include: {
        persona: {
          select: { id: true, nombre: true, apellido: true, dni: true, obra_social: true, numero_afiliado: true }
        },
        medico: {
          select: { id: true, nombre: true, apellido: true }
        }
      }
    });

    if (!turno) {
      console.log(`❌ Turno no encontrado: ${id}`);
      return res.status(404).json({
        error: 'Not found',
        message: 'Turno no encontrado'
      });
    }

    console.log(`✅ Turno encontrado: ${turno.persona.nombre} ${turno.persona.apellido}, Estado actual: ${turno.estado}`);

    // Validar transición de estado
    const estadosPermitidos = estadosValidos[turno.estado] || [];

    if (!estadosPermitidos.includes(nuevoEstado)) {
      console.log(`❌ Transición de estado NO permitida: ${turno.estado} → ${nuevoEstado}`);
      return res.status(400).json({
        error: 'Bad request',
        message: `No se puede cambiar de ${turno.estado} a ${nuevoEstado}`,
        estadosPermitidos: estadosPermitidos.length > 0 ? estadosPermitidos : 'Estado final'
      });
    }

    // 🔒 CONTROL DE UNA SOLA CONSULTA ACTIVA
    // Si intenta cambiar a EN_CONSULTA, verificar que no haya otra EN_CONSULTA activa
    if (nuevoEstado === 'EN_CONSULTA') {
      console.log(`⚠️ Validando: Solo UNA consulta EN_CONSULTA por médico`);
      
      const consultaActiva = await prisma.turno.findFirst({
        where: {
          medico_id: turno.medico_id,
          estado: 'EN_CONSULTA',
          NOT: {
            id: BigInt(id)
          }
        },
        include: {
          persona: { select: { nombre: true } }
        }
      });

      if (consultaActiva) {
        console.log(`❌ RECHAZADO: Ya hay una consulta EN_CONSULTA activa`);
        console.log(`   Paciente actual: ${consultaActiva.persona.nombre}`);
        console.log(`   Hora: ${consultaActiva.hora}`);
        return res.status(409).json({
          error: 'Conflict',
          message: 'No puedes iniciar otra consulta. Ya hay una consulta activa en este momento.',
          consultaActiva: {
            id: consultaActiva.id.toString(),
            paciente: consultaActiva.persona.nombre,
            hora: consultaActiva.hora
          },
          solucion: 'Finaliza o cancela la consulta actual antes de iniciar una nueva.'
        });
      }
      console.log(`✅ Validación OK: Ninguna otra consulta EN_CONSULTA activa`);

      // 🎯 Cuando se inicia consulta EN_CONSULTA, crear PACIENTE + HISTORIA_CLÍNICA automáticamente
      console.log(`📋 Creando PACIENTE + HISTORIA_CLÍNICA para la consulta...`);

      // Verificar si ya existe PACIENTE para esta PERSONA
      let paciente = await prisma.paciente.findUnique({
        where: { persona_id: turno.persona.id }
      });

      // Si no existe PACIENTE, crearlo
      if (!paciente) {
        console.log(`📝 PACIENTE no existe. Creando nuevo PACIENTE...`);
        paciente = await prisma.paciente.create({
          data: {
            persona_id: turno.persona.id,
            obra_social: turno.persona.obra_social,
            numero_afiliado: turno.persona.numero_afiliado,
            activo: true
          }
        });
        console.log(`✅ PACIENTE creado: ID ${paciente.id.toString()}`);
      } else {
        console.log(`✅ PACIENTE ya existe: ID ${paciente.id.toString()}`);
      }

      // Crear HISTORIA_CLÍNICA
      console.log(`📝 Creando HISTORIA_CLÍNICA...`);
      
      // Verificar si ya existe historia clínica activa
      let historiaClinica = await prisma.historiaClinica.findFirst({
        where: { paciente_id: paciente.id }
      });
      
      if (!historiaClinica) {
        historiaClinica = await prisma.historiaClinica.create({
          data: {
            paciente_id: paciente.id,
            creada_por_medico_id: turno.medico_id,
            activa: true
          }
        });
        console.log(`✅ HISTORIA_CLÍNICA creada: ID ${historiaClinica.id.toString()}`);
      } else {
        console.log(`✅ HISTORIA_CLÍNICA ya existe: ID ${historiaClinica.id.toString()}`);
      }
    }

    // Actualizar estado del turno actual
    console.log(`📝 Actualizando turno ${id} a estado ${nuevoEstado}`);
    
    const turnoActualizado = await prisma.turno.update({
      where: { id: BigInt(id) },
      data: { estado: nuevoEstado },
      include: {
        persona: {
          select: { nombre: true, apellido: true, dni: true }
        },
        medico: {
          select: { id: true, nombre: true, apellido: true, especialidad: true }
        }
      }
    });

    console.log(`✅ Turno actualizado exitosamente a ${nuevoEstado}`);

    return res.status(200).json({
      success: true,
      message: `Estado del turno actualizado a ${nuevoEstado}`,
      data: {
        id: turnoActualizado.id.toString(),
        persona_id: turnoActualizado.persona_id.toString(),
        medico_id: turnoActualizado.medico_id.toString(),
        fecha: turnoActualizado.fecha.toLocaleDateString('es-AR'),
        hora: turnoActualizado.hora,
        estado: turnoActualizado.estado,
        observaciones: turnoActualizado.observaciones,
        persona: turnoActualizado.persona
      }
    });
  } catch (error) {
    console.error('❌ Error al cambiar estado del turno:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message || 'Error al cambiar el estado del turno'
    });
  }
};

// ============================================================================
// CONTROLLER: OBTENER TURNO POR ID
// ============================================================================
export const obtenerTurno = async (req, res) => {
  try {
    const { id } = req.params;

    const turno = await prisma.turno.findUnique({
      where: { id: BigInt(id) },
      include: {
        persona: {
          select: { id: true, nombre: true, apellido: true, dni: true, telefono: true }
        },
        medico: {
          select: { id: true, nombre: true, apellido: true, especialidad: true, subespecialidad: true, telefono: true }
        }
      }
    });

    if (!turno) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Turno no encontrado'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...turno,
        id: turno.id.toString(),
        persona_id: turno.persona_id.toString(),
        medico_id: turno.medico_id.toString(),
        persona: {
          ...turno.persona,
          id: turno.persona.id.toString()
        },
        medico: {
          ...turno.medico,
          id: turno.medico.id.toString()
        }
      }
    });
  } catch (error) {
    console.error('Error al obtener turno:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener el turno'
    });
  }
};

// ============================================================================
// CONTROLLER: ELIMINAR TURNO
// ============================================================================
export const eliminarTurno = async (req, res) => {
  try {
    const { id } = req.params;

    const turnoExistente = await prisma.turno.findUnique({
      where: { id: BigInt(id) }
    });

    if (!turnoExistente) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Turno no encontrado'
      });
    }

    // Solo se pueden eliminar turnos pendientes
    if (turnoExistente.estado !== 'pendiente') {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Solo se pueden eliminar turnos pendientes'
      });
    }

    await prisma.turno.delete({
      where: { id: BigInt(id) }
    });

    return res.status(200).json({
      success: true,
      message: 'Turno eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar turno:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al eliminar el turno'
    });
  }
};

// ============================================================================
// CONTROLLER: OBTENER TURNOS PARA AGENDA/CALENDARIO
// ============================================================================
export const obtenerTurnosAgenda = async (req, res) => {
  try {
    const { inicio, fin, medico_id } = req.query;

    let whereClause = {};

    // Filtrar por rango de fechas si se proporcionan
    if (inicio && fin) {
      whereClause.fecha = {
        gte: new Date(inicio),
        lte: new Date(fin)
      };
    }

    // Filtrar por médico si se proporciona
    if (medico_id) {
      whereClause.medico_id = BigInt(medico_id);
    }

    // Obtener turnos con información de la persona y médico
    const turnos = await prisma.turno.findMany({
      where: whereClause,
      include: {
        persona: {
          select: {
            nombre: true,
            apellido: true,
            dni: true,
            telefono: true
          }
        },
        medico: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            especialidad: true
          }
        }
      },
      orderBy: { fecha: 'asc' }
    });

    // Convertir a formato para FullCalendar
    const eventos = turnos.map(turno => {
      const persona = turno.persona;
      const estadoColores = {
        'PENDIENTE': '#FFC107',    // Amarillo
        'CONFIRMADO': '#17A2B8',   // Cyan
        'EN_CONSULTA': '#007BFF',  // Azul
        'ATENDIDO': '#28A745',     // Verde
        'AUSENTE': '#6C757D',      // Gris
        'CANCELADO': '#DC3545'     // Rojo
      };

      // Combinar fecha y hora
      const [horas, minutos] = turno.hora.split(':');
      const fechaCompleta = new Date(turno.fecha);
      fechaCompleta.setHours(parseInt(horas), parseInt(minutos), 0, 0);

      return {
        id: turno.id.toString(),
        title: `${persona.nombre} ${persona.apellido} - Dr. ${turno.medico.nombre}`,
        start: fechaCompleta.toISOString(),
        backgroundColor: estadoColores[turno.estado] || '#007BFF',
        borderColor: estadoColores[turno.estado] || '#007BFF',
        extendedProps: {
          personaNombre: `${persona.nombre} ${persona.apellido}`,
          personaDNI: persona.dni,
          personaTelefono: persona.telefono,
          medicoNombre: `${turno.medico.nombre} ${turno.medico.apellido}`,
          medicoEspecialidad: turno.medico.especialidad,
          estado: turno.estado,
          observaciones: turno.observaciones || 'Sin observaciones'
        }
      };
    });

    return res.status(200).json({
      success: true,
      data: eventos
    });
  } catch (error) {
    console.error('Error al obtener agenda de turnos:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener la agenda de turnos'
    });
  }
};

// ============================================================================
// CONTROLLER: OBTENER CONSULTA ACTIVA
// ============================================================================
export const obtenerConsultaActiva = async (req, res) => {
  try {
    const medicoId = BigInt(req.usuario.id);

    // Buscar una consulta EN_CONSULTA activa del doctor
    const consultaActiva = await prisma.turno.findFirst({
      where: {
        medico_id: medicoId,
        estado: 'EN_CONSULTA'
      },
      include: {
        paciente: {
          include: {
            persona: {
              select: {
                nombre: true,
                apellido: true,
                dni: true
              }
            }
          }
        }
      }
    });

    if (!consultaActiva) {
      return res.status(200).json({
        success: true,
        hay_activa: false,
        message: 'No hay consulta activa'
      });
    }

    return res.status(200).json({
      success: true,
      hay_activa: true,
      turno_id: consultaActiva.id,
      paciente_id: consultaActiva.paciente_id,
      paciente: {
        nombre: `${consultaActiva.paciente.persona.nombre} ${consultaActiva.paciente.persona.apellido}`,
        dni: consultaActiva.paciente.persona.dni
      },
      message: 'Hay una consulta activa'
    });
  } catch (error) {
    console.error('Error al obtener consulta activa:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al verificar consulta activa'
    });
  }
};

// ============================================================================
// CONTROLLER: OBTENER TURNOS DE UNA PERSONA
// ============================================================================
export const obtenerTurnosDePersona = async (req, res) => {
  try {
    const { persona_id } = req.params;
    const { skip = 0, take = 50, estado } = req.query;

    // Verificar que la persona existe
    const persona = await prisma.persona.findUnique({
      where: { id: BigInt(persona_id) }
    });

    if (!persona) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Persona no encontrada'
      });
    }

    const where = {
      persona_id: BigInt(persona_id),
      ...(estado && { estado })
    };

    const [turnos, total] = await Promise.all([
      prisma.turno.findMany({
        where,
        skip: parseInt(skip),
        take: parseInt(take),
        orderBy: [{ fecha: 'desc' }, { hora: 'desc' }],
        include: {
          persona: {
            select: { id: true, nombre: true, apellido: true, dni: true, email: true, telefono: true }
          },
          medico: {
            select: { id: true, nombre: true, apellido: true, especialidad: true }
          }
        }
      }),
      prisma.turno.count({ where })
    ]);

    return res.status(200).json({
      success: true,
      persona: {
        id: persona.id.toString(),
        nombre: persona.nombre,
        apellido: persona.apellido,
        dni: persona.dni,
        email: persona.email,
        telefono: persona.telefono
      },
      data: turnos.map(t => ({
        ...t,
        id: t.id.toString(),
        persona_id: t.persona_id.toString(),
        medico_id: t.medico_id.toString(),
        persona: {
          ...t.persona,
          id: t.persona.id.toString()
        },
        medico: {
          ...t.medico,
          id: t.medico.id.toString()
        }
      })),
      pagination: {
        total,
        skip: parseInt(skip),
        take: parseInt(take),
        pages: Math.ceil(total / parseInt(take))
      }
    });
  } catch (error) {
    console.error('Error al obtener turnos de la persona:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener los turnos de la persona'
    });
  }
};

// ============================================================================
// CONTROLLER: OBTENER TURNOS DE UN PACIENTE
// ============================================================================
export const obtenerTurnosDePaciente = async (req, res) => {
  try {
    const { paciente_id } = req.params;
    const { skip = 0, take = 50, estado } = req.query;

    // Obtener paciente con relaciones
    const paciente = await prisma.paciente.findUnique({
      where: { id: BigInt(paciente_id) },
      include: {
        persona: {
          select: { id: true, nombre: true, apellido: true, dni: true, email: true, telefono: true }
        },
        historia_clinica: {
          select: { id: true, numero_historia: true, fecha_apertura: true }
        }
      }
    });

    if (!paciente) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Paciente no encontrado'
      });
    }

    // Obtener turnos vinculados a través de la persona
    const where = {
      persona_id: paciente.persona_id,
      ...(estado && { estado })
    };

    const [turnos, total] = await Promise.all([
      prisma.turno.findMany({
        where,
        skip: parseInt(skip),
        take: parseInt(take),
        orderBy: [{ fecha: 'desc' }, { hora: 'desc' }],
        include: {
          persona: {
            select: { id: true, nombre: true, apellido: true, dni: true, email: true, telefono: true }
          },
          medico: {
            select: { id: true, nombre: true, apellido: true, especialidad: true }
          }
        }
      }),
      prisma.turno.count({ where })
    ]);

    // Obtener consultas asociadas a estos turnos
    const turnoIds = turnos.map(t => t.id);
    const consultas = await prisma.consultaMedica.findMany({
      where: { turno_id: { in: turnoIds } },
      select: { turno_id: true, id: true, estado: true }
    });

    const consultasPorTurno = new Map(
      consultas.map(c => [c.turno_id.toString(), c])
    );

    return res.status(200).json({
      success: true,
      paciente: {
        id: paciente.id.toString(),
        persona: {
          id: paciente.persona.id.toString(),
          nombre: paciente.persona.nombre,
          apellido: paciente.persona.apellido,
          dni: paciente.persona.dni,
          email: paciente.persona.email,
          telefono: paciente.persona.telefono
        },
        historia_clinica: paciente.historia_clinica ? {
          id: paciente.historia_clinica.id.toString(),
          numero_historia: paciente.historia_clinica.numero_historia,
          fecha_apertura: paciente.historia_clinica.fecha_apertura
        } : null
      },
      turnos: turnos.map(t => ({
        ...t,
        id: t.id.toString(),
        persona_id: t.persona_id.toString(),
        medico_id: t.medico_id.toString(),
        fecha: t.fecha.toISOString().split('T')[0],
        persona: {
          ...t.persona,
          id: t.persona.id.toString()
        },
        medico: {
          ...t.medico,
          id: t.medico.id.toString()
        },
        consulta: consultasPorTurno.get(t.id.toString()) || null
      })),
      pagination: {
        total,
        skip: parseInt(skip),
        take: parseInt(take),
        pages: Math.ceil(total / parseInt(take))
      }
    });
  } catch (error) {
    console.error('Error al obtener turnos del paciente:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener los turnos del paciente'
    });
  }
};

export default {
  crearTurno,
  obtenerTurnos,
  obtenerSiguienteTurno,
  cambiarEstadoTurno,
  obtenerTurno,
  eliminarTurno,
  obtenerTurnosAgenda,
  obtenerConsultaActiva,
  obtenerTurnosDePersona,
  obtenerTurnosDePaciente
};
