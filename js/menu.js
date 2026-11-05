"use strict";


(function () {
  /* ---------- 0. Guardia de sesión (SOLO DEMO) ----------
     Impide abrir una página interna sin haber pasado por el login.
     OJO: esto es comodidad de uso, NO seguridad. Un usuario puede saltárselo
     desde la consola del navegador. La seguridad real debe vivir en el
     servidor (sesión/JWT validados en cada petición a la API).
     Para desactivarlo mientras desarrollas, pon REQUIERE_SESION = false. */
  const REQUIERE_SESION = true;
  const CLAVE_SESION = "set_sesion";

  function haySesion() {
    try { return sessionStorage.getItem(CLAVE_SESION) === "1"; }
    catch (_) { return true; }          // si el navegador bloquea el storage, no se bloquea la app
  }

  if (REQUIERE_SESION && !haySesion()) {
    location.replace("login.html");
    return;
  }

  /* ---------- 1. Estructura del menú (para agregar o quitar opciones, edita SOLO esto) ----------
     Cada sección tiene un nombre y una lista de páginas: [texto, archivo.html].
     Los nombres de archivo deben coincidir EXACTAMENTE con los de la carpeta /html
     (en servidores Linux se distingue entre mayúsculas y minúsculas). */
  const MENU = [
    { nombre: "Inicio", sinSubmenu: true,
      paginas: [["Panel principal", "inicio.html"]] },
    { nombre: "Personal",
      paginas: [["Colaboradores", "colaboradores.html"],
                ["Registrar colaborador", "colaboradores-registro.html"]] },
    { nombre: "Flota",
      paginas: [["Vehículos", "vehiculos.html"],
                ["Registrar vehículo", "vehiculos-registro.html"],
                ["Vencimientos", "vencimientos.html"]] },
    { nombre: "Operación",
      paginas: [["Rutas", "rutas.html"],
                ["Asignaciones", "asignaciones.html"],
                ["Contratos", "contratos.html"]] },
    { nombre: "Catálogos",
      paginas: [["Propietarios", "catalogo-propietarios.html"],
                ["Clientes", "catalogo-clientes.html"],
                ["Empresas prestadoras", "catalogo-empresas.html"],
                ["Cargos", "catalogo-cargos.html"]] }
  ];

  /* ---------- 2. Datos de la página actual (vienen del <body>) ---------- */
  const seccionActual = document.body.dataset.seccion;                 // Ej: "Personal"
  const paginaActual  = document.body.dataset.pagina;                  // Ej: "Colaboradores"
  const migas = (document.body.dataset.migas || "")
    .split("|").map(m => m.trim()).filter(Boolean);                    // acepta "A | B" y "A|B"

  /* Crea un elemento con atributos y contenido de texto.
     Se usa textContent (nunca innerHTML) para que ningún texto —por ejemplo un
     nombre que algún día venga de la base de datos— pueda inyectar HTML. */
  function crear(etiqueta, atributos = {}, ...hijos) {
    const nodo = document.createElement(etiqueta);
    for (const [clave, valor] of Object.entries(atributos)) {
      if (valor === false || valor == null) continue;
      nodo.setAttribute(clave, valor === true ? "" : valor);
    }
    hijos.forEach(h => nodo.append(h));
    return nodo;
  }

  /* ---------- 3. Barra superior: logo + secciones + menú de usuario ---------- */
  const barra = document.getElementById("barra-superior");
  if (barra) {
    const enlaces = MENU.map(seccion => {
      const activa = seccion.nombre === seccionActual;
      return crear("a", {
        class: activa ? "activo" : false,
        href: seccion.paginas[0][1],              // cada sección lleva a su primera página
        "aria-current": activa ? "true" : false
      }, seccion.nombre);
    });

    const logo = crear("a", { class: "logo", href: "inicio.html", "aria-label": "Ir al inicio" },
      crear("img", {
        src: "../imagen/Logo_Trnaspote_Especiales_SET.png",
        alt: "Transportes Especiales SET S.A.S."
      }));

    const salir = crear("a", { href: "login.html", "data-accion": "salir" }, "Cerrar sesión");
    salir.addEventListener("click", () => {
      try { sessionStorage.removeItem(CLAVE_SESION); } catch (_) { /* sin storage: nada que borrar */ }
    });

    // Heurística 3: "Cerrar sesión" va dentro del menú de usuario, lejos de la navegación
    const usuario = crear("details", { class: "usuario" },
      crear("summary", {},
        crear("span", {}, "Administrador"),
        crear("span", { class: "usuario__avatar", "aria-hidden": "true" }, "A")),
      crear("div", { class: "usuario__menu" }, salir));

    barra.replaceChildren(
      logo,
      crear("nav", { class: "menu-principal", "aria-label": "Menú principal" }, ...enlaces),
      usuario);

    // El menú de usuario se cierra al hacer clic fuera o al pulsar Esc
    document.addEventListener("click", e => { if (!usuario.contains(e.target)) usuario.open = false; });
    document.addEventListener("keydown", e => { if (e.key === "Escape") usuario.open = false; });
  }

  /* ---------- 4. Submenú: las páginas de la sección actual ---------- */
  const seccion = MENU.find(s => s.nombre === seccionActual);
  const submenu = document.getElementById("submenu");
  if (submenu) {
    if (seccion && !seccion.sinSubmenu) {
      submenu.replaceChildren(...seccion.paginas.map(([texto, archivo]) => {
        const activa = texto === paginaActual;
        return crear("a", {
          class: activa ? "activo" : false,
          href: archivo,
          "aria-current": activa ? "page" : false
        }, texto);
      }));
    } else {
      submenu.hidden = true;                      // Inicio no necesita submenú
    }
  }

  /* ---------- 5. Migas de pan: "Inicio › Personal › Colaboradores" ---------- */
  // La última miga (donde estamos) va en negrita; "Inicio" es un enlace de regreso.
  const contenedorMigas = document.getElementById("migas");
  if (contenedorMigas) {
    const partes = [];
    migas.forEach((texto, i) => {
      if (i > 0) partes.push(" › ");
      if (i === migas.length - 1) {
        partes.push(crear("strong", { "aria-current": "page" }, texto));
      } else if (texto === "Inicio") {
        partes.push(crear("a", { href: "inicio.html" }, texto));
      } else {
        partes.push(texto);
      }
    });
    contenedorMigas.replaceChildren(...partes);
  }
})();