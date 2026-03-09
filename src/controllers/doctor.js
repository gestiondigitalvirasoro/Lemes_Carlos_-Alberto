import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /doctor/dashboard
 * Dashboard clínico del doctor - Turnos del día, siguiente paciente, agenda
 */
export const getDashboard = async (req, res) => {
  try {
    const medicoId = BigInt(req.usuario.id);
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
        }
      },
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }]
    });

    // Siguiente paciente (PRÓXIMO TURNO CRONOLÓGICAMENTE, sin importar fecha)
    const ahora = new Date();
    const siguientePacienteQuery = await prisma.turno.findFirst({
      where: {
        medico_id: medicoId,
        fecha: {
          gte: hoy
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

    // Filtrar siguiente paciente: solo estados PENDIENTE, CONFIRMADO, EN_CONSULTA
    const siguientePaciente = siguientePacienteQuery && ['PENDIENTE', 'CONFIRMADO', 'EN_CONSULTA'].includes(siguientePacienteQuery.estado.nombre) ? siguientePacienteQuery : null;

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
        }
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
    const doctorId = BigInt(req.usuario.id);

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
            estudios_adjuntos: true,
            signos_vitales: {
              orderBy: { created_at: 'desc' }
            },
            turno: true
          },
          orderBy: { fecha: 'desc' }
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
          fecha: historiaReciente.fecha,
          motivo_consulta: historiaReciente.motivo_consulta,
          anamnesis: historiaReciente.anamnesis,
          antecedentes_patologicos_personales: historiaReciente.antecedentes_patologicos_personales,
          antecedentes_patologicos_familiares: historiaReciente.antecedentes_patologicos_familiares,
          antecedentes_quirurgicos: historiaReciente.antecedentes_quirurgicos,
          habitos: historiaReciente.habitos,
          examen_fisico: historiaReciente.examen_fisico,
          diagnostico_principal: historiaReciente.diagnostico_principal,
          diagnosticos_secundarios: historiaReciente.diagnosticos_secundarios ? 
            JSON.parse(historiaReciente.diagnosticos_secundarios) : [],
          impresion_clinica: historiaReciente.impresion_clinica,
          tratamiento: historiaReciente.tratamiento ? 
            JSON.parse(historiaReciente.tratamiento) : [],
          observaciones: historiaReciente.observaciones,
          signos_vitales: historiaReciente.signos_vitales,
          estudios_adjuntos: historiaReciente.estudios_adjuntos
        } : null,
        historial: paciente.historias_clinicas
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
    const doctorId = BigInt(req.usuario.id);

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

    const doctorId = BigInt(req.usuario.id);

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

    console.log('📊 Datos recibidos:', req.body);

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

    // Verificar si ya existen signos vitales para esta historia
    const signoExistente = await prisma.signoVital.findFirst({
      where: { historia_clinica_id: BigInt(historia_clinica_id) }
    });

    let signosVitales;
    if (signoExistente) {
      console.log('📝 Actualizando signos vitales existentes...');
      signosVitales = await prisma.signoVital.update({
        where: { id: signoExistente.id },
        data: {
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
    } else {
      console.log('➕ Creando nuevos signos vitales...');
      // Guardar signos vitales en base de datos
      signosVitales = await prisma.signoVital.create({
        data: {
          historia_clinica_id: BigInt(historia_clinica_id),
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
    const doctorId = BigInt(req.usuario.id);

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
    const doctorId = BigInt(req.usuario.id);

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
    const doctorId = BigInt(req.usuario.id);

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
