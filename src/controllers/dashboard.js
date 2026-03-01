import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================================================
// CONTROLLER: ESTADÍSTICAS DASHBOARD
// ============================================================================
export const obtenerEstadisticas = async (req, res) => {
  try {
    const ahora = new Date();
    const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const finHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59);

    // Total de pacientes activos
    const totalPacientes = await prisma.paciente.count({
      where: { activo: true }
    });

    // Turnos hoy (pendientes y confirmados)
    const turnosHoy = await prisma.turno.count({
      where: {
        fecha: {
          gte: inicioHoy,
          lte: finHoy
        },
        estado: { in: ['PENDIENTE', 'CONFIRMADO'] }
      }
    });

    // Turnos atendidos hoy
    const turnosAtendidosHoy = await prisma.turno.count({
      where: {
        fecha: {
          gte: inicioHoy,
          lte: finHoy
        },
        estado: 'ATENDIDO'
      }
    });

    // Turnos cancelados hoy
    const turnosCanceladosHoy = await prisma.turno.count({
      where: {
        fecha: {
          gte: inicioHoy,
          lte: finHoy
        },
        estado: { in: ['CANCELADO', 'AUSENTE'] }
      }
    });

    // Turnos por estado (general)
    const turnosPorEstado = await prisma.turno.groupBy({
      by: ['estado'],
      _count: {
        id: true
      }
    });

    // Doctores con más turnos hoy
    const doctoresConMasTurnos = await prisma.turno.groupBy({
      by: ['doctor_id'],
      where: {
        fecha: {
          gte: inicioHoy,
          lte: finHoy
        }
      },
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      },
      take: 5
    });

    // Obtener nombres de doctores
    const doctoresDetalles = await Promise.all(
      doctoresConMasTurnos.map(async (d) => {
        const doctor = await prisma.usuario.findUnique({
          where: { id: d.doctor_id },
          select: { id: true, nombre: true, apellido: true, especialidad: true }
        });
        return {
          doctor: {
            id: doctor.id.toString(),
            nombre: doctor.nombre,
            apellido: doctor.apellido,
            especialidad: doctor.especialidad
          },
          turnos: d._count.id
        };
      })
    );

    // Pacientes nuevos este mes
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const pacientesNuevosEsteMes = await prisma.paciente.count({
      where: {
        created_at: {
          gte: inicioMes,
          lte: ahora
        }
      }
    });

    // Tasa de completitud de turnos hoy
    const turnosTotalHoy = await prisma.turno.count({
      where: {
        fecha: {
          gte: inicioHoy,
          lte: finHoy
        }
      }
    });

    const tasaCompletitud = turnosTotalHoy > 0 
      ? ((turnosAtendidosHoy / turnosTotalHoy) * 100).toFixed(2)
      : 0;

    return res.status(200).json({
      success: true,
      data: {
        resumen: {
          totalPacientes,
          turnosHoy,
          turnosAtendidosHoy,
          turnosCanceladosHoy,
          pacientesNuevosEsteMes,
          tasaCompletitud: `${tasaCompletitud}%`
        },
        turnosPorEstado: turnosPorEstado.reduce((acc, item) => {
          acc[item.estado] = item._count.id;
          return acc;
        }, {}),
        doctoresConMasTurnos: doctoresDetalles,
        timestamp: ahora.toISOString()
      }
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener las estadísticas'
    });
  }
};

// ============================================================================
// CONTROLLER: ESTADÍSTICAS POR DOCTOR
// ============================================================================
export const obtenerEstadisticasDoctor = async (req, res) => {
  try {
    const { doctor_id } = req.params;
    const ahora = new Date();
    const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const finHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59);

    // Verificar que el doctor existe
    const doctor = await prisma.usuario.findUnique({
      where: { id: BigInt(doctor_id) }
    });

    if (!doctor || doctor.role !== 'doctor') {
      return res.status(404).json({
        error: 'Not found',
        message: 'Doctor no encontrado'
      });
    }

    // Turnos del doctor hoy
    const turnosHoy = await prisma.turno.count({
      where: {
        doctor_id: BigInt(doctor_id),
        fecha: {
          gte: inicioHoy,
          lte: finHoy
        }
      }
    });

    // Turnos atendidos por el doctor hoy
    const turnosAtendidosHoy = await prisma.turno.count({
      where: {
        doctor_id: BigInt(doctor_id),
        estado: 'ATENDIDO',
        fecha: {
          gte: inicioHoy,
          lte: finHoy
        }
      }
    });

    // Total de pacientes atendidos por este doctor
    const pacientesUnicos = await prisma.turno.findMany({
      where: {
        doctor_id: BigInt(doctor_id)
      },
      select: {
        paciente_id: true
      },
      distinct: ['paciente_id']
    });

    // Próximos turnos del doctor
    const proximosTurnos = await prisma.turno.findMany({
      where: {
        doctor_id: BigInt(doctor_id),
        fecha: { gte: ahora },
        estado: { in: ['PENDIENTE', 'CONFIRMADO'] }
      },
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
      take: 5,
      include: {
        paciente: {
          select: { id: true, persona: { select: { dni: true } } }
        }
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        doctor: {
          id: doctor.id.toString(),
          nombre: doctor.nombre,
          apellido: doctor.apellido,
          especialidad: doctor.especialidad,
          subespecialidad: doctor.subespecialidad
        },
        resumen: {
          turnosHoy,
          turnosAtendidosHoy,
          totalPacientesAtendidos: pacientesUnicos.length,
          tasaCompletitud: turnosHoy > 0 ? ((turnosAtendidosHoy / turnosHoy) * 100).toFixed(2) + '%' : '0%'
        },
        proximosTurnos: proximosTurnos.map(t => ({
          ...t,
          id: t.id.toString(),
          doctor_id: t.doctor_id.toString(),
          paciente_id: t.paciente_id.toString(),
          paciente: {
            ...t.paciente,
            id: t.paciente.id.toString()
          }
        }))
      }
    });
  } catch (error) {
    console.error('Error al obtener estadísticas del doctor:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error al obtener las estadísticas'
    });
  }
};

export default {
  obtenerEstadisticas,
  obtenerEstadisticasDoctor
};
