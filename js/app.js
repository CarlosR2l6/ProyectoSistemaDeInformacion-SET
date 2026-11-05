"use strict";

/* Utilidades*/

//Días antes del vencimiento en los que un documento pasa a "Por vencer"
//Debe coincidir con el texto "próximos 30 días" de vencimientos.html y con la vista SQL
const UMBRAL_POR_VENCER = 30;

//Minúsculas y sin tildes: "Dirección" y "direccion" cuentan como lo mismo al buscar
const normalizar = texto => String(texto ?? "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().trim();

//Solo letras y números: "WOZ-214" = "woz214" y "1.234.567.890" = "1234567890"
const compacto = texto => normalizar(texto).replace(/[^a-z0-9]/g, "");

//"2026-10-18" → Date local. (new Date("2026-10-18") se interpreta como UTC y en
//Colombia daría el día anterior; por eso se construye con año/mes/día.)
function fechaDesdeISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

const aISO = fecha =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;

const aFormatoLocal = iso => iso.split("-").reverse().join("/");     // 2026-10-18 → 18/10/2026

/*Avisos y confirmaciones*/

let temporizadorAviso = null;

//Heurística 1: el sistema informa lo que pasó
//Muestra un mensaje arriba a la derecha durante 3,5 segundos
//tipo: "ok" (verde) o "error" (rojo). Solo hay un aviso a la vez (no se apilan)
function mostrarAviso(texto, tipo = "ok") {
  document.querySelectorAll(".aviso").forEach(a => a.remove());
  clearTimeout(temporizadorAviso);

  const aviso = document.createElement("div");
  aviso.className = "aviso" + (tipo === "error" ? " aviso--error" : "");
  aviso.setAttribute("role", tipo === "error" ? "alert" : "status");   // Los lectores de pantalla lo anuncian
  aviso.textContent = (tipo === "ok" ? "✔ " : "✖ ") + texto;
  document.body.appendChild(aviso);
  temporizadorAviso = setTimeout(() => aviso.remove(), 3500);
}

//Ventana de confirmación. Devuelve una promesa: true si el usuario acepta
//Heurísticas 3 y 5: nunca se borra nada sin preguntar
function confirmar(titulo, mensaje, textoBoton) {
  return new Promise(resolver => {
    const ventana = document.createElement("dialog");
    ventana.className = "dialogo";
    ventana.innerHTML = `
      <h2></h2><p></p>
      <div class="botones">
        <button type="button" class="boton boton--secundario" data-resp="no">Cancelar</button>
        <button type="button" class="boton boton--peligro" data-resp="si"></button>
      </div>`;

    //textContent (y no innerHTML) evita que un nombre raro rompa la página o inyecte HTML
    ventana.querySelector("h2").textContent = titulo;
    ventana.querySelector("p").textContent = mensaje;
    ventana.querySelector("[data-resp=si]").textContent = textoBoton;

    ventana.addEventListener("click", e => {
      const respuesta = e.target.dataset.resp;
      if (respuesta) { ventana.close(); resolver(respuesta === "si"); }
    });
    ventana.addEventListener("cancel", () => resolver(false));      // Tecla Esc
    ventana.addEventListener("close", () => { resolver(false); ventana.remove(); });  // (resolver ya resuelto = sin efecto)

    document.body.appendChild(ventana);
    ventana.showModal();
  });
}

/*Estado de los documentos según su fecha (nunca escrito a mano)*/

// Devuelve cómo se debe mostrar un documento según su fecha de vencimiento (ISO o vacío)
function estadoPorVencimiento(iso, hoy = new Date()) {
  const fecha = fechaDesdeISO(iso);
  if (!fecha) return { clave: "Sin vencimiento", clase: "neutro", icono: "—", texto: "Sin vencimiento" };

  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const dias = Math.round((fecha - inicioHoy) / 86400000);

  if (dias < 0)  return { clave: "Vencido", clase: "error", icono: "✖", texto: "Vencido" };
  if (dias <= UMBRAL_POR_VENCER) {
    const texto = dias === 0 ? "Vence hoy" : dias === 1 ? "Vence mañana" : `Vence en ${dias} días`;
    return { clave: "Por vencer", clase: "alerta", icono: "⚠", texto };
  }
  return { clave: "Vigente", clase: "ok", icono: "✔", texto: "Vigente" };
}

//Las tablas con data-estado-auto recalculan su columna "Estado" a partir de la columna
//"Vencimiento". Así "Vence en 15 días" no queda desactualizado con el paso del tiempo
function iniciarEstadosAutomaticos() {
  document.querySelectorAll("table[data-estado-auto]").forEach(tabla => {
    const cabeceras = Array.from(tabla.tHead.rows[0].cells);
    const idxVenc = cabeceras.findIndex(th => th.dataset.campo === "vencimiento" || normalizar(th.textContent) === "vencimiento");
    const idxEstado = cabeceras.findIndex(th => th.dataset.campo === "estado" || normalizar(th.textContent) === "estado");
    if (idxVenc < 0 || idxEstado < 0) return;

    Array.from(tabla.tBodies[0].rows).forEach(fila => {
      const e = estadoPorVencimiento(fila.cells[idxVenc].dataset.valor);
      const etiqueta = document.createElement("span");
      etiqueta.className = `estado estado--${e.clase}`;
      etiqueta.dataset.estado = e.clave;
      etiqueta.textContent = `${e.icono} ${e.texto}`;
      fila.cells[idxEstado].replaceChildren(etiqueta);
      fila.cells[idxEstado].dataset.valor = e.clave;
    });
  });
}

//Gráfico de barras (vencimientos): el ancho sale del número que muestra cada fila,
//así barra y valor nunca se contradicen
function iniciarBarras() {
  document.querySelectorAll(".tarjeta").forEach(tarjeta => {
    const filas = Array.from(tarjeta.querySelectorAll(".barras__fila"));
    if (!filas.length) return;
    const valores = filas.map(f => Number.parseInt(f.querySelector(".barras__valor").textContent, 10) || 0);
    const maximo = Math.max(...valores, 0);
    filas.forEach((fila, i) => {
      const relleno = fila.querySelector(".barras__relleno");
      if (relleno) relleno.style.width = maximo ? `${(valores[i] / maximo) * 100}%` : "0%";
    });
  });
}

//Límites de fechas y números que dependen del día de hoy (no se pueden escribir fijos en el HTML)
function iniciarLimites() {
  const hoy = new Date();
  document.querySelectorAll('input[type="date"][data-max="hoy"]').forEach(c => { c.max = aISO(hoy); });
  document.querySelectorAll("input[data-edad-minima]").forEach(c => {
    const limite = new Date(hoy.getFullYear() - Number(c.dataset.edadMinima), hoy.getMonth(), hoy.getDate());
    c.max = aISO(limite);
  });
  document.querySelectorAll("input[data-max-anio]").forEach(c => {
    c.max = String(hoy.getFullYear() + Number(c.dataset.maxAnio));
  });
}

/*Tablas*/

/* Cada barra de herramientas (.herramientas) trae data-tabla="id" que indica
   con cuál tabla trabaja. */
function iniciarTablas() {
  document.querySelectorAll(".herramientas[data-tabla]").forEach(barra => {
    const tabla = document.getElementById(barra.dataset.tabla);
    if (!tabla) return;

    const cuerpo      = tabla.tBodies[0];
    const buscador    = barra.querySelector(".buscador");
    const filtro      = barra.querySelector(".filtro");
    const btnEditar   = barra.querySelector("[data-accion=editar]");
    const btnEliminar = barra.querySelector("[data-accion=eliminar]");
    const btnExportar = barra.querySelector("[data-accion=exportar]");
    const contador    = document.querySelector(`[data-contador="${tabla.id}"]`);
    const vacio       = document.querySelector(`[data-vacio="${tabla.id}"]`);
    const cabeceras   = Array.from(tabla.tHead.rows[0].cells);

    //Columna cuyo valor se compara con el filtro de estado. Importante: en "Vehículos" hay
    //DOS etiquetas .estado por fila (Documentación y Estado); hay que mirar la columna correcta
    const idxEstado = cabeceras.findIndex(th => th.dataset.campo === "estado" || normalizar(th.textContent) === "estado");

    //Columnas que NO se buscan ni se exportan (la de "Acción": "Ver detalle", "Renovar"…)
    const columnasDeAccion = new Set(cabeceras.map((th, i) => th.dataset.exportar === "no" ? i : -1).filter(i => i >= 0));

    //Filas actuales (se vuelve a leer cada vez, porque pueden borrarse)
    const filas = () => Array.from(cuerpo.rows);
    const filaSeleccionada = () => cuerpo.querySelector("tr.seleccionada");

    const valorEstado = fila => {
      const celda = idxEstado >= 0 ? fila.cells[idxEstado] : null;
      if (!celda) return "";
      return celda.dataset.valor ?? celda.querySelector(".estado")?.dataset.estado ?? celda.textContent.trim();
    };

    //Texto de cada fila ya normalizado (se calcula una sola vez por fila: la búsqueda se
    //ejecuta en cada tecla y no tiene sentido recalcularlo).
    const cacheTexto = new WeakMap();
    const textosDe = fila => {
      if (!cacheTexto.has(fila)) {
        const celdas = Array.from(fila.cells).filter((_, i) => !columnasDeAccion.has(i)).map(c => c.textContent);
        cacheTexto.set(fila, { normal: celdas.map(normalizar).join(" "), compactas: celdas.map(compacto) });
      }
      return cacheTexto.get(fila);
    };

    //Editar y Eliminar solo tienen sentido con una fila elegida
    function actualizarBotones() {
      const hayFila = Boolean(filaSeleccionada());
      if (btnEditar)   btnEditar.disabled = !hayFila;
      if (btnEliminar) btnEliminar.disabled = !hayFila;
    }

    /*Buscar + filtrar por estado*/
    function aplicarFiltros() {
      const consulta = normalizar(buscador ? buscador.value : "");
      const consultaCompacta = compacto(buscador ? buscador.value : "");
      const estado = normalizar(filtro ? filtro.value : "");
      let visibles = 0;

      filas().forEach(fila => {
        const t = textosDe(fila);
        //Coincide por texto normal ("perez") o sin separadores ("123456789" encuentra "1.234.567.890")
        const coincideTexto = !consulta
          || t.normal.includes(consulta)
          || (consultaCompacta && t.compactas.some(c => c.includes(consultaCompacta)));
        const coincideEstado = !estado || normalizar(valorEstado(fila)) === estado;
        const mostrar = coincideTexto && coincideEstado;
        fila.hidden = !mostrar;
        if (mostrar) visibles++;
      });

      //Si la fila elegida quedó oculta por el filtro, se deselecciona: si no, Editar/Eliminar
      //actuarían sobre un registro que el usuario ya no está viendo
      const elegida = filaSeleccionada();
      if (elegida && elegida.hidden) elegida.classList.remove("seleccionada");
      actualizarBotones();

      if (contador) contador.textContent = `Mostrando ${visibles} de ${filas().length} registros`;
      if (vacio) vacio.hidden = visibles > 0;           // Mensaje "no hay datos"
    }

    let esperaBusqueda = null;
    if (buscador) buscador.addEventListener("input", () => {
      clearTimeout(esperaBusqueda);
      esperaBusqueda = setTimeout(aplicarFiltros, 120);   // no filtra en cada tecla si escribes rápido
    });
    if (filtro) filtro.addEventListener("change", aplicarFiltros);

    //Si llegas con ?estado=Vencido en la dirección (desde las tarjetas del inicio),
    //el filtro se aplica solo (Heurística 7). No distingue mayúsculas: "vigente" = "Vigente"
    const parametros = new URLSearchParams(location.search);
    const estadoUrl = parametros.get("estado");
    if (filtro && estadoUrl) {
      const opcion = Array.from(filtro.options).find(o => normalizar(o.value) === normalizar(estadoUrl));
      if (opcion) filtro.value = opcion.value;
    }
    //Lo mismo con ?q=texto (viene de los buscadores rápidos del inicio)
    const textoUrl = parametros.get("q");
    if (buscador && textoUrl) buscador.value = textoUrl;
    aplicarFiltros();

    /*Seleccionar una fila (con clic o con Enter/Espacio)*/
    //Heurística 5: Editar y Eliminar están apagados hasta elegir una fila
    function alternarSeleccion(fila) {
      const yaEstaba = fila.classList.contains("seleccionada");
      filas().forEach(f => f.classList.remove("seleccionada"));
      if (!yaEstaba) fila.classList.add("seleccionada");
      actualizarBotones();
    }
    filas().forEach(f => { f.tabIndex = 0; });           // las filas se pueden alcanzar con Tab

    cuerpo.addEventListener("click", e => {
      const fila = e.target.closest("tr");
      if (!fila || e.target.closest("a")) return;        // Los enlaces siguen su camino
      alternarSeleccion(fila);
    });
    cuerpo.addEventListener("keydown", e => {
      if ((e.key === "Enter" || e.key === " ") && e.target.tagName === "TR") {
        e.preventDefault();
        alternarSeleccion(e.target);
      }
    });

    /*Ordenar al hacer clic (o Enter/Espacio) en el encabezado*/
    //Fechas dd/mm/aaaa → aaaa-mm-dd, para que se ordenen por fecha y no por día
    const clave = texto => {
      const t = texto.trim();
      const f = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
      return f ? `${f[3]}-${f[2]}-${f[1]}` : t;
    };
    const esNumero = t => /^-?\d+(\.\d+)?$/.test(t);

    const encabezados = Array.from(tabla.tHead.querySelectorAll("th.ordenable"));
    function ordenarPor(th) {
      const columna = th.cellIndex;
      const ascendente = th.getAttribute("aria-sort") !== "ascending";
      encabezados.forEach(otro => otro.removeAttribute("aria-sort"));
      th.setAttribute("aria-sort", ascendente ? "ascending" : "descending");

      //Para ordenar usa data-valor (fecha ISO, número) si existe; si no, el texto
      const dato = fila => {
        const c = fila.cells[columna];
        return clave(c.dataset.valor ?? c.textContent);
      };
      const ordenadas = filas().sort((a, b) => {
        const x = dato(a), y = dato(b);
        const r = esNumero(x) && esNumero(y) ? Number(x) - Number(y) : x.localeCompare(y, "es", { numeric: true });
        return ascendente ? r : -r;
      });
      ordenadas.forEach(f => cuerpo.appendChild(f));     // Reubica las filas
    }
    encabezados.forEach(th => {
      th.tabIndex = 0;
      th.addEventListener("click", () => ordenarPor(th));
      th.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ordenarPor(th); }
      });
    });

    /* Eliminar (con confirmación) */
    if (btnEliminar) btnEliminar.addEventListener("click", async () => {
      const fila = filaSeleccionada();
      if (!fila) return;
      const nombre = fila.dataset.nombre || fila.cells[0].textContent.trim();
      const acepto = await confirmar(
        `¿Eliminar «${nombre}»?`,
        "Esta acción no se puede deshacer." + (btnEliminar.dataset.nota ? " " + btnEliminar.dataset.nota : ""),
        "Sí, eliminar");
      if (!acepto) return;

      /*CONECTAR CON LA BASE DE DATOS: aquí se enviaría al servidor una petición
         DELETE para el registro con id = fila.dataset.id. Solo cuando el servidor
         responda "ok" se quita la fila y se muestra el aviso (si falla: mostrarAviso(..., "error"))*/
      fila.remove();
      actualizarBotones();
      aplicarFiltros();
      mostrarAviso("Registro eliminado correctamente");
    });

    /*Editar*/
    if (btnEditar) btnEditar.addEventListener("click", () => {
      const fila = filaSeleccionada();
      if (!fila) return;

      const formulario = document.getElementById("formulario");
      if (!formulario) {
        //La página no tiene formulario: se va a la página de registro llevando el id
        //CONECTAR CON LA BASE DE DATOS: esa página usará el id para cargar los datos
        if (!btnEditar.dataset.destino) return;
        location.href = `${btnEditar.dataset.destino}?editar=${encodeURIComponent(fila.dataset.id || "")}`;
        return;
      }

      //La página SÍ tiene formulario: se copian los datos de la fila a los campos
      //Cada <th data-campo="nombre-del-input"> indica a qué campo corresponde su columna
      cabeceras.filter(th => th.dataset.campo).forEach(th => {
        const campo = formulario.elements[th.dataset.campo];
        if (!campo) return;
        const celda = fila.cells[th.cellIndex];
        let valor = celda.dataset.valor ?? celda.textContent.trim();
        if (valor === "—") valor = "";                   // "—" significa "sin dato", no es un valor

        campo.value = valor;
        if (campo.tagName === "SELECT" && campo.value !== valor) {   // Si no coincide por valor, prueba por texto
          const op = Array.from(campo.options).find(o => normalizar(o.text) === normalizar(valor));
          campo.value = op ? op.value : "";
        }
        campo.dispatchEvent(new Event("input", { bubbles: true }));  // limpia errores previos del campo
      });

      //Se recuerda qué registro se está editando: al guardar, el servidor debe ACTUALIZAR
      //(PUT con este id) y no crear uno nuevo
      formulario.dataset.editandoId = fila.dataset.id || "";
      formulario.scrollIntoView({ behavior: "smooth" });
      mostrarAviso("Datos cargados en el formulario. Modifica y pulsa Guardar.");
    });

    /*Exportar a Excel (archivo CSV que Excel abre)*/
    if (btnExportar) btnExportar.addEventListener("click", () => {
      const columnas = cabeceras
        .map((th, i) => ({ i, texto: th.textContent.trim() }))
        .filter(c => !columnasDeAccion.has(c.i));

      //Entre comillas y escapando comillas. Si el texto empieza por = + - @ Excel lo trataría
      //como una FÓRMULA (inyección de fórmulas): se le antepone ' para que sea solo texto.
      const limpiar = texto => {
        let v = String(texto).replace(/\s+/g, " ").trim();
        if (/^[=+\-@]/.test(v)) v = "'" + v;
        return `"${v.replace(/"/g, '""')}"`;
      };

      const lineas = [columnas.map(c => limpiar(c.texto)).join(";")];
      filas().filter(f => !f.hidden).forEach(f => {
        lineas.push(columnas.map(c => {
          const celda = f.cells[c.i];
          //En las columnas de estado se exporta solo el texto (sin el ícono ● ✔ ⚠)
          const etiqueta = celda.querySelector(".estado");
          return limpiar(etiqueta ? etiqueta.dataset.estado : celda.textContent);
        }).join(";"));
      });

      //"﻿" (BOM) al inicio hace que Excel muestre bien las tildes y la ñ
      const blob = new Blob(["﻿" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = (tabla.dataset.nombreArchivo || "datos") + ".csv";
      document.body.appendChild(enlace);                 // algunos navegadores exigen que esté en la página
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);  // revocar al instante puede cancelar la descarga
    });
  });
}

/*Formularios*/

/*Heurísticas 5 y 9: prevenir y explicar los errores.
   Los formularios llevan "novalidate" para mostrar los errores junto a cada campo, pero se
   sigue usando el motor de validación del navegador (checkValidity / validity) para que
   correo, número, patrón, mínimo y máximo se revisen de verdad*/

//Texto del error de un campo, o "" si el campo es válido
function mensajeDeError(campo) {
  if (campo.required && !campo.value.trim()) return "Este campo es obligatorio.";
  if (!campo.value) return "";                           // vacío y opcional: nada que revisar

  const v = campo.validity;
  if (v.typeMismatch)    return campo.type === "email" ? "Escribe un correo válido (ej: nombre@correo.com)." : "El formato no es válido.";
  if (v.patternMismatch) return campo.dataset.mensajeFormato || "El formato no es válido.";
  if (v.badInput)        return "Escribe un valor válido.";
  if (v.stepMismatch)    return "Escribe un número entero.";
  if (v.rangeUnderflow)  return `El valor mínimo es ${campo.type === "date" ? aFormatoLocal(campo.min) : campo.min}.`;
  if (v.rangeOverflow) {
    if (campo.dataset.edadMinima) return `Debe tener al menos ${campo.dataset.edadMinima} años cumplidos.`;
    if (campo.type === "date") return `La fecha no puede ser posterior al ${aFormatoLocal(campo.max)}.`;
    return `El valor máximo es ${campo.max}.`;
  }

  //Ej: la fecha de vencimiento no puede ser anterior a la de emisión.
  //(Igual que la restricción CHECK de MySQL: fechaVencimiento >= fechaEmision.)
  if (campo.dataset.despuesDe) {
    const otro = document.getElementById(campo.dataset.despuesDe);
    if (otro && otro.value && campo.value < otro.value) {
      return `No puede ser anterior a la ${textoEtiqueta(otro.id)}.`;
    }
  }

  //Campos con lista (datalist) que solo aceptan lo que está en la lista: el servidor necesita un
  //registro que exista; un texto inventado no se puede convertir en una clave foránea
  if (campo.hasAttribute("data-solo-lista")) {
    const lista = document.getElementById(campo.getAttribute("list"));
    const opciones = lista ? Array.from(lista.options).map(o => o.value) : [];
    if (!opciones.includes(campo.value)) return "Elige una opción de la lista.";
  }
  return "";
}

function textoEtiqueta(id) {
  const etiqueta = document.querySelector(`label[for="${id}"]`);
  if (!etiqueta) return id;
  const copia = etiqueta.cloneNode(true);
  copia.querySelectorAll(".obligatorio, .ayuda").forEach(n => n.remove());
  return copia.textContent.trim().toLowerCase();
}

//Punto de conexión con la base de datos. Hoy solo simula que el servidor respondió "ok"
//id = null → crear (POST). id = "7" → actualizar el registro 7 (PUT)
async function guardarEnServidor(formulario, datos, id) {
  /*CONECTAR CON LA BASE DE DATOS: por ejemplo
       const respuesta = await fetch(`/api/${formulario.dataset.recurso}${id ? "/" + id : ""}`, {
         method: id ? "PUT" : "POST",
         headers: { "Content-Type": "application/json" },
         credentials: "same-origin",
         body: JSON.stringify(datos)
       });
       if (!respuesta.ok) throw new Error(`Error ${respuesta.status}`);
       return respuesta.json();
     El servidor debe volver a validar todo: la validación de aquí es solo comodidad*/
  return { ok: true, id };
}

function iniciarFormularios() {
  document.querySelectorAll("form.formulario").forEach(formulario => {

    // Muestra un error debajo del campo
    function ponerError(campo, mensaje) {
      const caja = campo.closest(".campo");
      const error = caja && caja.querySelector(".campo__error");
      if (!error) return;
      if (!error.id) error.id = `${campo.id || campo.name}-error`;
      caja.classList.add("campo--error");
      error.textContent = mensaje;
      error.hidden = false;
      campo.setAttribute("aria-invalid", "true");        // el lector de pantalla sabe que hay un error
      campo.setAttribute("aria-describedby", error.id);  // …y dónde está el texto que lo explica
    }

    // Quita el error de un campo
    function quitarError(campo) {
      const caja = campo.closest(".campo");
      if (!caja) return;
      caja.classList.remove("campo--error");
      const error = caja.querySelector(".campo__error");
      if (error) error.hidden = true;
      campo.removeAttribute("aria-invalid");
      campo.removeAttribute("aria-describedby");
    }

    //La placa se guarda siempre como ABC-123 (mayúsculas y con guion). Sin esto, "woz214" y
    //"WOZ-214" serían dos placas distintas para la base de datos
    formulario.querySelectorAll('input[name="placa"]').forEach(campo => {
      campo.addEventListener("change", () => {
        let v = campo.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (/^[A-Z]{3}\d{3}$/.test(v)) v = `${v.slice(0, 3)}-${v.slice(3)}`;
        campo.value = v;
      });
    });

    // Al escribir en un campo, su error desaparece
    formulario.addEventListener("input", e => quitarError(e.target));

    // Al pulsar "Guardar"
    formulario.addEventListener("submit", async e => {
      e.preventDefault();                                // Evita que la página se recargue
      if (formulario.dataset.enviando) return;           // Evita guardar dos veces con doble clic

      let primerError = null;
      formulario.querySelectorAll("input, select, textarea").forEach(campo => {
        quitarError(campo);
        const mensaje = mensajeDeError(campo);
        if (mensaje) {
          ponerError(campo, mensaje);
          if (!primerError) primerError = campo;
        }
      });
      if (primerError) { primerError.focus(); return; }

      const boton = formulario.querySelector('[type="submit"]');
      formulario.dataset.enviando = "1";
      if (boton) boton.disabled = true;
      try {
        const datos = Object.fromEntries(new FormData(formulario));
        await guardarEnServidor(formulario, datos, formulario.dataset.editandoId || null);
        mostrarAviso(formulario.dataset.mensajeOk || "Guardado correctamente");
        formulario.reset();
      } catch (error) {
        console.error(error);
        mostrarAviso("No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.", "error");
      } finally {
        delete formulario.dataset.enviando;
        if (boton) boton.disabled = false;
      }
    });

    //El botón Cancelar (type="reset") también limpia los errores y sale del modo edición
    formulario.addEventListener("reset", () => {
      delete formulario.dataset.editandoId;
      formulario.querySelectorAll("input, select, textarea").forEach(quitarError);
    });
  });
}

/*Login*/

// Punto de conexión con el servidor. Devuelve true si las credenciales son correctas.
// ⚠ SOLO DEMOSTRACIÓN: usuario "admin" y contraseña "1234" quedan visibles para cualquiera que
// abra el código del navegador. En producción esta función debe hacer
//   fetch("/api/login", { method: "POST", credentials: "same-origin", body: ... })
// y el servidor debe comparar contra un HASH (bcrypt/argon2) guardado en la base de datos,
// limitar los intentos fallidos y devolver una cookie de sesión HttpOnly + Secure + SameSite.
async function autenticar(usuario, clave) {
  return usuario === "admin" && clave === "1234";
}

function iniciarLogin() {
  const formulario = document.getElementById("form-login");
  if (!formulario) return;

  const campoUsuario = document.getElementById("usuario");
  const clave = document.getElementById("clave");
  const error = document.getElementById("login-error");
  const textoError = error.textContent.trim();

  //Casilla "Mostrar contraseña": cambia el tipo del campo (Heurística 3)
  document.getElementById("ver-clave").addEventListener("change", e => {
    clave.type = e.target.checked ? "text" : "password";
  });

  //"¿Olvidaste tu contraseña?"
  const recuperar = formulario.querySelector("[data-accion=recuperar]");
  if (recuperar) recuperar.addEventListener("click", () => {
    mostrarAviso("Comunícate con el administrador para restablecer tu contraseña.");
  });

  //Al corregir, el mensaje de error desaparece
  formulario.addEventListener("input", () => { error.hidden = true; });

  formulario.addEventListener("submit", async e => {
    e.preventDefault();
    const usuario = campoUsuario.value.trim();

    if (!usuario || !clave.value) {                      // Heurística 9: dice exactamente qué falta
      error.textContent = "Escribe tu usuario y tu contraseña.";
      error.hidden = false;
      (usuario ? clave : campoUsuario).focus();
      return;
    }

    let correcto = false;
    try {
      correcto = await autenticar(usuario, clave.value);
    } catch (fallo) {
      console.error(fallo);
      error.textContent = "No se pudo conectar con el servidor. Inténtalo de nuevo.";
      error.hidden = false;
      return;
    }

    if (correcto) {
      try { sessionStorage.setItem("set_sesion", "1"); } catch (_) { /* sin storage: menu.js no bloqueará */ }
      location.replace("inicio.html");                   // replace: "Atrás" no vuelve al login
    } else {
      error.textContent = textoError;
      error.hidden = false;                              // Heurística 9
      clave.value = "";
      clave.focus();
    }
  });
}

/*ARRANQUE: cuando la página terminó de cargar, se activa todo*/
document.addEventListener("DOMContentLoaded", () => {
  iniciarLimites();
  iniciarEstadosAutomaticos();      // antes de las tablas: el filtro por estado usa estos valores
  iniciarBarras();
  iniciarTablas();
  iniciarFormularios();
  iniciarLogin();
});