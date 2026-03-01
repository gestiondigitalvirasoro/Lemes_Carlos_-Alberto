-- Script para agregar tabla DocumentacionClinica y referencias de secciones en HistoriaClinica
-- Este script agrega los IDs de las subsecciones a la historia clínica para trazabilidad

-- 1. Crear tabla documentacion_clinica
CREATE TABLE IF NOT EXISTS documentacion_clinica (
    id BIGSERIAL PRIMARY KEY,
    historia_clinica_id BIGINT NOT NULL,
    titulo VARCHAR(255),
    contenido TEXT,
    tipo_documento VARCHAR(50) DEFAULT 'informe',  -- ej: "informe", "nota", "prescripcion"
    archivo_url VARCHAR(500),
    nombre_archivo VARCHAR(255),
    archivo_mime_type VARCHAR(100),
    tamaño_bytes BIGINT,
    observaciones TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_documentacion_historia FOREIGN KEY (historia_clinica_id) 
        REFERENCES historias_clinicas(id) ON DELETE CASCADE
);

-- 2. Crear índices para documentacion_clinica
CREATE INDEX IF NOT EXISTS idx_documentacion_historia_id ON documentacion_clinica(historia_clinica_id);
CREATE INDEX IF NOT EXISTS idx_documentacion_tipo ON documentacion_clinica(tipo_documento);

-- 3. Agregar columnas de referencias a historias_clinicas (si no existen)
ALTER TABLE historias_clinicas 
ADD COLUMN IF NOT EXISTS signo_vital_principal_id BIGINT,
ADD COLUMN IF NOT EXISTS documentacion_principal_id BIGINT;

-- 4. Agregar restricciones de clave foránea
ALTER TABLE historias_clinicas
ADD CONSTRAINT IF NOT EXISTS fk_historias_signo_principal 
    FOREIGN KEY (signo_vital_principal_id) 
    REFERENCES signos_vitales(id) ON DELETE SET NULL;

ALTER TABLE historias_clinicas
ADD CONSTRAINT IF NOT EXISTS fk_historias_docu_principal 
    FOREIGN KEY (documentacion_principal_id) 
    REFERENCES documentacion_clinica(id) ON DELETE SET NULL;

-- 5. Crear índices para las nuevas columnas
CREATE INDEX IF NOT EXISTS idx_historias_signo_principal_id ON historias_clinicas(signo_vital_principal_id);
CREATE INDEX IF NOT EXISTS idx_historias_docu_principal_id ON historias_clinicas(documentacion_principal_id);

-- 6. Actualizar Prisma para que signos_vitales tenga la relación bidireccional
-- (Esta parte se maneja en el schema.prisma, no en SQL)

-- Verificación
SELECT 'Schema actualizado correctamente' as status;

-- Información sobre los cambios
/*
CAMBIOS REALIZADOS:
✅ Tabla documentacion_clinica creada
   - Almacena documentación clínica relacionada a cada historia
   - Soporta archivos e información de documentos
   
✅ Campos agregados a historias_clinicas:
   - signo_vital_principal_id: Referencia al SignoVital principal
   - documentacion_principal_id: Referencia a la Documentación principal
   
✅ Índices creados para optimización:
   - idx_documentacion_historia_id
   - idx_documentacion_tipo
   - idx_historias_signo_principal_id
   - idx_historias_docu_principal_id

PRÓXIMOS PASOS EN CÓDIGO:
1. Backend: Actualizar endpoint PUT /api/historia/:id
   - Guardar signo_vital_principal_id cuando se crea el primer signo vital
   - Guardar documentacion_principal_id cuando se crea la primera documentación
   
2. Backend: Guardar nueva documentación en tabla documentacion_clinica
   
3. Frontend: Mostrar datos desde documentacion_clinica en lugar de estudios_adjuntos
*/

