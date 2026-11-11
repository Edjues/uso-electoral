(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);

  async function api(url, body) {
    let res;
    try {
      res = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (_) {
      throw new Error("No hay conexión con el servidor. Ejecute iniciar.bat.");
    }
    const datos = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(datos.error || "Error del servidor"), { estado: res.status });
    return datos;
  }

  function error(id, texto) {
    const n = $(id);
    n.textContent = texto || "";
    n.hidden = !texto;
  }

  function mostrarCambio(usuario) {
    $("#form-login").hidden = true;
    $("#form-cambio").hidden = false;
    $("#nombre-cambio").textContent = usuario.nombre;
    $("#c-actual").value = $("#l-clave").value || "";
    ($("#c-actual").value ? $("#c-nueva") : $("#c-actual")).focus();
  }

  // mostrar / ocultar contraseña
  document.querySelectorAll(".clave__ver").forEach((b) =>
    b.addEventListener("click", () => {
      const input = document.getElementById(b.dataset.para);
      const ver = input.type === "password";
      input.type = ver ? "text" : "password";
      b.textContent = ver ? "Ocultar" : "Ver";
      input.focus();
    })
  );

  $("#form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    error("#error-login");
    const usuario = $("#l-usuario").value.trim();
    const clave = $("#l-clave").value;
    if (!usuario || !clave) { error("#error-login", "Escriba su usuario y contraseña."); return; }
    const boton = $("#btn-ingresar");
    boton.disabled = true;
    try {
      const { usuario: u } = await api("/api/login", { usuario, clave });
      if (u.debeCambiarClave) mostrarCambio(u);
      else location.replace("/");
    } catch (err) {
      error("#error-login", err.message);
      $("#l-clave").select();
    } finally {
      boton.disabled = false;
    }
  });

  $("#form-cambio").addEventListener("submit", async (e) => {
    e.preventDefault();
    error("#error-cambio");
    const actual = $("#c-actual").value;
    const nueva = $("#c-nueva").value;
    if (!actual || !nueva) { error("#error-cambio", "Complete todos los campos."); return; }
    if (nueva !== $("#c-repetir").value) { error("#error-cambio", "Las contraseñas nuevas no coinciden."); return; }
    try {
      await api("/api/cambiar-clave", { actual, nueva });
      location.replace("/");
    } catch (err) {
      if (err.estado === 401) location.reload();
      error("#error-cambio", err.message);
    }
  });

  $("#btn-salir-cambio").addEventListener("click", async () => {
    await api("/api/logout", {}).catch(() => {});
    location.replace("/login");
  });

  // si ya hay sesión pero falta cambiar la contraseña, ir directo a ese paso
  api("/api/yo")
    .then(({ usuario }) => (usuario.debeCambiarClave ? mostrarCambio(usuario) : location.replace("/")))
    .catch(() => $("#l-usuario").focus());
})();
