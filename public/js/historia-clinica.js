// ============================================================================
// FUNCIONES PRINCIPALES HISTORIA CLÍNICA - SEPARADAS Y LIMPIAS
// ============================================================================
// Nota: Las variables globales (modoEdicion, pacienteId, historiaId) se definen
// en el archivo EJS antes de cargar este script

// ============================================================================
// FUNCIONES DE EDICIÓN (PRINCIPALES)
// ============================================================================

function habilitarEdicion() {
    console.log('✏️ HABILITANDO MODO DE EDICIÓN');
    modoEdicion = true;
    
    const btnEditar = document.getElementById('btnEditar');
    const btnGuardar = document.getElementById('btnGuardar');
    const btnCancelar = document.getElementById('btnCancelar');
    
    console.log('🔍 btnEditar:', btnEditar);
    console.log('🔍 btnGuardar:', btnGuardar);
    console.log('🔍 btnCancelar:', btnCancelar);
    
    if (btnEditar) {
        btnEditar.style.display = 'none';
        console.log('✅ Botón Editar ocultado');
    }
    
    if (btnGuardar) {
        btnGuardar.style.display = 'inline-flex';
        console.log('✅ Botón Guardar mostrado');
    }
    
    if (btnCancelar) {
        btnCancelar.style.display = 'inline-flex';
        console.log('✅ Botón Cancelar mostrado');
    }
    
    // Habilitar todos los textareas
    document.querySelectorAll('textarea').forEach(textarea => {
        textarea.removeAttribute('readonly');
        textarea.style.backgroundColor = '#ffffff';
        textarea.style.cursor = 'text';
        textarea.style.border = '2px solid #3b82f6';
        textarea.disabled = false;
    });
    
    // Habilitar selects
    document.querySelectorAll('select').forEach(select => {
        select.disabled = false;
        select.style.backgroundColor = '#ffffff';
        select.style.cursor = 'pointer';
    });
    
    // Habilitar inputs
    document.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
        input.removeAttribute('readonly');
        input.disabled = false;
        input.style.backgroundColor = '#ffffff';
    });
    
    console.log('✅ Todos los campos habilitados para edición');
}

function cancelarEdicion() {
    console.log('❌ Cancelando edición');
    location.reload();
}

function guardarCambios() {
    console.log('💾 Guardando cambios de historia clínica...');
    
    // Recolectar todos los datos del formulario
    const motivoConsulta = document.getElementById('motivo_consulta')?.value || '';
    const anamnesis = document.getElementById('anamnesis')?.value || '';
    const antecedentes = document.getElementById('antecedentes_text')?.value || '';
    
    // Signos vitales
    const presionSistolica = document.querySelector('input[data-field="presion_sistolica"]')?.value || '';
    const presionDiastolica = document.querySelector('input[data-field="presion_diastolica"]')?.value || '';
    const frecuenciaCardiaca = document.querySelector('input[data-field="frecuencia_cardiaca"]')?.value || '';
    const temperatura = document.querySelector('input[data-field="temperatura"]')?.value || '';
    const peso = document.querySelector('input[data-field="peso"]')?.value || '';
    const talla = document.querySelector('input[data-field="talla"]')?.value || '';
    const glucemia = document.querySelector('input[data-field="glucemia"]')?.value || '';
    const imc = document.querySelector('input[data-field="imc"]')?.value || '';
    
    // Contar campos con contenido
    const camposConDatos = [
        motivoConsulta, anamnesis, antecedentes,
        presionSistolica, presionDiastolica, frecuenciaCardiaca,
        temperatura, peso, talla, glucemia
    ].filter(campo => campo && campo.trim() !== '').length;
    
    console.log('📊 Campos con datos:', camposConDatos);
    
    // Validar que al menos un campo tenga contenido
    if (camposConDatos === 0) {
        alert('⚠️ Debes completar al menos un campo para guardar la historia clínica');
        return;
    }
    
    // Construir presión arterial
    const presionArterial = presionSistolica && presionDiastolica 
        ? `${presionSistolica}/${presionDiastolica}` 
        : '';
    
    const datosGuardar = {
        motivo_consulta: motivoConsulta,
        anamnesis: anamnesis,
        antecedentes: antecedentes,
        presion_arterial: presionArterial,
        frecuencia_cardiaca: frecuenciaCardiaca,
        temperatura: temperatura,
        saturacion_o2: ''
    };
    
    // Filtrar campos vacíos
    Object.keys(datosGuardar).forEach(key => {
        if (!datosGuardar[key] || datosGuardar[key].trim() === '') {
            delete datosGuardar[key];
        }
    });
    
    console.log('📝 Datos a guardar:', datosGuardar);
    
    // Guardar información de signos vitales también
    const signosVitalesData = {
        historia_clinica_id: historiaId,
        peso: peso || null,
        talla: talla || null,
        presion_sistolica: presionSistolica || null,
        presion_diastolica: presionDiastolica || null,
        frecuencia_cardiaca: frecuenciaCardiaca || null,
        temperatura: temperatura || null,
        glucemia: glucemia || null
    };
    
    // Primero guardar historia clínica
    fetch(`/api/historias-clinicas/${historiaId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(datosGuardar)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Error al guardar: ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('✅ Historia clínica guardada:', data);
        
        // Luego guardar signos vitales si hay datos
        if (peso || talla || presionSistolica || temperatura || glucemia) {
            return fetch('/api/doctor/signos-vitales', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(signosVitalesData)
            })
            .then(response => {
                if (!response.ok) {
                    console.warn('⚠️ Advertencia al guardar signos vitales');
                    return null;
                }
                return response.json();
            })
            .then(signosData => {
                if (signosData) {
                    console.log('✅ Signos vitales guardados:', signosData);
                }
            });
        }
        return Promise.resolve();
    })
    .then(() => {
        console.log('✅ Cambios guardados exitosamente');
        alert('✅ La historia clínica ha sido guardada correctamente');
        
        // Volver a modo lectura
        modoEdicion = false;
        document.getElementById('btnEditar').style.display = 'inline-flex';
        document.getElementById('btnGuardar').style.display = 'none';
        document.getElementById('btnCancelar').style.display = 'none';
        
        // Deshabilitar campos
        document.querySelectorAll('textarea, select, input[type="text"], input[type="number"]').forEach(campo => {
            campo.setAttribute('readonly', 'readonly');
            campo.disabled = true;
            campo.style.backgroundColor = '#f8f9fa';
            campo.style.cursor = 'default';
        });
        
        // Recargar página después de 1 segundo para mostrar datos guardados
        setTimeout(() => {
            location.reload();
        }, 1000);
    })
    .catch(error => {
        console.error('❌ Error al guardar:', error);
        alert('❌ Error al guardar: ' + error.message);
    });
}

// ============================================================================
// FUNCIONES DE SECCIONES (EXPANDIBLE/CONTRAIBLE)
// ============================================================================

function toggleSection(contentId, chevronId) {
    const content = document.getElementById(contentId);
    const chevron = document.getElementById(chevronId);
    
    if (!content || !chevron) {
        console.error('❌ Elemento no encontrado:', { contentId, chevronId });
        return;
    }
    
    const isHidden = content.style.display === 'none';
    
    if (isHidden) {
        content.style.display = 'block';
        chevron.style.transform = 'rotate(180deg)';
    } else {
        content.style.display = 'none';
        chevron.style.transform = 'rotate(0deg)';
    }
}

window.toggleSection = toggleSection;

console.log('✅ Funciones de historia clínica cargadas exitosamente');
