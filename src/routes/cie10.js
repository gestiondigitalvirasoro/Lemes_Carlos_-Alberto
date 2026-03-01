import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middlewares/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// ============================================================================
// GET /api/cie10 - Obtener códigos CIE-10 con búsqueda
// ============================================================================
router.get(
  '/',
  authMiddleware,
  async (req, res) => {
    try {
      const { search = '', limit = 50 } = req.query;
      
      // Si hay búsqueda, filtrar por código o descripción
      const where = search.trim() 
        ? {
            OR: [
              { codigo: { contains: search.toUpperCase(), mode: 'insensitive' } },
              { descripcion: { contains: search, mode: 'insensitive' } }
            ],
            activo: true
          }
        : { activo: true };
      
      // Obtener códigos ordenados por frecuencia de uso (más usados primero)
      const codigos = await prisma.cIE10.findMany({
        where,
        select: {
          codigo: true,
          descripcion: true,
          capitulo: true,
          frecuencia_uso: true
        },
        orderBy: [
          { frecuencia_uso: 'desc' },
          { codigo: 'asc' }
        ],
        take: Math.min(parseInt(limit) || 50, 200) // Máx 200 resultados
      });
      
      return res.json({
        success: true,
        data: codigos,
        total: codigos.length
      });
      
    } catch (error) {
      console.error('Error al obtener códigos CIE-10:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al obtener códigos CIE-10',
        error: error.message
      });
    }
  }
);

// ============================================================================
// GET /api/cie10/:codigo - Obtener un código CIE-10 específico
// ============================================================================
router.get(
  '/:codigo',
  authMiddleware,
  async (req, res) => {
    try {
      const { codigo } = req.params;
      
      const codigoData = await prisma.cIE10.findUnique({
        where: { codigo: codigo.toUpperCase() },
        select: {
          codigo: true,
          descripcion: true,
          capitulo: true,
          subcapitulo: true,
          frecuencia_uso: true,
          activo: true
        }
      });
      
      if (!codigoData) {
        return res.status(404).json({
          success: false,
          message: `Código CIE-10 "${codigo}" no encontrado`
        });
      }
      
      return res.json({
        success: true,
        data: codigoData
      });
      
    } catch (error) {
      console.error('Error al obtener código CIE-10:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al obtener código CIE-10',
        error: error.message
      });
    }
  }
);

// ============================================================================
// GET /api/cie10/capitulos/list - Obtener lista de capítulos disponibles
// ============================================================================
router.get(
  '/capitulos/list',
  authMiddleware,
  async (req, res) => {
    try {
      const capitulos = await prisma.cIE10.findMany({
        where: { activo: true },
        select: { capitulo: true },
        distinct: ['capitulo'],
        orderBy: { capitulo: 'asc' }
      });
      
      const capitulosList = capitulos
        .map(c => c.capitulo)
        .filter(c => c !== null && c !== undefined);
      
      return res.json({
        success: true,
        data: capitulosList,
        total: capitulosList.length
      });
      
    } catch (error) {
      console.error('Error al obtener capítulos:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al obtener capítulos',
        error: error.message
      });
    }
  }
);

export default router;
