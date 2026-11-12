-- 12 programas históricos de la Universidad de Córdoba (ya no se ofertan, pero tienen egresados).
-- Fuente: SNIES (matrícula 2015-2021), Saber Pro / Saber TyT (2014-2022) y páginas de las facultades.
-- Se puede ejecutar varias veces sin duplicar.

INSERT INTO public.programas (nombre)
SELECT v.nombre
FROM (VALUES
  ('Licenciatura en Educación Básica con Énfasis en Ciencias Sociales'),
  ('Licenciatura en Educación Básica con Énfasis en Educación Artística - Música'),
  ('Licenciatura en Educación Básica con Énfasis en Humanidades - Lengua Castellana'),
  ('Licenciatura en Educación Básica con Énfasis en Humanidades - Inglés'),
  ('Licenciatura en Informática y Medios Audiovisuales'),
  ('Técnica Profesional en Sistemas de Monitoreo Agrícola'),
  ('Técnico Profesional en Manejo y Conservación de Productos Agroindustriales'),
  ('Especialización en Actividad Física y Salud'),
  ('Especialización en Administración Total de la Calidad'),
  ('Especialización en Gerencia Empresarial'),
  ('Especialización Tecnológica en Logística de Distribución y Transporte'),
  ('Maestría en Didáctica de la Lengua y la Literatura Española')
) AS v(nombre)
WHERE NOT EXISTS (
  SELECT 1 FROM public.programas p WHERE lower(p.nombre) = lower(v.nombre)
);

SELECT count(*) AS total_programas FROM public.programas;
