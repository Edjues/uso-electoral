// Carga el censo electoral (números de documento) en la tabla "censo".
//
//   npm run importar-censo -- datos/precenso.txt               agrega los que falten
//   npm run importar-censo -- datos/censo-definitivo.txt --reemplazar   borra el anterior y carga este
//
// El archivo puede ser una lista con un documento por línea, o el texto que produce
//   pdftotext -layout CENSO.pdf censo.txt
// (se toman solo las líneas que tienen únicamente números).
require("dotenv").config();
const fs = require("node:fs");
const { PrismaClient } = require("@prisma/client");

const args = process.argv.slice(2);
const archivo = args.find((a) => !a.startsWith("--")) || "datos/precenso.txt";
const reemplazar = args.includes("--reemplazar");

function leerDocumentos(ruta) {
  const docs = new Set();
  for (const linea of fs.readFileSync(ruta, "utf8").split(/\r?\n/)) {
    if (!/^\s*\d+(\s+\d+)*\s*$/.test(linea)) continue; // solo filas de la tabla
    for (const d of linea.trim().split(/\s+/)) if (d.length >= 3 && d.length <= 15) docs.add(d);
  }
  return [...docs];
}

(async () => {
  if (!fs.existsSync(archivo)) {
    console.error(`No se encontró el archivo ${archivo}`);
    process.exit(1);
  }
  const docs = leerDocumentos(archivo);
  if (!docs.length) {
    console.error("El archivo no tiene números de documento.");
    process.exit(1);
  }
  console.log(`${docs.length} documentos en ${archivo}`);

  const prisma = new PrismaClient();
  try {
    if (reemplazar) {
      const { count } = await prisma.censo.deleteMany();
      console.log(`Borrados ${count} documentos del censo anterior`);
    }
    let nuevos = 0;
    const LOTE = 1000;
    for (let i = 0; i < docs.length; i += LOTE) {
      const { count } = await prisma.censo.createMany({
        data: docs.slice(i, i + LOTE).map((documento) => ({ documento })),
        skipDuplicates: true,
      });
      nuevos += count;
      process.stdout.write(`\r  ${Math.min(i + LOTE, docs.length)} / ${docs.length}`);
    }
    const total = await prisma.censo.count();
    console.log(`\nAgregados: ${nuevos} · Total en el censo: ${total}`);
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
