// Fotos tiradas no celular: reduz no aparelho antes de subir (rápido no 4G e leve no Storage).

/** Reduz para no máximo `lado` px no lado maior, JPEG com a qualidade dada, já na orientação certa. */
export async function reduzirFoto(arquivo: File, lado = 1600, qualidade = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('Não foi possível ler a foto'))), 'image/jpeg', qualidade));
}
