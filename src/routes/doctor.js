import express from 'express';
import {
  getDashboard,
  getHistoriaClinica,
  iniciarConsulta,
  finalizarConsulta,
  registrarSignosVitales,
  getProximasCitas,
  getHistorialConsultas,
  getGraficosEvolucion,
  getCitasTimeline,
  generarReceta,
  generarOrdenMedica,
  generarCertificado
} from '../controllers/doctor.js';
import { doctorAuthMiddleware } from '../middlewares/doctorAuth.js';

const router = express.Router();

/**
 * ============================================================================
 * PROTECTED ROUTES - Solo doctores
 * ============================================================================
 */

/**
 * GET /api/doctor/dashboard
 * Dashboard clínico del doctor
 */
router.get('/dashboard', doctorAuthMiddleware, getDashboard);

/**
 * GET /api/doctor/paciente/:pacienteId/historia
 * Historia clínica completa del paciente
 */
router.get('/paciente/:pacienteId/historia', doctorAuthMiddleware, getHistoriaClinica);

/**
 * POST /api/doctor/consulta/iniciar
 * Iniciar consulta con un paciente
 */
router.post('/consulta/iniciar', doctorAuthMiddleware, iniciarConsulta);

/**
 * POST /api/doctor/consulta/finalizar
 * Finalizar consulta y crear historia clínica
 */
router.post('/consulta/finalizar', doctorAuthMiddleware, finalizarConsulta);

/**
 * POST /api/doctor/signos-vitales
 * Registrar signos vitales (peso, talla, TA, FC, temp, glucemia, etc)
 */
router.post('/signos-vitales', doctorAuthMiddleware, registrarSignosVitales);

/**
 * GET /api/doctor/proximas-citas/:pacienteId
 * Próximas citas del paciente
 */
router.get('/proximas-citas/:pacienteId', doctorAuthMiddleware, getProximasCitas);

/**
 * GET /api/doctor/historial-consultas/:pacienteId
 * Historial de consultas del paciente
 */
router.get('/historial-consultas/:pacienteId', doctorAuthMiddleware, getHistorialConsultas);

/**
 * GET /api/doctor/graficos/evolucion/:pacienteId
 * Datos para gráficos de evolución (peso, glucemia, TA, IMC)
 */
router.get('/graficos/evolucion/:pacienteId', doctorAuthMiddleware, getGraficosEvolucion);

/**
 * GET /api/doctor/citas-timeline/:pacienteId
 * Citas próximas formateadas para timeline
 */
router.get('/citas-timeline/:pacienteId', doctorAuthMiddleware, getCitasTimeline);

/**
 * POST /api/doctor/receta/generar
 * Generar receta médica para descargar/imprimir
 */
router.post('/receta/generar', doctorAuthMiddleware, generarReceta);

/**
 * POST /api/doctor/orden-medica/generar
 * Generar orden médica para estudios
 */
router.post('/orden-medica/generar', doctorAuthMiddleware, generarOrdenMedica);

/**
 * POST /api/doctor/certificado/generar
 * Generar certificado médico
 */
router.post('/certificado/generar', doctorAuthMiddleware, generarCertificado);

export default router;
