import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function setupLemes() {
  try {
    console.log('🏥 Configurando médico Lemes...');

    // Crear el médico Lemes
    const medico = await prisma.medico.create({
      data: {
        supabase_id: '550e8400-e29b-41d4-a716-446655440000', // UUID fijo para Lemes
        email: 'carlos@lemes.com',
        nombre: 'Carlos',
        apellido: 'Lemes',
        role: 'doctor',
        especialidad: 'Medicina General',
        activo: true
      }
    });

    console.log(`✅ Médico Lemes creado: ID ${medico.id}`);

    // Crear algunas personas (pacientes potenciales)
    console.log('👥 Creando personas...');
    const personas = [];
    for (let i = 1; i <= 10; i++) {
      const persona = await prisma.persona.create({
        data: {
          nombre: `Paciente${i}`,
          apellido: `Apellido${i}`,
          dni: 10000000 + i,
          email: `paciente${i}@example.com`,
          telefono: `555000${i}`,
          fecha_nacimiento: new Date('1980-01-01'),
          sexo: i % 2 === 0 ? 'M' : 'F'
        }
      });
      personas.push(persona);
      console.log(`  ✓ Persona ${i}: ${persona.nombre} ${persona.apellido}`);
    }

    // Crear pacientes (historias clínicas)
    console.log('📋 Creando historias clínicas...');
    for (let i = 0; i < personas.length; i++) {
      const paciente = await prisma.paciente.create({
        data: {
          persona_id: personas[i].id,
          obra_social: `Obra Social ${i + 1}`,
          numero_afiliado: `AF${1000 + i}`,
          activo: true
        }
      });

      // Crear historia clínica
      const historia = await prisma.historiaClinica.create({
        data: {
          paciente_id: paciente.id,
          creada_por_medico_id: medico.id,
          fecha_apertura: new Date(),
          activa: true
        }
      });

      console.log(`  ✓ Historia ${i + 1}: ID ${historia.id}`);
    }

    // Crear estados de consulta
    console.log('📊 Creando estados de consulta...');
    const estados = ['EN_CONSULTA', 'ATENDIDA', 'CANCELADA'];
    for (const estado of estados) {
      await prisma.estadoConsulta.upsert({
        where: { nombre: estado },
        update: {},
        create: { nombre: estado, descripcion: `Estado: ${estado}` }
      });
    }

    console.log('✅ Base de datos configurada correctamente');
    console.log(`   - Médico Lemes: ID ${medico.id}`);
    console.log(`   - Pacientes creados: ${personas.length}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

setupLemes();
