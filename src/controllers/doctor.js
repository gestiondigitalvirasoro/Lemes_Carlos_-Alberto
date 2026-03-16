import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /doctor/dashboard
 * Dashboard clínico del doctor - Turnos del día, siguiente paciente, agenda
 */
export const getDashboard = async (req, res) => {
  try {
    const medicoId = BigInt(req.user.id);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const mañana = new Date(hoy);
    mañana.setDate(mañana.getDate() + 1);

    // Turnos del día del doctor
    const turnosHoy = await prisma.turno.findMany({
      where: {
        medico_id: medicoId,
        fecha: {
          gte: hoy,
          lt: mañana
        }
      },
      include: {
        paciente: {
          include: {
            persona: {
              select: {
                nombre: true,
                apellido: true,
                dni: true,
                telefono: true
              }
            }
          }
        },
        estado: {
          select: {
            id: true,
            nombre: true,
            descripcion: true
          }
        },
        consulta: {
          select: {
            id: true,
            motivo_consulta: true,
            estado: {
              select: {
                id: true,
                nombre: true,
                descripcion: true
              }
            }
          }
        }
      },
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }]
    });

    // Siguiente paciente - Prioridad: PENDIENTE/CONFIRMADO primero, luego EN_CONSULTA
    // Si hay un turno EN_CONSULTA, NO lo mostrar como "próximo", mostrar el siguiente
    let siguientePaciente = null;

    // 1️⃣ Buscar primero un turno CONFIRMADO (el que viene después de los que están siendo atendidos)
    const siguientePendienteQuery = await prisma.turno.findFirst({
      where: {
        medico_id: medicoId,
        fecha: {
          gte: hoy
        },
        estado: {
          nombre: 'CONFIRMADO'
        }
      },
      include: {
        paciente: {
          include: {
            persona: {
              select: {
                nombre: true,
                apellido: true,
                dni: true,
                telefono: true,
                fecha_nacimiento: true
              }
            }
          }
        },
        estado: {
          select: {
            id: true,
            nombre: true,
            descripcion: true
          }
        }
      },
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
      take: 1
    });

    // 2️⃣ Si no hay PENDIENTE/CONFIRMADO, mostrar el que está EN_CONSULTA
    if (siguientePendienteQuery) {
      siguientePaciente = siguientePendienteQuery;
    } else {
      const siguienteEnConsultaQuery = await prisma.turno.findFirst({
        where: {
          medico_id: medicoId,
          fecha: {
            gte: hoy
          },
          estado: {
            nombre: 'EN_CONSULTA'
          }
        },
        include: {
          paciente: {
            include: {
              persona: {
                select: {
                  nombre: true,
                  apellido: true,
                  dni: true,
                  telefono: true,
                  fecha_nacimiento: true
                }
              }
            }
          },
          estado: {
            select: {
              id: true,
              nombre: true,
              descripcion: true
            }
          }
        },
        orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
        take: 1
      });

      if (siguienteEnConsultaQuery) {
        siguientePaciente = siguienteEnConsultaQuery;
      }
    }

    // Función para calcular edad
    const calcularEdad = (fechaNacimiento) => {
      if (!fechaNacimiento) return '-';
      const hoy = new Date();
      let edad = hoy.getFullYear() - fechaNacimiento.getFullYear();
      const mes = hoy.getMonth() - fechaNacimiento.getMonth();
      if (mes < 0 || (mes === 0 && hoy.getDate() < fechaNacimiento.getDate())) {
        edad--;
      }
      return edad;
    };

    // Formatear datos
    const datos = {
      turnosHoy: turnosHoy.length,
      siguientePaciente: siguientePaciente ? {
        id: siguientePaciente.id.toString(),
        fecha: siguientePaciente.fecha.toLocaleDateString('es-AR'),
        hora: siguientePaciente.hora,
        estado: {
          id: siguientePaciente.estado.id.toString(),
          nombre: siguientePaciente.estado.nombre,
          descripcion: siguientePaciente.estado.descripcion
        },
        observaciones: siguientePaciente.observaciones,
        paciente: {
          id: siguientePaciente.paciente.id.toString(),
          nombre: siguientePaciente.paciente.persona.nombre,
          apellido: siguientePaciente.paciente.persona.apellido,
          dni: siguientePaciente.paciente.persona.dni,
          telefono: siguientePaciente.paciente.persona.telefono,
          edad: calcularEdad(siguientePaciente.paciente.persona.fecha_nacimiento)
        }
      } : null,
      // Contar turnos por estado (procesar en memoria)
      turnosPendientes: turnosHoy.filter(t => t.estado.nombre === 'PENDIENTE').length,
      turnosConfirmados: turnosHoy.filter(t => t.estado.nombre === 'CONFIRMADO').length,
      turnosEnConsulta: turnosHoy.filter(t => t.estado.nombre === 'EN_CONSULTA').length,
      turnosAtendidos: turnosHoy.filter(t => t.estado.nombre === 'COMPLETA').length,
      agenda: turnosHoy.map(t => ({
        id: t.id.toString(),
        fecha: t.fecha.toLocaleDateString('es-AR'),
        hora: t.hora,
        estado: {
          id: t.estado.id.toString(),
          nombre: t.estado.nombre,
          descripcion: t.estado.descripcion
        },
        paciente: {
          id: t.paciente.id.toString(),
          nombre: t.paciente.persona.nombre,
          apellido: t.paciente.persona.apellido,
          dni: t.paciente.persona.dni,
          telefono: t.paciente.persona.telefono
        },
        consulta: t.consulta ? {
          id: t.consulta.id.toString(),
          motivo: t.consulta.motivo_consulta,
          estado: {
            id: t.consulta.estado.id.toString(),
            nombre: t.consulta.estado.nombre,
            descripcion: t.consulta.estado.descripcion
          }
        } : null
      }))
    };

    return res.status(200).json({
      success: true,
      data: datos
    });
  } catch (error) {
    console.error('Error en getDashboard:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener dashboard'
    });
  }
};

/**
 * GET /doctor/paciente/:pacienteId/historia
 * Historia clínica completa del paciente
 */
export const getHistoriaClinica = async (req, res) => {
  try {
    const { pacienteId } = req.params;
    const doctorId = BigInt(req.user.id);

    const paciente = await prisma.paciente.findUnique({
      where: { id: BigInt(pacienteId) },
      include: {
        usuario: {
          select: {
            nombre: true,
            apellido: true,
            email: true,
            telefono: true
          }
        },
        historias_clinicas: {
          include: {
            documentos: true,
            antecedentes: true,
            consultas: {
              include: {
                signos_vitales: {
                  orderBy: { fecha_registro: 'desc' }
                },
                diagnosticos: true,
                estudios: true
              },
              orderBy: { fecha: 'desc' }
            }
          },
          orderBy: { fecha_apertura: 'desc' }
        }
      }
    });

    if (!paciente) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Paciente no encontrado'
      });
    }

    // Calcular edad
    let edad = null;
    if (paciente.fecha_nacimiento) {
      const hoy = new Date();
      edad = hoy.getFullYear() - paciente.fecha_nacimiento.getFullYear();
      const mes = hoy.getMonth() - paciente.fecha_nacimiento.getMonth();
      if (mes < 0 || (mes === 0 && hoy.getDate() < paciente.fecha_nacimiento.getDate())) {
        edad--;
      }
    }

    // Obtener la historia clínica más reciente
    const historiaReciente = paciente.historias_clinicas[0] || null;
    
    // Obtener antecedentes de tipo PERSONAL de la historia
    const antecedentePersonal = historiaReciente?.antecedentes?.find(a => a.tipo === 'PERSONAL');
    
    // Obtener las consultas más recientes de la historia actual
    const consultasRecientes = historiaReciente?.consultas || [];
    const consultaReciente = consultasRecientes[0] || null;

    return res.status(200).json({
      success: true,
      data: {
        paciente: {
          id: paciente.id,
          nombre: paciente.usuario?.nombre || 'N/A',
          apellido: paciente.usuario?.apellido || 'N/A',
          email: paciente.usuario?.email || '',
          telefono: paciente.usuario?.telefono || '',
          dni: paciente.dni,
          edad,
          genero: paciente.genero,
          numero_historia_clinica: paciente.numero_historia_clinica,
          alergias: paciente.alergias,
          patologias_cronicas: paciente.patologias_cronicas,
          contacto_emergencia: paciente.contacto_emergencia
        },
        historia_actual: historiaReciente ? {
          id: historiaReciente.id,
          fecha_apertura: historiaReciente.fecha_apertura,
          antecedentes: antecedentePersonal?.descripcion || '',
          documentos: historiaReciente.documentos,
          consulta_mas_reciente: consultaReciente ? {
            id: consultaReciente.id,
            fecha: consultaReciente.fecha,
            motivo_consulta: consultaReciente.motivo_consulta,
            resumen: consultaReciente.resumen,
            anamnesis: consultaReciente.anamnesis?.enfermedad_actual,
            diagnosticos: consultaReciente.diagnosticos || [],
            signos_vitales: consultaReciente.signos_vitales || [],
            estudios: consultaReciente.estudios || []
          } : null,
          todas_consultas: consultasRecientes.length
        } : null,
        historial_completo: paciente.historias_clinicas.map(h => ({
          id: h.id,
          fecha_apertura: h.fecha_apertura,
          total_consultas: h.consultas?.length || 0
        }))
      }
    });
  } catch (error) {
    console.error('Error en getHistoriaClinica:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener historia clínica'
    });
  }
};

/**
 * POST /doctor/consulta/iniciar
 * Iniciar consulta - Marcar turno como "en_consulta"
 */
export const iniciarConsulta = async (req, res) => {
  try {
    const { turnoId } = req.body;
    const doctorId = BigInt(req.user.id);

    const turno = await prisma.turno.update({
      where: { id: BigInt(turnoId) },
      data: {
        estado: 'en_consulta',
        updated_at: new Date()
      },
      include: {
        paciente: {
          select: {
            usuario: {
              select: {
                nombre: true,
                apellido: true
              }
            }
          }
        }
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Consulta iniciada',
      data: turno
    });
  } catch (error) {
    console.error('Error en iniciarConsulta:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al iniciar consulta'
    });
  }
};

/**
 * POST /doctor/consulta/finalizar
 * Finalizar consulta - Crear historia clínica
 */
export const finalizarConsulta = async (req, res) => {
  try {
    const {
      turnoId,
      pacienteId,
      motivo,
      anamnesis,
      examen_fisico,
      diagnostico,
      medicamentos,
      observaciones,
      signos_vitales
    } = req.body;

    const doctorId = BigInt(req.user.id);

    // Actualizar turno a "atendido"
    await prisma.turno.update({
      where: { id: BigInt(turnoId) },
      data: {
        estado: 'atendido',
        updated_at: new Date()
      }
    });

    // Crear historia clínica
    const historia = await prisma.historiaClinica.create({
      data: {
        paciente_id: BigInt(pacienteId),
        doctor_id: doctorId,
        turno_id: BigInt(turnoId),
        motivo_consulta: motivo,
        anamnesis,
        examen_fisico,
        diagnostico,
        medicamentos,
        observaciones,
        signos_vitales: signos_vitales ? JSON.stringify(signos_vitales) : null
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Consulta finalizada',
      data: historia
    });
  } catch (error) {
    console.error('Error en finalizarConsulta:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al finalizar consulta'
    });
  }
};

/**
 * POST /doctor/signos-vitales
 * Registrar signos vitales - Con cálculo automático de IMC y guardado en BD
 */
export const registrarSignosVitales = async (req, res) => {
  try {
    const {
      historia_clinica_id,
      peso,
      talla,
      presion_sistolica,
      presion_diastolica,
      frecuencia_cardiaca,
      temperatura,
      glucemia,
      circunferencia_abdominal,
      observaciones
    } = req.body;

    console.log('📊 Datos recibidos en registrarSignosVitales:');
    console.log('   - historia_clinica_id:', historia_clinica_id, typeof historia_clinica_id);
    console.log('   - peso:', peso, typeof peso);
    console.log('   - talla:', talla, typeof talla);
    console.log('   - presion_sistolica:', presion_sistolica, typeof presion_sistolica);
    console.log('   - presion_diastolica:', presion_diastolica, typeof presion_diastolica);
    console.log('   - frecuencia_cardiaca:', frecuencia_cardiaca, typeof frecuencia_cardiaca);
    console.log('   - temperatura:', temperatura, typeof temperatura);
    console.log('   - glucemia:', glucemia, typeof glucemia);
    console.log('   - req.body completo:', req.body);

    // Validar que exista historia_clinica_id
    if (!historia_clinica_id) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Se requiere historia_clinica_id'
      });
    }

    // Validar y convertir datos de forma segura
    const peso_kg = peso ? parseFloat(peso) : null;
    const talla_cm = talla ? parseFloat(talla) : null;
    const presion_sist = presion_sistolica ? parseInt(presion_sistolica) : null;
    const presion_diast = presion_diastolica ? parseInt(presion_diastolica) : null;
    const frec_cardiaca = frecuencia_cardiaca ? parseInt(frecuencia_cardiaca) : null;
    const temp = temperatura ? parseFloat(temperatura) : null;
    const glucem = glucemia ? parseInt(glucemia) : null;

    // Validar que al menos un campo tenga contenido
    const tieneContenido = peso_kg || talla_cm || presion_sist || presion_diast || frec_cardiaca || temp || glucem || circunferencia_abdominal;
    
    if (!tieneContenido) {
      console.log('⚠️ Advertencia: Se intentó guardar signos vitales sin datos');
      return res.status(400).json({
        error: 'Bad request',
        message: 'Debes proporcionar al menos un dato de signos vitales'
      });
    }

    // Calcular IMC si hay peso y talla
    let imc = null;
    if (peso_kg && talla_cm && talla_cm > 0) {
      const talla_m = talla_cm / 100;
      imc = parseFloat((peso_kg / (talla_m * talla_m)).toFixed(2));
    }

    console.log('✅ Datos convertidos:', {
      historia_clinica_id,
      peso_kg,
      talla_cm,
      imc,
      presion_sistolica: presion_sist,
      presion_diastolica: presion_diast,
      frecuencia_cardiaca: frec_cardiaca,
      temperatura_c: temp,
      glucemia_mg_dl: glucem
    });

    // PASO 1: Obtener o crear ConsultaMedica para esta Historia Clínica
    let consulta = await prisma.consultaMedica.findFirst({
      where: { historia_clinica_id: BigInt(historia_clinica_id) },
      orderBy: { fecha: 'desc' }
    });

    if (!consulta) {
      console.log('📋 Creando ConsultaMedica para Historia...');
      // Obtener la Historia para saber el medico
      const historia = await prisma.historiaClinica.findUnique({
        where: { id: BigInt(historia_clinica_id) }
      });

      if (!historia) {
        return res.status(404).json({
          error: 'Not found',
          message: 'Historia clínica no encontrada'
        });
      }

      // Crear una ConsultaMedica
      consulta = await prisma.consultaMedica.create({
        data: {
          historia_clinica_id: BigInt(historia_clinica_id),
          medico_id: historia.medico_id,
          fecha: new Date(),
          motivo_consulta: 'Consulta de registro de signos vitales',
          resumen: 'Registro de signos vitales durante la consulta',
          estado_id: BigInt(2) // EN_CONSULTA
        }
      });
      console.log('✅ ConsultaMedica creada:', consulta.id);
    }

    // PASO 2: Verificar si ya existen signos vitales para esta consulta
    const signoExistente = await prisma.signoVital.findFirst({
      where: { consulta_id: consulta.id }
    });

    let signosVitales;
    if (signoExistente) {
      console.log('📝 Actualizando signos vitales existentes...');
      signosVitales = await prisma.signoVital.update({
        where: { id: signoExistente.id },
        data: {
          peso_kg: peso_kg !== null ? peso_kg : signoExistente.peso_kg,
          talla_cm: talla_cm !== null ? talla_cm : signoExistente.talla_cm,
          imc: imc !== null ? imc : signoExistente.imc,
          presion_sistolica: presion_sist !== null ? presion_sist : signoExistente.presion_sistolica,
          presion_diastolica: presion_diast !== null ? presion_diast : signoExistente.presion_diastolica,
          frecuencia_cardiaca: frec_cardiaca !== null ? frec_cardiaca : signoExistente.frecuencia_cardiaca,
          temperatura_c: temp !== null ? temp : signoExistente.temperatura_c,
          glucemia_mg_dl: glucem !== null ? glucem : signoExistente.glucemia_mg_dl,
          circunferencia_abd_cm: circunferencia_abdominal ? parseFloat(circunferencia_abdominal) : signoExistente.circunferencia_abd_cm
        }
      });
    } else {
      console.log('➕ Creando nuevos signos vitales...');
      // Guardar signos vitales en base de datos
      signosVitales = await prisma.signoVital.create({
        data: {
          consulta_id: consulta.id,
          peso_kg,
          talla_cm,
          imc,
          presion_sistolica: presion_sist,
          presion_diastolica: presion_diast,
          frecuencia_cardiaca: frec_cardiaca,
          temperatura_c: temp,
          glucemia_mg_dl: glucem,
          circunferencia_abd_cm: circunferencia_abdominal ? parseFloat(circunferencia_abdominal) : null
        }
      });
    }

    console.log('✅ Signos vitales guardados:', signosVitales);

    return res.status(201).json({
      success: true,
      message: signoExistente ? 'Signos vitales actualizados correctamente' : 'Signos vitales registrados correctamente',
      data: {
        id: signosVitales.id.toString(),
        peso: peso_kg,
        talla: talla_cm,
        imc,
        presion: presion_sist && presion_diast ? `${presion_sist}/${presion_diast}` : 'N/A',
        frecuencia_cardiaca: frec_cardiaca,
        temperatura: temp,
        glucemia: glucem
      }
    });
  } catch (error) {
    console.error('❌ Error en registrarSignosVitales:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al registrar signos vitales',
      details: error.message
    });
  }
};

/**
 * PUT /api/doctor/consulta/actualizar
 * Actualizar datos de CONSULTA_MEDICA (motivo, resumen, anamnesis)
 * Si no existe CONSULTA, la crea automáticamente
 * Esta es la función correcta para guardar datos de consulta, NO en historia_clinica
 */
export const actualizarConsultaMedica = async (req, res) => {
  try {
    const {
      historia_clinica_id,
      motivo_consulta,
      resumen,
      anamnesis_texto,
      antecedentes
    } = req.body;

    console.log('📝 actualizarConsultaMedica() - Datos recibidos:');
    console.log('   historia_clinica_id:', historia_clinica_id);
    console.log('   motivo_consulta:', motivo_consulta);
    console.log('   resumen:', resumen);
    console.log('   anamnesis_texto:', anamnesis_texto);
    console.log('   antecedentes:', antecedentes);

    if (!historia_clinica_id) {
      return res.status(400).json({
        success: false,
        message: 'historia_clinica_id es requerido'
      });
    }

    // 1️⃣ Obtener la ÚLTIMA CONSULTA de esta historia clínica
    let consultaActual = await prisma.consultaMedica.findFirst({
      where: {
        historia_clinica_id: BigInt(historia_clinica_id)
      },
      orderBy: {
        fecha: 'desc'
      }
    });

    // 2️⃣ Si NO existe, CREAR una nueva CONSULTA_MEDICA
    if (!consultaActual) {
      console.log('⚠️ No hay consulta para esta historia. Creando nueva consulta...');
      
      // Obtener la historia para obtener el medico_id
      const historia = await prisma.historiaClinica.findUnique({
        where: { id: BigInt(historia_clinica_id) }
      });

      if (!historia) {
        return res.status(404).json({
          success: false,
          message: 'Historia clínica no encontrada'
        });
      }

      // Crear nueva CONSULTA_MEDICA
      consultaActual = await prisma.consultaMedica.create({
        data: {
          historia_clinica_id: BigInt(historia_clinica_id),
          medico_id: historia.creada_por_medico_id,
          motivo_consulta: motivo_consulta || 'Consulta sin motivo especificado',
          resumen: resumen || '',
          fecha: new Date()
        }
      });
      console.log('✅ Nueva ConsultaMedica creada:', consultaActual.id);
    } else {
      // 3️⃣ Si SÍ existe, ACTUALIZAR la CONSULTA_MEDICA
      consultaActual = await prisma.consultaMedica.update({
        where: { id: consultaActual.id },
        data: {
          ...(motivo_consulta && { motivo_consulta }),
          ...(resumen && { resumen }),
          fecha: new Date()
        }
      });
      console.log('✅ ConsultaMedica actualizada:', consultaActual.id);
    }

    // 4️⃣ Si hay anamnesis, actualizar o crear el registro
    if (anamnesis_texto) {
      const anamnesisExistente = await prisma.anamnesis.findFirst({
        where: { consulta_id: consultaActual.id }
      });

      if (anamnesisExistente) {
        await prisma.anamnesis.update({
          where: { id: anamnesisExistente.id },
          data: {
            enfermedad_actual: anamnesis_texto
          }
        });
        console.log('✅ Anamnesis actualizada');
      } else {
        await prisma.anamnesis.create({
          data: {
            consulta_id: consultaActual.id,
            enfermedad_actual: anamnesis_texto
          }
        });
        console.log('✅ Anamnesis creada');
      }
    }

    // 5️⃣ Si hay antecedentes, crear/actualizar en tabla ANTECEDENTE
    if (antecedentes) {
      // Buscar si existe un antecedente de tipo PERSONAL
      const antecedenteExistente = await prisma.antecedente.findFirst({
        where: {
          historia_clinica_id: BigInt(historia_clinica_id),
          tipo: 'PERSONAL'
        }
      });

      if (antecedenteExistente) {
        // Actualizar existente
        await prisma.antecedente.update({
          where: { id: antecedenteExistente.id },
          data: {
            descripcion: antecedentes
          }
        });
        console.log('✅ Antecedentes actualizado');
      } else {
        // Crear nuevo
        await prisma.antecedente.create({
          data: {
            historia_clinica_id: BigInt(historia_clinica_id),
            tipo: 'PERSONAL',
            descripcion: antecedentes
          }
        });
        console.log('✅ Antecedentes creado');
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Consulta médica actualizada correctamente',
      data: {
        id: consultaActual.id.toString(),
        motivo_consulta: consultaActual.motivo_consulta,
        resumen: consultaActual.resumen,
        fecha: consultaActual.fecha
      }
    });
  } catch (error) {
    console.error('❌ Error en actualizarConsultaMedica:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar la consulta médica',
      error: error.message
    });
  }
};

/**
 * POST /api/doctor/estudios
 * Crear estudio complementario para una consulta
 */
export const crearEstudio = async (req, res) => {
  try {
    const medico_id = BigInt(req.user.medicoId);
    const {
      historia_clinica_id,
      tipo_estudio,
      resultado,
      observaciones
    } = req.body;

    if (!historia_clinica_id || !tipo_estudio) {
      return res.status(400).json({
        success: false,
        message: 'Historia clínica e tipo de estudio son obligatorios'
      });
    }

    // Crear estudio directamente ligado a la historia clínica
    const estudio = await prisma.estudioComplementario.create({
      data: {
        historia_clinica_id: BigInt(historia_clinica_id),
        tipo_estudio,
        resultado: resultado || null,
        observaciones: observaciones || null,
        medico_id,
        fecha_estudio: new Date()
      }
    });

    console.log('✅ Estudio complementario creado:', estudio.id);

    return res.status(201).json({
      success: true,
      message: 'Estudio registrado correctamente',
      data: {
        id: estudio.id.toString(),
        tipo_estudio: estudio.tipo_estudio,
        resultado: estudio.resultado,
        observaciones: estudio.observaciones,
        fecha_estudio: estudio.fecha_estudio
      }
    });
  } catch (error) {
    console.error('❌ Error al crear estudio:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al registrar estudio',
      error: error.message
    });
  }
};

/**
 * GET /doctor/proximas-citas/:pacienteId
 * Próximas citas pendientes del paciente
 */
export const getProximasCitas = async (req, res) => {
  try {
    const { pacienteId } = req.params;

    // Obtener persona del paciente
    const paciente = await prisma.paciente.findUnique({
      where: { id: BigInt(pacienteId) },
      select: { persona_id: true }
    });

    if (!paciente) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Paciente no encontrado'
      });
    }

    const ahora = new Date();
    const citas = await prisma.turno.findMany({
      where: {
        persona_id: paciente.persona_id,
        fecha: {
          gte: ahora
        }
      },
      include: {
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
            nombre: true,
            descripcion: true
          }
        }
      },
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
      take: 5
    });

    // Filtrar solo turnos con estado pendiente o confirmado
    const citasFiltradas = citas.filter(c => ['PENDIENTE', 'CONFIRMADO'].includes(c.estado.nombre));

    return res.status(200).json({
      success: true,
      data: citasFiltradas.map(c => ({
        id: c.id.toString(),
        fecha: c.fecha.toLocaleDateString('es-AR'),
        hora: c.hora,
        estado: {
          id: c.estado.id.toString(),
          nombre: c.estado.nombre,
          descripcion: c.estado.descripcion
        },
        medico: {
          id: c.medico.id.toString(),
          nombre: c.medico.nombre,
          apellido: c.medico.apellido,
          especialidad: c.medico.especialidad
        }
      }))
    });
  } catch (error) {
    console.error('Error en getProximasCitas:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener próximas citas'
    });
  }
};

/**
 * GET /doctor/historial-consultas/:pacienteId
 * Historial de consultas anteriores
 */
export const getHistorialConsultas = async (req, res) => {
  try {
    const { pacienteId } = req.params;

    const consultas = await prisma.consultaMedica.findMany({
      where: {
        historia_clinica: {
          paciente_id: BigInt(pacienteId)
        }
      },
      include: {
        historia_clinica: {
          select: {
            id: true,
            fecha_apertura: true,
            activa: true
          }
        },
        turno: {
          select: {
            id: true,
            fecha: true,
            hora: true,
            estado: {
              select: {
                nombre: true,
                descripcion: true
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
        },
        estado: {
          select: {
            nombre: true,
            descripcion: true
          }
        }
      },
      orderBy: { fecha: 'desc' }
    });

    return res.status(200).json({
      success: true,
      data: consultas.map(c => ({
        id: c.id.toString(),
        fecha: c.fecha,
        motivo_consulta: c.motivo_consulta,
        resumen: c.resumen,
        estado: {
          nombre: c.estado.nombre,
          descripcion: c.estado.descripcion
        },
        medico: {
          id: c.medico.id.toString(),
          nombre: c.medico.nombre,
          apellido: c.medico.apellido,
          especialidad: c.medico.especialidad
        },
        turno: c.turno ? {
          id: c.turno.id.toString(),
          fecha: c.turno.fecha,
          hora: c.turno.hora,
          estado: {
            nombre: c.turno.estado.nombre,
            descripcion: c.turno.estado.descripcion
          }
        } : null,
        historia_clinica: {
          id: c.historia_clinica.id.toString(),
          fecha_apertura: c.historia_clinica.fecha_apertura,
          activa: c.historia_clinica.activa
        }
      }))
    });
  } catch (error) {
    console.error('Error en getHistorialConsultas:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener historial'
    });
  }
};

/**
 * GET /doctor/graficos/evolucion/:pacienteId
 * Datos para gráficos de evolución (peso, glucemia, TA, IMC)
 */
export const getGraficosEvolucion = async (req, res) => {
  try {
    const { pacienteId } = req.params;

    // Obtener todos los signos vitales ordenados por fecha
    const signosVitales = await prisma.signoVital.findMany({
      where: {
        historia_clinica: {
          paciente_id: BigInt(pacienteId)
        }
      },
      include: {
        historia_clinica: {
          select: {
            fecha: true
          }
        }
      },
      orderBy: {
        created_at: 'asc'
      }
    });

    // Ordenar por fecha de historia clínica
    signosVitales.sort((a, b) => 
      new Date(a.historia_clinica.fecha) - new Date(b.historia_clinica.fecha)
    );

    // Preparar datos para gráficos
    const labels = signosVitales.map(sv => 
      new Date(sv.historia_clinica.fecha).toLocaleDateString('es-AR')
    );

    const dataPeso = signosVitales.map(sv => sv.peso_kg);
    const dataGlucemia = signosVitales.map(sv => sv.glucemia_mg_dl);
    const dataPresionSistolica = signosVitales.map(sv => sv.presion_sistolica);
    const dataPresionDiastolica = signosVitales.map(sv => sv.presion_diastolica);
    const dataIMC = signosVitales.map(sv => sv.imc);
    const dataFC = signosVitales.map(sv => sv.frecuencia_cardiaca);

    return res.status(200).json({
      success: true,
      data: {
        labels,
        datasets: {
          peso: dataPeso,
          glucemia: dataGlucemia,
          presionSistolica: dataPresionSistolica,
          presionDiastolica: dataPresionDiastolica,
          imc: dataIMC,
          frecuenciaCardiaca: dataFC
        },
        signosVitales
      }
    });
  } catch (error) {
    console.error('Error en getGraficosEvolucion:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener datos de gráficos'
    });
  }
};

/**
 * GET /doctor/citas-timeline/:pacienteId
 * Citas próximas formateadas para timeline
 */
export const getCitasTimeline = async (req, res) => {
  try {
    const { pacienteId } = req.params;

    // Obtener persona del paciente
    const paciente = await prisma.paciente.findUnique({
      where: { id: BigInt(pacienteId) },
      select: { persona_id: true }
    });

    if (!paciente) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Paciente no encontrado'
      });
    }

    const ahora = new Date();
    const citas = await prisma.turno.findMany({
      where: {
        persona_id: paciente.persona_id,
        fecha: {
          gte: ahora
        }
      },
      include: {
        medico: {
          select: {
            nombre: true,
            apellido: true,
            especialidad: true
          }
        },
        estado: {
          select: {
            nombre: true,
            descripcion: true
          }
        }
      },
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }]
    });

    const estadoColores = {
      'PENDIENTE': '#FFC107',
      'CONFIRMADO': '#28A745',
      'EN_CONSULTA': '#007BFF',
      'COMPLETA': '#6C757D',
      'CANCELADA': '#DC3545',
      'NO_PRESENTADO': '#FF6B6B'
    };

    const timeline = citas.map(cita => ({
      id: cita.id.toString(),
      fecha: cita.fecha,
      fechaFormato: cita.fecha.toLocaleDateString('es-AR'),
      horaFormato: cita.hora,
      medico: `Dr/Dra. ${cita.medico.nombre} ${cita.medico.apellido}`,
      especialidad: cita.medico.especialidad,
      observaciones: cita.observaciones || 'Sin observaciones',
      estado: cita.estado.nombre,
      descripcionEstado: cita.estado.descripcion,
      estadoColor: estadoColores[cita.estado.nombre] || '#6C757D'
    }));

    return res.status(200).json({
      success: true,
      data: timeline
    });
  } catch (error) {
    console.error('Error en getCitasTimeline:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener timeline de citas'
    });
  }
};

/**
 * POST /doctor/receta/generar
 * Generar receta para descargar
 */
export const generarReceta = async (req, res) => {
  try {
    const { historia_clinica_id, paciente_nombre, medicamentos, observaciones } = req.body;
    const doctorId = BigInt(req.user.id);

    // Obtener datos doctor
    const doctor = await prisma.usuario.findUnique({
      where: { id: doctorId }
    });

    // Generar respuesta con datos para imprimir/generar PDF en cliente
    const receta = {
      titulo: 'RECETA MÉDICA',
      fecha: new Date().toLocaleDateString('es-AR'),
      doctor: `Dr/Dra. ${doctor.nombre} ${doctor.apellido}`,
      especialidad: doctor.especialidad,
      paciente: paciente_nombre,
      medicamentos: medicamentos || [],
      observaciones: observaciones || 'Seguir recomendaciones médicas',
      firma: `Dr/Dra. ${doctor.nombre} ${doctor.apellido}`,
      sello: 'SELLO DIGITAL'
    };

    return res.status(200).json({
      success: true,
      message: 'Receta generada',
      data: receta
    });
  } catch (error) {
    console.error('Error en generarReceta:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al generar receta'
    });
  }
};

/**
 * POST /doctor/orden-medica/generar
 * Generar orden médica para descargar
 */
export const generarOrdenMedica = async (req, res) => {
  try {
    const { 
      historia_clinica_id, 
      paciente_nombre, 
      diagnositco_principal, 
      estudios_solicitados, 
      observaciones 
    } = req.body;
    const doctorId = BigInt(req.user.id);

    const doctor = await prisma.usuario.findUnique({
      where: { id: doctorId }
    });

    const orden = {
      titulo: 'ORDEN MÉDICA',
      numero: `OM-${Date.now()}`,
      fecha: new Date().toLocaleDateString('es-AR'),
      doctor: `Dr/Dra. ${doctor.nombre} ${doctor.apellido}`,
      especialidad: doctor.especialidad,
      paciente: paciente_nombre,
      diagnostico: diagnositco_principal || '',
      estudios: estudios_solicitados || [],
      observaciones: observaciones || 'Realizar estudios en laboratorio acreditado',
      prioridad: 'Rutina',
      firma: `Dr/Dra. ${doctor.nombre} ${doctor.apellido}`
    };

    return res.status(200).json({
      success: true,
      message: 'Orden médica generada',
      data: orden
    });
  } catch (error) {
    console.error('Error en generarOrdenMedica:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al generar orden médica'
    });
  }
};

/**
 * POST /doctor/certificado/generar
 * Generar certificado médico
 */
export const generarCertificado = async (req, res) => {
  try {
    const { 
      historia_clinica_id, 
      paciente_nombre, 
      diagnostico, 
      dias_reposo, 
      observaciones 
    } = req.body;
    const doctorId = BigInt(req.user.id);

    const doctor = await prisma.usuario.findUnique({
      where: { id: doctorId }
    });

    const certificado = {
      titulo: 'CERTIFICADO MÉDICO',
      numero: `CERT-${Date.now()}`,
      fecha: new Date().toLocaleDateString('es-AR'),
      doctor: `Dr/Dra. ${doctor.nombre} ${doctor.apellido}`,
      especialidad: doctor.especialidad,
      paciente: paciente_nombre,
      diagnostico: diagnostico || 'Consulta médica realizada',
      diasReposo: dias_reposo || 0,
      observaciones: observaciones || 'Paciente en condiciones',
      mensaje: `Se certifica que el paciente ${paciente_nombre} ha sido evaluado y se encuentra ${dias_reposo > 0 ? `en reposo por ${dias_reposo} días` : 'apto para actividades'}`,
      firma: `Dr/Dra. ${doctor.nombre} ${doctor.apellido}`,
      sello: 'SELLO DIGITAL'
    };

    return res.status(200).json({
      success: true,
      message: 'Certificado generado',
      data: certificado
    });
  } catch (error) {
    console.error('Error en generarCertificado:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al generar certificado'
    });
  }
};

export default {
  getDashboard,
  getHistoriaClinica,
  iniciarConsulta,
  finalizarConsulta,
  registrarSignosVitales,
  getProximasCitas,
  getHistorialConsultas,
  getGraficosEvolucion,
  getCitasTimeline,
  generarReceta,
  generarOrdenMedica,
  generarCertificado
};
