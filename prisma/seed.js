import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const prisma = new PrismaClient();

// Cliente de Supabase (server-side con Service Key)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function main() {
  console.log('🌱 Sembrando datos de prueba...');

  // Limpiar datos existentes (BD local)
  await prisma.documentoAdjunto.deleteMany({});
  await prisma.diagnostico.deleteMany({});
  await prisma.signoVital.deleteMany({});
  await prisma.estudioComplementario.deleteMany({});
  await prisma.tratamiento.deleteMany({});
  await prisma.anamnesis.deleteMany({});
  await prisma.consultaMedica.deleteMany({});
  await prisma.turno.deleteMany({});
  await prisma.antecedente.deleteMany({});
  await prisma.historiaClinica.deleteMany({});
  await prisma.paciente.deleteMany({});
  await prisma.persona.deleteMany({});
  await prisma.medico.deleteMany({});
  await prisma.estadoConsulta.deleteMany({});
  await prisma.estadoTurno.deleteMany({});

  // ============================================================
  // 1️⃣  CREAR MEDICOS EN SUPABASE AUTH + BD LOCAL
  // ============================================================
  
  const medicosData = [
    { email: 'doctor@lemes.com', password: 'doctor123', nombre: 'Carlos', apellido: 'Lemes Alberto', role: 'doctor', especialidad: 'Medicina General y Familiar', subespecialidad: 'Especialista en Endocrinología', telefono: '1234567890' }
  ];

  const medicos = [];

  for (const medicoData of medicosData) {
    let supabaseId = null;

    // 1️⃣ Intentar crear en Supabase Auth
    console.log(`📝 Creando usuario en Supabase: ${medicoData.email}`);
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: medicoData.email,
      password: medicoData.password,
      email_confirm: true
    });

    if (authError) {
      // Si el usuario ya existe en Supabase, intenta obtenerlo
      if (authError.message.includes('already been registered')) {
        console.log(`⚠️  Usuario ya existe en Supabase: ${medicoData.email}`);
        const { data: { users }, error: searchError } = await supabase.auth.admin.listUsers();
        if (searchError) {
          console.error(`❌ No se pudo buscar usuario:`, searchError.message);
          continue;
        }
        const existingUser = users.find(u => u.email === medicoData.email);
        if (existingUser) {
          supabaseId = existingUser.id;
          console.log(`✅ Usuario encontrado en Supabase: ${medicoData.email}`);
        }
      } else {
        console.error(`❌ Error en Supabase para ${medicoData.email}:`, authError.message);
        continue;
      }
    } else {
      supabaseId = authData.user.id;
      console.log(`✅ Usuario creado en Supabase: ${medicoData.email}`);
    }

    if (!supabaseId) {
      console.error(`❌ No se obtuvo ID para ${medicoData.email}`);
      continue;
    }

    // 2️⃣ Crear Medico en BD local
    const medicos_bd = await prisma.medico.create({
      data: {
        supabase_id: supabaseId, // UUID de Supabase Auth
        email: medicoData.email,
        nombre: medicoData.nombre,
        apellido: medicoData.apellido,
        role: medicoData.role,
        especialidad: medicoData.especialidad || null,
        telefono: medicoData.telefono || null,
        activo: true
      }
    });

    medicos.push(medicos_bd);
    console.log(`✅ Medico en BD: ${medicoData.email}`);
  }

  if (medicos.length !== 1) {
    console.error('⚠️  Solo se crearon ' + medicos.length + ' medico(s) de 1 esperado(s)');
  }

  const doctor1 = medicos[0];

  console.log('✅ Doctor Lemes, Carlos Alberto creado');

  // 2. Crear Estados de Turnos (SIMPLIFICADOS: 4 ESTADOS)
  console.log('\n📋 Creando estados de turnos...');
  
  const estadosTurno = {
    PENDIENTE: await prisma.estadoTurno.create({ data: { nombre: 'PENDIENTE', descripcion: 'Turno pendiente sin confirmar', activo: true } }),
    EN_CONSULTA: await prisma.estadoTurno.create({ data: { nombre: 'EN_CONSULTA', descripcion: 'Consulta en progreso', activo: true } }),
    FINALIZADA: await prisma.estadoTurno.create({ data: { nombre: 'FINALIZADA', descripcion: 'Consulta completada', activo: true } }),
    CANCELADA: await prisma.estadoTurno.create({ data: { nombre: 'CANCELADA', descripcion: 'Turno cancelado o paciente no asistió', activo: false } })
  };
  
  console.log('✅ Estados de Turnos creados (4 estados: PENDIENTE, EN_CONSULTA, FINALIZADA, CANCELADA)');

  // 3. Crear Estados de Consultas
  console.log('📋 Creando estados de consultas...');
  
  const estadosConsulta = {
    EN_CONSULTA: await prisma.estadoConsulta.create({ data: { nombre: 'EN_CONSULTA', descripcion: 'Consulta en proceso', activo: true } }),
    ATENDIDA: await prisma.estadoConsulta.create({ data: { nombre: 'ATENDIDA', descripcion: 'Consulta finalizada', activo: true } }),
    CANCELADA: await prisma.estadoConsulta.create({ data: { nombre: 'CANCELADA', descripcion: 'Consulta cancelada', activo: false } })
  };
  
  console.log('✅ Estados de Consultas creados (3 estados)');

  // 4. Crear Personas (Pacientes)
  const persona1 = await prisma.persona.create({
    data: {
      nombre: 'Carlos',
      apellido: 'Rodríguez',
      dni: 12345678,
      fecha_nacimiento: new Date('1980-05-15'),
      sexo: 'M',
      telefono: '1111111111',
      email: 'carlos@ejemplo.com',
      direccion: 'Calle Principal 123',
      obra_social: 'OSDE',
      numero_afiliado: 'OS-123456'
    }
  });

  const persona2 = await prisma.persona.create({
    data: {
      nombre: 'Marta',
      apellido: 'Fernández',
      dni: 87654321,
      fecha_nacimiento: new Date('1975-08-22'),
      sexo: 'F',
      telefono: '2222222222',
      email: 'marta@ejemplo.com',
      direccion: 'Avenida Central 456',
      obra_social: 'FAMILIA',
      numero_afiliado: 'FAM-654321'
    }
  });

  const persona3 = await prisma.persona.create({
    data: {
      nombre: 'Pedro',
      apellido: 'González',
      dni: 11223344,
      fecha_nacimiento: new Date('1990-12-03'),
      sexo: 'M',
      telefono: '3333333333',
      email: 'pedro@ejemplo.com',
      direccion: 'Calle del Parque 789',
      obra_social: 'IOMA',
      numero_afiliado: 'IOMA-789012'
    }
  });

  console.log('✅ Personas (pacientes) creadas');

  // 3. Crear Pacientes
  const paciente1 = await prisma.paciente.create({
    data: {
      persona_id: persona1.id,
      obra_social: 'OSDE',
      numero_afiliado: 'OS-123456',
      observaciones_generales: 'Paciente con antecedentes de hipertensión'
    }
  });

  const paciente2 = await prisma.paciente.create({
    data: {
      persona_id: persona2.id,
      obra_social: 'FAMILIA',
      numero_afiliado: 'FAM-654321',
      observaciones_generales: 'Sin antecedentes relevantes'
    }
  });

  const paciente3 = await prisma.paciente.create({
    data: {
      persona_id: persona3.id,
      obra_social: 'IOMA',
      numero_afiliado: 'IOMA-789012',
      observaciones_generales: 'Deportista, buen estado general'
    }
  });

  console.log('✅ Pacientes creados');

  // 4. Crear Historias Clínicas
  const historia1 = await prisma.historiaClinica.create({
    data: {
      paciente_id: paciente1.id,
      creada_por_medico_id: doctor1.id,
      fecha_apertura: new Date(),
      activa: true
    }
  });

  const historia2 = await prisma.historiaClinica.create({
    data: {
      paciente_id: paciente2.id,
      creada_por_medico_id: doctor1.id,
      fecha_apertura: new Date(),
      activa: true
    }
  });

  const historia3 = await prisma.historiaClinica.create({
    data: {
      paciente_id: paciente3.id,
      creada_por_medico_id: doctor1.id,
      fecha_apertura: new Date(),
      activa: true
    }
  });

  console.log('✅ Historias Clínicas creadas');

  // 5. Crear Signos Vitales
  await prisma.signoVital.create({
    data: {
      historia_clinica_id: historia1.id,
      peso_kg: 75.5,
      talla_cm: 175,
      imc: 24.6,
      presion_sistolica: 140,
      presion_diastolica: 90,
      frecuencia_cardiaca: 72,
      temperatura_c: 36.8,
      glucemia_mg_dl: 105,
      circunferencia_abd_cm: 92.5
    }
  });

  await prisma.signoVital.create({
    data: {
      historia_clinica_id: historia2.id,
      peso_kg: 62.0,
      talla_cm: 165,
      imc: 22.8,
      presion_sistolica: 120,
      presion_diastolica: 80,
      frecuencia_cardiaca: 68,
      temperatura_c: 36.7,
      glucemia_mg_dl: 95,
      circunferencia_abd_cm: 80.0
    }
  });

  console.log('✅ Signos Vitales creados');

  // 6. Crear Diagnósticos
  await prisma.diagnostico.create({
    data: {
      historia_clinica_id: historia1.id,
      codigo_cie10: 'I10',
      descripcion: 'Hipertensión esencial',
      principal: true
    }
  });

  await prisma.diagnostico.create({
    data: {
      historia_clinica_id: historia1.id,
      codigo_cie10: 'E11.9',
      descripcion: 'Diabetes tipo 2 sin complicaciones',
      principal: false
    }
  });

  await prisma.diagnostico.create({
    data: {
      historia_clinica_id: historia2.id,
      codigo_cie10: 'J45.901',
      descripcion: 'Asma intermitente',
      principal: true
    }
  });

  console.log('✅ Diagnósticos creados');

  // 7. Crear Estudios Complementarios
  await prisma.estudioComplementario.create({
    data: {
      historia_clinica_id: historia1.id,
      tipo_estudio: 'Análisis de Sangre',
      resultado: 'Hemoglobina: 13.2 g/dL',
      observaciones: 'Valores dentro de los límites normales',
      medico_id: doctor1.id,
      fecha_estudio: new Date()
    }
  });

  await prisma.estudioComplementario.create({
    data: {
      historia_clinica_id: historia1.id,
      tipo_estudio: 'ECG',
      resultado: 'Ritmo sinusal normal',
      observaciones: 'Sin alteraciones',
      medico_id: doctor1.id,
      fecha_estudio: new Date()
    }
  });

  await prisma.estudioComplementario.create({
    data: {
      historia_clinica_id: historia2.id,
      tipo_estudio: 'Radiografía de Tórax',
      resultado: 'Sin hallazgos relevantes',
      observaciones: 'Campos pulmonares limpios',
      medico_id: doctor1.id,
      fecha_estudio: new Date()
    }
  });

  console.log('✅ Estudios Complementarios creados');

  // 8. Crear Turnos (hoy con diferentes estados)
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0); // Inicio del día actual
  
  const turno1 = await prisma.turno.create({
    data: {
      persona_id: persona1.id,
      medico_id: doctor1.id,
      fecha: hoy,
      hora: '09:00',
      estado_id: estadosTurno.EN_CONSULTA.id, // Turno activo - en consulta ahora
      creado_por_secretaria_id: doctor1.id
    }
  });

  const turno2 = await prisma.turno.create({
    data: {
      persona_id: persona2.id,
      medico_id: doctor1.id,
      fecha: hoy,
      hora: '10:30',
      estado_id: estadosTurno.FINALIZADA.id, // Turno terminado
      creado_por_secretaria_id: doctor1.id
    }
  });

  const turno3 = await prisma.turno.create({
    data: {
      persona_id: persona3.id,
      medico_id: doctor1.id,
      fecha: hoy,
      hora: '14:00',
      estado_id: estadosTurno.PENDIENTE.id, // Turno próximo sin confirmar
      creado_por_secretaria_id: doctor1.id
    }
  });

  console.log('✅ Turnos creados (3 turnos para hoy)');

  // 9. Crear Consultas Médicas
  const consulta1 = await prisma.consultaMedica.create({
    data: {
      historia_clinica_id: historia1.id,
      medico_id: doctor1.id,
      turno_id: turno1.id,
      fecha: new Date(),
      motivo_consulta: 'Control de hipertensión',
      resumen: 'En consulta - Paciente refiere buen cumplimiento del tratamiento.',
      estado_id: estadosConsulta.EN_CONSULTA.id // Activa ahora
    }
  });

  const consulta2 = await prisma.consultaMedica.create({
    data: {
      historia_clinica_id: historia2.id,
      medico_id: doctor1.id,
      turno_id: turno2.id,
      fecha: new Date(),
      motivo_consulta: 'Seguimiento diabetes',
      resumen: 'Consulta completada - Paciente controlado, hemoglobina glicosilada dentro de rango.',
      estado_id: estadosConsulta.ATENDIDA.id // Terminada
    }
  });

  console.log('✅ Consultas Médicas creadas');

  console.log('✅✅✅ ¡Datos de prueba sembrando exitosamente!');
  console.log('\n📋 Resumen:');
  console.log(`  - 2 Doctores creados`);
  console.log(`  - 1 Secretaria creada`);
  console.log(`  - 3 Pacientes creados`);
  console.log(`  - 3 Historias Clínicas creadas`);
  console.log(`  - 2 Signos Vitales creados`);
  console.log(`  - 3 Diagnósticos creados`);
  console.log(`  - 3 Estudios Complementarios creados`);
  console.log(`  - 3 Turnos creados (todos para HOY)`);
  console.log(`  - 2 Consultas Médicas creadas`);
  console.log('\n📊 Estados de Turnos:');
  console.log(`  - Turno 1 (09:00) - EN_CONSULTA: Carlos (Activo ahora)`);
  console.log(`  - Turno 2 (10:30) - COMPLETA: Marta (Terminado)`);
  console.log(`  - Turno 3 (14:00) - CONFIRMADO: Pedro (Próximo)`);
  console.log('\n🔐 Datos de acceso:');
  console.log(`  Doctor: doctor@lemes.com / doctor123`);
  console.log(`  Cardióloga: cardiologo@lemes.com / doctor123`);
  console.log(`  Secretaria: secretaria@lemes.com / secretaria123`);
}

main()
  .catch((e) => {
    console.error('❌ Error sembrando datos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
