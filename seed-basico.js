import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedBasico() {
  try {
    console.log('\n🌱 Iniciando seed de datos básicos...\n');

    // Crear 2 médicos básicos
    console.log('📋 Creando médicos...\n');
    const medico1 = await prisma.medico.create({
      data: {
        supabase_id: '00000000-0000-0000-0000-000000000001',
        email: 'doctor@lemes.com',
        nombre: 'Carlos',
        apellido: 'Lemes',
        role: 'doctor',
        especialidad: 'Medicina General',
        activo: true
      }
    });
    console.log(`✓ Médico: ${medico1.nombre} ${medico1.apellido} (${medico1.email})`);

    const medico2 = await prisma.medico.create({
      data: {
        supabase_id: '00000000-0000-0000-0000-000000000002',
        email: 'secretaria@lemes.com',
        nombre: 'María',
        apellido: 'Secretaria',
        role: 'secretaria',
        activo: true
      }
    });
    console.log(`✓ Médico: ${medico2.nombre} ${medico2.apellido} (${medico2.email})`);

    // Crear algunas personas de prueba
    console.log('\n👤 Creando personas...\n');
    const personas = [];
    const datosPersonas = [
      { nombre: 'Juan', apellido: 'Pérez', dni: 12345678 },
      { nombre: 'María', apellido: 'García', dni: 87654321 },
      { nombre: 'Carlos', apellido: 'López', dni: 11223344 }
    ];

    for (const data of datosPersonas) {
      const p = await prisma.persona.create({
        data: {
          nombre: data.nombre,
          apellido: data.apellido,
          dni: data.dni,
          email: `${data.nombre.toLowerCase()}@ejemplo.com`,
          telefono: '1123456789'
        }
      });
      personas.push(p);
      console.log(`✓ Persona: ${p.nombre} ${p.apellido} (DNI: ${p.dni})`);
    }

    // Crear un turno para cada persona
    console.log('\n🗓️  Creando turnos...\n');
    for (let i = 0; i < personas.length; i++) {
      const fecha = new Date();
      fecha.setDate(fecha.getDate() + i + 1);
      
      const t = await prisma.turno.create({
        data: {
          persona_id: personas[i].id,
          medico_id: medico1.id,
          estado_id: BigInt(10), // PENDIENTE
          fecha: fecha,
          hora: `${9 + i}:00`
        }
      });
      console.log(`✓ Turno: ${personas[i].nombre} - ${t.hora} (Estado: PENDIENTE)`);
    }

    console.log('\n✅ Seed completado\n');
    console.log('📊 Resumen:');
    console.log(`   - 2 Médicos creados`);
    console.log(`   - 3 Personas creadas`);
    console.log(`   - 3 Turnos creados (PENDIENTE)`);

    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

seedBasico();
