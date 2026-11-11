// Punto de entrada para Vercel: toda petición que no sea un archivo de public/
// llega aquí (ver vercel.json) y la atiende la misma aplicación Express que se usa en local.
const { app } = require("../src/servidor");

module.exports = app;
