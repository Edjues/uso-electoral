// Autenticación: contraseñas con scrypt, sesiones guardadas en la base de datos y cookie httpOnly.
const crypto = require("node:crypto");

const COOKIE = "sid";
const DURACION_MS = 12 * 60 * 60 * 1000; // 12 horas (una jornada)
const RENOVAR_MS = 6 * 60 * 60 * 1000;   // si quedan menos de 6 h y la persona sigue activa, se extiende

// ------------------------------------------------------------------ contraseñas
function hashClave(clave) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(clave), sal, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${sal.toString("base64")}$${hash.toString("base64")}`;
}

function verificarClave(clave, guardado) {
  const [tipo, sal, hash] = String(guardado || "").split("$");
  if (tipo !== "scrypt" || !sal || !hash) return false;
  const esperado = Buffer.from(hash, "base64");
  const calculado = crypto.scryptSync(String(clave), Buffer.from(sal, "base64"), esperado.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(esperado, calculado);
}

function validarNuevaClave(clave, usuario) {
  if (typeof clave !== "string" || clave.length < 6) return "La contraseña debe tener al menos 6 caracteres.";
  if (clave.length > 200) return "La contraseña es demasiado larga.";
  if (usuario && clave.toLowerCase() === String(usuario).toLowerCase()) return "La contraseña no puede ser igual al usuario.";
  return null;
}

// ------------------------------------------------------------------ cookies y sesiones
const huella = (token) => crypto.createHash("sha256").update(token).digest("hex");

function leerCookie(req, nombre) {
  for (const parte of String(req.headers.cookie || "").split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nombre) return decodeURIComponent(v.join("="));
  }
  return null;
}

function ponerCookie(req, res, token, expira) {
  const partes = [`${COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Strict"];
  if (req.secure) partes.push("Secure"); // en HTTPS (Vercel) la cookie solo viaja cifrada
  partes.push(token ? `Expires=${expira.toUTCString()}` : "Max-Age=0");
  res.append("Set-Cookie", partes.join("; "));
}

async function crearSesion(prisma, req, res, usuarioId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expira = new Date(Date.now() + DURACION_MS);
  await prisma.sesion.create({ data: { id: huella(token), usuarioId, expira } });
  ponerCookie(req, res, token, expira);
  // limpieza ocasional de sesiones vencidas
  if (Math.random() < 0.1) prisma.sesion.deleteMany({ where: { expira: { lt: new Date() } } }).catch(() => {});
}

async function cerrarSesion(prisma, req, res) {
  const token = leerCookie(req, COOKIE);
  if (token) await prisma.sesion.deleteMany({ where: { id: huella(token) } });
  ponerCookie(req, res, "", null);
}

// carga req.usuario si la cookie es válida (no bloquea; eso lo hacen los "requiere...")
function cargarUsuario(prisma) {
  return async (req, res, next) => {
    req.usuario = null;
    const token = leerCookie(req, COOKIE);
    if (!token) return next();
    try {
      const sesion = await prisma.sesion.findUnique({ where: { id: huella(token) }, include: { usuario: true } });
      if (sesion && sesion.expira > new Date() && sesion.usuario.activo) {
        req.usuario = sesion.usuario;
        req.sesionId = sesion.id;
        if (sesion.expira - Date.now() < RENOVAR_MS) {
          const expira = new Date(Date.now() + DURACION_MS);
          await prisma.sesion.update({ where: { id: sesion.id }, data: { expira } });
          ponerCookie(req, res, token, expira);
        }
      }
    } catch (e) {
      console.error("No se pudo verificar la sesión:", e.message); // se trata como no autenticado
    }
    next();
  };
}

function requiereSesion(req, res, next) {
  if (!req.usuario) return res.status(401).json({ error: "Debe iniciar sesión.", sesion: false });
  if (req.usuario.debeCambiarClave) {
    return res.status(403).json({ error: "Debe cambiar su contraseña antes de continuar.", cambiarClave: true });
  }
  next();
}

function requiereAdmin(req, res, next) {
  if (req.usuario?.rol !== "ADMIN") return res.status(403).json({ error: "Solo el administrador puede hacer esto." });
  next();
}

// ------------------------------------------------------------------ freno a intentos repetidos
// Se guarda en la base de datos (tabla intentos_ingreso) porque en Vercel cada
// instancia del servidor tiene su propia memoria.
// Regla: desde el 5.º fallo seguido se bloquea 1 min, luego 2, 3... hasta 15 min.
// Los fallos se olvidan tras 30 minutos sin intentos.
const OLVIDAR_MS = 30 * 60 * 1000;

async function bloqueado(prisma, clave) {
  const r = await prisma.intentoIngreso.findUnique({ where: { clave } });
  if (!r?.bloqueadoHasta || r.bloqueadoHasta <= new Date()) return 0;
  return Math.ceil((r.bloqueadoHasta - Date.now()) / 1000);
}

async function registrarFallo(prisma, clave) {
  const previo = await prisma.intentoIngreso.findUnique({ where: { clave } });
  const fallos = previo && Date.now() - previo.actualizado < OLVIDAR_MS ? previo.fallos + 1 : 1;
  const bloqueadoHasta = fallos >= 5 ? new Date(Date.now() + 60_000 * Math.min(fallos - 4, 15)) : null;
  await prisma.intentoIngreso.upsert({
    where: { clave },
    create: { clave, fallos, bloqueadoHasta },
    update: { fallos, bloqueadoHasta },
  });
  // limpieza ocasional de registros viejos
  if (Math.random() < 0.05) {
    prisma.intentoIngreso.deleteMany({ where: { actualizado: { lt: new Date(Date.now() - OLVIDAR_MS) } } }).catch(() => {});
  }
}

const limpiarFallos = (prisma, clave) => prisma.intentoIngreso.deleteMany({ where: { clave } });

// datos del usuario que se pueden mostrar en la página (nunca el hash)
const publico = (u) => u && ({
  id: u.id, usuario: u.usuario, nombre: u.nombre, cedula: u.cedula, rol: u.rol,
  activo: u.activo, debeCambiarClave: u.debeCambiarClave, ultimoIngreso: u.ultimoIngreso,
});

module.exports = {
  hashClave, verificarClave, validarNuevaClave, crearSesion, cerrarSesion,
  cargarUsuario, requiereSesion, requiereAdmin, bloqueado, registrarFallo, limpiarFallos, publico,
};
