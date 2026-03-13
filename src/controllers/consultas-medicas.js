import { PrismaClient } from '@prisma/client';
import { validationResult } from 'express-validator';

const prisma = new PrismaClient();

// ============================================================================
// INICIAR CONSULTA DESDE TURNO (Crea automáticamente Paciente + Historia)
// ============================================================================
export const iniciarConsultaDesdeTurno = async (req, res) => {
  try {
    const { turno_id } = req.params;
    const { motivo_consulta, resumen, observaciones } = req.body;
    const medico_id_jwt = req.user?.id; // Del JWT

    // Obtener Turno
    const turno = await prisma.turno.findUnique({
      where: { id: BigInt(turno_id) },
      include: {
        persona: true,
        medico: true
      }
    });

    if (!turno) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Turno no encontrado'
      });
    }

    // ========== PASO 1: Obtener o Crear Paciente ==========
    let paciente = await prisma.paciente.findUnique({
      where: { persona_id: turno.persona_id }
    });

    if (!paciente) {
      // Crear Paciente (usando datos de Persona)
      paciente = await prisma.paciente.create({
        data: {
          persona_id: turno.persona_id,
          obra_social: turno.persona.obra_social,
          numero_afiliado: turno.persona.numero_afiliado || `A-${Date.now()}`
        }
      });
    }

    // ========== PASO 2: Obtener o Crear Historia Clínica ==========
    let historia = await prisma.historiaClinica.findUnique({
      where: { paciente_id: paciente.id }
    });

    if (!historia) {
      // Crear Historia Clínica (asociada al médico del turno)
      historia = await prisma.historiaClinica.create({
        data: {
          paciente_id: paciente.id,
          creada_por_medico_id: turno.medico_id, // Médico del Turno
          fecha_apertura: new Date(),
          activa: true
        }
      });
    }

    // ========== PASO 3: Crear Consulta ==========
    // Obtener estado COMPLETADA
    const estadoCompletada = await prisma.estadoConsulta.findFirst({
      where: { nombre: 'COMPLETADA' }
    });

    const consulta = await prisma.consultaMedica.create({
      data: {
        historia_clinica_id: historia.id,
        medico_id: turno.medico_id, // Médico del Turno
        turno_id: BigInt(turno_id),
        fecha: turno.fecha,
        motivo_consulta: motivo_consulta || turno.observaciones || 'Consulta médica',
        resumen: resumen || null,
        estado_id: estadoCompletada?.id || 4n
      },
      include: {
        historia: {
          include: {
            paciente: {
              include: {
                persona: true
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
        }
      }
    });

    // Actualizar estado del Turno
    await prisma.turno.update({
      where: { id: BigInt(turno_id) },
      data: { estado: 'FINALIZADA' }
    });

    return res.status(201).json({
      success: true,
      message: 'Consulta iniciada correctamente',
      data: {
        consulta: {
          id: consulta.id.toString(),
          motivo_consulta: consulta.motivo_consulta,
          fecha: consulta.fecha,
          estado: consulta.estado,
          medico: consulta.medico,
          historia_clinica: {
            id: consulta.historia.id.toString(),
            paciente: {
              id: consulta.historia.paciente.id.toString(),
              persona: consulta.historia.paciente.persona
            }
          }
        }
      }
    });
  } catch (error) {
    console.error('Error en iniciarConsultaDesdeT turno:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

// ============================================================================
// OBTENER TODAS LAS CONSULTAS
// ============================================================================
export const obtenerConsultasMedicas = async (req, res) => {
  try {
    const { skip = 0, take = 10, historia_id, medico_id, estado } = req.query;

    const where = {};
    if (historia_id) where.historia_clinica_id = BigInt(historia_id);
    if (medico_id) where.medico_id = BigInt(medico_id);
    if (estado) where.estado = estado;

    const consultas = await prisma.consultaMedica.findMany({
      where,
      skip: parseInt(skip),
      take: parseInt(take),
      include: {
        historia: {
          include: {
            paciente: {
              include: {
                persona: true
              }
            }
          }
        },
        medico: {
          select: {
            id: true,
            nombre: true,
            apellido: true
          }
        }
      },
      orderBy: { fecha: 'desc' }
    });

    const total = await prisma.consultaMedica.count({ where });

    return res.status(200).json({
      success: true,
      data: consultas.map(c => ({
        id: c.id.toString(),
        motivo_consulta: c.motivo_consulta,
        resumen: c.resumen,
        estado: c.estado,
        fecha: c.fecha,
        medico: c.medico,
        historia_clinica: c.historia.id.toString(),
        paciente: {
          id: c.historia.paciente.id.toString(),
          nombre: `${c.historia.paciente.persona.nombre} ${c.historia.paciente.persona.apellido}`
        }
      })),
      paginacion: {
        total,
        skip,
        take
      }
    });
  } catch (error) {
    console.error('Error en obtenerConsultasMedicas:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

// ============================================================================
// OBTENER UNA CONSULTA MEDICA
// ============================================================================
export const obtenerConsultaMedica = async (req, res) => {
  try {
    const { id } = req.params;

    const consulta = await prisma.consultaMedica.findUnique({
      where: { id: BigInt(id) },
      include: {
        historia: {
          include: {
            paciente: {
              include: {
                persona: true
              }
            },
            documentos: true,
            antecedentes: true
          }
        },
        signos_vitales: true,
        diagnosticos: true,
        estudios: true,
        medico: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            especialidad: true
          }
        },
        anamnesis: true,
        tratamientos: true
      }
    });

    if (!consulta) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Consulta no encontrada'
      });
    }

    return res.status(200).json({
      success: true,
      data: consulta
    });
  } catch (error) {
    console.error('Error en obtenerConsultaMedica:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

// ============================================================================
// ACTUALIZAR CONSULTA MEDICA
// ============================================================================
export const actualizarConsultaMedica = async (req, res) => {
  try {
    const { id } = req.params;
    const { resumen, estado } = req.body;

    const consulta = await prisma.consultaMedica.update({
      where: { id: BigInt(id) },
      data: {
        resumen: resumen || undefined,
        estado: estado || undefined
      },
      include: {
        historia: {
          include: {
            paciente: {
              include: {
                persona: true
              }
            }
          }
        }
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Consulta actualizada correctamente',
      data: consulta
    });
  } catch (error) {
    console.error('Error en actualizarConsultaMedica:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};
