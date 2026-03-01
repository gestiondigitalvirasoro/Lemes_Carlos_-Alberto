/**
 * MIDDLEWARE: Control de Permisos Granular
 * Define qué acciones puede hacer cada rol
 */

const rolePermissions = {
  admin: {
    usuarios: ['create', 'read', 'update', 'delete'],
    pacientes: ['create', 'read', 'update', 'delete'],
    personas: ['create', 'read', 'update', 'delete'],
    consultas: ['create', 'read', 'update', 'delete'],
    turnos: ['create', 'read', 'update', 'delete'],
    historias: ['create', 'read', 'update', 'delete'],
    signos_vitales: ['create', 'read', 'update', 'delete'],
    documentos: ['create', 'read', 'update', 'delete'],
    estudios: ['create', 'read', 'update', 'delete'],
    diagnosticos: ['create', 'read', 'update', 'delete'],
    tratamientos: ['create', 'read', 'update', 'delete'],
    estadisticas: ['read']
  },
  
  doctor: {
    usuarios: ['create', 'read', 'update'], // Dar de alta usuarios (otros doctores, secretarias)
    pacientes: ['read'],
    personas: ['read'],
    consultas: ['create', 'read', 'update'],
    turnos: ['create', 'read', 'update'],
    historias: ['create', 'read', 'update'],
    signos_vitales: ['create', 'read', 'update'],
    documentos: ['create', 'read'],
    estudios: ['create', 'read', 'update'],
    diagnosticos: ['create', 'read', 'update'],
    tratamientos: ['create', 'read', 'update'],
    estadisticas: ['read']
  },
  
  secretaria: {
    usuarios: [], // No puede crear usuarios
    pacientes: ['create', 'read'], // Dar de alta pacientes
    personas: ['create', 'read'], // Dar de alta personas (clientes)
    consultas: [],
    turnos: ['create', 'read', 'update'], // Gestionar turnos
    historias: ['read'], // Solo lectura de historias
    signos_vitales: [],
    documentos: [],
    estudios: [],
    diagnosticos: [],
    tratamientos: [],
    estadisticas: []
  }
};

/**
 * Middleware: Verificar permiso específico
 * @param {string} resource - recurso (e.g., 'turnos', 'pacientes')
 * @param {string} action - acción (e.g., 'create', 'read', 'update', 'delete')
 */
export const checkPermission = (resource, action) => {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Usuario no autenticado'
      });
    }

    const userRole = req.usuario.role || 'user';
    const userPermissions = rolePermissions[userRole];

    if (!userPermissions) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Rol no reconocido: ${userRole}`
      });
    }

    const resourcePerms = userPermissions[resource];
    if (!resourcePerms || !resourcePerms.includes(action)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `No tienes permiso para ${action} ${resource}`
      });
    }

    next();
  };
};

/**
 * Middleware: Verificar que es Doctor o Admin
 * (Acceso a secciones administrativas generales)
 */
export const requireStaff = (req, res, next) => {
  if (!req.usuario) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Usuario no autenticado'
    });
  }

  const role = req.usuario.role;
  if (!['admin', 'doctor'].includes(role)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Acceso solo para doctors y admins'
    });
  }

  next();
};

/**
 * Middleware: Verificar que es solo Doctor o Admin
 */
export const requireDoctorOrAdmin = (req, res, next) => {
  if (!req.usuario) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Usuario no autenticado'
    });
  }

  const role = req.usuario.role;
  if (!['admin', 'doctor'].includes(role)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Acceso solo para doctors y admins'
    });
  }

  next();
};

/**
 * Middleware: Verificar que es solo Secretaria
 */
export const requireSecretaria = (req, res, next) => {
  if (!req.usuario) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Usuario no autenticado'
    });
  }

  const role = req.usuario.role;
  if (role !== 'secretaria') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Acceso solo para secretarias'
    });
  }

  next();
};

/**
 * Middleware: Verificar que es Secretaria o Doctor
 */
export const requireSecretariaOrDoctor = (req, res, next) => {
  if (!req.usuario) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Usuario no autenticado'
    });
  }

  const role = req.usuario.role;
  if (!['doctor', 'secretaria'].includes(role)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Acceso solo para doctors y secretarias'
    });
  }

  next();
};

export const rolePermissionsMap = rolePermissions;
