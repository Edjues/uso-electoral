// Carga los datos iniciales: usuarios, solicitudes/respuestas y programas.
// Solo inserta lo que falta, así que se puede ejecutar varias veces sin duplicar
// ni cambiar contraseñas que ya se hayan modificado.
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { RESPUESTAS, PROGRAMAS, USUARIOS } = require("../src/datos-iniciales");
const { hashClave } = require("../src/auth");

const prisma = new PrismaClient();

async function main() {
  for (const u of USUARIOS) {
    const existe = await prisma.usuario.findUnique({ where: { usuario: u.usuario } });
    if (existe) { console.log(`Usuario "${u.usuario}" ya existe; no se modificó.`); continue; }
    await prisma.usuario.create({
      data: {
        usuario: u.usuario, nombre: u.nombre, cedula: u.cedula, rol: u.rol,
        claveHash: hashClave(u.clave), debeCambiarClave: true,
      },
    });
    console.log(`Usuario creado: ${u.usuario} (${u.rol})`);
  }

  if ((await prisma.respuesta.count()) === 0) {
    await prisma.respuesta.createMany({ data: RESPUESTAS });
    console.log(`Respuestas cargadas: ${RESPUESTAS.length}`);
  } else {
    console.log("La tabla respuestas ya tiene datos; no se modificó.");
  }
  if ((await prisma.programa.count()) === 0) {
    await prisma.programa.createMany({ data: PROGRAMAS, skipDuplicates: true });
    console.log(`Programas cargados: ${PROGRAMAS.length}`);
  } else {
    console.log("La tabla programas ya tiene datos; no se modificó.");
  }
}

main()
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
