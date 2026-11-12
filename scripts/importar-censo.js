// Carga el censo electoral en la tabla "censo".
//
//   npm run importar-censo -- "CENSO FINAL EGRESADOS HABILITADOS.xlsx"   agrega los que falten y completa sus datos
//   npm run importar-censo -- datos/precenso.txt                          solo números de documento
//   ... --reemplazar                                                      borra el censo anterior y carga este
//   ... --revisar                                                         solo compara con la base de datos, no cambia nada
//
// Excel: primera hoja con las columnas FECHA DE GRADOS, CEDULA, EXPEDIDA, PRIMER NOMBRE, SEGUNDO NOMBRE,
// PRIMER APELLIDO, SEGUNDO APELLIDO, TITULO, ACTAS INDIVIDUAL (se ubican por el encabezado).
// Texto: una lista con un documento por línea, o la salida de  pdftotext -layout CENSO.pdf censo.txt
// (se toman solo las líneas que tienen únicamente números).
require("dotenv").config();
const fs = require("node:fs");
const { PrismaClient } = require("@prisma/client");

const args = process.argv.slice(2);
const archivo = args.find((a) => !a.startsWith("--")) || "datos/precenso.txt";
const reemplazar = args.includes("--reemplazar");
const revisar = args.includes("--revisar");

const DOC = /^\d{3,15}$/;

function leerTexto(ruta) {
  const docs = new Set();
  for (const linea of fs.readFileSync(ruta, "utf8").split(/\r?\n/)) {
    if (!/^\s*\d+(\s+\d+)*\s*$/.test(linea)) continue; // solo filas de la tabla
    for (const d of linea.trim().split(/\s+/)) if (DOC.test(d)) docs.add(d);
  }
  return [...docs].map((documento) => ({ documento }));
}

function texto(v) {
  if (v == null) return "";
  if (typeof v === "object") {
    if (v instanceof Date) return v;
    if (v.richText) return v.richText.map((t) => t.text).join("").trim();
    if (v.text !== undefined) return String(v.text).trim();
    if (v.result !== undefined) return texto(v.result);
  }
  return String(v).replace(/\s+/g, " ").trim();
}

async function leerExcel(ruta) {
  const ExcelJS = require("exceljs");
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(ruta);
  const hoja = libro.worksheets[0];
  const norm = (s) => texto(s).toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const enc = hoja.getRow(1).values.map(norm);
  const col = (...nombres) => enc.findIndex((h) => h && nombres.some((n) => h.includes(n)));
  const c = {
    fecha: col("FECHA"), cedula: col("CEDULA", "DOCUMENTO"), expedida: col("EXPEDIDA"),
    n1: col("PRIMER NOMBRE"), n2: col("SEGUNDO NOMBRE"), a1: col("PRIMER APELLIDO"), a2: col("SEGUNDO APELLIDO"),
    titulo: col("TITULO"), acta: col("ACTA"),
  };
  if (c.cedula < 0) throw new Error("La primera hoja no tiene una columna CEDULA.");

  const filas = new Map();
  const invalidas = [];
  for (let i = 2; i <= hoja.rowCount; i++) {
    const v = hoja.getRow(i).values;
    const t = (k) => (c[k] < 0 ? "" : texto(v[c[k]]));
    const documento = String(t("cedula")).replace(/[\s.,-]/g, "");
    if (!documento) continue;
    if (!DOC.test(documento)) { invalidas.push(`fila ${i}: ${documento}`); continue; }
    const fecha = t("fecha");
    const nombre = [t("n1"), t("n2"), t("a1"), t("a2")].filter(Boolean).join(" ");
    filas.set(documento, {
      documento,
      nombre: nombre || null,
      titulo: t("titulo") || null,
      fechaGrado: fecha instanceof Date && !isNaN(fecha) ? fecha : null,
      expedida: t("expedida") || null,
      acta: String(t("acta")) || null,
    });
  }
  if (invalidas.length) console.log(`Ignoradas ${invalidas.length} filas con documento inválido:`, invalidas.slice(0, 10).join(", "));
  return [...filas.values()];
}

(async () => {
  if (!fs.existsSync(archivo)) {
    console.error(`No se encontró el archivo ${archivo}`);
    process.exit(1);
  }
  const filas = /\.xlsx$/i.test(archivo) ? await leerExcel(archivo) : leerTexto(archivo);
  if (!filas.length) {
    console.error("El archivo no tiene números de documento.");
    process.exit(1);
  }
  const conDatos = filas.some((f) => f.nombre !== undefined);
  console.log(`${filas.length} documentos en ${archivo}${conDatos ? " (con datos del egresado)" : ""}`);

  const prisma = new PrismaClient();
  try {
    const actuales = await prisma.censo.findMany({ select: { documento: true, nombre: true } });
    const enBase = new Map(actuales.map((r) => [r.documento, r]));
    const enArchivo = new Set(filas.map((f) => f.documento));
    const nuevos = filas.filter((f) => !enBase.has(f.documento));
    const sinDatos = conDatos ? filas.filter((f) => enBase.has(f.documento) && !enBase.get(f.documento).nombre) : [];
    const sobran = actuales.filter((r) => !enArchivo.has(r.documento));
    console.log(`En la base: ${actuales.length} · nuevos: ${nuevos.length} · por completar datos: ${sinDatos.length} · en la base y no en el archivo: ${sobran.length}`);
    if (sobran.length) console.log("  ejemplos que no están en el archivo:", sobran.slice(0, 10).map((r) => r.documento).join(", "));
    if (revisar) return;

    if (reemplazar && sobran.length) {
      const { count } = await prisma.censo.deleteMany({ where: { documento: { notIn: [...enArchivo] } } });
      console.log(`Borrados ${count} documentos que ya no están en el censo`);
    }

    const LOTE = 1000;
    for (let i = 0; i < nuevos.length; i += LOTE) {
      await prisma.censo.createMany({ data: nuevos.slice(i, i + LOTE), skipDuplicates: true });
      process.stdout.write(`\r  agregados ${Math.min(i + LOTE, nuevos.length)} / ${nuevos.length}`);
    }
    if (nuevos.length) console.log();

    // completa los datos de los que ya estaban (un solo UPDATE por lote)
    const LOTE_DATOS = 200;
    for (let i = 0; i < sinDatos.length; i += LOTE_DATOS) {
      const lote = sinDatos.slice(i, i + LOTE_DATOS);
      await prisma.$executeRawUnsafe(
        `UPDATE public.censo c SET nombre = d.nombre, titulo = d.titulo, fecha_grado = d.fecha_grado::date,
                expedida = d.expedida, acta = d.acta
           FROM jsonb_to_recordset($1::jsonb)
                AS d(documento text, nombre text, titulo text, fecha_grado text, expedida text, acta text)
          WHERE c.documento = d.documento`,
        JSON.stringify(lote.map((f) => ({
          documento: f.documento, nombre: f.nombre, titulo: f.titulo,
          fecha_grado: f.fechaGrado ? f.fechaGrado.toISOString().slice(0, 10) : null,
          expedida: f.expedida, acta: f.acta,
        })))
      );
      process.stdout.write(`\r  datos completados ${Math.min(i + LOTE_DATOS, sinDatos.length)} / ${sinDatos.length}`);
    }
    if (sinDatos.length) console.log();

    const total = await prisma.censo.count();
    const completos = conDatos ? await prisma.censo.count({ where: { nombre: { not: null } } }) : null;
    console.log(`Total en el censo: ${total}${completos != null ? ` · con datos del egresado: ${completos}` : ""}`);
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
