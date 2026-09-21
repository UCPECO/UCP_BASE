# REVISIÓN DE BUGS — UCPECO/UCP_BASE
## Resumen ejecutivo

**Fecha:** 2026-09-21 · **Commit:** `03b4a90` · **Rama:** `main`
**Stack:** React 18 + Vite (~21.300 líneas, 167 archivos) · Express 4 + better-sqlite3

| Métrica | Valor |
|---|---|
| Defectos documentados | **131** |
| Críticos | **7** |
| Altos | **28** |
| Medios | **63** |
| Bajos | **33** |
| Verificados empíricamente (ejecutando código) | 3 |
| Falsos positivos descartados | 1 |

**Informes detallados:**
- `REVISION_BUGS.md` — backend completo + frontend transversal (BUG-01 … BUG-47)
- `BUGS_LIB_API.md` — `src/lib` y `src/api` (LIB-01 … LIB-38)
- `BUGS_ADMIN.md` — `src/pages/admin` (47+ y ampliándose)

---

## 1. Verificaciones empíricas

No me limité a leer el código. Tres hallazgos se comprobaron ejecutando:

**✅ BUG-01 confirmado — la aplicación no arranca.** Instalación limpia desde cero:
```
> npm install           → added 121 packages in 27s
> node index.js
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'web-push'
  imported from ...\server\lib\push.js
```
`web-push` se importa en `server/lib/push.js:5` pero **no está en `server/package.json`**. No hay lockfile en el repo. Quien siga el README obtiene un servidor que no inicia.

**✅ Aislada la causa:** instalando solo `web-push` (`npm install web-push --no-save`) el servidor **arranca correctamente y se queda escuchando** en el puerto 3001. Es el único bloqueante; `better-sqlite3` sí resuelve su binario nativo pese al aviso de `allow-scripts` de npm 11.

**✅ LIB-02 confirmado — ruta inalcanzable.** Orden real de registro en `server/routes/entities.js`:
```
331: router.post('/:entity')          ← solo un segmento, no captura "bulk"
426: router.put('/:entity/:id')       ← captura /Actividades/bulk con id="bulk"
547: router.post('/:entity/bulk')     ✓ funciona
595: router.put('/:entity/bulk')      ✗ CÓDIGO MUERTO, nunca se alcanza
```

**✅ LIB-01 confirmado — tipos incompatibles.** `setup.js:175` declara `activa INTEGER DEFAULT 1`; `AlumnoEncuestas.jsx:24` envía `filter({ activa: true })` → `?activa=true`. En SQLite un valor INTEGER/REAL es **siempre menor** que cualquier TEXT, así que `1 = 'true'` nunca es verdadero.

---

## 2. Las seis causas raíz sistémicas

Los 131 defectos no son independientes: la mayoría son instancias de seis problemas de fondo. **Arreglar la causa elimina decenas de síntomas.**

### Causa raíz A — No existe una única fuente de verdad para el cálculo de horas
Las horas son la métrica central del negocio (de ellas dependen constancias y reportes oficiales). Hoy se calculan de **cuatro formas distintas**:

| Cálculo | Ubicación | Regla |
|---|---|---|
| Oficial (dashboard) | `lib/redondeo.js` → `minutosOficiales` | redondeo a múltiplo de 10 min |
| PDF de personal | `lib/reportePersonal.js:7-14` | `mins/60` crudo, sin redondear |
| PDF del alumno | `lib/generarReporte.js:23-27` | `mins/60` + fallback `"0:0"` |
| Servidor (BD) | `functions.js:157-165` | `round(mins/60*100)/100`, **sin** cruce de medianoche |
| Recálculo de validación | `lib/gestion.js:66-79` | redondeo 10 min, **con** cruce de medianoche |

**Instancias:** BUG-03 (23 h fantasma), LIB-07 (16 h fantasma), LIB-10, LIB-37, ADMIN-1, ADMIN-31.
**Ejemplo concreto:** un fichaje de 08:00 a 08:07 da **0 h** en el dashboard, **0,12 h** en el PDF y **0,12 h** en la BD. Un turno de 22:00 a 02:00 da **0 h** en la BD y **4 h** en el dashboard.
**Acción:** extraer un único módulo de cálculo de horas y usarlo en cliente *y* servidor.

### Causa raíz B — Confusión UTC ↔ America/Mexico_City en todo el código
El servidor guarda `datetime('now')` (**UTC**, resolución de 1 segundo). El negocio opera en hora de México (**UTC−6**). Cada archivo resuelve la conversión a su manera, y varios no la resuelven:

- **BUG-03** — `ahoraMexico()` devuelve un `.toISOString()` que es hora local etiquetada como UTC (6 h de error) y se guarda en `registros_qr.fecha_modificacion`.
- **BUG-38** — `AdminQr.jsx:152` compara la expiración del QR contra la fecha UTC; el servidor contra la local. Entre las 18:00 y las 24:00 el panel dice "expirado" y el servidor sigue aceptando el código.
- **LIB-09** — `new Date("2026-09-01")` es medianoche UTC → los fichajes del **día 1** se asignan al mes anterior.
- **LIB-28** — la **constancia oficial** imprime el periodo corrido un día en ambos extremos.
- **LIB-19** — la misma columna recibe tres formatos incompatibles; el orden lexicográfico de SQLite los mezcla.
- **BUG-43, BUG-44, ADMIN-8, ADMIN-47** — más instancias del mismo patrón.

El repo **ya tiene** los helpers correctos (`ucpUtils.parseFechaLocal`, `AdminPasesLista.jsx:22`) pero se usan de forma inconsistente. El commit `03b4a90` corrigió exactamente este bug en un sitio; quedan al menos ocho.
**Acción:** un único módulo de fecha/hora con la zona horaria resuelta, y prohibir `new Date(cadena)` y `.toISOString()` fuera de él.

### Causa raíz C — El modelo de permisos por área no está implementado en el servidor
El propio código declara la intención (`entities.js:44`: *"'encargado' gestión de su área"*), pero **ninguna consulta aplica el filtro de área** para ese rol:

- **BUG-11** — un encargado lee los datos personales de **toda** la organización (`GET /api/User` devuelve nombre, email, teléfono, carrera, matrícula y foto de todas las áreas).
- **BUG-04** — `PUT /:entity/bulk` sin `filter` ejecuta un `UPDATE` **sin cláusula WHERE**, y `checkWrite` solo comprueba "¿es admin o encargado?", nunca la propiedad de las filas. Un encargado puede aprobar todas las evidencias del sistema con una petición.
- **BUG-15** — `RevisarIncidenciasSemanales` no tiene **ningún** check de rol: cualquier voluntario pone todas las asignaciones en `bajo_revision`.
- **BUG-07** — el rol se lee del JWT en `functions.js`, no de la BD. Un encargado degradado conserva privilegios 7 días y **se salta la validación de horario laboral**.
- **BUG-02** — fichar sin `token` y sin `manual` registra un fichaje `es_manual = 0`, indistinguible de un escaneo QR real.
- **BUG-05** — un token de sesión funciona como token de restablecimiento de contraseña.
- **BUG-16** — `PUT /api/me` permite auto-asignarse `area_asignada`.

**Acción:** un middleware único que resuelva el usuario fresco desde la BD y aplique el scoping por área de forma centralizada, en lugar de repetir checks ad-hoc en cada ruta.

### Causa raíz D — Los errores se tragan en silencio
Patrón repetido en decenas de sitios: `catch {}`, `.then()` sin `.catch`, `console.error` y seguir. El resultado es que **el fallo se ve como "no hay datos"**, que es indistinguible del estado vacío legítimo:

- **BUG-40** — seis pantallas se quedan en esqueleto de carga para siempre ante un 429 o un 500.
- **BUG-47** — el chat congela los mensajes sin avisar cuando caduca el token.
- **LIB-03** — ningún manejo de 401 en el cliente API: el usuario ve "0 horas" en lugar de ser redirigido al login.
- **LIB-15** — ocho peticiones secuenciales en un solo `try`: si la segunda falla, las seis restantes no se ejecutan.
- **LIB-23** — un fallo transitorio cachea una lista vacía **para toda la sesión**.
- **LIB-33** — una excepción dentro de `img.onload` deja la promesa sin resolver: la subida queda colgada en "Subiendo…" sin timeout.
- **BUG-37** — `entities.js` **descarta en silencio** los campos que no existen en la tabla. Esto es lo que mantuvo oculto el bug de la bitácora durante meses.

**Acción:** un estado de error visible y reutilizable, y que el servidor responda con un aviso (o un 400) cuando el cliente envíe campos inexistentes.

### Causa raíz E — `LIMIT` silencioso presentado como "total acumulado"
El servidor solo aplica `LIMIT` si el cliente lo pide (BUG-36), y el cliente pide límites fijos que luego suma como si fueran el histórico completo:

- **LIB-14** — `useAlumnoData` pide los últimos **100** fichajes y los presenta como acumulado hacia la meta de 480 h. Con ~4 h por jornada son ~120 fichajes: **el contador deja de subir justo cuando el alumno va a terminar**. `AlumnoPerfil.jsx:85` pide 500 para el mismo cálculo, lo que prueba que 100 es un error y no una decisión.
- **LIB-21** — el reporte de huella filtra el periodo en cliente sobre los últimos **1000** renglones; las recepciones antiguas no llegan nunca, y el documento oficial con folio se **persiste** con cifras parciales.
- **LIB-16** — `useEncargadoData` descarga todas las asignaciones con `LIMIT 500` y filtra en cliente: al crecer la tabla, los alumnos del encargado desaparecen de su lista.
- **ADMIN-32** — KPIs "acumulados" calculados sobre los últimos 500 registros de cada tabla.

**Acción:** agregar en el servidor (`SUM`, `COUNT`) en lugar de descargar y sumar en el cliente; y avisar siempre que `lista.length === limit`.

### Causa raíz F — Escrituras múltiples sin atomicidad ni idempotencia
better-sqlite3 es síncrono y soporta transacciones, pero no se usan:

- **BUG-13** — aprobar dos veces la misma evidencia inserta **dos bonos** y duplica las horas (no hay check de `estado_evidencia`).
- **BUG-14** — el `bulk create` inserta fila a fila sin transacción: si la quinta falla, las cuatro primeras quedan y el cliente reintenta → duplicados.
- **LIB-17** — doble clic en "Confirmar salida" duplica la incidencia de incumplimiento contra el alumno.
- **ADMIN-44** — la venta se graba en dos escrituras (salida + venta) sin rollback: si la segunda falla queda una **salida huérfana** que descuenta inventario sin venta asociada.
- **BUG-24** — sin claves foráneas reales (`foreign_keys = ON` pero ninguna columna declara `REFERENCES`): borrar un usuario deja huérfanos sus fichajes, evidencias, bonos, asignaciones, incidencias, notificaciones y mensajes.

**Acción:** `db.transaction(...)` en toda operación multi-escritura, guardas de idempotencia, y claves foráneas reales.

---

## 3. Prioridad de arreglo

### Arreglar hoy (bloquean o corrompen datos)

| # | Bug | Por qué es urgente |
|---|---|---|
| 1 | **BUG-01** `web-push` no declarado | La app **no arranca**. Una línea en `package.json`. |
| 2 | **BUG-02** fichaje sin QR | Fraude de horas trivialmente explotable por cualquier participante. |
| 3 | **BUG-03 + LIB-37** horas 23 h / 0 h | Corrompe la métrica central y dispara constancias indebidas. |
| 4 | **BUG-04** bulk sin WHERE | Un encargado corrompe toda la BD con una petición. |
| 5 | **LIB-02** ruta bulk inalcanzable | "Cerrar/Reabrir área" no funciona; es código muerto. |
| 6 | **BUG-15** sin check de rol | Cualquier voluntario bloquea todas las asignaciones. |
| 7 | **BUG-05** reset-password | Un token robado = toma de control permanente. |
| 8 | **LIB-01** filtros booleanos | Las encuestas del alumno siempre salen vacías. |
| 9 | **BUG-13** doble aprobación | Duplica horas con un doble clic. |
| 10 | **BUG-06** falta `trust proxy` | Techo de ~16 usuarios simultáneos antes de 429 globales. |

### Arreglar esta semana

| # | Bug | Impacto |
|---|---|---|
| 11 | **BUG-37** bitácora `detalle`/`detalles` | La auditoría no muestra detalles ni fechas; el filtro por fecha oculta los eventos de seguridad. |
| 12 | **BUG-11** PII sin scoping | Un encargado lee los datos personales de toda la organización. |
| 13 | **BUG-07** rol desde el JWT | Privilegios obsoletos hasta 7 días. |
| 14 | **LIB-14** `LIMIT 100` | El progreso del alumno deja de contar cerca de la meta. |
| 15 | **LIB-28** constancia con día corrido | Documento oficial incorrecto. |
| 16 | **BUG-10** mensajes perdidos en el chat | Dos mensajes en el mismo segundo: el segundo desaparece para siempre. |
| 17 | **LIB-25** inyección de fórmulas CSV | Ejecución en el Excel del administrador. |
| 18 | **LIB-20** huella de carbono | 140 kg CO2e en vez de 900 para aluminio; reporte oficial persistido. |
| 19 | **BUG-12** folios duplicados | Numeración de documentos administrativos repetida. |
| 20 | **LIB-33** subida de imagen colgada | Evidencias que se quedan en "Subiendo…" sin salida. |

### Deuda estructural (planificar)
Causas raíz **A** (módulo único de horas), **B** (módulo único de fechas) y **C** (middleware de permisos por área). Abordan ~60 de los 131 defectos de una vez.

---

## 4. Correcciones y falsos positivos

Registro explícito de lo que **descarté** tras verificar, para no propagar ruido:

- **❌ "Al eliminar una venta el stock no regresa" (marcado Critical por un revisor).** **Falso positivo.** Verificado: la columna `ventas.salida` existe (`setup.js:591`), `AdminVentas.jsx:126` la pobla con `salida?.id`, `entities.js:449-453` borra la salida ligada al eliminar la venta, y el stock se **deriva** de `entradas − salidas` (`AdminVentas.jsx:73-81`). El mecanismo funciona. Lo que sí es real es la **falta de atomicidad** entre las dos escrituras (ADMIN-44): si la segunda falla queda una salida huérfana que descuenta inventario sin venta.
- **❌ "XSS en el chat".** Descartado: el único `dangerouslySetInnerHTML` del proyecto está en `components/ui/chart.jsx:61` (código vendorizado de shadcn/recharts). Los mensajes se renderizan como texto, y la CSP (`script-src 'self'`) añade una segunda barrera.
- **❌ "`app.get('*')` incompatible con Express 5".** Descartado: `package.json` fija `express ^4.21.0`, donde el patrón es válido.
- **❌ "Fuga de `setInterval` en el frontend".** Descartado: los cuatro `setInterval` del proyecto (`CampanaNotificaciones.jsx:69`, `Comunidad.jsx:86,120`, `Fichar.jsx:57`) **devuelven su `clearInterval`** correctamente. El único defecto real de limpieza es el de la cámara (BUG-45).
- **❌ "Inyección SQL en los filtros de `entities.js`".** Descartado: tanto los nombres de columna como los de tabla pasan por listas blancas (`entityMap`, `cols.has(k)` de `PRAGMA table_info`). El diseño es correcto en este punto.
- **⚠️ Matiz sobre `respaldarBD()`.** El `wal_checkpoint(TRUNCATE)` previo hace que copiar solo el archivo principal sea consistente, porque better-sqlite3 es síncrono y ninguna escritura puede intercalarse. **No es un bug**, aunque merece un comentario en el código.

---

## 5. Nota sobre el proceso

La revisión combinó análisis directo y cuatro revisores en paralelo sobre ámbitos disjuntos. Tres de los cuatro agotaron su presupuesto de turnos explorando sin llegar a escribir el informe; se relanzaron con ámbito acotado, mayor presupuesto y la instrucción de **escribir el informe de forma incremental** en vez de acumularlo. Todo hallazgo Critical y High de los revisores fue **reverificado por mí** contra el código fuente antes de incluirse aquí — de ahí la sección 4.

Cobertura: **backend 100 %** (todas las rutas, middlewares y librerías, línea por línea) · `src/lib` y `src/api` **100 %** · `src/pages/admin` **~60 %** (los 9 archivos mayores; `BUGS_ADMIN.md` sigue ampliándose) · `src/pages/alumno`, `src/pages/encargado`, `src/components/ucp` y `src/components/ui`: **parcial**, mediante barrido de patrones de alto riesgo sobre los 167 archivos del frontend.
