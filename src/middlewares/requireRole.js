/**
 * Middleware para proteger rutas por rol
 * 
 * Uso: app.get('/admin/dashboard', requireAuth, requireRole('ROLE_ADMIN'), handler)
 */

export const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      const usuario = req.user;

      if (!usuario) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Usuario no autenticado'
        });
      }

      // Convertir a array si es solo un string
      const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

      // El rol puede venir como 'admin', 'doctor', 'secretaria', 'ROLE_ADMIN', etc
      const userRole = usuario.role?.toLowerCase() || '';
      
      // Normalizar todos los roles a minúsculas para comparación
      const normalizedRoles = rolesArray.map(r => r.replace('ROLE_', '').toLowerCase());
      
      if (!normalizedRoles.includes(userRole)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'No tienes permiso para acceder a este recurso',
          usuarioRole: usuario.role,
          rolesRequeridos: normalizedRoles
        });
      }

      next();
    } catch (error) {
      console.error('Error en requireRole:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Error al validar permisos'
      });
    }
  };
};

export default requireRole;
