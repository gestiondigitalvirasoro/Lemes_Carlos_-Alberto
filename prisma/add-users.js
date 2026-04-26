/**
 * add-users.js
 * Crea usuarios nuevos en Supabase Auth + BD local sin borrar datos existentes.
 * Uso: node --env-file=.env prisma/add-users.js
 */

import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const prisma = new PrismaClient();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function crearOActualizarUsuario({ email, password, nombre, apellido, role, especialidad }) {
  console.log(`\n📝 Procesando: ${email} (${role})`);

  // 1. Crear o encontrar en Supabase Auth
  let supabaseId;
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (authError) {
    if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
      console.log(`  ⚠️  Ya existe en Supabase Auth — buscando ID...`);
      const { data: { users } } = await supabase.auth.admin.listUsers();
      const existing = users.find(u => u.email === email);
      if (!existing) throw new Error(`No se encontró ${email} en Supabase`);
      supabaseId = existing.id;
    } else {
      throw new Error(`Error Supabase: ${authError.message}`);
    }
  } else {
    supabaseId = authData.user.id;
    console.log(`  ✅ Creado en Supabase Auth`);
  }

  // 2. Crear o actualizar en BD local
  const existente = await prisma.medico.findUnique({ where: { email } });

  if (existente) {
    await prisma.medico.update({
      where: { email },
      data: { supabase_id: supabaseId, role, activo: true }
    });
    console.log(`  ✅ Actualizado en BD local`);
  } else {
    await prisma.medico.create({
      data: {
        supabase_id: supabaseId,
        email,
        nombre,
        apellido,
        role,
        especialidad: especialidad || null,
        activo: true
      }
    });
    console.log(`  ✅ Creado en BD local`);
  }
}

async function main() {
  console.log('🚀 Agregando usuarios al sistema...\n');

  await crearOActualizarUsuario({
    email: 'admin@lemes.local',
    password: 'Admin2026!',
    nombre: 'Admin',
    apellido: 'Sistema',
    role: 'admin'
  });

  await crearOActualizarUsuario({
    email: 'carlosalemes2@gmail.com',
    password: 'Doctor2026!',
    nombre: 'Carlos',
    apellido: 'Lemes Alberto',
    role: 'doctor',
    especialidad: 'Medicina General y Familiar'
  });

  console.log('\n\n✅ ¡Usuarios creados/actualizados!');
  console.log('─'.repeat(50));
  console.log('📋 Credenciales:');
  console.log('  Administrador: admin@lemes.local  /  Admin2026!');
  console.log('  Doctor real:   carlosalemes2@gmail.com  /  Doctor2026!');
  console.log('  Doctor prueba: doctor@lemes.local  /  12345  (sin cambios)');
  console.log('─'.repeat(50));
  console.log('\n⚠️  Acordate de cambiar la contraseña del doctor real después de probar.');
}

main()
  .catch(e => { console.error('\n❌ Error:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
