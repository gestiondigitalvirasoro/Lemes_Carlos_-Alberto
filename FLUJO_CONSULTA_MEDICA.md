# 📋 Flujo Completo de Consulta Médica - CLINICALEMES

## Descripción General

Sistema de consulta médica mejorado que permite al doctor trabajar con la agenda y la historia clínica en paralelo, en dos pestañas diferentes del navegador.

---

## 🔄 Flujo Paso a Paso

### **PASO 1: Dashboard del Doctor**
- **Ubicación:** `/doctor/dashboard` o `/doctor/agenda`
- **Acción:** El doctor ve la lista de turnos del día
- **Estados mostrados:** PENDIENTE, EN_CONSULTA, FINALIZADA, CANCELADA

---

### **PASO 2: Iniciar Consulta** ⭐
- **Botón:** "Iniciar Consulta" (en la tarjeta/fila del turno)
- **Función:** `iniciarConsultaTurno(turnoId)`
- **Lo que sucede:**

#### 2.1 Cambio de Estado
```
PENDIENTE → EN_CONSULTA
```
- Se hace un PATCH a `/api/turnos/:id/estado` con `estado: 'EN_CONSULTA'`
- El servidor valida que el turno esté en PENDIENTE
- El servidor retorna `paciente_id` en la respuesta

#### 2.2 Apertura Automática de Pestaña
```
Pestaña 1: Dashboard (sigue mostrando agenda)
         ↓
Pestaña 2: Abre automáticamente → /doctor/pacientes/{paciente_id}?turno_id={turno_id}
```

**Nota:** Si el navegador bloquea pop-ups, el usuario debe permitirlos

---

### **PASO 3: Página del Paciente (Nueva Pestaña)**

#### 3.1 Búsqueda de Paciente en BD
- **Endpoint:** `GET /doctor/pacientes/:paciente_id`
- **Flujo:**

```
Si paciente existe en BD:
  └─ Cargar historia clínica existente
  └─ Mostrar datos previos (signos vitales, diagnósticos, etc.)

Si paciente NO existe en BD (NUEVO):
  └─ Obtener información del turno
  └─ Auto-crear el paciente con esa información
  └─ Guardar en tabla `paciente` automáticamente
  └─ Mostrar formulario VACÍO para rellenar
```

#### 3.2 Datos Auto-creados del Paciente
```javascript
{
  persona_id: persona.id,           // De los datos del turno
  obra_social: persona.obra_social, // Si existen
  numero_afiliado: persona.numero_afiliado,
  activo: true                      // El paciente está activo
}
```

---

### **PASO 4: Formulario de Historia Clínica**

La página `/doctor/pacientes/:paciente_id` muestra un formulario completo con secciones:

#### Secciones Disponibles:

1. **Signos Vitales**
   - Presión arterial (sistólica/diastólica)
   - Frecuencia cardíaca
   - Temperatura (°C)
   - Peso (kg)
   - Talla (cm)
   - Glucemia (mg/dL)
   - IMC (calculado)

2. **Motivo de Consulta**
   - Textarea: ¿Por qué viene el paciente?

3. **Enfermedad Actual**
   - Textarea: Historia de la enfermedad actual

4. **Antecedentes Patológicos**
   - Textarea: Antecedentes médicos

5. **Diagnósticos**
   - Búsqueda en BD CIE-10
   - Agregar múltiples diagnósticos
   - Marcar diagnóstico principal (⭐)

6. **Estudios Complementarios**
   - Agregar exámenes de laboratorio
   - Nombre, resultado, unidad, rango de referencia

7. **Documentos Adjuntos**
   - Subir radiografías, PDFs, etc.
   - Descargar o visualizar

8. **Plan de Tratamiento**
   - Medicamentos
   - Dosis
   - Frecuencia

---

### **PASO 5: Modo de Edición**

#### 5.1 Iniciar Edición
- **Botón:** "✏️ Editar"
- **Cambios visuales:**
  - Los campos readonly se vuelven editables (input/textarea con borde azul)
  - Aparecen campos para agregar estudios y documentos
  - Botones de "Eliminar" aparecen en documentos/estudios

#### 5.2 Editar Campos
- Cambiar valores en signos vitales
- Escribir/modificar motivo, anamnesis, etc.
- Agregar diagnósticos del CIE-10
- Subir documentos
- Añadir estudios complementarios

---

### **PASO 6: Guardar Cambios** ✅

#### 6.1 Hacer Clic en "Guardar"
- **Botón:** "✓ Guardar Cambios"
- **Endpoint:** `POST /api/doctor/signos-vitales`

#### 6.2 Datos Enviados
```javascript
{
  historia_clinica_id: historiaId,
  presion_sistolica: "120",
  presion_diastolica: "80",
  frecuencia_cardiaca: "72",
  temperatura: "36.5",
  peso: "75",
  talla: "175",
  glucemia: "95"
  // ... más campos
}
```

#### 6.3 Respuesta del Servidor
- ✅ Si éxito: `{ success: true, message: "..." }`
  - Mostrar alert: "✅ Cambios guardados exitosamente!"
  - Recargar la página
  - Volver a modo lectura (campos readonly)

- ❌ Si error:
  - Mostrar error con detalles
  - Permitir al doctor intentar nuevamente

---

### **PASO 7: Volver al Dashboard**

#### 7.1 Cerrar Pestaña de Historia
- El doctor cierra la pestaña 2 (historia clínica)
- Vuelve a la Pestaña 1 (dashboard)

#### 7.2 Actualizar Vista
- Presionar F5 o el botón de actualizar
- Los turnos deben estar actualizados
- El turno debe mostrar estado **EN_CONSULTA**

---

### **PASO 8: Finalizar Consulta** ✓

#### 8.1 Botón "Finalizar Consulta"
- **Ubicación:** Dashboard, en el turno EN_CONSULTA
- **Función:** `finalizarConsultaTurno(turnoId)`
- **Cambio de estado:**
```
EN_CONSULTA → FINALIZADA
```

#### 8.2 Validación
- El servidor valida que turno esté EN_CONSULTA
- No permite finalizar si está en otro estado
- Retorna error 409 si hay conflicto

#### 8.3 Confirmación
- Se muestra un alert: "✅ Consulta finalizada correctamente"
- Se recarga la tabla de turnos
- El turno aparece como FINALIZADA

---

### **PASO 9: Alternativa - Cancelar Consulta** ✗

Si el doctor necesita cancelar:

#### 9.1 Botón "Cancelar Consulta"
- **Cambio de estado:**
```
EN_CONSULTA → CANCELADA
```
o
```
PENDIENTE → CANCELADA
```

#### 9.2 Confirmación
- Se pide confirmación al doctor
- Se actualiza el turno
- Se recarga la tabla

---

## 🗄️ Estados del Turno

| ID | Estado | Descripción |
|---|---|---|
| 7 | PENDIENTE | Turno próximo sin iniciar |
| 8 | EN_CONSULTA | Doctor está atendiendo |
| 9 | FINALIZADA | Consulta completada |
| 10 | CANCELADA | Consulta cancelada |

**Importante:** Los IDs son **7, 8, 9, 10** (NO 1, 2, 3, 4)

---

## 🔌 Endpoints Utilizados

### Estado del Turno
```
PATCH /api/turnos/:id/estado
Body: { estado: 'EN_CONSULTA' | 'FINALIZADA' | 'CANCELADA' }
Response: { success: true, data: { paciente_id, ... } }
```

### Obtener/Crear Paciente
```
GET /doctor/pacientes/:paciente_id?turno_id={turno_id}
Response: Vista HTML (historia-detalle.ejs)
```

### Guardar Signos Vitales
```
POST /api/doctor/signos-vitales
Body: { historia_clinica_id, presion_sistolica, ... }
Response: { success: true, message: "..." }
```

---

## 🖼️ Diagrama de Flujo

```
┌─ DASHBOARD ──────────────────┐
│  Lista de Turnos             │
│  Estado: PENDIENTE           │
│                              │
│  [Iniciar Consulta] ◄─────┐  │
└──────────────────────────┬─┘  │
                           │    │
                ┌──────────────────────┐
                │ 1. Cambiar estado    │
                │    PENDIENTE→        │
                │    EN_CONSULTA       │
                │ 2. Obtener paciente_id
                └─────────┬────────────┘
                          │
        ┌─────────────────┴─────────────────┐
        │                                   │
   PESTAÑA 1              ┌───────────────────────┐
   Dashboard              │ PESTAÑA 2             │
   (Sigue visible)        │ /doctor/pacientes     │
                          │                       │
                          │ ¿Paciente existe?     │
                          │   ├─ SI: cargar datos │
                          │   └─ NO: crear nuevo  │
                          │                       │
                          │ Mostrar formulario    │
                          │ Historia Clínica      │
                          │                       │
                          │ [Editar] ────────┐    │
                          │ [Guardar] ◄──────┤    │
                          │ [Cancelar] ◄─────┤    │
                          │                  │    │
                          │ [Cerrar pestaña] │    │
                          └────────┬─────────────┘
                                   │
        ┌──────────────────────────┘
        │
   PESTAÑA 1
   DashBoard
   Estado: EN_CONSULTA
   
   [Finalizar Consulta]
   │
   └──► EN_CONSULTA → FINALIZADA
        ✅ CONSULTA COMPLETADA
```

---

## ⚠️ Notas Importantes

### 1. **Auto-creación de Pacientes**
- Si el paciente no existe, se crea automáticamente cuando se abre la pestaña de historia
- Se usa información del turno (persona_id, obra_social, etc.)
- El formulario se muestra vacío, listo para llenar

### 2. **IDs de Estados**
```javascript
{
  PENDIENTE: BigInt(7),
  EN_CONSULTA: BigInt(8),
  FINALIZADA: BigInt(9),
  CANCELADA: BigInt(10)
}
```

### 3. **URL con turno_id**
```
/doctor/pacientes/{paciente_id}?turno_id={turno_id}
```
El parámetro `turno_id` se necesita para crear el paciente si no existe

### 4. **Bloqueo de Pop-ups**
Si el navegador bloquea la apertura automática de la pestaña:
1. Permitir pop-ups para este sitio
2. Hacer clic en "Iniciar Consulta" nuevamente
3. La nueva pestaña se abrirá

### 5. **Guardar Cambios**
El guardado se realiza mediante:
- `POST /api/doctor/signos-vitales` - para signos vitales
- Otros endpoints para diagnósticos, documentos, etc.

---

## ✅ Checklist de Verificación

- [ ] Turno cambia a EN_CONSULTA al hacer clic en "Iniciar Consulta"
- [ ] Se abre automáticamente la pestaña de historia clínica
- [ ] Si paciente es nuevo, se auto-crea y muestra formulario vacío
- [ ] Si paciente existe, se cargan sus datos previos
- [ ] Se pueden editar todos los campos (signos vitales, diagnósticos, etc.)
- [ ] Se puede guardar sin errores
- [ ] El turno sigue mostrando EN_CONSULTA en el dashboard
- [ ] Se puede hacer clic en "Finalizar Consulta"
- [ ] El turno cambia a FINALIZADA
- [ ] Se puede cerrar la pestaña de historia y volver al dashboard

---

## 🐛 Troubleshooting

| Problema | Solución |
|----------|----------|
| No abre la pestaña de historia | Permitir pop-ups en el navegador |
| "Paciente no encontrado" | Verificar que el turno tiene persona_id |
| Error 500 al guardar | Revisar errores en consola del navegador |
| Estado no cambia | Verificar que el token está en localStorage |
| Campos no se editan | Hacer clic en el botón "Editar" primero |

---

**Documento generado:** Marzo 2026  
**Versión:** 1.0  
**Estado:** ✅ Implementación Completa
