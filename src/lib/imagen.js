// Compresión de imágenes en el navegador.
// El servidor self-hosted no tiene almacenamiento de archivos persistente,
// así que las imágenes se guardan como data URL (JPEG) directamente en la BD.
// Se reducen a máx. 1280 px y calidad 0.75 para mantener la BD ligera.

export function comprimirImagen(file, maxTam = 1280, calidad = 0.75) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith("image/")) {
      reject(new Error("El archivo no es una imagen"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo procesar la imagen"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxTam || height > maxTam) {
          const escala = maxTam / Math.max(width, height);
          width = Math.round(width * escala);
          height = Math.round(height * escala);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", calidad));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ¿Es una imagen incrustada (data URL) o una ruta/archivo real?
export function esImagenIncrustada(url) {
  return typeof url === "string" && url.startsWith("data:image/");
}
