"""
Registro de llamadas — servidor local.

Solo usa la biblioteca estándar de Python (no requiere instalar nada).
  - Base de datos: SQLite (archivo llamadas.db junto a este script)
  - Exportación: archivo Excel .xlsx con hojas Llamadas, Respuestas y Programas

Uso:
    py servidor.py            -> abre http://127.0.0.1:8000
    py servidor.py 8080       -> usa otro puerto
"""

import io
import json
import re
import sqlite3
import sys
import webbrowser
import zipfile
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from xml.sax.saxutils import escape

BASE = Path(__file__).resolve().parent
DB_PATH = BASE / "llamadas.db"
STATIC = BASE / "static"

# campos que el usuario puede enviar por cada tabla (el caso NO: es automático)
RECURSOS = {
    "llamadas": {
        "campos": ["fecha_hora", "nombre", "cedula", "programa", "solicitud",
                   "respuesta", "observacion", "resuelto"],
        "obligatorios": ["fecha_hora", "nombre", "cedula", "solicitud"],
        "orden": "fecha_hora DESC, id DESC",
    },
    "respuestas": {
        "campos": ["pregunta", "respuesta", "resolucion"],
        "obligatorios": ["pregunta", "respuesta"],
        "orden": "pregunta COLLATE NOCASE",
    },
    "programas": {
        "campos": ["nombre"],
        "obligatorios": ["nombre"],
        "orden": "nombre COLLATE NOCASE",
    },
}

# Solicitudes predeterminadas (posible pregunta / posible respuesta / resolución).
# Se pueden editar o eliminar desde la vista "Respuestas".
RESPUESTAS_INICIALES = [
    ("¿Cómo consulto el estado de mi solicitud?",
     "Con el número de cédula se verifica el estado en el sistema y se le informa al solicitante.",
     "Si la solicitud no aparece, registrar el caso y escalarlo al área responsable."),
    ("¿Cuál es el horario de atención?",
     "La atención es de lunes a viernes en horario de oficina.",
     "Indicar los canales alternos (correo o ventanilla) si llama fuera del horario."),
    ("Necesito actualizar mis datos personales",
     "Se debe verificar la identidad con la cédula y registrar los datos a modificar.",
     "Registrar la solicitud y remitir al área de registro para la actualización."),
]
RESPUESTAS_V2 = [
    ("Problemas para ingresar a la plataforma",
     "Se verifica el usuario con la cédula y se orienta para restablecer la contraseña.",
     "Si el problema continúa, escalar a soporte técnico con el número de caso."),
    ("Solicitud de certificado o constancia",
     "Se informa el procedimiento y los requisitos para solicitar el certificado.",
     "Registrar la solicitud y remitir a la dependencia que expide el documento."),
    ("Información sobre inscripción o matrícula",
     "Se informan las fechas, requisitos y pasos del proceso de inscripción o matrícula.",
     "Si hay inconsistencias en el sistema, remitir al área de admisiones y registro."),
    ("Reclamo o queja",
     "Se escucha y registra el reclamo con todos los detalles que aporte el solicitante.",
     "Remitir al área responsable y hacer seguimiento hasta dar respuesta."),
    ("Otra solicitud",
     "Se toma nota de la solicitud y se remite al área correspondiente.",
     "Hacer seguimiento con el número de caso."),
]

PROGRAMAS_INICIALES = [
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
]


def ahora():
    return datetime.now().isoformat(timespec="seconds")


def numero_caso(ident, fecha):
    return f"{(fecha or ahora())[:4]}-{ident:04d}"


# ---------------------------------------------------------------- base de datos
def conectar():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def columnas(con, tabla):
    return {r[1] for r in con.execute(f"PRAGMA table_info({tabla})")}


def iniciar_bd():
    with conectar() as con:
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS llamadas (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                fecha_hora   TEXT NOT NULL,
                nombre       TEXT NOT NULL,
                cedula       TEXT NOT NULL,
                programa     TEXT DEFAULT '',
                caso         TEXT DEFAULT '',
                solicitud    TEXT NOT NULL,
                respuesta    TEXT DEFAULT '',
                observacion  TEXT DEFAULT '',
                resuelto     INTEGER NOT NULL DEFAULT 0,
                creado       TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS respuestas (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                pregunta    TEXT NOT NULL,
                respuesta   TEXT NOT NULL,
                resolucion  TEXT DEFAULT '',
                creado      TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS programas (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre  TEXT NOT NULL UNIQUE COLLATE NOCASE,
                creado  TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS config (clave TEXT PRIMARY KEY, valor TEXT);
            CREATE INDEX IF NOT EXISTS idx_llamadas_cedula ON llamadas(cedula);
            """
        )
        # migración desde la primera versión
        if "resuelto" not in columnas(con, "llamadas"):
            con.execute("ALTER TABLE llamadas ADD COLUMN resuelto INTEGER NOT NULL DEFAULT 0")
        for fila in con.execute("SELECT id, fecha_hora FROM llamadas WHERE caso = '' OR caso IS NULL").fetchall():
            con.execute("UPDATE llamadas SET caso = ? WHERE id = ?", (numero_caso(fila[0], fila[1]), fila[0]))

        # datos iniciales (solo una vez por versión, para no revivir lo que el usuario borre)
        version = int((con.execute("SELECT valor FROM config WHERE clave='semillas'").fetchone() or ["0"])[0])
        lotes = []
        if version < 1 and con.execute("SELECT COUNT(*) FROM respuestas").fetchone()[0] == 0:
            lotes.append(RESPUESTAS_INICIALES)
        if version < 2:
            lotes.append(RESPUESTAS_V2)
            con.executemany("INSERT OR IGNORE INTO programas (nombre, creado) VALUES (?, ?)",
                            [(p, ahora()) for p in PROGRAMAS_INICIALES])
        existentes = {r[0].lower() for r in con.execute("SELECT pregunta FROM respuestas")}
        for lote in lotes:
            con.executemany(
                "INSERT INTO respuestas (pregunta, respuesta, resolucion, creado) VALUES (?,?,?,?)",
                [(p, r, s, ahora()) for p, r, s in lote if p.lower() not in existentes],
            )
        con.execute("INSERT OR REPLACE INTO config (clave, valor) VALUES ('semillas', '2')")


def limpiar(tabla, datos, parcial=False):
    """Devuelve (valores, error). Con parcial=True solo valida los campos enviados."""
    if not isinstance(datos, dict):
        return None, "Datos inválidos."
    cfg = RECURSOS[tabla]
    campos = [c for c in cfg["campos"] if not parcial or c in datos]
    if not campos:
        return None, "No hay campos para guardar."
    valores = {}
    for c in campos:
        if c == "resuelto":
            valores[c] = 1 if datos.get(c) in (True, 1, "1", "true", "si", "sí") else 0
        else:
            valores[c] = str(datos.get(c) or "").strip()[:5000]
    faltan = [c for c in cfg["obligatorios"] if c in valores and not valores[c]]
    if faltan:
        return None, "Faltan campos obligatorios: " + ", ".join(faltan)
    return valores, None


def siguiente_caso(con):
    fila = con.execute("SELECT seq FROM sqlite_sequence WHERE name = 'llamadas'").fetchone()
    return numero_caso((fila[0] if fila else 0) + 1, None)


# ---------------------------------------------------------------- exportar xlsx
_INVALIDOS_XML = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def _col(n):
    letras = ""
    while n:
        n, r = divmod(n - 1, 26)
        letras = chr(65 + r) + letras
    return letras


def _hoja(encabezados, filas, anchos):
    out = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews>',
        "<cols>",
    ]
    for i, w in enumerate(anchos, 1):
        out.append(f'<col min="{i}" max="{i}" width="{w}" customWidth="1"/>')
    out.append("</cols><sheetData>")
    for r, fila in enumerate([encabezados] + filas, 1):
        estilo = ' s="1"' if r == 1 else ' s="2"'
        out.append(f'<row r="{r}">')
        for c, valor in enumerate(fila, 1):
            texto = escape(_INVALIDOS_XML.sub("", "" if valor is None else str(valor)))
            out.append(
                f'<c r="{_col(c)}{r}" t="inlineStr"{estilo}><is><t xml:space="preserve">{texto}</t></is></c>'
            )
        out.append("</row>")
    out.append(f'</sheetData><autoFilter ref="A1:{_col(len(encabezados))}{len(filas) + 1}"/></worksheet>')
    return "".join(out)


def generar_xlsx():
    with conectar() as con:
        llamadas = con.execute(
            "SELECT caso, fecha_hora, nombre, cedula, programa, solicitud, respuesta, observacion, resuelto "
            "FROM llamadas ORDER BY fecha_hora DESC, id DESC").fetchall()
        respuestas = con.execute(
            "SELECT pregunta, respuesta, resolucion FROM respuestas ORDER BY pregunta").fetchall()
        programas = con.execute("SELECT nombre FROM programas ORDER BY nombre").fetchall()

    hojas = [
        ("Llamadas",
         ["Caso", "Fecha y hora", "Nombre completo", "Cédula", "Programa",
          "Solicitud", "Respuesta", "Observación", "Estado"],
         [[r[0], (r[1] or "").replace("T", " ")] + list(r[2:8]) + ["Resuelto" if r[8] else "Pendiente"]
          for r in llamadas],
         [12, 18, 30, 14, 30, 38, 45, 35, 12]),
        ("Respuestas", ["Posible pregunta", "Posible respuesta", "Resolución relacionada"],
         [list(r) for r in respuestas], [45, 55, 50]),
        ("Programas", ["Programa"], [list(r) for r in programas], [50]),
    ]

    estilos = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
        '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>'
        '<fills count="3"><fill><patternFill patternType="none"/></fill>'
        '<fill><patternFill patternType="gray125"/></fill>'
        '<fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/></patternFill></fill></fills>'
        '<borders count="1"><border/></borders>'
        '<cellStyleXfs count="1"><xf/></cellStyleXfs>'
        '<cellXfs count="3"><xf/>'
        '<xf fontId="1" fillId="2" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>'
        '<xf applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>'
        "</styleSheet>"
    )
    tipos = "".join(
        f'<Override PartName="/xl/worksheets/sheet{i}.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        for i in range(1, len(hojas) + 1))
    hojas_wb = "".join(f'<sheet name="{n}" sheetId="{i}" r:id="rId{i}"/>' for i, (n, *_ ) in enumerate(hojas, 1))
    filtros = "".join(
        f'<definedName name="_xlnm._FilterDatabase" localSheetId="{i}" hidden="1">'
        f'{n}!$A$1:${_col(len(enc))}${len(filas) + 1}</definedName>'
        for i, (n, enc, filas, _) in enumerate(hojas))
    rels = "".join(
        f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
        f'Target="worksheets/sheet{i}.xml"/>' for i in range(1, len(hojas) + 1))
    n_est = len(hojas) + 1

    archivos = {
        "[Content_Types].xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            f'{tipos}'
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            "</Types>"),
        "_rels/.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>"),
        "xl/workbook.xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f"<sheets>{hojas_wb}</sheets><definedNames>{filtros}</definedNames></workbook>"),
        "xl/_rels/workbook.xml.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f'{rels}<Relationship Id="rId{n_est}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            "</Relationships>"),
        "xl/styles.xml": estilos,
    }
    for i, (_, enc, filas, anchos) in enumerate(hojas, 1):
        archivos[f"xl/worksheets/sheet{i}.xml"] = _hoja(enc, filas, anchos)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for nombre, contenido in archivos.items():
            z.writestr(nombre, contenido)
    return buf.getvalue()


# ---------------------------------------------------------------- servidor HTTP
class Manejador(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC), **kwargs)

    def log_message(self, formato, *args):
        pass  # silencioso

    def end_headers(self):
        # evita que el navegador muestre una versión vieja de la página
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    # -- utilidades
    def _json(self, datos, estado=200):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
        self.send_response(estado)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def _leer_json(self):
        largo = int(self.headers.get("Content-Length") or 0)
        if largo <= 0 or largo > 1_000_000:
            return None
        try:
            return json.loads(self.rfile.read(largo).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return None

    def _ruta(self):
        return [p for p in urlparse(self.path).path.split("/") if p]

    def _recurso(self):
        """Devuelve (tabla, id) para /api/<recurso>[/<id>] o None."""
        p = self._ruta()
        if len(p) not in (2, 3) or p[0] != "api" or p[1] not in RECURSOS:
            return None
        if len(p) == 3:
            return (p[1], int(p[2])) if p[2].isdigit() else None
        return p[1], None

    @staticmethod
    def _fila(fila):
        d = dict(fila)
        d.pop("creado", None)
        if "resuelto" in d:
            d["resuelto"] = bool(d["resuelto"])
        return d

    # -- GET
    def do_GET(self):
        p = self._ruta()
        if p == ["api", "siguiente-caso"]:
            with conectar() as con:
                return self._json({"caso": siguiente_caso(con)})
        r = self._recurso()
        if r and r[1] is None:
            tabla = r[0]
            with conectar() as con:
                filas = con.execute(f"SELECT * FROM {tabla} ORDER BY {RECURSOS[tabla]['orden']}").fetchall()
            return self._json([self._fila(f) for f in filas])
        if p == ["exportar"]:
            datos = generar_xlsx()
            nombre = f"registro_llamadas_{datetime.now():%Y-%m-%d}.xlsx"
            self.send_response(200)
            self.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            self.send_header("Content-Disposition", f'attachment; filename="{nombre}"')
            self.send_header("Content-Length", str(len(datos)))
            self.end_headers()
            self.wfile.write(datos)
            return
        if p and p[0] == "api":
            return self._json({"error": "No encontrado"}, 404)
        return super().do_GET()

    # -- POST (crear)
    def do_POST(self):
        r = self._recurso()
        if not r or r[1] is not None:
            return self._json({"error": "No encontrado"}, 404)
        tabla = r[0]
        valores, error = limpiar(tabla, self._leer_json())
        if error:
            return self._json({"error": error}, 400)
        valores["creado"] = ahora()
        cols = list(valores)
        with conectar() as con:
            try:
                cur = con.execute(
                    f"INSERT INTO {tabla} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
                    [valores[c] for c in cols])
            except sqlite3.IntegrityError:
                return self._json({"error": "Ese registro ya existe."}, 409)
            if tabla == "llamadas":
                con.execute("UPDATE llamadas SET caso = ? WHERE id = ?",
                            (numero_caso(cur.lastrowid, valores["fecha_hora"]), cur.lastrowid))
            fila = con.execute(f"SELECT * FROM {tabla} WHERE id = ?", (cur.lastrowid,)).fetchone()
        return self._json(self._fila(fila), 201)

    # -- PUT (editar todo) y PATCH (editar algunos campos, p. ej. resuelto)
    def _actualizar(self, parcial):
        r = self._recurso()
        if not r or r[1] is None:
            return self._json({"error": "No encontrado"}, 404)
        tabla, ident = r
        valores, error = limpiar(tabla, self._leer_json(), parcial=parcial)
        if error:
            return self._json({"error": error}, 400)
        with conectar() as con:
            try:
                cur = con.execute(
                    f"UPDATE {tabla} SET {', '.join(c + ' = ?' for c in valores)} WHERE id = ?",
                    list(valores.values()) + [ident])
            except sqlite3.IntegrityError:
                return self._json({"error": "Ese registro ya existe."}, 409)
            if cur.rowcount == 0:
                return self._json({"error": "No encontrado"}, 404)
            fila = con.execute(f"SELECT * FROM {tabla} WHERE id = ?", (ident,)).fetchone()
        return self._json(self._fila(fila))

    def do_PUT(self):
        return self._actualizar(parcial=False)

    def do_PATCH(self):
        return self._actualizar(parcial=True)

    # -- DELETE
    def do_DELETE(self):
        r = self._recurso()
        if not r or r[1] is None:
            return self._json({"error": "No encontrado"}, 404)
        tabla, ident = r
        with conectar() as con:
            cur = con.execute(f"DELETE FROM {tabla} WHERE id = ?", (ident,))
        if cur.rowcount == 0:
            return self._json({"error": "No encontrado"}, 404)
        return self._json({"ok": True})


class Servidor(ThreadingHTTPServer):
    # En Windows, reutilizar la dirección deja que dos servidores compartan el puerto
    # sin error; así se detecta si ya hay otra ventana del servidor abierta.
    allow_reuse_address = sys.platform != "win32"
    daemon_threads = True


def main():
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    iniciar_bd()
    try:
        servidor = Servidor(("127.0.0.1", puerto), Manejador)
    except OSError:
        print(f"El puerto {puerto} ya está en uso: hay otra ventana del servidor abierta.")
        print("Ciérrela (o presione Ctrl+C en ella) y vuelva a ejecutar iniciar.bat.")
        return
    url = f"http://127.0.0.1:{puerto}"
    print(f"Registro de llamadas en {url}")
    print(f"Base de datos: {DB_PATH}")
    print("Deje esta ventana abierta mientras usa la página. Ctrl+C para detener.")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")


if __name__ == "__main__":
    main()
