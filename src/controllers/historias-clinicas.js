import { PrismaClient } from '@prisma/client';
import { validationResult } from 'express-validator';

const prisma = new PrismaClient();

// ============================================================================
// CONTROLLER: CREAR HISTORIA CLÍNICA
// ============================================================================
export const crearHistoriaClinica = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      paciente_id,
      doctor_id,
      turno_id,
      diagnostico,
      tratamiento,
      medicamentos,
      antecedentes,
      examen_fisico,
      observaciones,
      peso,
      talla
    } = req.body;

    // Validar que paciente existe
    const paciente = await prisma.paciente.findUnique({
      where: { id: BigInt(paciente_id) }
    });

    if (!paciente) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Paciente no encontrado'
      });
    }

    // Validar que doctor existe
    const doctor = await prisma.usuario.findUnique({
      where: { id: BigInt(doctor_id) },
      select: { id: true, role: true }
    });

    if (!doctor || doctor.role !== 'doctor') {
      return res.status(404).json({
        error: 'Not found',
        message: 'Doctor no encontrado o no es doctor'
      });
    }

    // Validar turno si se proporciona
    if (turno_id) {
      const turno = await prisma.turno.findUnique({
        where: { id: BigInt(turno_id) }
      });

      if (!turno) {
        return res.status(404).json({
          error: 'Not found',
          message: 'Turno no encontrado'
        });
      }
    }

    // Calcular IMC si se proporcionan peso y talla
    let imc = null;
    if (peso && talla) {
      const tallaEnMetros = talla / 100; // Asumir talla en cm
      imc = (peso / (tallaEnMetros * tallaEnMetros)).toFixed(2);
    }

    const historiaClinica = await prisma.historiaClinica.create({
      data: {
        paciente_id: BigInt(paciente_id),
        doctor_id: BigInt(doctor_id),
        turno_id: turno_id ? BigInt(turno_id) : null,
        diagnostico,
        tratamiento,
        medicamentos,
        antecedentes,
        examen_fisico,
        observaciones
      },
      select: {
        id: true,
        paciente_id: true,
        doctor_id: true,
        turno_id: true,
        fecha: true,
        diagnostico: true,
        tratamiento: true,
        medicamentos: true,
        antecedentes: true,
        examen_fisico: true,
        observaciones: true,
        created_at: true,
        updated_at: true
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Historia clínica creada exitosamente',
      data: {
        ...historiaClinica,
        id: historiaClinica.id.toString(),
        paciente_id: historiaClinica.paciente_id.toString(),
        doctor_id: historiaClinica.doctor_id.toString(),
        turno_id: historiaClinica.turno_id?.toString() || null,
        imc: imc
      }
    });
  } catch (error) {
    console.error('Error al crear historia clínica:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al crear la historia clínica'
    });
  }
};

// ============================================================================
// CONTROLLER: OBTENER HISTORIAS CLÍNICAS
// ============================================================================
export const obtenerHistoriasClinicas = async (req, res) => {
  try {
    const { skip = 0, take = 10, paciente_id, doctor_id, fecha_desde, fecha_hasta } = req.query;

    const where = {};

    if (paciente_id) {
      where.paciente_id = BigInt(paciente_id);
    }

    if (doctor_id) {
      where.doctor_id = BigInt(doctor_id);
    }

    if (fecha_desde || fecha_hasta) {
      where.fecha = {};
      if (fecha_desde) {
        where.fecha.gte = new Date(fecha_desde);
      }
      if (fecha_hasta) {
        where.fecha.lte = new Date(fecha_hasta);
      }
    }

    const [historias, total] = await Promise.all([
      prisma.historiaClinica.findMany({
        where,
        skip: parseInt(skip),
        take: parseInt(take),
        orderBy: { fecha: 'desc' },
        select: {
          id: true,
          paciente_id: true,
          doctor_id: true,
          turno_id: true,
          fecha: true,
          diagnostico: true,
          tratamiento: true,
          medicamentos: true,
          antecedentes: true,
          examen_fisico: true,
          observaciones: true,
          created_at: true,
          updated_at: true,
          doctor: {
            select: {
              id: true,
              nombre: true,
              apellido: true
            }
          }
        }
      }),
      prisma.historiaClinica.count({ where })
    ]);

    return res.status(200).json({
      success: true,
      data: historias.map(h => ({
        ...h,
        id: h.id.toString(),
        paciente_id: h.paciente_id.toString(),
        doctor_id: h.doctor_id.toString(),
        turno_id: h.turno_id?.toString() || null,
        doctor: {
          ...h.doctor,
          id: h.doctor.id.toString()
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
    console.error('Error al obtener historias clínicas:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener las historias clínicas'
    });
  }
};

// ============================================================================
// CONTROLLER: OBTENER UNA HISTORIA CLÍNICA
// ============================================================================
export const obtenerHistoriaClinica = async (req, res) => {
  try {
    const { id } = req.params;

    const historia = await prisma.historiaClinica.findUnique({
      where: { id: BigInt(id) },
      select: {
        id: true,
        paciente_id: true,
        doctor_id: true,
        turno_id: true,
        fecha: true,
        diagnostico: true,
        tratamiento: true,
        medicamentos: true,
        antecedentes: true,
        examen_fisico: true,
        observaciones: true,
        created_at: true,
        updated_at: true,
        paciente: {
          select: {
            id: true,
            dni: true,
            numero_historia_clinica: true
          }
        },
        doctor: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            especialidad: true
          }
        },
        estudios_adjuntos: {
          select: {
            id: true,
            tipo_estudio: true,
            descripcion: true,
            archivo_url: true,
            nombre_archivo: true,
            resultado: true,
            created_at: true
          }
        }
      }
    });

    if (!historia) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Historia clínica no encontrada'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...historia,
        id: historia.id.toString(),
        paciente_id: historia.paciente_id.toString(),
        doctor_id: historia.doctor_id.toString(),
        turno_id: historia.turno_id?.toString() || null,
        paciente: {
          ...historia.paciente,
          id: historia.paciente.id.toString()
        },
        doctor: {
          ...historia.doctor,
          id: historia.doctor.id.toString()
        },
        estudios_adjuntos: historia.estudios_adjuntos.map(e => ({
          ...e,
          id: e.id.toString()
        }))
      }
    });
  } catch (error) {
    console.error('Error al obtener historia clínica:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener la historia clínica'
    });
  }
};

// ============================================================================
// CONTROLLER: ACTUALIZAR HISTORIA CLÍNICA
// ============================================================================
export const actualizarHistoriaClinica = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      motivo_consulta,
      anamnesis,
      antecedentes,
      diagnostico_principal,
      impresion_clinica,
      presion_arterial,
      frecuencia_cardiaca,
      temperatura,
      saturacion_o2
    } = req.body;

    console.log('📥 [ACTUALIZAR] ID:', id);
    console.log('📥 [ACTUALIZAR] Datos recibidos:', {
      motivo_consulta,
      anamnesis,
      antecedentes,
      diagnostico_principal,
      impresion_clinica,
      presion_arterial,
      frecuencia_cardiaca,
      temperatura,
      saturacion_o2
    });

    // Parsear presión arterial (ej: "138/88" -> sistólica=138, diastólica=88)
    let presion_sistolica, presion_diastolica = null;
    if (presion_arterial && presion_arterial.includes('/')) {
      const [sist, diast] = presion_arterial.split('/');
      presion_sistolica = parseInt(sist);
      presion_diastolica = parseInt(diast);
      console.log('🩺 Presión parsed:', { presion_sistolica, presion_diastolica });
    }

    // Preparar datos para actualizar (solo incluir campos que tienen valor)
    const updateData = {};
    if (motivo_consulta !== undefined && motivo_consulta !== '') updateData.motivo_consulta = motivo_consulta;
    if (anamnesis !== undefined && anamnesis !== '') updateData.anamnesis = anamnesis;
    if (antecedentes !== undefined && antecedentes !== '') updateData.antecedentes_patologicos_personales = antecedentes;
    if (diagnostico_principal !== undefined && diagnostico_principal !== '') updateData.diagnostico_principal = diagnostico_principal;
    if (impresion_clinica !== undefined && impresion_clinica !== '') updateData.impresion_clinica = impresion_clinica;

    console.log('💾 [UPDATE] HistoriaClinica data:', updateData);

    // Actualizar historia clínica
    const historia = await prisma.historiaClinica.update({
      where: { id: BigInt(id) },
      data: updateData,
      select: {
        id: true,
        paciente_id: true,
        doctor_id: true,
        turno_id: true,
        fecha: true,
        motivo_consulta: true,
        anamnesis: true,
        diagnostico_principal: true,
        impresion_clinica: true,
        created_at: true,
        updated_at: true
      }
    });

    console.log('✅ [UPDATE] HistoriaClinica actualizada:', historia);

    // Buscar o crear signos vitales
    if (presion_sistolica || frecuencia_cardiaca || temperatura) {
      console.log('📊 Procesando signos vitales...');
      const signoVitalExisting = await prisma.signoVital.findFirst({
        where: { historia_clinica_id: BigInt(id) }
      });

      console.log('🔍 SignoVital existente:', signoVitalExisting?.id || 'No existe');

      const signoVitalData = {};
      if (presion_sistolica) signoVitalData.presion_sistolica = presion_sistolica;
      if (presion_diastolica) signoVitalData.presion_diastolica = presion_diastolica;
      if (frecuencia_cardiaca) signoVitalData.frecuencia_cardiaca = parseInt(frecuencia_cardiaca);
      if (temperatura) signoVitalData.temperatura_c = parseFloat(temperatura);

      if (signoVitalExisting) {
        // Actualizar
        console.log('🔄 Actualizando SignoVital:', signoVitalData);
        const updatedSignoVital = await prisma.signoVital.update({
          where: { id: signoVitalExisting.id },
          data: signoVitalData
        });
        console.log('✅ [UPDATE] SignoVital actualizado:', updatedSignoVital);
      } else {
        // Crear
        console.log('🆕 Creando nuevo SignoVital:', signoVitalData);
        const createdSignoVital = await prisma.signoVital.create({
          data: {
            historia_clinica_id: BigInt(id),
            ...signoVitalData
          }
        });
        console.log('✅ [CREATE] SignoVital creado:', createdSignoVital);
      }
    } else {
      console.log('⚠️  No hay datos de signos vitales para procesar');
    }

    return res.status(200).json({
      success: true,
      message: 'Historia clínica actualizada correctamente',
      data: historia
    });
  } catch (error) {
    console.error('Error actualizando historia:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar historia clínica',
      error: error.message
    });
  }
};

// ============================================================================
// CONTROLLER: ELIMINAR HISTORIA CLÍNICA
// ============================================================================
export const eliminarHistoriaClinica = async (req, res) => {
  try {
    const { id } = req.params;

    // Validar que existe
    const historia = await prisma.historiaClinica.findUnique({
      where: { id: BigInt(id) }
    });

    if (!historia) {
      return res.status(404).json({
        success: false,
        message: 'Historia clínica no encontrada'
      });
    }

    // Eliminar la historia (Prisma manejará cascadas)
    await prisma.historiaClinica.delete({
      where: { id: BigInt(id) }
    });

    return res.status(200).json({
      success: true,
      message: 'Historia clínica eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar historia clínica:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al eliminar la historia clínica',
      error: error.message
    });
  }
};

// ============================================================================
// CONTROLLER: REGISTRAR DIAGNÓSTICO
// ============================================================================
export const registrarDiagnostico = async (req, res) => {
  try {
    const { historia_id } = req.params;
    const { codigo_cie10, descripcion, principal } = req.body;

    // Obtener la historia clínica
    const historia = await prisma.historiaClinica.findUnique({
      where: { id: BigInt(historia_id) }
    });

    if (!historia) {
      return res.status(404).json({
        success: false,
        message: 'Historia clínica no encontrada'
      });
    }

    // Si es principal, desmarcar otros diagnósticos como principal en ESTA historia
    if (principal) {
      await prisma.diagnostico.updateMany({
        where: {
          historia_clinica_id: BigInt(historia_id),
          principal: true
        },
        data: { principal: false }
      });
    }

    // Crear el diagnóstico vinculado directamente a la historia
    const diagnostico = await prisma.diagnostico.create({
      data: {
        historia_clinica_id: BigInt(historia_id),
        codigo_cie10: codigo_cie10.toUpperCase(),
        descripcion: descripcion.charAt(0).toUpperCase() + descripcion.slice(1),
        principal: principal || false
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Diagnóstico registrado exitosamente',
      data: {
        id: diagnostico.id.toString(),
        codigo: diagnostico.codigo_cie10,
        descripcion: diagnostico.descripcion,
        principal: diagnostico.principal
      }
    });
  } catch (error) {
    console.error('Error al registrar diagnóstico:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al registrar el diagnóstico',
      error: error.message
    });
  }
};

// ============================================================================
// CONTROLLER: ELIMINAR DIAGNÓSTICO
// ============================================================================
export const eliminarDiagnostico = async (req, res) => {
  try {
    const { diagnostico_id } = req.params;

    // Validar que el diagnóstico existe
    const diagnostico = await prisma.diagnostico.findUnique({
      where: { id: BigInt(diagnostico_id) }
    });

    if (!diagnostico) {
      return res.status(404).json({
        success: false,
        message: 'Diagnóstico no encontrado'
      });
    }

    // Eliminar el diagnóstico
    await prisma.diagnostico.delete({
      where: { id: BigInt(diagnostico_id) }
    });

    return res.status(200).json({
      success: true,
      message: 'Diagnóstico eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar diagnóstico:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al eliminar el diagnóstico',
      error: error.message
    });
  }
};

export default {
  crearHistoriaClinica,
  obtenerHistoriasClinicas,
  obtenerHistoriaClinica,
  actualizarHistoriaClinica,
  eliminarHistoriaClinica,
  registrarDiagnostico,
  eliminarDiagnostico
};
