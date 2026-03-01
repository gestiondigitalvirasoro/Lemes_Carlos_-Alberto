// ============================================================================
// EJEMPLOS DE QUERIES CON SUPABASE
// Base de Datos del Sistema Médico LEMES
// ============================================================================

/**
 * INSTALACIÓN REQUERIDA:
 * npm install @supabase/supabase-js bcryptjs
 * 
 * VARIABLES DE ENTORNO (.env):
 * SUPABASE_URL=https://your-project.supabase.co
 * SUPABASE_KEY=your-anon-key
 */

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

// ============================================================================
// CONFIGURACIÓN INICIAL
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================================
// FUNCIONES DE AUTENTICACIÓN
// ============================================================================

/**
 * Crear nuevo usuario
 */
async function crearUsuario(email, password, nombre, apellido, role) {
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    
    const { data, error } = await supabase
      .from('usuarios')
      .insert([
        {
          email,
          password_hash: passwordHash,
          nombre,
          apellido,
          role,
          activo: true
        }
      ])
      .select();
    
    if (error) throw error;
    return { success: true, usuario: data[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Verificar login (comparar contraseña)
 */
async function verificarLogin(email, password) {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('email', email)
      .eq('activo', true)
      .single();
    
    if (error) throw new Error('Usuario no encontrado');
    
    const contraseñaValida = await bcrypt.compare(password, data.password_hash);
    
    if (!contraseñaValida) {
      throw new Error('Contraseña incorrecta');
    }
    
    // Actualizar último login
    await supabase
      .from('usuarios')
      .update({ ultimo_login: new Date().toISOString() })
      .eq('id', data.id);
    
    return { 
      success: true, 
      usuario: {
        id: data.id,
        email: data.email,
        nombre: data.nombre,
        apellido: data.apellido,
        role: data.role
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Cambiar contraseña
 */
async function cambiarContrasena(usuarioId, contraseñaActual, contraseñaNueva) {
  try {
    // Obtener usuario actual
    const { data: usuario, error: errorUsuario } = await supabase
      .from('usuarios')
      .select('password_hash')
      .eq('id', usuarioId)
      .single();
    
    if (errorUsuario) throw errorUsuario;
    
    // Verificar contraseña actual
    const esValida = await bcrypt.compare(contraseñaActual, usuario.password_hash);
    if (!esValida) {
      throw new Error('Contraseña actual incorrecta');
    }
    
    // Hashear nueva contraseña
    const nuevoHash = await bcrypt.hash(contraseñaNueva, 10);
    
    // Actualizar
    const { error: errorUpdate } = await supabase
      .from('usuarios')
      .update({ password_hash: nuevoHash })
      .eq('id', usuarioId);
    
    if (errorUpdate) throw errorUpdate;
    
    return { success: true, mensaje: 'Contraseña actualizada correctamente' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// GESTIÓN DE PACIENTES
// ============================================================================

/**
 * Crear nuevo paciente
 */
async function crearPaciente(dni, fechaNacimiento, genero, numeroHistoria) {
  try {
    const { data, error } = await supabase
      .from('pacientes')
      .insert([
        {
          dni,
          fecha_nacimiento: fechaNacimiento,
          genero,
          numero_historia_clinica: numeroHistoria,
          activo: true
        }
      ])
      .select();
    
    if (error) throw error;
    return { success: true, paciente: data[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Buscar paciente por DNI
 */
async function buscarPacientePorDNI(dni) {
  try {
    const { data, error } = await supabase
      .from('v_resumen_pacientes')
      .select('*')
      .eq('dni', dni)
      .single();
    
    if (error) throw error;
    return { success: true, paciente: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Obtener todos los pacientes activos
 */
async function obtenerPacientes(limite = 20, offset = 0) {
  try {
    const { data, error, count } = await supabase
      .from('v_resumen_pacientes')
      .select('*', { count: 'exact' })
      .limit(limite)
      .range(offset, offset + limite - 1);
    
    if (error) throw error;
    return { success: true, pacientes: data, total: count };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Actualizar información del paciente
 */
async function actualizarPaciente(pacienteId, datosActualizar) {
  try {
    const { data, error } = await supabase
      .from('pacientes')
      .update(datosActualizar)
      .eq('id', pacienteId)
      .select();
    
    if (error) throw error;
    return { success: true, paciente: data[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// GESTIÓN DE TURNOS
// ============================================================================

/**
 * Crear nuevo turno
 */
async function crearTurno(pacienteId, doctorId, fechaHora, motivo, duracion = 30) {
  try {
    // Verificar disponibilidad del doctor
    const { data: disponible } = await supabase
      .rpc('doctor_disponible', {
        p_doctor_id: doctorId,
        p_fecha_hora: fechaHora,
        p_duracion: `${duracion} minutes`
      });
    
    if (!disponible) {
      throw new Error('El doctor no está disponible en esa fecha y hora');
    }
    
    const { data, error } = await supabase
      .from('turnos')
      .insert([
        {
          paciente_id: pacienteId,
          doctor_id: doctorId,
          fecha_hora: fechaHora,
          duracion_minutos: duracion,
          estado: 'pendiente',
          motivo
        }
      ])
      .select();
    
    if (error) throw error;
    return { success: true, turno: data[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Obtener turnos próximos
 */
async function obtenerTurnosProximos(limite = 10) {
  try {
    const { data, error } = await supabase
      .from('v_turnos_proximos')
      .select('*')
      .limit(limite);
    
    if (error) throw error;
    return { success: true, turnos: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Obtener turnos de un paciente
 */
async function obtenerTurnosPaciente(pacienteId) {
  try {
    const { data, error } = await supabase
      .from('turnos')
      .select('*')
      .eq('paciente_id', pacienteId)
      .order('fecha_hora', { ascending: false });
    
    if (error) throw error;
    return { success: true, turnos: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Obtener turnos de un doctor
 */
async function obtenerTurnosDoctor(doctorId, fecha = null) {
  try {
    let query = supabase
      .from('turnos')
      .select('*')
      .eq('doctor_id', doctorId)
      .in('estado', ['pendiente', 'confirmado', 'en_consulta']);
    
    if (fecha) {
      const fechaInicio = `${fecha}T00:00:00`;
      const fechaFin = `${fecha}T23:59:59`;
      query = query
        .gte('fecha_hora', fechaInicio)
        .lte('fecha_hora', fechaFin);
    }
    
    const { data, error } = await query.order('fecha_hora', { ascending: true });
    
    if (error) throw error;
    return { success: true, turnos: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Actualizar estado de turno
 */
async function actualizarEstadoTurno(turnoId, nuevoEstado) {
  try {
    const estadosValidos = ['pendiente', 'confirmado', 'en_consulta', 'atendido', 'ausente', 'cancelado'];
    
    if (!estadosValidos.includes(nuevoEstado)) {
      throw new Error(`Estado inválido. Estados permitidos: ${estadosValidos.join(', ')}`);
    }
    
    const { data, error } = await supabase
      .from('turnos')
      .update({ estado: nuevoEstado })
      .eq('id', turnoId)
      .select();
    
    if (error) throw error;
    return { success: true, turno: data[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Cancelar turno
 */
async function cancelarTurno(turnoId) {
  return actualizarEstadoTurno(turnoId, 'cancelado');
}

// ============================================================================
// GESTIÓN DE HISTORIAS CLÍNICAS
// ============================================================================

/**
 * Crear nueva historia clínica
 */
async function crearHistoriaClinica(pacienteId, doctorId, turnoId = null, diagnostico, tratamiento) {
  try {
    const { data, error } = await supabase
      .from('historias_clinicas')
      .insert([
        {
          paciente_id: pacienteId,
          doctor_id: doctorId,
          turno_id: turnoId,
          diagnostico,
          tratamiento,
          fecha: new Date().toISOString().split('T')[0]
        }
      ])
      .select();
    
    if (error) throw error;
    return { success: true, historia: data[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Obtener historias clínicas de un paciente
 */
async function obtenerHistoriasClinicasPaciente(pacienteId) {
  try {
    const { data, error } = await supabase
      .from('historias_clinicas')
      .select(`
        *,
        usuarios:doctor_id(nombre, apellido),
        estudios_adjuntos(id, tipo_estudio, resultado)
      `)
      .eq('paciente_id', pacienteId)
      .order('fecha', { ascending: false });
    
    if (error) throw error;
    return { success: true, historias: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Obtener historia clínica completa
 */
async function obtenerHistoriaClinicaCompleta(historiaId) {
  try {
    const { data, error } = await supabase
      .from('historias_clinicas')
      .select(`
        *,
        pacientes(*, usuarios:usuario_id(nombre, apellido)),
        usuarios:doctor_id(nombre, apellido),
        estudios_adjuntos(*)
      `)
      .eq('id', historiaId)
      .single();
    
    if (error) throw error;
    return { success: true, historia: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// GESTIÓN DE ESTUDIOS ADJUNTOS
// ============================================================================

/**
 * Adjuntar estudio a historia clínica
 */
async function adjuntarEstudio(historiaClinicaId, tipoEstudio, descripcion, archivoUrl) {
  try {
    const { data, error } = await supabase
      .from('estudios_adjuntos')
      .insert([
        {
          historia_clinica_id: historiaClinicaId,
          tipo_estudio: tipoEstudio,
          descripcion,
          archivo_url: archivoUrl
        }
      ])
      .select();
    
    if (error) throw error;
    return { success: true, estudio: data[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// REPORTES Y ESTADÍSTICAS
// ============================================================================

/**
 * Obtener carga de trabajo de doctores
 */
async function obtenerCargaDoctores() {
  try {
    const { data, error } = await supabase
      .from('v_carga_doctores')
      .select('*')
      .order('turnos_totales', { ascending: false });
    
    if (error) throw error;
    return { success: true, doctores: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Obtener estadísticas de turnos
 */
async function obtenerEstadisticasTurnos() {
  try {
    const { data, error } = await supabase
      .from('turnos')
      .select('estado')
      .then(result => {
        const stats = {
          pendiente: 0,
          confirmado: 0,
          en_consulta: 0,
          atendido: 0,
          ausente: 0,
          cancelado: 0
        };
        
        result.data?.forEach(turno => {
          stats[turno.estado]++;
        });
        
        return { data: stats, error: result.error };
      });
    
    if (error) throw error;
    return { success: true, estadisticas: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Obtener turnos del día actual
 */
async function obtenerTurnosDelDia(fecha = null) {
  try {
    const fechaBuscada = fecha || new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('turnos')
      .select('*')
      .gte('fecha_hora', `${fechaBuscada}T00:00:00`)
      .lte('fecha_hora', `${fechaBuscada}T23:59:59`)
      .order('fecha_hora', { ascending: true });
    
    if (error) throw error;
    return { success: true, turnos: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// GESTIÓN DE SESIONES
// ============================================================================

/**
 * Registrar sesión de usuario
 */
async function registrarSesion(usuarioId, ipAddress, userAgent) {
  try {
    const { data, error } = await supabase
      .from('sesiones')
      .insert([
        {
          usuario_id: usuarioId,
          ip_address: ipAddress,
          user_agent: userAgent,
          activa: true
        }
      ])
      .select();
    
    if (error) throw error;
    return { success: true, sesion: data[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Cerrar sesión
 */
async function cerrarSesion(sesionId) {
  try {
    const { data, error } = await supabase
      .from('sesiones')
      .update({ 
        activa: false,
        fecha_fin: new Date().toISOString()
      })
      .eq('id', sesionId)
      .select();
    
    if (error) throw error;
    return { success: true, sesion: data[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// EJEMPLOS DE USO
// ============================================================================

/**
 * Ejemplo completo: Crear turno y historia clínica
 */
async function ejemploFlujoCompleto() {
  try {
    console.log('🏥 Iniciando flujo completo...\n');
    
    // 1. Crear usuario doctor
    console.log('1️⃣ Creando doctor...');
    const doctor = await crearUsuario(
      'nuevo_doctor@lemes.com',
      'doctor123',
      'Pedro',
      'Martínez',
      'doctor'
    );
    console.log(`   Doctor creado: ${doctor.usuario?.id}\n`);
    
    // 2. Crear paciente
    console.log('2️⃣ Creando paciente...');
    const paciente = await crearPaciente(
      '99999999Z',
      '1995-06-20',
      'otro',
      'HC-2026-999'
    );
    console.log(`   Paciente creado: ${paciente.paciente?.id}\n`);
    
    // 3. Crear turno
    console.log('3️⃣ Creando turno...');
    const turno = await crearTurno(
      paciente.paciente.id,
      doctor.usuario.id,
      new Date(Date.now() + 86400000).toISOString(), // Mañana
      'Consulta general',
      45
    );
    console.log(`   Turno creado: ${turno.turno?.id}\n`);
    
    // 4. Confirmar turno
    console.log('4️⃣ Confirmando turno...');
    await actualizarEstadoTurno(turno.turno.id, 'confirmado');
    console.log('   Turno confirmado\n');
    
    // 5. Cambiar a en_consulta
    console.log('5️⃣ Iniciando consulta...');
    await actualizarEstadoTurno(turno.turno.id, 'en_consulta');
    console.log('   En consulta\n');
    
    // 6. Crear historia clínica
    console.log('6️⃣ Creando historia clínica...');
    const historia = await crearHistoriaClinica(
      paciente.paciente.id,
      doctor.usuario.id,
      turno.turno.id,
      'Paciente con síntomas leves',
      'Reposo y medicación'
    );
    console.log(`   Historia clínica creada: ${historia.historia?.id}\n`);
    
    // 7. Adjuntar estudio
    console.log('7️⃣ Adjuntando estudio...');
    const estudio = await adjuntarEstudio(
      historia.historia.id,
      'Radiografía de pecho',
      'Radiografía PA',
      'https://example.com/radiografia.jpg'
    );
    console.log(`   Estudio adjuntado: ${estudio.estudio?.id}\n`);
    
    // 8. Marcar turno como atendido
    console.log('8️⃣ Finalizando turno...');
    await actualizarEstadoTurno(turno.turno.id, 'atendido');
    console.log('   Turno finalizado\n');
    
    console.log('✅ Flujo completado exitosamente!');
    
  } catch (error) {
    console.error('❌ Error en flujo:', error);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Autenticación
  crearUsuario,
  verificarLogin,
  cambiarContrasena,
  
  // Pacientes
  crearPaciente,
  buscarPacientePorDNI,
  obtenerPacientes,
  actualizarPaciente,
  
  // Turnos
  crearTurno,
  obtenerTurnosProximos,
  obtenerTurnosPaciente,
  obtenerTurnosDoctor,
  actualizarEstadoTurno,
  cancelarTurno,
  
  // Historias clínicas
  crearHistoriaClinica,
  obtenerHistoriasClinicasPaciente,
  obtenerHistoriaClinicaCompleta,
  
  // Estudios
  adjuntarEstudio,
  
  // Reportes
  obtenerCargaDoctores,
  obtenerEstadisticasTurnos,
  obtenerTurnosDelDia,
  
  // Sesiones
  registrarSesion,
  cerrarSesion,
  
  // Ejemplo
  ejemploFlujoCompleto
};

// ============================================================================
// Para ejecutar el ejemplo:
// node ejemplos.js && ejemploFlujoCompleto()
// ============================================================================
