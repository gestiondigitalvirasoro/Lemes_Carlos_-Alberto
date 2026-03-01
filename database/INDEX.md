# 📑 ÍNDICE - DOCUMENTACIÓN BASE DE DATOS LEMES

## 🚀 Empezar aquí

### Para ejecutar por PRIMERA VEZ:
1. Lee → [INSTRUCCIONES.md](INSTRUCCIONES.md)
2. Copia → [schema.sql](schema.sql)
3. Pega en Supabase SQL Editor
4. ¡Listo!

---

## 📚 Documentación Completa

### 🔴 ARCHIVO PRINCIPAL
| Archivo | Propósito | Tamaño |
|---------|-----------|--------|
| **`schema.sql`** | Script SQL profesional listo para ejecutar en Supabase | 1.200+ líneas |

### 📖 GUÍAS
| Archivo | Para qué | Lectura |
|---------|----------|---------|
| **`INSTRUCCIONES.md`** | Paso a paso: Cómo ejecutar el script en Supabase | 10 min |
| **`RESUMEN_FASE_1.md`** | Resumen ejecutivo de lo que se creó | 5 min |
| **`DATABASE_README.md`** | Documentación completa de la BD | 15 min |

### 📋 REFERENCIA RÁPIDA
| Archivo | Contenido | Búsqueda |
|---------|-----------|----------|
| **`REFERENCIA_RAPIDA.md`** | Cheat sheet: Estructura de todas las tablas, vistas, funciones | Ctrl+F |
| **`BCRYPT_HASHES.sql`** | Contraseñas hasheadas + cómo generar nuevas | Contraseña |

### 💻 CÓDIGO
| Archivo | Para qué | Líneas |
|---------|----------|--------|
| **`ejemplos_queries.js`** | Funciones Node.js listas para usar con Supabase | 500+ |
| **`.env.example`** | Variables de entorno para configurar | Template |

---

## 🎯 MAPA DE USO POR PERFIL

### 👨‍💼 Product Manager / Gerente
```
1. Lee: RESUMEN_FASE_1.md (5 min)
2. Lee: REFERENCIA_RAPIDA.md (10 min)
3. Entendimiento: ✅
```

### 👨‍💻 Desarrollador Backend
```
1. Lee: INSTRUCCIONES.md (5 min)
2. Ejecuta: schema.sql en Supabase (1 min)
3. Estudia: REFERENCIA_RAPIDA.md (10 min)
4. Usa: ejemplos_queries.js (10 min)
5. Configura: .env.example (2 min)
6. Desarrollo: ✅
```

### 🔐 DevOps / DBA
```
1. Lee: DATABASE_README.md (10 min)
2. Revisa: schema.sql estructura (10 min)
3. Estudia: BCRYPT_HASHES.sql (5 min)
4. Valida: REFERENCIA_RAPIDA.md (5 min)
5. Deploy: ✅
```

### 🎨 Desarrollador Frontend
```
1. Lee: DATABASE_README.md (skim) (5 min)
2. Consulta: REFERENCIA_RAPIDA.md para estructura (10 min)
3. Usa: ejemplos_queries.js para conexión (10 min)
4. Integración: ✅
```

---

## 📊 ESQUEMA RÁPIDO

```
USUARIOS (3 de prueba)
├── admin@lemes.com / admin123
├── doctor@lemes.com / doctor123
└── secretaria@lemes.com / secretaria123

PACIENTES (2 de prueba)
├── DNI: 12345678A / HC-2026-001
└── DNI: 87654321B / HC-2026-002

TURNOS
├── Estados: pendiente, confirmado, en_consulta, atendido, ausente, cancelado
└── Relaciones: paciente + doctor + notificaciones

HISTORIAS_CLINICAS
├── Diagnóstico, tratamiento, medicamentos
├── Estudios adjuntos (radiografías, análisis, etc.)
└── Documentos del paciente

SESIONES
└── Control de login/logout de usuarios
```

---

## 🔍 BÚSQUEDA RÁPIDA

### Quiero saber...

| Pregunta | Archivo | Dónde |
|----------|---------|-------|
| ¿Cuál es la estructura de la tabla usuarios? | REFERENCIA_RAPIDA.md | Sección "1️⃣ USUARIOS" |
| ¿Cuáles son las relaciones entre tablas? | REFERENCIA_RAPIDA.md | Sección "Relaciones" |
| ¿Cómo agregar un nuevo rol? | INSTRUCCIONES.md | Sección "Modificar eventos..." |
| ¿Cómo crear un usuario? | ejemplos_queries.js | Función `crearUsuario()` |
| ¿Cuál es el estado 'en_consulta'? | REFERENCIA_RAPIDA.md | Sección "Estados de Turnos" |
| ¿Las contraseñas están seguras? | BCRYPT_HASHES.sql | Todo el archivo |
| ¿Cómo insertar un turno? | ejemplos_queries.js | Función `crearTurno()` |
| ¿Cuáles son las vistas disponibles? | REFERENCIA_RAPIDA.md | Sección "Vistas" |
| ¿Dónde obtener credenciales Supabase? | .env.example | Sección "Cómo obtener" |

---

## ✅ CHECKLIST DE CONFIGURACIÓN

```
□ Leo INSTRUCCIONES.md
□ Copiar schema.sql
□ Ejecuto en Supabase SQL Editor
□ Durmiente que se ejecutó correctamente
□ Configuro .env.example → .env
□ npm install @supabase/supabase-js
□ Pruebo conexión con ejemplos_queries.js
□ ¡Listo para Fase 2!
```

---

## 🎓 ORDEN RECOMENDADO DE LECTURA

### Si tienes 15 minutos:
1. RESUMEN_FASE_1.md (5 min)
2. INSTRUCCIONES.md puntos clave (5 min)
3. REFERENCIA_RAPIDA.md estructura (5 min)

### Si tienes 30 minutos:
1. DATABASE_README.md completo (15 min)
2. REFERENCIA_RAPIDA.md (15 min)

### Si tienes 1 hora:
1. Todos los .md (40 min)
2. Revisa schema.sql estructura (10 min)
3. Estudia ejemplos_queries.js (10 min)

---

## 📞 REFERENCIAS RÁPIDAS

### Archivos por ROL

**Base de Datos (SQL)**
```
schema.sql
BCRYPT_HASHES.sql
```

**Documentación (Markdown)**
```
INSTRUCCIONES.md
REFERENCIA_RAPIDA.md
DATABASE_README.md
RESUMEN_FASE_1.md
```

**Código (JavaScript)**
```
ejemplos_queries.js
.env.example
```

---

## 🚀 EJECUCIÓN PASO A PASO

### Paso 1: Preparación (2 min)
→ Ir a Supabase.com y crear proyecto

### Paso 2: Ejecutar Script (2 min)
→ Ver INSTRUCCIONES.md "Paso 2"

### Paso 3: Configurar Entorno (3 min)
→ Copiar .env.example → .env
→ Llenar credenciales Supabase

### Paso 4: Instalar Dependencias (2 min)
```bash
npm install @supabase/supabase-js bcryptjs
```

### Paso 5: Probar Conexión (2 min)
→ Ejecutar ejemplos_queries.js

### Paso 6: Desarrollo (∞)
→ Usar cualquier función de ejemplos_queries.js

---

## 🔐 INFORMACIÓN DE SEGURIDAD

**Contraseñas de Prueba:**
```
admin@lemes.com: admin123
doctor@lemes.com: doctor123
secretaria@lemes.com: secretaria123
```

⚠️ **IMPORTANTE:** Cambiar en producción
→ Ver BCRYPT_HASHES.sql

---

## 📊 ESTADÍSTICAS

| Item | Cantidad |
|------|----------|
| Tablas creadas | 7 |
| Vistas SQL | 3 |
| Funciones | 2 |
| Triggers | 7 |
| Índices | 20+ |
| Documentos | 8 |
| Código JavaScript | 20+ funciones |
| Líneas de SQL | 1.200+ |
| Líneas de documentación | 2.000+ |

---

## 🎯 ESTADOS DEL PROYECTO

```
Fase 1: Base de Datos ...................... ✅ COMPLETADO
Fase 2: API REST .......................... ⏳ PRÓXIMO
Fase 3: Frontend .......................... 📅 DESPUÉS
Fase 4: Despliegue ........................ 📅 FINAL
```

---

## 💡 TIPS ÚTILES

### Para consultar rápidamente:
```
Usa el buscador de GitHub (Ctrl+F en archivos .md)
Busca palabras clave: tabla, función, vista, constraint
```

### Para copiar código SQL:
```
1. Abre schema.sql
2. Selecciona solo la tabla que necesites
3. Copia en SQL Editor de Supabase
```

### Para usar funciones Node.js:
```
1. Abre ejemplos_queries.js
2. Copia la función que necesites
3. Úsala en tu código
```

---

## 🔄 VERSIONAMIENTO

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0 | 25/02/2026 | Lanzamiento inicial |

---

## 📧 CONTACTO / SOPORTE

```
Sistema: LEMES Medical
Documentación: Completa en español
Compatibilidad: Supabase PostgreSQL
Estado: Enterprise Ready ✅
```

---

## 🎉 ¡LISTO PARA COMENZAR!

**Siguiente paso:**
1. Abre [INSTRUCCIONES.md](INSTRUCCIONES.md)
2. Sigue paso a paso
3. ¡Disfruta! 🚀

---

**Última actualización:** 25 de febrero, 2026
