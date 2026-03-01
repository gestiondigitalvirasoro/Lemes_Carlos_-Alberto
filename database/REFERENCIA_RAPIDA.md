# 📚 REFERENCIA RÁPIDA - BASE DE DATOS LEMES

## 🎯 Resumen Ejecutivo

| Aspecto | Detalle |
|--------|---------|
| **Base de Datos** | PostgreSQL (Supabase) |
| **Tablas** | 7 tablas principales |
| **Relaciones** | Foreign keys con integridad referencial |
| **Índices** | 20+ índices para optimizar queries |
| **Vistas** | 3 vistas para reportes |
| **Funciones** | 2 funciones personalizadas |
| **Triggers** | 7 triggers automáticos (updated_at) |

---

## 📊 Estructura de Tablas

### 1️⃣ USUARIOS
```
id (BIGSERIAL) PRIMARY KEY
email (VARCHAR 255) UNIQUE NOT NULL
password_hash (VARCHAR 255) NOT NULL
nombre (VARCHAR 100) NOT NULL
apellido (VARCHAR 100) NOT NULL
role (ENUM: admin, doctor, secretaria) NOT NULL
telefono (VARCHAR 20)
direccion (TEXT)
activo (BOOLEAN) DEFAULT TRUE
ultimo_login (TIMESTAMP)
created_at (TIMESTAMP) AUTO
updated_at (TIMESTAMP) AUTO

ÍNDICES:
- email
- role  
- activo
```

**Relaciones:**
- Pacientes.usuario_id → Usuarios.id (1:N)
- Turnos.doctor_id → Usuarios.id (1:N)
- Historias_clinicas.doctor_id → Usuarios.id (1:N)
- Sesiones.usuario_id → Usuarios.id (1:N)

---

### 2️⃣ PACIENTES
```
id (BIGSERIAL) PRIMARY KEY
usuario_id (BIGINT) NULLABLE FK
dni (VARCHAR 20) UNIQUE
fecha_nacimiento (DATE)
genero (ENUM: masculino, femenino, otro)
numero_historia_clinica (VARCHAR 20) UNIQUE
numero_emergencia (VARCHAR 20)
contacto_emergencia (VARCHAR 255)
alergias (TEXT)
patologias_cronicas (TEXT)
activo (BOOLEAN) DEFAULT TRUE
created_at (TIMESTAMP) AUTO
updated_at (TIMESTAMP) AUTO

ÍNDICES:
- dni
- usuario_id
- numero_historia_clinica

RELATIONSHIPS:
- Usuarios.id (optional)
- Turnos (1:N) - Pacientes.id
- Historias_clinicas (1:N) - Pacientes.id
- Documentos (1:N) - Pacientes.id
```

---

### 3️⃣ TURNOS
```
id (BIGSERIAL) PRIMARY KEY
paciente_id (BIGINT) NOT NULL FK
doctor_id (BIGINT) NOT NULL FK
fecha_hora (TIMESTAMP) NOT NULL
duracion_minutos (INTEGER) DEFAULT 30
estado (ENUM: pendiente, confirmado, en_consulta, atendido, ausente, cancelado)
motivo (TEXT)
notas (TEXT)
sala_atencion (VARCHAR 50)
precio_consulta (DECIMAL 10,2)
pagado (BOOLEAN) DEFAULT FALSE
created_at (TIMESTAMP) AUTO
updated_at (TIMESTAMP) AUTO

CONSTRAINTS:
- CHECK duracion_minutos > 0
- CHECK fecha_hora > CURRENT_TIMESTAMP

ÍNDICES:
- paciente_id
- doctor_id
- fecha_hora
- estado
- (doctor_id, fecha_hora)
```

---

### 4️⃣ HISTORIAS_CLINICAS
```
id (BIGSERIAL) PRIMARY KEY
paciente_id (BIGINT) NOT NULL FK
doctor_id (BIGINT) NOT NULL FK
turno_id (BIGINT) NULLABLE FK
fecha (DATE) DEFAULT CURRENT_DATE
diagnostico (TEXT)
tratamiento (TEXT)
medicamentos (TEXT)
antecedentes (TEXT)
examen_fisico (TEXT)
observaciones (LONGTEXT)
created_at (TIMESTAMP) AUTO
updated_at (TIMESTAMP) AUTO

ÍNDICES:
- paciente_id
- doctor_id
- turno_id
- fecha
```

---

### 5️⃣ ESTUDIOS_ADJUNTOS
```
id (BIGSERIAL) PRIMARY KEY
historia_clinica_id (BIGINT) NOT NULL FK
tipo_estudio (VARCHAR 100) NOT NULL
descripcion (TEXT)
archivo_url (VARCHAR 500)
nombre_archivo (VARCHAR 255)
archivo_mime_type (VARCHAR 100)
tamaño_bytes (BIGINT)
resultado (TEXT)
observaciones (TEXT)
created_at (TIMESTAMP) AUTO
updated_at (TIMESTAMP) AUTO

ÍNDICES:
- historia_clinica_id
- tipo_estudio
```

---

### 6️⃣ DOCUMENTOS
```
id (BIGSERIAL) PRIMARY KEY
paciente_id (BIGINT) NOT NULL FK
tipo_documento (ENUM: cedula_identidad, pasaporte, licencia_conducir, otro)
numero_documento (VARCHAR 50)
descripcion (TEXT)
archivo_url (VARCHAR 500)
nombre_archivo (VARCHAR 255)
archivo_mime_type (VARCHAR 100)
tamaño_bytes (BIGINT)
fecha_vencimiento (DATE)
activo (BOOLEAN) DEFAULT TRUE
created_at (TIMESTAMP) AUTO
updated_at (TIMESTAMP) AUTO

ÍNDICES:
- paciente_id
- tipo_documento
- numero_documento
```

---

### 7️⃣ SESIONES
```
id (BIGSERIAL) PRIMARY KEY
usuario_id (BIGINT) NOT NULL FK
token_refresh (VARCHAR 500)
ip_address (INET)
user_agent (TEXT)
fecha_inicio (TIMESTAMP) DEFAULT CURRENT_TIMESTAMP
fecha_fin (TIMESTAMP) NULLABLE
activa (BOOLEAN) DEFAULT TRUE
created_at (TIMESTAMP) AUTO
updated_at (TIMESTAMP) AUTO

ÍNDICES:
- usuario_id
- activa
- fecha_inicio
```

---

## 📈 VISTAS DISPONIBLES

### v_turnos_proximos
Turnos futuros sin cancelar, ordenados por fecha.

```sql
SELECT * FROM v_turnos_proximos;
```

**Columnas:**
- id, fecha_hora, estado, dni, paciente, doctor, motivo, sala_atencion

---

### v_resumen_pacientes
Resumen de pacientes con estadísticas.

```sql
SELECT * FROM v_resumen_pacientes;
```

**Columnas:**
- id, dni, numero_historia_clinica, nombre_completo, fecha_nacimiento, 
  genero, total_turnos, total_historias, ultimo_turno

---

### v_carga_doctores
Carga de trabajo de doctores.

```sql
SELECT * FROM v_carga_doctores;
```

**Columnas:**
- id, nombre_completo, email, turnos_totales, turnos_pendientes, 
  turnos_confirmados, turnos_atendidos, duracion_promedio_minutos

---

## 🔧 FUNCIONES DISPONIBLES

### calcular_edad_paciente(fecha_nac DATE)
```sql
SELECT calcular_edad_paciente('1990-05-15'::DATE);
-- Resultado: 35
```

---

### doctor_disponible(doctor_id, fecha_hora, duracion)
```sql
SELECT doctor_disponible(1, NOW() + INTERVAL '1 day', INTERVAL '30 minutes');
-- Resultado: true/false
```

---

## 🔑 ENUMS (Tipos Enumerados)

### user_role
```
'admin'
'doctor'
'secretaria'
```

### appointment_status
```
'pendiente'
'confirmado'
'en_consulta'
'atendido'
'ausente'
'cancelado'
```

### gender_type
```
'masculino'
'femenino'
'otro'
```

### document_type
```
'cedula_identidad'
'pasaporte'
'licencia_conducir'
'otro'
```

---

## 🔐 Usuarios de Prueba

| Email | Contraseña | Rol | Nombre |
|-------|-----------|-----|--------|
| admin@lemes.com | admin123 | admin | Admin Sistema |
| doctor@lemes.com | doctor123 | doctor | Juan García López |
| secretaria@lemes.com | secretaria123 | secretaria | María Rodríguez García |

---

## 📋 Pacientes de Datos de Prueba

| DNI | Historia Clínica | Nombre | Género |
|-----|-----------------|--------|--------|
| 12345678A | HC-2026-001 | No asignado | Masculino |
| 87654321B | HC-2026-002 | No asignado | Femenino |

---

## 📊 QUERIES COMUNES

### Listar todos los turnos de un paciente
```sql
SELECT * FROM turnos 
WHERE paciente_id = 1 
ORDER BY fecha_hora DESC;
```

### Obtener próximos turnos del doctor
```sql
SELECT * FROM v_turnos_proximos 
WHERE doctor = 'Juan García López'
ORDER BY fecha_hora ASC;
```

### Contar turnos por estado
```sql
SELECT estado, COUNT(*) as total
FROM turnos
GROUP BY estado
ORDER BY total DESC;
```

### Historia clínica completa de un paciente
```sql
SELECT 
  hc.id,
  hc.fecha,
  u.nombre || ' ' || u.apellido as doctor,
  hc.diagnostico,
  hc.tratamiento,
  COUNT(ea.id) as estudios_adjuntos
FROM historias_clinicas hc
JOIN usuarios u ON hc.doctor_id = u.id
LEFT JOIN estudios_adjuntos ea ON hc.id = ea.historia_clinica_id
WHERE hc.paciente_id = 1
GROUP BY hc.id, hc.fecha, u.nombre, u.apellido, hc.diagnostico, hc.tratamiento
ORDER BY hc.fecha DESC;
```

### Turnos de hoy
```sql
SELECT * FROM turnos
WHERE DATE(fecha_hora) = CURRENT_DATE
ORDER BY fecha_hora ASC;
```

### Edad de todos los pacientes
```sql
SELECT 
  p.id,
  p.numero_historia_clinica,
  p.fecha_nacimiento,
  (EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.fecha_nacimiento)))::INTEGER as edad
FROM pacientes p
ORDER BY edad DESC;
```

### Disponibilidad de doctor en una fecha
```sql
SELECT doctor_disponible(
  1, -- doctor_id
  '2026-03-15 14:00:00'::TIMESTAMP WITH TIME ZONE,
  INTERVAL '30 minutes'
);
```

---

## 🎯 REGLAS DE INTEGRIDAD

### Cascada (DELETE CASCADE)
Cuando se elimina un registro, se eliminan automáticamente los relacionados:
- Paciente → Se eliminan turnos, historias clínicas, documentos
- Historia Clínica → Se eliminan estudios adjuntos

### Restricción (DELETE RESTRICT)
No se permite eliminar registros relacionados:
- Usuario doctor → No se puede eliminar si tiene turnos o historias

### Set NULL (DELETE SET NULL)
Se configura el campo a NULL:
- Usuario paciente → Pacientes pueden existir sin usuario_id
- Turno en historia clínica → Historia puede existir sin turno asociado

---

## ⚡ ÍNDICES PARA OPTIMIZAR

| Tabla | Columnas | Propósito |
|-------|----------|----------|
| usuarios | email | Búsquedas rápidas por email |
| pacientes | dni | Búsquedas por DNI |
| turnos | fecha_hora | Filtros por fecha |
| turnos | doctor_id, fecha_hora | Búsquedas por doctor y fecha |
| historias_clinicas | paciente_id | Historias de un paciente |
| documentos | paciente_id | Documentos de un paciente |

---

## 🔄 Ciclo de Vida de un Turno

```
1. PENDIENTE (inicial)
   └─ Cliente crea turno
   
2. CONFIRMADO
   └─ Doctor o admin confirma
   
3. EN_CONSULTA
   └─ Durante la consulta
   
4. ATENDIDO
   └─ Se crear Historia Clínica
   └─ Se adjuntan Estudios
   
5. AUSENTE / CANCELADO
   └─ Final (sin historia)
```

---

## 💡 MEJORES PRÁCTICAS

### ✅ HACER:
- Usar transacciones para múltiples inserciones
- Verificar integridad referencial
- Usar índices para búsquedas frecuentes
- Hacer backups regularmente
- Auditar cambios de datos sensibles

### ❌ NO HACER:
- Eliminar directamente (usar soft delete)
- Confiar solo en constraints
- Almacenar contraseñas en texto plano
- Hacer queries sin índices
- Exponer la password_hash en respuestas de API

---

## 📞 Soporte

Para más información, consulta:
- `INSTRUCCIONES.md` - Paso a paso para ejecutar en Supabase
- `schema.sql` - Script SQL completo
- `BCRYPT_HASHES.sql` - Información de contraseñas

---

Última actualización: 25 de febrero, 2026
