# Revisión de bugs — `src/pages/admin/` (solo frontend)

> Revisión de solo lectura. Los bugs de backend ya reportados no se repiten aquí.
> Formato: ubicación, código, problema, impacto, fix.

---

## `src/pages/admin/AdminPersonal.jsx`

### BUG-1: `horasDe()` calcula horas SIN el redondeo oficial de 10 minutos — SEVERITY: High
- **Ubicación:** `src/pages/admin/AdminPersonal.jsx:19`, `:316-326`
- **Código:**
```js
import { calcularHoras, fechaHoy } from "@/lib/ucpUtils";
...
const h = calcularHoras(r.hora_entrada, r.hora_salida);
if (r.validado) validadas += h; else porValidar += h;
```
- **Problema:** La regla oficial del sistema (`src/lib/redondeo.js` → `minutosOficiales` / `src/lib/ucpUtils.js` → `sumarHorasRegistros`) redondea cada fichaje al múltiplo de 10 min más cercano. `calcularHoras()` (ucpUtils:7-14) devuelve los minutos **reales** sin redondear. AdminPersonal es la única pantalla de horas que usa `calcularHoras` para totales por persona.
- **Impacto:** El CSV exportado (`exportarCSV`, columnas "Horas validadas"/"Horas por validar") muestra totales distintos a los que muestran Validación, Dashboard, el portal del alumno y las constancias. Diferencias de hasta ±5 min por fichaje acumuladas; con 60 fichajes la discrepancia puede superar 1 hora. El admin exporta cifras que no cuadran con el resto del sistema y no hay forma de reconciliarlas.
- **Fix:** Usar `sumarHorasRegistros` / `sumarHorasPorValidar` (o `minutosOficiales(r)/60`) en `horasDe`:
```js
import { minutosOficiales } from "@/lib/redondeo";
const mins = minutosOficiales(r);
if (r.validado) validadas += mins; else porValidar += mins;   // acumular minutos
return { validadas: Math.round(validadas/60*100)/100, porValidar: ... };
```

### BUG-2: `changeRole()` no limpia `tipo_participante` ni `periodo_asignado` al dejar de ser participante — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminPersonal.jsx:182-202`
- **Código:**
```js
const patch = { role: newRole };
if (newRole !== "encargado") patch.area_encargada = "";
if (!esParticipante(newRole)) { patch.area_asignada = ""; patch.etiqueta = ""; }
await base44.entities.User.update(userId, patch);
```
- **Problema:** Al crear un participante (`crearUsuario`, líneas 150-156) se escriben `tipo_participante` y `periodo_asignado`. Al cambiar el rol a `admin`/`encargado` esos dos campos **no se borran**, aunque sí se borran `area_asignada` y `etiqueta`. Confirmado en el sitio de consumo: `AdminDashboard.jsx:39-40` cuenta `activos.filter(u => u.tipo_participante === "servicio_social")` y `components/ucp/FiltrosAlumnosAdmin.jsx:34,48` construye el filtro de "programa" a partir de `tipo_participante`.
- **Impacto:** Un encargado/admin recién promovido sigue contado como voluntario/servicio social en el Dashboard y aparece en la lista de alumnos por programa; además puede seguir apareciendo en reportes de constancias filtradas por `periodo_asignado`. La baja por "Cierre de periodo" tampoco lo toca (filtra por `esParticipante(u.role)`), así que el registro queda inconsistente de forma permanente.
- **Fix:** En el branch `!esParticipante(newRole)` agregar `patch.tipo_participante = ""; patch.periodo_asignado = "";` y espejarlo en el `setUsers` local.

### BUG-3: `archivarPeriodo()` con `Promise.all` deja la UI desincronizada si una petición falla — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminPersonal.jsx:295-314`
- **Código:**
```js
await Promise.all(afectados.map((u) => base44.entities.User.update(u.id, { archivado: 1, ... })));
setUsers((us) => us.map(...));          // solo se ejecuta si TODAS ok
...
} catch (e) { toast({ title: "Error al cerrar el periodo", ... }); }
```
- **Problema:** `Promise.all` hace *fail-fast*: si el update #3 de 40 falla, los updates 1-2 (y los que ya iban en vuelo) **sí se aplicaron en BD**, pero el `setUsers` nunca corre y no se llama a `load()`. El diálogo se queda abierto y la lista sigue mostrando a todos como activos.
- **Impacto:** Estado mixto invisible: en BD hay personas dadas de baja y en la UI aparecen activas. Si el admin reintenta, se vuelven a actualizar los ya archivados con `fecha_baja = hoy` (se pierde la fecha real de los primeros). La única forma de ver la verdad es recargar la página.
- **Fix:** Usar `Promise.allSettled`, actualizar localmente solo los `status === "fulfilled"`, reportar cuántos fallaron y llamar `load()` al final (también en el catch).

### BUG-4: Errores de carga inicial silenciados → la pantalla se ve "vacía" en vez de fallida — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminPersonal.jsx:107-128`, `:534-535`
- **Código:**
```js
} catch (e) { console.error(e); } finally { setLoading(false); }
...
{filtered.length === 0 ? (<EmptyState title="Sin personal" message="No hay registros que coincidan con el filtro." />) : ...}
```
- **Problema:** Si `User.list` falla (red/401/500) el error solo va a `console.error`, `loading` pasa a `false` y las cinco listas quedan en `[]`. No hay `toast` ni estado de error ni botón de reintento, y el render cae en la rama "Sin personal / No hay registros que coincidan con el filtro".
- **Impacto:** El admin ve una lista vacía y concluye que no hay personal; puede ponerse a crear cuentas duplicadas de personas que ya existen. Además `horasDe()` devuelve 0 para todos, así que el CSV exportado sale con horas en 0 sin ninguna advertencia.
- **Fix:** Guardar el error en estado (`setError(e)`), mostrar `toast` destructivo y renderizar un estado de error con botón "Reintentar" que vuelva a llamar `load()`; no confundir "vacío" con "falló".

### BUG-5: `detalleUser` es una foto fija del usuario; el modal `DetallePersonal` muestra datos viejos — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminPersonal.jsx:95`, `:556`, `:695`, `:868-872`
- **Código:**
```js
const [detalleUser, setDetalleUser] = useState(null);
<button onClick={() => setDetalleUser(u)} .../>
...
<DetallePersonal usuario={detalleUser} onClose={() => setDetalleUser(null)}
  onUpdated={(u) => setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, ...u } : x)))} />
```
- **Problema:** Se guarda el **objeto** del usuario en lugar de su `id`. `onUpdated` refresca `users`, pero nunca `detalleUser`, y lo mismo ocurre con `changeRole`/`changeArea`/`confirmarBaja`/`reactivar` (todas actualizan solo `users`).
- **Impacto:** Con el detalle abierto, cualquier cambio (rol, área, baja, reactivación, o una edición hecha dentro del propio modal) no se refleja en el modal: muestra el snapshot anterior. Peor, si el modal deriva su formulario de `usuario`, un segundo guardado desde el modal reescribe los campos con los valores viejos y revierte el cambio recién hecho en la tabla.
- **Fix:** Guardar solo el id (`const [detalleId, setDetalleId] = useState(null)`) y pasar `usuario={users.find(x => x.id === detalleId) ?? null}`, de modo que el modal siempre lea la copia viva de `users`.

### BUG-6: El año del reporte acepta 0/NaN sin validación — SEVERITY: Low
- **Ubicación:** `src/pages/admin/AdminPersonal.jsx:84-85`, `:504`
- **Código:**
```js
<Input type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="h-9 w-24" />
```
- **Problema:** `Number("")` es `0`, así que al borrar el campo el estado queda en `anio = 0` (y `Number("abc")`/pegado inválido → `NaN`). No hay `min`, ni validación antes de generar el PDF (`:506-513`), y el botón sigue habilitado.
- **Impacto:** Se genera y descarga un "Reporte mensual consolidado" del año 0 / NaN con todas las horas en cero y el toast dice "Reporte generado", sin ninguna señal de que el filtro era inválido.
- **Fix:** Ignorar entradas inválidas (`const v = Number(e.target.value); if (Number.isFinite(v) && v > 2000) setAnio(v);`) y deshabilitar el botón si `!anio` o está fuera de rango.

### BUG-7: `crearUsuario()` no aplica la longitud mínima de contraseña que sí exige `changePassword()` — SEVERITY: Low
- **Ubicación:** `src/pages/admin/AdminPersonal.jsx:132-136` vs `:356-360`
- **Código:**
```js
// crear
if (!nuevo.full_name.trim() || !nuevo.email.trim() || !nuevo.password) { ...return; }
// reset
if (!nuevaPwd || nuevaPwd.length < 4) { toast({ title: "Contraseña muy corta", ...}); return; }
```
- **Problema:** El placeholder del campo dice "Mínimo 4 caracteres" (`:437`) y el reset lo valida, pero la creación solo exige que no esté vacío. Tampoco se valida el formato del correo ni el duplicado contra `users` antes de llamar al API.
- **Impacto:** Se pueden crear cuentas con contraseña de 1 carácter y correos mal escritos (`"correo@"`), y el admin solo se entera cuando la persona no puede iniciar sesión.
- **Fix:** Reusar la misma validación (`nuevo.password.length < 4`), validar email con regex y avisar si `users.some(u => u.email.toLowerCase() === nuevo.email.trim().toLowerCase())`.

---

## `src/pages/admin/AdminInventario.jsx`

### BUG-8: La fecha de la salida se toma de `toISOString()` (UTC) → sale con un día de más por la tarde/noche — SEVERITY: High
- **Ubicación:** `src/pages/admin/AdminInventario.jsx:264`
- **Código:**
```js
fecha: new Date().toISOString().split("T")[0],
```
- **Problema:** `toISOString()` devuelve la fecha **UTC**. En `America/Mexico_City` (UTC-6/-5) cualquier registro hecho después de las 18:00 hora local ya es "mañana" en UTC. El proyecto ya tiene el helper correcto (`fechaHoy()` en `src/lib/ucpUtils.js:96-100`, que formatea con `timeZone: "America/Mexico_City"`) y de hecho está importado en otras pantallas. Mismo patrón repetido en:
  - `AdminElectronicos.jsx:38, 108, 118` (`fecha_recepcion` por defecto)
  - `AdminMateriales.jsx:36, 84, 94` (`fecha_recepcion` por defecto)
  - `AdminVentas.jsx:24` (`fecha`) y `:87` (`mesActual = toISOString().slice(0,7)`)
  - `AdminBonos.jsx:35` (`fecha` del bono)
  - `AdminHuellaCarbono.jsx:22` (`hoyStr()`)
  - `AdminDashboard.jsx:35, 52` (`hoy`, `hace7`), `AdminEstadisticas.jsx:48, 162`, `AdminQr.jsx:152`, `AdminValidacion.jsx:27`
- **Impacto:** Las salidas/entradas/ventas/bonos capturados de noche quedan fechados al día siguiente. Rompe: el kardex (orden y saldo por fecha), el filtro "mes actual" de Ventas y Estadísticas (un registro del 31 aparece en el mes siguiente y uno del 1 desaparece del mes en curso), la comparación `hoy` del Dashboard ("hoy" no coincide con ningún registro de la tarde) y la expiración de pases QR.
- **Fix:** Sustituir todos esos sitios por `fechaHoy()` (y `new Date().getFullYear()/getMonth()` o `Intl.DateTimeFormat` con `timeZone: "America/Mexico_City"` para el mes). Para "hace 7 días" usar aritmética sobre `fechaHoy()`/`parseFechaLocal`, no `toISOString()`.

### BUG-9: `registrarSalida()` acepta cantidad "0", negativa o mayor al stock — SEVERITY: High
- **Ubicación:** `src/pages/admin/AdminInventario.jsx:247-265`, `:523`
- **Código:**
```js
if (!formSalida.categoria || !formSalida.cantidad) { toast(...); return; }
...
cantidad: Number(formSalida.cantidad) || 1,
...
<Input type="number" value={formSalida.cantidad} onChange={(e) => setFormSalida({ ...formSalida, cantidad: e.target.value })} />
```
- **Problema:** Tres defectos encadenados: (a) el `onChange` guarda un **string**, y `!"0"` es `false`, así que la cantidad `0` pasa la validación; (b) `Number("0") || 1` la convierte en **1** (el operador `||` trata el 0 legítimo como falsy); (c) no hay `min="1"` ni cota contra el stock existente, así que `-5` se guarda tal cual (`Number("-5") || 1 === -5`).
- **Impacto:** Escribir 0 registra una salida de 1 unidad (movimiento fantasma en el kardex y en la bitácora). Escribir un negativo **aumenta** el stock (`stockPorCat` resta `salidas`). Escribir 10 000 deja el stock en negativo y dispara alertas falsas de "stock bajo" en todas las categorías. Ninguno de los tres casos muestra error.
- **Fix:** Validar con número: `const cant = Number(formSalida.cantidad); if (!Number.isFinite(cant) || cant <= 0) { toast(...); return; } if (cant > stockActual(formSalida.categoria)) { toast(...); return; }` y usar `cant` en el payload (nunca `|| 1`). Agregar `min="1"` al input.

### BUG-10: Las alertas de stock bajo ignoran las categorías personalizadas — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminInventario.jsx:245`, `:353-357`, `:365`
- **Código:**
```js
const alertas = CATEGORIAS_FLAT_BODEGA.filter((c) => stockActual(c.value) < minDe(c.value) && minDe(c.value) > 0);
```
- **Problema:** El catálogo usado para las alertas es **solo el base** (`CATEGORIAS_FLAT_BODEGA`), mientras que el resto de la pantalla usa `catsFlat = fusionarFlat(CATEGORIAS_FLAT_BODEGA, customCats)` (línea 69). El propio tab "Categorías" permite crear categorías personalizadas (`crearCategoria`, línea 76) y el diálogo de stock mínimo permite fijarles un mínimo (`guardarMinimo` itera `catsFlat`, línea 556).
- **Impacto:** Si el admin crea la categoría "Ropa y textiles", le configura un mínimo de 50 y el stock baja a 3, **nunca** aparece en el banner ámbar de alertas ni en el KPI "Alertas". La funcionalidad de stock mínimo queda rota para todo lo que no sea catálogo base, sin ningún indicio.
- **Fix:** `const alertas = catsFlat.filter(...)` (y usar `c.label` / `MEDIDA_LABEL[c.medida]`, que ya están disponibles).

### BUG-11: `stockPorCat` suma cantidades con unidades distintas (kg + unidades) en la misma categoría — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminInventario.jsx:196-211`, `:243`, `:377-388`, `:147-152`
- **Código:**
```js
const add = (cat, cant, medida) => {
  if (!mapa[cat]) mapa[cat] = { entradas: 0, salidas: 0, medida: medida || "unidades" };
  mapa[cat].entradas += Number(cant) || 0;      // ignora la unidad
};
materiales.forEach((m) => add(m.categoria, m.cantidad, m.medida));
electronicos.forEach((m) => add(m.categoria, m.cantidad, m.medida));
```
- **Problema:** La unidad se guarda **una sola vez** (la del primer movimiento) y después se suman cantidades sin importar su `medida`. La unidad es por registro, no por categoría: `AdminElectronicos.jsx:182` escribe `medida: l.tipo_registro === "procesado" ? "kg" : "unidades"` para la misma `categoria`, y `AdminMateriales` hace lo propio.
- **Impacto:** "Stock actual por categoría" muestra `5 kg + 12 unidades = 17 kg` (la etiqueta sale de la primera fila encontrada). El mismo número falso se exporta en el CSV (`cantidad: v.entradas - v.salidas`) y alimenta las alertas de stock mínimo, que comparan un mínimo en kg contra un total mezclado.
- **Fix:** Agrupar por `categoria + medida` (`mapa[cat + "|" + medida]`) y renderizar/exportar una fila por par, o normalizar a kg usando `peso_estimado` cuando las unidades coexistan.

### BUG-12: Los diálogos de "Registrar salida" y "Stock mínimo" reabren con los datos de la sesión anterior — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminInventario.jsx:337`, `:340`, `:395`, `:404`, `:540`, `:565`
- **Código:**
```js
<Button ... onClick={() => setDialogMin(true)}>Stock mínimo</Button>       // no resetea formMin
<Button onClick={() => setDialogSalida(true)} ...>Registrar salida</Button> // no resetea formSalida
...
<Button variant="outline" onClick={() => setDialogSalida(false)} ...>Cancelar</Button>  // no resetea
```
- **Problema:** Solo los accesos rápidos de la fila (`:395`, `:404`) inicializan el formulario. Los botones de cabecera abren el diálogo con el estado anterior, y "Cancelar" (o cerrar con ESC/`onOpenChange`) tampoco lo limpia. `formSalida` solo se reinicia dentro del camino exitoso de `registrarSalida` (`:269`).
- **Impacto:** Secuencia real: el admin pulsa el engrane de la fila "Cobre" (pre-llena `formMin={categoria:'cobre', cantidad_minima:0}`), cancela, y luego abre "Stock mínimo" desde la cabecera para configurar "Cartón" → el diálogo aparece con **Cobre** preseleccionado; si solo teclea el número y guarda, sobrescribe el mínimo de Cobre. Con la salida pasa igual: se puede registrar una salida de una categoría que ya no se ve en pantalla (el select muestra la categoría vieja) y con el motivo/retirado_por de la operación cancelada.
- **Fix:** Resetear al abrir y al cerrar: `onClick={() => { setFormSalida({categoria:"",cantidad:1,area:"",motivo:"",retirado_por:""}); setDialogSalida(true); }}` y lo mismo para `formMin`; en `onOpenChange`, si `v === false` limpiar el form.

### BUG-13: Los permisos dependen de un `perfil` asíncrono sin estado de carga → ventana con controles indebidos — SEVERITY: Low
- **Ubicación:** `src/pages/admin/AdminInventario.jsx:44`, `:58-60`, `:168-170`, `:317`, `:336-344`, `:450`
- **Código:**
```js
const [perfil, setPerfil] = useState(null);
useEffect(() => { base44.auth.me().then(setPerfil).catch(() => {}); }, []);
const esAdmin = perfil?.role === "admin";
const esEncargadoBodega = perfil?.role === "encargado" && esAreaBodega(perfil?.area_encargada);
```
- **Problema:** Mientras `me()` no resuelve, `perfil` es `null` y por tanto `esEncargadoBodega === false`. Los filtros de tabs (`!(t.noEncargadoBodega && esEncargadoBodega)`) y los botones `!esEncargadoBodega` se evalúan como si el usuario tuviera permisos completos. Además el `.catch(() => {})` deja `perfil` en `null` para siempre si `me()` falla.
- **Impacto:** Un encargado de bodega ve la pestaña **Ventas** y el botón **Registrar salida** durante el arranque (y de forma permanente si `me()` falla); si hace clic en ese instante monta `<AdminVentas embedded />` y puede capturar una venta que no le corresponde. En el lado opuesto, el admin ve desaparecer/reaparecer la pestaña "Categorías" y los botones de borrar en cada render inicial.
- **Fix:** Esperar el perfil antes de renderizar los controles sensibles (`if (perfil === undefined) return <ListaSkeleton/>`, usando `undefined` como "cargando" y `null` como "falló"), y mostrar un error explícito si `me()` falla.

### BUG-14: `perfil.id` sin encadenado opcional en los tres formularios de escritura — SEVERITY: Low
- **Ubicación:** `src/pages/admin/AdminInventario.jsx:90`, `:262-263`, `:291`
- **Código:**
```js
creado_por: perfil.id,                 // crearCategoria
registrado_por: perfil.id, registrado_por_nombre: nombreUsuario(perfil),   // registrarSalida
configurado_por: perfil.id,            // guardarMinimo
```
- **Problema:** En el resto del archivo se usa `perfil?.role` porque `perfil` puede ser `null` (estado inicial y catch vacío de `:169`). Estos tres accesos no lo contemplan.
- **Impacto:** Si `me()` aún no resolvió (o falló), el `TypeError: Cannot read properties of null` se traga el `catch` genérico y el usuario recibe "Error al crear" / "Error al registrar" / "Error al guardar" sin causa real; la operación no se registra y el formulario no se limpia, invitando a reintentar en bucle.
- **Fix:** `creado_por: perfil?.id ?? null` (o bloquear los botones mientras `!perfil`) y validar `perfil` antes de abrir el diálogo.

---

## `src/pages/admin/AdminElectronicos.jsx`

### BUG-15: Doble `actualizarLinea()` en el mismo handler: se pierde `reparado_por` (solo sobrevive el nombre) — SEVERITY: High
- **Ubicación:** `src/pages/admin/AdminElectronicos.jsx:96-98`, `:328-332` (móvil) y `:376-380` (escritorio)
- **Código:**
```js
const actualizarLinea = (idx, campo, valor) => {
  setLineas(lineas.map((l, i) => (i === idx ? { ...l, [campo]: valor } : l)));
};
...
onChange={(e) => {
  const est = estudiantes.find((s) => s.id === e.target.value);
  actualizarLinea(idx, "reparado_por", e.target.value);
  actualizarLinea(idx, "reparado_por_nombre", est ? (est.nombre_completo || est.full_name || "") : "");
}}
```
- **Problema:** `actualizarLinea` no usa actualización funcional (`setLineas(prev => ...)`), cierra sobre el `lineas` del render actual. Las dos llamadas del mismo handler parten del **mismo snapshot**, y React aplica la última: el estado final es `lineas` viejo con únicamente `reparado_por_nombre` cambiado. El `reparado_por` (id) escrito por la primera llamada se descarta.
- **Impacto:** Al elegir "Reparado por": el `<select>` vuelve a mostrar "Sin asignar" (su `value` es `l.reparado_por`, que quedó `""`), el payload guarda `reparado_por: null` (`:186`) pero sí `reparado_por_nombre`, y el ticket de revisión muestra "⚒ Reparado por Juan" mientras la BD queda sin el id. Todo reporte/consulta que enlace por `reparado_por` pierde la reparación; además el usuario cree que no se guardó y vuelve a elegir, repitiendo el fallo.
- **Fix:** Una sola actualización con patch: `actualizarSelector(idx, { reparado_por: e.target.value, reparado_por_nombre: est ? (est.nombre_completo || est.full_name || "") : "" })`, o hacer `actualizarLinea` funcional (`setLineas(prev => prev.map(...))`).

### BUG-16: `key={idx}` en filas que se insertan/eliminan por en medio corrompe el estado interno de `SelectorElectronico` — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminElectronicos.jsx:293`, `:356` (keys), `:112-125` (`insertLinea` / `quitarLinea`)
- **Código:**
```js
{lineas.map((l, idx) => (<tr key={idx} ...>))}
...
const quitarLinea = (idx) => setLineas(lineas.length > 1 ? lineas.filter((_, i) => i !== idx) : lineas);
```
- **Problema:** Las filas se identifican por posición, pero `insertLinea` splica en medio y `quitarLinea` elimina del medio. `SelectorElectronico` (componente hijo) mantiene estado propio no derivado de props: `useState(false)` para `customCat`, `customSub`, `customMat` (`src/components/ucp/SelectorElectronico.jsx:26-28`). Al borrar la fila 0, la instancia que estaba en `key=0` se reutiliza para los datos de la antigua fila 1.
- **Impacto:** Los campos de "categoría/subcategoría/material personalizada" quedan activados (o desactivados) en la fila equivocada: la fila que hereda el flag muestra un input libre con el valor del catálogo de otra fila, y la que tenía texto libre vuelve a mostrar el desplegable. El admin guarda una línea con `categoria`/`material` que no corresponde a lo que ve, y el foco/scroll salta de fila al borrar.
- **Fix:** Dar identidad estable a cada línea (`id: crypto.randomUUID()` en `nuevaLinea()`) y usar `key={l.id}` en ambas vistas.

### BUG-17: Borrado de registros de bodega sin confirmación — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminElectronicos.jsx:201-209`, `:479`
- **Código:**
```js
const handleDelete = async (id) => {
  try { await base44.entities.Electronicos_Reciclados.delete(id); toast({ title: "Registro eliminado" }); cargar(); }
  ...
<button onClick={() => handleDelete(m.id)} className="..."><Trash2 .../></button>
```
- **Problema:** El clic borra de inmediato, sin `confirmarGlobal`. La utilidad está importada en el archivo (línea 15) y se usa para los duplicados (`:160`), y el equivalente de salidas en `AdminInventario.eliminarSalida` (`:110-123`) sí pide confirmación con detalle del registro.
- **Impacto:** Un clic accidental en una lista densa y scrolleable (`max-h-[460px] overflow-y-auto`) destruye permanentemente una entrada de bodega con su folio ENT. No hay papelera ni bitácora de este borrado (a diferencia de las salidas), y el stock/kardex cambia sin dejar rastro de quién lo hizo.
- **Fix:** Envolver en `confirmarGlobal({ titulo: "¿Eliminar este registro?", descripcion: `${m.folio} · ${labelCategoria(m.categoria)} · ${m.cantidad}`, destructivo: true, textoConfirmar: "Eliminar" })` y registrar bitácora.

### BUG-18: El lote se guarda con cantidades inválidas (`0` → 1, negativos, texto) — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminElectronicos.jsx:127-131`, `:183`, `:225-228`, `:242-244`
- **Código:**
```js
const filaValida = (l) => {
  if (!l.proveedor || !l.categoria || !l.fecha_recepcion) return false;
  if (l.tipo_registro === "articulo" && (!l.subcategoria || !l.material)) return false;
  return true;                       // nunca mira l.cantidad
};
...
cantidad: Number(l.cantidad) || 1,
```
- **Problema:** `filaValida` no revisa `cantidad`. Luego `Number(l.cantidad) || 1` convierte `0`, `""` y `NaN` en **1**, y deja pasar negativos (`Number("-3") || 1 === -3`).
- **Impacto:** Un kg en 0 se registra como 1 kg; un negativo resta peso y puede volver negativos los KPI "Peso procesado (kg)" y "Artículos (u)" (`:225-226`, `:242-243`), el total "Cobre + aluminio + hierro" (`:260`) y el reporte PDF mensual. Como el ticket de revisión muestra `l.cantidad` crudo (`:417`) y el payload guarda otro valor, lo que se confirma no es lo que se guarda.
- **Fix:** Incluir `Number(l.cantidad) > 0` en `filaValida`, usar `Number(l.cantidad)` sin `|| 1`, y poner `min="0.01"` en el input de cantidad de `SelectorElectronico`.

### BUG-19: Fallo del `bulkCreate` deja la lista sin recargar (y sin aviso de creación parcial) — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminElectronicos.jsx:189-198`
- **Código:**
```js
await base44.entities.Electronicos_Reciclados.bulkCreate(payload);
toast(...); setTicket(null); setLineas([nuevaLinea()]); cargar();
} catch { toast({ title: "Error al registrar", variant: "destructive" }); }
```
- **Problema:** `cargar()` y la limpieza del ticket solo ocurren en el camino feliz. El catch no refresca la lista, no cierra el ticket y no limpia `lineas`. Además `bulkCreate` de un lote no es atómico en el backend, así que un fallo a mitad del lote sí insertó filas.
- **Impacto:** Tras el error, la tabla sigue sin los registros que sí se crearon; el ticket permanece abierto con el botón "Confirmar registro" habilitado en cuanto `saving` vuelve a `false`, de modo que el segundo clic **duplica** todo el lote (el aviso de duplicados de `handleSubmit` no corre porque ya no pasa por ahí). El admin tampoco sabe cuántas filas sí entraron.
- **Fix:** Llamar `cargar()` también en el `catch` (o en un `finally`), mantener `saving`/deshabilitar el botón de confirmar y mostrar cuántas filas se pudieron guardar.

### BUG-20: Año del reporte sin validación y generación sin manejo de errores — SEVERITY: Low
- **Ubicación:** `src/pages/admin/AdminElectronicos.jsx:59`, `:211-214`, `:276`, `:278`
- **Código:**
```js
const generarReporte = () => generarReporteBodega({ ..., mes: mesReporte, anio: anioReporte });
<Input type="number" className="w-28" value={anioReporte} onChange={(e) => setAnioReporte(Number(e.target.value))} />
<Button onClick={generarReporte}>Generar reporte mensual PDF</Button>
```
- **Problema:** Igual que en AdminPersonal: vaciar el input deja `anioReporte = 0`. Además el botón no tiene `disabled`, ni estado "generando", ni `try/catch`: si `generarReporteBodega` lanza (jsPDF/datos nulos) la promesa queda rechazada sin feedback.
- **Impacto:** Se descarga un PDF de un mes/año inexistente con todos los totales en 0, o bien no pasa absolutamente nada al hacer clic y el usuario pulsa repetidamente generando varios PDF.
- **Fix:** Validar `anioReporte` (rango 2000-año+1) antes de generar, deshabilitar el botón mientras se genera y envolver la llamada en `try/catch` con toast destructivo.

---

## `src/pages/admin/AdminMateriales.jsx`

> Archivo casi clon de `AdminElectronicos.jsx`; hereda los mismos defectos (ver BUG-16 a BUG-20). Aquí se documentan los que tienen línea propia y los que **no** son idénticos.

### BUG-21: `key={idx}` + `SelectorElectronico` con estado interno (mismo defecto que BUG-16) — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminMateriales.jsx:267`, `:313`, `:88-101`, `:294`, `:324`
- **Código:**
```js
{lineas.map((l, idx) => (<tr key={idx} ...>))}
<SelectorElectronico value={l} onChange={(patch) => actualizarSelector(idx, patch)} categorias={CATEGORIAS_ELECTRONICOS} materialesPeso={MATERIALES_PESO_BODEGA} />
```
- **Problema:** Idéntico a BUG-16: `insertLinea` hace `splice` y `quitarLinea` filtra por índice, mientras la key es la posición. `SelectorElectronico` guarda `customCat/customSub/customMat` en `useState` (componente hijo, `SelectorElectronico.jsx:26-28`).
- **Impacto:** Al borrar/insertar una fila intermedia, los flags "Otro (escribir)" quedan pegados a la fila equivocada: una línea que tenía material de catálogo aparece con input libre (y viceversa), y el valor libre escrito se asocia a otro material distinto al visible. Se guarda en BD una recepción que no coincide con lo que el admin creyó capturar.
- **Fix:** Identificador estable por línea (`id: crypto.randomUUID()` en `nuevaLinea()`) y `key={l.id}`.

### BUG-22: Borrado de recepción de bodega sin confirmación ni bitácora — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminMateriales.jsx:175-183`, `:420`
- **Código:**
```js
const handleDelete = async (id) => {
  try { await base44.entities.Materiales_Recibidos.delete(id); toast({ title: "Registro eliminado" }); cargar(); }
<button onClick={() => handleDelete(m.id)} ...><Trash2 .../></button>
```
- **Problema:** Un clic borra el registro definitivo. `confirmarGlobal` está importado (línea 15) y se usa para duplicados, pero no aquí. Tampoco se llama `registrarBitacora`, aunque el resto de movimientos de inventario sí lo hace (`AdminInventario.jsx:92, 266, 294`).
- **Impacto:** Pérdida irreversible de una entrada con folio ENT por un clic accidental en una lista scrolleable; el stock y el kardex cambian sin dejar rastro de auditoría (quién borró qué y cuándo).
- **Fix:** Pedir `confirmarGlobal` con folio/categoría/cantidad y registrar el borrado en la bitácora.

### BUG-23: Cantidad no validada: `0` se guarda como `1` y los negativos pasan — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminMateriales.jsx:103-107`, `:160`, `:199-202`
- **Código:**
```js
const filaValida = (l) => { if (!l.proveedor || !l.categoria || !l.fecha_recepcion) return false; ... return true; };
cantidad: Number(l.cantidad) || 1,
```
- **Problema:** `filaValida` nunca inspecciona `cantidad`; `Number(x) || 1` convierte `0`, `""` y `NaN` en `1` (falsy-zero) y deja pasar `-3`.
- **Impacto:** "Peso procesado (kg)", "Artículos (u)", "Material crudo extraído" y "Plástico triturado" (líneas 199-202, 234-238, 441, 457) se inflan o se vuelven negativos; el PDF mensual de bodega y el stock de AdminInventario arrastran la cifra falsa. El ticket de revisión muestra `l.cantidad` crudo (`:360`) y la BD guarda otro número.
- **Fix:** Exigir `Number(l.cantidad) > 0` en `filaValida` y usar el número validado en el payload.

### BUG-24: Fallo del `bulkCreate` no recarga la lista y deja el ticket abierto → reintento duplica el lote — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminMateriales.jsx:163-172`, `:348-373`
- **Código:**
```js
await base44.entities.Materiales_Recibidos.bulkCreate(registros);
toast(...); setTicket(null); setLineas([nuevaLinea()]); cargar();
} catch { toast({ title: "Error al registrar materiales", variant: "destructive" }); }
finally { setSaving(false); }
```
- **Problema:** En el error no se llama `cargar()`, no se cierra el ticket ni se limpia `lineas`. `saving` vuelve a `false` y el botón "Confirmar registro" queda otra vez habilitado, pero el reintento **no** vuelve a pasar por `handleSubmit`, así que el aviso de duplicados no se evalúa.
- **Impacto:** Si el backend creó parte del lote antes de fallar, la tabla no lo muestra y el segundo clic vuelve a enviar las mismas N filas → entradas duplicadas con folios ENT distintos, sin ninguna advertencia.
- **Fix:** `cargar()` en `finally`, cerrar el ticket solo con confirmación explícita y volver a ejecutar la detección de duplicados antes de reenviar.

### BUG-25: La detección de duplicados no compara las filas del propio lote entre sí — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminMateriales.jsx:126-142` (y `AdminElectronicos.jsx:150-166`)
- **Código:**
```js
const dups = validas.filter((l) =>
  materiales.some((m) => (m.proveedor||"").trim().toLowerCase() === l.proveedor.trim().toLowerCase() && m.categoria === l.categoria && ...));
```
- **Problema:** `dups` solo cruza las filas nuevas contra `materiales` (lo ya existente en BD). Dos filas **idénticas dentro del mismo ticket** no se detectan; además la comparación ignora `subcategoria` y `cantidad`, y usa el snapshot de `materiales` cargado al montar (no se refresca antes de validar, pese a `useRecargarAlVolver`).
- **Impacto:** `agregarLinea`/`insertLinea` copian proveedor, fecha y tipo de la fila anterior; basta con repetir el material para enviar el mismo registro dos veces sin ningún aviso, duplicando stock y folios. Si otro admin registró algo mientras tanto, el aviso tampoco salta.
- **Fix:** Detectar también duplicados internos (`validas` vs `validas` con índice menor), incluir `subcategoria` en la clave de comparación y recargar `materiales` justo antes de validar.

---

## `src/pages/admin/AdminValidacion.jsx`

### BUG-26: Comparador de `sort` inválido (nunca devuelve 0) y mutación del array memoizado durante el render — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminValidacion.jsx:276`
- **Código:**
```js
{u.registros.sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).map((r) => { ... })}
```
- **Problema:** Dos defectos: (a) el comparador solo devuelve `1` o `-1`, nunca `0`, y es inconsistente (`compare(a,b)` y `compare(b,a)` devuelven lo mismo cuando las fechas son iguales), lo que viola el contrato de `Array.prototype.sort` y produce órdenes dependientes de la implementación/estado previo; (b) `sort` muta **in place** `u.registros`, que es el mismo array guardado dentro del resultado de `useMemo` (`porUsuario`, línea 73) — se está mutando estado derivado durante el render, y `fecha` puede ser `"YYYY-MM-DD"` o `"YYYY-MM-DD HH:MM:SS"`, por lo que la comparación lexicográfica mezcla granularidades.
- **Impacto:** Dos fichajes del mismo día pueden aparecer en orden distinto en cada render (o tras validar uno, que dispara `cargar()`), y el memo queda con el array reordenado, así que cualquier otro consumidor de `porUsuario` (KPIs, totales) trabaja sobre un orden que ya no corresponde al de la fuente. En la práctica la lista "baila" al validar/quitar fichajes.
- **Fix:** `[...u.registros].sort((a,b) => String(b.fecha).localeCompare(String(a.fecha)))` (copia + comparador numérico/`localeCompare` consistente).

### BUG-27: Los fichajes de personas archivadas se muestran como "—" (justo después de "Cerrar periodo") — SEVERITY: High
- **Ubicación:** `src/pages/admin/AdminValidacion.jsx:48`, `:60-63`, `:66-97`, `:221-224`
- **Código:**
```js
setUsuarios(us.filter((u) => !u.archivado));
...
const nombreDe = (id) => { const u = usuarios.find((x) => x.id === id); return u?.nombre_completo || u?.full_name || u?.email || "—"; };
```
- **Problema:** `registros` no se filtra por usuario, pero el diccionario de nombres sí excluye a los archivados. Todo fichaje cuyo autor fue dado de baja cae en `"—"`. `AdminPersonal.archivarPeriodo` (líneas 295-314) archiva **en lote** a todos los participantes de un periodo, y `confirmarBaja` archiva individuales.
- **Impacto:** Al cerrar un periodo (el momento exacto en que hay que validar y acreditar las horas finales), la pantalla de Validación muestra decenas de tarjetas idénticas llamadas "—", con avatar "?" y todas ordenadas juntas por `localeCompare` de la misma cadena. El admin no puede identificar a quién valida ni a quién acredita el residuo, y puede validar/acreditar minutos a la persona equivocada. También `dialogAjuste.nombre` queda en "—" en el diálogo de ajuste manual.
- **Fix:** Cargar los usuarios **sin** filtrar archivados para resolver nombres (`setUsuarios(us)`) y usar la lista filtrada solo donde se necesite excluir bajas; mostrar además un badge "(baja)" cuando `u.archivado`.

### BUG-28: `validarTodos()` es un bucle secuencial con un solo `catch`: fallo parcial invisible y lista sin refrescar — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminValidacion.jsx:112-122`
- **Código:**
```js
setGuardando(true);
try {
  for (const r of u.pendientes) { await base44.entities.Registros_QR.update(r.id, { validado: 1, validado_por: user.id }); }
  toast(...); cargar();
} catch (e) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
finally { setGuardando(false); }
```
- **Problema:** Al primer error se aborta el bucle, los updates anteriores **ya se aplicaron** en BD y `cargar()` nunca se ejecuta (está dentro del `try`). No se informa cuántos se validaron ni cuáles fallaron. El botón "Acreditar residuo" del mismo bloque sí depende de `porUsuario`, que se calcula sobre `registros` **sin refrescar**.
- **Impacto:** La UI sigue mostrando "N por validar" cuando en realidad ya se validaron N-k. El admin vuelve a pulsar "Validar todos" y se re-procesan los ya validados; peor, el `residuo`/`pendiente` que se acredita a continuación se calcula con datos viejos, así que `Ajustes_Horas` recibe minutos incorrectos (y al recargar aparecen duplicados).
- **Fix:** `Promise.allSettled`, contar éxitos/fallos, `cargar()` en `finally` y deshabilitar las acciones del usuario hasta terminar el refresco.

### BUG-29: El formulario de ajuste de fichaje no valida las horas y puede reescribir datos más nuevos — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminValidacion.jsx:303`, `:124-140`, `:316-320`
- **Código:**
```js
onClick={() => setEditando({ id: r.id, usuario: r.usuario, fecha: r.fecha, hora_entrada: r.hora_entrada, hora_salida: r.hora_salida || "", comentario_admin: r.comentario_admin || "" })}
...
await base44.entities.Registros_QR.update(editando.id, {
  hora_entrada: editando.hora_entrada, hora_salida: editando.hora_salida,
  comentario_admin: editando.comentario_admin || "", modificado_por: user.id });
```
- **Problema:** No hay ninguna validación antes de guardar: se acepta `hora_salida` vacía, `hora_entrada` vacía, formato inválido y `salida < entrada`. `minutosRegistro` (`src/lib/redondeo.js:10-18`) suma 24 h cuando el resultado es negativo, de modo que un error de captura se convierte en un fichaje de 14-24 h sin aviso. Además `editando` es una **foto** del registro: si `cargar()` corre mientras el formulario está abierto (lo dispara cualquier "Validar"/"Validar todos"/`useRecargarAlVolver`), el guardado pisa con valores anteriores los cambios que otro admin ya hizo. Tampoco se avisa si el registro ya estaba `validado`.
- **Impacto:** Horas infladas decenas de horas por un typo (queda en la constancia y en el reporte mensual), o fichajes con salida vacía que pasan a contar 0 h. En el caso concurrente, se revierten silenciosamente horas ya corregidas, con `modificado_por` del último que guardó.
- **Fix:** Validar `hora_entrada && hora_salida && hora_salida > hora_entrada` (o pedir confirmación explícita de "cruce de medianoche"), rechazar el guardado si el registro cambió desde que se abrió el formulario (comparar contra `registros.find(r => r.id === editando.id)`) y avisar si `validado === 1`.

### BUG-30: `validar()` no tiene estado pendiente ni deshabilita el botón; dos `cargar()` en vuelo pueden sobrescribirse — SEVERITY: Low
- **Ubicación:** `src/pages/admin/AdminValidacion.jsx:102-110`, `:297`, `:300`
- **Código:**
```js
const validar = async (r, valor) => {
  try { await base44.entities.Registros_QR.update(r.id, valor ? { validado: 1, ... } : { validado: 0, ... }); toast(...); cargar(); }
...
<Button size="sm" variant="outline" ... onClick={() => validar(r, true)}>Validar</Button>
```
- **Problema:** El botón no se deshabilita mientras la petición está en vuelo (no usa `guardando`, a diferencia de `validarTodos`/`guardarEdicion`). Cada clic lanza `update` + `cargar()`; `cargar()` vuelve a poner `loading = true`, lo que desmonta toda la pantalla (`:188`). Dos `cargar()` concurrentes resuelven en orden arbitrario y el último en llegar pisa el estado.
- **Impacto:** Doble clic = dos updates y dos recargas completas; la pantalla parpadea a skeleton en cada validación y puede quedar mostrando el resultado de la petición más antigua (fichaje que vuelve a aparecer como "por validar").
- **Fix:** Poner `disabled={guardando || validandoId === r.id}` con un estado por registro, y no reiniciar `loading` completo en refrescos posteriores al inicial (o usar una bandera `refetching` que no desmonte la vista).

---

## `src/pages/admin/AdminEstadisticas.jsx`

### BUG-31: Todas las estadísticas de horas usan `calcularHoras` (minutos reales) en lugar del redondeo oficial — SEVERITY: High
- **Ubicación:** `src/pages/admin/AdminEstadisticas.jsx:10`, `:52`, `:163`
- **Código:**
```js
import { calcularHoras, aMinutos, nombreUsuario } from "@/lib/ucpUtils";
const h = calcularHoras(r.hora_entrada, r.hora_salida) || 0;   // :52
porSemana[clave] = (porSemana[clave] || 0) + (calcularHoras(r.hora_entrada, r.hora_salida) || 0);  // :163
```
- **Problema:** Mismo defecto raíz que BUG-1 pero en el panel de estadísticas: `h` alimenta `horasPorUsuario`, `porValidarPorUsuario`, `horasMesPorUsuario`, `horasFacultad`, `kpisPersona`, `cuadroHonor`, `cohorteBuckets` y `tendenciaSemanal`. La regla oficial del sistema es `minutosOficiales` (múltiplo de 10 min), que es lo que usa `AdminValidacion.jsx:78-79, 94` para "Horas del mes".
- **Impacto:** "Horas acumuladas", "Horas por facultad", el "Cuadro de honor", el "% de meta" de la cohorte y la tendencia semanal no cuadran con Validación ni con las constancias. Como el porcentaje de cohorte (`:149`) decide en qué bucket cae cada alumno, un alumno con 479.4 h reales y 480 h oficiales aparece en "> 75%" en una pantalla y en otro bucket en la otra.
- **Fix:** Importar `minutosOficiales` de `@/lib/redondeo` y acumular minutos (`mins += minutosOficiales(r)`), convirtiendo a horas solo al final (`mins/60`).

### BUG-32: KPIs "acumulados" calculados sobre los últimos 500 registros de cada tabla — SEVERITY: High
- **Ubicación:** `src/pages/admin/AdminEstadisticas.jsx:26-37`, `:176-177`
- **Código:**
```js
base44.entities.Registros_QR.list("-fecha", 500),
base44.entities.Bonos.list("-created_date", 500),
base44.entities.Evidencias.list("-created_date", 500),
base44.entities.Asignaciones.list("-created_date", 500),
base44.entities.Materiales_Recibidos.list("-fecha_recepcion", 500),
...
totalHoras: Math.round(Object.values(horasPorUsuario).reduce((a, b) => a + b, 0) * 100) / 100,
```
- **Problema:** Las consultas están ordenadas de más reciente a más antiguo y topadas a 500 filas, pero los indicadores que se calculan con ellas son **acumulados de todo el tiempo** ("Horas acumuladas", "por facultad", "desempeño por persona", "Top donantes", CO2e total). Con 30 alumnos fichando 2 veces por semana, 500 fichajes se alcanzan en ~2 meses. `AdminPersonal.jsx:111` pide 1000 registros y `AdminHuellaCarbono.jsx:48-49` pide 1000, así que ni siquiera las pantallas usan el mismo universo.
- **Impacto:** Las horas acumuladas dejan de crecer y empiezan a **bajar** conforme pasa el tiempo (los fichajes viejos salen de la ventana de 500); "Horas acumuladas por facultad" y el desempeño por persona se refieren solo a los últimos meses sin decirlo en ninguna parte; el total de CO2e del "Top donantes" no coincide con la pantalla de Huella de carbono (que sí carga 1000). Decisiones de fin de periodo tomadas con cifras truncadas.
- **Fix:** Pedir los datos por periodo explícito (filtro servidor por rango de fechas) o agregar en el backend; si se mantiene el cliente, usar el mismo límite en todas las pantallas y mostrar la fecha de inicio real del universo ("desde el registro N"), nunca etiquetarlo como "acumulado".

### BUG-33: `totalHoras`/`totalPorValidar` suman usuarios que las tablas no muestran (encargados, admins y dados de baja) — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminEstadisticas.jsx:41`, `:50-68`, `:72-75`, `:81`, `:106`, `:176-177`, `:209`, `:310`
- **Código:**
```js
const alumnos = users.filter(u => esParticipante(u.role));
regs.forEach(r => { ... horasPorUsuario[r.usuario] = (horasPorUsuario[r.usuario] || 0) + h; });   // sin filtrar por alumno
totalHoras: Math.round(Object.values(horasPorUsuario).reduce((a, b) => a + b, 0) * 100) / 100,
```
- **Problema:** Los mapas `horasPorUsuario`/`porValidarPorUsuario` se llenan con **cualquier** `r.usuario` (incluidos encargados, admins y usuarios ya eliminados/archivados), mientras que `horasFacultad`, `kpisPersona`, `cuadroHonor` y `cohorte` solo recorren `alumnos`. Además `alumnos` no filtra `u.archivado` (sí lo hace `activos` en `:81`), así que "Alumnos totales" y la tabla de desempeño incluyen a quienes ya fueron dados de baja.
- **Impacto:** El KPI "Horas acumuladas" es mayor que la suma de la columna "H. validadas" de la tabla de desempeño, y `data.totalPorValidar` del subtítulo (`:310`) no coincide con la suma de "Por validar". La diferencia no es explicable para el admin (horas de encargados y de bajas). "Alumnos totales" infla el padrón con personal archivado.
- **Fix:** Acumular solo para ids presentes en un `Set` de alumnos activos (`alumnosActivos`), o bien etiquetar los KPIs como "todo el personal" y añadir la columna faltante; filtrar `!u.archivado` en `alumnos` para el padrón.

### BUG-34: El CO2e del "Top donantes" se calcula sin categorías personalizadas ni pesos manuales — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminEstadisticas.jsx:12`, `:128-132` vs `src/pages/admin/AdminHuellaCarbono.jsx:75`
- **Código:**
```js
const huella = calcularHuella(mats, elecs);          // Estadísticas: 2 argumentos
...
return calcularHuella(mat, elec, customCats, pesosManual);   // Huella de carbono: 4 argumentos
```
- **Problema:** `calcularHuella(materiales, electronicos, customCats = [], pesosManual = {})` (`src/lib/huellaCarbono.js:121`) usa `customCats` para `pesoEstimadoUnidad(reg, customCats)` (`:151`, `:168`). Al llamarla sin ese argumento, las categorías personalizadas creadas en `AdminInventario.crearCategoria` (que guardan `peso_estimado`) se valoran con el peso por defecto, y los ajustes manuales de peso del admin se ignoran por completo.
- **Impacto:** El subtítulo "total {data.totalCo2e} kg" de Estadísticas y las barras del "Top donantes" no coinciden con el documento PDF con folio que genera Huella de carbono para el mismo material. Dos cifras oficiales distintas de CO2e evitado en la misma aplicación.
- **Fix:** Cargar `obtenerCategoriasCustom()` en AdminEstadisticas y pasar `calcularHuella(mats, elecs, customCats)` (o mejor, consumir el último `Reportes_Huella` generado en vez de recalcular).

### BUG-35: La meta de horas la decide la última asignación encontrada y `|| 480` ignora una meta de 0 — SEVERITY: Low
- **Ubicación:** `src/pages/admin/AdminEstadisticas.jsx:135-152`
- **Código:**
```js
asignaciones.forEach(a => {
  if (!a.usuario) return;
  const act = acts.find(x => x.id === a.actividad);
  metaPorUsuario[a.usuario] = act?.meta_horas || 480;
});
...
const meta = metaPorUsuario[u.id] || 480;
const pct = ((horasPorUsuario[u.id] || 0) / meta) * 100;
```
- **Problema:** `asignaciones` viene ordenado `-created_date`, así que el `forEach` va de la más nueva a la más vieja y **sobrescribe** la meta con cada asignación anterior: gana la asignación más antigua, no la activa. No se filtra por `estado === "activo"` (como sí hace `src/pages/Fichar.jsx:66`). Además `|| 480` convierte una meta legítima de `0` en 480 (falsy-zero), y `acts.find` puede devolver `undefined` sin que se distinga "actividad sin meta" de "actividad inexistente".
- **Impacto:** "Progreso de la cohorte" clasifica a los alumnos con la meta de una actividad pasada (p. ej. 80 h en vez de 480 h), de modo que aparecen en "> 75%" quienes apenas empiezan. El gráfico no refleja el avance real del programa.
- **Fix:** Recorrer solo asignaciones activas y no sobrescribir si ya existe meta (`if (a.estado === "activo" && !(a.usuario in metaPorUsuario)) ...`), y usar `?? 480` en lugar de `|| 480`.

---

## `src/pages/admin/AdminHuellaCarbono.jsx`

### BUG-36: `InputPeso` se define dentro del render → el campo pierde el foco en cada tecla — SEVERITY: High
- **Ubicación:** `src/pages/admin/AdminHuellaCarbono.jsx:135-146`, usado en `:187` y `:207`
- **Código:**
```js
export default function AdminHuellaCarbono() {
  ...
  const InputPeso = ({ d }) => (
    <span className="inline-flex items-center gap-1">
      u A-<input type="number" ... value={pesosManual[d.llave] ?? d.peso_u ?? 1}
        onChange={(e) => setPesosManual((p) => ({ ...p, [d.llave]: e.target.value }))} />
      kg{d.peso_manual ? " ⚠" : ""}
    </span>
  );
  return (... <InputPeso d={d} /> ...);
```
- **Problema:** El componente se declara **dentro** del cuerpo de `AdminHuellaCarbono`, así que en cada render se crea una función nueva con identidad distinta. React compara el tipo del elemento y, al ser diferente, **desmonta y vuelve a montar** el `<input>` en lugar de actualizarlo. Cada pulsación dispara `setPesosManual` → render → remount → pérdida de foco y del caret.
- **Impacto:** El admin no puede teclear un peso: al escribir "2" el campo pierde el foco y hay que volver a hacer clic para escribir "."; "2.5" requiere tres clics. Como el peso por unidad alimenta `kg_estimados` y `co2e`, en la práctica el ajuste manual es inutilizable y el documento PDF sale con los pesos por defecto. En móvil es aún peor (el teclado se cierra en cada dígito).
- **Fix:** Sacar `InputPeso` fuera del componente (a nivel de módulo) y pasarle lo que necesita por props (`peso`, `manual`, `onChange`), o sustituirlo por JSX inline sin componente intermedio.

### BUG-37: Rango de fechas sin validar: `desde > hasta` o campos vacíos filtran todo en silencio — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminHuellaCarbono.jsx:17-23`, `:33-34`, `:70-81`, `:155-161`
- **Código:**
```js
function inicioDeMes() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`; }  // local
function hoyISO() { return new Date().toISOString().split("T")[0]; }                                                        // UTC
const enRango = (f) => f && f >= desde && f <= hasta;
<Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
```
- **Problema:** No hay ninguna validación del rango: si el admin deja `desde` o `hasta` vacío (`e.target.value === ""`), `enRango` devuelve `false` para todo (`f <= ""` nunca se cumple) y la pantalla muestra "Sin recepciones en este periodo" aunque haya material. Si `desde > hasta` ocurre exactamente lo mismo. Además los valores por defecto usan zonas distintas: `desde` es local y `hasta` es UTC (ver BUG-8), de modo que el 1 de cada mes entre 00:00 y 06:00 el rango por defecto es "1 → último día del mes anterior" y sale vacío.
- **Impacto:** KPIs en 0 y botón "Generar documento PDF" deshabilitado sin explicación; el admin cree que no hay recepciones registradas. En el caso del límite de mes, el periodo por defecto es inconsistente y el documento generado cubre un día de más o de menos.
- **Fix:** Normalizar con `fechaHoy()`, impedir `desde > hasta` (corregir automáticamente o mostrar un error inline) y tratar el campo vacío como "sin límite" en vez de filtrar todo; deshabilitar el botón con un mensaje explícito cuando el rango sea inválido.

### BUG-38: `perfil.id` sin encadenado opcional al generar el documento — SEVERITY: Low
- **Ubicación:** `src/pages/admin/AdminHuellaCarbono.jsx:27`, `:46-52`, `:98-99`
- **Código:**
```js
const [perfil, setPerfil] = useState(null);
if (me.status === "fulfilled") setPerfil(me.value);      // si falla, perfil queda null
...
generado_por: perfil.id, generado_por_nombre: nombreUsuario(perfil),
```
- **Problema:** `Promise.allSettled` permite que `me()` falle sin abortar la carga (`perfil` sigue en `null`), pero `generarDocumento` accede a `perfil.id` directamente. El resto del archivo sí usa `perfil?.role` (`:41`).
- **Impacto:** `TypeError` dentro del `try`, absorbido por el catch que muestra "Error al generar el documento" sin causa; el admin reintenta indefinidamente y nunca se crea el folio.
- **Fix:** `generado_por: perfil?.id ?? null` y bloquear el botón con un aviso si `!perfil`.

---

## `src/pages/admin/AdminPasesLista.jsx`

### BUG-39: Si `me()` falla, la pantalla queda en spinner infinito (`loading` nunca pasa a `false`) — SEVERITY: High
- **Ubicación:** `src/pages/admin/AdminPasesLista.jsx:31`, `:42-44`, `:52-54`, `:78-80`
- **Código:**
```js
const [loading, setLoading] = useState(true);
useEffect(() => { base44.auth.me().then(setPerfil).catch(() => {}); }, []);
const cargarDatos = useCallback(async () => {
  if (!perfil) return;          // <-- sale sin tocar setLoading
  setLoading(true);
  ...
}, [perfil, esAdmin, areaEncargado]);
```
- **Problema:** `loading` arranca en `true` y solo se pone en `false` dentro del `finally` de `cargarDatos`, que **no se ejecuta** si `perfil` es `null`. El `.catch(() => {})` de `me()` deja `perfil` en `null` de forma permanente (token vencido, 401, red caída). No hay reintentos ni mensaje.
- **Impacto:** El encargado entra a Pase de Lista y ve un spinner eterno (`:202-205`), sin lista, sin error y sin botón de "Iniciar pase de lista" funcional. Es indistinguible de una carga lenta, así que el usuario se queda esperando.
- **Fix:** En el `catch` de `me()` poner `setLoading(false)` y un estado de error con reintento; o quitar el early-return y cargar igualmente la lista (el filtrado por área puede resolverse después).

### BUG-40: Los conteos de asistencia se calculan contra el roster actual, no contra las respuestas del pase — SEVERITY: High
- **Ubicación:** `src/pages/admin/AdminPasesLista.jsx:58`, `:66`, `:120-122`, `:217-220`, `:262`, `:276-278`
- **Código:**
```js
const usuariosDelArea = (area) => usuarios.filter((u) => u.area_asignada === area && u.activo !== false);
const respuestasDePase = (paseId) => respuestas.filter((r) => r.pase_lista === paseId);
const presentesIds = (paseId) => new Set(respuestasDePase(paseId).map((r) => r.usuario));
...
const presentesCount = areaUsers.filter((u) => presentes.has(u.id)).length;
const pendientesCount = areaUsers.length - presentesCount;
```
- **Problema:** `usuarios` es la foto **actual** del personal (para el admin, además filtrada con `!u.archivado`, `:66`). El presente/pendiente se obtiene intersectando esa foto con las respuestas, en vez de contar las respuestas del pase. Cualquier cambio posterior de área, de rol o una baja (`AdminPersonal.confirmarBaja` / `archivarPeriodo`, que archiva a todo un periodo de golpe) modifica retroactivamente la asistencia de pases ya cerrados. Las respuestas de quienes ya no están en el roster se descartan del conteo pero tampoco aparecen en la lista.
- **Impacto:** Un pase en el que contestaron los 8 del área puede mostrarse como "✓ 0 / ⏱ 8 pendientes" al día siguiente de cerrar el periodo o de reasignar a alguien de área; el historial de asistencia (que se usa para constancias y reportes) cambia solo, y los que sí confirmaron quedan marcados como ausentes. También `pendientesCount` puede volverse negativo si hay más presentes en el roster que respuestas.
- **Fix:** Contar sobre las respuestas: `const respuestas = respuestasDePase(p.id); const presentesCount = respuestas.length;` y guardar en `Pases_Lista` el número de convocados en el momento de iniciar el pase (o el snapshot del roster) para poder mostrar "X de Y".

### BUG-41: `cerrarPase()` no confirma, no informa del resultado y no bloquea el botón — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminPasesLista.jsx:111-118`, `:264-268`
- **Código:**
```js
const cerrarPase = async (p) => {
  try { await base44.entities.Pases_Lista.update(p.id, { estado: "cerrado" }); await cargarDatos(); }
  catch (e) { console.error(e); }
};
...
{p.estado === "activo" && (<Button variant="outline" size="sm" onClick={() => cerrarPase(p)}>Cerrar pase de lista</Button>)}
```
- **Problema:** No hay `confirmarGlobal` (a diferencia del resto de pantallas), no hay `toast` de éxito ni de error (el `catch` solo hace `console.error`), no hay estado `pendiente` que deshabilite el botón, y no se registra en bitácora. `useToast` ni siquiera está importado en este archivo.
- **Impacto:** Si el `update` falla, el pase sigue "activo" en el servidor pero el admin no recibe ninguna señal y cree que lo cerró (los alumnos siguen pudiendo responder). Si tarda, un segundo clic lanza otro `update` + otro `cargarDatos()` en paralelo. Y cerrar un pase es irreversible desde la UI: un clic accidental deja a los alumnos sin poder confirmar asistencia.
- **Fix:** Pedir confirmación, añadir `toast` de éxito/error, un estado `cerrandoId` que deshabilite el botón mientras dura la petición y registrar el cierre en la bitácora.

### BUG-42: El error de "Iniciar pase de lista" se pinta en la caja verde de éxito y no se limpia nunca — SEVERITY: Low
- **Ubicación:** `src/pages/admin/AdminPasesLista.jsx:94-109`, `:195-199`
- **Código:**
```js
setNotifMsg(`Pase de lista iniciado. ${res.data?.notificados ?? 0} personas notificadas.`);
setTimeout(() => setNotifMsg(null), 5000);
} catch (e) { setNotifMsg("Error al iniciar el pase de lista."); }   // sin setTimeout
...
{notifMsg && (<div className="bg-emerald-50 border border-emerald-200 text-emerald-800 ...">{notifMsg}</div>)}
```
- **Problema:** El mismo estado y el mismo banner (verde esmeralda, sin icono ni `variant`) se usan para el éxito y para el error, y el `setTimeout` de autolimpieza solo existe en la rama de éxito. El mensaje de error tampoco incluye `e.message`.
- **Impacto:** Un fallo al iniciar el pase (403 por área equivocada, 500 del servidor, push no configurado) se muestra como un recuadro verde de "todo bien" que **permanece en pantalla indefinidamente**; el admin puede dar por iniciado un pase que nunca se creó y nadie fue notificado.
- **Fix:** Separar estados (`exito` / `error`) con estilos y colores distintos (o usar `toast` con `variant: "destructive"`), incluir `e.message` y programar la limpieza también en el error.

---

## `src/pages/admin/AdminVentas.jsx`

### BUG-43: Al eliminar una venta NO se borra la salida de inventario asociada: el stock no regresa — SEVERITY: Critical
- **Ubicación:** `src/pages/admin/AdminVentas.jsx:108-129`, `:142-151`, `:74-81`, `:219`
- **Código:**
```js
// guardar(): se crea la salida y la venta ligada
const salida = await base44.entities.Salidas_Materiales.create({ categoria: form.categoria, cantidad: Number(form.cantidad), ... });
await base44.entities.Ventas.create({ ...form, salida: salida?.id || null, ... });
// eliminar(): solo se borra la venta
await base44.entities.Ventas.delete(v.id);
toast({ title: "Venta eliminada", description: "El stock fue devuelto al inventario." });
```
- **Problema:** El stock se deriva de `materiales + electronicos - salidas` (`stockPorCat`, `:74-81`, y el equivalente en `AdminInventario.jsx:196-211`). La venta guarda el id de la salida en `v.salida`, pero `eliminar()` nunca borra esa fila de `Salidas_Materiales` ni la busca. La confirmación (`:143` "El stock regresará al inventario"), el toast (`:146`) y el `title` del botón (`:219` "Eliminar (devuelve stock)") prometen lo contrario.
- **Impacto:** Cada venta eliminada descuenta material del inventario de forma permanente e invisible: el stock de la categoría baja sin que exista venta ni salida justificada desde la pantalla de Ventas (en Inventario aparece como una "Salida" con motivo "Venta a X" que nadie puede relacionar). Inventario físico y sistema dejan de cuadrar, se disparan alertas falsas de stock bajo y se bloquean ventas legítimas por "Stock insuficiente" (`:102-105`).
- **Fix:** En `eliminar()`, borrar también la salida: `if (v.salida) await base44.entities.Salidas_Materiales.delete(v.salida);` antes/después del `Ventas.delete`, en el mismo flujo y con `cargar()` al final; si falla la segunda operación, avisar explícitamente de que el stock quedó descuadrado.

### BUG-44: Alta de venta en dos escrituras sin atomicidad ni rollback → salidas huérfanas y ventas duplicadas — SEVERITY: High
- **Ubicación:** `src/pages/admin/AdminVentas.jsx:106-140`
- **Código:**
```js
setGuardando(true);
try {
  const salida = await base44.entities.Salidas_Materiales.create({ ... });   // 1
  await base44.entities.Ventas.create({ ...form, salida: salida?.id || null }); // 2
  await registrarBitacora("Registrar venta", ...);                            // 3
  toast(...); setDialog(false); setForm(nuevaVenta()); cargar();
} catch (e) { toast({ title: "Error al registrar la venta", ... }); }
finally { setGuardando(false); }
```
- **Problema:** Tres operaciones encadenadas sin transacción y sin compensación. Si el paso 2 falla, la salida del paso 1 ya descontó stock y no existe venta que la explique. Si el que falla es el paso 3 (`registrarBitacora` escribe por red), la venta **sí** se creó pero el catch muestra "Error al registrar la venta", no cierra el diálogo ni limpia el formulario, y el botón vuelve a estar habilitado en cuanto `guardando` pasa a `false`.
- **Impacto:** Stock perdido sin venta asociada (mismo efecto que BUG-43), y en el caso del paso 3 el admin vuelve a pulsar "Registrar venta" con los mismos datos → segunda salida + segunda venta duplicadas, ingresos del mes inflados y doble descuento de inventario.
- **Fix:** Hacer la creación de venta+salida en una sola llamada transaccional del backend; mientras tanto, ejecutar `registrarBitacora` en un `try/catch` propio (que nunca aborte el flujo de éxito) y, si el paso 2 falla, compensar borrando la salida del paso 1 antes de mostrar el error.

### BUG-45: Validación de cantidad y precio inútil frente a `"0"`, negativos y categorías en kg — SEVERITY: High
- **Ubicación:** `src/pages/admin/AdminVentas.jsx:83-85`, `:97-105`, `:254-258`
- **Código:**
```js
if (!form.cantidad || !form.precio_unitario) { toast({ title: "Completa categoría, cantidad y precio", ... }); return; }
if (medidaForm === "unidades" && Number(form.cantidad) > (stockSel ?? Infinity)) { toast({ title: `Stock insuficiente...` }); return; }
```
- **Problema:** (a) `form.cantidad` y `form.precio_unitario` son **strings** (`onChange` guarda `e.target.value`), y `!"0"` es `false`, así que `0` pasa la validación; el `min="1"`/`min="0"` del input no impide teclear `-5`. (b) La comprobación de stock solo aplica cuando `medidaForm === "unidades"`: las categorías en kg pueden venderse sin límite. (c) `stockPorCat` (`:74-81`) suma cantidades de kg y de unidades en la misma clave, igual que en BUG-11, así que incluso el tope de unidades se compara contra un número mezclado.
- **Impacto:** Se pueden registrar ventas de cantidad 0 (total $0.00 que no afecta ingresos pero sí crea una salida), ventas con cantidad negativa que **devuelven** stock al inventario y ventas en kg ilimitadas que dejan el stock en negativo sin ningún aviso. El total mostrado (`totalForm`) usa `Number(...) || 0`, así que una venta con precio vacío se guarda con `total: 0`.
- **Fix:** Validar numéricamente antes de guardar (`const cant = Number(form.cantidad), prec = Number(form.precio_unitario); if (!(cant > 0) || !(prec >= 0)) ...`), aplicar el control de stock a todas las medidas (`cant > stockSel`) y separar el stock por `categoria|medida`.

### BUG-46: `exportarCSV` no escapa comas/comillas ni añade BOM, y fuga la URL del blob — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminVentas.jsx:153-162`
- **Código:**
```js
filtradas.forEach((v) => rows.push([v.fecha, labelDe(v.categoria), v.material || "", v.cantidad, v.medida,
  v.precio_unitario, v.total, v.comprador || "", v.registrado_por_nombre || "", (v.notas || "").replace(/[\n,]/g, " ")]));
const csv = rows.map((r) => r.join(",")).join("\n");
const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
const a = document.createElement("a"); a.href = url; a.download = `...`; a.click();
```
- **Problema:** Solo `notas` se sanea; `material`, `comprador`, `registrado_por_nombre` y los nombres de categoría pueden contener comas o comillas y rompen las columnas (no hay encerrado en `"` ni duplicado de comillas). No se añade BOM UTF-8 ni `charset`, a diferencia de `AdminPersonal.exportarCSV` (`:344-346`), que sí hace ambas cosas. Y nunca se llama `URL.revokeObjectURL(url)`.
- **Impacto:** El CSV que se abre en Excel tiene las columnas corridas a partir del primer comprador con coma ("Acme, S.A. de C.V."), los acentos aparecen como basura (Ã©) porque Excel asume ANSI, y cada exportación deja un blob vivo en memoria hasta cerrar la pestaña.
- **Fix:** Reutilizar `descargarCsv` de `@/lib/exportarCsv` (ya usado en `AdminInventario.jsx:154`) o aplicar el mismo `esc()` + BOM + `revokeObjectURL` que en AdminPersonal.

### BUG-47: "Ventas del mes" e "Ingresos del mes" usan el mes UTC — SEVERITY: Low
- **Ubicación:** `src/pages/admin/AdminVentas.jsx:24`, `:87-89`
- **Código:**
```js
const mesActual = new Date().toISOString().slice(0, 7);
const ventasDelMes = ventas.filter((v) => (v.fecha || "").startsWith(mesActual));
```
- **Problema:** Caso concreto de BUG-8: `mesActual` es el mes en UTC y `form.fecha` es la fecha local capturada (también UTC por defecto, `:24`). El filtro por `startsWith` sobre cadenas ignora la zona real de operación (America/Mexico_City).
- **Impacto:** El último día del mes, a partir de las 18:00 hora local, los KPI "Ventas del mes" e "Ingresos del mes" cambian al mes siguiente y muestran 0; las ventas del día 1 registradas de noche quedan fuera del mes que el admin espera.
- **Fix:** Calcular el mes con `Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year, month })` y usar `fechaHoy()` como fecha por defecto del formulario.

---

## `src/pages/admin/AdminQr.jsx`

### BUG-48: `toggleActivo()` sin `try/catch` ni estado pendiente: fallo silencioso y doble clic que revierte el cambio — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminQr.jsx:101-105`, `:243`
- **Código:**
```js
const toggleActivo = async (c) => {
  await base44.entities.Codigos_QR.update(c.id, { activo: !c.activo });
  toast({ title: c.activo ? "QR desactivado" : "QR activado" });
  load();
};
...
<button onClick={() => toggleActivo(c)} className="p-2 ..." title="Activar/Desactivar"><Power .../></button>
```
- **Problema:** Es la única mutación del archivo sin `try/catch` (comparar `handleSubmit:78-84`, `eliminarQr:109-115`). Si el `update` rechaza, la promesa queda sin manejar, no hay toast de error y el QR sigue con el estado anterior sin ninguna indicación. Tampoco hay bandera de "guardando" que deshabilite el botón, y cada clic lanza su propio `load()`.
- **Impacto:** Un error de red deja al admin creyendo que desactivó un QR impreso (y ese QR sigue sirviendo para fichar). Un doble clic envía `activo: false` y luego `activo: true`, dejando el código activo cuando se quería desactivar, y dos `load()` concurrentes pueden pintar la lista en el orden que resuelvan.
- **Fix:** Envolver en `try/catch` con toast destructivo, añadir un estado `togglingId` que deshabilite el botón mientras dura la petición y actualizar optimistamente solo tras la respuesta.

### BUG-49: El badge "Expirado" enmascara el estado real y el toggle no tiene efecto visual — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminQr.jsx:152`, `:212-218`, `:221`, `:236-243`
- **Código:**
```js
const expirado = (c) => c.fecha_expiracion && c.fecha_expiracion < new Date().toISOString().slice(0, 10);
...
{esLegacy(c) ? "Sistema anterior" : expirado(c) ? "Expirado" : c.activo ? "Activo" : "Inactivo"}
```
- **Problema:** `expirado` tiene prioridad sobre `c.activo` en la etiqueta, y la expiración se compara contra la fecha **UTC** (ver BUG-8). Nada desactiva automáticamente el código: un QR expirado sigue con `activo = 1`, se sigue renderizando con su imagen y conserva los botones de activar/desactivar. Al pulsar Power sobre un QR expirado, el toast dice "QR desactivado"/"QR activado" pero la tarjeta sigue mostrando exactamente el mismo badge "Expirado".
- **Impacto:** El admin no puede saber si un QR expirado está activo o no (el único indicador visible es siempre "Expirado"), y durante las primeras 6 horas del día la comparación UTC marca como expirado un código cuya fecha límite es hoy. Se imprimen y mantienen en pared códigos que el sistema considera vigentes o inválidos sin relación con lo que muestra la pantalla.
- **Fix:** Mostrar ambos estados (badge de expiración + badge activo/inactivo), tratar `expirado` como `!activo` a efectos de UI (ocultar QR y botones de impresión) y comparar contra `fechaHoy()`.

### BUG-50: `handleSubmit` no evita QR duplicados por área y el botón no se deshabilita — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminQr.jsx:60-85`, `:199`
- **Código:**
```js
const crearQrArea = async (area, expiracion = "") => { const token = generarToken(); ... await base44.entities.Codigos_QR.create({ nombre: `QR - ${area}`, ubicacion: area, activo: true, ... }); };
const handleSubmit = async () => { if (!form.ubicacion) {...} try { await crearQrArea(form.ubicacion, form.fecha_expiracion); ... } };
<Button onClick={handleSubmit}><Plus .../> Crear QR</Button>
```
- **Problema:** `generarTodasLasAreas` sí comprueba qué áreas tienen ya un QR activo (`:89-91`), pero `handleSubmit` no hace ninguna comprobación: crea otro token y otro registro `activo: true` para la misma área. El botón tampoco tiene `disabled` ni estado de envío.
- **Impacto:** Dos clicos (o un reintento tras un error de red que sí creó el registro) generan dos QR activos para la misma área; ambos fichan, con tokens distintos, y el conteo de escaneos se reparte. En pared quedan dos carteles válidos y no hay forma de saber cuál es el bueno.
- **Fix:** Avisar si ya existe un QR activo para `form.ubicacion` (`codigos.some(c => c.activo && c.ubicacion === form.ubicacion)`) pidiendo confirmación o desactivando el anterior, y añadir `disabled={creando}` con su estado.

### BUG-51: `load()` traga el error y `generarTodasLasAreas` recrea QR en cascada con la lista vacía — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminQr.jsx:50-56`, `:88-99`
- **Código:**
```js
const load = async () => { try { const cods = await base44.entities.Codigos_QR.list(...); setCodigos(cods); } catch (e) { console.error(e); } finally { setLoading(false); } };
const generarTodasLasAreas = async () => {
  const conActivo = new Set(codigos.filter((c) => c.activo).map((c) => c.ubicacion));
  const faltantes = AREAS.filter((a) => !conActivo.has(a.value));
  ...
  for (const a of faltantes) await crearQrArea(a.value);
  ... load();
} catch (e) { toast(...); }        // sin load()
```
- **Problema:** Si la consulta inicial falla, `codigos` queda `[]` y la pantalla muestra "Sin códigos QR". En ese estado, "QR de todas las áreas" considera que **ninguna** área tiene QR y crea uno nuevo para cada una, duplicando los existentes. Además el bucle `for ... await` aborta en el primer error sin llamar `load()`, de modo que los QR ya creados no aparecen.
- **Impacto:** Tras un fallo de red transitorio se generan decenas de códigos QR duplicados (todos activos, todos válidos para fichar), y en el fallo parcial del bucle la lista queda desactualizada hasta recargar manualmente.
- **Fix:** Guardar el error de `load()` y bloquear `generarTodasLasAreas` si la lista no se pudo cargar; recargar también en el `catch` y reportar cuántas áreas se crearon antes del fallo.

### BUG-52: `copiarUrl` no espera ni captura el rechazo del portapapeles y avisa de éxito igualmente — SEVERITY: Low
- **Ubicación:** `src/pages/admin/AdminQr.jsx:118-121`, `:238`
- **Código:**
```js
const copiarUrl = (url) => { navigator.clipboard.writeText(url); toast({ title: "URL copiada" }); };
```
- **Problema:** Falta `await` y `try/catch` (comparar con `AdminPersonal.copiarCredenciales:170-180`, que sí lo hace). `navigator.clipboard` es `undefined` fuera de contexto seguro y `writeText` puede rechazar por permisos.
- **Impacto:** Se muestra "URL copiada" aunque el portapapeles esté vacío; el admin pega en el documento de instalación y no hay nada. Además queda una promesa rechazada sin manejar en consola.
- **Fix:** `const copiarUrl = async (url) => { try { await navigator.clipboard.writeText(url); toast({title:"URL copiada"}); } catch { toast({title:"No se pudo copiar", variant:"destructive"}); } };`

---

## `src/pages/admin/AdminActividades.jsx`

### BUG-53: `handleDelete` sin `try/catch` y sin limpiar las asignaciones que dependen de la actividad — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminActividades.jsx:118-123`, `:252`
- **Código:**
```js
const handleDelete = async (id) => {
  if (!(await confirmarGlobal({ titulo: "¿Eliminar esta actividad?", descripcion: "Se quita del catálogo. Las asignaciones existentes no se borran.", destructivo: true }))) return;
  await base44.entities.Actividades.delete(id);
  toast({ title: "Actividad eliminada" });
  load();
};
```
- **Problema:** Sin `try/catch`: si el borrado falla, el toast de éxito no sale pero tampoco hay error (promesa rechazada sin manejar) y la tarjeta sigue ahí. El borrado deja colgando todas las `Asignaciones` con `actividad = id` borrado (el propio texto de confirmación lo admite) y no se refresca ninguna lista dependiente: `asignaciones` se recarga, pero los consumidores externos (`AlumnoDashboard.jsx:46` → `actividad?.nombre || "Sin asignación"`, `AdminEstadisticas.jsx:138-139` → `acts.find(...)?.meta_horas || 480`) resuelven `undefined`.
- **Impacto:** Alumnos que sí están inscritos aparecen como "Sin asignación" en su panel y pierden la meta de horas de su actividad (cae al valor por defecto 480 en estadísticas). Si el borrado falla, el admin recibe la tarjeta intacta y puede reintentar varias veces sin saber qué pasó.
- **Fix:** Envolver en `try/catch` con toast de error; antes de borrar, avisar cuántos inscritos tiene (`inscritosDe(a.id)`) y ofrecer cancelar/reasignar esas asignaciones, o impedir el borrado si hay asignaciones activas.

### BUG-54: "Cerrar área" es una acción masiva sin confirmación y "Reabrir" reactiva actividades que estaban desactivadas a propósito — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminActividades.jsx:61-64`, `:76-89`, `:199-203`
- **Código:**
```js
const cerrarArea = async (area) => { try { await base44.entities.Actividades.updateMany({ categoria: area, activo: true }, { $set: { activo: false } }); toast({ title: "Área cerrada", ... }); load(); } ... };
const reabrirArea = async (area) => { ... updateMany({ categoria: area, activo: false }, { $set: { activo: true } }); ... };
...
{isAdmin && (cerrada ? (<Button ... onClick={() => reabrirArea(area.value)}>Reabrir</Button>) : (<Button ... onClick={() => cerrarArea(area.value)}>Cerrar Área</Button>))}
```
- **Problema:** Ambas acciones modifican en lote todas las actividades del área sin `confirmarGlobal` (el resto del archivo sí lo usa para borrar) y sin guardar el estado previo, de modo que "Reabrir" pone `activo: true` también en las actividades que un admin había desactivado individualmente antes del cierre. No hay estado de envío que deshabilite los botones. Además, si el área no tiene actividades, `areaCerrada` devuelve `false` (`acts.length > 0 && ...`), se muestra "Cerrar Área" y el toast dice "Área cerrada" aunque la operación no haya afectado a ninguna fila.
- **Impacto:** Un clic accidental cierra un área completa (los alumnos dejan de poder inscribirse/fichar en esas actividades) sin aviso previo; al reabrirla reaparecen actividades que debían seguir inactivas. El toast de éxito en un área vacía hace creer que se aplicó un cambio inexistente.
- **Fix:** Pedir confirmación indicando cuántas actividades se van a cerrar/reabrir, deshabilitar el botón mientras dura la petición, y no mostrar "Cerrar Área" (ni toast de éxito) cuando `acts.length === 0`.

### BUG-55: Errores de carga silenciados: el catálogo aparece vacío como si no hubiera actividades — SEVERITY: Low
- **Ubicación:** `src/pages/admin/AdminActividades.jsx:35-56`, `:232-233`
- **Código:**
```js
} catch (e) { console.error(e); } finally { setLoading(false); }
...
{acts.length === 0 ? (<EmptyState title="Sin actividades" message="Agrega la primera actividad de esta Área." icon={FolderKanban} />) : ...}
```
- **Problema:** Igual que BUG-4: un fallo de `Actividades.list`/`Asignaciones.list` solo se registra en consola y la UI muestra el estado vacío ("Agrega la primera actividad"), sin error ni reintento. El fallo interno de `User.list` (`:47`) deja `encargados` vacío y el panel de encargados dice "No hay usuarios con rol encargado".
- **Impacto:** El admin puede crear actividades duplicadas creyendo que el catálogo está vacío, y los contadores "N inscrito(s)" salen en 0 porque `asignaciones` no se cargó.
- **Fix:** Propagar el error a un estado, mostrar un aviso con botón "Reintentar" y no renderizar el empty state cuando la carga falló.

---

## `src/pages/admin/AdminEvidencias.jsx`

### BUG-56: `aprobar()`, `rechazar()` y `regresar()` sin `try/catch` ni estado de envío — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminEvidencias.jsx:50-71`, `:211`, `:220`, `:240`
- **Código:**
```js
const aprobar = async (ev) => {
  await base44.entities.Evidencias.update(ev.id, { estado_evidencia: "aprobada", aprobado_por: user.id });
  toast({ title: "Evidencia aprobada" });
  resetAction(); load();
};
```
- **Problema:** Las tres mutaciones principales del archivo no tienen `try/catch` (solo `asignarBono:73-88` lo tiene). Si el `update` rechaza, la promesa queda sin manejar: no hay toast de error, no se ejecutan `resetAction()`/`load()` y el diálogo se queda exactamente igual. Tampoco hay bandera de "guardando" que deshabilite los botones mientras dura la petición.
- **Impacto:** El admin pulsa "Aprobar"/"Confirmar rechazo"/"Regresar" y no pasa absolutamente nada (ni éxito ni error); la evidencia sigue en "pendiente" en el servidor. Al reintentar varias veces se acumulan peticiones y, si alguna llega tarde, `load()` concurrentes pueden pintar la lista con el estado anterior.
- **Fix:** Envolver cada una en `try/catch` con toast destructivo, añadir un estado `procesandoId` que deshabilite los botones y mantener el `load()` en `finally`.

### BUG-57: El rechazo/regreso no se puede cancelar una vez enviado y el motivo se pierde al cerrar el diálogo — SEVERITY: Low
- **Ubicación:** `src/pages/admin/AdminEvidencias.jsx:57-71`, `:129`, `:162`, `:212`, `:221`
- **Código:**
```js
onClick={() => { setDetalle(ev); resetAction(); }}      // abre la tarjeta
onOpenChange={(open) => { if (!open) { setDetalle(null); resetAction(); } }}
const rechazar = async (ev) => { if (!comentario) { toast({ title: "Agrega un motivo", ... }); return; } ... };
```
- **Problema:** `resetAction()` limpia `comentario` al abrir otra tarjeta y al cerrar el diálogo, pero el `Textarea` de rechazo/regreso no tiene foco ni validación de longitud mínima, y la validación (`!comentario`) acepta un espacio en blanco como motivo (`" "` es truthy), que se guarda tal cual en `comentario_revision` y es lo único que ve el alumno para corregir su evidencia.
- **Impacto:** Se pueden rechazar/regresar evidencias con un motivo en blanco (solo espacios), dejando al alumno sin explicación y sin forma de saber qué corregir; el texto queda además visible en `detalle.comentario_revision` como un recuadro vacío.
- **Fix:** Validar `comentario.trim()` (no `comentario`) y exigir una longitud mínima antes de permitir el rechazo/regreso.

---

## `src/pages/admin/AdminConstancias.jsx`

### BUG-58: No se pueden generar constancias para el personal dado de baja (justo el flujo de cierre de periodo) — SEVERITY: High
- **Ubicación:** `src/pages/admin/AdminConstancias.jsx:56-62`
- **Código:**
```js
if (esAdmin) {
  const users = await base44.entities.User.list("full_name", 500);
  setUsuarios(users.filter((u) => !u.archivado && (esParticipante(u.role))));
} else {
  const res = await base44.functions.invoke("ObtenerPersonalArea", {});
  setUsuarios((res.data?.users || []).filter((u) => esParticipante(u.role)));
}
```
- **Problema:** El selector de participantes excluye a los archivados. `AdminPersonal.archivarPeriodo` (`:295-314`) archiva en lote a **todo** un periodo y `confirmarBaja` (`:265-280`) archiva individualmente con `archivado: 1`. La rama del encargado depende de `ObtenerPersonalArea`, que en el servidor ya filtra `archivado = 0` (mismo criterio que `IniciarPaseLista`).
- **Impacto:** El flujo real "cerrar periodo → emitir constancias de término" es imposible: en cuanto el admin cierra el periodo, los alumnos desaparecen del desplegable de Constancias y no se les puede emitir el documento oficial. La única salida es reactivarlos uno por uno en Personal, generar la constancia y volver a darlos de baja (cambiando `fecha_baja`/`motivo_baja` en el proceso).
- **Fix:** No filtrar `archivado` en esta pantalla (o añadir un interruptor "Incluir dados de baja"), mostrando la etiqueta "(baja)" junto al nombre; el alta de la constancia no depende de que la persona siga activa.

### BUG-59: Constancia con 0 horas (o negativas) y fechas incoherentes: el formulario no valida nada — SEVERITY: High
- **Ubicación:** `src/pages/admin/AdminConstancias.jsx:35-41`, `:77-101`, `:211-220`
- **Código:**
```js
const [form, setForm] = useState({ usuario: "", tipo: "constancia_termino", horas_completadas: 0, fecha_inicio: "", fecha_fin: "" });
...
horas_completadas: Number(form.horas_completadas) || 0,
fecha_inicio: form.fecha_inicio || null,
fecha_fin: form.fecha_fin || null,
```
- **Problema:** La única validación de `handleGenerar` es que exista el participante (`:78-82`). `horas_completadas` arranca en `0` y `Number("") || 0` devuelve `0`, así que se puede emitir una **Constancia de Término** con cero horas (o negativas, el input no tiene `min`). Las horas se teclean a mano: no se precargan ni se contrastan con las horas oficiales validadas del alumno (`sumarHorasRegistros` + bonos + ajustes). Tampoco se comprueba que `fecha_fin >= fecha_inicio` ni que el tipo de documento corresponda a horas > 0.
- **Impacto:** Documentos oficiales con cifras inventadas o en 0, que no coinciden con el expediente del alumno ni con lo que reporta Validación/Estadísticas. Una constancia de término emitida con 0 h es un documento inválido ante la institución y no hay forma de detectarlo después (el listado solo muestra las horas si son `> 0`, `:172`, así que la constancia de 0 horas aparece sin dato).
- **Fix:** Precargar `horas_completadas` con las horas oficiales del participante y validar `horas > 0`, `fecha_fin >= fecha_inicio` y coherencia con el tipo de documento antes de habilitar "Generar y descargar".

### BUG-60: Si falla el PDF o la bitácora, la constancia ya se creó pero la UI informa error y permite duplicarla — SEVERITY: High
- **Ubicación:** `src/pages/admin/AdminConstancias.jsx:83-113`
- **Código:**
```js
const creada = await base44.entities.Constancias.create(registro);   // 1
generarConstanciaPDF(creada);                                        // 2 (sin await ni try propio)
await registrarBitacora("Generar constancia", ...);                  // 3
toast({ title: "Constancia generada y descargada" });
setDialogOpen(false); setForm({...}); cargar();
} catch (e) { toast({ title: "Error al generar", variant: "destructive" }); }
```
- **Problema:** Tres pasos no atómicos dentro del mismo `try`. Si `generarConstanciaPDF` lanza (jsPDF, datos nulos en `creada`) o `registrarBitacora` falla por red, se entra en el `catch` **después** de que la constancia quedó creada con su folio: no se cierra el diálogo, no se limpia el formulario, no se recarga la lista y el toast dice "Error al generar". El botón "Generar y descargar" vuelve a estar habilitado en cuanto `generando` pasa a `false`.
- **Impacto:** El admin reintenta y crea una **segunda constancia con otro folio** para la misma persona y el mismo periodo (folios duplicados en el historial, ambos "vigente"), mientras la primera queda invisible hasta el próximo `cargar()`. Si el fallo fue solo del PDF, además no se descarga ningún documento aunque la constancia exista.
- **Fix:** Separar la creación del PDF/bitácora en `try/catch` independientes: si la creación tuvo éxito, cerrar el diálogo, limpiar el formulario, recargar y avisar "Constancia creada (folio X) pero no se pudo descargar el PDF"; nunca dejar el formulario listo para reenviar tras una creación exitosa.

### BUG-61: `revocar()` sin confirmación y `loading` en `true` para siempre si `me()` falla — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminConstancias.jsx:31`, `:45-47`, `:49-50`, `:70-73`, `:116-125`, `:158-159`, `:178`
- **Código:**
```js
const [loading, setLoading] = useState(true);
useEffect(() => { base44.auth.me().then(setPerfil).catch(() => {}); }, []);
useEffect(() => { if (perfil) cargar(); }, [perfil]);        // si perfil es null, nunca se carga
...
const revocar = async (c) => { try { await base44.entities.Constancias.update(c.id, { estado: "revocada" }); ... } };
<button onClick={() => revocar(c)} ... title="Revocar"><Ban .../></button>
```
- **Problema:** Dos defectos: (a) idéntico a BUG-39 — `loading` solo se pone en `false` dentro de `cargar()`, que no se ejecuta si `me()` falla, así que la pantalla queda con el spinner infinito (`:158-159`) sin error ni reintento; (b) `revocar` anula un documento oficial con un solo clic, sin `confirmarGlobal` (la utilidad ni siquiera está importada en este archivo) y sin estado pendiente que deshabilite el botón.
- **Impacto:** (a) Pantalla inutilizada tras un 401 o un corte de red. (b) Un clic accidental en el icono de prohibido revoca una constancia vigente de forma irreversible desde la UI (no hay acción "desrevocar"), y el PDF ya descargado queda circulando con un folio que el sistema marca como revocado.
- **Fix:** Poner `setLoading(false)` y un estado de error con reintento cuando `me()` falle; pedir confirmación (con folio y nombre) antes de revocar y deshabilitar el botón mientras dura la petición.

---

## `src/pages/admin/AdminBonos.jsx`

### BUG-62: Borrar horas de premio sin confirmación y sin bitácora — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminBonos.jsx:91-97`, `:189`, `:213`
- **Código:**
```js
const handleDelete = async (id) => {
  try { await base44.entities.Bonos.delete(id); toast({ title: "Bono eliminado" }); load(); }
  catch (e) { toast({ title: "Error al eliminar", variant: "destructive" }); }
};
...
<button onClick={() => handleDelete(b.id)} className="p-2 -m-1 ..." title="Eliminar"><Trash2 .../></button>
```
- **Problema:** Un clic elimina el bono. No hay `confirmarGlobal` (ni está importado en el archivo), ni estado pendiente que deshabilite el botón, ni `registrarBitacora` — a diferencia de otras mutaciones de horas (`AdminValidacion.jsx:134, 155, 179` sí auditan).
- **Impacto:** Se pueden restar horas acumuladas de un alumno (que alimentan su progreso hacia la meta y su constancia) con un clic accidental en la tarjeta móvil (`-m-1`, área de toque ampliada junto a la fecha). No queda registro de quién eliminó qué bono, así que la discrepancia de horas no es auditable.
- **Fix:** Pedir confirmación mostrando alumno/horas/motivo/fecha, deshabilitar el botón mientras dura la petición y registrar el borrado en la bitácora.

### BUG-63: El selector de alumnos incluye dados de baja (criterio opuesto al de Constancias) — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminBonos.jsx:40`, `:45`, `:116-119`
- **Código:**
```js
base44.entities.User.list("full_name", 500),
setAlumnos(us.filter(u => esParticipante(u.role)));       // sin !u.archivado
```
- **Problema:** No se filtra `archivado`, mientras que `AdminConstancias.jsx:58` y `AdminElectronicos.jsx:88` sí lo hacen para el mismo tipo de selector. El desplegable mezcla activos y bajas sin distinguirlos.
- **Impacto:** Se pueden asignar horas de premio a personas ya dadas de baja (que no aparecen en ninguna otra pantalla y cuyo progreso nadie revisa), inflando `totalHoras` de Estadísticas. La inconsistencia entre pantallas hace que el mismo alumno sea seleccionable aquí e invisible en Constancias.
- **Fix:** Filtrar `!u.archivado` (o mostrar el sufijo "(baja)") y unificar el criterio con el resto de selectores de participantes.

### BUG-64: Motivo "Otro" sin texto: se guardan bonos con motivo vacío — SEVERITY: Low
- **Ubicación:** `src/pages/admin/AdminBonos.jsx:67-89`, `:161-163`, `:211`
- **Código:**
```js
const motivoFinal = form.motivo === "Otro" ? form.motivoOtro : form.motivo;
const titulo = form.titulo || motivoFinal;
... motivo: `${titulo}${motivoFinal && motivoFinal !== titulo ? " · " + motivoFinal : ""}`,
```
- **Problema:** Si se elige "Otro" y no se escribe nada (y el título queda vacío), `motivoFinal` y `titulo` son `""` y el bono se crea con `motivo: ""`. Ninguna validación lo impide: `handleSubmit` solo revisa alumno y horas.
- **Impacto:** En el historial aparece una fila sin motivo (`{b.motivo || "—"}`, `:211`) y en el expediente del alumno (`AlumnoPerfil.jsx:96` "Hora de premio") una bonificación de horas sin justificación. Al ser horas que cuentan para la constancia, es un agujero de auditoría.
- **Fix:** Exigir texto cuando `form.motivo === "Otro"` (`motivoOtro.trim()`) y/o un título no vacío antes de enviar.

### BUG-65: Historial limitado a 200 bonos pero presentado como el total — SEVERITY: Low
- **Ubicación:** `src/pages/admin/AdminBonos.jsx:43`, `:173`
- **Código:**
```js
base44.entities.Bonos.list("-fecha", 200),
<SectionCard title="Historial de bonos" subtitle={`${bonos.length} registro(s)`} ...>
```
- **Problema:** La consulta está topada a 200 filas ordenadas por fecha descendente y el subtítulo presenta `bonos.length` como el número de registros. `AdminPersonal.jsx:112` carga 1000 bonos para sumar horas.
- **Impacto:** A partir del bono 201 los más antiguos desaparecen del historial (no se pueden consultar ni eliminar desde la UI) y el contador miente; además las horas de esos bonos siguen sumándose en Personal/Estadísticas, así que el historial visible no cuadra con el total de horas del alumno.
- **Fix:** Paginar el historial (o indicar "últimos 200") y usar el mismo límite/universo que las pantallas que suman esas horas.

---

## `src/pages/admin/AdminEncuestas.jsx`

### BUG-66: Se envía `preguntas` como array a una columna TEXT: crear una encuesta falla siempre — SEVERITY: Critical
- **Ubicación:** `src/pages/admin/AdminEncuestas.jsx:68-75`, lectura en `:203-205`
- **Código:**
```js
await base44.entities.Encuestas.create({
  titulo: form.titulo, descripcion: form.descripcion,
  preguntas: form.preguntas.filter((p) => p.texto),   // <-- array de objetos
  activa: true, periodo: "", creada_por: perfil.id,
});
...
const rs = respuestasDe(viendo.id).map((r) => r.respuestas?.find((x) => x.pregunta === pi)?.valor)
```
- **Problema:** La tabla es `encuestas (… preguntas TEXT …)` (`server/setup.js:170-178`) y el servidor hace `const values = fields.map(f => coerce(data[f]))` → `db.prepare(INSERT …).run(...values)`, donde `coerce` (`server/routes/entities.js:121-126`) solo convierte booleanos y `undefined`; **no serializa arrays ni objetos**. better-sqlite3 no puede bindear un array y lanza `TypeError`. En la lectura ocurre lo simétrico: `respuestas` es TEXT, así que `r.respuestas?.find(...)` nunca existirá sobre un string.
- **Impacto:** "Crear encuesta" termina siempre en el catch con el toast genérico "Error al crear" (`:82`): la funcionalidad de encuestas está inutilizable desde el admin, y el diálogo se queda abierto con todo lo escrito. Aunque se corrigiera el alta, el diálogo de resultados no mostraría nada porque espera arrays donde hay cadenas.
- **Fix:** Serializar al enviar y deserializar al leer: `preguntas: JSON.stringify(form.preguntas.filter(p => p.texto))` y `const preguntas = typeof enc.preguntas === "string" ? JSON.parse(enc.preguntas || "[]") : (enc.preguntas || [])`; lo mismo para `Respuestas_Encuesta.respuestas` (también en `AlumnoEncuestas.jsx`).

### BUG-67: Nombre de campo equivocado (`creada_por`) y campo inexistente (`periodo`): se descartan en silencio — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminEncuestas.jsx:72-74`
- **Código:**
```js
activa: true,
periodo: "",
creada_por: perfil.id,
```
- **Problema:** La columna real es `creado_por` (sin la "a") y la tabla `encuestas` no tiene columna `periodo`. El servidor filtra `Object.keys(data).filter(f => cols.has(f))` (`entities.js:380`), así que ambos campos se **tiran sin error** y sin aviso. Además se paga una llamada extra a `base44.auth.me()` (`:67`) solo para obtener un id que nunca se guarda.
- **Impacto:** Las encuestas quedan sin autor: no hay forma de saber quién la creó (ni aparece en el listado ni sirve para auditoría), y el `periodo` que el formulario promete no se almacena. El fallo es invisible porque la creación "tiene éxito".
- **Fix:** Corregir a `creado_por: perfil.id`, eliminar `periodo` del payload (o añadir la columna si se necesita) y reutilizar el perfil de `useAuth()` en vez de otra llamada a `me()`.

### BUG-68: Validación de preguntas hecha antes de filtrarlas: se crean encuestas sin preguntas — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminEncuestas.jsx:60-71`, `:139`
- **Código:**
```js
if (!form.titulo || form.preguntas.length === 0) { toast({ title: "Agrega título y al menos una pregunta", ... }); return; }
...
preguntas: form.preguntas.filter((p) => p.texto),
```
- **Problema:** La validación comprueba la longitud **antes** del filtro por `p.texto`. El estado inicial ya contiene una pregunta vacía (`:34`), así que `form.preguntas.length === 1` y la validación pasa aunque ninguna pregunta tenga texto; el payload resultante es `preguntas: []`. Tampoco se valida que una pregunta de tipo `opcion_multiple` tenga opciones.
- **Impacto:** Se crean encuestas con título y cero preguntas: en el listado aparecen como "0 preguntas · 0 respuestas" (`:139`), se pueden activar y los alumnos las ven vacías sin poder responder nada. Una pregunta de opción múltiple sin opciones genera un control roto en el lado del alumno.
- **Fix:** Validar sobre la lista ya filtrada (`const utiles = form.preguntas.filter(p => p.texto.trim()); if (utiles.length === 0) { toast(...); return; }`) y exigir al menos dos opciones cuando `tipo === "opcion_multiple"`.

### BUG-69: Borrar y pausar encuestas sin confirmación, y resultados truncados a 5 respuestas sin aviso — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminEncuestas.jsx:88-105`, `:144-145`, `:198-215`
- **Código:**
```js
const eliminar = async (enc) => { try { await base44.entities.Encuestas.delete(enc.id); await registrarBitacora(...); cargar(); } catch (e) { toast(...) } };
...
{rs.slice(0, 5).map((r, ri) => <p key={ri} ...>• {String(r)}</p>)}
```
- **Problema:** (a) `eliminar` borra la encuesta de un clic, sin `confirmarGlobal` (no está importado) y sin toast de éxito; sus `Respuestas_Encuesta` quedan huérfanas (`r.encuesta` apunta a un id inexistente) y no se borran ni se recountan. `toggleActiva` tampoco confirma ni informa. (b) En el diálogo de resultados, las preguntas de texto/opción múltiple muestran solo `rs.slice(0, 5)`, sin indicador de que hay más, y sin agregación por opción.
- **Impacto:** (a) Pérdida irreversible de una encuesta con sus respuestas por un clic accidental; el contador de respuestas sigue contando huérfanas hasta el próximo `cargar()`. (b) Con 200 respuestas el admin ve 5 líneas sueltas y puede concluir, por ejemplo, que la opción menos votada es la mayoritaria; el "Promedio x/5" solo se calcula para `escala_1_5`.
- **Fix:** Confirmar antes de borrar/pausar (indicando cuántas respuestas se pierden) y mostrar el total real de respuestas con un conteo por opción (`Object.entries(rs.reduce(...))`), paginando o expandiendo el texto abierto en vez de recortarlo a 5.

---

## `src/pages/admin/AdminIncidencias.jsx`

### BUG-70: El formulario de resolución se comparte entre incidencias: se guarda en la equivocada — SEVERITY: High
- **Ubicación:** `src/pages/admin/AdminIncidencias.jsx:34-35`, `:52-64`, `:120-141`
- **Código:**
```js
const [atenderId, setAtenderId] = useState(null);
const [form, setForm] = useState({ comentario_resolucion: "", accion_tomada: "ninguna" });
...
<Button size="sm" onClick={() => setAtenderId(inc.id)}>Atender</Button>       // no limpia form
<Button size="sm" variant="outline" onClick={() => setAtenderId(null)}>Cancelar</Button>  // tampoco
```
- **Problema:** Hay **un único** `form` para todas las tarjetas. `setAtenderId(inc.id)` no reinicia `comentario_resolucion`/`accion_tomada`, y "Cancelar" solo cierra el panel sin limpiar. El `form` únicamente se resetea dentro del camino exitoso de `atender` (`:62`).
- **Impacto:** Secuencia real: el admin pulsa "Atender" en la incidencia A, escribe "Se repuso el material y se amonestó verbalmente", cambia de opinión, pulsa "Atender" en la incidencia B (otro alumno, otro problema) y el panel de B aparece **ya relleno** con la resolución de A; si pulsa "Resolver", la incidencia B queda marcada como resuelta con una justificación y una acción (`accion_tomada`) que no le corresponden, y A sigue pendiente. Es un error de expediente sobre una falta disciplinaria, difícil de detectar después.
- **Fix:** Reiniciar el formulario al abrir (`onClick={() => { setAtenderId(inc.id); setForm({ comentario_resolucion: "", accion_tomada: "ninguna" }); }}`), también al cancelar, y guardar el borrador por incidencia (`{ [id]: form }`) si se quiere conservar lo escrito.

### BUG-71: `atender()` y `rechazar()` sin `try/catch` ni estado pendiente — SEVERITY: Medium
- **Ubicación:** `src/pages/admin/AdminIncidencias.jsx:52-71`, `:133`, `:140`
- **Código:**
```js
const atender = async (inc) => {
  if (!form.comentario_resolucion) { toast(...); return; }
  await base44.entities.Incidencias.update(inc.id, { ..., estado_incidencia: "resuelta", ... });
  toast({ title: "Incidencia resuelta" }); setAtenderId(null); setForm({...}); load();
};
```
- **Problema:** Ninguna de las dos mutaciones tiene `try/catch` (a diferencia del resto del archivo, que sí usa `confirmarGlobal` en `rechazar`). Un fallo de red o un 500 dejan una promesa rechazada sin manejar: no hay toast de error, el panel sigue abierto con el texto escrito y la incidencia sigue "reportada". Los botones "Resolver"/"Rechazar" no se deshabilitan durante la petición.
- **Impacto:** El admin cree que resolvió/rechazó la incidencia (no recibe ningún error) y la bandeja de pendientes no cambia hasta que recarga a mano; si reintenta con doble clic se lanzan dos updates y dos `load()` concurrentes.
- **Fix:** Envolver en `try/catch` con toast destructivo, añadir un estado `procesandoId` que deshabilite los botones y mantener el formulario abierto solo si falló.

### BUG-72: `formatearFecha(created_date)` interpreta como local una marca UTC: el día mostrado no coincide con el grupo — SEVERITY: High
- **Ubicación:** `src/pages/admin/AdminIncidencias.jsx:20-26`, `:80`, `:85`, `:119`, `:154`; mismo patrón en `AdminEvidencias.jsx:149,188`, `AdminConstancias.jsx:170`, `AdminPasesLista.jsx:235`, `AdminEncuestas.jsx:139`, `AdminValidacion.jsx:356`
- **Código:**
```js
const fechaMexico = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", ... }).format(new Date(iso));
...
if (agrupar === "dia") return fechaMexico(inc.created_date) || "sin_fecha";   // correcto
...
Reportada por {nombreDe(inc.creado_por)} · {formatearFecha(inc.created_date)}  // incorrecto
```
- **Problema:** `created_date` es `datetime('now')` de SQLite, es decir **"YYYY-MM-DD HH:MM:SS" en UTC** (lo documenta el propio `AdminPasesLista.jsx:19`). `formatearFecha` → `parseFechaLocal` (`src/lib/ucpUtils.js:72-77`) solo añade `T00:00:00` cuando la cadena es exactamente `YYYY-MM-DD`; con hora incluida hace `new Date("2026-09-21 02:15:00")`, que V8 interpreta como **hora local**. Así, una marca UTC se muestra como si ya fuera local (desfase de 6 h). El agrupado por día de esta misma pantalla sí usa la zona correcta (`fechaMexico`), de modo que ambas cosas se contradicen.
- **Impacto:** Toda incidencia/evidencia/pase/constancia/bitácora creada entre las 18:00 y las 23:59 de México (00:00-06:00 UTC) se muestra con **el día siguiente**. Al agrupar por día, la tarjeta dice "21 sep 2026" dentro del grupo "20 sep", y el orden cronológico percibido de la bandeja es falso. En Constancias afecta al documento oficial (fecha de emisión) y en Pases de lista a la fecha del pase.
- **Fix:** Que `parseFechaLocal` detecte el patrón `"YYYY-MM-DD HH:MM:SS"` y lo trate como UTC (`s.replace(" ", "T") + "Z"`), o usar `fechaMexico()`/`Intl` con `timeZone: "America/Mexico_City"` en todos los sitios que formatean `created_date`.

### BUG-73: La lista de resueltas/rechazadas se recorta a 30 sin indicarlo y el contador dice otro número — SEVERITY: Low
- **Ubicación:** `src/pages/admin/AdminIncidencias.jsx:100-101`, `:167`, `:174`, `:206-216`
- **Código:**
```js
const otras = incidencias.filter((i) => !PENDIENTES.includes(i.estado_incidencia));
...
const gruposOtras = agruparLista(otras.slice(0, 30));
...
<p className="text-sm text-muted-foreground mt-1">{pendientes.length} pendiente(s) · {otras.length} resuelta(s)/rechazada(s)</p>
```
- **Problema:** El encabezado anuncia `otras.length` (todas), pero solo se renderizan las 30 primeras, sin aviso de truncamiento ni paginación. Además `Incidencias.list("-created_date", 500)` ya topa el universo a 500 y los errores de `load()` se tragan (`:46`), así que con la lista vacía por un fallo de red se muestra "Sin incidencias".
- **Impacto:** El admin ve "48 resuelta(s)" pero solo puede consultar 30; las 18 restantes (incluida la resolución de una falta) son inaccesibles desde la UI. Si `load()` falló, la bandeja parece vacía estando llena.
- **Fix:** Mostrar un aviso "+N más" con botón para cargar el resto (o paginar), y separar el estado de error del estado vacío.

---
