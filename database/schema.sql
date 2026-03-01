-- ============================================================================
-- SISTEMA MÉDICO LEMES - Script de Base de Datos
-- Base de Datos: PostgreSQL (Supabase)
-- Autor: Lemes Medical System
-- Fecha: 2026-02-25
-- ============================================================================

-- ============================================================================
-- TIPOS Y ENUMS
-- ============================================================================

-- Crear tipo ENUM para roles de usuario
CREATE TYPE user_role AS ENUM ('admin', 'doctor', 'secretaria');

-- Crear tipo ENUM para estados de turnos
CREATE TYPE appointment_status AS ENUM (
    'pendiente',
    'confirmado',
    'en_consulta',
    'atendido',
    'ausente',
    'cancelado'
);

-- Crear tipo ENUM para género
CREATE TYPE gender_type AS ENUM ('masculino', 'femenino', 'otro');

-- Crear tipo ENUM para tipos de documentos
CREATE TYPE document_type AS ENUM (
    'cedula_identidad',
    'pasaporte',
    'licencia_conducir',
    'otro'
);

-- ============================================================================
-- TABLA: USUARIOS
-- ============================================================================
CREATE TABLE usuarios (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    role user_role NOT NULL DEFAULT 'secretaria',
    telefono VARCHAR(20),
    direccion TEXT,
    activo BOOLEAN DEFAULT TRUE,
    ultimo_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para usuarios
CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_role ON usuarios(role);
CREATE INDEX idx_usuarios_activo ON usuarios(activo);

-- ============================================================================
-- TABLA: PACIENTES
-- ============================================================================
CREATE TABLE pacientes (
    id BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT,
    dni VARCHAR(20) UNIQUE,
    fecha_nacimiento DATE,
    genero gender_type,
    numero_historia_clinica VARCHAR(20) UNIQUE,
    numero_emergencia VARCHAR(20),
    contacto_emergencia VARCHAR(255),
    alergias TEXT,
    patologias_cronicas TEXT,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    CONSTRAINT fk_pacientes_usuario 
        FOREIGN KEY (usuario_id) 
        REFERENCES usuarios(id) 
        ON DELETE SET NULL
        ON UPDATE CASCADE
);

-- Índices para pacientes
CREATE INDEX idx_pacientes_dni ON pacientes(dni);
CREATE INDEX idx_pacientes_usuario_id ON pacientes(usuario_id);
CREATE INDEX idx_pacientes_numero_historia ON pacientes(numero_historia_clinica);

-- ============================================================================
-- TABLA: TURNOS (CITAS)
-- ============================================================================
CREATE TABLE turnos (
    id BIGSERIAL PRIMARY KEY,
    paciente_id BIGINT NOT NULL,
    doctor_id BIGINT NOT NULL,
    fecha_hora TIMESTAMP WITH TIME ZONE NOT NULL,
    duracion_minutos INTEGER DEFAULT 30,
    estado appointment_status DEFAULT 'pendiente',
    motivo TEXT,
    notas TEXT,
    sala_atencion VARCHAR(50),
    precio_consulta DECIMAL(10, 2),
    pagado BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    CONSTRAINT fk_turnos_paciente 
        FOREIGN KEY (paciente_id) 
        REFERENCES pacientes(id) 
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_turnos_doctor 
        FOREIGN KEY (doctor_id) 
        REFERENCES usuarios(id) 
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    
    -- Check Constraints
    CONSTRAINT check_duracion_positiva 
        CHECK (duracion_minutos > 0),
    CONSTRAINT check_fecha_futura 
        CHECK (fecha_hora > CURRENT_TIMESTAMP)
);

-- Índices para turnos
CREATE INDEX idx_turnos_paciente_id ON turnos(paciente_id);
CREATE INDEX idx_turnos_doctor_id ON turnos(doctor_id);
CREATE INDEX idx_turnos_fecha_hora ON turnos(fecha_hora);
CREATE INDEX idx_turnos_estado ON turnos(estado);
CREATE INDEX idx_turnos_fecha_doctor ON turnos(doctor_id, fecha_hora);

-- ============================================================================
-- TABLA: HISTORIAS CLÍNICAS
-- ============================================================================
CREATE TABLE historias_clinicas (
    id BIGSERIAL PRIMARY KEY,
    paciente_id BIGINT NOT NULL,
    doctor_id BIGINT NOT NULL,
    turno_id BIGINT,
    fecha DATE DEFAULT CURRENT_DATE,
    diagnostico TEXT,
    tratamiento TEXT,
    medicamentos TEXT,
    antecedentes TEXT,
    examen_fisico TEXT,
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    CONSTRAINT fk_historias_paciente 
        FOREIGN KEY (paciente_id) 
        REFERENCES pacientes(id) 
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_historias_doctor 
        FOREIGN KEY (doctor_id) 
        REFERENCES usuarios(id) 
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_historias_turno 
        FOREIGN KEY (turno_id) 
        REFERENCES turnos(id) 
        ON DELETE SET NULL
        ON UPDATE CASCADE
);

-- Índices para historias clínicas
CREATE INDEX idx_historias_paciente_id ON historias_clinicas(paciente_id);
CREATE INDEX idx_historias_doctor_id ON historias_clinicas(doctor_id);
CREATE INDEX idx_historias_turno_id ON historias_clinicas(turno_id);
CREATE INDEX idx_historias_fecha ON historias_clinicas(fecha);

-- ============================================================================
-- TABLA: ESTUDIOS ADJUNTOS
-- ============================================================================
CREATE TABLE estudios_adjuntos (
    id BIGSERIAL PRIMARY KEY,
    historia_clinica_id BIGINT NOT NULL,
    tipo_estudio VARCHAR(100) NOT NULL,
    descripcion TEXT,
    archivo_url VARCHAR(500),
    nombre_archivo VARCHAR(255),
    archivo_mime_type VARCHAR(100),
    tamaño_bytes BIGINT,
    resultado TEXT,
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    CONSTRAINT fk_estudios_historia 
        FOREIGN KEY (historia_clinica_id) 
        REFERENCES historias_clinicas(id) 
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- Índices para estudios adjuntos
CREATE INDEX idx_estudios_historia_id ON estudios_adjuntos(historia_clinica_id);
CREATE INDEX idx_estudios_tipo ON estudios_adjuntos(tipo_estudio);

-- ============================================================================
-- TABLA: DOCUMENTOS
-- ============================================================================
CREATE TABLE documentos (
    id BIGSERIAL PRIMARY KEY,
    paciente_id BIGINT NOT NULL,
    tipo_documento document_type NOT NULL,
    numero_documento VARCHAR(50),
    descripcion TEXT,
    archivo_url VARCHAR(500),
    nombre_archivo VARCHAR(255),
    archivo_mime_type VARCHAR(100),
    tamaño_bytes BIGINT,
    fecha_vencimiento DATE,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    CONSTRAINT fk_documentos_paciente 
        FOREIGN KEY (paciente_id) 
        REFERENCES pacientes(id) 
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- Índices para documentos
CREATE INDEX idx_documentos_paciente_id ON documentos(paciente_id);
CREATE INDEX idx_documentos_tipo ON documentos(tipo_documento);
CREATE INDEX idx_documentos_numero ON documentos(numero_documento);

-- ============================================================================
-- TABLA: SESIONES
-- ============================================================================
CREATE TABLE sesiones (
    id BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT NOT NULL,
    token_refresh VARCHAR(500),
    ip_address INET,
    user_agent TEXT,
    fecha_inicio TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    fecha_fin TIMESTAMP WITH TIME ZONE,
    activa BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    CONSTRAINT fk_sesiones_usuario 
        FOREIGN KEY (usuario_id) 
        REFERENCES usuarios(id) 
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- Índices para sesiones
CREATE INDEX idx_sesiones_usuario_id ON sesiones(usuario_id);
CREATE INDEX idx_sesiones_activa ON sesiones(activa);
CREATE INDEX idx_sesiones_fecha_inicio ON sesiones(fecha_inicio);

-- ============================================================================
-- TRIGGERS AUTOMÁTICOS PARA updated_at
-- ============================================================================

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION actualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para cada tabla
CREATE TRIGGER trigger_usuarios_updated_at
    BEFORE UPDATE ON usuarios
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_updated_at();

CREATE TRIGGER trigger_pacientes_updated_at
    BEFORE UPDATE ON pacientes
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_updated_at();

CREATE TRIGGER trigger_turnos_updated_at
    BEFORE UPDATE ON turnos
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_updated_at();

CREATE TRIGGER trigger_historias_updated_at
    BEFORE UPDATE ON historias_clinicas
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_updated_at();

CREATE TRIGGER trigger_estudios_updated_at
    BEFORE UPDATE ON estudios_adjuntos
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_updated_at();

CREATE TRIGGER trigger_documentos_updated_at
    BEFORE UPDATE ON documentos
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_updated_at();

CREATE TRIGGER trigger_sesiones_updated_at
    BEFORE UPDATE ON sesiones
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_updated_at();

-- ============================================================================
-- DATOS DE PRUEBA
-- ============================================================================

-- Insertar usuarios de prueba
-- Nota: Los hashes son ejemplos válidos de bcrypt
-- Admin Password: admin123
-- Doctor Password: doctor123
-- Secretaria Password: secretaria123

INSERT INTO usuarios (email, password_hash, nombre, apellido, role, telefono, direccion, activo)
VALUES (
    'admin@lemes.com',
    '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.1', -- Hash bcrypt (ejemplo)
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
    '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.2', -- Hash bcrypt (ejemplo)
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
    '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.3', -- Hash bcrypt (ejemplo)
    'María',
    'Rodríguez García',
    'secretaria',
    '+34 555 666 777',
    'Calle Secretaría 3, Madrid, España',
    TRUE
);

-- Insertar pacientes de prueba
INSERT INTO pacientes (usuario_id, dni, fecha_nacimiento, genero, numero_historia_clinica, numero_emergencia, contacto_emergencia, alergias, patologias_cronicas, activo)
VALUES (
    NULL,
    '12345678A',
    '1990-05-15',
    'masculino',
    'HC-2026-001',
    '+34 600 111 222',
    'Juan Pérez',
    'Penicilina',
    'Hipertensión',
    TRUE
);

INSERT INTO pacientes (usuario_id, dni, fecha_nacimiento, genero, numero_historia_clinica, numero_emergencia, contacto_emergencia, alergias, patologias_cronicas, activo)
VALUES (
    NULL,
    '87654321B',
    '1985-08-22',
    'femenino',
    'HC-2026-002',
    '+34 600 222 333',
    'Ana García',
    'Aspirina',
    'Diabetes Tipo 2',
    TRUE
);

-- ============================================================================
-- VISTAS ÚTILES
-- ============================================================================

-- Vista: Turnos próximos del doctor
CREATE OR REPLACE VIEW v_turnos_proximos AS
SELECT 
    t.id,
    t.fecha_hora,
    t.estado,
    p.dni,
    CONCAT(p.numero_historia_clinica, ' - ', u_paciente.nombre, ' ', u_paciente.apellido) AS paciente,
    u_doctor.nombre || ' ' || u_doctor.apellido AS doctor,
    t.motivo,
    t.sala_atencion
FROM turnos t
JOIN pacientes p ON t.paciente_id = p.id
LEFT JOIN usuarios u_paciente ON p.usuario_id = u_paciente.id
JOIN usuarios u_doctor ON t.doctor_id = u_doctor.id
WHERE t.fecha_hora > CURRENT_TIMESTAMP 
    AND t.estado IN ('pendiente', 'confirmado')
ORDER BY t.fecha_hora ASC;

-- Vista: Resumen de pacientes
CREATE OR REPLACE VIEW v_resumen_pacientes AS
SELECT 
    p.id,
    p.dni,
    p.numero_historia_clinica,
    COALESCE(CONCAT(u.nombre, ' ', u.apellido), 'Sin usuario') AS nombre_completo,
    p.fecha_nacimiento,
    p.genero,
    COUNT(DISTINCT t.id) AS total_turnos,
    COUNT(DISTINCT hc.id) AS total_historias,
    MAX(t.fecha_hora) AS ultimo_turno
FROM pacientes p
LEFT JOIN usuarios u ON p.usuario_id = u.id
LEFT JOIN turnos t ON p.id = t.paciente_id
LEFT JOIN historias_clinicas hc ON p.id = hc.paciente_id
WHERE p.activo = TRUE
GROUP BY p.id, p.dni, p.numero_historia_clinica, u.nombre, u.apellido, p.fecha_nacimiento, p.genero;

-- Vista: Carga de trabajo de doctores
CREATE OR REPLACE VIEW v_carga_doctores AS
SELECT 
    u.id,
    u.nombre || ' ' || u.apellido AS nombre_completo,
    u.email,
    COUNT(DISTINCT t.id) AS turnos_totales,
    SUM(CASE WHEN t.estado = 'pendiente' THEN 1 ELSE 0 END) AS turnos_pendientes,
    SUM(CASE WHEN t.estado = 'confirmado' THEN 1 ELSE 0 END) AS turnos_confirmados,
    SUM(CASE WHEN t.estado = 'atendido' THEN 1 ELSE 0 END) AS turnos_atendidos,
    AVG(CASE WHEN t.estado = 'atendido' THEN t.duracion_minutos END)::INTEGER AS duracion_promedio_minutos
FROM usuarios u
LEFT JOIN turnos t ON u.id = t.doctor_id AND t.fecha_hora > CURRENT_TIMESTAMP - INTERVAL '30 days'
WHERE u.role = 'doctor'
GROUP BY u.id, u.nombre, u.apellido, u.email;

-- ============================================================================
-- FUNCIONES ÚTILES
-- ============================================================================

-- Función para calcular edad del paciente
CREATE OR REPLACE FUNCTION calcular_edad_paciente(fecha_nac DATE)
RETURNS INTEGER AS $$
BEGIN
    RETURN EXTRACT(YEAR FROM AGE(CURRENT_DATE, fecha_nac))::INTEGER;
END;
$$ LANGUAGE plpgsql;

-- Función para verificar disponibilidad de doctor
CREATE OR REPLACE FUNCTION doctor_disponible(
    p_doctor_id BIGINT,
    p_fecha_hora TIMESTAMP WITH TIME ZONE,
    p_duracion INTERVAL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_conflicto BIGINT;
BEGIN
    SELECT id INTO v_conflicto
    FROM turnos
    WHERE doctor_id = p_doctor_id
    AND estado NOT IN ('cancelado', 'ausente')
    AND (
        (fecha_hora <= p_fecha_hora AND fecha_hora + (duracion_minutos || ' minutes')::INTERVAL > p_fecha_hora)
        OR
        (fecha_hora < p_fecha_hora + p_duracion AND fecha_hora + (duracion_minutos || ' minutes')::INTERVAL >= p_fecha_hora + p_duracion)
    )
    LIMIT 1;
    
    RETURN v_conflicto IS NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMENTARIOS DESCRIPTIVOS
-- ============================================================================

COMMENT ON TABLE usuarios IS 'Tabla de usuarios del sistema: administradores, doctores y secretarias';
COMMENT ON TABLE pacientes IS 'Información general de los pacientes del sistema médico';
COMMENT ON TABLE turnos IS 'Registro de citas/turnos médicos';
COMMENT ON TABLE historias_clinicas IS 'Historiales clínicos detallados de cada paciente';
COMMENT ON TABLE estudios_adjuntos IS 'Estudios médicos (radiografías, análisis, etc.) adjuntos a historias clínicas';
COMMENT ON TABLE documentos IS 'Documentos de identificación y otros documentos del paciente';
COMMENT ON TABLE sesiones IS 'Control de sesiones activas de usuarios del sistema';

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================
-- Script generado para Supabase PostgreSQL
-- Compatible con la versión actual de PostgreSQL de Supabase
-- Todas las tablas incluyen timestamps automáticos y triggers actualizados
-- Los datos de prueba deben ser reemplazados con contraseñas hasheadas reales
