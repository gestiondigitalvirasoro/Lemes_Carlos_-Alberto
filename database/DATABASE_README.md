# 🏥 LEMES - Base de Datos del Sistema Médico

## 📋 Fase 1: Base de Datos Completada ✅

Este directorio contiene todos los archivos necesarios para crear y gestionar la base de datos PostgreSQL del sistema médico "LEMES" en Supabase.

---

## 📁 Archivos incluidos

### 1. **`schema.sql`** 
**El archivo PRINCIPAL - Script SQL completo y listo para ejecutar**

Contiene:
- ✅ 7 tablas principales (usuarios, pacientes, turnos, historias_clinicas, estudios_adjuntos, documentos, sesiones)
- ✅ Tipos ENUM para roles y estados
- ✅ Foreign keys con integridad referencial
- ✅ Índices en columnas críticas
- ✅ Triggers automáticos para updated_at
- ✅ 3 vistas SQL para reportes
- ✅ 2 funciones personalizadas
- ✅ Datos de prueba (usuarios y pacientes)
- ✅ 100% compatible con Supabase PostgreSQL

**Tamaño:** ~1.200 líneas de SQL profesional

---

### 2. **`INSTRUCCIONES.md`**
**Guía paso a paso para ejecutar en Supabase**

Incluye:
- 🔐 Cómo generar contraseñas bcrypt reales
- 📝 Pasos para copiar y ejecutar el script
- 🧪 Verifying que se ejecutó correctamente
- 📊 Descripción de vistas y funciones creadas
- ⚙️ Cómo modificar enums y restricciones
- 🚀 Próximos pasos para conectar desde Node.js

---

### 3. **`BCRYPT_HASHES.sql`**
**Contraseñas hasheadas listas para usar**

Contiene:
- 🔑 Hashes bcrypt reales de las 3 credenciales de prueba
- 📋 Tabla de referencia de usuario/contraseña/hash
- 💻 Código Node.js para generar nuevos hashes
- 🔄 Ejemplos de cambio de contraseña
- 📊 Queries de auditoría de seguridad

**Usuarios de prueba con contraseñas:**
```
admin@lemes.com / admin123
doctor@lemes.com / doctor123
secretaria@lemes.com / secretaria123
```

---

### 4. **`REFERENCIA_RAPIDA.md`**
**Cheat sheet completo de la base de datos**

Contiene:
- 📊 Estructura de todas las tablas
- 🔗 Relaciones y foreign keys
- 📈 Vistas disponibles
- 🔧 Funciones personalizadas
- 🔐 Enums y tipos
- 📋 Queries comunes
- ⚡ Índices de optimización

---

### 5. **`ejemplos_queries.js`**
**Ejemplos de Node.js para interactuar con Supabase**

Contiene:
- 🔐 Funciones de autenticación (login, crear usuario, cambiar contraseña)
- 👨‍⚕️ Gestión de pacientes
- 📅 Gestión de turnos
- 📋 Gestión de historias clínicas
- 📊 Reportes y estadísticas
- 💬 Ejemplo completo de flujo (crear turno → crear historia → adjuntar estudio)

---

## 🚀 Inicio Rápido

### Paso 1: Ejecutar el script SQL
```bash
1. Ve a https://supabase.com → Tu proyecto
2. Abre "SQL Editor"
3. Copia TODO el contenido de schema.sql
4. Pégalo en el editor
5. Presiona "RUN" o Ctrl+Enter
6. Verifica que diga "Query Successful"
```

### Paso 2: Usar en Node.js
```bash
npm install @supabase/supabase-js bcryptjs
```

```javascript
const supabase = require('@supabase/supabase-js').createClient(
  'https://your-project.supabase.co',
  'your-anon-key'
);

// Usa cualquier función del archivo ejemplos_queries.js
```

---

## 📊 Estructura de Datos

```
Sistema Médico LEMES
├── usuarios (7 campos)
│   ├── turnos (9 campos)
│   ├── sesiones (8 campos)
│   └── historias_clinicas (10 campos)
│
├── pacientes (11 campos)
│   ├── turnos
│   ├── historias_clinicas
│   └── documentos (10 campos)
│
└── historias_clinicas
    └── estudios_adjuntos (10 campos)
```

---

## 🔐 Seguridad

- **Contraseñas:** Hasheadas con bcrypt (costo 10)
- **IDs:** BIGSERIAL (soporta billones de registros)
- **Integridad referencial:** Foreign keys con ON DELETE CASCADE/RESTRICT
- **Timestamps:** Actualizados automáticamente por triggers
- **Índices:** 20+ índices para optimizar queries
- **Roles:** 3 tipos (admin, doctor, secretaria)

---

## 📈 Vistas Disponibles

| Vista | Propósito |
|-------|-----------|
| `v_turnos_proximos` | Próximas citas sin cancelar |
| `v_resumen_pacientes` | Resumen de pacientes con estadísticas |
| `v_carga_doctores` | Carga de trabajo de cada doctor |

**Ejemplo:**
```sql
SELECT * FROM v_turnos_proximos;
SELECT * FROM v_carga_doctores WHERE nombre_completo LIKE 'Juan%';
```

---

## 🔧 Funciones Disponibles

```sql
-- Calcular edad de paciente
SELECT calcular_edad_paciente('1990-05-15'::DATE);

-- Verificar disponibilidad de doctor
SELECT doctor_disponible(1, NOW() + INTERVAL '1 day', INTERVAL '30 minutes');
```

---

## 📋 Estados de Turnos

```
pendiente → confirmado → en_consulta → atendido
                      ↘ cancelado
                      ↘ ausente
```

---

## 🎯 Requisitos Cumplidos

- ✅ 7 tablas principales
- ✅ Primary keys (BIGSERIAL)
- ✅ Foreign keys correctas
- ✅ Índices estratégicos
- ✅ Timestamps automáticos
- ✅ ON DELETE CASCADE/RESTRICT
- ✅ CHECK constraints
- ✅ ENUM roles y estados
- ✅ Datos de prueba
- ✅ Contraseñas hasheadas bcrypt
- ✅ 100% compatible Supabase

---

## 🔄 Próximos Pasos

### Fase 2 (Próxima)
- [ ] Crear rutas API (Express.js)
- [ ] Implementar autenticación JWT
- [ ] Validaciones de datos
- [ ] Error handling
- [ ] Middleware de autenticación

### Fase 3
- [ ] Frontend (React)
- [ ] Dashboard de admin
- [ ] Calendario de turnos
- [ ] Historias clínicas interactivas

---

## 📚 Documentación Completa

| Archivo | Para qué |
|---------|----------|
| `schema.sql` | Ejecutar en Supabase |
| `INSTRUCCIONES.md` | Cómo ejecutar paso a paso |
| `BCRYPT_HASHES.sql` | Contraseñas y seguridad |
| `REFERENCIA_RAPIDA.md` | Consultas rápidas (cheat sheet) |
| `ejemplos_queries.js` | Código Node.js listo para usar |
| `DATABASE_README.md` | Este archivo |

---

## 🆘 Solución de Problemas

### Error: "tipo ya existe"
→ Los enums ya fueron creados. Ejecuta el script solo una vez.

### Error: "relación ya existe"
→ Las tablas ya existen. Para recrear, primero haz:
```sql
DROP TABLE IF EXISTS sesiones CASCADE;
DROP TABLE IF EXISTS documentos CASCADE;
DROP TABLE IF EXISTS estudios_adjuntos CASCADE;
DROP TABLE IF EXISTS historias_clinicas CASCADE;
DROP TABLE IF EXISTS turnos CASCADE;
DROP TABLE IF EXISTS pacientes CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;
```

### No puedo conectar desde Node.js
→ Verifica:
1. SUPABASE_URL correcto
2. SUPABASE_KEY válida
3. npm install @supabase/supabase-js

### Contraseña bcrypt no funciona
→ Asegúrate que el hash:
- Comienza con `$2a$`, `$2b$` o `$2y$`
- Tiene exactamente 60 caracteres
- No tiene espacios adicionales

---

## 📞 Información de Contacto

- **Sistema:** LEMES Medical
- **Versión BD:** PostgreSQL 13+
- **Plataforma:** Supabase
- **Creado:** 25 de Febrero, 2026

---

## 📝 Notas

- Este script está 100% listo para producción (con cambio de contraseñas)
- Incluye comentarios detallados en el SQL
- Las vistas y funciones son totalmente opcionales pero recomendadas
- Se pueden agregar más tablas sin afectar la estructura existente

---

## ✅ Verificación

Para verificar que todo se creó correctamente:

```sql
-- Ver todas las tablas
SELECT tablename FROM pg_tables WHERE schemaname = 'public';

-- Ver todas las vistas
SELECT viewname FROM pg_views WHERE schemaname = 'public';

-- Ver funciones personalizadas
SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public';

-- Contar registros
SELECT 'usuarios' as tabla, COUNT(*) as registros FROM usuarios
UNION ALL
SELECT 'pacientes', COUNT(*) FROM pacientes
UNION ALL
SELECT 'turnos', COUNT(*) FROM turnos;
```

---

**¡Listo para la Fase 2!** 🚀
