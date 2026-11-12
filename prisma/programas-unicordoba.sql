-- Programas de pregrado y posgrado de la Universidad de Córdoba
-- Fuente: unicordoba.edu.co/admisiones-y-registro/oferta-academica-pregrado/ y unicordoba.edu.co/posgrados/
-- (consultadas el 12 de noviembre de 2026), páginas de las facultades, y programas históricos
-- con estudiantes según el SNIES (matrícula 2015-2021) y Saber Pro / Saber TyT (2014-2022) en datos.gov.co.
--
-- Solo agrega los que faltan: se puede ejecutar varias veces sin duplicar.
-- Se incluyen también los programas marcados "no se ofertará" en el próximo período,
-- porque pueden tener egresados.

BEGIN;

-- 1) Dos programas que ya existen con un nombre incompleto pasan a su nombre oficial.
--    También se corrige el texto en las llamadas ya registradas con el nombre anterior.
UPDATE public.programas SET nombre = 'Licenciatura en Ciencias Naturales y Educación Ambiental'
 WHERE nombre = 'Licenciatura en Ciencias Naturales'
   AND NOT EXISTS (SELECT 1 FROM public.programas WHERE nombre = 'Licenciatura en Ciencias Naturales y Educación Ambiental');
UPDATE public.llamadas SET programa = 'Licenciatura en Ciencias Naturales y Educación Ambiental'
 WHERE programa = 'Licenciatura en Ciencias Naturales';

UPDATE public.programas SET nombre = 'Licenciatura en Educación Física, Recreación y Deporte'
 WHERE nombre = 'Licenciatura en Educación Física'
   AND NOT EXISTS (SELECT 1 FROM public.programas WHERE nombre = 'Licenciatura en Educación Física, Recreación y Deporte');
UPDATE public.llamadas SET programa = 'Licenciatura en Educación Física, Recreación y Deporte'
 WHERE programa = 'Licenciatura en Educación Física';

-- 2) Programas nuevos.
INSERT INTO public.programas (nombre)
SELECT v.nombre
FROM (VALUES
  -- Pregrado
  ('Licenciatura en Ciencias Sociales'),
  ('Licenciatura en Educación Artística'),
  ('Licenciatura en Educación Infantil'),
  ('Licenciatura en Informática con Certificación en Medios Audiovisuales'),
  ('Licenciatura en Lengua Extranjera con Énfasis en Inglés'),
  ('Medicina'),
  ('Tecnología en Regencia de Farmacia'),
  ('Tecnología en Desarrollo de Software'),
  ('Tecnología en Gestión de Seguridad y Salud en el Trabajo'),
  ('Tecnología en Música del Caribe'),

  -- Pregrado que ya no se oferta pero tiene egresados (SNIES y Saber Pro/TyT, 2014-2022)
  ('Licenciatura en Educación Básica con Énfasis en Ciencias Sociales'),
  ('Licenciatura en Educación Básica con Énfasis en Educación Artística - Música'),
  ('Licenciatura en Educación Básica con Énfasis en Humanidades - Lengua Castellana'),
  ('Licenciatura en Educación Básica con Énfasis en Humanidades - Inglés'),
  ('Licenciatura en Informática y Medios Audiovisuales'),
  ('Técnica Profesional en Sistemas de Monitoreo Agrícola'),
  ('Técnico Profesional en Manejo y Conservación de Productos Agroindustriales'),

  -- Especializaciones
  ('Especialización en Auditoría de la Calidad en Salud'),
  ('Especialización en Gerencia Administrativa en Salud'),
  ('Especialización en Higiene y Seguridad Industrial'),
  ('Especialización en Derechos Humanos y Justicia Social'),
  ('Especialización en Medicina y Cirugía en Animales de Compañía'),
  ('Especialización en Producción Bovina Tropical'),
  ('Especialización en Actividad Física y Salud'),
  ('Especialización en Administración Total de la Calidad'),
  ('Especialización en Gerencia Empresarial'),
  ('Especialización Tecnológica en Logística de Distribución y Transporte'),

  -- Maestrías
  ('Maestría en Acuicultura Tropical'),
  ('Maestría en Biotecnología'),
  ('Maestría en Ciencias Agroalimentarias'),
  ('Maestría en Ciencias Agronómicas'),
  ('Maestría en Ciencias Ambientales (SUE Caribe)'),
  ('Maestría en Ciencia de Datos Aplicada'),
  ('Maestría en Ciencias Físicas (SUE Caribe)'),
  ('Maestría en Ciencias Químicas'),
  ('Maestría en Ciencias Sociales'),
  ('Maestría en Ciencias Veterinarias del Trópico'),
  ('Maestría en Didáctica de las Ciencias Naturales'),
  ('Maestría en Didáctica de la Lengua y la Literatura Española'),
  ('Maestría en Educación (SUE Caribe)'),
  ('Maestría en Enseñanza del Inglés'),
  ('Maestría en Geografía'),
  ('Maestría en Ingeniería Ambiental'),
  ('Maestría en Ingeniería Industrial'),
  ('Maestría en Ingeniería Mecánica'),
  ('Maestría en Innovación Educativa con Tecnología e Inteligencia Artificial'),
  ('Maestría en Matemáticas'),
  ('Maestría en Microbiología Tropical'),
  ('Maestría en Salud Pública'),

  -- Doctorados
  ('Doctorado en Ciencias Animales del Trópico'),
  ('Doctorado en Ciencia y Tecnología de Alimentos'),
  ('Doctorado en Ciencias Agrarias'),
  ('Doctorado en Ciencias Físicas'),
  ('Doctorado en Ingeniería'),
  ('Doctorado en Medicina Tropical (SUE Caribe)'),
  ('Doctorado en Didáctica de las Ciencias'),
  ('Doctorado en Microbiología y Salud Tropical')
) AS v(nombre)
WHERE NOT EXISTS (
  SELECT 1 FROM public.programas p WHERE lower(p.nombre) = lower(v.nombre)
);

COMMIT;

-- Verificación
SELECT count(*) AS total_programas FROM public.programas;
