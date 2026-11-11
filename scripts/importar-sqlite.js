// Copia a Supabase lo que haya en la base anterior (llamadas.db).
//   npm run importar-sqlite
// No borra nada: las respuestas y programas que ya existan (mismo texto) se omiten,
// y las llamadas se omiten si ya hay una con la misma cédula, fecha y solicitud.
require("dotenv").config();
const path = require("node:path");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const { PrismaClient } = require("@prisma/client");

const ARCHIVO = path.join(__dirname, "..", "llamadas.db");
const prisma = new PrismaClient();
const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

async function main() {
  if (!fs.existsSync(ARCHIVO)) {
    console.log("No se encontró llamadas.db; no hay nada que importar.");
    return;
  }
  const db = new DatabaseSync(ARCHIVO, { readOnly: true });
  const tablas = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name));

  // respuestas
  let n = 0;
  if (tablas.has("respuestas")) {
    const existentes = new Set((await prisma.respuesta.findMany()).map((r) => norm(r.pregunta)));
    for (const r of db.prepare("SELECT pregunta, respuesta, resolucion FROM respuestas").all()) {
      if (existentes.has(norm(r.pregunta))) continue;
      await prisma.respuesta.create({ data: { pregunta: r.pregunta, respuesta: r.respuesta, resolucion: r.resolucion || "" } });
      existentes.add(norm(r.pregunta)); n++;
    }
  }
  console.log(`Respuestas importadas: ${n}`);

  // programas
  n = 0;
  if (tablas.has("programas")) {
    const existentes = new Set((await prisma.programa.findMany()).map((p) => norm(p.nombre)));
    for (const p of db.prepare("SELECT nombre FROM programas").all()) {
      if (existentes.has(norm(p.nombre))) continue;
      await prisma.programa.create({ data: { nombre: p.nombre } });
      existentes.add(norm(p.nombre)); n++;
    }
  }
  console.log(`Programas importados: ${n}`);

  // llamadas (reciben un número de caso nuevo en Supabase)
  n = 0;
  if (tablas.has("llamadas")) {
    const columnas = new Set(db.prepare("PRAGMA table_info(llamadas)").all().map((c) => c.name));
    const filas = db.prepare("SELECT * FROM llamadas ORDER BY id").all();
    for (const l of filas) {
      const ya = await prisma.llamada.findFirst({
        where: { cedula: l.cedula, fechaHora: l.fecha_hora, solicitud: l.solicitud },
      });
      if (ya) continue;
      await prisma.$transaction(async (tx) => {
        const nueva = await tx.llamada.create({
          data: {
            fechaHora: l.fecha_hora, nombre: l.nombre, cedula: l.cedula, programa: l.programa || "",
            solicitud: l.solicitud, respuesta: l.respuesta || "", observacion: l.observacion || "",
            resuelto: columnas.has("resuelto") ? !!l.resuelto : false,
          },
        });
        await tx.llamada.update({
          where: { id: nueva.id },
          data: { caso: `${String(nueva.fechaHora).slice(0, 4)}-${String(nueva.id).padStart(4, "0")}` },
        });
      });
      n++;
    }
  }
  console.log(`Llamadas importadas: ${n}`);
  db.close();
}

main()
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
