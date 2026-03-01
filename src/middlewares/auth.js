import jwt from 'jsonwebtoken';

// ============================================================================
// MIDDLEWARE: AUTENTICACIÓN (Verificar JWT)
// ============================================================================

export const authMiddleware = (req, res, next) => {
  try {
    // Intentar obtener el token de:
    // 1. Header Authorization (Bearer token)
    // 2. Cookie auth_token
    const authHeader = req.headers.authorization;
    let token = authHeader?.split(' ')[1]; // Bearer <token>
    
    // Si no hay token en el header, intentar desde la cookie
    if (!token && req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }
    
    console.log(`🔐 Auth Middleware:`, {
      authHeader: authHeader ? '✅ Presente' : '❌ No',
      cookie: req.cookies?.auth_token ? '✅ Presente' : '❌ No',
      token: token ? '✅ Token extraído' : '❌ Sin token'
    });

    if (!token) {
      console.log(`❌ Token no proporcionado`);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token no proporcionado'
      });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key_lemes_2024');
      req.usuario = decoded;
      console.log(`✅ Token válido - Usuario: ${decoded.nombre} ${decoded.apellido} (${decoded.role})`);
      next();
    } catch (jwtError) {
      console.log(`❌ Error al verificar token:`, jwtError.message);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token inválido o expirado',
        detail: jwtError.message
      });
    }
  } catch (error) {
    console.error('❌ Error en authMiddleware:', error);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Error en autenticación'
    });
  }
};

// ============================================================================
// MIDDLEWARE: VERIFICAR ROL
// ============================================================================

export const roleMiddleware = (rolesPermitidos = []) => {
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

// ============================================================================
// MIDDLEWARE: OPCIONAL - Así que si hay token, lo parsea, si no continúa igual
// ============================================================================

export const optionalAuthMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.usuario = decoded;
    }

    next();
  } catch (error) {
    // Si hay error con el token, simplemente continuamos sin autenticar
    next();
  }
};

export default {
  authMiddleware,
  roleMiddleware,
  optionalAuthMiddleware
};
