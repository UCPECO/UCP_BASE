# UCP Horas - Self-Hosted

Sistema de gestión de horas y actividades para la Universidad Cristóbal Colón (UCP). Versión self-hosted con backend propio usando Express + SQLite.

## Características

- **Autenticación local** con JWT
- **Base de datos SQLite** embebida
- **Backend Express** con API REST
- **Gestión de usuarios, actividades, fichajes, evidencias, incidencias**
- **Panel de administración y panel de alumno**
- **Códigos QR para fichaje**
- **Gestión de inventario y materiales**
- **Datos importados** desde Base44 (55+ registros)

## Requisitos

- Node.js 18+
- npm o pnpm
- Python 3.7+ (solo para importar datos CSV, opcional)

---

## 🚀 Instalación rápida para producción

### 1. Instalar dependencias

```bash
# Frontend
npm install

# Backend
cd server && npm install
```

### 2. La base de datos ya viene poblada

La base de datos `server/data.sqlite` ya contiene todos los datos importados:

| Tabla | Registros |
|-------|-----------|
| Actividades | 3 |
| Asignaciones | 3 |
| Registros QR | 9 |
| Evidencias | 2 |
| Incidencias | 9 |
| Constancias | 4 |
| Encuestas | 1 |
| Pases de Lista | 4 |
| Materiales | 1 |
| Bitácora | 8 |
| **Total** | **55+** |

> Si necesitas reimportar los datos desde los CSV, ejecuta: `cd server && python3 import_data.py`

### 3. Construir y ejecutar en producción

```bash
# Construir el frontend
npm run build

# Iniciar el servidor (sirve frontend + API en el puerto 3001)
cd server && npm start
```

La aplicación estará disponible en `http://localhost:3001` (o el puerto que configures).

---

## 🔧 Desarrollo local

Si quieres trabajar en desarrollo con hot-reload:

```bash
# Terminal 1: Backend
cd server && npm run dev

# Terminal 2: Frontend
npm run dev
```

El frontend se servirá en `http://localhost:5173` con proxy automático al backend.

---

## 🔐 Acceso

### Usuario administrador por defecto
- **Email:** `admin@ucp.local`
- **Password:** `admin123`

> Los demás usuarios del sistema fueron creados automáticamente a partir de los IDs encontrados en los datos importados. Para acceder con ellos, deberás registrar nuevos usuarios con esos emails o modificar los existentes desde el panel de admin.

---

## 📁 Estructura del proyecto

```
ucp_horas/
├── src/                         # Frontend React + Vite
│   ├── api/base44Client.js     # Cliente API local (emula base44)
│   ├── components/             # Componentes React
│   ├── lib/                    # Utilidades y contextos
│   └── pages/                  # Páginas de la aplicación
├── server/                      # Backend Express + SQLite
│   ├── data/                   # Archivos CSV exportados
│   ├── data.sqlite             # Base de datos SQLite (ya poblada)
│   ├── routes/                 # Rutas de la API
│   ├── middleware/             # Middleware (auth)
│   ├── import_data.py          # Script de importación CSV
│   ├── database.js             # Conexión a SQLite
│   ├── setup.js                # Script de inicialización
│   └── index.js                # Servidor principal
├── dist/                        # Build de producción (generado)
└── package.json
```

---

## 🌐 Deploy en la nube

### Opción 1: VPS/Dedicado (Recomendado)

1. Sube el proyecto a tu servidor
2. Instala Node.js 18+
3. Ejecuta `npm install` y `cd server && npm install`
4. Copia la base de datos `server/data.sqlite` (ya viene poblada)
5. Construye: `npm run build`
6. Inicia: `cd server && npm start`
7. Configura un reverse proxy con **Nginx** o **Caddy** apuntando al puerto 3001
8. (Opcional) Usa **PM2** para mantener el proceso activo:
   ```bash
   npm install -g pm2
   cd server && pm2 start index.js --name "ucp-horas"
   ```

### Opción 2: Railway/Render/Railway

1. Sube el repo a GitHub
2. Configura el **Build Command**: `npm run build`
3. Configura el **Start Command**: `cd server && npm start`
4. Asegúrate de que `server/data.sqlite` esté incluido en el repo o usa un volumen persistente

### Opción 3: Docker (próximamente)

Se puede crear un Dockerfile que:
1. Construya el frontend
2. Sirva todo desde el servidor Express
3. Use un volumen para persistir `data.sqlite`

---

## 📊 Entidades principales

- **Users**: Usuarios del sistema (admin, encargado, voluntario, servicio_social)
- **Actividades**: Actividades disponibles para asignación
- **Asignaciones**: Asignación de usuarios a actividades
- **Registros_QR**: Fichajes de entrada/salida
- **Evidencias**: Evidencias subidas por los alumnos
- **Bonos**: Bonos de horas asignados
- **Incidencias**: Incidencias reportadas
- **Horarios_Clase**: Horarios de clase de los alumnos
- **Eventos**: Eventos del calendario
- **Inventario**: Materiales y electrónicos reciclados
- **Constancias**: Constancias de servicio/termino
- **Encuestas**: Evaluaciones y respuestas

---

## 🔄 Migración desde Base44

Este proyecto fue migrado desde Base44 a una arquitectura self-hosted completa:

- ❌ Eliminado `@base44/sdk` y `@base44/vite-plugin`
- ❌ Eliminada carpeta `base44/` (funciones, workflows, config)
- ✅ Creado backend Express + SQLite propio
- ✅ Cliente API en `src/api/base44Client.js` emula la interfaz de Base44
- ✅ Todas las funciones serverless migradas a endpoints REST
- ✅ Datos exportados e importados a SQLite

---

## ⚙️ Variables de entorno

Puedes crear un archivo `.env` en la raíz:

```
VITE_API_URL=http://localhost:3001/api
```

Y en el servidor (`server/.env`):

```
PORT=3001
JWT_SECRET=tu-clave-secreta-aqui
```

---

## Licencia

Proyecto privado - Universidad Cristóbal Colón
