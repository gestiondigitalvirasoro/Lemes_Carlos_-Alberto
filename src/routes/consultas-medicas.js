import express from 'express';
import { body, param, query } from 'express-validator';
import { authMiddleware } from '../middlewares/auth.js';
import roleMiddleware from '../middlewares/role.js';
import {
  crearConsultaNueva,
  iniciarConsultaDesdeTurno,
  obtenerConsultasMedicas,
  obtenerConsultaMedica,
  actualizarConsultaMedica
} from '../controllers/consultas-medicas.js';

const router = express.Router();

// Proteger todas las rutas
router.use(authMiddleware);

// POST - CREAR CONSULTA NUEVA (vacía, sin turno necesariamente)
router.post(
  '/crear',
  roleMiddleware(['doctor', 'admin']),
  [
    body('paciente_id').isNumeric().withMessage('paciente_id debe ser un número válido'),
    body('historia_id').isNumeric().withMessage('historia_id debe ser un número válido'),
    body('turno_id').optional().isNumeric().withMessage('turno_id debe ser un número válido'),
    body('motivo_consulta').optional().isString().trim()
  ],
  crearConsultaNueva
);

// POST - INICIAR CONSULTA DESDE TURNO (crea automáticamente Paciente + Historia)
router.post(
  '/iniciar/:turno_id',
  roleMiddleware(['doctor', 'admin']),
  [
    param('turno_id').isNumeric().withMessage('turno_id debe ser un número válido'),
    body('motivo_consulta').optional().isString().trim(),
    body('resumen').optional().isString().trim(),
    body('observaciones').optional().isString().trim()
  ],
  iniciarConsultaDesdeTurno
);

// GET - Listar todas las consultas
router.get(
  '/',
  [
    query('skip').optional().isInt({ min: 0 }).toInt(),
    query('take').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('historia_id').optional().isNumeric(),
    query('medico_id').optional().isNumeric(),
    query('estado').optional().isString()
  ],
  obtenerConsultasMedicas
);

// GET - Obtener una consulta específica
router.get(
  '/:id',
  [param('id').isNumeric().withMessage('ID debe ser un número válido')],
  obtenerConsultaMedica
);

// PUT - Actualizar consulta
router.put(
  '/:id',
  roleMiddleware(['doctor', 'admin']),
  [
    param('id').isNumeric().withMessage('ID debe ser un número válido'),
    body('resumen').optional().isString().trim(),
    body('estado').optional().isString().isIn(['PROGRAMADA', 'ATENDIDA', 'CANCELADA', 'NO_PRESENTADO'])
  ],
  actualizarConsultaMedica
);

export default router;
