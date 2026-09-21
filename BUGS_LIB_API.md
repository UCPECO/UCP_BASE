# BUGS — src/lib + src/api (delegado de revisión, verificado)

Ámbito: `src/api/base44Client.js` y todo `src/lib/`. Los dos hallazgos Critical fueron
**verificados de forma independiente** contra el servidor (ver RESUMEN_EJECUTIVO.md).

---

## `src/api/base44Client.js`

### LIB-01 · `buildQueryString` serializa booleanos como `"true"` y el servidor compara contra una columna INTEGER → 0 filas — **CRITICAL** ✅ VERIFICADO
- **Ubicación:** `src/api/base44Client.js:57`; call site `src/pages/alumno/AlumnoEncuestas.jsx:24`
- **Código:**
  ```js
  if (v !== undefined && v !== null) params.set(k, String(v));   // true -> "true"
  // AlumnoEncuestas.jsx:24
  const lista = await base44.entities.Encuestas.filter({ activa: true });
  ```
- **Problema:** el servidor hace igualdad estricta con el valor como texto (`entities.js:249-252`) y la columna es `activa INTEGER DEFAULT 1` (`setup.js:175`). SQLite aplica afinidad numérica a `'true'`, la conversión falla, el operando queda TEXT, y **un INTEGER nunca es igual a un TEXT** (en el orden de tipos de SQLite, INTEGER/REAL < TEXT). En la *escritura* `coerce()` sí convierte `true→1`; en la *lectura* no: el cliente es asimétrico.
- **Impacto:** la pantalla de encuestas del alumno **siempre aparece vacía**, aunque existan encuestas activas. Cualquier `filter({campoBooleano: true/false})` falla igual. Con `{ activa: 1 }` (como hace `categoriasDinamicas.js:18`) sí funciona.
- **Fix:** normalizar en `buildQueryString`: `typeof v === 'boolean' ? (v ? 1 : 0) : v`.

### LIB-02 · `updateMany()` nunca funciona: `PUT /:entity/bulk` queda sombreada por `PUT /:entity/:id` — **CRITICAL** ✅ VERIFICADO
- **Ubicación:** `src/api/base44Client.js:226`; servidor `entities.js:426` (`/:entity/:id`) registrado **antes** que `:595` (`/:entity/bulk`). Call sites `AdminActividades.jsx:78,85`.
- **Problema:** Express matchea en orden de registro; `/:entity/:id` captura `/Actividades/bulk` con `id="bulk"` → 404. **La línea 595 es código muerto inalcanzable.** (Aun si se alcanzara, `entities.js:617` hace `values.push(filter[k])` sin `coerce()`, y better-sqlite3 no puede bindear el booleano `true` → TypeError → 500.) Nótese que `POST /:entity/bulk` (547) **sí** funciona porque `POST /:entity` (331) solo matchea un segmento: la asimetría es exactamente esa.
- **Impacto:** "Cerrar área" / "Reabrir área" del panel de Actividades **nunca modifica nada**; el admin solo ve un toast rojo sin explicación y las actividades siguen activas.
- **Fix:** registrar `router.put('/:entity/bulk', ...)` **antes** de `/:entity/:id`, y aplicar `coerce(filter[k])` en el WHERE del bulk.

### LIB-03 · Ningún manejo de 401 en `apiFetch`: con el token expirado la app muestra datos vacíos — **HIGH**
- **Ubicación:** `src/api/base44Client.js:21-47`; `server/middleware/auth.js:18` (`expiresIn:'7d'`), `:40`
- **Problema:** el token solo se limpia en `AuthContext.checkUserAuth`, que corre al montar. Cuando el JWT caduca con la sesión abierta, todas las peticiones devuelven 401 y cada página las traga con `console.error` (`useAlumnoData.js:44`, `useEncargadoData.js:38`, `AdminRegistros.jsx:38`). `ProtectedRoute` no re-consulta porque `authChecked` ya es `true`.
- **Impacto:** dashboards **vacíos y sin mensaje de error** (0 horas, 0 alumnos); solo una recarga manual devuelve al login. Combinado con BUG-47 del informe principal, el usuario no distingue "no tienes horas" de "tu sesión caducó".
- **Fix:** en `apiFetch`, si `status === 401` → `removeToken()` y redirigir al login una sola vez (con guarda anti-loop si ya se está en `/login`).

### LIB-04 · `subscribe()` traga los errores **y** las excepciones del callback; polling eterno sin backoff — MEDIUM
- **Ubicación:** `src/api/base44Client.js:200-215`; call sites `PaseListaAlumno.jsx:58`, `AdminPasesLista.jsx:86`
- **Problema:** `callback(...)` está **dentro** del mismo `try`, así que una excepción del suscriptor se silencia como si fuera error de red. Y no hay backoff: ante un 401/500 persistente se dispara una petición fallida cada 5 s por suscriptor y para siempre, también con la pestaña en segundo plano.
- **Fix:** mover `callback` fuera del `try`; añadir backoff y pausar cuando `document.hidden`.

### LIB-05 · `UploadFile` descarta el mensaje y el status del servidor — MEDIUM
- **Ubicación:** `src/api/base44Client.js:300-308`
- **Problema:** `throw new Error('Upload failed')` sin leer el cuerpo de error ni exponer `err.status`; y `response.json()` revienta con `SyntaxError` si el servidor responde sin cuerpo.
- **Nota:** hoy **no lo llama nadie** (ver BUG-22 del informe principal), así que es código muerto.
- **Fix:** reutilizar la lógica de error de `apiFetch`.

### LIB-06 · El Proxy de `entities` crea una entidad para cualquier propiedad (incluido `then`); `if (limit)` descarta `limit=0` — LOW
- **Ubicación:** `src/api/base44Client.js:270-277`, `:54`
- **Problema:** acceder a `entities.then` (lo hace cualquier `await` que sondee thenables) **crea y devuelve una función**, emitiendo un `GET /api/entities/then` espurio.
- **Fix:** excluir `['then','catch','finally','toJSON']`.

---

## `src/lib/generarReporte.js`

### LIB-07 · `(r.hora_salida || "0:0")` convierte un fichaje sin salida en **16 horas** — HIGH
- **Ubicación:** `src/lib/generarReporte.js:23-27` (el filtro de `:12-14` incluye `estado_registro === "incompleto"`)
- **Código:**
  ```js
  const [h2, m2] = (r.hora_salida  || "0:0").split(":").map(Number);
  let mins = (h2*60+m2) - (h1*60+m1);
  if (mins < 0) mins += 24 * 60;      // "cruce de medianoche"
  ```
- **Problema:** con `hora_salida` nula (datos importados, o un admin que la borra en "Ajustar fichaje"), el fallback `"0:0"` + la regla de cruce de medianoche da `0 - 480 = -480 → +1440 = 960 min = 16 h`. El hermano `reportePersonal.js:8` **sí** protege con `if (!r.hora_entrada || !r.hora_salida) return 0;` → es un defecto de copia/pega.
- **Impacto:** el reporte oficial de servicio social suma **16 h fantasma** por cada fichaje sin salida; un alumno con 2 registros rotos aparece con 32 h inexistentes, y cuentan para el `%` de la meta.
- **Fix:** `if (!r.hora_entrada || !r.hora_salida) return 0;`

### LIB-08 · `META` falsy-cero y `"Restantes"` sin redondear → float crudo en el PDF — MEDIUM
- **Ubicación:** `src/lib/generarReporte.js:6, 39, 90`
- **Problema:** (a) `actividad?.meta_horas || 480`: si llega el **string** `"0"`, es truthy → `x / "0" = Infinity` → `Math.min(100, Infinity)` = **100 % falso**. (b) `META - totalAcumulado` no se redondea → el PDF puede imprimir `Restantes: 467.8999999999999 h`.
- **Fix:** `const META = Number(actividad?.meta_horas) > 0 ? Number(actividad.meta_horas) : 480;` y redondear la resta.

---

## `src/lib/reportePersonal.js`

### LIB-09 · `enMes` parsea en UTC y compara con `getMonth()` local → los fichajes del **día 1** se van al mes anterior — HIGH
- **Ubicación:** `src/lib/reportePersonal.js:16-20`; usado en `:41-45`, `:57-60`
- **Código:** `const f = new Date(fecha); return f.getMonth() === mes && f.getFullYear() === anio;`
- **Problema:** `new Date("2026-09-01")` es medianoche **UTC**; `getMonth()` lee en zona local (UTC−6) → `2026-08-31T18:00` → mes 7 (agosto). El propio repo documenta esta trampa en `ucpUtils.parseFechaLocal`, y `generarReporte.js:12` y `reporteBodega.js:12` **sí** la usan. Copia/pega confirmado.
- **Impacto:** el reporte mensual de personal **omite todos los fichajes, bonos e incidencias del día 1**; los totales no coinciden con el dashboard.
- **Fix:** `const f = parseFechaLocal(fecha);`

### LIB-10 · `horasRegistro()` no aplica el redondeo oficial de 10 minutos — HIGH (sistémico, ver RESUMEN)
- **Ubicación:** `src/lib/reportePersonal.js:7-14`, `src/lib/generarReporte.js:23-27`, `server/routes/functions.js:157-162`
- **Problema:** `redondeo.js` establece la regla oficial (múltiplo de 10 min) y el dashboard la aplica vía `ucpUtils.sumarHorasRegistros → minutosOficiales`. Existen **tres** cálculos distintos para los mismos datos: (1) cliente oficial = `minutosOficiales`; (2) PDFs = `mins/60` crudo; (3) servidor = `Math.round(mins/60*100)/100` guardado en `registros_qr.horas`. Con 08:00→08:07: dashboard **0 h**, PDF **0.12 h**, BD **0.12 h**.
- **Impacto:** las horas del reporte mensual y de la constancia difieren de las que el alumno ve en pantalla; al cerrar mes los totales no cuadran y el administrador no puede reconciliarlos.
- **Fix:** un único módulo compartido de cálculo de horas usado por cliente y servidor.

### LIB-11 · `b.horas || 0` concatena cadenas si `horas` llega como texto — MEDIUM · *NEEDS VERIFICATION*
- **Ubicación:** `reportePersonal.js:46,51,59,60`; `generarReporte.js:32,37`; `ucpUtils.js:44`
- **Problema:** si `horas` viniera como TEXT, `0 + "25" + "3"` = `"0253"` → **253 h** en vez de 28. Ningún sitio fuerza `Number(...)`, a diferencia de `huellaCarbono.js` que sí hace `Number(reg.cantidad) || 0`. La columna es `REAL` en el esquema, así que el riesgo depende de datos importados.
- **Fix:** `acc + (Number(b.horas) || 0)` en los seis sitios (defensivo y barato).

---

## `src/lib/ucpUtils.js`

### LIB-12 · `calcularPorcentaje`: falsy-cero en `meta` e `Infinity` cuando llega `"0"` — MEDIUM
- **Ubicación:** `src/lib/ucpUtils.js:48-51`, `:62-65`; call site `useAlumnoData.js:61-63`
- **Problema:** `meta || META_HORAS_DEFAULT` sustituye silenciosamente una meta 0 por 480; y con el string `"0"` (truthy) → `totalHoras / "0" = Infinity` → `Math.min(100, Infinity)` = **100 %**.
- **Impacto:** alumnos marcados al 100 % de su servicio social (y por tanto elegibles a constancia automática) sin haber fichado nada.
- **Fix:** `const m = Number(meta) > 0 ? Number(meta) : META_HORAS_DEFAULT;`

### LIB-13 · `calcularHoras` no coerciona a string y propaga `NaN` — MEDIUM
- **Ubicación:** `src/lib/ucpUtils.js:7-14`; call sites `AdminRegistros.jsx:48,66`
- **Problema:** sin `String(...)`, `.split` lanza `TypeError` si el valor no es texto; y si el formato está mal formado, `m1`/`m2` quedan `undefined` → `NaN`, que **sí** pasa el `if (!entrada || !salida)`.
- **Impacto:** columna "Horas" vacía/`NaN` en el CSV, y `Horas registradas: NaNh` **grabado en la BD** dentro de la descripción de la incidencia.
- **Fix:** `String(entrada).split(":")` + `if ([h1,m1,h2,m2].some(Number.isNaN)) return 0;`

---

## `src/lib/useAlumnoData.js` / `useEncargadoData.js`

### LIB-14 · El histórico se pide con `LIMIT 100` → las horas acumuladas dejan de contar — HIGH
- **Ubicación:** `src/lib/useAlumnoData.js:33` (bonos `:35` con 50, ajustes `:37` con 100); agregación en `:56`
- **Problema:** el servidor aplica `LIMIT` sobre `ORDER BY fecha DESC`. `sumarHorasRegistros` se presenta como **acumulado histórico** hacia la meta de 480 h, pero solo ve los últimos 100 fichajes. Con ~4 h por jornada, 480 h ≈ 120+ fichajes: **justo cuando el alumno está por terminar, el contador deja de subir**. `AlumnoPerfil.jsx:85` pide `"-fecha", 500` para el mismo cálculo → confirma que 100 es un valor equivocado, no una decisión.
- **Impacto:** progreso sub-contado; el alumno nunca llega al 100 % y no se dispara la constancia automática.
- **Fix:** subir el límite o, mejor, sumar en el servidor.

### LIB-15 · Un solo `try/catch` con `console.error` → pantalla vacía sin error visible — MEDIUM
- **Ubicación:** `src/lib/useAlumnoData.js:41-48`; idéntico en `useEncargadoData.js:36-41`
- **Problema:** las 8 peticiones son secuenciales dentro de un `try`: si la 2ª falla, las 6 siguientes **no se ejecutan** y los estados conservan sus valores iniciales. No hay estado de error expuesto al UI.
- **Fix:** `Promise.allSettled` (como ya hace `AdminHuellaCarbono.jsx:45`) + estado `error`.

### LIB-16 · `useEncargadoData` descarga todas las asignaciones y las trunca a 500 — MEDIUM
- **Ubicación:** `src/lib/useEncargadoData.js:25-30`
- **Problema:** `Asignaciones.list("-created_date", 500)` baja **todas** las del sistema y filtra en cliente. Al superar 500 globales, las del encargado (que pueden ser antiguas) quedan fuera del corte y **desaparecen de su lista** sin aviso. Ídem `Actividades` > 200.
- **Impacto:** alumnos que dejan de aparecer en "Mi área" → el encargado no puede validar sus fichajes.
- **Fix:** filtrar en servidor, o usar `ObtenerPersonalArea` (que ya existe y se invoca justo después).

---

## `src/lib/cerrarFichaje.js`

### LIB-17 · Sin idempotencia ni validación de estado → el doble clic duplica incidencias — HIGH
- **Ubicación:** `src/lib/cerrarFichaje.js:17-46`; call sites `AdminRegistros.jsx:46-56` (botón `:157` sin `disabled`), `EncargadoRegistros.jsx:55`
- **Problema:** no verifica `estado_registro === "abierto"` antes de cerrar (el servidor **sí** lo hace: `functions.js:149-151` devuelve 400), y el botón no se deshabilita durante el `await`. Dos clics = 2 `update` + **2 `Incidencias.create`**. Además las dos escrituras no son atómicas: si `Incidencias.create` falla, el fichaje ya quedó cerrado.
- **Impacto:** incidencias de "incumplimiento" duplicadas contra el mismo alumno (cuentan doble en su historial y en el reporte mensual), y fichajes históricos re-cerrados a otra hora por accidente.
- **Fix:** guarda de estado al inicio + estado `guardando` que deshabilite el botón.

### LIB-18 · `minSalida != null` es una guarda muerta: `aMinutos` devuelve `NaN`, nunca `null` — MEDIUM
- **Ubicación:** `src/lib/cerrarFichaje.js:11-14`, `:26-28`
- **Problema:** `aMinutos(undefined)` → `NaN`; `NaN != null` es **true**, así que la guarda no filtra nada y `NaN > 1035` es false. La intención (copiada de `functions.js:196`, donde `aMinutos` **sí** devuelve `null`) era evitar horas inválidas.
- **Impacto:** con una salida vacía o mal formada **no se genera la incidencia de incumplimiento** y nadie se entera: la regla de las 17:15 falla en silencio. En el servidor el mismo caso sí está cubierto → comportamiento divergente entre cierre por QR y cierre manual.
- **Fix:** `Number.isFinite(minSalida) && minSalida > HORA_LIMITE_MIN`.

### LIB-19 · `fecha_modificacion` se escribe en un formato distinto al del servidor — MEDIUM
- **Ubicación:** `src/lib/cerrarFichaje.js:21` vs `server/routes/functions.js:11-22`, `:168`
- **Problema:** la misma columna recibe **tres** formatos incompatibles: ISO-UTC real (cliente), ISO con reloj de México pero sufijo `Z` (servidor, desplazado 6 h — ver BUG-03 del informe principal) y `datetime('now')` (resto de tablas). Las comparaciones de SQLite son lexicográficas, así que cualquier orden o filtro por `fecha_modificacion` mezcla magnitudes incomparables.
- **Impacto:** la auditoría de "quién y cuándo modificó el fichaje" no es ordenable ni filtrable; `AdminValidacion` no puede reconstruir la secuencia real.
- **Fix:** un único helper de fecha en el servidor y que el cliente no invente su propio formato.

---

## `src/lib/huellaCarbono.js`

### LIB-20 · Ignora `CAT_MEDIDA_BODEGA`: kg sin campo `medida` se calculan como unidades — HIGH
- **Ubicación:** `src/lib/huellaCarbono.js:126` (mismo criterio en `:160-167`)
- **Código:** `const medida = reg.tipo_registro === "procesado" ? "kg" : (reg.medida || "unidades");`
- **Problema:** `catalogoBodega.js:34-37` define `medidaDeRegistroBodega` y exporta `CAT_MEDIDA_BODEGA` precisamente para resolver la medida por categoría cuando `reg.medida` falta; `reporteBodega.js:11` sí lo usa. Aquí el fallback es directamente `"unidades"`.
- **Impacto:** 100 kg de aluminio sin `medida` → rama de unidades → factor `FACTOR_EWASTE (1.4)` → **140 kg CO2e en vez de 900**. El reporte oficial de huella (con folio, persistido en `Reportes_Huella`) subestima drásticamente metales/cobre/aluminio y mezcla kg con unidades. Los reportes de bodega y de huella no cuadran entre sí.
- **Fix:** `reg.medida || CAT_MEDIDA_BODEGA[reg.categoria] || "unidades"`.

### LIB-21 · El periodo se calcula sobre listas truncadas a 1000 registros — HIGH
- **Ubicación:** call site `AdminHuellaCarbono.jsx:47-49` + filtro en cliente `:71-76`
- **Problema:** el servidor **no soporta filtros de rango** (`entities.js:249-252` solo hace igualdad), así que el rango se filtra en cliente sobre los últimos 1000 renglones DESC. Superados los 1000, las recepciones antiguas no llegan nunca al navegador.
- **Impacto:** al generar el reporte de un periodo viejo, el documento oficial con folio sale con cifras parciales o "Sin recepciones en el periodo" aunque sí existan; `total_co2e`/`total_kg` quedan mal **y se persisten**.
- **Fix:** soporte de rango en el servidor o paginación hasta agotar; como mínimo avisar si `lista.length === limit`.

### LIB-22 · `recepciones` cuenta líneas, no entregas — LOW-MED
- **Ubicación:** `src/lib/huellaCarbono.js:139-142`
- **Problema:** una entrega con 5 categorías (`bulkCreate` guarda un renglón por línea, todas con el mismo `fecha_recepcion`/`proveedor`) suma 5 en la columna "Recep." del PDF.
- **Fix:** contar distintos `(proveedor, fecha_recepcion, folio)`.

---

## `src/lib/categoriasDinamicas.js`

### LIB-23 · Un fallo transitorio cachea `[]` para siempre — MEDIUM
- **Ubicación:** `src/lib/categoriasDinamicas.js:17-22`
- **Código:** `.catch(() => { cache = []; return cache; })`
- **Problema:** el `catch` **escribe la caché** con una lista vacía y no registra nada. Solo se limpia con `invalidarCategoriasCustom()`, que únicamente llama el admin al crear/editar categorías. Un 401 o un corte de red en el arranque deja `cache = []` para toda la sesión.
- **Impacto:** todas las categorías personalizadas desaparecen de los selectores de inventario, stock, ventas y huella; el admin puede crear una categoría duplicada porque no ve la existente. Sin mensaje de error.
- **Fix:** no cachear en el error (`promesa = null; return [];` sin tocar `cache`).

### LIB-24 · `invalidarCategoriasCustom()` no cancela la promesa en vuelo → race — MEDIUM
- **Ubicación:** `src/lib/categoriasDinamicas.js:10-13`, `:17-22`; call site `AdminInventario.jsx:92`
- **Problema:** al invalidar se pierde la referencia a la promesa, pero su `.then(rows => cache = rows)` **sigue pendiente** y repuebla la caché con la lista anterior a la creación.
- **Impacto:** la categoría recién creada no aparece hasta recargar (intermitente, depende del orden de las peticiones).
- **Fix:** versionar la caché y comprobar la versión dentro del `.then`.

---

## Exportaciones CSV

### LIB-25 · Sin protección contra inyección de fórmulas de Excel — HIGH (seguridad)
- **Ubicación:** `src/lib/exportarCsv.js:4-6`
- **Problema:** escapa comillas y separadores pero no neutraliza los prefijos `=`, `+`, `-`, `@`, `Tab`. Los CSV incluyen **texto libre capturado por usuarios** (`proveedor`, `material`, `descripcion`, `motivo`, `nombre_completo`). Un valor como `=HYPERLINK("http://attacker","x")` o `=cmd|'/C calc'!A0` se ejecuta al abrir el archivo en Excel.
- **Impacto:** ejecución de fórmulas/DDE en la máquina del administrador que abre el reporte oficial.
- **Fix:** `const safe = /^[=+\-@\t]/.test(s) ? "'" + s : s;`

### LIB-26 · `AdminRegistros.exportarCSV` no escapa, no lleva BOM y no descarga en Firefox — HIGH
- **Ubicación:** `src/pages/admin/AdminRegistros.jsx:60-72`
- **Problema:** (1) `join(",")` sin comillas → cualquier coma **desplaza todas las columnas**, y los `undefined` salen como texto; (2) sin BOM y sin `charset=utf-8` → Excel interpreta ANSI y los acentos salen `JosÃ©`; (3) `\n` en vez de `\r\n`; (4) `a.click()` sin `appendChild` **no descarga en Firefox**; (5) nunca libera `URL.revokeObjectURL`. Todo esto ya está resuelto en `exportarCsv.js:descargarCsv`, que esta página no usa.
- **Fix:** sustituir el cuerpo por `descargarCsv(...)`.

### LIB-27 · `fechaArchivo()` usa la zona del navegador y `fechaHoy()` usa America/Mexico_City — LOW
- **Ubicación:** `src/lib/exportarCsv.js:22-27` vs `src/lib/ucpUtils.js:98-103`
- **Problema:** el repo asume explícitamente que el entorno puede correr en UTC ("el preview corre en UTC") y por eso `fechaHoy()` fija la zona. `fechaArchivo()` no: en un entorno UTC, a las 19:00 de México ya es el día siguiente.
- **Impacto:** nombres de archivo de reportes oficiales desfasados un día respecto del periodo real.

---

## `src/lib/generarConstancia.js`

### LIB-28 · La constancia oficial imprime el día anterior — HIGH
- **Ubicación:** `src/lib/generarConstancia.js:144-151`; usada en `:110`
- **Código:** `const d = new Date(fecha); return d.toLocaleDateString("es-MX", …)`
- **Problema:** confirmado el formato de entrada: `fecha_inicio`/`fecha_fin` se capturan con `<Input type="date">` (`AdminConstancias.jsx:215,219`) → `"2026-05-01"`, guardado como TEXT. `new Date("2026-05-01")` = medianoche **UTC**; en America/Mexico_City → `2026-04-30T18:00` → **"30 de abril de 2026"**. El helper correcto (`parseFechaLocal`) existe en `ucpUtils.js:70-76` y se usa en los otros reportes; aquí se reimplementó mal.
- **Impacto:** el periodo impreso en la constancia (documento "válido como comprobante oficial de participación") está **corrido un día en ambos extremos**.
- **Fix:** usar `parseFechaLocal`.

### LIB-29 · `horas_completadas` (REAL) se imprime sin formato — MEDIUM
- **Ubicación:** `src/lib/generarConstancia.js:104-106`
- **Problema:** interpolación directa de un REAL → `479.90000000000003`. Y `!= null` deja pasar `0` → imprime "Horas completadas: 0 hrs" en una constancia de término.
- **Fix:** `Number.isFinite(h) && h > 0` y redondear/formatear con `toLocaleString`.

---

## `src/lib/AuthContext.jsx` / `src/App.jsx`

### LIB-30 · `navigateToLogin()` se invoca **durante el render** — MEDIUM
- **Ubicación:** `src/App.jsx:72-79`
- **Problema:** `navigateToLogin` asigna `window.location.href`: es un efecto secundario en fase de render, que con StrictMode/renders concurrentes se ejecuta más de una vez y en cada re-render mientras `authError` siga activo. Además `redirectToLogin` usa el href **actual completo** como `returnTo`: si el 401 ocurre estando en `/login`, se auto-referencia y **encadena parámetros en cada vuelta** (`/login?returnTo=…/login?returnTo=…`).
- **Fix:** moverlo a un `useEffect` y no usar la URL actual si ya se está en `/login`.

### LIB-31 · `checkUserAuth` no limpia `authError` → bloqueo persistente tras re-autenticarse — MEDIUM
- **Ubicación:** `src/lib/AuthContext.jsx:43-63` (rama de éxito `:46-51`); consumido por `ProtectedRoute.jsx:26-30`
- **Problema:** `ProtectedRoute` evalúa `if (authError) return unauthenticatedElement;` **antes** de `if (!isAuthenticated)`. Como `authError` solo se resetea en `checkAppState`, una llamada posterior a `checkUserAuth()` que termine en éxito deja `authError` puesto → se sigue renderizando `<Navigate to="/login" />`.
- **Impacto:** bucle de expulsión al login aun con token válido, hasta una recarga completa.
- **Fix:** añadir `setAuthError(null);` en la rama de éxito.

### LIB-32 · `logout()` redirige a la misma URL protegida y se pierde el `returnTo` — LOW
- **Ubicación:** `src/lib/AuthContext.jsx:66-76`; `src/App.jsx:90`
- **Problema:** `logout` hace `window.location.href = <URL actual>`: recarga la misma ruta protegida (sin token) en vez de ir al login, y el `Navigate` de `ProtectedRoute` no propaga `returnTo` pese a que `redirectToLogin`/`safeReturnTo` existen justo para eso.
- **Fix:** `base44.auth.logout('/login')` y propagar `returnTo` en el `Navigate`.

---

## `src/lib/imagen.js`

### LIB-33 · Una excepción dentro de `img.onload` deja la promesa **sin resolver** → subida colgada para siempre — HIGH
- **Ubicación:** `src/lib/imagen.js:17-32`
- **Problema:** no hay `try/catch` dentro del handler. `canvas.getContext("2d")` puede devolver `null` → `ctx.drawImage` lanza `TypeError`; `canvas.toDataURL` lanza `SecurityError`/`DOMException` en canvases enormes (con un aspect ratio extremo, `Math.round(width*escala)` puede dar 0 → canvas 0×0). **Una excepción dentro de un callback de evento no rechaza la promesa**: queda pendiente eternamente.
- **Impacto:** el formulario de evidencias se queda en "Subiendo…" sin error y sin timeout; el usuario debe recargar y pierde lo capturado.
- **Fix:** `try { … } catch (err) { reject(err); }` dentro de `onload` + validar `ctx` y dimensiones.

### LIB-34 · JPEG sobre canvas transparente → las transparencias se vuelven negras — MEDIUM
- **Ubicación:** `src/lib/imagen.js:26-29`
- **Problema:** el canvas nace con alpha 0 y JPEG no tiene canal alfa: lo transparente se compone como **negro**. No se pinta un fondo antes de `drawImage`.
- **Impacto:** capturas de pantalla y logos PNG con fondo transparente (evidencias muy comunes) se guardan con fondo negro en la BD.
- **Fix:** `ctx.fillStyle = "#fff"; ctx.fillRect(0,0,width,height);` antes de `drawImage`.

---

## `src/lib/push.js`

### LIB-35 · Rutas `/api/push` hardcodeadas ignoran `VITE_API_URL` — MEDIUM
- **Ubicación:** `src/lib/push.js:11, 43` frente a `src/api/base44Client.js:5`
- **Problema:** `base44Client` resuelve el backend con `import.meta.env.VITE_API_URL || …`; `push.js` fija siempre el origen relativo. Si se define `VITE_API_URL` (mecanismo documentado para producción/Hostinger, ver `start-hostinger.js`), las suscripciones push viajan al servidor **equivocado**. Y el fallo es invisible: `if (!res.ok) return false;` y `catch { console.warn }`.
- **Impacto:** notificaciones push que nunca llegan en despliegues con backend remoto, sin ningún error visible.
- **Fix:** exportar `API_BASE` desde `base44Client.js` y construir las URLs de push a partir de él.

---

## `src/lib/reporteBodega.js`

### LIB-36 · El desglose por categoría suma kg + unidades y etiqueta con el catálogo, no con el registro — MEDIUM
- **Ubicación:** `src/lib/reporteBodega.js:11` vs `:60-64`
- **Problema:** los totales globales (`:19-22`) sí separan por `medidaDe(m)`, pero el desglose por categoría agrupa solo por `categoria` y suma **todas** las cantidades, etiquetando con `catMedida[c.value]`. Si una categoría admite ambas medidas (`Electronicos_Reciclados` con `tipo_registro:"procesado"` → kg y `"articulo"` → unidades, ambos escritos por `AdminElectronicos.jsx:178-182`), se suman 3 kg + 12 u = "15 u". Además ignora `tipo_registro`, que `catalogoBodega.js:35` y `huellaCarbono.js:126` sí consideran.
- **Impacto:** totales por categoría incorrectos y con unidad equivocada; no reconcilian con el resumen del mismo PDF ni con el reporte de huella.
- **Fix:** usar `medidaDeRegistroBodega(m)` y agrupar por `categoria|medida`.

---

## `server/routes/functions.js` (afecta los cálculos del cliente)

### LIB-37 · `calcularHoras` del servidor devuelve 0 en turnos que cruzan medianoche — HIGH
- **Ubicación:** `server/routes/functions.js:157-165`
- **Código:** `if (ini == null || fin == null || fin <= ini) return 0;` (sin `+24h`) y `const estado = horas < 0.5 ? 'incompleto' : 'cerrado';`
- **Problema:** el cliente **sí** soporta el cruce de medianoche (`redondeo.js:12-16`, `ucpUtils.js:11-12`). Un fichaje 22:00→02:00 se guarda con `horas = 0` y `estado_registro = 'incompleto'`, mientras el dashboard cuenta **4 h**. `fin === ini` (0 min) también cae en `incompleto`.
- **Impacto:** la BD y el UI divergen; la incidencia de las 17:15 notifica `Horas registradas: 0h` (`:200`) y `verificarConstanciaAutomatica` se alimenta con datos incoherentes. El alumno ve 4 h que ningún reporte oficial respalda. **Es la otra mitad del BUG-03 del informe principal** (que produce el efecto inverso: 23 h).
- **Fix:** replicar la regla del cliente y, preferentemente, compartir un único módulo de cálculo.

---

## `src/hooks/useRecargarAlVolver.js`

### LIB-38 · Escritura de un `ref` durante el render — LOW
- **Ubicación:** `src/hooks/useRecargarAlVolver.js:8-9`
- **Problema:** `recargarRef.current = recargar;` en el cuerpo del componente es un efecto secundario en fase de render; con StrictMode (doble invocación) o renderizado concurrente el ref puede apuntar a un callback de un render descartado. Los listeners sí tienen limpieza correcta (`:22-25`).
- **Fix:** `useEffect(() => { recargarRef.current = recargar; });`

---

## Nota de alcance

No se encontraron fugas de listeners/intervals sin limpieza (los `useEffect` revisados devuelven su limpieza correctamente) ni comparadores de `sort` que devuelvan booleano. Los únicos `==` hallados (`cerrarFichaje.js:27`, `reportePersonal.js:39`) son intencionales (`== null`), salvo el caso descrito en LIB-18.
