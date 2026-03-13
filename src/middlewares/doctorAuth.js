/**
 * Middleware: Verificar que el usuario es doctor
 * IMPORTANTE: Debe ir DESPUÉS del authMiddleware que establece req.user
 */
export const doctorAuthMiddleware = (req, res, next) => {
  try {
    // Verificar que req.user existe (debe ser establecido por authMiddleware)
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Usuario no autenticado'
      });
    }

    // Verificar que sea doctor
    if (req.user.role !== 'doctor') {
      console.log(`❌ Usuario ${req.user.email} no es doctor. Role:`, req.user.role);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Solo doctores pueden acceder a este módulo'
      });
    }

    console.log(`✅ Doctor autorizado: ${req.user.email}`);
    next();
  } catch (error) {
    console.error('Doctor Auth Error:', error);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Error en autenticación'
    });
  }
};

/**
 * Middleware: Renderizar vista como doctor (para EJS)
 * - Verificar autenticación en sesión/JWT
 * - Solo doctores pueden ver vistas doctor
 */
export const doctorPageAuth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.redirect('/login');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== 'doctor') {
      return res.status(403).render('pages/error', {
        message: 'Acceso denegado. Solo doctores.',
        error: 'Forbidden'
      });
    }

    res.locals.usuario = decoded;
    next();
  } catch (error) {
    return res.redirect('/login');
  }
};

export default {
  doctorAuthMiddleware,
  doctorPageAuth
};
