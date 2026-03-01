-- ============================================================================
-- NORMALIZACIÓN DE BASE DE DATOS - LEMES MEDICAL SYSTEM
-- ============================================================================
-- Este script reorganiza la BD en tablas normalizadas con Persona como centro

-- 1. CREAR TABLA PERSONAS (Centro de la normalización)
-- DNI (INT) es el identificador único del paciente
CREATE TABLE IF NOT EXISTS public.personas (
  id bigint NOT NULL DEFAULT nextval('personas_id_seq'::regclass),
  dni integer NOT NULL UNIQUE,
  telefono character varying(20),
  direccion text,
  email character varying(100),
  obra_social character varying(100),
  activo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT personas_pkey PRIMARY KEY (id),
  CONSTRAINT unique_dni_personas UNIQUE (dni)
);

-- Crear índices para persona
CREATE INDEX IF NOT EXISTS idx_personas_dni ON public.personas(dni);
CREATE INDEX IF NOT EXISTS idx_personas_email ON public.personas(email);
CREATE INDEX IF NOT EXISTS idx_personas_activo ON public.personas(activo);

-- ============================================================================
-- 2. ACTUALIZAR TABLA PACIENTES
-- ============================================================================
-- Agregar columna persona_id si no existe
ALTER TABLE public.pacientes 
ADD COLUMN IF NOT EXISTS persona_id bigint;

-- Agregar foreign key a personas
ALTER TABLE public.pacientes
ADD CONSTRAINT fk_pacientes_persona 
FOREIGN KEY (persona_id) REFERENCES public.personas(id) ON DELETE CASCADE;

-- Crear índice para persona_id
CREATE INDEX IF NOT EXISTS idx_pacientes_persona_id ON public.pacientes(persona_id);

-- ============================================================================
-- 3. ACTUALIZAR TABLA TURNOS
-- ============================================================================
-- Agregar columna persona_id si no existe
ALTER TABLE public.turnos 
ADD COLUMN IF NOT EXISTS persona_id bigint;

-- Agregar foreign key a personas
ALTER TABLE public.turnos
ADD CONSTRAINT fk_turnos_persona 
FOREIGN KEY (persona_id) REFERENCES public.personas(id) ON DELETE CASCADE;

-- Crear índice para persona_id
CREATE INDEX IF NOT EXISTS idx_turnos_persona_id ON public.turnos(persona_id);

-- ============================================================================
-- 4. CREAR TABLA CONTACTO_PACIENTE (Datos de contacto separados)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.contacto_paciente (
  id bigint NOT NULL DEFAULT nextval('contacto_paciente_id_seq'::regclass),
  persona_id bigint NOT NULL,
  telefono_principal character varying(20),
  telefono_secundario character varying(20),
  email_principal character varying(100),
  email_secundario character varying(100),
  direccion_principal text,
  direccion_secundaria text,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT contacto_paciente_pkey PRIMARY KEY (id),
  CONSTRAINT fk_contacto_persona FOREIGN KEY (persona_id) 
    REFERENCES public.personas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contacto_persona_id ON public.contacto_paciente(persona_id);

-- ============================================================================
-- 5. CREAR TABLA OBRA_SOCIAL (Datos de cobertura separados)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.obra_social_paciente (
  id bigint NOT NULL DEFAULT nextval('obra_social_paciente_id_seq'::regclass),
  persona_id bigint NOT NULL,
  nombre_obra_social character varying(100),
  numero_afiliado character varying(50),
  plan character varying(100),
  vigencia_desde date,
  vigencia_hasta date,
  cobertura_porcentaje numeric(5,2),
  activo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT obra_social_pkey PRIMARY KEY (id),
  CONSTRAINT fk_obra_social_persona FOREIGN KEY (persona_id) 
    REFERENCES public.personas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_obra_social_persona_id ON public.obra_social_paciente(persona_id);

-- ============================================================================
-- 6. CREAR TABLA DATOS_CLINICOS_PACIENTE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.datos_clinicos_paciente (
  id bigint NOT NULL DEFAULT nextval('datos_clinicos_paciente_id_seq'::regclass),
  persona_id bigint NOT NULL,
  alergias text,
  patologias_cronicas text,
  antecedentes_quirurgicos text,
  medicamentos_habituales text,
  nota_importante text,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT datos_clinicos_pkey PRIMARY KEY (id),
  CONSTRAINT fk_datos_clinicos_persona FOREIGN KEY (persona_id) 
    REFERENCES public.personas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_datos_clinicos_persona_id ON public.datos_clinicos_paciente(persona_id);

-- ============================================================================
-- 7. DATOS BÁSICOS PARA PRUEBA
-- ============================================================================
-- Crear secuencias si no existen
CREATE SEQUENCE IF NOT EXISTS personas_id_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS contacto_paciente_id_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS obra_social_paciente_id_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS datos_clinicos_paciente_id_seq START WITH 1 INCREMENT BY 1;

-- Insertar personas de prueba
INSERT INTO public.personas (dni, telefono, direccion, email, obra_social) 
VALUES 
  (12345678, '555-1111', 'Calle Principal 123', 'paciente1@example.com', 'OSDE'),
  (87654321, '555-2222', 'Avenida Central 456', 'paciente2@example.com', 'IOMA'),
  (99887766, '555-3333', 'Calle Secundaria 789', 'paciente3@example.com', 'Amistad')
ON CONFLICT (dni) DO NOTHING;

-- ============================================================================
-- FIN DEL SCRIPT DE NORMALIZACIÓN
-- ============================================================================
