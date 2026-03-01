import jwt from 'jsonwebtoken';

/**
 * Middleware: Solo doctores pueden acceder
 * - Verifica JWT
 * - Verifica que role = 'doctor'
 * - Rechaza acceso a admin
 */
export const doctorAuthMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Se requiere autenticación'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verificar que sea doctor
    if (decoded.role !== 'doctor') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Solo doctores pueden acceder a este módulo'
      });
    }

    req.usuario = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Token inválido o expirado'
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
