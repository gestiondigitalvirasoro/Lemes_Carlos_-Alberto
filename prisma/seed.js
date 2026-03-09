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
  await prisma.historiaClinica.deleteMany({});
  await prisma.turno.deleteMany({});
  await prisma.paciente.deleteMany({});
  await prisma.persona.deleteMany({});
  await prisma.usuario.deleteMany({});

  // ============================================================
  // 1️⃣  CREAR USUARIOS EN SUPABASE AUTH + BD LOCAL
  // ============================================================
  
  const usuariosData = [
    { email: 'doctor@lemes.com', password: 'doctor123', nombre: 'Juan', apellido: 'García', role: 'doctor', especialidad: 'Medicina General', telefono: '1234567890' },
    { email: 'cardiologo@lemes.com', password: 'doctor123', nombre: 'María', apellido: 'López', role: 'doctor', especialidad: 'Cardiología', telefono: '0987654321' },
    { email: 'secretaria@lemes.com', password: 'secretaria123', nombre: 'Ana', apellido: 'Martínez', role: 'secretaria', telefono: '5555555555' }
  ];

  const usuarios = [];

  for (const userData of usuariosData) {
    // 1️⃣ Crear en Supabase Auth
    console.log(`📝 Creando usuario en Supabase: ${userData.email}`);
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: userData.email,
      password: userData.password,
      email_confirm: true
    });

    if (authError) {
      console.error(`❌ Error en Supabase para ${userData.email}:`, authError.message);
      continue;
    }

    // 2️⃣ Crear en BD local
    const usuarioBD = await prisma.usuario.create({
      data: {
        email: userData.email,
        password_hash: authData.user.id, // Guardar UUID de Supabase
        nombre: userData.nombre,
        apellido: userData.apellido,
        role: userData.role,
        especialidad: userData.especialidad || null,
        telefono: userData.telefono,
        activo: true
      }
    });

    usuarios.push(usuarioBD);
    console.log(`✅ Usuario creado: ${userData.email}`);
  }

  if (usuarios.length !== 3) {
    throw new Error('⚠️  No se crearon todos los usuarios');
  }

  const doctor1 = usuarios[0];
  const doctor2 = usuarios[1];
  const secretaria = usuarios[2];

  console.log('✅ Médicos y secretaria creados');

  // 2. Crear Personas (Pacientes)
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
      creada_por_medico_id: doctor2.id,
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
      medico_id: doctor2.id,
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

  // 8. Crear Turnos
  const turno1 = await prisma.turno.create({
    data: {
      persona_id: persona1.id,
      medico_id: doctor1.id,
      fecha: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // En 3 días
      hora: '14:30',
      estado: 'CONFIRMADO',
      creado_por_secretaria_id: secretaria.id
    }
  });

  const turno2 = await prisma.turno.create({
    data: {
      persona_id: persona2.id,
      medico_id: doctor2.id,
      fecha: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // En 5 días
      hora: '10:00',
      estado: 'PENDIENTE',
      creado_por_secretaria_id: secretaria.id
    }
  });

  console.log('✅ Turnos creados');

  // 9. Crear Consultas Médicas
  const consulta1 = await prisma.consultaMedica.create({
    data: {
      historia_clinica_id: historia1.id,
      medico_id: doctor1.id,
      turno_id: turno1.id,
      fecha: new Date(),
      motivo_consulta: 'Control de hipertensión',
      resumen: 'Paciente refiere buen cumplimiento del tratamiento. TA controlada.',
      estado: 'ATENDIDA'
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
  console.log(`  - 2 Turnos creados`);
  console.log(`  - 1 Consulta Médica creada`);
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
