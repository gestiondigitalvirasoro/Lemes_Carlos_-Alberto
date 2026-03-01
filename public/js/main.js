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
            renderturnosTable(response.data);
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
    
    tbody.innerHTML = turnos.map(t => `
        <tr>
            <td>${new Date(t.fecha_hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</td>
            <td>${t.paciente?.nombre || 'N/A'}</td>
            <td>${t.doctor?.nombre || 'N/A'}</td>
            <td>Medicina General</td>
            <td>${t.motivo}</td>
            <td>
                <span class="badge ${getEstadoBadgeClass(t.estado)}">${t.estado}</span>
            </td>
            <td>
                <button class="btn btn-sm btn-outline-info">
                    <i class="bi bi-info-circle"></i>
                </button>
                <button class="btn btn-sm btn-outline-warning">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger">
                    <i class="bi bi-x"></i>
                </button>
            </td>
        </tr>
    `).join('');
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

// Export para uso global
window.app = app;
window.apiCall = apiCall;
window.login = login;
window.logout = logout;
