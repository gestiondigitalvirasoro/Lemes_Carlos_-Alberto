/**
 * doctor.js - Funcionalidades específicas del módulo doctor
 */

// Logout función global
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
    
    setTimeout(() => {
        window.location.href = '/login';
    }, 300);
}

// Exponer globalmente
window.logout = logout;

/**
 * Utilidades para el doctor
 */
const DoctorUtils = {
    /**
     * Formater de fecha y hora
     */
    formatearFecha(fecha) {
        const f = new Date(fecha);
        return f.toLocaleDateString('es-AR');
    },

    formatearHora(fecha) {
        const f = new Date(fecha);
        return f.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    },

    /**
     * Calcular edad desde fecha de nacimiento
     */
    calcularEdad(fechaNacimiento) {
        const hoy = new Date();
        const fecha = new Date(fechaNacimiento);
        let edad = hoy.getFullYear() - fecha.getFullYear();
        const mes = hoy.getMonth() - fecha.getMonth();
        if (mes < 0 || (mes === 0 && hoy.getDate() < fecha.getDate())) {
            edad--;
        }
        return edad;
    },

    /**
     * Calcular IMC
     */
    calcularIMC(peso, talla) {
        if (!peso || !talla) return null;
        return (peso / (talla * talla)).toFixed(2);
    },

    /**
     * Mostrar notificación toast
     */
    mostrarNotificacion(mensaje, tipo = 'info') {
        const toastHTML = `
            <div class="toast align-items-center" role="alert" autocomplete="off">
                <div class="d-flex">
                    <div class="toast-body">
                        ${mensaje}
                    </div>
                    <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
                </div>
            </div>
        `;
        const container = document.getElementById('toastContainer') || (function() {
            const div = document.createElement('div');
            div.id = 'toastContainer';
            div.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999;';
            document.body.appendChild(div);
            return div;
        })();
        
        container.insertAdjacentHTML('beforeend', toastHTML);
    },

    /**
     * Validar formulario signos vitales
     */
    validarSignosVitales(datos) {
        if (!datos.peso || !datos.talla) {
            this.mostrarNotificacion('Peso y talla son requeridos', 'warning');
            return false;
        }
        return true;
    }
};

// Exportar funciones útiles al window
window.DoctorUtils = DoctorUtils;
