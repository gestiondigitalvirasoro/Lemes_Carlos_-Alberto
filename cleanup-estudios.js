import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function cleanup() {
  try {
    console.log('🧹 Limpiando estudios duplicados...\n');

    // Obtener todas las consultas que tengan estudios
    const consultas = await prisma.consulta.findMany({
      select: { id: true, paciente_id: true },
      where: {
        estudiosComplementarios: {
          some: {}  // Al menos un estudio
        }
      }
    });

    console.log(`📊 Total de consultas con estudios: ${consultas.length}\n`);

    for (const consulta of consultas) {
      const estudios = await prisma.estudioComplementario.findMany({
        where: { consulta_id: consulta.id },
        orderBy: { id: 'asc' }
      });

      if (estudios.length > 1) {
        console.log(`\n📋 Consulta ${consulta.id}: ${estudios.length} estudios`);
        
        // Agrupar por tipo_estudio
        const porTipo = {};
        estudios.forEach(e => {
          const key = `${e.tipo_estudio}|${e.resultado}|${e.observaciones}`;
          if (!porTipo[key]) porTipo[key] = [];
          porTipo[key].push(e);
        });

        // Eliminar duplicados, mantener 1
        let eliminados = 0;
        for (const [tipo, registros] of Object.entries(porTipo)) {
          if (registros.length > 1) {
            console.log(`  └─ ${tipo}: ${registros.length} registros → eliminando ${registros.length - 1}`);
            
            // Mantener el primero, eliminar los demás
            const idsAEliminar = registros.slice(1).map(e => e.id);
            
            await prisma.estudioComplementario.deleteMany({
              where: { id: { in: idsAEliminar } }
            });
            
            eliminados += idsAEliminar.length;
          }
        }

        if (eliminados > 0) {
          console.log(`  ✅ Eliminados: ${eliminados}`);
        }
      }
    }

    // Resumen final
    const totalEstudios = await prisma.estudioComplementario.count();
    console.log(`\n✨ LIMPEZA COMPLETADA\n  Total de estudios en la BD: ${totalEstudios}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

cleanup();
