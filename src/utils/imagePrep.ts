export interface PreparedImage {
  /** Full data URL for on-screen display (downscaled). */
  dataUrl: string;
  /** MIME type actually sent to the API. */
  mimeType: string;
  width: number;
  height: number;
  /** Dimensions of the file as supplied, before any resampling. */
  originalWidth: number;
  originalHeight: number;
  /** True if the source was larger than maxEdge and had to be resampled. */
  resized: boolean;
}

/**
 * Reads a File, downsamples it so its longest edge is at most `maxEdge`, and
 * re-encodes it as JPEG.
 *
 * Microscopy captures are routinely 4000px+ and 20-40 MB. Base64 inflates that
 * by a third, which blew straight past the Express body limit and Cloud Run's
 * request cap. The failure surfaced as a silent fetch error with no message.
 * 1600px on the long edge is ample for the model's coordinate output, which is
 * expressed as percentages anyway.
 */
export function prepareImageForUpload(file: File, maxEdge = 1600, quality = 0.9): Promise<PreparedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Could not read the selected file.'));

    reader.onload = () => {
      const original = reader.result as string;
      const img = new Image();

      img.onerror = () =>
        reject(new Error('That file could not be decoded as an image. TIFF and proprietary microscope formats are not supported by the browser — export to PNG or JPEG first.'));

      img.onload = () => {
        const { naturalWidth: w, naturalHeight: h } = img;
        const scale = Math.min(1, maxEdge / Math.max(w, h));

        if (scale === 1) {
          resolve({
            dataUrl: original,
            mimeType: file.type || 'image/jpeg',
            width: w,
            height: h,
            originalWidth: w,
            originalHeight: h,
            resized: false,
          });
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context unavailable in this browser.'));
          return;
        }

        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        resolve({
          dataUrl: canvas.toDataURL('image/jpeg', quality),
          mimeType: 'image/jpeg',
          width: canvas.width,
          height: canvas.height,
          originalWidth: w,
          originalHeight: h,
          resized: true,
        });
      };

      img.src = original;
    };

    reader.readAsDataURL(file);
  });
}
