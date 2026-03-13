// Variables globales
const app = {
    baseURL: 'http://localhost:3000',
    token: localStorage.getItem('token') || null
};

// Funciones auxiliares
function showAlert(message, type = 'info') {
    const alertHTML = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    const container = document.querySelector('.main-content') || document.body;
    container.insertAdjacentHTML('afterbegin', alertHTML);
}

function showLoading() {
    const loader = `
        <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Cargando...</span>
        </div>
    `;
    return loader;
}

// API Call wrapper
async function apiCall(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (app.token) {
        headers['Authorization'] = `Bearer ${app.token}`;
    }
    
    try {
        const response = await fetch(`${app.baseURL}${endpoint}`, {
            ...options,
            headers
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Error en la solicitud');
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        showAlert(`Error: ${error.message}`, 'danger');
        throw error;
    }
}

// Auth functions
async function login(email, password) {
    try {
        const response = await apiCall('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        
        if (response.success) {
            localStorage.setItem('token', response.data.token);
            app.token = response.data.token;
            showAlert('Sesión iniciada exitosamente', 'success');
            window.location.href = '/dashboard';
        }
    } catch (error) {
        showAlert('Error al iniciar sesión', 'danger');
    }
}

async function logout() {
    try {
        await apiCall('/api/auth/logout', { method: 'POST' });
        localStorage.removeItem('token');
        app.token = null;
        window.location.href = '/login';
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Data loading functions
async function loadPacientes() {
    try {
        const response = await apiCall('/api/pacientes');
        if (response.success) {
            renderPacientesTable(response.data);
        }
    } catch (error) {
        showAlert('Error al cargar pacientes', 'danger');
    }
}

async function loadTurnos() {
    try {
        const response = await apiCall('/api/turnos');
        if (response.success) {
            // Ordenar por fecha y hora más próximo primero
            const turnosOrdenados = response.data.sort((a, b) => {
                const dateA = new Date(a.fecha + 'T' + a.hora);
                const dateB = new Date(b.fecha + 'T' + b.hora);
                return dateA - dateB;
            });
            renderturnosTable(turnosOrdenados);
        }
    } catch (error) {
        showAlert('Error al cargar turnos', 'danger');
    }
}

// Render functions
function renderPacientesTable(pacientes) {
    const tbody = document.querySelector('.table tbody');
    if (!tbody) return;
    
    tbody.innerHTML = pacientes.map(p => `
        <tr>
            <td>${p.dni}</td>
            <td>${p.nombre} ${p.apellido}</td>
            <td>${p.telefono || 'N/A'}</td>
            <td>${p.email}</td>
            <td>${calculateAge(p.fecha_nacimiento)}</td>
            <td><span class="badge bg-success">Activo</span></td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="viewPaciente(${p.id})">
                    <i class="bi bi-eye"></i>
                </button>
                <button class="btn btn-sm btn-outline-warning">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderturnosTable(turnos) {
    const tbody = document.querySelector('.table tbody');
    if (!tbody) return;
    
    tbody.innerHTML = turnos.map(t => {
        const fechaFormato = new Date(t.fecha).toLocaleDateString('es-AR');
        const paciente = t.persona;
        const pacienteInfo = paciente.paciente ? `
            <strong>${paciente.nombre} ${paciente.apellido}</strong><br>
            <small>DNI: ${paciente.dni}</small><br>
            <small>Tel: ${paciente.telefono || 'N/A'}</small><br>
            <small>Obra Social: ${paciente.paciente.obra_social || 'N/A'}</small>
        ` : `${paciente.nombre} ${paciente.apellido}`;
        
        return `
        <tr>
            <td>${fechaFormato}<br><strong>${t.hora}</strong></td>
            <td>${pacienteInfo}</td>
            <td>${t.medico?.nombre || 'N/A'} ${t.medico?.apellido || ''}</td>
            <td>${t.medico?.especialidad || 'General'}</td>
            <td>${t.observaciones || 'N/A'}</td>
            <td>
                <span class="badge ${getEstadoBadgeClass(t.estado.nombre)}">${t.estado.nombre}</span>
            </td>
            <td>
                <button class="btn btn-sm btn-outline-info" onclick="verTurnoDetalle(${t.id}, '${paciente.nombre}', '${paciente.apellido}', '${paciente.dni}', '${paciente.email}', '${paciente.telefono}', '${paciente.paciente?.obra_social || ''}', '${paciente.paciente?.numero_afiliado || ''}', '${paciente.paciente?.observaciones_generales || ''}')" title="Ver detalles">
                    <i class="bi bi-eye"></i> Ver
                </button>
                <button class="btn btn-sm btn-outline-warning" onclick="editarTurno(${t.id})" title="Modificar turno">
                    <i class="bi bi-pencil"></i> Modificar
                </button>
                <button class="btn btn-sm btn-outline-danger">
                    <i class="bi bi-x"></i>
                </button>
            </td>
        </tr>
        `;
    }).join('');
}

// Helper functions
function calculateAge(birthDate) {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    
    return age;
}

function getEstadoBadgeClass(estado) {
    const classes = {
        'confirmado': 'bg-success',
        'pendiente': 'bg-warning',
        'cancelado': 'bg-danger',
        'completado': 'bg-info'
    };
    return classes[estado?.toLowerCase()] || 'bg-secondary';
}

function viewPaciente(id) {
    window.location.href = `/pacientes/${id}`;
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Auto-load data based on current page
    const path = window.location.pathname;
    
    if (path.includes('/pacientes')) {
        loadPacientes();
    } else if (path.includes('/turnos')) {
        loadTurnos();
    }
    
    // Handle logout
    const logoutBtn = document.querySelector('[href*="logout"]');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }
});

// ========================================================================
// FUNCIONES PARA TURNOS
// ========================================================================
function verTurnoDetalle(id, nombre, apellido, dni, email, telefono, obraSocial, numeroAfiliado, observaciones) {
    const detalle = `
        <div style="padding: 20px;">
            <h4>Datos del Paciente</h4>
            <table class="table table-sm">
                <tr><td><strong>Nombre:</strong></td><td>${nombre} ${apellido}</td></tr>
                <tr><td><strong>DNI:</strong></td><td>${dni}</td></tr>
                <tr><td><strong>Email:</strong></td><td>${email || 'N/A'}</td></tr>
                <tr><td><strong>Teléfono:</strong></td><td>${telefono || 'N/A'}</td></tr>
                <tr><td><strong>Obra Social:</strong></td><td>${obraSocial || 'N/A'}</td></tr>
                <tr><td><strong>Número Afiliado:</strong></td><td>${numeroAfiliado || 'N/A'}</td></tr>
                <tr><td><strong>Observaciones:</strong></td><td>${observaciones || 'N/A'}</td></tr>
            </table>
        </div>
    `;
    
    // Mostrar modal o alert con los detalles
    alert(`TURNO ID: ${id}\n\n${nombre} ${apellido}\nDNI: ${dni}\nTelephone: ${telefono}\nObra Social: ${obraSocial}\nAfiliado: ${numeroAfiliado}`);
}

function editarTurno(id) {
    // Redirigir a página de edición o abrir modal
    window.location.href = `/doctor/agendar-turno?editar=${id}`;
}


