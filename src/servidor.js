// Registro de llamadas — servidor (Express + Prisma + Supabase)
//   npm start   -> http://127.0.0.1:8000
require("dotenv").config();
const path = require("node:path");
const { exec } = require("node:child_process");
const express = require("express");
const ExcelJS = require("exceljs");
const { PrismaClient, Prisma } = require("@prisma/client");
const auth = require("./auth");

const PUERTO = Number(process.env.PUERTO) || 8000;
const RAIZ = path.join(__dirname, "..");
const VISTAS = path.join(RAIZ, "vistas");  // páginas que pasan por la verificación de sesión
const PUBLICO = path.join(RAIZ, "public"); // estilos y scripts (en Vercel los sirve su CDN)

// En Vercel se reutiliza el cliente entre peticiones de la misma instancia
const prisma = globalThis.__prisma || (globalThis.__prisma = new PrismaClient());
const app = express();

app.disable("x-powered-by");
// En Vercel la app está detrás de un proxy: así req.ip es la IP real y req.secure detecta HTTPS
if (process.env.VERCEL) app.set("trust proxy", 1);
app.use((_req, res, next) => {
  res.set("Strict-Transport-Security", "max-age=31536000");
  next();
});
app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use(auth.cargarUsuario(prisma));

// ------------------------------------------------------------------ utilidades
const texto = (v) => String(v ?? "").trim().slice(0, 5000);
const aBool = (v) => [true, 1, "1", "true", "si", "sí"].includes(v);
const pad = (n) => String(n).padStart(4, "0");
const numeroCaso = (id, fecha) => `${String(fecha || new Date().getFullYear()).slice(0, 4)}-${pad(id)}`;
const normalizar = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

class ErrorUsuario extends Error {
  constructor(mensaje, estado = 400) { super(mensaje); this.estado = estado; }
}

const manejar = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (e) {
    if (e instanceof ErrorUsuario) return res.status(e.estado).json({ error: e.message });
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return res.status(404).json({ error: "No encontrado" });
      if (e.code === "P2002") return res.status(409).json({ error: "Ese registro ya existe." });
    }
    console.error(e);
    res.status(500).json({ error: "No se pudo conectar con la base de datos. Revise el archivo .env y su conexión a internet." });
  }
};

// ------------------------------------------------------------------ páginas
app.get(["/login", "/login.html"], (req, res) => {
  if (req.usuario && !req.usuario.debeCambiarClave) return res.redirect("/");
  res.sendFile(path.join(VISTAS, "login.html"));
});
app.get(["/", "/index.html"], (req, res) => {
  if (!req.usuario || req.usuario.debeCambiarClave) return res.redirect("/login");
  res.sendFile(path.join(VISTAS, "index.html"));
});
app.use(express.static(PUBLICO, { index: false, etag: false }));

// ------------------------------------------------------------------ sesión
app.post("/api/login", manejar(async (req, res) => {
  const usuario = texto(req.body?.usuario).toLowerCase();
  const clave = String(req.body?.clave ?? "");
  if (!usuario || !clave) throw new ErrorUsuario("Escriba su usuario y contraseña.");

  const llave = `${req.ip}|${usuario}`;
  const espera = await auth.bloqueado(prisma, llave);
  if (espera) throw new ErrorUsuario(`Demasiados intentos. Espere ${espera} segundos.`, 429);

  const u = await prisma.usuario.findUnique({ where: { usuario } });
  const ok = u && auth.verificarClave(clave, u.claveHash);
  if (!ok || !u.activo) {
    await auth.registrarFallo(prisma, llave);
    throw new ErrorUsuario(ok ? "Este usuario está desactivado." : "Usuario o contraseña incorrectos.", 401);
  }
  await auth.limpiarFallos(prisma, llave);
  await prisma.usuario.update({ where: { id: u.id }, data: { ultimoIngreso: new Date() } });
  await auth.crearSesion(prisma, req, res, u.id);
  res.json({ usuario: auth.publico(u) });
}));

app.post("/api/logout", manejar(async (req, res) => {
  await auth.cerrarSesion(prisma, req, res);
  res.json({ ok: true });
}));

app.get("/api/yo", (req, res) => {
  if (!req.usuario) return res.status(401).json({ error: "Debe iniciar sesión.", sesion: false });
  res.json({ usuario: auth.publico(req.usuario) });
});

app.post("/api/cambiar-clave", manejar(async (req, res) => {
  if (!req.usuario) throw new ErrorUsuario("Debe iniciar sesión.", 401);
  const { actual, nueva } = req.body || {};
  if (!auth.verificarClave(String(actual ?? ""), req.usuario.claveHash)) {
    throw new ErrorUsuario("La contraseña actual no es correcta.");
  }
  const error = auth.validarNuevaClave(nueva, req.usuario.usuario);
  if (error) throw new ErrorUsuario(error);
  if (auth.verificarClave(nueva, req.usuario.claveHash)) throw new ErrorUsuario("La nueva contraseña debe ser diferente a la actual.");
  await prisma.$transaction([
    prisma.usuario.update({
      where: { id: req.usuario.id },
      data: { claveHash: auth.hashClave(nueva), debeCambiarClave: false },
    }),
    // cierra las demás sesiones abiertas de esta persona
    prisma.sesion.deleteMany({ where: { usuarioId: req.usuario.id, NOT: { id: req.sesionId } } }),
  ]);
  res.json({ ok: true });
}));

// de aquí en adelante todo requiere sesión
app.use(["/api", "/exportar"], auth.requiereSesion);

// ------------------------------------------------------------------ usuarios (solo administrador)
const ROLES = ["ADMIN", "TRABAJADOR"];

async function adminsActivos(excluirId) {
  return prisma.usuario.count({ where: { rol: "ADMIN", activo: true, NOT: { id: excluirId } } });
}

app.get("/api/usuarios", auth.requiereAdmin, manejar(async (_req, res) => {
  const lista = await prisma.usuario.findMany({ orderBy: [{ rol: "asc" }, { nombre: "asc" }] });
  res.json(lista.map(auth.publico));
}));

app.post("/api/usuarios", auth.requiereAdmin, manejar(async (req, res) => {
  const b = req.body || {};
  const nombre = texto(b.nombre);
  const cedula = texto(b.cedula);
  const usuario = (texto(b.usuario) || cedula).toLowerCase();
  const rol = ROLES.includes(b.rol) ? b.rol : "TRABAJADOR";
  const clave = String(b.clave || cedula || "");
  if (!nombre || !usuario) throw new ErrorUsuario("El nombre y el usuario (o la cédula) son obligatorios.");
  if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) throw new ErrorUsuario("El usuario solo puede tener letras, números, punto, guion o guion bajo (3 a 40).");
  if (clave.length < 4) throw new ErrorUsuario("La contraseña inicial debe tener al menos 4 caracteres.");
  const u = await prisma.usuario.create({
    data: { nombre, cedula, usuario, rol, claveHash: auth.hashClave(clave), debeCambiarClave: true },
  });
  res.status(201).json(auth.publico(u));
}));

app.put("/api/usuarios/:id", auth.requiereAdmin, manejar(async (req, res) => {
  const id = idDe(req);
  const b = req.body || {};
  const actual = await prisma.usuario.findUnique({ where: { id } });
  if (!actual) throw new ErrorUsuario("No encontrado", 404);
  const datos = {
    nombre: texto(b.nombre) || actual.nombre,
    cedula: texto(b.cedula),
    rol: ROLES.includes(b.rol) ? b.rol : actual.rol,
    activo: b.activo === undefined ? actual.activo : aBool(b.activo),
  };
  if (actual.rol === "ADMIN" && (datos.rol !== "ADMIN" || !datos.activo) && (await adminsActivos(id)) === 0) {
    throw new ErrorUsuario("Debe quedar al menos un administrador activo.");
  }
  const u = await prisma.usuario.update({ where: { id }, data: datos });
  if (!datos.activo) await prisma.sesion.deleteMany({ where: { usuarioId: id } });
  res.json(auth.publico(u));
}));

app.post("/api/usuarios/:id/restablecer", auth.requiereAdmin, manejar(async (req, res) => {
  const id = idDe(req);
  const clave = String(req.body?.clave || "");
  if (clave.length < 4) throw new ErrorUsuario("La contraseña temporal debe tener al menos 4 caracteres.");
  await prisma.$transaction([
    prisma.usuario.update({ where: { id }, data: { claveHash: auth.hashClave(clave), debeCambiarClave: true } }),
    prisma.sesion.deleteMany({ where: { usuarioId: id } }),
  ]);
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ llamadas, respuestas y programas
// Cada recurso define: modelo de Prisma, campos permitidos, obligatorios, orden y cómo
// convertir entre el formato de la página (JSON) y el de la base de datos.
const RECURSOS = {
  llamadas: {
    modelo: () => prisma.llamada,
    campos: ["fecha_hora", "nombre", "cedula", "programa", "solicitud", "respuesta", "observacion", "resuelto"],
    obligatorios: ["fecha_hora", "nombre", "cedula", "solicitud"],
    orden: [{ fechaHora: "desc" }, { id: "desc" }],
    incluir: { usuario: { select: { nombre: true } } },
    aBD: (d) => {
      const r = {};
      for (const [k, v] of Object.entries(d)) r[k === "fecha_hora" ? "fechaHora" : k] = v;
      return r;
    },
    aJSON: (f) => ({
      id: f.id, caso: f.caso || "", fecha_hora: f.fechaHora, nombre: f.nombre, cedula: f.cedula,
      programa: f.programa, solicitud: f.solicitud, respuesta: f.respuesta,
      observacion: f.observacion, resuelto: f.resuelto, atendio: f.usuario?.nombre || "",
    }),
  },
  respuestas: {
    modelo: () => prisma.respuesta,
    campos: ["pregunta", "respuesta", "resolucion"],
    obligatorios: ["pregunta", "respuesta"],
    orden: [{ pregunta: "asc" }],
    aBD: (d) => d,
    aJSON: ({ id, pregunta, respuesta, resolucion }) => ({ id, pregunta, respuesta, resolucion }),
  },
  programas: {
    modelo: () => prisma.programa,
    campos: ["nombre"],
    obligatorios: ["nombre"],
    orden: [{ nombre: "asc" }],
    aBD: (d) => d,
    aJSON: ({ id, nombre }) => ({ id, nombre }),
  },
};

function limpiar(cfg, datos, parcial) {
  if (!datos || typeof datos !== "object") throw new ErrorUsuario("Datos inválidos.");
  const campos = cfg.campos.filter((c) => !parcial || c in datos);
  if (!campos.length) throw new ErrorUsuario("No hay campos para guardar.");
  const valores = {};
  for (const c of campos) valores[c] = c === "resuelto" ? aBool(datos[c]) : texto(datos[c]);
  const faltan = cfg.obligatorios.filter((c) => c in valores && !valores[c]);
  if (faltan.length) throw new ErrorUsuario("Faltan campos obligatorios: " + faltan.join(", "));
  return cfg.aBD(valores);
}

function recurso(req) {
  const cfg = RECURSOS[req.params.recurso];
  if (!cfg) throw new ErrorUsuario("No encontrado", 404);
  return cfg;
}

function idDe(req) {
  if (!/^\d+$/.test(req.params.id)) throw new ErrorUsuario("No encontrado", 404);
  return Number(req.params.id);
}

// evita programas repetidos que solo difieren en mayúsculas o tildes
async function verificarProgramaUnico(nombre, idActual) {
  const todos = await prisma.programa.findMany({ select: { id: true, nombre: true } });
  if (todos.some((p) => p.id !== idActual && normalizar(p.nombre) === normalizar(nombre))) {
    throw new ErrorUsuario("Ese programa ya existe.", 409);
  }
}

app.get("/api/siguiente-caso", manejar(async (_req, res) => {
  // consulta el contador de la tabla sin consumirlo
  const [fila] = await prisma.$queryRaw`
    SELECT pg_sequence_last_value(pg_get_serial_sequence('llamadas', 'id')::regclass) AS ultimo`;
  res.json({ caso: numeroCaso(Number(fila?.ultimo ?? 0) + 1) });
}));

app.get("/api/:recurso", manejar(async (req, res) => {
  const cfg = recurso(req);
  const filas = await cfg.modelo().findMany({ orderBy: cfg.orden, include: cfg.incluir });
  res.json(filas.map(cfg.aJSON));
}));

app.post("/api/:recurso", manejar(async (req, res) => {
  const cfg = recurso(req);
  const datos = limpiar(cfg, req.body, false);
  let fila;
  if (req.params.recurso === "llamadas") {
    fila = await prisma.$transaction(async (tx) => {
      const nueva = await tx.llamada.create({ data: { ...datos, usuarioId: req.usuario.id } });
      return tx.llamada.update({
        where: { id: nueva.id },
        data: { caso: numeroCaso(nueva.id, nueva.fechaHora) },
        include: cfg.incluir,
      });
    });
  } else {
    if (req.params.recurso === "programas") await verificarProgramaUnico(datos.nombre);
    fila = await cfg.modelo().create({ data: datos });
  }
  res.status(201).json(cfg.aJSON(fila));
}));

async function actualizar(req, res, parcial) {
  const cfg = recurso(req);
  const id = idDe(req);
  const datos = limpiar(cfg, req.body, parcial);
  if (req.params.recurso === "programas") await verificarProgramaUnico(datos.nombre, id);
  const fila = await cfg.modelo().update({ where: { id }, data: datos, include: cfg.incluir });
  res.json(cfg.aJSON(fila));
}
app.put("/api/:recurso/:id", manejar((req, res) => actualizar(req, res, false)));
app.patch("/api/:recurso/:id", manejar((req, res) => actualizar(req, res, true)));

app.delete("/api/:recurso/:id", manejar(async (req, res) => {
  const cfg = recurso(req);
  await cfg.modelo().delete({ where: { id: idDe(req) } });
  res.json({ ok: true });
}));

app.use("/api", (_req, res) => res.status(404).json({ error: "No encontrado" }));

// ------------------------------------------------------------------ exportar a Excel
app.get("/exportar", manejar(async (_req, res) => {
  const [llamadas, respuestas, programas] = await Promise.all([
    prisma.llamada.findMany({ orderBy: RECURSOS.llamadas.orden, include: RECURSOS.llamadas.incluir }),
    prisma.respuesta.findMany({ orderBy: { pregunta: "asc" } }),
    prisma.programa.findMany({ orderBy: { nombre: "asc" } }),
  ]);

  const libro = new ExcelJS.Workbook();
  const hoja = (nombre, columnas, filas) => {
    const h = libro.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
    h.columns = columnas.map(([header, key, width]) => ({ header, key, width }));
    h.addRows(filas);
    h.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    h.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    h.eachRow((fila, n) => n > 1 && (fila.alignment = { vertical: "top", wrapText: true }));
    h.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  };

  hoja("Llamadas", [
    ["Caso", "caso", 12], ["Fecha y hora", "fecha", 18], ["Nombre completo", "nombre", 30],
    ["Cédula", "cedula", 14], ["Programa", "programa", 30], ["Solicitud", "solicitud", 38],
    ["Respuesta", "respuesta", 45], ["Observación", "observacion", 35], ["Estado", "estado", 12],
    ["Atendió", "atendio", 24],
  ], llamadas.map((l) => ({
    ...l, fecha: (l.fechaHora || "").replace("T", " "),
    estado: l.resuelto ? "Resuelto" : "Pendiente", atendio: l.usuario?.nombre || "",
  })));
  hoja("Respuestas", [
    ["Posible pregunta", "pregunta", 45], ["Posible respuesta", "respuesta", 55],
    ["Resolución relacionada", "resolucion", 50],
  ], respuestas);
  hoja("Programas", [["Programa", "nombre", 50]], programas);

  const hoy = new Date().toISOString().slice(0, 10);
  res.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.set("Content-Disposition", `attachment; filename="registro_llamadas_${hoy}.xlsx"`);
  await libro.xlsx.write(res);
  res.end();
}));

// ------------------------------------------------------------------ inicio
async function iniciar() {
  if (!process.env.DATABASE_URL || /\[|TU-|REGION/i.test(process.env.DATABASE_URL)) {
    console.error("Falta configurar DATABASE_URL y DIRECT_URL en el archivo .env (vea .env.example).");
    process.exit(1);
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    console.error("No se pudo conectar a Supabase. Revise .env y su conexión a internet.\n" + e.message);
    process.exit(1);
  }

  const url = `http://127.0.0.1:${PUERTO}`;
  const servidor = app.listen(PUERTO, "127.0.0.1", () => {
    console.log(`Registro de llamadas en ${url}`);
    console.log("Base de datos: Supabase (PostgreSQL) mediante Prisma");
    console.log("Deje esta ventana abierta mientras usa la página. Ctrl+C para detener.");
    if (process.platform === "win32" && !process.env.NO_ABRIR) exec(`start "" "${url}"`);
  });
  servidor.on("error", (e) => {
    if (e.code === "EADDRINUSE") {
      console.error(`El puerto ${PUERTO} ya está en uso: hay otra ventana del servidor abierta. Ciérrela y vuelva a intentar.`);
    } else console.error(e);
    process.exit(1);
  });

  const salir = async () => { await prisma.$disconnect(); process.exit(0); };
  process.on("SIGINT", salir);
  process.on("SIGTERM", salir);
}

if (require.main === module) iniciar();
module.exports = { app, prisma };
