-- Bloquea el acceso a estas tablas desde la API pública de Supabase (REST/GraphQL con la "anon key").
-- La aplicación no se ve afectada: Prisma se conecta como "postgres", dueño de las tablas.
-- Ejecutar después de cada "npm run db:push" que cree tablas nuevas:  npm run db:rls
ALTER TABLE public.usuarios         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sesiones         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intentos_ingreso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llamadas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.respuestas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programas        ENABLE ROW LEVEL SECURITY;
