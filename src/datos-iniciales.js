// Datos que se cargan la primera vez (npm run db:seed). Se pueden editar desde la página.

const RESPUESTAS = [
  ["¿Cómo consulto el estado de mi solicitud?",
    "Con el número de cédula se verifica el estado en el sistema y se le informa al solicitante.",
    "Si la solicitud no aparece, registrar el caso y escalarlo al área responsable."],
  ["¿Cuál es el horario de atención?",
    "La atención es de lunes a viernes en horario de oficina.",
    "Indicar los canales alternos (correo o ventanilla) si llama fuera del horario."],
  ["Necesito actualizar mis datos personales",
    "Se debe verificar la identidad con la cédula y registrar los datos a modificar.",
    "Registrar la solicitud y remitir al área de registro para la actualización."],
  ["Problemas para ingresar a la plataforma",
    "Se verifica el usuario con la cédula y se orienta para restablecer la contraseña.",
    "Si el problema continúa, escalar a soporte técnico con el número de caso."],
  ["Solicitud de certificado o constancia",
    "Se informa el procedimiento y los requisitos para solicitar el certificado.",
    "Registrar la solicitud y remitir a la dependencia que expide el documento."],
  ["Información sobre inscripción o matrícula",
    "Se informan las fechas, requisitos y pasos del proceso de inscripción o matrícula.",
    "Si hay inconsistencias en el sistema, remitir al área de admisiones y registro."],
  ["Reclamo o queja",
    "Se escucha y registra el reclamo con todos los detalles que aporte el solicitante.",
    "Remitir al área responsable y hacer seguimiento hasta dar respuesta."],
  ["Otra solicitud",
    "Se toma nota de la solicitud y se remite al área correspondiente.",
    "Hacer seguimiento con el número de caso."],
].map(([pregunta, respuesta, resolucion]) => ({ pregunta, respuesta, resolucion }));

const PROGRAMAS = [
  "Administración en Finanzas y Negocios Internacionales",
  "Administración en Salud",
  "Acuicultura",
  "Bacteriología",
  "Biología",
  "Derecho",
  "Enfermería",
  "Estadística",
  "Física",
  "Geografía",
  "Ingeniería Agronómica",
  "Ingeniería Ambiental",
  "Ingeniería de Alimentos",
  "Ingeniería de Sistemas",
  "Ingeniería Industrial",
  "Ingeniería Mecánica",
  "Licenciatura en Ciencias Naturales",
  "Licenciatura en Educación Física",
  "Licenciatura en Literatura y Lengua Castellana",
  "Licenciatura en Matemáticas",
  "Matemáticas",
  "Medicina Veterinaria y Zootecnia",
  "Química",
].map((nombre) => ({ nombre }));

// Usuarios iniciales. Ambos deben cambiar la contraseña la primera vez que ingresan.
const USUARIOS = [
  { usuario: "admin", nombre: "Administrador", cedula: "", rol: "ADMIN", clave: "admin" },
  // trabajador: ingresa con su cédula como usuario y como contraseña inicial
  { usuario: "1067937529", nombre: "Edwin Perez", cedula: "1067937529", rol: "TRABAJADOR", clave: "1067937529" },
];

module.exports = { RESPUESTAS, PROGRAMAS, USUARIOS };
