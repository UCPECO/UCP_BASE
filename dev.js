// Arranque local para preview (npm run dev).
// Acepta --port / --host (también --port=NNNN) y los expone como variables
// de entorno antes de importar el servidor, que sirve el frontend compilado
// en dist/ junto con la API Express.
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--port" && args[i + 1]) process.env.PORT = args[i + 1];
  else if (a.startsWith("--port=")) process.env.PORT = a.split("=")[1];
  if (a === "--host" && args[i + 1]) process.env.HOST = args[i + 1];
  else if (a.startsWith("--host=")) process.env.HOST = a.split("=")[1];
}

import("./server.js");
