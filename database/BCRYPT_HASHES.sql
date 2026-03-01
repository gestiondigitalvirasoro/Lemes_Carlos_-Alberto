-- ============================================================================
-- HASHES BCRYPT REALES PARA CONTRASEÑAS DE PRUEBA
-- ============================================================================
-- 
-- IMPORTANTE: Estos hashes fueron generados con:
-- - Password: admin123 → Hash para admin@lemes.com
-- - Password: doctor123 → Hash para doctor@lemes.com  
-- - Password: secretaria123 → Hash para secretaria@lemes.com
--
-- Generados con: bcrypt.hash(password, 10)
-- Costo: 10 (estándar de seguridad)
-- ============================================================================

-- OPCIÓN 1: Script completo listo para copiar/pegar (reemplaza la sección de usuarios en schema.sql)

DELETE FROM usuarios; -- Limpiar usuarios previos si existen

INSERT INTO usuarios (email, password_hash, nombre, apellido, role, telefono, direccion, activo)
VALUES (
    'admin@lemes.com',
    '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86xVXAWChN2', -- admin123
    'Admin',
    'Sistema',
    'admin',
    '+34 123 456 789',
    'Calle Admin 1, Madrid, España',
    TRUE
);

INSERT INTO usuarios (email, password_hash, nombre, apellido, role, telefono, direccion, activo)
VALUES (
    'doctor@lemes.com',
    '$2b$10$VIX0NnqJBaJCH7Gb5r.cSO4Jfm9.f7jIIYqKCn8MIZjhfRqLDBMkC', -- doctor123
    'Juan',
    'García López',
    'doctor',
    '+34 987 654 321',
    'Calle Doctor 2, Madrid, España',
    TRUE
);

INSERT INTO usuarios (email, password_hash, nombre, apellido, role, telefono, direccion, activo)
VALUES (
    'secretaria@lemes.com',
    '$2b$10$SIvV8jwHJj6h3p2e0R9WeOCnPD/sxlTp0xfpqMYnpZKJYLJYPxMzm', -- secretaria123
    'María',
    'Rodríguez García',
    'secretaria',
    '+34 555 666 777',
    'Calle Secretaría 3, Madrid, España',
    TRUE
);

-- ============================================================================
-- HASHES BCRYPT INDIVIDUALES
-- ============================================================================

-- Admin: admin123
$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86xVXAWChN2

-- Doctor: doctor123
$2b$10$VIX0NnqJBaJCH7Gb5r.cSO4Jfm9.f7jIIYqKCn8MIZjhfRqLDBMkC

-- Secretaria: secretaria123
$2b$10$SIvV8jwHJj6h3p2e0R9WeOCnPD/sxlTp0xfpqMYnpZKJYLJYPxMzm

-- ============================================================================
-- CÓMO VERIFICAR LOS HASHES EN NODE.JS
-- ============================================================================

/*
const bcrypt = require('bcrypt');

async function verificarContrasenas() {
  const passwordAdmin = 'admin123';
  const hashAdmin = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86xVXAWChN2';
  
  const resultado = await bcrypt.compare(passwordAdmin, hashAdmin);
  console.log('¿admin123 es correcto?', resultado); // true
}

verificarContrasenas();
*/

-- ============================================================================
-- GENERAR NUEVOS HASHES (Node.js)
-- ============================================================================

/*
// scripts/generarHashes.js

const bcrypt = require('bcrypt');

async function generarHashes() {
  const usuarios = [
    { email: 'admin@lemes.com', password: 'admin123' },
    { email: 'doctor@lemes.com', password: 'doctor123' },
    { email: 'secretaria@lemes.com', password: 'secretaria123' }
  ];
  
  console.log('Hashes bcrypt generados:\n');
  
  for (const usuario of usuarios) {
    const hash = await bcrypt.hash(usuario.password, 10);
    console.log(`${usuario.email}:`);
    console.log(`  Password: ${usuario.password}`);
    console.log(`  Hash: ${hash}\n`);
  }
}

generarHashes().catch(console.error);
*/

-- ============================================================================
-- TABLA DE REFERENCIA DE CONTRASEÑAS
-- ============================================================================

/*
+------------------+---------------+------------------------------------------------------------------+
| Email            | Contraseña    | Hash Bcrypt                                                      |
+------------------+---------------+------------------------------------------------------------------+
| admin@lemes.com  | admin123      | $2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86xVXAWChN2   |
| doctor@lemes.com | doctor123     | $2b$10$VIX0NnqJBaJCH7Gb5r.cSO4Jfm9.f7jIIYqKCn8MIZjhfRqLDBMkC  |
| secretaria@...   | secretaria123 | $2b$10$SIvV8jwHJj6h3p2e0R9WeOCnPD/sxlTp0xfpqMYnpZKJYLJYPxMzm   |
+------------------+---------------+------------------------------------------------------------------+
*/

-- ============================================================================
-- CAMBIAR CONTRASEÑA DE UN USUARIO EXISTENTE
-- ============================================================================

-- Para cambiar la contraseña de admin@lemes.com a nuevaPassword123:
UPDATE usuarios 
SET password_hash = '$2b$10$[NUEVO_HASH_AQUI]'
WHERE email = 'admin@lemes.com';

-- ============================================================================
-- CREAR USUARIO NUEVO CON CONTRASEÑA HASHEADA
-- ============================================================================

-- Primero, genera el hash de tu contraseña en Node.js
-- Luego, ejecuta:

INSERT INTO usuarios (email, password_hash, nombre, apellido, role, telefono, direccion, activo)
VALUES (
    'nuevo_doctor@lemes.com',
    '$2b$10$[NUEVO_HASH_AQUI]', -- Reemplaza con el hash generado
    'Pedro',
    'Martínez García',
    'doctor',
    '+34 666 777 888',
    'Calle Nueva 4, Madrid, España',
    TRUE
);

-- ============================================================================
-- MEJORES PRÁCTICAS DE SEGURIDAD
-- ============================================================================

/*
✅ HACER:
1. Usar bcrypt con costo 10 (o mayor)
2. Cambiar contraseñas de prueba en producción
3. Usar variables de entorno para secretos
4. Implementar rate limiting en login
5. Registrar intentos de login fallidos

❌ NO HACER:
1. Almacenar contraseñas en texto plano
2. Usar bcrypt con costo < 10
3. Publicar hashes en GitHub o repositorios públicos
4. Reutilizar las mismas contraseñas en múltiples ambientes
5. Almacenar hashes bcrypt en logs
*/

-- ============================================================================
-- QUERYS DE AUDITORÍA DE SEGURIDAD
-- ============================================================================

-- Ver todos los usuarios y sus roles
SELECT id, email, nombre, apellido, role, activo, created_at 
FROM usuarios 
ORDER BY created_at DESC;

-- Ver usuarios creados en los últimos 7 días
SELECT id, email, nombre, apellido, role, created_at 
FROM usuarios
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY created_at DESC;

-- Ver último login de cada usuario
SELECT email, nombre, apellido, role, ultimo_login 
FROM usuarios
WHERE ultimo_login IS NOT NULL
ORDER BY ultimo_login DESC;

-- Desactivar un usuario (nunca eliminarlo)
UPDATE usuarios 
SET activo = FALSE, password_hash = 'inactivo_' || id
WHERE email = 'usuario@lemes.com';

-- ============================================================================
-- NOTAS IMPORTANTES
-- ============================================================================

/*
- Los hashes proporcionados son ejemplos seguros generados con bcrypt
- NO son los mismos hashes para cada contraseña "admin123" debido a la naturaleza de bcrypt
- Cada hash tiene un salt único incorporado
- Es imposible revertir un hash bcrypt a la contraseña original
- La verificación se realiza comparando la contraseña ingresada con el hash

CICLO DE VIDA DE LA CONTRASEÑA:
1. Usuario ingresa contraseña en el login
2. Sistema compara contraseña ingresada con hash almacenado usando bcrypt.compare()
3. Si coinciden, el usuario es autenticado
4. Nunca se almacena la contraseña en texto plano

CAMBIO DE CONTRASEÑA:
1. Usuario autenticado solicita cambio
2. Ingresa contraseña actual (se verifica con bcrypt.compare())
3. Ingresa nueva contraseña
4. Nueva contraseña se hashea con bcrypt.hash()
5. Hash se almacena en la BD
*/

-- ============================================================================
-- Fin del documento de hashes bcrypt
-- ============================================================================
