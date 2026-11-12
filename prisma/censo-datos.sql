-- Agrega al censo los datos del egresado (CENSO FINAL - MESA DE AYUDA).
-- Columnas opcionales: no afectan a la versión ya publicada. Se puede ejecutar varias veces.
ALTER TABLE public.censo ADD COLUMN IF NOT EXISTS nombre      text;
ALTER TABLE public.censo ADD COLUMN IF NOT EXISTS titulo      text;
ALTER TABLE public.censo ADD COLUMN IF NOT EXISTS fecha_grado date;
ALTER TABLE public.censo ADD COLUMN IF NOT EXISTS expedida    text;
ALTER TABLE public.censo ADD COLUMN IF NOT EXISTS acta        text;
