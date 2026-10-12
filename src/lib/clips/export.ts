/**
 * Records a 2D clip to a file in the browser (S25): nothing is rendered on
 * the server. Frames are drawn offscreen at a fixed frame rate (not in real
 * time), so a 20 s clip exports in a few seconds and every frame is there.
 *
 * - MP4: WebCodecs through Mediabunny, H.264 first (plays everywhere), then
 *   VP9 / AV1 / HEVC in MP4. Browsers without WebCodecs fall back to
 *   MediaRecorder in real time (MP4 where supported, else WebM).
 * - GIF: gifenc, a palette per frame.
 *
 * The encoders are imported on demand, so they never weigh on page loads.
 */
import { EXPORT_SETTINGS, exportTicks, type ClipFormat } from "./clip";

export interface ExportJob {
  format: ClipFormat;
  from: number;
  to: number;
  /** Draws the clip at game tick `tick` on a `size`×`size` canvas. */
  render: (ctx: CanvasRenderingContext2D, size: number, tick: number) => void;
  /** 0–1. */
  onProgress?: (p: number) => void;
  signal?: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  ext: "mp4" | "webm" | "gif";
}

function abortError() {
  return new DOMException("Export cancelled", "AbortError");
}

/** Gives the page a moment to paint (progress bar) between heavy frames. */
const breathe = () => new Promise<void>((r) => setTimeout(r, 0));

function makeCanvas(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D unavailable");
  return { canvas, ctx };
}

async function exportGif(job: ExportJob): Promise<ExportResult> {
  const { size, fps } = EXPORT_SETTINGS.gif;
  const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
  const { ctx } = makeCanvas(size);
  const ticks = exportTicks(job.from, job.to, fps);
  const gif = GIFEncoder();
  const delay = Math.round(1000 / fps);
  for (let i = 0; i < ticks.length; i++) {
    if (job.signal?.aborted) throw abortError();
    job.render(ctx, size, ticks[i]);
    const { data } = ctx.getImageData(0, 0, size, size);
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), size, size, { palette, delay });
    job.onProgress?.((i + 1) / ticks.length);
    if (i % 3 === 0) await breathe();
  }
  gif.finish();
  return { blob: new Blob([gif.bytes() as BlobPart], { type: "image/gif" }), ext: "gif" };
}

async function exportWebCodecs(job: ExportJob): Promise<ExportResult | null> {
  if (typeof window === "undefined" || !("VideoEncoder" in window)) return null;
  const { size, fps } = EXPORT_SETTINGS.mp4;
  const { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, getFirstEncodableVideoCodec } = await import("mediabunny");
  const codec = await getFirstEncodableVideoCodec(["avc", "vp9", "av1", "hevc"], { width: size, height: size, quality: QUALITY_HIGH }).catch(
    () => null
  );
  if (!codec) return null;

  const { canvas, ctx } = makeCanvas(size);
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const source = new CanvasSource(canvas, { codec, quality: QUALITY_HIGH, keyFrameInterval: 1 });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();
  const ticks = exportTicks(job.from, job.to, fps);
  try {
    for (let i = 0; i < ticks.length; i++) {
      if (job.signal?.aborted) throw abortError();
      job.render(ctx, size, ticks[i]);
      await source.add(i / fps, 1 / fps);
      job.onProgress?.((i + 1) / ticks.length);
      if (i % 10 === 0) await breathe();
    }
    await output.finalize();
  } catch (err) {
    await output.cancel().catch(() => undefined);
    throw err;
  }
  if (!target.buffer) throw new Error("Empty MP4");
  return { blob: new Blob([target.buffer], { type: "video/mp4" }), ext: "mp4" };
}

/** Real-time fallback for browsers without WebCodecs. */
async function exportRecorder(job: ExportJob): Promise<ExportResult> {
  if (typeof MediaRecorder === "undefined") throw new Error("Video export unsupported");
  const { size, fps } = EXPORT_SETTINGS.mp4;
  const types = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
  const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t));
  if (!mimeType) throw new Error("Video export unsupported");
  const { canvas, ctx } = makeCanvas(size);
  const ticks = exportTicks(job.from, job.to, fps);
  job.render(ctx, size, ticks[0]);
  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start(250);
  const t0 = performance.now();
  let aborted = false;
  for (let i = 0; i < ticks.length; i++) {
    if (job.signal?.aborted) {
      aborted = true;
      break;
    }
    const due = t0 + (i * 1000) / fps;
    const wait = due - performance.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    job.render(ctx, size, ticks[i]);
    job.onProgress?.((i + 1) / ticks.length);
  }
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  if (aborted) throw abortError();
  const mp4 = mimeType.startsWith("video/mp4");
  return { blob: new Blob(chunks, { type: mp4 ? "video/mp4" : "video/webm" }), ext: mp4 ? "mp4" : "webm" };
}

export async function exportClip(job: ExportJob): Promise<ExportResult> {
  if (job.format === "gif") return exportGif(job);
  return (await exportWebCodecs(job)) ?? exportRecorder(job);
}

/** Saves a blob as a file (the browser's download, or the share sheet's "save" on phones). */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
