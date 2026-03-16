import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('🔍 Revisando Estudios Complementarios...\n');
    
    const estudios = await prisma.estudioComplementario.findMany({
      where: {
        consulta_id: 2  // De la consulta que estamos viendo
      },
      include: {
        consulta: {
          select: { id: true, motivo_consulta: true }
        }
      }
    });
    
    console.log(`Total de estudios en consulta 2: ${estudios.length}\n`);
    
    estudios.forEach((est, idx) => {
      console.log(`\n📋 Estudio ${idx + 1}:`);
      console.log(`   ID: ${est.id}`);
      console.log(`   Tipo: ${est.tipo_estudio}`);
      console.log(`   Resultado: ${est.resultado}`);
      console.log(`   Observaciones: ${est.observaciones}`);
      console.log(`   Fecha (raw): ${est.fecha_estudio}`);
      console.log(`   Fecha tipo: ${typeof est.fecha_estudio}`);
      console.log(`   Fecha instanceof Date: ${est.fecha_estudio instanceof Date}`);
      
      // Intentar formatear como lo hace el servidor
      if (est.fecha_estudio) {
        try {
          let fechaString = est.fecha_estudio;
          if (est.fecha_estudio instanceof Date) {
            fechaString = est.fecha_estudio.toISOString().split('T')[0];
          }
          const partes = fechaString.split('-');
          if (partes.length === 3) {
            const año = partes[0];
            const mes = partes[1];
            const dia = partes[2];
            const formateada = `${dia}/${mes}/${año}`;
            console.log(`   Fecha formateada: ${formateada}`);
          }
        } catch (e) {
          console.log(`   Error al formatear: ${e.message}`);
        }
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
