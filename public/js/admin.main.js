/**
 * Admin Main JS - Funcionalidades globales del panel admin
 */

// Obtener token del localStorage (se guarda al hacer login)
function getAuthToken() {
    return localStorage.getItem('token');
}

// Hacer logout
async function logout() {
    if (!confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        return;
    }
    
    localStorage.clear();
    sessionStorage.clear();
    
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });
    } catch (error) {
        console.error('Error en logout:', error);
    }
    
    // Redirigir a login
    setTimeout(() => {
        window.location.href = '/login';
    }, 300);
}

// EXPONER GLOBALMENTE
window.logout = logout;

// Función para hacer llamadas API auth
async function apiCall(url, options = {}) {
    const token = getAuthToken();
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(url, {
            ...options,
            headers
        });

        // Si es 401, redirigir a login
        if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/login';
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error('Error en API call:', error);
        throw error;
    }
}

// Formatear fecha
function formatearFecha(fecha) {
    if (!fecha) return '-';
    const date = new Date(fecha);
    return date.toLocaleDateString('es-AR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

// Formatear hora
function formatearHora(fecha) {
    if (!fecha) return '-';
    const date = new Date(fecha);
    return date.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Mostrar notificación
function mostrarNotificacion(mensaje, tipo = 'success') {
    const alertClass = `alert-${tipo}`;
    const icono = tipo === 'success' ? '✓' : tipo === 'error' ? '✕' : '!';
    
    const alertHtml = `
        <div class="alert ${alertClass} alert-dismissible fade show" role="alert">
            ${icono} ${mensaje}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;

    // Insertar al principio del content
    const content = document.querySelector('.content-wrapper');
    const alertDiv = document.createElement('div');
    alertDiv.innerHTML = alertHtml;
    content.insertBefore(alertDiv.firstChild, content.firstChild);

    // Auto-dismiss después de 5 segundos
    setTimeout(() => {
        const alert = content.querySelector('.alert');
        if (alert) {
            alert.remove();
        }
    }, 5000);
}

// Verificar permisos (para futuro uso)
function tienePermiso(permiso) {
    // Por ahora solo admin, expandir cuando haya más roles
    return true;
}

// Utility para convertir BigInt a string en JSON
function convertirBigInt(obj) {
    return JSON.parse(JSON.stringify(obj, (key, value) => 
        typeof value === 'bigint' ? value.toString() : value
    ));
}

// Exponer funciones globales para que puedan ser llamadas desde onclick
window.logout = logout;
window.apiCall = apiCall;
window.formatearFecha = formatearFecha;
window.formatearHora = formatearHora;
window.mostrarNotificacion = mostrarNotificacion;

// ============================================================================
// FUNCIONALIDADES DE PACIENTES
// ============================================================================

// Cargar pacientes
async function loadPacientes() {
    try {
        console.log('📥 Iniciando carga de pacientes...');
        
        const searchInput = document.querySelector('input[placeholder*="Buscar"]');
        const search = searchInput ? searchInput.value : '';
        const url = search 
            ? `/api/admin/pacientes?search=${encodeURIComponent(search)}`
            : '/api/admin/pacientes';
        
        console.log('🔗 URL:', url);
        
        const response = await apiCall(url);
        console.log('📊 Respuesta API:', response);
        
        if (response && response.success && response.data.pacientes) {
            console.log(`✅ ${response.data.pacientes.length} pacientes cargados`);
            renderPacientesTable(response.data.pacientes);
        } else {
            console.error('❌ Error: respuesta inválida', response);
            mostrarNotificacion('Error al cargar pacientes', 'error');
        }
    } catch (error) {
        console.error('❌ Error cargando pacientes:', error);
        mostrarNotificacion('Error al cargar pacientes: ' + error.message, 'error');
    }
}

// Renderizar tabla de pacientes
function renderPacientesTable(pacientes) {
    const tbody = document.getElementById('pacientesTableBody') || document.querySelector('table tbody');
    if (!tbody) {
        console.error('❌ No se encontró elemento para tabla de pacientes');
        return;
    }

    console.log('🎨 Renderizando', pacientes.length, 'pacientes');

    if (pacientes.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted py-4">
                    No se encontraron pacientes
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = pacientes.map((p, index) => `
        <tr>
            <td>${index + 1}</td>
            <td><strong>${p.nombre} ${p.apellido}</strong></td>
            <td>${p.DNI || p.dni || '-'}</td>
            <td>${p.telefono || '-'}</td>
            <td>${p.email || '-'}</td>
            <td>
                <span class="badge ${p.activo ? 'bg-success' : 'bg-danger'}">
                    ${p.activo ? 'Activo' : 'Inactivo'}
                </span>
            </td>
            <td>
                <div class="btn-group btn-group-sm" role="group">
                    <button class="btn btn-outline-primary" onclick="viewPaciente(${p.id})" title="Ver">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-outline-secondary" onclick="editPaciente(${p.id})" title="Editar">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="confirmDelete(${p.id})" title="Eliminar">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Ver paciente
function viewPaciente(id) {
    window.location.href = `/historia/${id}`;
}

// Editar paciente
function editPaciente(id) {
    mostrarNotificacion('Función en desarrollo', 'info');
}

// Eliminar paciente
async function confirmDelete(id) {
    if (!confirm('¿Está seguro que desea eliminar este paciente?')) {
        return;
    }
    mostrarNotificacion('Función en desarrollo', 'info');
}

// Buscar pacientes
function searchPacientes() {
    loadPacientes();
}

// Inicializar cuando la página está lista
function initPacientes() {
    const currentPath = window.location.pathname;
    const tbody = document.querySelector('table tbody');
    
    console.log('🔍 Ruta actual:', currentPath);
    console.log('✓ Tabla encontrada:', !!tbody);
    
    if (currentPath.includes('/admin/pacientes')) {
        console.log('🚀 Inicializando página de pacientes...');
        
        // Cargar pacientes
        loadPacientes();
        
        // Event listener para búsqueda
        const searchInput = document.querySelector('input[placeholder*="Buscar"]');
        if (searchInput) {
            searchInput.addEventListener('keyup', debounce(searchPacientes, 300));
            console.log('✓ Listener de búsqueda agregado');
        }
    }
}

// Debounce para evitar múltiples llamadas
function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
    };
}

// Ejecutar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPacientes);
} else {
    // Si el script se carga después de DOMContentLoaded
    setTimeout(initPacientes, 100);
}

// Exponer funciones globales
window.loadPacientes = loadPacientes;
window.viewPaciente = viewPaciente;
window.editPaciente = editPaciente;
window.confirmDelete = confirmDelete;
window.searchPacientes = searchPacientes;

console.log('✅ Admin Main JS cargado');
