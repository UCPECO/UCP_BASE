# Revisión de bugs — UCPECO/UCP_BASE

**Fecha:** 2026-09-21 · **Commit revisado:** `03b4a90` · **Rama:** `main`
**Alcance:** backend completo (revisado línea por línea) + frontend (en curso)

Stack: React 18 + Vite (frontend, ~21.3k LOC / 167 archivos) · Express 4 + better-sqlite3 (backend)

---

# PARTE 1 — BACKEND (revisión directa, confirmada)

## 🔴 CRÍTICO

### BUG-01 · `web-push` no está declarado en `package.json` → el servidor NO arranca
- **Ubicación:** `server/lib/push.js:5` · `server/package.json`
- **Código:** `import webpush from 'web-push';`
- **Problema:** `web-push` no aparece en `dependencies` (solo están bcryptjs, better-sqlite3, cors, express, jsonwebtoken, uuid). No hay `package-lock.json` ni `node_modules` en el repo.
- **Impacto:** Una instalación limpia siguiendo el README (`cd server && npm install && npm start`) falla con `ERR_MODULE_NOT_FOUND: Cannot find package 'web-push'`. **La aplicación no inicia.** El import está en la cadena `index.js → lib/gestion.js → lib/push.js`, así que no hay forma de esquivarlo.
- **Fix:** `cd server && npm install web-push` y commitear el lockfile.

### BUG-02 · Fichaje sin QR: se registra como escaneo legítimo
- **Ubicación:** `server/routes/functions.js:44-52`, `:118`
- **Código:**
  ```js
  let areaQr = null;
  if (!esManual && token) { /* ...validar QR... */ }
  // ...
  const areaFichaje = areaQr || area || user.area_asignada || null;
  ```
- **Problema:** La validación del QR solo ocurre si `!esManual && token`. Un cliente que envía `{ asignacion_id }` **sin `token` y sin `manual`** omite por completo la validación y crea un registro con `es_manual = 0`. Además el `area` se acepta del cuerpo de la petición, justo lo que el comentario dice impedir ("así nadie puede inventar ?area=X").
- **Impacto:** **Fraude de horas.** Cualquier participante puede fichar desde su casa con `fetch('/api/functions/ProcesarFichajeQR', {body:{asignacion_id:'x'}})` y queda registrado como un escaneo QR legítimo, sin incidencia de "fichaje manual" y sin aviso al encargado. Anula el control "fichajes solo por QR" del commit `36aee02`. También puede atribuirse el fichaje a un área falsa, contaminando estadísticas y notificando al encargado equivocado.
- **Fix:** Exigir token cuando no es manual: `if (!esManual) { if (!token) return res.status(400).json({error:'Debes escanear el código QR del área'}); ... }`. Ignorar `req.body.area` cuando no haya QR válido.

### BUG-03 · Un fichaje olvidado puede acreditar 23 horas
- **Ubicación:** `server/lib/gestion.js:262-271` (`cerrarFichajesOlvidados`) + `:66-79` (`horasValidadasDe`)
- **Código:**
  ```js
  // cierre automático
  let mins = (h2*60+m2) - (h1*60+m1);
  if (mins < 0) mins = 0;
  UPDATE registros_qr SET hora_salida = ?  -- = horaCierre, p.ej. '18:00'
  // recálculo posterior
  let d = (h2*60+m2) - (h1*60+m1);
  if (d < 0) d += 24 * 60;   // <-- asume cruce de medianoche
  ```
- **Problema:** Las dos funciones discrepan. Si `hora_entrada` es posterior a `hora_cierre` (entrada 19:00, cierre configurado 18:00), el cierre automático guarda `hora_salida='18:00'` y `horas=0`, produciendo un registro imposible (salida anterior a la entrada). Cuando un admin lo valida, `horasValidadasDe` recalcula: `d = 1080 - 1140 = -60` → `+1440` = **1380 min = 23 h**.
- **Impacto:** **Inflación masiva de horas** con solo pulsar "validar". Camino realista: el admin reduce `hora_cierre` en Configuración y todos los fichajes abiertos posteriores a esa hora se convierten en 23 h. También afecta a roles no incluidos en `ROLES_PARTICIPANTE` (ver BUG-08), que no pasan la validación de horario y pueden fichar a cualquier hora. Dispara constancias automáticas indebidas (la meta por defecto es 480 h; con 21 fichajes así se alcanza).
- **Fix:** En `cerrarFichajesOlvidados`, si `mins < 0` usar `hora_salida = hora_entrada` (0 h) en lugar de `horaCierre`. Y en `horasValidadasDe` no asumir cruce de medianoche: comparar `fecha` + hora, o descartar `d < 0` como dato corrupto.

### BUG-04 · `PUT /api/:entity/bulk` sin cláusula WHERE y sin scoping por área
- **Ubicación:** `server/routes/entities.js:475-505`
- **Código:**
  ```js
  if (!checkWrite(req, res, req.params.entity, {})) return;
  // ...
  if (filter && Object.keys(filter).length > 0) { /* construir WHERE */ }
  db.prepare(query).run(...values);   // sin WHERE si filter viene vacío
  ```
- **Problema:** Dos fallos combinados. (1) Si `filter` se omite o viene vacío, el `UPDATE` se ejecuta **sin WHERE**: modifica todas las filas de la tabla. (2) `checkWrite` para un `encargado` solo comprueba `esAdminOEncargado(me)`, **nunca que las filas pertenezcan a su área**. En entidades `PARTICIPANT_OWN` (p.ej. `Evidencias`) la rama `if (esAdminOEncargado(me)) return true;` se ejecuta antes que cualquier comprobación de propiedad.
- **Impacto:** Un **encargado de un área** puede enviar `PUT /api/Evidencias/bulk` con `{"$set":{"estado_evidencia":"aprobada"}}` y **aprobar todas las evidencias de toda la organización**, sin filtro y sin dejar rastro por registro. Lo mismo con `Constancias`, `Bonos`(admin), `Evaluaciones_Alumno`, `Reportes_Huella`, `Incidencias`. Corrupción masiva de datos con un solo request.
- **Fix:** Rechazar `$set` sin `filter` no vacío (`400`). Y para `encargado`, forzar siempre una condición de área/propiedad en el WHERE.

### BUG-05 · `/reset-password` acepta un token de sesión como token de restablecimiento
- **Ubicación:** `server/routes/auth.js:158-175`
- **Código:**
  ```js
  router.post('/reset-password', (req, res) => {        // sin authLimiter
    const decoded = jwt.verify(resetToken, JWT_SECRET);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, decoded.id);
  ```
- **Problema:** No se distingue el *propósito* del token: cualquier JWT firmado con `JWT_SECRET` sirve, incluido el token de sesión de 7 días que devuelve `/login`. Además el endpoint **no tiene `authLimiter`** (a diferencia de los demás de auth) y no exige captcha. Y ningún código genera jamás un `resetToken`: `/reset-password-request` es un no-op que solo devuelve `{ok:true}`.
- **Impacto:** (1) **Takeover permanente:** quien obtenga un token de sesión (XSS, PC compartido, historial con `?token=`, logs) puede fijar una contraseña nueva y conservar la cuenta indefinidamente, más allá de la caducidad del token. (2) El flujo "Olvidé mi contraseña" está **muerto**: `ResetPassword.jsx:12` lee `?token=` de la URL y nadie lo genera, así que la pantalla siempre cae en la rama "sin token".
- **Fix:** Firmar tokens de reset con un claim distintivo y vida corta: `jwt.sign({id, purpose:'reset'}, JWT_SECRET, {expiresIn:'15m'})`, y validar `decoded.purpose === 'reset'`. Añadir `authLimiter`. O eliminar el endpoint si el reset siempre lo hace el admin.

## 🟠 ALTO

### BUG-06 · Falta `trust proxy`: rate limits y bloqueos son GLOBALES en producción
- **Ubicación:** `server/index.js` (ausente) · `server/middleware/security.js:24-49`, `:60`
- **Problema:** `req.ip` se usa como clave de todos los limitadores, pero nunca se configura `app.set('trust proxy', ...)`. El README recomienda explícitamente desplegar tras Nginx/Caddy/Hostinger. Detrás de un proxy, `req.ip` es **la IP del proxy para todos los usuarios**.
- **Impacto:** Cuantificable: `Comunidad.jsx:120` hace polling cada 4 s (15 req/min) + canales cada 20 s (3 req/min) + campana de notificaciones. Son ~20-25 req/min **por usuario**. Con el límite general de 400/min compartido, **a partir de ~16 usuarios conectados toda la API empieza a devolver 429**. Y como `Comunidad.jsx:109` traga los errores en silencio (`catch {}`), la app simplemente deja de actualizarse sin mostrar nada. Además `authLimiter` (30 req/5 min global) bloquea los logins en hora punta, y `loginBloqueado(email, ip)` permite que **5 intentos fallidos bloqueen una cuenta para toda la organización** durante 15 min.
- **Fix:** `app.set('trust proxy', 1)` (o el número de saltos real del despliegue) antes de los middlewares.

### BUG-07 · El rol se lee del JWT en decisiones de seguridad
- **Ubicación:** `server/routes/functions.js:60`, `:181` · `server/routes/mensajes.js:118`
- **Código:** `const esParticipante = ROLES_PARTICIPANTE.includes(user.role);` donde `user = req.user` (payload del JWT)
- **Problema:** El JWT lleva el `role` embebido con validez de 7 días. `entities.js` hace las cosas bien (`getMe(req)` lee el rol fresco de la BD, con el comentario "el JWT puede estar desactualizado"), pero `functions.js` y el `/directorio` de `mensajes.js` confían en el token.
- **Impacto:** Un **encargado degradado a voluntario conserva sus privilegios hasta 7 días**: `esParticipante` sale `false`, así que **se salta la validación de horario laboral** (puede fichar de madrugada o en fin de semana) y **el límite de salida de las 17:15**. Un usuario archivado/dado de baja sigue fichando igual. Y al revés: un voluntario ascendido a encargado no puede pasar lista hasta que renueve el token.
- **Fix:** Releer el usuario de la BD en cada petición sensible (`const me = db.prepare('SELECT id, role, area_asignada, archivado FROM users WHERE id=?').get(req.user.id)`) y rechazar si `archivado`. Idealmente añadir un `token_version` en `users` e invalidarlo al cambiar rol/baja.

### BUG-08 · Roles fantasma: `residente` y `practicante` no existen en ningún otro sitio
- **Ubicación:** `server/lib/gestion.js:186` vs `server/routes/functions.js:59`, `:180`, `server/routes/auth.js:99`, `server/lib/gestion.js:96`
- **Código:**
  ```js
  // resumen semanal
  WHERE role IN ('servicio_social','voluntario','practicas_profesionales','residente','practicante')
  // en TODOS los demás sitios
  const ROLES_PARTICIPANTE = ['voluntario','servicio_social','practicas_profesionales'];
  ```
- **Problema:** Dos listas de "quién es participante" divergentes. `residente`/`practicante` no están en `ROLES_VALIDOS` de `admin-create-user`, ni en `ROLES_PARTICIPANTE`, ni en `verificarConstanciaAutomatica`.
- **Impacto:** Si existe algún usuario con esos roles (datos importados de Base44), **recibe el resumen semanal pero no se le aplica la validación de horario al fichar, ni el límite de 17:15, y jamás se le genera constancia automática** aunque supere su meta. Comportamiento silencioso e inconsistente.
- **Fix:** Centralizar `ROLES_PARTICIPANTE` en un único módulo y usarlo en los cuatro sitios.

### BUG-09 · `lastInsertRowid` devuelto como si fuera el `id` del registro
- **Ubicación:** `server/routes/functions.js:88`, `:141`, `:163`, `:194`, `:281`
- **Código:** `res.json({ tipo:'incidencia', incidencia: { id: incidencia.lastInsertRowid } })`
- **Problema:** Todas las tablas usan `id TEXT PRIMARY KEY` (verificado en `setup.js`: incidencias, bonos, registros_qr, pases_lista...). El id real es un `lower(hex(randomblob(16)))`; `lastInsertRowid` devuelve el *rowid* interno, un entero distinto. En el mismo archivo `pases_lista` sí se hace bien (`SELECT * FROM pases_lista WHERE rowid = ?`), lo que confirma la inconsistencia.
- **Impacto:** El cliente recibe un id que **no existe** en la tabla. Cualquier acción posterior sobre esa incidencia/bono (ver detalle, resolver, borrar) devuelve 404. Los avisos de "incidencia generada" apuntan a un registro inalcanzable.
- **Fix:** Generar el id en JS (`uuidv4()`) e insertarlo explícitamente, o releer la fila por rowid como ya se hace con `pases_lista`.

### BUG-10 · Mensajes del chat que desaparecen para siempre (resolución de 1 segundo)
- **Ubicación:** `server/routes/mensajes.js:167` + `src/pages/Comunidad.jsx:108`
- **Código:**
  ```js
  // servidor
  WHERE canal = ? AND created_date > ?      // created_date TEXT DEFAULT (datetime('now')) → resolución 1 s
  // cliente
  if (rows.length > 0) ultimoRef.current = rows[rows.length - 1].created_date;
  ```
- **Problema:** El cursor de polling es un timestamp con resolución de **un segundo** y la consulta usa `>` estricto. Dos mensajes creados en el mismo segundo comparten `created_date`; al recibir el primero, el cursor avanza a ese segundo y el segundo mensaje queda **excluido de todas las consultas posteriores**.
- **Impacto:** En un chat de grupo activo es habitual: **mensajes que nunca aparecen** hasta que el usuario cambia de canal o recarga. El remitente cree que no se envió y lo duplica. Irreproducible para el usuario.
- **Fix:** Cambiar a `created_date >= ?` en el servidor. Es seguro porque el cliente **ya deduplica por `id`** (`Comunidad.jsx:104-106`). Alternativa: cursor compuesto `(created_date, id)`.

### BUG-11 · Un encargado puede leer los datos personales de TODA la organización
- **Ubicación:** `server/routes/entities.js:88-105` (`checkRead`)
- **Código:**
  ```js
  if (esAdminOEncargado(me)) return me;   // sin ningún filtro de área
  ```
- **Problema:** El scoping por área solo se aplica a los participantes (`SCOPE_OWN`). Para `encargado` no hay ninguna restricción de lectura: `checkRead` devuelve `me` y las consultas LIST/GET ONE se ejecutan sin filtro. `READ_ADMIN_ONLY` solo cubre `Invitaciones`, `Bitacora_Auditoria` y `Codigos_QR`.
- **Impacto:** Contradice el modelo declarado en el propio archivo ("'encargado' gestión de su área") y el commit `36aee02` ("scoping de lecturas"). Un encargado de Bodega puede hacer `GET /api/User` y obtener **nombre, email, teléfono, carrera, matrícula y foto de todo el personal** de todas las áreas, además de `GET /api/Bonos`, `/api/Constancias`, `/api/Ajustes_Horas` y `/api/Registros_QR` de todos. Fuga de PII.
- **Fix:** Para `encargado`, añadir en LIST/GET ONE un filtro `area_asignada = me.area_encargada` (o `usuario IN (SELECT id FROM users WHERE area_asignada = ?)`) en las entidades con datos de personas.

### BUG-12 · Folios duplicados: se numeran con `COUNT(*)` en lugar de `MAX()`
- **Ubicación:** `server/routes/entities.js:120-134` (`siguienteFolio`) · `server/lib/gestion.js:126-128`
- **Código:**
  ```js
  n = db.prepare(`SELECT COUNT(*) AS n FROM materiales_recibidos WHERE folio LIKE ?`).get(patron).n + ...
  return `${prefijo}-${anio}-${String(n + 1).padStart(4,'0')}`;
  // constancias:
  const consecutivo = (COUNT(*) FROM constancias WHERE tipo='constancia_termino').n + 1;
  ```
- **Problema:** El consecutivo se deriva del **número de filas actuales**. Si se borra un registro, el contador retrocede y el siguiente folio **repite uno ya emitido**. No hay índice UNIQUE sobre `folio` que lo impida.
- **Impacto:** `ENT-2026-0007` puede asignarse a dos recepciones distintas, y `UCP-2026-012` a dos constancias de término. Son números de documento con valor administrativo: rompen el kardex, las exportaciones a Excel y cualquier auditoría. En `bulk` el problema se agrava (ver BUG-14).
- **Fix:** Usar `SELECT MAX(CAST(SUBSTR(folio, ...) AS INTEGER))` sobre la serie del año, y añadir `CREATE UNIQUE INDEX` sobre `folio`.

### BUG-13 · Aprobar dos veces la misma evidencia duplica las horas
- **Ubicación:** `server/routes/functions.js:236-262` (`AsignarBonoEvidencia`)
- **Problema:** No hay comprobación de `evidencia.estado_evidencia`. Se hace `UPDATE evidencias SET estado_evidencia='aprobada'` y **siempre** se inserta un bono nuevo en `bonos`.
- **Impacto:** Un doble clic, un reintento por timeout o dos encargados revisando a la vez otorgan **2 × N horas**. Como `horasValidadasDe` suma `SUM(horas)` de `bonos`, las horas se duplican de verdad y pueden disparar una constancia automática indebida. Tampoco hay tope: `Number(bono_horas)` acepta cualquier valor positivo (p.ej. 10000 h).
- **Fix:** `if (evidencia.estado_evidencia === 'aprobada') return res.status(409).json({error:'Esta evidencia ya fue aprobada'})`, envolver UPDATE+INSERT en `db.transaction(...)`, y validar un máximo razonable en `bono_horas`.

### BUG-14 · Las operaciones `bulk` no son transaccionales ni disparan los hooks
- **Ubicación:** `server/routes/entities.js:400-440`
- **Problema:** El bucle de inserción no va envuelto en `db.transaction()`. Y los hooks de gestión (`notificar`, `verificarConstanciaAutomatica`) **solo existen en el CREATE unitario**, no en el bulk.
- **Impacto:** (1) Si la fila 5 de 20 falla, las 4 primeras ya están commiteadas y el cliente recibe un 500 → cree que todo falló y reintenta → **registros duplicados**. (2) Asignar actividades por lote **no notifica a nadie**; dar bonos por lote **no genera la constancia automática** aunque se supere la meta. Comportamiento distinto según se use una ruta u otra.
- **Fix:** Envolver el bucle en `db.transaction(() => {...})()` y replicar los hooks (o extraerlos a una función común llamada desde ambas rutas).

### BUG-15 · `RevisarIncidenciasSemanales` lo puede ejecutar cualquiera y compara formatos de fecha incompatibles
- **Ubicación:** `server/routes/functions.js:325-348`
- **Código:**
  ```js
  router.post('/RevisarIncidenciasSemanales', authMiddleware, (req,res) => {   // sin check de rol
    const fechaLimite = unaSemanaAtras.toISOString();          // "2026-09-14T15:51:00.000Z"
    WHERE estado_incidencia='reportada' AND created_date > ?   // creado con datetime('now') → "2026-09-14 15:51:00"
  ```
- **Problema:** (1) Sin autorización: cualquier usuario autenticado puede invocarlo. (2) Compara lexicográficamente un ISO-8601 con `T`/`Z`/milisegundos contra el formato SQLite `YYYY-MM-DD HH:MM:SS`. El espacio (0x20) ordena antes que la `T` (0x54), así que el filtro descarta registros incorrectamente. (3) Cuenta las incidencias por **usuario** pero aplica el cambio a **todas sus asignaciones**, y nunca revierte el estado.
- **Impacto:** Un voluntario puede poner **todas las asignaciones activas de la organización en `bajo_revision`** con una sola llamada, bloqueando el flujo de trabajo, y el cambio es irreversible desde la UI. Además el filtro de fechas hace que el recuento de "3 incidencias" sea impredecible.
- **Fix:** Restringir a admin/encargado, y usar `datetime('now','-7 days')` en la propia consulta SQL en vez de un ISO de JS.

## 🟡 MEDIO

### BUG-16 · `PUT /api/me` permite auto-asignarse el área
- **Ubicación:** `server/routes/auth.js:178-197` · `allowedFields = [..., 'area_asignada']`
- **Impacto:** Un participante puede cambiarse de área por su cuenta, alterando a qué estadísticas, inventario y canal de área (`area:<X>` en el chat) pertenece, y a qué encargado se le notifica. El cambio de área debería ser exclusivo del admin (de hecho `entities.js` registra esos cambios en `historial_areas`, que aquí se bypasea).
- **Fix:** Quitar `area_asignada` de `allowedFields`.

### BUG-17 · Dos columnas para el mismo nombre (`full_name` y `nombre_completo`)
- **Ubicación:** `server/setup.js:10-11` · `server/routes/auth.js:180` · `server/routes/functions.js:200` · `server/routes/mensajes.js:121`
- **Problema:** `users` tiene ambas columnas. `admin-create-user` escribe **solo `full_name`** (deja `nombre_completo` en NULL). `PUT /me` permite actualizar **cualquiera de las dos**. Las lecturas usan `nombre_completo || full_name`, pero los ordenamientos no: `ObtenerPersonalCompleto` usa `ORDER BY full_name` y `/directorio` usa `ORDER BY nombre_completo COLLATE NOCASE`.
- **Impacto:** En el directorio del chat todos los usuarios creados por el admin tienen `nombre_completo` NULL y **SQLite ordena los NULL primero**, así que aparecen agrupados al principio sin orden alfabético. Si alguien edita su perfil (escribe `nombre_completo`) y un admin lo edita después (escribe `full_name`), las dos columnas divergen y distintas pantallas muestran nombres distintos.
- **Fix:** Elegir una columna como fuente de verdad, migrar los datos y eliminar la otra; o mantener `nombre_completo` como vista generada.

### BUG-18 · `SincronizarPerfilInvitado` reaplica invitaciones ya revocadas y puede bajar el rol
- **Ubicación:** `server/routes/functions.js:352-368`
- **Código:**
  ```js
  const invs = db.prepare('SELECT * FROM invitaciones WHERE email = ?').all(user.email);  // sin filtrar estado
  if (invs.length > 0) { const inv = invs[0];
    db.prepare('UPDATE users SET role = ?, area_asignada = ? WHERE id = ?').run(inv.rol || 'user', inv.area || null, user.id); }
  ```
- **Problema:** No filtra por `estado`, así que una invitación `rechazada`/`usada`/`cancelada` se reaplica cada vez que se invoque el endpoint (que es público para cualquier autenticado). `invs[0]` sin `ORDER BY` elige una fila arbitraria si hay varias. `inv.rol` se escribe en `users.role` **sin validar contra `ROLES_VALIDOS`**, y `inv.area || null` **borra el área** del usuario.
- **Impacto:** Un usuario puede auto-reasignarse un rol/área antiguos revocados por el admin, o perder su área (quedando sin canal de área y sin encargado que le notifique). Si alguna vez se crea una invitación con `rol='admin'`, es una escalada.
- **Fix:** `WHERE email = ? AND estado = 'pendiente' ORDER BY created_date DESC`, validar el rol contra la lista blanca, y marcar la invitación como consumida.

### BUG-19 · Las invitaciones no se normalizan y nunca coinciden
- **Ubicación:** `server/routes/functions.js:299-317` (`EnviarInvitacion`) vs `:354` (`SincronizarPerfilInvitado`)
- **Problema:** `admin-create-user` hace `String(email).toLowerCase().trim()`, pero `EnviarInvitacion` inserta el email **tal cual**. `SincronizarPerfilInvitado` busca con `WHERE email = ?` usando el email del JWT (ya en minúsculas).
- **Impacto:** Una invitación creada como `Juan@UCP.mx` nunca coincide con el usuario `juan@ucp.mx`: la invitación queda `pendiente` para siempre y el rol/área no se aplica. Fallo silencioso. Tampoco se valida que `email` exista (acepta NULL/vacío).
- **Fix:** Normalizar en `EnviarInvitacion` y comparar con `LOWER(email)`.

### BUG-20 · `registrarFalloLogin` devuelve "5 intentos restantes" justo cuando bloquea
- **Ubicación:** `server/middleware/security.js:70-81`
- **Código:** al llegar a 5 hace `rec.count = 0` y luego `return MAX_FALLOS - rec.count` → devuelve **5**.
- **Problema:** El valor de retorno es incorrecto en el caso de bloqueo. Hoy nadie lo usa (`routes/auth.js:53,59` lo invocan sin leer el resultado), así que es un defecto latente, no visible.
- **Fix:** Devolver 0 cuando se acaba de bloquear.

### BUG-21 · El bloqueo de login permite denegar el servicio a cualquier cuenta
- **Ubicación:** `server/middleware/security.js:56-81`
- **Problema:** La clave es `email|ip`. Cinco intentos fallidos con el email de la víctima la bloquean 15 minutos. Combinado con BUG-06 (todos comparten IP tras el proxy), un solo atacante bloquea a todo el personal; y sin proxy, bloquea a la víctima desde una IP concreta.
- **Fix:** Limitar por IP+email pero con umbrales más altos, y añadir una lista blanca o un desbloqueo por captcha. Como mínimo, arreglar BUG-06 primero.

### BUG-22 · `/api/upload` es un stub que no guarda nada
- **Ubicación:** `server/index.js:38-42`
- **Código:** `res.json({ file_url: '/uploads/' + Date.now() + '.bin' })`
- **Problema:** Devuelve una URL de un archivo que nunca se escribe. Actualmente **no lo llama nadie**: `base44Client.js:296` define `UploadFile` pero `findstr` no encuentra ningún uso, y las fotos de evidencias/perfil van en base64. Es código muerto peligroso.
- **Impacto:** Latente: si alguien usa `UploadFile`, obtiene una URL que devuelve 404. Además, el límite `express.json({limit:'10mb'})` es el tope real para las fotos en base64 (~7,5 MB de imagen útil); una foto de móvil típica lo supera y falla con un 413 poco claro.
- **Fix:** Eliminar el endpoint y `UploadFile`, o implementarlos de verdad con `multer`. Revisar el límite de 10mb frente al tamaño real de las fotos.

### BUG-23 · Los 404 de la API devuelven HTML con estado 200
- **Ubicación:** `server/index.js:60-63`
- **Problema:** `app.get('*', ...)` se registra después de las rutas `/api/*`, pero cualquier GET de API no existente cae en el catch-all y devuelve `index.html` con HTTP 200.
- **Impacto:** Un error de tipeo en una ruta devuelve HTML; el cliente intenta `JSON.parse` y lanza un error confuso en vez de un 404 claro. Dificulta mucho el debugging.
- **Fix:** Añadir `app.use('/api', (req,res) => res.status(404).json({error:'Ruta no encontrada'}))` **antes** del catch-all.

### BUG-24 · Sin claves foráneas: borrar deja registros huérfanos
- **Ubicación:** `server/database.js:39` (`db.pragma('foreign_keys = ON')`) · `server/setup.js` (ningún `REFERENCES`)
- **Problema:** Se activan las FK pero **ninguna tabla declara `REFERENCES`**, así que el pragma no hace nada. `DELETE /api/User/:id` es un borrado físico (`entities.js:455`).
- **Impacto:** Borrar un usuario deja huérfanos sus `registros_qr`, `evidencias`, `bonos`, `asignaciones`, `incidencias`, `notificaciones`, `mensajes` y `comentarios_evidencia`. Las agregaciones por área incluyen datos de usuarios inexistentes y las pantallas de detalle muestran nombres `undefined`. Borrar una `Actividad` o una `Evidencia` tiene el mismo efecto.
- **Fix:** Añadir `REFERENCES users(id) ON DELETE CASCADE` (o `SET NULL`) en el esquema, o implementar el borrado en cascada explícito en la ruta DELETE. La app ya tiene `archivado`: preferir baja lógica y bloquear el DELETE físico de `users`.

### BUG-25 · Borrar una venta no restaura el stock de forma fiable
- **Ubicación:** `server/routes/entities.js:449-453`
- **Código:** `if (req.params.entity === 'Ventas' && existing.salida) { DELETE FROM salidas_materiales WHERE id = ? }`
- **Problema:** La reversión depende de que `existing.salida` esté poblado; si la venta se creó sin enlace, no se revierte nada y no hay aviso. El `try{}catch{}` vacío oculta cualquier fallo.
- **Impacto:** Inventario descuadrado tras borrar ventas, sin trazabilidad. **NEEDS VERIFICATION:** confirmar si el stock se calcula derivando de `salidas_materiales` (en cuyo caso borrar sí restaura) o si hay una columna de cantidad que habría que incrementar.
- **Fix:** Hacer la reversión transaccional junto al borrado de la venta y registrar el movimiento en la bitácora.

### BUG-26 · Tolerancia de 0 minutos se ignora (falsy-zero)
- **Ubicación:** `server/routes/functions.js:69`
- **Código:** `const TOLERANCIA_MIN = config?.tolerancia_minutos || 15;`
- **Problema:** Si el administrador configura `tolerancia_minutos = 0` (sin tolerancia), `0 || 15` devuelve **15**.
- **Impacto:** La configuración no se respeta: se siguen permitiendo fichajes 15 minutos antes de la apertura. Mismo patrón en `apertura`/`cierre` (menos grave porque el valor por defecto es razonable).
- **Fix:** `const TOLERANCIA_MIN = Number.isFinite(Number(config?.tolerancia_minutos)) ? Number(config.tolerancia_minutos) : 15;`

### BUG-27 · Los días laborales se comparan con acentos
- **Ubicación:** `server/routes/functions.js:66-71`
- **Código:** `diasArr.includes(diaSemana)` donde `diaSemana` proviene de `['Domingo','Lunes',...,'Miércoles',...]`
- **Problema:** Comparación exacta de strings con acento. Si el admin escribe "Miercoles" (sin acento) en `configuracion_sistema.dias_laborales`, no coincide.
- **Impacto:** Todos los fichajes de los miércoles se rechazan como "día no laboral" y generan una incidencia de falta automática para cada usuario. Fallo silencioso y masivo provocado por un simple cambio de configuración.
- **Fix:** Normalizar ambos lados (quitar acentos y pasar a minúsculas) antes de comparar, o validar la lista contra los valores canónicos al guardar la configuración.

### BUG-28 · `asignacion_id` nunca se valida
- **Ubicación:** `server/routes/functions.js:36`, `:113`
- **Problema:** Se inserta en `registros_qr.asignacion` sin comprobar que exista ni que pertenga al usuario que ficha. Como no hay FK (BUG-24), cualquier cadena se acepta.
- **Impacto:** Un usuario puede atribuir sus horas a una asignación ajena o inexistente, falseando a qué actividad/área se imputan. También rompe `verificarConstanciaAutomatica`, que busca la asignación activa por otro lado.
- **Fix:** Validar `SELECT 1 FROM asignaciones WHERE id = ? AND usuario = ? AND estado='activo'`.

### BUG-29 · `notificarEncargadosDeArea` descarta encargados con `archivado` NULL
- **Ubicación:** `server/lib/gestion.js:41-43`
- **Código:** `WHERE role = 'encargado' AND area_encargada = ? AND archivado = 0`
- **Problema:** `archivado = 0` no匹配 NULL. El resto del código base usa el patrón correcto `COALESCE(archivado,0) = 0` (`mensajes.js`) o `(activo IS NULL OR activo = 1)` (`functions.js:250`). La columna tiene `DEFAULT 0`, así que en la práctica suele funcionar, pero es inconsistente y frágil ante datos importados.
- **Impacto:** Si algún encargado tiene `archivado` NULL (p.ej. por `import-data.js`), no recibe los avisos de fichaje manual y la notificación se desvía en silencio a los admins.
- **Fix:** Usar `COALESCE(archivado,0) = 0` de forma consistente en todo el código.

### BUG-30 · El resumen semanal marca "enviado" antes de enviar
- **Ubicación:** `server/lib/gestion.js:167-171`
- **Código:**
  ```js
  db.prepare('INSERT INTO envios_programados (clave) VALUES (?)').run(clave);   // antes del bucle
  for (const u of usuarios) { ... }                                            // si esto lanza, cae al catch
  ```
- **Problema:** La clave anti-duplicados se graba **antes** del bucle de envío. Todo va dentro de un único `try/catch`: si cualquier usuario provoca una excepción, se aborta y la clave ya está consumida.
- **Impacto:** El resumen semanal **no se envía a nadie esa semana y no se reintenta nunca**, sin más rastro que una línea en la consola.
- **Fix:** Mover el INSERT al final (tras el bucle) o envolver cada usuario en su propio `try/catch`.

### BUG-31 · El resumen semanal mezcla dos criterios de horas distintos
- **Ubicación:** `server/lib/gestion.js:191-201`
- **Código:**
  ```js
  const horasSemana = SUM(horas) FROM registros_qr WHERE ... AND estado_registro IN ('cerrado','incompleto');  // sin validado=1
  const total = horasValidadasDe(u.id);   // exige validado = 1
  ```
- **Problema:** `horasSemana` suma la columna `horas` almacenada **sin exigir `validado=1`**, mientras `total` (para el % de meta) **sí lo exige** y además recalcula desde `hora_entrada`/`hora_salida`.
- **Impacto:** El mismo mensaje muestra dos cifras incompatibles: "la semana pasada sumaste 12 h · llevas 3% de tu meta", donde las 12 h incluyen fichajes no validados y el 3% no. Y la columna `horas` puede valer 0 en fichajes que cruzan la medianoche (BUG-03) mientras el recálculo da 23 h. Los usuarios ven datos contradictorios.
- **Fix:** Usar una única función de cálculo de horas en todo el sistema y decidir explícitamente si el resumen incluye o no los fichajes sin validar.

### BUG-32 · `/poke` y las reacciones no respetan el silenciado; el enlace es fijo
- **Ubicación:** `server/routes/push.js:52-66` · `server/routes/mensajes.js:196`
- **Problema:** `POST /canal/:canal/mensajes` sí comprueba `me.silenciado === 1`, pero `/poke` y `/mensaje/:id/reaccion` no. Además `/poke` notifica con enlace `'/alumno'` sea cual sea el rol del destinatario.
- **Impacto:** Un usuario silenciado por el admin **sigue pudiendo dar toques a todo el mundo** (bypasea la moderación) y reaccionar. Y un admin/encargado que recibe un toque es enviado a `/alumno`, ruta a la que probablemente no tenga acceso → pantalla en blanco o redirección.
- **Fix:** Comprobar `silenciado` en `/poke` y en `/reaccion`, y resolver el enlace según el rol del destinatario.

### BUG-33 · Menciones `@` por nombre de pila: sobre-notificación y falsos negativos
- **Ubicación:** `server/routes/mensajes.js:96-115`
- **Código:** `lower.includes('@' + primero)` con `primero` = primera palabra del nombre
- **Problema:** Coincidencia por **subcadena**, no por palabra. `@Ana` menciona a todas las Anas (hasta 5); el texto "`@anamaria`" también dispara la mención de "Ana"; y no se normalizan acentos, así que "`@José`" no menciona a "Jose" ni al revés.
- **Impacto:** Notificaciones spam a personas no mencionadas y menciones reales que no llegan. En una organización con nombres repetidos es constante.
- **Fix:** Comparar por límites de palabra con una regex escapada (`new RegExp('@' + escapar(nombre) + '\\b')`) y normalizar acentos en ambos lados.

### BUG-34 · La lista de mensajes de DM depende de comportamiento indefinido de SQLite
- **Ubicación:** `server/routes/mensajes.js:151-158`
- **Código:**
  ```sql
  SELECT m.canal, m.texto, m.created_date, m.usuario, m.usuario_nombre FROM mensajes m
  WHERE ... GROUP BY m.canal HAVING m.created_date = MAX(m.created_date)
  ```
- **Problema:** Selecciona columnas no agregadas junto a `GROUP BY`. SQLite lo permite pero la documentación establece que toman el valor de **una fila arbitraria** del grupo; el truco `HAVING col = MAX(col)` no está garantizado.
- **Impacto:** La lista de conversaciones puede mostrar un mensaje antiguo como "último", con `ultimo_propio` incorrecto (la marca de "tú:" aparece mal) y un orden equivocado. Intermitente y difícil de reproducir: cambia al crecer la tabla o al actualizar SQLite.
- **Fix:** Usar una ventana: `SELECT * FROM (SELECT m.*, ROW_NUMBER() OVER (PARTITION BY canal ORDER BY created_date DESC, rowid DESC) rn FROM mensajes m WHERE ...) WHERE rn = 1`.

<!-- BUG-35 movido a la Parte 2 como BUG-47 (es un defecto de frontend) -->

### BUG-36 · Sin límite de tamaño en LIST: devuelve tablas enteras
- **Ubicación:** `server/routes/entities.js:245-248`
- **Código:** `if (limit) { query += ' LIMIT ?'; params.push(parseInt(limit) || 100); }`
- **Problema:** El `LIMIT` solo se aplica si el cliente lo pide; por defecto no hay ninguno.
- **Impacto:** `registros_qr`, `notificaciones` y `bitacora_auditoria` crecen sin límite. Tras un año de uso, cualquier pantalla que liste sin `limit` descarga decenas de miles de filas en JSON: segundos de espera y cientos de MB de memoria en el navegador móvil (que es el caso de uso principal, PWA).
- **Fix:** Aplicar un `LIMIT` por defecto (p.ej. 500) con paginación por cursor.

---

# PARTE 2 — FRONTEND (revisión directa, confirmada)

## 🟠 ALTO

### BUG-37 · La bitácora de auditoría está rota: `detalle` vs `detalles` y `fecha` sin escribir
- **Ubicación:** `src/lib/bitacora.js:14-15` · `server/middleware/security.js:117-121` · `server/setup.js:342-349,521` · `src/pages/admin/AdminBitacora.jsx:27,31,38,42,97,99`
- **Problema:** Dos orígenes escriben la misma tabla con columnas distintas, y la UI lee una tercera variante.
  - Columnas reales: `detalles` (CREATE TABLE) y `fecha` (añadida por migración, línea 521).
  - El frontend (`bitacora.js`) envía **`detalle`** (singular) → `entities.js:412` filtra con `cols.has(f)` y **lo descarta en silencio**. Sí escribe `fecha`.
  - El backend (`security.js`) escribe **`detalles`** (correcto) pero **nunca escribe `fecha`** → queda NULL.
  - `AdminBitacora.jsx` lee **`r.detalle`** y **`r.fecha`**.
- **Impacto:** Seis síntomas de una sola causa. La bitácora es la función de cumplimiento/auditoría y está inutilizada:
  1. **L99** `r.detalle && <p>…` → nunca se cumple: el detalle **no se muestra en ninguna fila**, de ningún origen. Los textos que los llamadores pasan a `registrarBitacora(accion, modulo, detalle)` se pierden para siempre.
  2. **L27** la búsqueda concatena `(r.detalle || "")` → **buscar por texto de detalle no encuentra nada nunca**.
  3. **L42** el CSV exporta `(r.detalle || "")` → **columna de detalles siempre vacía** en la exportación.
  4. **L31** `const matchFecha = !fechaDesde || (r.fecha && r.fecha >= fechaDesde)` → en los eventos generados por el servidor `r.fecha` es NULL, así que **al filtrar por fecha desaparecen todos los eventos de seguridad**: bloqueos de login, pokes, borrado de mensajes, silenciado de usuarios. Justo los que un auditor necesita ver.
  5. **L97** `r.fecha ? "· " + new Date(r.fecha).toLocaleTimeString(…) : ""` → los eventos de seguridad **no muestran hora**.
  6. **L38** el CSV exporta `r.fecha || ""` → **columna de fecha vacía** para los eventos de seguridad.
- **Fix:** Unificar a un solo nombre. Lo mínimo: en `bitacora.js` enviar `detalles` (no `detalle`); en `AdminBitacora.jsx` leer `r.detalles` y usar `COALESCE(fecha, created_date)`; y en `security.js` hacer que `registrarEnBitacora` escriba también `fecha`. Conviene además que `entities.js` **avise** cuando el cliente envíe campos inexistentes en vez de descartarlos en silencio: ese descarte silencioso es lo que mantuvo el bug invisible.

### BUG-38 · El frontend marca QR como expirados 6 horas antes que el servidor
- **Ubicación:** `src/pages/admin/AdminQr.jsx:152` vs `server/routes/functions.js:52`
- **Código:**
  ```js
  // frontend
  const expirado = (c) => c.fecha_expiracion && c.fecha_expiracion < new Date().toISOString().slice(0, 10);
  // backend
  if (qr.fecha_expiracion && qr.fecha_expiracion < fecha)   // fecha = ahoraMexico().fecha
  ```
- **Problema:** El frontend compara contra la fecha **UTC**; el backend contra la fecha **local de Ciudad de México** (UTC−6). A partir de las 18:00 hora local, en UTC ya es el día siguiente.
- **Impacto:** Entre las 18:00 y las 24:00, un QR cuya `fecha_expiracion` es hoy aparece en el panel de administración como **expirado** (invitando al encargado a regenerarlo e imprimirlo de nuevo) mientras el servidor **lo sigue aceptando** como válido. Estado inconsistente entre pantallas; es la misma clase de bug UTC-vs-local que el commit `03b4a90` intentó corregir en otro sitio.
- **Fix:** Calcular la fecha local de México en el frontend (misma lógica que `ahoraMexico`), o mejor: que el servidor devuelva un campo `expirado` ya resuelto y el frontend solo lo consuma.

## 🟡 MEDIO

### BUG-39 · `key={idx}` en listas de filas editables que se insertan y borran por el medio
- **Ubicación:** `src/pages/admin/AdminElectronicos.jsx:293,356` · `src/pages/admin/AdminMateriales.jsx:267,313` · `src/pages/admin/AdminEncuestas.jsx:170`
- **Código:**
  ```js
  const insertLinea = (idx) => { copia.splice(idx + 1, 0, nueva); setLineas(copia); }   // L122-123
  const quitarLinea = (idx) => setLineas(lineas.length > 1 ? lineas.filter((_, i) => i !== idx) : lineas);  // L125
  // ...
  {lineas.map((l, idx) => ( <div key={idx} …>   // L293, tarjeta con inputs dentro
  ```
- **Problema:** La clave de React es el índice, pero la lista **soporta inserción y borrado en posiciones intermedias**. Al quitar la fila 2 de 3, React reutiliza el DOM de la fila desplazada en lugar de desmontarlo.
- **Impacto:** El foco del teclado, los desplegables abiertos, el estado del autocompletado y la composición de texto **saltan a la fila equivocada** tras insertar o borrar. El usuario sigue tecleando en lo que cree que es otra línea. En un formulario de recepción de inventario por lotes, eso significa cantidades y categorías asignadas al material equivocado.
- **Fix:** Dar a cada línea un id estable al crearla (`nuevaLinea()` añade `_key: crypto.randomUUID()`) y usar `key={l._key}`.

### BUG-40 · Peticiones sin `.catch`: la pantalla se queda cargando para siempre
- **Ubicación:** `src/components/ucp/HistorialFichajes.jsx:19` · `src/pages/Calendario.jsx:25` · `src/pages/Disponibilidad.jsx:25,35` · `src/pages/admin/AdminHuellaCarbono.jsx:68` · `src/pages/admin/AdminInventario.jsx:68` · `src/lib/categoriasDinamicas.js:30`
- **Código:** `base44.entities.Registros_QR.filter(…).then(setRegistros)` — sin `.catch` ni `.finally`.
- **Problema:** Si la petición falla, el rechazo queda sin manejar: no se actualiza el estado, no se limpia el indicador de carga y no se muestra ningún error.
- **Impacto:** Con un 429 del limitador (muy probable por BUG-06) o un 500, la pantalla **se queda en el esqueleto de carga indefinidamente** sin explicar nada, y el usuario recarga una y otra vez empeorando la saturación. Además provoca *unhandled promise rejections* en consola. Nótese que `AdminBitacora.jsx:23` sí lo hace bien (`.catch().finally(setLoading(false))`): el patrón correcto ya existe en el proyecto y no se aplicó de forma uniforme.
- **Fix:** Envolver siempre en `try/catch/finally` (o `.catch().finally()`) y mostrar un estado de error reutilizable con opción de reintentar.

### BUG-41 · La lectura del token está duplicada en cuatro sitios
- **Ubicación:** `src/api/base44Client.js:8` · `src/components/ucp/BotonPoke.jsx:16` · `src/pages/Comunidad.jsx:17` · `src/lib/push.js:7`
- **Código:** los cuatro repiten `localStorage.getItem("ucp_token") || localStorage.getItem("token") || ""`
- **Problema:** El token se guarda bajo **dos claves** distintas (`ucp_token` y `token`, ver `base44Client.js:12-13`) y cuatro módulos reimplementan la misma lectura con fallback en vez de importar un helper común.
- **Impacto:** `BotonPoke`, `Comunidad` y `push.js` construyen sus propias peticiones `fetch` saltándose el cliente API centralizado: no comparten el manejo de 401, ni los reintentos, ni las cabeceras. Si se cambia la clave de almacenamiento hay que acertar en cuatro archivos o la app queda a medias autenticada (el cliente funciona pero los pokes y el chat fallan en silencio). Y al estar en `localStorage`, el token es accesible desde cualquier XSS — lo que combinado con **BUG-05** (un token de sesión sirve para restablecer la contraseña) convierte cualquier XSS en una toma de control **permanente** de la cuenta.
- **Fix:** Exportar un único `obtenerToken()` desde `base44Client.js` y usarlo en los cuatro sitios; hacer que poke/chat/push pasen por el cliente común.

### BUG-42 · `registrarBitacora` hace una petición extra por cada evento de auditoría
- **Ubicación:** `src/lib/bitacora.js:9-10`
- **Código:** `const perfil = await base44.auth.me();` antes de cada `create`
- **Problema:** Cada entrada de bitácora dispara `GET /api/auth/me` y después el `POST`. El perfil ya está disponible en `AuthContext`.
- **Impacto:** Duplica las peticiones en los flujos críticos (emisión de constancias, aprobación de evidencias) y añade latencia a operaciones que el usuario espera instantáneas. Agrava el techo de ~16 usuarios simultáneos del BUG-06.
- **Fix:** Recibir el perfil como parámetro desde el componente, que ya lo tiene en el contexto.

### BUG-43 · La tendencia semanal mezcla claves UTC con fechas locales
- **Ubicación:** `src/pages/admin/AdminEstadisticas.jsx:158-169`
- **Código:**
  ```js
  const d = new Date(r.fecha + "T00:00:00");        // medianoche LOCAL  ✓
  lunes.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const clave = lunes.toISOString().slice(0, 10);    // serializa en UTC  ✗
  semana: new Date(semana + "T00:00:00").toLocaleDateString("es-MX", …)  // reinterpreta en LOCAL
  ```
- **Problema:** La fecha se construye en local, se serializa a UTC para usarla como clave y se vuelve a parsear en local para mostrarla. En zonas horarias al **este** de UTC, la medianoche local pertenece al día anterior en UTC, así que la clave se desplaza un día.
- **Impacto:** Para usuarios en México (UTC−6) hoy funciona por casualidad, pero cualquier usuario con el navegador en una zona al este de UTC (viaje, VPN, personal en el extranjero) ve las semanas etiquetadas **con un día de desfase** y los totales agrupados en el lunes equivocado. Bug latente que romperá al cambiar la zona horaria del servidor o del cliente.
- **Fix:** No pasar por `toISOString()`: formatear la clave con componentes locales (`getFullYear/getMonth/getDate` con padding), igual que hace `ahoraMexico` en el backend.

### BUG-44 · `huellaCarbono.js` parsea mal las fechas que no miden exactamente 10 caracteres
- **Ubicación:** `src/lib/huellaCarbono.js:220`
- **Código:** `return new Date(f + (f.length === 10 ? "T00:00:00" : "")).toLocaleDateString("es-MX", …)`
- **Problema:** Solo protege el caso de fecha pura `YYYY-MM-DD` (longitud 10). Si `f` es un timestamp completo de SQLite (`"2026-09-21 15:51:00"`, longitud 19) se pasa tal cual a `new Date()`, que lo interpreta como **hora local** siendo un valor **UTC**.
- **Impacto:** Las fechas del reporte de huella de carbono y de su PDF se muestran **desplazadas 6 horas**, lo que en registros de última hora de la tarde las pinta en el día anterior. El patrón correcto ya existe en `AdminPasesLista.jsx:22` (`.replace(" ", "T") + "Z"`), aplicado de forma inconsistente.
- **Fix:** Normalizar explícitamente: si contiene un espacio, convertir a `"…T…Z"`; si son 10 caracteres, añadir `"T00:00:00"`.

### BUG-45 · La cámara del escáner QR no se libera de forma fiable
- **Ubicación:** `src/pages/Fichar.jsx:109-116`
- **Código:**
  ```js
  useEffect(() => () => { if (html5QrRef.current) { try { html5QrRef.current.stop(); } catch {} } }, []);
  ```
- **Problema:** `html5Qr.stop()` devuelve una **promesa**; el `try/catch` sincrónico no captura su rechazo. Además nunca se llama a `.clear()`, que es el paso que libera los elementos de DOM y el stream de la cámara.
- **Impacto:** Al navegar fuera de la pantalla de fichaje **la cámara puede quedar encendida** (sigue el indicador de cámara activa del móvil y se consume batería), y aparece un *unhandled promise rejection* si `stop()` falla porque el escáner ya estaba parado. En una PWA que se usa todo el día en el móvil, el desgaste de batería es notable.
- **Fix:** `html5QrRef.current.stop().then(() => html5QrRef.current.clear()).catch(() => {})` dentro del cleanup, y marcar un ref `montado` para no iniciar el escáner si el efecto ya se limpió.

### BUG-46 · El cronómetro del fichaje captura un `registroAbierto` obsoleto
- **Ubicación:** `src/pages/Fichar.jsx:54-59`
- **Código:**
  ```js
  useEffect(() => {
    if (!registroAbierto) return;
    setSegundos(segundosTranscurridos(registroAbierto));
    const t = setInterval(() => setSegundos(segundosTranscurridos(registroAbierto)), 1000);
    return () => clearInterval(t);
  }, [registroAbierto?.id]);
  ```
- **Problema:** El cuerpo del efecto usa el objeto completo `registroAbierto`, pero las dependencias solo declaran `registroAbierto?.id`. Si el objeto se actualiza conservando el mismo `id` (tras un `refetch` que corrige `hora_entrada` o `area`), el intervalo queda cerrado sobre la versión antigua.
- **Impacto:** El contador de segundos y las horas en pantalla se calculan con datos obsoletos. Se manifiesta cuando un encargado corrige la hora de entrada de un fichaje abierto y el alumno tiene la pantalla abierta: el cronómetro no refleja la corrección hasta recargar.
- **Fix:** Guardar la hora de entrada en un `ref` actualizado en cada render, o incluir los campos relevantes en las dependencias (`registroAbierto?.hora_entrada`).

### BUG-47 · Los errores del polling del chat se tragan por completo
- **Ubicación:** `src/pages/Comunidad.jsx:109`
- **Código:** `} catch { /* polling silencioso */ }`
- **Problema:** Se descartan **todos** los errores, incluidos 401 (token caducado) y 429 (rate limit).
- **Impacto:** Cuando el token expira o salta el limitador (muy probable, ver BUG-06), el chat se congela mostrando mensajes antiguos **sin ningún aviso**; el usuario no sabe que debe volver a iniciar sesión y los mensajes que escribe en ese estado se pierden.
- **Fix:** Distinguir errores de red transitorios (silenciosos) de 401 (forzar re-login) y 429 (mostrar aviso y aplicar *backoff* exponencial en lugar de seguir cada 4 s).

---
