# INSTRUCCIONES PARA EJECUTAR EN SUPABASE

## 📋 Descripción del Script

Este script SQL contiene la estructura completa de la base de datos del sistema médico LEMES con:

✅ **7 tablas principales**:
- `usuarios` - Administradores, doctores, secretarias
- `pacientes` - Información de pacientes
- `turnos` - Citas médicas
- `historias_clinicas` - Historiales médicos
- `estudios_adjuntos` - Radiografías, análisis, etc.
- `documentos` - Documentos de identificación
- `sesiones` - Control de sesiones activas

✅ **Características profesionales**:
- BIGSERIAL para IDs (acepta millones de registros)
- Enums personalizados para roles y estados
- Foreign keys con ON DELETE CASCADE/RESTRICT
- Índices en columnas críticas
- Timestamps automáticos (created_at, updated_at)
- Triggers que actualizan automáticamente updated_at
- Vistas SQL para reportes
- Funciones para cálculos comunes
- Comentarios en las tablas

---

## 🔐 CONTRASEÑAS BCRYPT - REEMPLAZAR ANTES DE USAR

Los hashes de ejemplo en el script NO SON reales. Antes de usar en producción:

### Opción 1: Usar bcrypt.js (Node.js)
```javascript
const bcrypt = require('bcrypt');

async function generarHashes() {
  const passwords = {
    admin: 'admin123',
    doctor: 'doctor123',
    secretaria: 'secretaria123'
  };
  
  for (const [user, pass] of Object.entries(passwords)) {
    const hash = await bcrypt.hash(pass, 10);
    console.log(`${user}@lemes.com: ${hash}`);
  }
}

generarHashes();
```

### Opción 2: Usar bcrypt CLI
```bash
# Instalar bcrypt CLI globalmente
npm install -g bcrypt-cli

# Generar hashes
bcrypt-cli admin123
bcrypt-cli doctor123
bcrypt-cli secretaria123
```

### Opción 3: Usar un generador online seguro
Visita: https://bcrypt.online/ (úsalo solo en desarrollo)

---

## 📝 PASOS PARA EJECUTAR EN SUPABASE

### Paso 1: Acceder a Supabase
1. Ve a https://supabase.com
2. Inicia sesión en tu proyecto
3. Ve a "SQL Editor" en el panel lateral izquierdo

### Paso 2: Reemplazar contraseñas
1. Abre el archivo `schema.sql` en un editor de texto
2. Busca estas líneas (aproximadamente líneas 305-323):
   ```sql
   INSERT INTO usuarios (email, password_hash, nombre, apellido, role, telefono, direccion, activo)
   VALUES (
       'admin@lemes.com',
       '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.1', -- REEMPLAZAR
   ```

3. Reemplaza los hashes de ejemplo con hashes bcrypt reales generados en el paso anterior

### Paso 3: Copiar y ejecutar el script
1. copia TODO el contenido del archivo `schema.sql`
2. Pégalo en el SQL Editor de Supabase
3. Haz clic en el botón "RUN" (o presiona Ctrl+Enter)

### Paso 4: Verificar que se ejecutó correctamente
Deberías ver:
```
Query Successful
Transaction committed
```

Si hay errores, revisa:
- Los hashes bcrypt tienen el formato correcto
- No hay caracteres especiales sin escapar
- Supabase está activo y conectado

---

## 🧪 DATOS DE PRUEBA INCLUIDOS

El script incluye 3 usuarios y 2 pacientes de ejemplo:

### Usuarios:
| Email | Rol | Nombre |
|-------|-----|--------|
| admin@lemes.com | admin | Admin Sistema |
| doctor@lemes.com | doctor | Juan García López |
| secretaria@lemes.com | secretaria | María Rodríguez García |

### Pacientes:
| DNI | Historia Clínica | Género | Fecha Nacimiento |
|-----|------------------|--------|------------------|
| 12345678A | HC-2026-001 | Masculino | 1990-05-15 |
| 87654321B | HC-2026-002 | Femenino | 1985-08-22 |

---

## 📊 VISTAS CREADAS AUTOMÁTICAMENTE

El script crea 3 vistas SQL para reportes:

### 1. `v_turnos_proximos`
Lista todos los turnos futuros sin cancelar, con información del paciente y doctor.

```sql
SELECT * FROM v_turnos_proximos;
```

### 2. `v_resumen_pacientes`
Resumen de cada paciente incluyendo turnos y historiales.

```sql
SELECT * FROM v_resumen_pacientes;
```

### 3. `v_carga_doctores`
Estadísticas de carga de trabajo de cada doctor.

```sql
SELECT * FROM v_carga_doctores;
```

---

## 🔧 FUNCIONES CREADAS AUTOMÁTICAMENTE

### 1. `calcular_edad_paciente(fecha_nac DATE)`
Calcula la edad actual del paciente.

```sql
SELECT calcular_edad_paciente('1990-05-15'::DATE); -- Resultado: 35
```

### 2. `doctor_disponible(doctor_id, fecha_hora, duracion)`
Verifica si un doctor está disponible en una fecha/hora específica.

```sql
SELECT doctor_disponible(1, NOW() + INTERVAL '1 day', INTERVAL '30 minutes');
-- Resultado: true or false
```

---

## ⚙️ MODIFICAR EVENTOS O RESTRICCIONES

Si necesitas cambiar algo después de crear las tablas:

### Cambiar duración de un turno:
```sql
ALTER TABLE turnos ALTER COLUMN duracion_minutos SET DEFAULT 45;
```

### Agregar nuevo estado a turnos:
```sql
ALTER TYPE appointment_status ADD VALUE 'reprogramado' AFTER 'pendiente';
```

### Agregar nuevo rol a usuarios:
```sql
ALTER TYPE user_role ADD VALUE 'recepcionista' AFTER 'secretaria';
```

### Agregar nuevo género:
```sql
ALTER TYPE gender_type ADD VALUE 'no_especificado' AFTER 'otro';
```

---

## 🚀 PRÓXIMOS PASOS

Una vez ejecutado el script:

1. **Verificar tablas**:
   ```sql
   SELECT tablename FROM pg_tables WHERE schemaname = 'public';
   ```

2. **Ver estructura de una tabla**:
   ```sql
   SELECT * FROM information_schema.columns WHERE table_name = 'usuarios';
   ```

3. **Insertar más datos**:
   ```sql
   INSERT INTO pacientes (dni, fecha_nacimiento, genero, numero_historia_clinica)
   VALUES ('11111111C', '1980-03-20', 'masculino', 'HC-2026-003');
   ```

4. **Conectar desde Node.js**:
   ```javascript
   const { createClient } = require('@supabase/supabase-js');
   
   const supabase = createClient(
     'https://your-project.supabase.co',
     'your-anon-key'
   );
   
   // Ejemplo de query
   const { data, error } = await supabase
     .from('pacientes')
     .select('*');
   ```

---

## ⚠️ NOTAS IMPORTANTES

- **NO usar en producción** sin cambiar las contraseñas de ejemplo
- **Backup regular** de la base de datos en Supabase
- **Revisar permisos**: Asegúrate de que Supabase tiene permisos para ejecutar el script
- **Extensiones**: El script usa solo funciones estándar de PostgreSQL (sin extensiones adicionales)
- **Compatible 100%** con Supabase PostgreSQL versión actual

---

## 🆘 SOLUCIÓN DE PROBLEMAS

### Error: "tipo ya existe"
→ Borra la base de datos y ejecuta nuevamente, o renombra los enums

### Error: "relación ya existe"
→ Las tablas ya existen. Ejecuta `DROP TABLE IF EXISTS` al inicio

### Error de contraseña bcrypt
→ Asegúrate que el hash comienza con `$2a$`, `$2b$` o `$2y$`

### Triggers no funcionan
→ Verifica que PostgreSQL > 9.1 (Supabase soporta versiones recientes)

---

Creado: 25 de Febrero, 2026
Sistema: LEMES Medical
