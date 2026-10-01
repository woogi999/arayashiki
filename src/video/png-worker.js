// Turns RGBA rows (alpha not premultiplied) into a PNG, off the main thread,
// for transparent .mov frames and image sequences. Several of these run at
// once (src/video/capture.js), so encoding keeps up with rendering.
self.onmessage = async ({ data: { id, pixels, width, height } }) => {
  try {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });
    ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer), width, height), 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const png = new Uint8Array(await blob.arrayBuffer());
    self.postMessage({ id, png }, [png.buffer]);
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  }
};
