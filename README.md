# Registro de llamadas

Aplicación para registrar llamadas de atención, con buscador de respuestas básicas,
usuarios (administrador y trabajadores) y exportación a Excel.

- **Servidor:** Node.js + Express
- **Base de datos:** Supabase (PostgreSQL) mediante Prisma
- **Publicación:** Vercel (o en el propio PC con `iniciar.bat`)

## Estructura

| Carpeta / archivo | Qué contiene |
|---|---|
| `src/servidor.js` | Servidor y API |
| `src/auth.js` | Inicio de sesión, contraseñas y sesiones |
| `api/index.js` | Entrada para Vercel (usa el mismo servidor) |
| `vistas/` | Páginas que exigen sesión (`index.html`, `login.html`) |
| `public/` | Estilos y scripts de la página |
| `prisma/schema.prisma` | Tablas de la base de datos |
| `prisma/seed.js` | Datos iniciales (usuarios, solicitudes, programas) |
| `prisma/rls.sql` | Bloquea el acceso a las tablas desde la API pública de Supabase |

## Usar en el PC

1. Tener el archivo `.env` con `DATABASE_URL` y `DIRECT_URL` (ver `.env.example`).
2. Doble clic en `iniciar.bat` → abre http://127.0.0.1:8000

## Publicar en Vercel

### 1. Subir el proyecto a GitHub (repositorio **privado**)

Con GitHub Desktop: *File → Add local repository* → elegir esta carpeta → *Publish repository*
→ marcar **Keep this code private**.

O desde la terminal (en esta carpeta), después de crear un repositorio vacío y privado en github.com:

```
git init
git add .
git commit -m "Registro de llamadas"
git branch -M main
git remote add origin https://github.com/SU-USUARIO/registro-llamadas.git
git push -u origin main
```

El archivo `.env` (con la contraseña) **no se sube**: está excluido en `.gitignore`.

### 2. Crear el proyecto en Vercel

1. En vercel.com → **Add New… → Project** → importar el repositorio.
2. *Framework Preset*: **Other**. No cambie los comandos de compilación (los toma de `vercel.json`).
3. En **Environment Variables** agregue las dos variables, copiando los valores de su `.env`:
   - `DATABASE_URL` (la del puerto **6543**, con `?pgbouncer=true&connection_limit=1`)
   - `DIRECT_URL` (la del puerto **5432**)
4. **Deploy**. Al terminar, Vercel da la dirección (por ejemplo `registro-llamadas.vercel.app`).

Cada vez que suba cambios a GitHub, Vercel publica la nueva versión automáticamente.

## Cambios en la base de datos

Si se modifica `prisma/schema.prisma`:

```
npm run db:push    # aplica los cambios en Supabase
npm run db:rls     # vuelve a proteger las tablas (si se agregó alguna nueva, añádala a prisma/rls.sql)
```

## Comandos

| Comando | Para qué |
|---|---|
| `npm start` | Inicia el servidor en el PC |
| `npm run db:push` | Crea o actualiza las tablas en Supabase |
| `npm run db:seed` | Carga los datos iniciales (no duplica) |
| `npm run db:rls` | Bloquea las tablas a la API pública de Supabase |
| `npm run db:studio` | Abre un visor de la base de datos |
| `npm run importar-sqlite` | Copia los datos del antiguo `llamadas.db` |
