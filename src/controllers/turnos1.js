import { PrismaClient } from '@prisma/client';
import { validationResult } from 'express-validator';

const prisma = new PrismaClient();

// ============================================================================
// MAPEO DE ESTADO ID - Basado en BD actual (solo MAYÚSCULAS)
// ============================================================================
const estadoIdMap = {
  PENDIENTE: BigInt(10),
  CONFIRMADO: BigInt(11),
  EN_CONSULTA: BigInt(12),
  ATENDIDA: BigInt(13),
  CANCELADA: BigInt(14)
};

const estadoNombreMap = {
  10: 'PENDIENTE',
  11: 'CONFIRMADO',
  12: 'EN_CONSULTA',
  13: 'ATENDIDA',
  14: 'CANCELADA'
};

// ============================================================================
// MÁQUINA DE ESTADOS VÁLIDOS - FLUJO SIMPLIFICADO
// ============================================================================
// PENDIENTE → EN_CONSULTA (iniciar consulta), CANCELADA (solo si no fue atendido)
// EN_CONSULTA → ATENDIDA (consulta finalizada)
// ATENDIDA: SIN TRANSICIONES (no se puede cancelar)
// CANCELADA: SIN TRANSICIONES (estado final)
const estadosValidos = {
  PENDIENTE: ['CONFIRMADO', 'EN_CONSULTA', 'CANCELADA'],
  CONFIRMADO: ['EN_CONSULTA', 'CANCELADA'],
  EN_CONSULTA: ['FINALIZADA', 'CANCELADA'],
  FINALIZADA: [],
  CANCELADA: []
};

// ============================================================================
// CONTROLLER: AGENDAR TURNO (CON UPSERT DE PERSONA)
// ============================================================================
// 📝 Este endpoint permite agendar un turno con los datos de Persona
// Si la Persona existe (por DNI), actualiza sus datos
// Si no existe, la crea automáticamente
// También auto-crea Paciente si no existe
// ============================================================================
export const agendarTurno = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Errores en la validación',
        details: errors.array()
      });
    }

    const {
      // Datos de Persona
      persona_nombre,
      persona_apellido,
      persona_dni,
      persona_fecha_nacimiento,
      persona_sexo,
      persona_telefono,
      persona_email,
      persona_direccion,
      persona_obra_social,
      persona_numero_afiliado,
      // Datos de Turno
      medico_id,
      fecha,
      hora,
      motivo,
      observaciones
    } = req.body;

    // ========================================================================
    // 🔐 VALIDAR DOCTOR
    // ========================================================================
    const doctor = await prisma.usuario.findUnique({
      where: { id: BigInt(medico_id) },
      select: { id: true, role: true }
    });

    if (!doctor || doctor.role !== 'doctor') {
      return res.status(404).json({
        error: 'Not found',
        message: 'Doctor no encontrado'
      });
    }

    // ========================================================================
    // 🔍 BUSCAR PERSONA POR DNI Y HACER UPSERT
    // ========================================================================
    console.log('🔍 Buscando persona con DNI:', persona_dni);
    
    let persona = await prisma.persona.findUnique({
      where: { dni: persona_dni },
      select: {
        id: true,
        dni: true,
        paciente: { select: { id: true } }
      }
    });

    if (persona) {
      console.log('✅ Persona encontrada (DNI:', persona_dni, '), actualizando datos...');
      
      // Actualizar Persona
      persona = await prisma.persona.update({
        where: { id: persona.id },
        data: {
          nombre: persona_nombre || undefined,
          apellido: persona_apellido || undefined,
          fecha_nacimiento: persona_fecha_nacimiento || undefined,
          sexo: persona_sexo || undefined,
          telefono: persona_telefono || undefined,
          email: persona_email || undefined,
          direccion: persona_direccion || undefined,
          obra_social: persona_obra_social || undefined,
          numero_afiliado: persona_numero_afiliado || undefined
        },
        select: { id: true, paciente: { select: { id: true } } }
      });

      console.log('✅ Persona actualizada:', persona.id);

      // NO crear paciente automáticamente - se hará al confirmar llegada
    } else {
      console.log('📝 Persona no encontrada, creando nueva...');
      
      // Crear nueva Persona
      persona = await prisma.persona.create({
        data: {
          nombre: persona_nombre,
          apellido: persona_apellido,
          dni: persona_dni,
          fecha_nacimiento: persona_fecha_nacimiento || null,
          sexo: persona_sexo || null,
          telefono: persona_telefono || null,
          email: persona_email || null,
          direccion: persona_direccion || null
        },
        select: { id: true }
      });

      console.log('✅ Persona creada:', persona.id);

      // NO crear paciente automáticamente - se hará al confirmar llegada
    }

    // ========================================================================
    // 🔄 CREAR TURNO
    // ========================================================================
    console.log('📌 Creando turno para persona:', persona.id, 'doctor:', medico_id);

    const turno = await prisma.turno.create({
      data: {
        persona_id: persona.id,
        medico_id: BigInt(medico_id),
        fecha: new Date(fecha),
        hora: hora,
        motivo: motivo || null,
        observaciones: observaciones || null,
        estado_id: estadoIdMap.PENDIENTE
      },
      select: {
        id: true,
        persona_id: true,
        medico_id: true,
        fecha: true,
        hora: true,
        motivo: true,
        observaciones: true,
        estado_id: true
      }
    });

    console.log('✅ Turno creado:', turno.id);

    // ========================================================================
    // 🎉 RESPUESTA FINAL
    // ========================================================================
    return res.status(201).json({
      success: true,
      message: 'Turno agendado exitosamente',
      turno: {
        id: turno.id.toString(),
        persona_id: turno.persona_id.toString(),
        persona_nombre: persona_nombre,
        persona_apellido: persona_apellido,
        medico_id: turno.medico_id.toString(),
        fecha: turno.fecha,
        hora: turno.hora,
        motivo: turno.motivo,
        observaciones: turno.observaciones,
        estado: estadoNombreMap[turno.estado_id] || 'PENDIENTE',
        paciente_id: persona.paciente?.id?.toString() || null
      }
    });
  } catch (error) {
    console.error('❌ Error al agendar turno:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al agendar turno: ' + error.message
    });
  }
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
        estado_id: { in: [estadoIdMap.PENDIENTE, estadoIdMap.EN_CONSULTA] }
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
        estado_id: estadoIdMap[estado] || estadoIdMap.PENDIENTE
      },
      include: {
        persona: {
          select: { id: true, nombre: true, apellido: true, dni: true }
        },
        medico: {
          select: { id: true, nombre: true, apellido: true, especialidad: true }
        },
        estado: {
          select: { id: true, nombre: true }
        }
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Turno creado exitosamente',
      data: {
        id: turno.id.toString(),
        persona_id: turno.persona_id.toString(),
        medico_id: turno.medico_id.toString(),
        fecha: turno.fecha,
        hora: turno.hora,
        estado: turno.estado.nombre,
        observaciones: turno.observaciones,
        persona: {
          id: turno.persona.id.toString(),
          nombre: turno.persona.nombre,
          apellido: turno.persona.apellido,
          dni: turno.persona.dni
        },
        medico: {
          id: turno.medico.id.toString(),
          nombre: turno.medico.nombre,
          apellido: turno.medico.apellido,
          especialidad: turno.medico.especialidad
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
      ...(medico_id && { medico_id: BigInt(medico_id) }),
      ...(persona_id && { persona_id: BigInt(persona_id) }),
      ...(estado && { estado_id: estadoIdMap[estado] }),
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
            select: { 
              id: true, 
              nombre: true, 
              apellido: true, 
              dni: true,
              telefono: true,
              email: true,
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
            select: { id: true, nombre: true, apellido: true, especialidad: true }
          },
          estado: {
            select: { id: true, nombre: true, descripcion: true, activo: true }
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
          estado: {
            id: t.estado.id.toString(),
            nombre: t.estado.nombre,
            descripcion: t.estado.descripcion,
            activo: t.estado.activo
          },
          observaciones: t.observaciones,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          persona: {
            id: t.persona.id.toString(),
            nombre: t.persona.nombre,
            apellido: t.persona.apellido,
            dni: t.persona.dni,
            telefono: t.persona.telefono,
            email: t.persona.email,
            paciente: t.persona.paciente ? {
              id: t.persona.paciente.id.toString(),
              obra_social: t.persona.paciente.obra_social,
              numero_afiliado: t.persona.paciente.numero_afiliado,
              observaciones_generales: t.persona.paciente.observaciones_generales
            } : null
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
        estado: { in: ['PENDIENTE'] }
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
    console.log(`👤 Usuario: ${req.user?.nombre || 'desconocido'}, Rol: ${req.user?.role}`);

    // ✅ VALIDACIÓN DE PERMISOS: Solo DOCTOR o SECRETARIA pueden cambiar estado
    if (!req.user || !['doctor', 'secretaria'].includes(req.user.role)) {
      console.log(`❌ Permiso denegado - Rol: ${req.user?.role}`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Solo doctor o secretaria pueden cambiar el estado de un turno'
      });
    }

    // Obtener turno actual (con estado)
    const turno = await prisma.turno.findUnique({
      where: { id: BigInt(id) },
      include: {
        persona: {
          select: { id: true, nombre: true, apellido: true, dni: true }
        },
        medico: {
          select: { id: true, nombre: true, apellido: true }
        },
        estado: {
          select: { id: true, nombre: true }
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

    console.log(`✅ Turno encontrado: ${turno.persona.nombre} ${turno.persona.apellido}, Estado actual: ${turno.estado.nombre}`);

    // Validar transición de estado
    const estadosPermitidos = estadosValidos[turno.estado.nombre] || [];

    if (!estadosPermitidos.includes(nuevoEstado)) {
      console.log(`❌ Transición de estado NO permitida: ${turno.estado.nombre} → ${nuevoEstado}`);
      return res.status(400).json({
        error: 'Bad request',
        message: `No se puede cambiar de ${turno.estado.nombre} a ${nuevoEstado}`,
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
          estado_id: estadoIdMap.EN_CONSULTA,
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

      // 📝 Crear PACIENTE si no existe (la historia se crea cuando el doctor guarda)
      console.log(`📝 Verificando/Creando PACIENTE...`);
      let paciente = await prisma.paciente.findUnique({
        where: { persona_id: turno.persona.id }
      });

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
    }

    // Actualizar estado del turno actual
    console.log(`📝 Actualizando turno ${id} a estado ${nuevoEstado}`);
    
    const turnoActualizado = await prisma.turno.update({
      where: { id: BigInt(id) },
      data: { estado_id: estadoIdMap[nuevoEstado] },
      include: {
        persona: {
          select: { nombre: true, apellido: true, dni: true }
        },
        medico: {
          select: { id: true, nombre: true, apellido: true, especialidad: true }
        },
        estado: {
          select: { id: true, nombre: true }
        }
      }
    });

    console.log(`✅ Turno actualizado exitosamente a ${nuevoEstado}`);

    // 👤 Obtener paciente_id basado en persona_id
    const paciente = await prisma.paciente.findUnique({
      where: { persona_id: turnoActualizado.persona_id },
      select: { id: true }
    });

    const pacientId = paciente ? paciente.id.toString() : null;
    console.log(`👤 Paciente ID obtenido: ${pacientId}`);

    return res.status(200).json({
      success: true,
      message: `Estado del turno actualizado a ${nuevoEstado}`,
      data: {
        id: turnoActualizado.id.toString(),
        persona_id: turnoActualizado.persona_id.toString(),
        paciente_id: pacientId,
        medico_id: turnoActualizado.medico_id.toString(),
        fecha: turnoActualizado.fecha.toLocaleDateString('es-AR'),
        hora: turnoActualizado.hora,
        estado: turnoActualizado.estado.nombre,
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
        },
        medico: {
          select: { id: true, nombre: true, apellido: true, especialidad: true, subespecialidad: true, telefono: true }
        },
        estado: {
          select: { id: true, nombre: true }
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
        id: turno.id.toString(),
        persona_id: turno.persona_id.toString(),
        medico_id: turno.medico_id.toString(),
        fecha: turno.fecha,
        hora: turno.hora,
        estado: turno.estado.nombre,
        observaciones: turno.observaciones,
        persona: {
          id: turno.persona.id.toString(),
          nombre: turno.persona.nombre,
          apellido: turno.persona.apellido,
          dni: turno.persona.dni,
          telefono: turno.persona.telefono,
          email: turno.persona.email,
          fecha_nacimiento: turno.persona.fecha_nacimiento,
          sexo: turno.persona.sexo,
          direccion: turno.persona.direccion,
          paciente: turno.persona.paciente ? {
            id: turno.persona.paciente.id.toString(),
            obra_social: turno.persona.paciente.obra_social,
            numero_afiliado: turno.persona.paciente.numero_afiliado,
            observaciones_generales: turno.persona.paciente.observaciones_generales
          } : null
        },
        medico: {
          id: turno.medico.id.toString(),
          nombre: turno.medico.nombre,
          apellido: turno.medico.apellido,
          especialidad: turno.medico.especialidad,
          subespecialidad: turno.medico.subespecialidad,
          telefono: turno.medico.telefono
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
    console.log(`🗑️  DELETE received - ID: ${req.params.id}`);
    const { id } = req.params;

    const turnoExistente = await prisma.turno.findUnique({
      where: { id: BigInt(id) }
    });

    console.log(`🔍 Turno encontrado:`, turnoExistente ? 'SÍ' : 'NO');
    
    if (!turnoExistente) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Turno no encontrado'
      });
    }

    // Eliminar turno sin restricción de estado
    console.log(`✅ Eliminando turno ${id} (estado actual: ${turnoExistente.estado_id})`);
    
    const deleted = await prisma.turno.delete({
      where: { id: BigInt(id) }
    });
    
    console.log(`✅ Turno eliminado exitosamente`);

    return res.status(200).json({
      success: true,
      message: 'Turno eliminado exitosamente'
    });
  } catch (error) {
    console.error('❌ Error al eliminar turno:', error);
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
        },
        estado: {
          select: {
            id: true,
            nombre: true
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
        'EN_CONSULTA': '#007BFF',  // Azul
        'FINALIZADA': '#28A745',   // Verde
        'CANCELADA': '#DC3545'     // Rojo
      };

      // Combinar fecha y hora
      const [horas, minutos] = turno.hora.split(':');
      const fechaCompleta = new Date(turno.fecha);
      fechaCompleta.setHours(parseInt(horas), parseInt(minutos), 0, 0);

      return {
        id: turno.id.toString(),
        title: `${persona.nombre} ${persona.apellido} - Dr. ${turno.medico.nombre}`,
        start: fechaCompleta.toISOString(),
        backgroundColor: estadoColores[turno.estado.nombre] || '#007BFF',
        borderColor: estadoColores[turno.estado.nombre] || '#007BFF',
        extendedProps: {
          personaNombre: `${persona.nombre} ${persona.apellido}`,
          personaDNI: persona.dni,
          personaTelefono: persona.telefono,
          medicoNombre: `${turno.medico.nombre} ${turno.medico.apellido}`,
          medicoEspecialidad: turno.medico.especialidad,
          estado: turno.estado.nombre,
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
    const medicoId = BigInt(req.user.id);

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
      persona_id: BigInt(persona_id)
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
          },
          estado: {
            select: { id: true, nombre: true, descripcion: true, activo: true }
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
      data: turnos.map(t => {
        const turnoObj = {
          id: t.id.toString(),
          persona_id: t.persona_id.toString(),
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
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          persona: {
            id: t.persona.id.toString(),
            nombre: t.persona.nombre,
            apellido: t.persona.apellido,
            dni: t.persona.dni,
            email: t.persona.email,
            telefono: t.persona.telefono
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
    const { skip = 0, take = 50 } = req.query;

    // Obtener paciente con relaciones
    const paciente = await prisma.paciente.findUnique({
      where: { id: BigInt(paciente_id) },
      include: {
        persona: {
          select: { id: true, nombre: true, apellido: true, dni: true, email: true, telefono: true }
        },
        historias_clinicas: {
          select: { id: true, fecha_apertura: true, activa: true },
          take: 1 // Obtener solo la primera historia clínica
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
      persona_id: paciente.persona_id
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
          },
          estado: {
            select: { id: true, nombre: true, descripcion: true, activo: true }
          }
        }
      }),
      prisma.turno.count({ where })
    ]);

    // Obtener consultas asociadas a estos turnos
    const turnoIds = turnos.map(t => t.id);
    const consultas = await prisma.consultaMedica.findMany({
      where: { turno_id: { in: turnoIds } },
      include: {
        estado: {
          select: { id: true, nombre: true, descripcion: true, activo: true }
        }
      }
    });

    const consultasPorTurno = new Map(
      consultas.map(c => [{
        id: c.id.toString(),
        turno_id: c.turno_id.toString(),
        estado: {
          id: c.estado.id.toString(),
          nombre: c.estado.nombre,
          descripcion: c.estado.descripcion,
          activo: c.estado.activo
        }
      }])
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
        historia_clinica: paciente.historias_clinicas && paciente.historias_clinicas[0] ? {
          id: paciente.historias_clinicas[0].id.toString(),
          fecha_apertura: paciente.historias_clinicas[0].fecha_apertura,
          activa: paciente.historias_clinicas[0].activa
        } : null
      },
      turnos: turnos.map(t => {
        const turnoObj = {
          id: t.id.toString(),
          persona_id: t.persona_id.toString(),
          medico_id: t.medico_id.toString(),
          fecha: t.fecha.toISOString().split('T')[0],
          hora: t.hora,
          estado: {
            id: t.estado.id.toString(),
            nombre: t.estado.nombre,
            descripcion: t.estado.descripcion,
            activo: t.estado.activo
          },
          observaciones: t.observaciones,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          persona: {
            id: t.persona.id.toString(),
            nombre: t.persona.nombre,
            apellido: t.persona.apellido,
            dni: t.persona.dni,
            email: t.persona.email,
            telefono: t.persona.telefono
          },
          medico: {
            id: t.medico.id.toString(),
            nombre: t.medico.nombre,
            apellido: t.medico.apellido,
            especialidad: t.medico.especialidad
          },
          consulta: consultasPorTurno.get(t.id.toString()) || null
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
    console.error('Error al obtener turnos del paciente:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener los turnos del paciente'
    });
  }
};

// ============================================================================
// CONTROLLER: BUSCAR PERSONA POR DNI
// ============================================================================
// 📝 Busca una persona por DNI
// Si existe, retorna sus datos completos incluyendo su relación con paciente
// Si no existe, retorna encontrada: false
// ============================================================================
export const buscarPersonaPorDni = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation error',
        message: errors.array()[0].msg,
        details: errors.array()
      });
    }

    const { dni } = req.query;

    console.log(`\n🔍 Buscando persona con DNI: ${dni}`);

    // Buscar la persona por DNI
    const persona = await prisma.persona.findUnique({
      where: { dni: parseInt(dni) },
      include: {
        paciente: {
          select: {
            id: true,
            obra_social: true,
            numero_afiliado: true,
            observaciones_generales: true
          }
        }
      }
    });

    if (!persona) {
      console.log(`❌ No se encontró persona con DNI: ${dni}`);
      return res.status(200).json({
        encontrada: false,
        persona: null
      });
    }

    console.log(`✅ Persona encontrada: ${persona.nombre} ${persona.apellido}`);

    return res.status(200).json({
      encontrada: true,
      persona: {
        id: persona.id.toString(),
        nombre: persona.nombre,
        apellido: persona.apellido,
        dni: persona.dni,
        email: persona.email || '',
        telefono: persona.telefono || '',
        fecha_nacimiento: persona.fecha_nacimiento || '',
        sexo: persona.sexo || '',
        direccion: persona.direccion || '',
        es_paciente: !!persona.paciente,
        paciente: persona.paciente ? {
          id: persona.paciente.id.toString(),
          obra_social: persona.paciente.obra_social || '',
          numero_afiliado: persona.paciente.numero_afiliado || '',
          observaciones_generales: persona.paciente.observaciones_generales || ''
        } : null
      }
    });
  } catch (error) {
    console.error('❌ Error al buscar persona por DNI:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al buscar la persona',
      details: error.message
    });
  }
};

// ============================================================================
// CONTROLLER: ACTUALIZAR TURNO
// ============================================================================
// 📝 Actualiza un turno existente y sus datos de persona asociados
// Si la Persona existe (por DNI), actualiza sus datos
// Actualiza los datos del turno (fecha, hora, observaciones, etc.)
// ============================================================================
export const actualizarTurno = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation error',
        errors: errors.array().map(e => ({
          field: e.param,
          msg: e.msg
        }))
      });
    }

    const { id } = req.params;
    const userId = req.user.id;

    // Destructurar datos de persona con prefijo
    const {
      persona_nombre: nombre,
      persona_apellido: apellido,
      persona_dni: dni,
      persona_email: email,
      persona_telefono: telefono,
      persona_fecha_nacimiento: fecha_nacimiento,
      persona_sexo: sexo,
      persona_direccion: direccion,
      persona_obra_social: obra_social,
      persona_numero_afiliado: numero_afiliado,
      medico_id,
      fecha,
      hora,
      observaciones,
      motivo
    } = req.body;

    console.log(`\n📝 Actualizando turno ID: ${id}`);
    console.log(`📅 Datos recibidos:`, {
      nombre, apellido, dni, email, telefono, fecha_nacimiento, sexo,
      medico_id, fecha, hora, observaciones
    });

    // Validar que el turno exista
    const turnoExistente = await prisma.turno.findUnique({
      where: { id: BigInt(id) },
      include: { persona_rel: { select: { id: true, dni: true } } }
    });

    if (!turnoExistente) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Turno no encontrado'
      });
    }

    // Helper para limpiar valores
    const limpiarValor = (val) => {
      if (val === '' || val === null || val === undefined) return null;
      return val;
    };

    // 1️⃣ ACTUALIZAR PERSONA
    // Buscar la persona existente
    let personaData = await prisma.persona.findFirst({
      where: {
        OR: [
          { id: turnoExistente.persona_id },
          { dni: parseInt(dni) || undefined }
        ]
      },
      include: { paciente: true }
    });

    let personaId;

    if (personaData) {
      // Actualizar persona existente
      console.log(`✏️ Actualizando persona existente ID: ${personaData.id}`);
      
      const personaActualizada = await prisma.persona.update({
        where: { id: personaData.id },
        data: {
          nombre: limpiarValor(nombre) || personaData.nombre,
          apellido: limpiarValor(apellido) || personaData.apellido,
          dni: parseInt(dni) || personaData.dni,
          email: limpiarValor(email),
          telefono: limpiarValor(telefono),
          fecha_nacimiento: limpiarValor(fecha_nacimiento)
            ? new Date(fecha_nacimiento)
            : personaData.fecha_nacimiento,
          sexo: limpiarValor(sexo),
          direccion: limpiarValor(direccion)
        }
      });

      personaId = personaActualizada.id;

      // 2️⃣ ACTUALIZAR PACIENTE
      if (personaData.paciente) {
        await prisma.paciente.update({
          where: { id: personaData.paciente.id },
          data: {
            obra_social: limpiarValor(obra_social),
            numero_afiliado: limpiarValor(numero_afiliado),
            observaciones_generales: limpiarValor(observaciones),
          }
        });
        console.log(`✏️ Paciente actualizado ID: ${personaData.paciente.id}`);
      }
    } else {
      return res.status(400).json({
        error: 'Validation error',
        message: 'No se puede encontrar la persona asociada al turno'
      });
    }

    // 3️⃣ ACTUALIZAR TURNO
    const turnoActualizado = await prisma.turno.update({
      where: { id: BigInt(id) },
      data: {
        medico_id: parseInt(medico_id) || turnoExistente.medico_id,
        fecha: limpiarValor(fecha) ? new Date(fecha) : turnoExistente.fecha,
        hora: limpiarValor(hora) || turnoExistente.hora,
        observaciones: limpiarValor(motivo || observaciones)
      },
      include: {
        persona: true,
        medico: true,
        estado: true
      }
    });

    console.log(`✅ Turno actualizado exitosamente ID: ${turnoActualizado.id}`);

    return res.status(200).json({
      success: true,
      message: 'Turno actualizado exitosamente',
      turno: {
        id: turnoActualizado.id.toString(),
        persona_id: turnoActualizado.persona_id.toString(),
        medico_id: turnoActualizado.medico_id.toString(),
        fecha: turnoActualizado.fecha,
        hora: turnoActualizado.hora,
        estado: turnoActualizado.estado.nombre,
        observaciones: turnoActualizado.observaciones
      }
    });
  } catch (error) {
    console.error('❌ Error al actualizar turno:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al actualizar el turno',
      details: error.message
    });
  }
};

// ============================================================================
// CONTROLLER: CONFIRMAR LLEGADA (Crea Paciente + Cambia estado a CONFIRMADO)
// ============================================================================
// Este endpoint se ejecuta SOLO cuando el usuario guarda el formulario de 
// confirmar llegada. Así se asegura que si cancela, nada cambia.
// Flujo:
// 1. Usuario hace click en "Confirmar Llegada"
// 2. Se abre modal con formulario de datos de paciente
// 3. Si cancela: endpoint NO se ejecuta (estado sigue PENDIENTE)
// 4. Si guarda: Este endpoint crea Paciente + cambia a CONFIRMADO
// ============================================================================
export const confirmarLlegada = async (req, res) => {
  try {
    const { id } = req.params;
    const { obra_social, numero_afiliado } = req.body;

    console.log(`🏥 Confirmar llegada - Turno ID: ${id}`);
    console.log(`   Obra social: ${obra_social}`);
    console.log(`   Afiliado: ${numero_afiliado}`);

    // Obtener turno
    const turno = await prisma.turno.findUnique({
      where: { id: BigInt(id) },
      include: {
        persona: { select: { id: true, nombre: true, apellido: true, dni: true } },
        estado: { select: { id: true, nombre: true } }
      }
    });

    if (!turno) {
      console.log(`❌ Turno no encontrado: ${id}`);
      return res.status(404).json({
        error: 'Not found',
        message: 'Turno no encontrado'
      });
    }

    console.log(`   Estado actual: ${turno.estado.nombre} (ID: ${turno.estado.id})`);
    console.log(`   Info del turno:`, JSON.stringify({id: turno.id.toString(), persona_id: turno.persona_id.toString(), medico_id: turno.medico_id.toString()}, null, 2));

    // Solo permitir desde PENDIENTE
    if (turno.estado.nombre !== 'PENDIENTE') {
      console.log(`❌ El turno debe estar en PENDIENTE (actual: ${turno.estado.nombre})`);
      return res.status(400).json({
        error: 'Bad request',
        message: `No se puede confirmar llegada. El turno debe estar PENDIENTE (actual: ${turno.estado.nombre})`
      });
    }

    // Buscar o crear Paciente
    let paciente = await prisma.paciente.findUnique({
      where: { persona_id: turno.persona.id }
    });

    if (!paciente) {
      console.log(`📝 Creando Paciente para persona ${turno.persona.id}`);
      paciente = await prisma.paciente.create({
        data: {
          persona_id: turno.persona.id,
          obra_social: obra_social || null,
          numero_afiliado: numero_afiliado || null,
          activo: true
        }
      });
      console.log(`✅ Paciente creado: ${paciente.id}`);
    } else {
      console.log(`📝 Actualizando Paciente existente ${paciente.id}`);
      paciente = await prisma.paciente.update({
        where: { id: paciente.id },
        data: {
          obra_social: obra_social || paciente.obra_social,
          numero_afiliado: numero_afiliado || paciente.numero_afiliado
        }
      });
      console.log(`✅ Paciente actualizado: ${paciente.id}`);
    }

    // ✅ CAMBIAR ESTADO A CONFIRMADO (usar BigInt para asegurar consistencia)
    const CONFIRMADO_ID = BigInt(11);
    console.log(`📝 Actualizando turno ${id} a CONFIRMADO (estado_id: ${CONFIRMADO_ID})`);
    
    const turnoActualizado = await prisma.turno.update({
      where: { id: BigInt(id) },
      data: { estado_id: CONFIRMADO_ID },
      include: {
        persona: { select: { nombre: true, apellido: true } },
        estado: { select: { id: true, nombre: true } }
      }
    });

    console.log(`✅ Turno actualizado a ${turnoActualizado.estado.nombre} (ID: ${turnoActualizado.estado.id})`);

    return res.status(200).json({
      success: true,
      message: 'Llegada confirmada - Paciente registrado',
      data: {
        turno_id: turnoActualizado.id.toString(),
        paciente_id: paciente.id.toString(),
        estado: turnoActualizado.estado.nombre,
        persona: turnoActualizado.persona
      }
    });
  } catch (error) {
    console.error('❌ Error al confirmar llegada:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message || 'Error al confirmar llegada'
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
  obtenerTurnosDePaciente,
  buscarPersonaPorDni,
  actualizarTurno,
  confirmarLlegada
};
