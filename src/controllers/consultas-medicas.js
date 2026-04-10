import { PrismaClient } from '@prisma/client';
import { validationResult } from 'express-validator';

const prisma = new PrismaClient();

// ============================================================================
// CREAR CONSULTA NUEVA (vacía, sin turno)
// ============================================================================
export const crearConsultaNueva = async (req, res) => {
  try {
    const { paciente_id, historia_id, turno_id, motivo_consulta } = req.body;
    const medico_id_jwt = req.user?.medicoId || req.user?.id;

    if (!paciente_id) {
      return res.status(400).json({ error: 'Bad request', message: 'paciente_id es requerido' });
    }

    // Buscar la historia por paciente_id para evitar problemas de tipo (UUID vs BigInt)
    const historia = await prisma.historiaClinica.findFirst({
      where: { paciente_id: BigInt(paciente_id) },
      orderBy: { fecha_apertura: 'desc' }
    });

    if (!historia) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Historia clínica no encontrada para este paciente'
      });
    }

    // Si hay turno_id, verificar si ya tiene consulta creada y reutilizarla
    if (turno_id) {
      const consultaExistente = await prisma.consultaMedica.findFirst({
        where: { turno_id: BigInt(turno_id) },
        select: { id: true, historia_clinica_id: true, medico_id: true, fecha: true, motivo_consulta: true, estado_id: true }
      });
      if (consultaExistente) {
        console.log(`♻️ Reutilizando consulta existente para turno ${turno_id}`);
        return res.status(200).json({
          success: true,
          message: 'Consulta ya existente',
          data: {
            id: consultaExistente.id.toString(),
            historia_clinica_id: consultaExistente.historia_clinica_id.toString(),
            medico_id: consultaExistente.medico_id.toString(),
            fecha: consultaExistente.fecha,
            motivo_consulta: consultaExistente.motivo_consulta,
            estado_id: consultaExistente.estado_id.toString()
          }
        });
      }
    }

    // Obtener estado EN_CONSULTA
    const estadoEnConsulta = await prisma.estadoConsulta.findFirst({
      where: { nombre: 'EN_CONSULTA' }
    });

    // Crear la consulta nueva usando el id real de la historia (sea BigInt o UUID)
    const consulta = await prisma.consultaMedica.create({
      data: {
        historia_clinica_id: historia.id,
        medico_id: BigInt(medico_id_jwt),
        turno_id: turno_id ? BigInt(turno_id) : null,
        fecha: new Date(),
        motivo_consulta: motivo_consulta || 'Por especificar',
        estado_id: estadoEnConsulta?.id || 3n,
        resumen: null
      },
      select: {
        id: true,
        historia_clinica_id: true,
        medico_id: true,
        fecha: true,
        motivo_consulta: true,
        estado_id: true
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Consulta nueva creada correctamente',
      data: {
        id: consulta.id.toString(),
        historia_clinica_id: consulta.historia_clinica_id.toString(),
        medico_id: consulta.medico_id.toString(),
        fecha: consulta.fecha,
        motivo_consulta: consulta.motivo_consulta,
        estado_id: consulta.estado_id.toString()
      }
    });
  } catch (error) {
    console.error('Error en crearConsultaNueva:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

// ============================================================================
// INICIAR CONSULTA DESDE TURNO (Crea automáticamente Paciente + Historia)
// ============================================================================
export const iniciarConsultaDesdeTurno = async (req, res) => {
  try {
    const { turno_id } = req.params;
    const { motivo_consulta, resumen, observaciones } = req.body;
    const medico_id_jwt = req.user?.medicoId || req.user?.id;

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
// ACTUALIZAR CONSULTA MEDICA - Versión completa con todos los campos
// ============================================================================
export const actualizarConsultaMedicaCompleta = async (req, res) => {
  try {
    const { consulta_id, turno_id, motivo_consulta, anamnesis, antecedentes, resumen, otros_tratamientos, presion_sistolica, presion_diastolica, frecuencia_cardiaca, temperatura, peso, talla, diagnosticos, estudios, tratamientos } = req.body;
    const medico_id_jwt = req.user?.medicoId || req.user?.id;

    if (!consulta_id) {
      return res.status(400).json({
        success: false,
        message: 'consulta_id es requerido'
      });
    }

    // Actualizar la consulta con los campos disponibles
    const updateData = {};
    if (motivo_consulta !== undefined) updateData.motivo_consulta = motivo_consulta;
    if (resumen !== undefined) updateData.resumen = resumen;
    if (otros_tratamientos !== undefined) updateData.otros_tratamientos = otros_tratamientos;

    await prisma.consultaMedica.update({
      where: { id: BigInt(consulta_id) },
      data: updateData
    });

    console.log('✅ Consulta actualizada:', consulta_id);

    // Upsert Anamnesis (crear si no existe, actualizar si existe)
    if (anamnesis !== undefined) {
      const anamnesisExistente = await prisma.anamnesis.findUnique({
        where: { consulta_id: BigInt(consulta_id) }
      });
      if (anamnesisExistente) {
        await prisma.anamnesis.update({
          where: { consulta_id: BigInt(consulta_id) },
          data: { enfermedad_actual: anamnesis }
        });
      } else if (anamnesis.trim()) {
        await prisma.anamnesis.create({
          data: { consulta_id: BigInt(consulta_id), enfermedad_actual: anamnesis }
        });
      }
      console.log('✅ Anamnesis guardada');
    }

    // Guardar Antecedentes (en la historia clínica)
    if (antecedentes !== undefined && antecedentes.trim()) {
      // Obtener historia_id de la consulta
      const consulta = await prisma.consultaMedica.findUnique({
        where: { id: BigInt(consulta_id) },
        select: { historia_clinica_id: true }
      });
      if (consulta) {
        // Buscar antecedente PERSONAL existente para esta historia
        const antExistente = await prisma.antecedente.findFirst({
          where: { historia_clinica_id: consulta.historia_clinica_id, tipo: 'PERSONAL' }
        });
        if (antExistente) {
          await prisma.antecedente.update({
            where: { id: antExistente.id },
            data: { descripcion: antecedentes }
          });
        } else {
          await prisma.antecedente.create({
            data: { historia_clinica_id: consulta.historia_clinica_id, tipo: 'PERSONAL', descripcion: antecedentes }
          });
        }
        console.log('✅ Antecedentes guardados');
      }
    }

    // Actualizar Signos Vitales
    if (presion_sistolica || presion_diastolica || frecuencia_cardiaca || temperatura || peso || talla) {
      const signoVitalData = {};
      if (presion_sistolica) signoVitalData.presion_sistolica = parseInt(presion_sistolica);
      if (presion_diastolica) signoVitalData.presion_diastolica = parseInt(presion_diastolica);
      if (frecuencia_cardiaca) signoVitalData.frecuencia_cardiaca = parseInt(frecuencia_cardiaca);
      if (temperatura) signoVitalData.temperatura_c = parseFloat(temperatura);
      if (peso) signoVitalData.peso_kg = parseFloat(peso);
      if (talla) signoVitalData.talla_cm = parseFloat(talla);

      const signosExistentes = await prisma.signoVital.findFirst({
        where: { consulta_id: BigInt(consulta_id) }
      });

      if (signosExistentes) {
        await prisma.signoVital.update({
          where: { id: signosExistentes.id },
          data: signoVitalData
        });
      } else {
        await prisma.signoVital.create({
          data: { consulta_id: BigInt(consulta_id), ...signoVitalData }
        });
      }
      console.log('✅ Signos vitales actualizados');
    }

    // Guardar Diagnósticos (reemplazar todos los actuales)
    if (Array.isArray(diagnosticos)) {
      // Borrar diagnósticos existentes de esta consulta
      await prisma.diagnostico.deleteMany({ where: { consulta_id: BigInt(consulta_id) } });
      // Insertar nuevos
      if (diagnosticos.length > 0) {
        await prisma.diagnostico.createMany({
          data: diagnosticos.map((d, idx) => ({
            consulta_id: BigInt(consulta_id),
            codigo_cie10: d.codigo || null,
            descripcion: d.descripcion || '',
            principal: idx === 0 // El primero es el principal
          }))
        });
      }
      console.log(`✅ Diagnósticos guardados: ${diagnosticos.length}`);
    }

    // Guardar Estudios Complementarios (reemplazar todos los actuales)
    if (Array.isArray(estudios)) {
      await prisma.estudioComplementario.deleteMany({ where: { consulta_id: BigInt(consulta_id) } });
      if (estudios.length > 0) {
        await prisma.estudioComplementario.createMany({
          data: estudios.map(e => ({
            consulta_id: BigInt(consulta_id),
            tipo_estudio: e.tipo_estudio || '',
            resultado: e.resultado || null,
            observaciones: e.observaciones || null,
            medico_id: BigInt(medico_id_jwt),
            fecha_estudio: e.fecha_estudio ? new Date(e.fecha_estudio) : new Date()
          }))
        });
      }
      console.log(`✅ Estudios guardados: ${estudios.length}`);
    }

    // Guardar Tratamientos (reemplazar todos los actuales)
    if (Array.isArray(tratamientos) && tratamientos.length > 0) {
      await prisma.tratamiento.deleteMany({ where: { consulta_id: BigInt(consulta_id) } });
      await prisma.tratamiento.createMany({
        data: tratamientos.map(t => ({
          consulta_id: BigInt(consulta_id),
          medicamento: t.medicamento || '',
          dosis: t.dosis || null,
          frecuencia: t.frecuencia || null,
          duracion_dias: t.duracion_dias || null,
          indicaciones: t.indicaciones || null
        }))
      });
      console.log(`✅ Tratamientos guardados: ${tratamientos.length}`);
    }

    // Finalizar turno automáticamente si está EN_CONSULTA
    let turnoFinalizado = false;
    if (turno_id) {
      try {
        const estadoEnConsulta = await prisma.estadoTurno.findFirst({ where: { nombre: 'EN_CONSULTA' } });
        const estadoFinalizada = await prisma.estadoTurno.findFirst({ where: { nombre: 'FINALIZADA' } });

        if (estadoEnConsulta && estadoFinalizada) {
          const turno = await prisma.turno.findUnique({
            where: { id: BigInt(turno_id) },
            select: { id: true, estado_id: true }
          });

          if (turno && turno.estado_id === estadoEnConsulta.id) {
            await prisma.turno.update({
              where: { id: BigInt(turno_id) },
              data: { estado_id: estadoFinalizada.id }
            });
            turnoFinalizado = true;
            console.log(`✅ Turno ${turno_id} finalizado automáticamente`);
          }
        }
      } catch (err) {
        console.error('⚠️ Error al finalizar turno:', err.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Consulta actualizada correctamente',
      turno_finalizado: turnoFinalizado
    });
  } catch (error) {
    console.error('Error en actualizarConsultaMedicaCompleta:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar consulta',
      error: error.message
    });
  }
};

// ============================================================================
// ACTUALIZAR CONSULTA MEDICA - Versión original
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
