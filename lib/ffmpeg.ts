import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

let ffmpegSingleton: FFmpeg | null = null;
let loadingPromise: Promise<FFmpeg> | null = null;

export async function getFFmpeg(onProgress?: (ratio: number) => void): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton;
  if (loadingPromise) return loadingPromise;

  const load = async () => {
    const ffmpeg = new FFmpeg();
    if (onProgress) {
      ffmpeg.on("progress", ({ progress }) => onProgress(progress));
    }

    const coreVersion = "0.12.6";
    const base = `https://unpkg.com/@ffmpeg/core@${coreVersion}/dist/`;

    await ffmpeg.load({
      coreURL: await toBlobURL(`${base}ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${base}ffmpeg-core.wasm`, "application/wasm"),
      workerURL: await toBlobURL(`${base}ffmpeg-core.worker.js`, "text/javascript"),
    });

    ffmpegSingleton = ffmpeg;
    return ffmpeg;
  };

  loadingPromise = load();
  return loadingPromise;
}
