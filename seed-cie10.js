import { createWriteStream, createReadStream, unlinkSync } from 'fs';
import { parse } from 'csv-parse';
import https from 'https';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CSV_URL = 'https://raw.githubusercontent.com/verasativa/CIE-10/master/cie-10.csv';
const CSV_PATH = './cie10_temp.csv';
const LOTE = 500;

// ── 1. Descargar CSV ─────────────────────────────────────────
const descargarCSV = () => new Promise((resolve, reject) => {
  console.log('📥 Descargando CSV de CIE-10...');
  const file = createWriteStream(CSV_PATH);
  https.get(CSV_URL, res => {
    res.pipe(file);
    file.on('finish', () => { file.close(); resolve(); });
  }).on('error', reject);
});

// ── 2. Parsear CSV ──────────────────────────────────────────
const parsearCSV = () => new Promise((resolve, reject) => {
  const registros = [];

  createReadStream(CSV_PATH)
    .pipe(parse({ 
      columns: true, 
      trim: true,
      skip_empty_lines: true 
    }))
    .on('data', (row) => {
      // Detectar columnas
      if (registros.length === 0) {
        console.log('📌 Columnas detectadas:', Object.keys(row));
      }

      // Mapear según estructura del CSV
      const codigo = row.code?.trim() || row.codigo?.trim() || '';
      const descripcion = row.description?.trim() || row.descripcion?.trim() || '';
      const nivel = parseInt(row.level) || 0;

      // FILTRO: Solo incluir códigos con nivel alto (4+) = códigos específicos
      // Los códigos genéricos son nivel 1-3
      // El CSV de OMS trae muchos niveles para jerarquía, pero queremos los finales
      if (codigo && descripcion && !codigo.includes('-') && codigo.length >= 3) {
        registros.push({
          codigo,
          descripcion,
          capitulo: null,
          activo: true,
          frecuencia_uso: 0,
          nivel
        });
      }
    })
    .on('end', () => {
      console.log(`✅ Parseado: ${registros.length} registros específicos (nivel alto)`);
      resolve(registros);
    })
    .on('error', reject);
});

// ── 3. Insertar en Base de Datos por lotes ──────────────────
const insertar = async (registros) => {
  let total = 0;
  let errores = 0;

  for (let i = 0; i < registros.length; i += LOTE) {
    const chunk = registros.slice(i, i + LOTE);

    try {
      // Intentar insertar/actualizar cada registro
      for (const reg of chunk) {
        try {
          await prisma.CIE10.upsert({
            where: { codigo: reg.codigo },
            update: {
              descripcion: reg.descripcion,
              capitulo: reg.capitulo,
              activo: reg.activo,
            },
            create: {
              codigo: reg.codigo,
              descripcion: reg.descripcion,
              capitulo: reg.capitulo,
              activo: reg.activo,
              frecuencia_uso: 0,
            },
          });
        } catch (err) {
          console.warn(`⚠️  Error en ${reg.codigo}:`, err.message);
          errores++;
        }
      }

      total += chunk.length - errores;
      process.stdout.write(`\r✅ ${total}/${registros.length - errores} insertados...`);
    } catch (error) {
      console.error(`❌ Error en lote ${i}:`, error.message);
      throw error;
    }
  }

  console.log(`\n✅ Proceso completado: ${total} códigos insertados`);
  if (errores > 0) {
    console.warn(`⚠️  ${errores} errores durante la inserción`);
  }
};

// ── Main ────────────────────────────────────────────────────
const main = async () => {
  try {
    console.log('🏥 Iniciando carga de CIE-10...\n');

    // Descargar
    await descargarCSV();

    // Parsear
    const registros = await parsearCSV();

    // Filtrar duplicados por código
    const unicos = [];
    const codigos = new Set();
    for (const r of registros) {
      if (!codigos.has(r.codigo)) {
        unicos.push(r);
        codigos.add(r.codigo);
      }
    }

    console.log(`🧹 ${unicos.length} registros únicos para insertar\n`);

    // Insertar
    await insertar(unicos);

    // Limpiar
    unlinkSync(CSV_PATH);
    console.log('\n🎉 Carga completada exitosamente');
    console.log(`📊 Total CIE-10 en base de datos: ${unicos.length}`);

  } catch (err) {
    console.error('\n❌ Error fatal:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

main();
