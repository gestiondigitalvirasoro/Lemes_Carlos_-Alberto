import { PrismaClient } from '@prisma/client';
import { validationResult } from 'express-validator';

const prisma = new PrismaClient();

// ============================================================================
// CONTROLLER: AGENDAR TURNO (upsert Persona + crear Turno)
// ============================================================================
// Flujo:
// 1️⃣ Busca Persona por DNI (UPSERT)
// 2️⃣ Verifica si es Paciente
// 3️⃣ Crea Paciente si no existe
// 4️⃣ Crea Turno
// ============================================================================
export const agendarTurno = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // ========================================================================
    // 📋 EXTRAER DATOS DE PERSONA (con prefijo persona_)
    // ========================================================================
    const {
      persona_nombre: nombre,
      persona_apellido: apellido,
      persona_dni: dni,
      persona_telefono: telefono,
      persona_email: email,
      persona_fecha_nacimiento: fecha_nacimiento,
      persona_sexo: sexo,
      persona_direccion: direccion,
      // PACIENTE DATA
      persona_obra_social: obra_social,
      persona_numero_afiliado: numero_afiliado,
      // TURNO DATA
      medico_id = 1, // Por defecto doctor id=1
      fecha,
      hora,
      observaciones,
      motivo
    } = req.body;

    // ========================================================================
    // 🔐 OBTENER SECRETARIA ID desde usuario autenticado
    // ========================================================================
    let secretaria_id = medico_id; // Si es doctor, él es quien crea el turno
    if (req.user && req.user.medicoId) {
      secretaria_id = req.user.medicoId;
    }

    // ========================================================================
    // ✅ VALIDAR DOCTOR
    // ========================================================================
    const doctor = await prisma.medico.findUnique({
      where: { id: BigInt(medico_id) },
      select: { id: true, role: true }
    });

    if (!doctor || doctor.role !== 'doctor') {
      return res.status(404).json({
        error: 'Not found',
        message: 'Doctor no encontrado o no es doctor'
      });
    }

    // ========================================================================
    // 🔄 FLUJO: BUSCAR O CREAR PERSONA (UPSERT POR DNI)
    // ========================================================================
    console.log('🔍 Buscando persona con DNI:', dni);

    let persona = await prisma.persona.findUnique({
      where: { dni: parseInt(dni) },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        paciente: { select: { id: true } }
      }
    });

    if (persona) {
      console.log('✅ Persona encontrada, actualizando datos...');
      // Actualizar datos de Persona
      persona = await prisma.persona.update({
        where: { id: persona.id },
        data: {
          nombre: nombre || persona.nombre,
          apellido: apellido || persona.apellido,
          telefono: telefono ? String(telefono) : undefined,
          email: email ? String(email) : undefined,
          fecha_nacimiento: fecha_nacimiento ? new Date(fecha_nacimiento) : undefined,
          sexo: sexo ? String(sexo) : undefined,
          direccion: direccion ? String(direccion) : undefined
        },
        select: { id: true, paciente: { select: { id: true } } }
      });
    } else {
      console.log('📝 Persona no encontrada, creando nueva...');
      // Crear nueva Persona
      persona = await prisma.persona.create({
        data: {
          nombre: nombre || 'Sin nombre',
          apellido: apellido || 'Sin apellido',
          dni: parseInt(dni),
          telefono: telefono ? String(telefono) : null,
          email: email ? String(email) : null,
          fecha_nacimiento: fecha_nacimiento ? new Date(fecha_nacimiento) : null,
          sexo: sexo ? String(sexo) : null,
          direccion: direccion ? String(direccion) : null
        },
        select: { id: true, paciente: { select: { id: true } } }
      });
    }

    console.log('✅ Persona lista:', persona.id);

    // ========================================================================
    // 📌 PACIENTE NO SE CREA AQUÍ - Se creará al confirmar llegada
    // ========================================================================
    let paciente_id = null;

    if (persona.paciente && persona.paciente.id) {
      // Si ya es paciente, obtener su ID pero no actualizar aquí
      paciente_id = persona.paciente.id;
      console.log('✅ Ya es paciente:', paciente_id);
    } else {
      // Si no es paciente, se creará después en el endpoint de confirmación
      console.log('ℹ️  No es paciente aún. Se creará al confirmar llegada');
    }

    // ========================================================================
    // 3️⃣ CREAR TURNO
    // ========================================================================
    console.log('📅 Creando turno...');

    const turno = await prisma.turno.create({
      data: {
        persona_id: persona.id,
        medico_id: BigInt(medico_id),
        creado_por_secretaria_id: BigInt(secretaria_id),
        estado_id: BigInt(10), // PENDIENTE (ID: 10)
        fecha: new Date(fecha + 'T' + hora),
        hora: hora,
        observaciones: motivo || null
      },
      select: {
        id: true,
        persona: { select: { nombre: true, apellido: true, dni: true } },
        medico: { select: { nombre: true, apellido: true } },
        fecha: true,
        hora: true,
        estado: { select: { nombre: true } }
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
        persona: turno.persona,
        medico: turno.medico,
        fecha: turno.fecha,
        hora: turno.hora,
        estado: turno.estado.nombre,
        paciente_id: paciente_id ? paciente_id.toString() : null
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
// BUSCAR PERSONA POR DNI (para frontend)
// ============================================================================
export const buscarPersonaPorDni = async (req, res) => {
  try {
    const { dni } = req.query;

    if (!dni) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'DNI es requerido',
        encontrada: false
      });
    }

    console.log(`\n🔍 Buscando paciente por DNI: ${dni}`);

    // ============================================================================
    // ESTRATEGIA: BUSCAR PRIMERO EN PACIENTES (tabla dedicada)
    // ============================================================================
    // 1️⃣ Buscar en tabla PACIENTE (via persona)
    // 2️⃣ Si no existe, buscar en tabla PERSONA
    // 3️⃣ Priorizar datos de paciente si existe

    // Buscar en tablaPersona con relación a Paciente
    const persona = await prisma.persona.findUnique({
      where: { dni: parseInt(dni) },
      include: {
        paciente: {
          select: {
            id: true,
            obra_social: true,
            numero_afiliado: true,
            observaciones_generales: true,
            activo: true
          }
        }
      }
    });

    if (!persona) {
      console.log(`❌ No se encontró persona con DNI: ${dni}`);
      return res.status(200).json({
        encontrada: false,
        tipo: 'nueva',
        persona: null,
        mensaje: 'Persona no registrada en el sistema. Por favor ingrese los datos para crearla.'
      });
    }

    // ============================================================================
    // PERSONA ENCONTRADA - VERIFICAR SI ES PACIENTE
    // ============================================================================
    const tipo = persona.paciente ? 'paciente_existente' : 'persona_sin_paciente';
    
    console.log(`✅ Encontrado (${tipo}): ${persona.nombre} ${persona.apellido}`);

    const respuesta = {
      success: true,
      encontrada: true,
      tipo: tipo, // 'paciente_existente' | 'persona_sin_paciente'
      es_paciente: !!persona.paciente,
      persona: {
        id: persona.id.toString(),
        nombre: persona.nombre,
        apellido: persona.apellido,
        dni: persona.dni,
        telefono: persona.telefono || '',
        email: persona.email || '',
        fecha_nacimiento: persona.fecha_nacimiento || '',
        sexo: persona.sexo || '',
        direccion: persona.direccion || ''
      }
    };

    // Si es paciente, agregar datos adicionales
    if (persona.paciente) {
      respuesta.paciente = {
        id: persona.paciente.id.toString(),
        obra_social: persona.paciente.obra_social || '',
        numero_afiliado: persona.paciente.numero_afiliado || '',
        observaciones_generales: persona.paciente.observaciones_generales || '',
        activo: persona.paciente.activo
      };
      respuesta.mensaje = '✅ Paciente encontrado en el sistema. Sus datos están protegidos.';
    } else {
      respuesta.mensaje = '⚠️ Persona encontrada pero SIN registro de paciente. Los datos serán cargados para crear su historia.';
    }

    console.log(`📊 Respuesta: ${respuesta.tipo}, es_paciente: ${respuesta.es_paciente}`);

    return res.status(200).json(respuesta);
  } catch (error) {
    console.error('❌ Error al buscar persona:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al buscar persona: ' + error.message,
      encontrada: false
    });
  }
};

// ============================================================================
// CONTROLLER: ACTUALIZAR TURNO EXISTENTE
// ============================================================================
// Flujo:
// 1️⃣ Obtener turno por ID
// 2️⃣ Actualizar datos de Persona (si cambiaron)
// 3️⃣ Actualizar datos de Paciente (si cambiaron)
// 4️⃣ Actualizar datos de Turno (fecha, hora, etc)
// ============================================================================
export const actualizarTurno = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;

    // ========================================================================
    // ✅ VERIFICAR QUE TURNO EXISTE
    // ========================================================================
    const turnoExistente = await prisma.turno.findUnique({
      where: { id: BigInt(id) },
      select: {
        id: true,
        persona_id: true,
        medico_id: true,
        estado_id: true
      }
    });

    if (!turnoExistente) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Turno no encontrado'
      });
    }

    // ========================================================================
    // 📋 EXTRAER DATOS (con prefijo persona_)
    // ========================================================================
    const {
      persona_nombre: nombre,
      persona_apellido: apellido,
      persona_dni: dni,
      persona_telefono: telefono,
      persona_email: email,
      persona_fecha_nacimiento: fecha_nacimiento,
      persona_sexo: sexo,
      persona_direccion: direccion,
      // PACIENTE DATA
      persona_obra_social: obra_social,
      persona_numero_afiliado: numero_afiliado,
      persona_observaciones_generales: observaciones_generales,
      // TURNO DATA
      fecha,
      hora,
      observaciones,
      motivo
    } = req.body;

    // ========================================================================
    // 🔄 ACTUALIZAR PERSONA
    // ========================================================================
    console.log('🔄 Actualizando persona...');
    
    const personaActualizada = await prisma.persona.update({
      where: { id: turnoExistente.persona_id },
      data: {
        ...(nombre && { nombre }),
        ...(apellido && { apellido }),
        ...(telefono && { telefono: String(telefono) }),
        ...(email && { email: String(email) }),
        ...(fecha_nacimiento && { fecha_nacimiento: new Date(fecha_nacimiento) }),
        ...(sexo && { sexo: String(sexo) }),
        ...(direccion && { direccion: String(direccion) })
      },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        paciente: { select: { id: true } }
      }
    });

    console.log('✅ Persona actualizada:', personaActualizada.id);

    // ========================================================================
    // 🔄 ACTUALIZAR PACIENTE (si existe)
    // ========================================================================
    if (personaActualizada.paciente && personaActualizada.paciente.id) {
      console.log('🔄 Actualizando paciente...');

      await prisma.paciente.update({
        where: { id: personaActualizada.paciente.id },
        data: {
          ...(obra_social && { obra_social }),
          ...(numero_afiliado && { numero_afiliado }),
          ...(observaciones_generales && { observaciones_generales })
        }
      });

      console.log('✅ Paciente actualizado');
    }

    // ========================================================================
    // 🔄 ACTUALIZAR TURNO
    // ========================================================================
    console.log('🔄 Actualizando turno...');

    const turnoActualizado = await prisma.turno.update({
      where: { id: BigInt(id) },
      data: {
        ...(fecha && hora && { fecha: new Date(fecha + 'T' + hora) }),
        ...(hora && { hora }),
        ...(motivo || observaciones) && { observaciones: motivo || observaciones }
      },
      select: {
        id: true,
        persona: { select: { nombre: true, apellido: true, dni: true } },
        medico: { select: { nombre: true, apellido: true } },
        fecha: true,
        hora: true,
        estado: { select: { nombre: true } }
      }
    });

    console.log('✅ Turno actualizado:', turnoActualizado.id);

    // ========================================================================
    // 🎉 RESPUESTA FINAL
    // ========================================================================
    return res.status(200).json({
      success: true,
      message: 'Turno actualizado exitosamente',
      turno: {
        id: turnoActualizado.id.toString(),
        persona: turnoActualizado.persona,
        medico: turnoActualizado.medico,
        fecha: turnoActualizado.fecha,
        hora: turnoActualizado.hora,
        estado: turnoActualizado.estado.nombre
      }
    });
  } catch (error) {
    console.error('❌ Error al actualizar turno:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al actualizar turno: ' + error.message
    });
  }
};
