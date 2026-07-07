// Pega aquí la URL del App Web publicado en Apps Script.
// Debe terminar en /exec
const API_URL = "https://script.google.com/macros/s/AKfycbymcR7JDpA9q_h2Lhao3i11lQ-2dcpjrNsSdS_Aq2apvmdcYUiiSa74VhyldlIUZMNdiQ/exec";

const OPCIONES_NUEVO_ESTADO = [
  "",
  "INOPERATIVO, NO SE PUEDE USAR",
  "UTILIZADO, EN DONDE?"
];

const OPCIONES_REPUESTO = ["", "SI", "NO"];

const OPCIONES_MESA_AYUDA = [
  "",
  "SI, YA NO FIGURA EN QUANTUM",
  "NO, PENDIENTE",
  "TODAVÍA, SE GESTIONA CON PATRIK "
];

const tableBody = document.getElementById("tableBody");
const searchInput = document.getElementById("searchInput");
const warehouseFilter = document.getElementById("warehouseFilter");
const btnGuardar = document.getElementById("btnGuardar");
const btnLimpiar = document.getElementById("btnLimpiar");
const btnDescargar = document.getElementById("btnDescargar");
const recordCount = document.getElementById("recordCount");
const pendingCount = document.getElementById("pendingCount");
const loaderOverlay = document.getElementById("loaderOverlay");
const loaderText = document.getElementById("loaderText");
const toast = document.getElementById("toast");

let inventario = [];
let inventarioFiltrado = [];
let cambiosPendientes = new Map();

function escapeHtml(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizar(texto) {
  return String(texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function showLoader(texto = "Procesando...") {
  if (loaderText) loaderText.textContent = texto;
  loaderOverlay.classList.remove("hidden");
}

function hideLoader() {
  loaderOverlay.classList.add("hidden");
}

function mostrarToast(mensaje, tipo = "ok") {
  toast.textContent = mensaje;
  toast.className = `toast ${tipo}`;
  toast.classList.remove("hidden");
  clearTimeout(mostrarToast._timer);
  mostrarToast._timer = setTimeout(() => toast.classList.add("hidden"), 2400);
}

async function apiGet(params) {
  const url = new URL(API_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { method: "GET" });
  return res.json();
}

async function apiPost(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return res.json();
}

function validarApiUrl() {
  if (!API_URL || API_URL.includes("PEGAR_AQUI")) {
    tableBody.innerHTML = `<tr><td colspan="9" class="empty-cell">Falta pegar la URL del API publicado en app.js</td></tr>`;
    return false;
  }
  return true;
}

function crearOptions(opciones, valorActual) {
  const actual = String(valorActual ?? "").trim();
  const lista = [...opciones];
  if (actual && !lista.includes(actual)) lista.push(actual);
  return lista.map(op => `<option value="${escapeHtml(op)}" ${op === actual ? "selected" : ""}>${escapeHtml(op || "Seleccionar")}</option>`).join("");
}

function llenarAlmacenes() {
  const actual = warehouseFilter.value;
  const almacenes = [...new Set(inventario.map(r => r.ALMACEN).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  warehouseFilter.innerHTML = `<option value="">Todos</option>` + almacenes.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join("");
  warehouseFilter.value = almacenes.includes(actual) ? actual : "";
}

function aplicarFiltros() {
  const q = normalizar(searchInput.value);
  const almacen = warehouseFilter.value;

  inventarioFiltrado = inventario.filter(row => {
    const coincideAlmacen = !almacen || row.ALMACEN === almacen;
    const texto = normalizar([
      row.PROPIETARIO,
      row.PART_NUMBER,
      row.DESCRIPCION,
      row.SERIE,
      row.ALMACEN,
      row.NUEVO_ESTADO,
      row.DETALLE_CASO_USO,
      row.TIENES_REPUESTO,
      row.MESA_AYUDA
    ].join(" "));
    const coincideTexto = !q || texto.includes(q);
    return coincideAlmacen && coincideTexto;
  });

  renderTabla();
}

function valorActual(row, campo) {
  const cambio = cambiosPendientes.get(String(row.rowNumber));
  if (cambio && Object.prototype.hasOwnProperty.call(cambio, campo)) return cambio[campo];
  return row[campo] ?? "";
}

function renderTabla() {
  recordCount.textContent = `${inventarioFiltrado.length} registro${inventarioFiltrado.length === 1 ? "" : "s"}`;
  actualizarPendientesUI();

  if (!inventarioFiltrado.length) {
    tableBody.innerHTML = `<tr><td colspan="9" class="empty-cell">No hay registros para mostrar.</td></tr>`;
    return;
  }

  tableBody.innerHTML = inventarioFiltrado.map(row => {
    const key = String(row.rowNumber);
    const dirty = cambiosPendientes.has(key);
    const nuevoEstado = valorActual(row, "NUEVO_ESTADO");
    const detalle = valorActual(row, "DETALLE_CASO_USO");
    const repuesto = valorActual(row, "TIENES_REPUESTO");
    const mesa = valorActual(row, "MESA_AYUDA");

    return `
      <tr data-row="${escapeHtml(key)}" class="${dirty ? "dirty-row" : ""}">
        <td title="${escapeHtml(row.PROPIETARIO)}">${escapeHtml(row.PROPIETARIO)}</td>
        <td title="${escapeHtml(row.PART_NUMBER)}">${escapeHtml(row.PART_NUMBER)}</td>
        <td title="${escapeHtml(row.DESCRIPCION)}">${escapeHtml(row.DESCRIPCION)}</td>
        <td title="${escapeHtml(row.SERIE)}">${escapeHtml(row.SERIE)}</td>
        <td title="${escapeHtml(row.ALMACEN)}">${escapeHtml(row.ALMACEN)}</td>
        <td class="editable-cell ${nuevoEstado !== (row.NUEVO_ESTADO || "") ? "changed-cell" : ""}">
          <select class="select-edit" data-field="NUEVO_ESTADO">${crearOptions(OPCIONES_NUEVO_ESTADO, nuevoEstado)}</select>
        </td>
        <td class="editable-cell ${detalle !== (row.DETALLE_CASO_USO || "") ? "changed-cell" : ""}">
          <textarea class="text-edit" data-field="DETALLE_CASO_USO" placeholder="DESCRIBA EN QUE SITIO, A DONDE FUE TRASLADADO O LA GUIA...">${escapeHtml(detalle)}</textarea>
        </td>
        <td class="editable-cell ${repuesto !== (row.TIENES_REPUESTO || "") ? "changed-cell" : ""}">
          <select class="select-edit" data-field="TIENES_REPUESTO">${crearOptions(OPCIONES_REPUESTO, repuesto)}</select>
        </td>
        <td class="editable-cell ${mesa !== (row.MESA_AYUDA || "") ? "changed-cell" : ""}">
          <select class="select-edit" data-field="MESA_AYUDA">${crearOptions(OPCIONES_MESA_AYUDA, mesa)}</select>
        </td>
      </tr>`;
  }).join("");
}

function registrarCambio(rowNumber, campo, valor) {
  const key = String(rowNumber);
  const original = inventario.find(r => String(r.rowNumber) === key);
  if (!original) return;

  const campos = ["NUEVO_ESTADO", "DETALLE_CASO_USO", "TIENES_REPUESTO", "MESA_AYUDA"];
  const cambio = cambiosPendientes.get(key) || { rowNumber: Number(rowNumber) };
  cambio[campo] = valor;

  const hayCambio = campos.some(c => {
    const nuevo = Object.prototype.hasOwnProperty.call(cambio, c) ? cambio[c] : original[c];
    return String(nuevo ?? "") !== String(original[c] ?? "");
  });

  if (hayCambio) {
    cambiosPendientes.set(key, cambio);
  } else {
    cambiosPendientes.delete(key);
  }

  actualizarPendientesUI();
  const tr = tableBody.querySelector(`tr[data-row="${CSS.escape(key)}"]`);
  if (tr) tr.classList.toggle("dirty-row", cambiosPendientes.has(key));
}

function actualizarPendientesUI() {
  const total = cambiosPendientes.size;
  if (total > 0) {
    pendingCount.textContent = `${total} cambio${total === 1 ? "" : "s"} pendiente${total === 1 ? "" : "s"}`;
    pendingCount.classList.remove("hidden");
  } else {
    pendingCount.classList.add("hidden");
  }
  btnGuardar.disabled = total === 0;
  btnLimpiar.disabled = total === 0;
}

async function cargarData() {
  if (!validarApiUrl()) return;
  try {
    showLoader("Cargando inventario...");
    const data = await apiGet({ accion: "obtenerInventario", proveedor: "HUAWEI" });
    if (!data.ok) throw new Error(data.mensaje || "No se pudo cargar el inventario");
    inventario = Array.isArray(data.registros) ? data.registros : [];
    cambiosPendientes.clear();
    llenarAlmacenes();
    aplicarFiltros();
  } catch (err) {
    console.error(err);
    tableBody.innerHTML = `<tr><td colspan="9" class="empty-cell">${escapeHtml(err.message || err)}</td></tr>`;
    mostrarToast(String(err.message || err), "error");
  } finally {
    hideLoader();
  }
}

async function guardarCambios() {
  const cambios = Array.from(cambiosPendientes.values());
  if (!cambios.length) return;

  try {
    showLoader("Guardando cambios...");
    const data = await apiPost({ accion: "guardarCambios", cambios });
    if (!data.ok) throw new Error(data.mensaje || "No se pudo guardar");

    const porFila = new Map(cambios.map(c => [String(c.rowNumber), c]));
    inventario = inventario.map(row => {
      const cambio = porFila.get(String(row.rowNumber));
      return cambio ? { ...row, ...cambio } : row;
    });
    cambiosPendientes.clear();
    aplicarFiltros();
    mostrarToast("Cambios guardados correctamente.", "ok");
  } catch (err) {
    console.error(err);
    mostrarToast(String(err.message || err), "error");
  } finally {
    hideLoader();
  }
}

function limpiarCambios() {
  if (!cambiosPendientes.size) return;
  cambiosPendientes.clear();
  renderTabla();
  mostrarToast("Cambios sin guardar limpiados.", "warn");
}

function descargarExcel() {
  const headers = [
    "PROPIETARIO",
    "PART NUMBER",
    "DESCRIPCION",
    "SERIE",
    "ALMACEN",
    "NUEVO ESTADO",
    "DETALLE DEL CASO DE USO",
    "TIENES EL REPUESTO DE LA AVERIA EN TU SITIO, PARA REPARACION?",
    "MESA DE AYUDA, YA LO REGULARIZÓ?"
  ];

  const rows = inventarioFiltrado.map(row => [
    row.PROPIETARIO,
    row.PART_NUMBER,
    row.DESCRIPCION,
    row.SERIE,
    row.ALMACEN,
    valorActual(row, "NUEVO_ESTADO"),
    valorActual(row, "DETALLE_CASO_USO"),
    valorActual(row, "TIENES_REPUESTO"),
    valorActual(row, "MESA_AYUDA")
  ]);

  const html = `
    <html><head><meta charset="UTF-8"></head><body>
    <table border="1">
      <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
    </body></html>`;

  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `regularizacion_huawei_${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

tableBody.addEventListener("change", (e) => {
  const input = e.target.closest("select, textarea");
  if (!input) return;
  const tr = input.closest("tr[data-row]");
  if (!tr) return;
  registrarCambio(tr.dataset.row, input.dataset.field, input.value);
  renderTabla();
});

tableBody.addEventListener("input", (e) => {
  const input = e.target.closest("textarea");
  if (!input) return;
  const tr = input.closest("tr[data-row]");
  if (!tr) return;
  registrarCambio(tr.dataset.row, input.dataset.field, input.value);
});

searchInput.addEventListener("input", aplicarFiltros);
warehouseFilter.addEventListener("change", aplicarFiltros);
btnGuardar.addEventListener("click", guardarCambios);
btnLimpiar.addEventListener("click", limpiarCambios);
btnDescargar.addEventListener("click", descargarExcel);

document.addEventListener("DOMContentLoaded", () => {
  btnGuardar.disabled = true;
  btnLimpiar.disabled = true;
  cargarData();
});
