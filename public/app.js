/* Registro de llamadas — lógica de la interfaz */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const estado = {
    llamadas: [],
    respuestas: [],
    programas: [],
    editando: null,      // id de la llamada en edición
    resuelto: false,     // valor del interruptor del formulario
    filtro: "todos",
  };

  // ============================================================ utilidades
  async function api(url, opciones = {}) {
    let res;
    try {
      res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...opciones,
        body: opciones.body ? JSON.stringify(opciones.body) : undefined,
      });
    } catch (_) {
      throw new Error("No hay conexión con el servidor. Ejecute iniciar.bat.");
    }
    const datos = await res.json().catch(() => ({}));
    // sesión vencida o contraseña pendiente de cambio -> volver a la página de ingreso
    if (res.status === 401 || (res.status === 403 && datos.cambiarClave)) {
      location.replace("/login");
      throw new Error(datos.error || "Debe iniciar sesión.");
    }
    if (!res.ok) throw Object.assign(new Error(datos.error || `Error del servidor (${res.status})`), { datos });
    return datos;
  }

  let temporizadorAviso;
  function aviso(texto, tipo = "") {
    const n = $("#aviso");
    n.textContent = texto;
    n.className = "aviso visible" + (tipo ? " aviso--" + tipo : "");
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => n.classList.remove("visible"), 2600);
  }

  function alerta(texto) {
    const n = $("#alerta-servidor");
    n.textContent = texto;
    n.hidden = !texto;
  }

  // minúsculas y sin tildes, para buscar sin importar acentos
  const normalizar = (t) =>
    (t || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const PALABRAS_VACIAS = new Set(
    "a al como con de del el en es la las lo los mi me no o para por que se su un una y quiero necesito".split(" ")
  );
  const palabras = (t) =>
    normalizar(t).split(/[^a-z0-9ñ]+/).filter((p) => p.length > 1 && !PALABRAS_VACIAS.has(p));
  const terminosLibres = (t) => normalizar(t).split(/\s+/).filter(Boolean);

  // devuelve el texto con las coincidencias en <mark> (sin innerHTML)
  function resaltar(texto, terminos) {
    const frag = document.createDocumentFragment();
    texto = texto == null ? "" : String(texto);
    const norm = normalizar(texto);
    if (!terminos.length || norm.length !== texto.length) { frag.append(texto); return frag; }
    const rangos = [];
    for (const t of terminos) {
      let i = norm.indexOf(t);
      while (i !== -1 && t) { rangos.push([i, i + t.length]); i = norm.indexOf(t, i + t.length); }
    }
    rangos.sort((a, b) => a[0] - b[0]);
    let pos = 0;
    for (const [ini, fin] of rangos) {
      if (ini < pos) continue;
      frag.append(texto.slice(pos, ini));
      const m = document.createElement("mark");
      m.textContent = texto.slice(ini, fin);
      frag.append(m);
      pos = fin;
    }
    frag.append(texto.slice(pos));
    return frag;
  }

  function el(etiqueta, clase, hijos) {
    const n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (hijos != null) (Array.isArray(hijos) ? hijos : [hijos]).forEach((h) => h != null && n.append(h));
    return n;
  }

  function svg(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  const ICONOS = {
    editar: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    borrar: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>',
    lupa: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    flecha: '<svg class="selector__flecha" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    reloj: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  };

  function iconoBoton(tipo, titulo, alClic) {
    const b = el("button", "icono-boton" + (tipo === "borrar" ? " icono-boton--peligro" : ""));
    b.type = "button";
    b.title = titulo;
    b.setAttribute("aria-label", titulo);
    b.append(svg(ICONOS[tipo]));
    b.addEventListener("click", alClic);
    return b;
  }

  function ahoraLocal() {
    const d = new Date();
    const dos = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
  }

  function formatoFecha(valor) {
    if (!valor) return "";
    const d = new Date(valor);
    if (isNaN(d)) return valor;
    return d.toLocaleString("es-CO", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  // ============================================================ lista desplegable con búsqueda
  function crearSelector(contenedor, { opciones, alCambiar, alAgregar }) {
    const nombre = contenedor.dataset.nombre;
    const placeholder = contenedor.dataset.placeholder || "Seleccione";
    let valor = "";
    let marcada = -1;
    let visibles = [];

    const valorEl = el("span", "selector__valor selector__valor--vacio", placeholder);
    const campo = el("button", "selector__campo", [valorEl, svg(ICONOS.flecha)]);
    campo.type = "button";
    campo.setAttribute("aria-haspopup", "listbox");
    campo.setAttribute("aria-expanded", "false");

    const oculto = el("input");
    oculto.type = "hidden";
    oculto.name = nombre;

    const buscar = el("input");
    buscar.type = "search";
    buscar.placeholder = "Buscar…";
    buscar.setAttribute("aria-label", "Buscar en la lista");
    const lista = el("ul", "selector__opciones");
    lista.setAttribute("role", "listbox");
    const agregar = el("button", "enlace-sutil", "+ Agregar nuevo");
    agregar.type = "button";
    const panel = el("div", "selector__panel", [
      el("div", "selector__buscar", [svg(ICONOS.lupa), buscar]),
      lista,
      el("div", "selector__pie", agregar),
    ]);
    panel.hidden = true;
    contenedor.append(campo, oculto, panel);

    function pintar() {
      const q = terminosLibres(buscar.value);
      visibles = opciones().filter((o) => q.every((t) => normalizar(o).includes(t)));
      if (marcada >= visibles.length) marcada = visibles.length - 1;
      lista.replaceChildren(
        ...visibles.map((o, i) => {
          const li = el("li", "selector__opcion", el("span", null, resaltar(o, q)));
          li.setAttribute("role", "option");
          if (o === valor) li.classList.add("elegida");
          if (i === marcada) li.classList.add("marcada");
          li.addEventListener("mousedown", (e) => e.preventDefault());
          li.addEventListener("click", () => elegir(o));
          li.addEventListener("mousemove", () => {
            if (marcada !== i) { marcada = i; pintarMarca(); }
          });
          return li;
        })
      );
      if (!visibles.length) lista.append(el("li", "selector__nada", "Sin resultados"));
      const texto = buscar.value.trim();
      agregar.textContent = texto ? `+ Agregar «${texto}»` : "+ Agregar nuevo";
    }

    function pintarMarca() {
      $$(".selector__opcion", lista).forEach((li, i) => li.classList.toggle("marcada", i === marcada));
      const li = lista.children[marcada];
      if (li) li.scrollIntoView({ block: "nearest" });
    }

    function abrir() {
      if (!panel.hidden) return;
      cerrarTodos(contenedor);
      panel.hidden = false;
      contenedor.classList.add("abierto");
      campo.setAttribute("aria-expanded", "true");
      buscar.value = "";
      marcada = Math.max(0, opciones().indexOf(valor));
      pintar();
      pintarMarca();
      buscar.focus();
    }

    function cerrar(devolverFoco = false) {
      if (panel.hidden) return;
      panel.hidden = true;
      contenedor.classList.remove("abierto");
      campo.setAttribute("aria-expanded", "false");
      if (devolverFoco) campo.focus();
    }

    function fijar(v) {
      valor = v || "";
      oculto.value = valor;
      valorEl.textContent = valor || placeholder;
      valorEl.classList.toggle("selector__valor--vacio", !valor);
      campo.title = valor;
    }

    function elegir(v) {
      fijar(v);
      cerrar(true);
      contenedor.closest(".campo")?.classList.remove("invalido");
      alCambiar?.(v);
    }

    campo.addEventListener("click", () => (panel.hidden ? abrir() : cerrar()));
    campo.addEventListener("keydown", (e) => {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); abrir(); }
    });
    buscar.addEventListener("input", () => { marcada = 0; pintar(); });
    buscar.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); marcada = Math.min(marcada + 1, visibles.length - 1); pintarMarca(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); marcada = Math.max(marcada - 1, 0); pintarMarca(); }
      else if (e.key === "Enter") {
        e.preventDefault();
        if (visibles[marcada] != null) elegir(visibles[marcada]);
        else if (buscar.value.trim()) agregar.click();
      } else if (e.key === "Escape") { e.preventDefault(); cerrar(true); }
      else if (e.key === "Tab") cerrar();
    });
    agregar.addEventListener("click", async () => {
      const texto = buscar.value.trim();
      cerrar();
      const nuevo = await alAgregar(texto);
      if (nuevo) elegir(nuevo);
      else campo.focus();
    });

    const control = { contenedor, cerrar, refrescar: () => !panel.hidden && pintar() };
    Object.defineProperty(control, "valor", { get: () => valor, set: fijar });
    selectores.push(control);
    return control;
  }

  const selectores = [];
  function cerrarTodos(excepto) {
    selectores.forEach((s) => s.contenedor !== excepto && s.cerrar());
  }
  document.addEventListener("mousedown", (e) => {
    if (!e.target.closest(".selector")) cerrarTodos(null);
  });

  // ============================================================ pestañas
  function mostrarVista(nombre, recargar = true) {
    $$(".pestana").forEach((b) => {
      const activa = b.dataset.vista === nombre;
      b.classList.toggle("activa", activa);
      b.setAttribute("aria-selected", String(activa));
    });
    $$(".vista").forEach((v) => (v.hidden = v.id !== "vista-" + nombre));
    cerrarTodos(null);
    if (nombre === "respuestas") $("#buscar-respuestas").focus();
    if (nombre === "censo") { $("#censo-documento").focus(); cargarTotalCenso(); }
    if (nombre === "usuarios" && recargar) cargarUsuarios();
    try { localStorage.setItem("vista", nombre); } catch (_) { /* sin almacenamiento */ }
  }
  $$(".pestana").forEach((b) => b.addEventListener("click", () => mostrarVista(b.dataset.vista)));

  // ============================================================ formulario de llamada
  const form = $("#form-llamada");
  const campoFecha = $("#f-fecha");
  const campoRespuesta = $("#f-respuesta");

  const selPrograma = crearSelector($("#sel-programa"), {
    opciones: () => estado.programas.map((p) => p.nombre),
    alAgregar: async (texto) => {
      const nombre = (texto || prompt("Nombre del nuevo programa:") || "").trim();
      if (!nombre) return null;
      const existente = estado.programas.find((p) => normalizar(p.nombre) === normalizar(nombre));
      if (existente) return existente.nombre;
      try {
        const p = await api("/api/programas", { method: "POST", body: { nombre } });
        await cargarProgramas();
        aviso("Programa agregado", "exito");
        return p.nombre;
      } catch (err) { aviso(err.message, "error"); return null; }
    },
  });

  const selSolicitud = crearSelector($("#sel-solicitud"), {
    opciones: () => estado.respuestas.map((r) => r.pregunta),
    alCambiar: (pregunta) => aplicarRespuestaAutomatica(pregunta),
    alAgregar: async (texto) => {
      const r = await abrirModal(null, texto);
      return r ? r.pregunta : null;
    },
  });

  function aplicarRespuestaAutomatica(pregunta) {
    const r = estado.respuestas.find((x) => x.pregunta === pregunta);
    if (!r) { $("#resolucion-sugerida").hidden = true; return; }
    campoRespuesta.value = r.respuesta;
    mostrarResolucion(r);
  }

  function mostrarResolucion(r) {
    const caja = $("#resolucion-sugerida");
    caja.hidden = !(r && r.resolucion);
    $("#resolucion-texto").textContent = r ? r.resolucion : "";
  }

  // interruptor ¿se resolvió?
  function fijarResuelto(v) {
    estado.resuelto = !!v;
    $$("#estado-resuelto .interruptor__op").forEach((b) => {
      const activo = (b.dataset.valor === "1") === estado.resuelto;
      b.classList.toggle("activo", activo);
      b.setAttribute("aria-checked", String(activo));
    });
  }
  $$("#estado-resuelto .interruptor__op").forEach((b) =>
    b.addEventListener("click", () => fijarResuelto(b.dataset.valor === "1"))
  );

  $("#btn-ahora").addEventListener("click", () => {
    campoFecha.value = ahoraLocal();
    campoFecha.closest(".campo").classList.remove("invalido");
  });

  // El número de caso lo asigna la base de datos en el momento de guardar, así nunca se repite
  // aunque varias personas guarden a la vez. Antes de guardar no se muestra un número "adivinado".
  function mostrarSiguienteCaso() {
    const n = $("#caso-numero");
    n.textContent = "Se asigna al guardar";
    n.title = "El número se asigna automáticamente al guardar y nunca se repite";
    n.classList.add("caso--pendiente");
  }

  function mostrarUltimoCaso(caso) {
    const u = $("#ultimo-caso");
    u.hidden = !caso;
    u.textContent = caso ? `Último guardado: caso ${caso}` : "";
  }

  const OBLIGATORIOS = { fecha_hora: campoFecha, cedula: $("#f-cedula"), nombre: $("#f-nombre"), solicitud: $("#sel-solicitud") };

  function datosFormulario() {
    const d = {};
    new FormData(form).forEach((v, k) => (d[k] = v.toString().trim()));
    d.resuelto = estado.resuelto;
    return d;
  }

  function validar(d) {
    let primero = null;
    for (const [k, nodo] of Object.entries(OBLIGATORIOS)) {
      const falta = !d[k];
      nodo.closest(".campo").classList.toggle("invalido", falta);
      if (falta && !primero) primero = nodo.matches(".selector") ? nodo.querySelector(".selector__campo") : nodo;
    }
    if (primero) primero.focus();
    return !primero;
  }

  function limpiarFormulario() {
    form.reset();
    campoFecha.value = ahoraLocal();
    selPrograma.valor = "";
    selSolicitud.valor = "";
    fijarResuelto(false);
    mostrarResolucion(null);
    $$(".campo.invalido", form).forEach((c) => c.classList.remove("invalido"));
    estado.editando = null;
    $("#titulo-form").textContent = "Nueva llamada";
    $("#etiqueta-edicion").hidden = true;
    $("#btn-guardar").textContent = "Guardar llamada";
    $("#historial-cedula").hidden = true;
    $("#censo-cedula").hidden = true;
    mostrarSiguienteCaso();
    pintarLlamadas();
  }

  form.addEventListener("input", (e) => {
    const c = e.target.closest(".campo");
    if (c && e.target.value && e.target.value.trim()) c.classList.remove("invalido");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = datosFormulario();
    if (!validar(d)) { aviso("Complete los campos obligatorios", "error"); return; }
    const boton = $("#btn-guardar");
    boton.disabled = true;
    try {
      let guardada;
      if (estado.editando) {
        guardada = await api("/api/llamadas/" + estado.editando, { method: "PUT", body: d });
        aviso(`Caso ${guardada.caso} actualizado`, "exito");
      } else {
        guardada = await api("/api/llamadas", { method: "POST", body: d });
        aviso(`Llamada guardada · Caso ${guardada.caso}`, "exito");
      }
      // se actualiza la lista con lo que devolvió el servidor, sin volver a descargarla toda
      ponerLlamada(guardada);
      limpiarFormulario();
      mostrarUltimoCaso(guardada.caso);
      $("#f-cedula").focus();
    } catch (err) {
      aviso(err.message, "error");
    } finally {
      boton.disabled = false;
    }
  });

  $("#btn-limpiar").addEventListener("click", limpiarFormulario);
  $("#btn-nueva-llamada").addEventListener("click", () => {
    mostrarVista("registro");
    limpiarFormulario();
    $("#f-cedula").focus();
  });

  function editarLlamada(ll) {
    limpiarFormulario();
    estado.editando = ll.id;
    for (const k of ["fecha_hora", "nombre", "cedula", "respuesta", "observacion"]) form.elements[k].value = ll[k] || "";
    selPrograma.valor = ll.programa;
    selSolicitud.valor = ll.solicitud;
    fijarResuelto(ll.resuelto);
    mostrarResolucion(estado.respuestas.find((r) => r.pregunta === ll.solicitud));
    $("#caso-numero").textContent = ll.caso;
    $("#caso-numero").classList.remove("caso--pendiente");
    mostrarUltimoCaso(null);
    $("#titulo-form").textContent = "Editar llamada";
    $("#etiqueta-edicion").hidden = false;
    $("#btn-guardar").textContent = "Guardar cambios";
    actualizarHistorialCedula();
    avisoCensoCedula();
    pintarLlamadas();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function borrarLlamada(ll) {
    if (!confirm(`¿Eliminar el caso ${ll.caso} de ${ll.nombre}? Esta acción no se puede deshacer.`)) return;
    try {
      await api("/api/llamadas/" + ll.id, { method: "DELETE" });
      estado.llamadas = estado.llamadas.filter((x) => x.id !== ll.id);
      if (estado.editando === ll.id) limpiarFormulario();
      pintarFiltroTrabajador();
      pintarLlamadas();
      aviso("Llamada eliminada");
    } catch (err) { aviso(err.message, "error"); }
  }

  async function cambiarResuelto(ll) {
    try {
      const nueva = await api("/api/llamadas/" + ll.id, { method: "PATCH", body: { resuelto: !ll.resuelto } });
      Object.assign(ll, nueva);
      if (estado.editando === ll.id) fijarResuelto(ll.resuelto);
      pintarLlamadas();
      aviso(ll.resuelto ? `Caso ${ll.caso}: resuelto` : `Caso ${ll.caso}: pendiente`, ll.resuelto ? "exito" : "");
    } catch (err) { aviso(err.message, "error"); }
  }

  // historial por cédula: avisa y completa nombre y programa
  function actualizarHistorialCedula() {
    const ced = $("#f-cedula").value.trim();
    const pista = $("#historial-cedula");
    const previas = ced ? estado.llamadas.filter((l) => l.cedula === ced && l.id !== estado.editando) : [];
    if (!previas.length) { pista.hidden = true; return; }
    const pendientes = previas.filter((l) => !l.resuelto).length;
    pista.hidden = false;
    pista.textContent = `${previas.length} llamada(s) anterior(es)` + (pendientes ? ` · ${pendientes} pendiente(s)` : "");
    if (!estado.editando) {
      if (!form.elements.nombre.value) form.elements.nombre.value = previas[0].nombre;
      if (!selPrograma.valor && previas[0].programa) selPrograma.valor = previas[0].programa;
    }
  }
  $("#f-cedula").addEventListener("change", actualizarHistorialCedula);
  $("#f-cedula").addEventListener("change", avisoCensoCedula);

  // ============================================================ censo electoral
  const cacheCenso = new Map();
  const soloDigitos = (t) => String(t || "").replace(/[\s.,-]/g, "");

  async function consultarCenso(documento) {
    if (cacheCenso.has(documento)) return cacheCenso.get(documento);
    const r = await api("/api/censo/" + encodeURIComponent(documento));
    cacheCenso.set(r.documento, r);
    return r;
  }

  let totalCensoCargado = false;
  async function cargarTotalCenso() {
    if (totalCensoCargado) return;
    try {
      const { total } = await api("/api/censo");
      totalCensoCargado = true;
      $("#censo-total").textContent = total
        ? `${total.toLocaleString("es-CO")} documentos cargados.`
        : "El censo aún no se ha cargado.";
    } catch (_) { /* no es crítico */ }
  }

  const ICONO_SI = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  const ICONO_NO = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  const historialCenso = [];

  $("#form-censo").addEventListener("submit", async (e) => {
    e.preventDefault();
    const documento = soloDigitos($("#censo-documento").value);
    if (!/^\d{3,15}$/.test(documento)) { aviso("Escriba un número de documento válido (solo números)", "error"); return; }
    try {
      const r = await consultarCenso(documento);
      const caja = $("#censo-resultado");
      caja.hidden = false;
      caja.className = "censo-resultado " + (r.habilitado ? "si" : "no");
      $("#censo-icono").replaceChildren(svg(r.habilitado ? ICONO_SI : ICONO_NO));
      $("#censo-titulo").textContent = r.habilitado ? "Habilitado para votar" : "No aparece en el censo";
      $("#censo-detalle").textContent = r.habilitado
        ? (r.nombre ? `${r.documento} · ${r.nombre}` : `El documento ${r.documento} está en el censo electoral.`)
        : `El documento ${r.documento} no está en la lista. Verifique que esté bien escrito.`;
      $("#censo-extra").textContent = r.habilitado ? (r.titulo || "") : "";
      $("#censo-extra").hidden = !(r.habilitado && r.titulo);
      $("#censo-acta").textContent = r.acta || "—";
      $("#censo-fecha").textContent = r.fechaGrado ? r.fechaGrado.split("-").reverse().join("/") : "—";
      $("#censo-datos").hidden = !r.habilitado;
      $("#btn-censo-registrar").dataset.documento = r.documento;

      historialCenso.unshift(r);
      historialCenso.splice(8);
      $("#censo-historial").replaceChildren(...historialCenso.map((h) =>
        el("li", null, [el("b", null, h.nombre ? `${h.documento} · ${h.nombre}` : h.documento), el("span", h.habilitado ? "si" : "no", h.habilitado ? "Habilitado" : "No aparece")])
      ));
      $("#censo-documento").select();
    } catch (err) { aviso(err.message, "error"); }
  });

  // pasa el documento consultado al formulario de llamada
  $("#btn-censo-registrar").addEventListener("click", () => {
    const documento = $("#btn-censo-registrar").dataset.documento;
    mostrarVista("registro");
    if (!estado.editando && documento) {
      $("#f-cedula").value = documento;
      $("#f-cedula").dispatchEvent(new Event("change"));
      $("#f-nombre").focus();
    }
  });

  // al escribir la cédula de una llamada, indica si está en el censo
  async function avisoCensoCedula() {
    const pista = $("#censo-cedula");
    const documento = soloDigitos($("#f-cedula").value);
    if (!/^\d{3,15}$/.test(documento)) { pista.hidden = true; return; }
    try {
      const r = await consultarCenso(documento);
      if (soloDigitos($("#f-cedula").value) !== r.documento) return; // la cédula cambió mientras tanto
      pista.hidden = false;
      pista.className = "censo-pista " + (r.habilitado ? "si" : "no");
      pista.textContent = r.habilitado
        ? "✓ Está en el censo electoral" + (r.nombre ? " · " + r.nombre : "") + (r.titulo ? " · " + r.titulo : "")
        : "✗ No aparece en el censo electoral";
      // completa el nombre si aún está vacío
      if (r.habilitado && r.nombre && !estado.editando && !$("#f-nombre").value.trim()) $("#f-nombre").value = r.nombre;
    } catch (_) { pista.hidden = true; }
  }

  // ============================================================ lista de llamadas
  // agrega o reemplaza una llamada en la lista local, manteniendo el orden (más recientes primero)
  function ponerLlamada(ll) {
    estado.llamadas = [ll, ...estado.llamadas.filter((x) => x.id !== ll.id)].sort((a, b) =>
      b.fecha_hora < a.fecha_hora ? -1 : b.fecha_hora > a.fecha_hora ? 1 : b.id - a.id
    );
    pintarFiltroTrabajador();
    pintarLlamadas();
  }

  // ---- filtro por trabajador (solo administrador). "" = todos, "sin" = sin asignar, o el id
  const esAdmin = () => estado.yo?.rol === "ADMIN";
  estado.trabajador = "";

  const delTrabajador = (ll) =>
    !estado.trabajador ? true : estado.trabajador === "sin" ? ll.usuarioId == null : String(ll.usuarioId) === estado.trabajador;

  function pintarFiltroTrabajador() {
    if (!esAdmin()) return;
    const sel = $("#sel-trabajador");
    const cuenta = new Map();
    for (const ll of estado.llamadas) cuenta.set(ll.usuarioId ?? "sin", (cuenta.get(ll.usuarioId ?? "sin") || 0) + 1);
    const opcion = (valor, texto) => { const o = el("option", null, texto); o.value = valor; return o; };
    const opciones = [opcion("", `Todos los trabajadores (${estado.llamadas.length})`)];
    for (const u of [...estado.usuarios].sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }))) {
      opciones.push(opcion(String(u.id), `${u.nombre}${u.activo ? "" : " (inactivo)"} · ${cuenta.get(u.id) || 0}`));
    }
    if (cuenta.get("sin")) opciones.push(opcion("sin", `Sin asignar · ${cuenta.get("sin")}`));
    sel.replaceChildren(...opciones);
    // si el elegido ya no existe, volver a "todos"
    if (!opciones.some((o) => o.value === estado.trabajador)) estado.trabajador = "";
    sel.value = estado.trabajador;
    $("#filtro-trabajador").hidden = false;
    $("#filtro-trabajador").classList.toggle("activo", !!estado.trabajador);
    $("#btn-exportar").href = "/exportar" + (estado.trabajador ? "?trabajador=" + encodeURIComponent(estado.trabajador) : "");
  }
  $("#sel-trabajador").addEventListener("change", (e) => {
    estado.trabajador = e.target.value;
    pintarFiltroTrabajador();
    pintarLlamadas();
  });

  function pintarLlamadas() {
    const q = terminosLibres($("#buscar-llamadas").value);
    const base = estado.llamadas.filter(delTrabajador);
    const coinciden = base.filter((ll) => {
      if (!q.length) return true;
      const texto = normalizar([ll.caso, ll.nombre, ll.cedula, ll.programa, ll.solicitud, ll.respuesta, ll.observacion].join(" "));
      return q.every((p) => texto.includes(p));
    });
    const visibles = coinciden.filter((ll) =>
      estado.filtro === "todos" ? true : estado.filtro === "resueltos" ? ll.resuelto : !ll.resuelto
    );

    $("#lista-llamadas").replaceChildren(
      ...visibles.map((ll) => {
        const botonEstado = el("button", "estado " + (ll.resuelto ? "estado--resuelto" : "estado--pendiente"), [
          svg(ll.resuelto ? ICONOS.check : ICONOS.reloj),
          ll.resuelto ? "Resuelto" : "Pendiente",
        ]);
        botonEstado.type = "button";
        botonEstado.title = ll.resuelto ? "Marcar como pendiente" : "Marcar como resuelto";
        botonEstado.addEventListener("click", () => cambiarResuelto(ll));

        return el("li", "llamada" + (estado.editando === ll.id ? " seleccionada" : ""), [
          el("div", "llamada__top", [
            el("div", "llamada__info", [
              el("div", "llamada__nombre", resaltar(ll.nombre, q)),
              el("div", "llamada__meta", [
                el("span", null, formatoFecha(ll.fecha_hora)),
                el("span", null, resaltar("C.C. " + ll.cedula, q)),
                ll.programa ? el("span", null, resaltar(ll.programa, q)) : null,
              ]),
            ]),
            el("span", "chip chip--acento", resaltar(ll.caso, q)),
          ]),
          el("p", "llamada__texto", resaltar(ll.solicitud, q)),
          el("div", "llamada__pie", [
            botonEstado,
            ll.atendio ? el("span", "llamada__atendio", "Atendió: " + ll.atendio) : null,
            el("div", "llamada__acciones", [
              iconoBoton("editar", "Editar", () => editarLlamada(ll)),
              iconoBoton("borrar", "Eliminar", () => borrarLlamada(ll)),
            ]),
          ]),
        ]);
      })
    );

    const pendientes = coinciden.filter((l) => !l.resuelto).length;
    $("#contador-llamadas").textContent = base.length;
    $("#n-pendientes").textContent = pendientes;
    $("#n-resueltos").textContent = coinciden.length - pendientes;
    const vacio = $("#vacio-llamadas");
    vacio.hidden = visibles.length > 0;
    vacio.textContent = base.length ? "No hay llamadas que coincidan."
      : estado.trabajador ? "Este trabajador no tiene llamadas registradas."
      : "Aún no hay llamadas registradas.";
  }

  $("#buscar-llamadas").addEventListener("input", pintarLlamadas);
  $("#btn-buscar-llamadas").addEventListener("click", () => { pintarLlamadas(); $("#buscar-llamadas").focus(); });
  $$(".filtro").forEach((b) =>
    b.addEventListener("click", () => {
      estado.filtro = b.dataset.filtro;
      $$(".filtro").forEach((x) => x.classList.toggle("activo", x === b));
      pintarLlamadas();
    })
  );

  // ============================================================ respuestas
  function buscarRespuestas(q) {
    return estado.respuestas
      .map((r) => {
        const pr = normalizar(r.pregunta), re = normalizar(r.respuesta), rs = normalizar(r.resolucion);
        let puntos = 0, aciertos = 0;
        for (const p of q) {
          let hit = false;
          if (pr.includes(p)) { puntos += 3; hit = true; }
          if (re.includes(p)) { puntos += 1; hit = true; }
          if (rs.includes(p)) { puntos += 1; hit = true; }
          if (hit) aciertos++;
        }
        return { r, puntos, aciertos };
      })
      .filter((x) => x.aciertos > 0)
      .sort((a, b) => b.aciertos - a.aciertos || b.puntos - a.puntos);
  }

  async function cargarRespuestas() {
    estado.respuestas = await api("/api/respuestas");
    pintarRespuestas();
    selSolicitud.refrescar();
  }

  async function cargarProgramas() {
    estado.programas = await api("/api/programas");
    selPrograma.refrescar();
  }

  function pintarRespuestas() {
    const q = palabras($("#buscar-respuestas").value);
    const lista = q.length ? buscarRespuestas(q).map((x) => x.r) : estado.respuestas;

    $("#lista-respuestas").replaceChildren(
      ...lista.map((r) => {
        const bloque = (etiqueta, texto, extra = "") =>
          el("div", "respuesta__bloque" + extra, [
            el("div", "respuesta__etiqueta", etiqueta),
            el("div", "respuesta__texto", resaltar(texto, q)),
          ]);
        return el("article", "respuesta", [
          el("div", "respuesta__cabeza", [
            el("h3", "respuesta__pregunta", resaltar(r.pregunta, q)),
            el("div", "respuesta__acciones", [
              iconoBoton("editar", "Editar", () => abrirModal(r)),
              iconoBoton("borrar", "Eliminar", () => borrarRespuesta(r)),
            ]),
          ]),
          bloque("Posible respuesta", r.respuesta),
          r.resolucion ? bloque("Resolución relacionada", r.resolucion, " respuesta__bloque--resolucion") : null,
        ]);
      })
    );

    const total = estado.respuestas.length;
    $("#info-respuestas").textContent = q.length ? `${lista.length} resultado(s) de ${total}` : `${total} respuesta(s) guardadas`;
    $("#vacio-respuestas").hidden = lista.length > 0;
  }
  $("#buscar-respuestas").addEventListener("input", pintarRespuestas);
  $("#btn-buscar-respuestas").addEventListener("click", () => { pintarRespuestas(); $("#buscar-respuestas").focus(); });
  $("#buscar-respuestas").addEventListener("keydown", (e) => { if (e.key === "Enter") pintarRespuestas(); });

  // ---- modal crear / editar respuesta (devuelve una promesa con el registro guardado o null)
  const modal = $("#modal-respuesta");
  const formR = $("#form-respuesta");
  let editandoRespuesta = null;
  let resolverModal = null;

  function abrirModal(r = null, preguntaInicial = "") {
    editandoRespuesta = r;
    formR.reset();
    $$(".campo.invalido", formR).forEach((c) => c.classList.remove("invalido"));
    $("#titulo-modal").textContent = r ? "Editar respuesta" : "Nueva respuesta";
    if (r) for (const k of ["pregunta", "respuesta", "resolucion"]) formR.elements[k].value = r[k] || "";
    else formR.elements.pregunta.value = preguntaInicial;
    modal.showModal();
    (r || preguntaInicial ? formR.elements.respuesta : formR.elements.pregunta).focus();
    return new Promise((resolver) => (resolverModal = resolver));
  }

  modal.addEventListener("close", () => {
    if (resolverModal) { resolverModal(modal.returnValue ? JSON.parse(modal.returnValue) : null); resolverModal = null; }
    modal.returnValue = "";
  });

  $("#btn-nueva-respuesta").addEventListener("click", () => abrirModal(null, $("#buscar-respuestas").value.trim()));
  $("#btn-cancelar-modal").addEventListener("click", () => modal.close(""));

  formR.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = {};
    new FormData(formR).forEach((v, k) => (d[k] = v.toString().trim()));
    let ok = true;
    for (const k of ["pregunta", "respuesta"]) {
      const falta = !d[k];
      formR.elements[k].closest(".campo").classList.toggle("invalido", falta);
      if (falta) ok = false;
    }
    if (!ok) { aviso("Complete la pregunta y la respuesta", "error"); return; }
    try {
      const anterior = editandoRespuesta;
      const guardada = anterior
        ? await api("/api/respuestas/" + anterior.id, { method: "PUT", body: d })
        : await api("/api/respuestas", { method: "POST", body: d });
      await cargarRespuestas();
      // si la solicitud elegida en el formulario cambió de nombre, mantenerla sincronizada
      if (anterior && selSolicitud.valor === anterior.pregunta) {
        selSolicitud.valor = guardada.pregunta;
        mostrarResolucion(guardada);
      }
      modal.close(JSON.stringify(guardada));
      aviso(anterior ? "Respuesta actualizada" : "Respuesta guardada", "exito");
    } catch (err) { aviso(err.message, "error"); }
  });

  async function borrarRespuesta(r) {
    if (!confirm("¿Eliminar esta respuesta? También dejará de aparecer en la lista de solicitudes.")) return;
    try {
      await api("/api/respuestas/" + r.id, { method: "DELETE" });
      await cargarRespuestas();
      aviso("Respuesta eliminada");
    } catch (err) { aviso(err.message, "error"); }
  }

  // ============================================================ sesión y menú del usuario
  const ROL_TEXTO = { ADMIN: "Administrador", TRABAJADOR: "Trabajador" };
  const iniciales = (n) => (n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  function pintarUsuarioActual(u) {
    estado.yo = u;
    $("#nombre-usuario").textContent = u.nombre;
    $("#rol-usuario").textContent = ROL_TEXTO[u.rol] || u.rol;
    $("#avatar-usuario").textContent = iniciales(u.nombre);
    $("#pestana-usuarios").hidden = u.rol !== "ADMIN";
  }

  const panelUsuario = $("#panel-usuario");
  const botonMenu = $("#btn-menu-usuario");
  function menuUsuario(abrir) {
    panelUsuario.hidden = !abrir;
    botonMenu.setAttribute("aria-expanded", String(abrir));
  }
  botonMenu.addEventListener("click", () => menuUsuario(panelUsuario.hidden));
  document.addEventListener("mousedown", (e) => { if (!e.target.closest(".menu-usuario")) menuUsuario(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") menuUsuario(false); });

  $("#btn-salir").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST", body: {} }).catch(() => {});
    location.replace("/login");
  });

  // botones "Cancelar" de los modales
  $$("dialog [data-cerrar]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

  // ---- modal de contraseña: cambiar la propia o restablecer la de otro usuario (admin)
  const modalClave = $("#modal-clave");
  const formClave = $("#form-clave");
  let claveDe = null; // null = la propia; objeto usuario = restablecer

  function abrirModalClave(usuario = null) {
    claveDe = usuario;
    formClave.reset();
    $$(".campo.invalido", formClave).forEach((c) => c.classList.remove("invalido"));
    $("#titulo-modal-clave").textContent = usuario ? "Restablecer contraseña" : "Cambiar contraseña";
    $("#texto-modal-clave").hidden = !usuario;
    $("#texto-modal-clave").textContent = usuario
      ? `${usuario.nombre} ingresará con esta contraseña temporal y deberá cambiarla.`
      : "";
    $("#k-campo-actual").hidden = !!usuario;
    $("#k-campo-repetir").hidden = !!usuario;
    $("#k-etiqueta-nueva").textContent = usuario ? "Contraseña temporal" : "Nueva contraseña";
    $("#k-nueva").type = usuario ? "text" : "password";
    if (usuario) $("#k-nueva").value = usuario.cedula || "";
    menuUsuario(false);
    modalClave.showModal();
    (usuario ? $("#k-nueva") : $("#k-actual")).focus();
  }
  $("#btn-cambiar-clave").addEventListener("click", () => abrirModalClave());

  formClave.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nueva = $("#k-nueva").value;
    try {
      if (claveDe) {
        await api(`/api/usuarios/${claveDe.id}/restablecer`, { method: "POST", body: { clave: nueva } });
        aviso(`Contraseña de ${claveDe.nombre} restablecida`, "exito");
      } else {
        if (nueva !== $("#k-repetir").value) { aviso("Las contraseñas nuevas no coinciden", "error"); return; }
        await api("/api/cambiar-clave", { method: "POST", body: { actual: $("#k-actual").value, nueva } });
        aviso("Contraseña actualizada", "exito");
      }
      modalClave.close();
    } catch (err) { aviso(err.message, "error"); }
  });

  // ============================================================ usuarios (solo administrador)
  const modalUsuario = $("#modal-usuario");
  const formUsuario = $("#form-usuario");
  let editandoUsuario = null;
  let rolElegido = "TRABAJADOR";
  estado.usuarios = [];

  async function cargarUsuarios() {
    if (estado.yo?.rol !== "ADMIN") return;
    try {
      estado.usuarios = await api("/api/usuarios");
      pintarUsuarios();
      pintarFiltroTrabajador();
    } catch (err) { aviso(err.message, "error"); }
  }

  function pintarUsuarios() {
    const q = terminosLibres($("#buscar-usuarios").value);
    const lista = estado.usuarios.filter((u) => {
      const t = normalizar([u.nombre, u.cedula, u.usuario, ROL_TEXTO[u.rol]].join(" "));
      return q.every((p) => t.includes(p));
    });
    $("#lista-usuarios").replaceChildren(
      ...lista.map((u) =>
        el("li", "usuario" + (u.activo ? "" : " inactivo"), [
          el("span", "avatar", iniciales(u.nombre)),
          el("div", "usuario__info", [
            el("div", "usuario__nombre", [
              el("span", null, resaltar(u.nombre, q)),
              el("span", "chip" + (u.rol === "ADMIN" ? " chip--admin" : ""), ROL_TEXTO[u.rol]),
              u.activo ? null : el("span", "chip chip--inactivo", "Inactivo"),
              u.debeCambiarClave ? el("span", "chip chip--aviso", "Debe cambiar contraseña") : null,
              u.id === estado.yo.id ? el("span", "chip", "Usted") : null,
            ]),
            el("div", "usuario__meta", [
              el("span", null, resaltar("Usuario: " + u.usuario, q)),
              u.cedula ? el("span", null, resaltar("C.C. " + u.cedula, q)) : null,
              el("span", null, u.ultimoIngreso ? "Último ingreso: " + formatoFecha(u.ultimoIngreso) : "Nunca ha ingresado"),
            ]),
          ]),
          el("div", "usuario__acciones", [
            iconoBoton("editar", "Editar", () => abrirModalUsuario(u)),
            (() => {
              const b = el("button", "enlace-sutil", "Restablecer contraseña");
              b.type = "button";
              b.addEventListener("click", () => abrirModalClave(u));
              return b;
            })(),
          ]),
        ])
      )
    );
    const activos = estado.usuarios.filter((u) => u.activo).length;
    $("#info-usuarios").textContent = `${estado.usuarios.length} usuario(s) · ${activos} activo(s)`;
  }
  $("#buscar-usuarios").addEventListener("input", pintarUsuarios);
  $("#btn-buscar-usuarios").addEventListener("click", () => { pintarUsuarios(); $("#buscar-usuarios").focus(); });

  function fijarRol(rol) {
    rolElegido = rol;
    $$("#u-rol .interruptor__op").forEach((b) => {
      const activo = b.dataset.valor === rol;
      b.classList.toggle("activo", activo);
      b.setAttribute("aria-checked", String(activo));
    });
  }
  $$("#u-rol .interruptor__op").forEach((b) => b.addEventListener("click", () => fijarRol(b.dataset.valor)));

  function abrirModalUsuario(u = null) {
    editandoUsuario = u;
    formUsuario.reset();
    $$(".campo.invalido", formUsuario).forEach((c) => c.classList.remove("invalido"));
    $("#titulo-modal-usuario").textContent = u ? "Editar usuario" : "Nuevo usuario";
    $("#u-nombre").value = u?.nombre || "";
    $("#u-cedula").value = u?.cedula || "";
    $("#u-usuario").value = u?.usuario || "";
    $("#u-usuario").disabled = !!u; // el usuario de ingreso no se cambia después de creado
    $("#u-campo-clave").hidden = !!u;
    $("#u-campo-activo").hidden = !u;
    $("#u-activo").checked = u ? u.activo : true;
    fijarRol(u?.rol || "TRABAJADOR");
    modalUsuario.showModal();
    $("#u-nombre").focus();
  }
  // ---- crear varios usuarios a la vez
  const modalLote = $("#modal-lote");
  const filasLote = $("#lote-filas");
  const MAX_LOTE = 50;

  function entrada(nombre, placeholder, extra = {}) {
    const i = el("input");
    Object.assign(i, { name: nombre, placeholder, autocomplete: "off", ...extra });
    i.setAttribute("aria-label", placeholder);
    i.addEventListener("input", () => {
      i.classList.remove("invalido");
      const error = i.closest(".lote__fila")?.querySelector(".lote__error");
      if (error) error.textContent = "";
      contarLote();
    });
    return i;
  }

  function agregarFilaLote(enfocar = true) {
    if (filasLote.children.length >= MAX_LOTE) { aviso(`Máximo ${MAX_LOTE} usuarios por vez`, "error"); return; }
    const nombre = entrada("nombre", "Nombre completo");
    const cedula = entrada("cedula", "Cédula", { inputMode: "numeric" });
    const usuario = entrada("usuario", "Igual a la cédula", { autocapitalize: "off", spellcheck: false });
    usuario.setAttribute("aria-label", "Usuario (opcional)");
    const rol = el("select");
    rol.name = "rol";
    rol.setAttribute("aria-label", "Rol");
    for (const [valor, texto] of [["TRABAJADOR", "Trabajador"], ["ADMIN", "Administrador"]]) {
      const o = el("option", null, texto);
      o.value = valor;
      rol.append(o);
    }
    const quitar = iconoBoton("borrar", "Quitar fila", () => {
      li.remove();
      if (!filasLote.children.length) agregarFilaLote();
      contarLote();
    });
    const li = el("li", "lote__item", el("div", "lote__fila", [nombre, cedula, usuario, rol, quitar, el("div", "lote__error")]));
    filasLote.append(li);
    contarLote();
    if (enfocar) { nombre.focus(); li.scrollIntoView({ block: "nearest" }); }
  }

  const valoresFila = (li) => Object.fromEntries($$("input, select", li).map((c) => [c.name, c.value.trim()]));
  const filaVacia = (v) => !v.nombre && !v.cedula && !v.usuario;

  function contarLote() {
    const n = $$(".lote__item", filasLote).filter((li) => !filaVacia(valoresFila(li))).length;
    $("#lote-info").textContent = n ? `${n} usuario(s) por guardar` : "";
  }

  function abrirModalLote() {
    filasLote.replaceChildren();
    agregarFilaLote(false);
    agregarFilaLote(false);
    agregarFilaLote(false);
    modalLote.showModal();
    $("input", filasLote).focus();
  }
  $("#btn-nuevo-usuario").addEventListener("click", abrirModalLote);
  $("#btn-lote-fila").addEventListener("click", () => agregarFilaLote());

  // Enter pasa al siguiente campo; en el último de la última fila agrega otra fila
  filasLote.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.target.tagName !== "INPUT") return;
    e.preventDefault();
    const campos = $$("input", filasLote);
    const i = campos.indexOf(e.target);
    if (i === campos.length - 1) agregarFilaLote();
    else campos[i + 1].focus();
  });

  $("#form-lote").addEventListener("submit", async (e) => {
    e.preventDefault();
    const items = $$(".lote__item", filasLote);
    items.forEach((li) => { $$(".invalido", li).forEach((c) => c.classList.remove("invalido")); $(".lote__error", li).textContent = ""; });

    // las filas totalmente vacías se ignoran
    const conDatos = items.map((li) => ({ li, v: valoresFila(li) })).filter((f) => !filaVacia(f.v));
    if (!conDatos.length) { aviso("Escriba al menos un usuario", "error"); $("input", filasLote).focus(); return; }

    let primero = null;
    for (const { li, v } of conDatos) {
      const faltan = [!v.nombre && "nombre", !v.cedula && "cedula"].filter(Boolean);
      faltan.forEach((n) => li.querySelector(`[name=${n}]`).classList.add("invalido"));
      if (faltan.length) {
        $(".lote__error", li).textContent = "Falta " + faltan.map((n) => (n === "cedula" ? "la cédula" : "el nombre")).join(" y ");
        primero ??= li.querySelector(".invalido");
      }
    }
    if (primero) { aviso("Complete las filas marcadas", "error"); primero.focus(); return; }

    const boton = $("#btn-lote-guardar");
    boton.disabled = true;
    try {
      const creados = await api("/api/usuarios/lote", { method: "POST", body: { usuarios: conDatos.map((f) => f.v) } });
      modalLote.close();
      aviso(`${creados.length} usuario(s) creado(s)`, "exito");
      await cargarUsuarios();
    } catch (err) {
      for (const { fila, error } of err.datos?.filas || []) {
        const li = conDatos[fila]?.li;
        if (!li) continue;
        $(".lote__error", li).textContent = error;
        const v = conDatos[fila].v;
        const campo = !v.nombre ? "nombre" : /usuario/i.test(error) ? (v.usuario ? "usuario" : "cedula") : "nombre";
        li.querySelector(`[name=${campo}]`).classList.add("invalido");
        primero ??= li;
      }
      primero?.scrollIntoView({ block: "nearest" });
      aviso(err.message, "error");
    } finally {
      boton.disabled = false;
    }
  });

  formUsuario.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = $("#u-nombre").value.trim();
    const cedula = $("#u-cedula").value.trim();
    const usuario = $("#u-usuario").value.trim() || cedula;
    $("#u-nombre").closest(".campo").classList.toggle("invalido", !nombre);
    $("#u-usuario").closest(".campo").classList.toggle("invalido", !usuario);
    if (!nombre || !usuario) { aviso("Complete el nombre y la cédula o el usuario", "error"); return; }
    try {
      if (editandoUsuario) {
        const actualizado = await api("/api/usuarios/" + editandoUsuario.id, {
          method: "PUT", body: { nombre, cedula, rol: rolElegido, activo: $("#u-activo").checked },
        });
        if (actualizado.id === estado.yo.id) pintarUsuarioActual({ ...estado.yo, ...actualizado });
        aviso("Usuario actualizado", "exito");
      } else {
        const creado = await api("/api/usuarios", {
          method: "POST", body: { nombre, cedula, usuario, rol: rolElegido, clave: $("#u-clave").value || cedula },
        });
        aviso(`Usuario «${creado.usuario}» creado`, "exito");
      }
      modalUsuario.close();
      await cargarUsuarios();
      if (estado.yo.rol !== "ADMIN") mostrarVista("registro");
    } catch (err) { aviso(err.message, "error"); }
  });

  // ============================================================ inicio
  limpiarFormulario();

  async function iniciar() {
    if (location.protocol === "file:") {
      alerta("Está abriendo el archivo directamente. Abra la página con iniciar.bat.");
      return;
    }
    // una sola petición trae el usuario y todos los datos de la página
    let datos;
    try {
      datos = await api("/api/inicio");
    } catch (err) {
      alerta(err.message);
      return;
    }
    const yo = datos.yo;
    pintarUsuarioActual(yo);
    estado.llamadas = datos.llamadas;
    estado.respuestas = datos.respuestas;
    estado.programas = datos.programas;
    estado.usuarios = datos.usuarios;
    pintarRespuestas();
    selSolicitud.refrescar();
    selPrograma.refrescar();
    if (yo.rol === "ADMIN") pintarUsuarios();
    pintarFiltroTrabajador();
    pintarLlamadas();
    if (yo.rol !== "ADMIN") {
      $("#titulo-llamadas").textContent = "Mis llamadas";
      $("#btn-exportar").title = "Descargar mis llamadas en Excel";
    }

    let vistaInicial = "registro";
    try { vistaInicial = localStorage.getItem("vista") || "registro"; } catch (_) { /* nada */ }
    const permitidas = yo.rol === "ADMIN" ? ["registro", "respuestas", "censo", "usuarios"] : ["registro", "respuestas", "censo"];
    mostrarVista(permitidas.includes(vistaInicial) ? vistaInicial : "registro", false);
  }
  iniciar();
})();
