// ============================================================================
// MIDDLEWARE: VERIFICAR ROL
// ============================================================================
// Este middleware se utiliza después del middleware de autenticación
// para validar que el usuario tiene los roles necesarios para acceder
// a un recurso específico

const roleMiddleware = (rolesPermitidos = []) => {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Usuario no autenticado'
      });
    }

    if (rolesPermitidos.length > 0 && !rolesPermitidos.includes(req.usuario.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Acceso denegado. Roles permitidos: ${rolesPermitidos.join(', ')}`
      });
    }

    next();
  };
};

export default roleMiddleware;
