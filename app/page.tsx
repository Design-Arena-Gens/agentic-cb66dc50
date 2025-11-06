"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { getFFmpeg } from "../lib/ffmpeg";
import { zipBlobsAsZipFile } from "../utils/zip";

type VideoJob = {
  file: File;
  outputName: string;
  progress: number; // 0..100
  status: "pending" | "processing" | "done" | "error";
  error?: string;
  downloadUrl?: string;
};

type Options = {
  format: "mp4" | "webm";
  resolution: "source" | "720p" | "1080p";
  bitrate: "auto" | "1M" | "2.5M" | "5M";
  trimStartSec?: number;
  trimEndSec?: number;
};

const DEFAULT_OPTIONS: Options = {
  format: "mp4",
  resolution: "source",
  bitrate: "auto",
};

function buildArgs(inputName: string, outputName: string, opts: Options): string[] {
  const args: string[] = ["-y"]; // overwrite

  if (typeof opts.trimStartSec === "number" && opts.trimStartSec > 0) {
    args.push("-ss", String(opts.trimStartSec));
  }

  args.push("-i", inputName);

  if (typeof opts.trimEndSec === "number" && typeof opts.trimStartSec === "number" && opts.trimEndSec > opts.trimStartSec) {
    const duration = opts.trimEndSec - opts.trimStartSec;
    args.push("-t", String(duration));
  }

  // Video codec and format
  if (opts.format === "mp4") {
    args.push("-c:v", "libx264", "-pix_fmt", "yuv420p");
  } else {
    args.push("-c:v", "libvpx-vp9");
  }

  // Bitrate
  if (opts.bitrate !== "auto") {
    args.push("-b:v", opts.bitrate);
  }

  // Resolution
  if (opts.resolution === "720p") {
    args.push("-vf", "scale='min(1280,iw)':'-2':force_original_aspect_ratio=decrease");
  } else if (opts.resolution === "1080p") {
    args.push("-vf", "scale='min(1920,iw)':'-2':force_original_aspect_ratio=decrease");
  }

  // Audio
  if (opts.format === "mp4") {
    args.push("-c:a", "aac", "-b:a", "128k");
  } else {
    args.push("-c:a", "libopus", "-b:a", "96k");
  }

  args.push(outputName);
  return args;
}

function getOutputName(file: File, format: Options["format"]): string {
  const base = file.name.replace(/\.[^/.]+$/, "");
  return `${base}.${format}`;
}

export default function Page() {
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFilesSelected = useCallback((files: FileList | null) => {
    if (!files) return;
    const next: VideoJob[] = Array.from(files)
      .filter((f) => f.type.startsWith("video/"))
      .map((file) => ({
        file,
        outputName: getOutputName(file, options.format),
        progress: 0,
        status: "pending",
      }));
    setJobs(next);
  }, [options.format]);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    onFilesSelected(e.dataTransfer.files);
  }, [onFilesSelected]);

  const allDone = useMemo(() => jobs.length > 0 && jobs.every((j) => j.status === "done"), [jobs]);

  const handleProcess = useCallback(async () => {
    if (jobs.length === 0) return;
    setIsProcessing(true);

    const ffmpeg = await getFFmpeg((ratio) => {
      // will be overridden per job below
    });

    const updated: VideoJob[] = [...jobs];

    for (let i = 0; i < updated.length; i++) {
      const job = updated[i];
      job.status = "processing";
      job.progress = 0;
      setJobs([...updated]);

      const inputName = job.file.name;
      const outputName = getOutputName(job.file, options.format);

      try {
        const data = new Uint8Array(await job.file.arrayBuffer());
        await ffmpeg.writeFile(inputName, data);

        // Attach progress handler for this run
        ffmpeg.on("progress", ({ progress }) => {
          job.progress = Math.min(100, Math.round(progress * 100));
          setJobs([...updated]);
        });

        const args = buildArgs(inputName, outputName, options);
        await ffmpeg.exec(args);

        const outData = await ffmpeg.readFile(outputName);
        const outU8 = outData as Uint8Array;
        const arrayBuffer = outU8.buffer.slice(outU8.byteOffset, outU8.byteOffset + outU8.byteLength);
        const blob = new Blob([arrayBuffer as unknown as BlobPart], { type: options.format === "mp4" ? "video/mp4" : "video/webm" });
        const url = URL.createObjectURL(blob);

        job.downloadUrl = url;
        job.outputName = outputName;
        job.status = "done";
        job.progress = 100;

        // cleanup input to free memory
        try { await ffmpeg.deleteFile(inputName); } catch {}
        try { await ffmpeg.deleteFile(outputName); } catch {}
      } catch (err: any) {
        job.status = "error";
        job.error = String(err?.message || err);
      }
      setJobs([...updated]);
    }

    setIsProcessing(false);
  }, [jobs, options]);

  const handleZip = useCallback(async () => {
    const ready = jobs.filter((j) => j.status === "done" && j.downloadUrl);
    if (ready.length === 0) return;
    const blobs = await Promise.all(
      ready.map(async (j) => {
        const res = await fetch(j.downloadUrl!);
        const blob = await res.blob();
        return { name: j.outputName, blob };
      })
    );
    await zipBlobsAsZipFile(blobs, "processed-videos.zip");
  }, [jobs]);

  return (
    <div className="container">
      <div className="header">
        <div className="title">Bulk Video Processor</div>
        <div>
          <button className="btn secondary" onClick={() => inputRef.current?.click()}>Select Videos</button>
          <input ref={inputRef} type="file" accept="video/*" multiple hidden onChange={(e) => onFilesSelected(e.target.files)} />
        </div>
      </div>

      <div className="grid">
        <div className="col-8">
          <div className="card" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
            <div className="dnd">
              Drag & drop videos here, or click Select Videos
            </div>

            {jobs.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="file-list">
                  {jobs.map((j, idx) => (
                    <div key={idx} className="card" style={{ padding: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>
                          <div style={{ fontWeight: 600 }}>{j.file.name}</div>
                          <div style={{ fontSize: 12, color: "#64748b" }}>{Math.round(j.file.size / 1024 / 1024)} MB</div>
                        </div>
                        <div>
                          <span className="badge">{j.status}</span>
                        </div>
                      </div>
                      <div className="progress" style={{ marginTop: 8 }}>
                        <span style={{ width: `${j.progress}%` }} />
                      </div>
                      <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                        {j.downloadUrl && j.status === "done" && (
                          <a className="btn secondary" href={j.downloadUrl} download={j.outputName}>Download</a>
                        )}
                        {j.status === "error" && (
                          <span style={{ color: "#dc2626", fontSize: 12 }}>{j.error}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="footer">All processing happens locally in your browser. No uploads.</div>
        </div>

        <div className="col-4">
          <div className="card" style={{ display: "grid", gap: 12 }}>
            <div>
              <label className="label">Output format</label>
              <select
                className="input"
                value={options.format}
                onChange={(e) => setOptions((o) => ({ ...o, format: e.target.value as Options["format"], }))}
              >
                <option value="mp4">MP4 (H.264)</option>
                <option value="webm">WebM (VP9)</option>
              </select>
            </div>

            <div>
              <label className="label">Resolution</label>
              <select
                className="input"
                value={options.resolution}
                onChange={(e) => setOptions((o) => ({ ...o, resolution: e.target.value as Options["resolution"], }))}
              >
                <option value="source">Keep source</option>
                <option value="720p">Limit to 720p</option>
                <option value="1080p">Limit to 1080p</option>
              </select>
            </div>

            <div>
              <label className="label">Video bitrate</label>
              <select
                className="input"
                value={options.bitrate}
                onChange={(e) => setOptions((o) => ({ ...o, bitrate: e.target.value as Options["bitrate"], }))}
              >
                <option value="auto">Auto</option>
                <option value="1M">1 Mbps</option>
                <option value="2.5M">2.5 Mbps</option>
                <option value="5M">5 Mbps</option>
              </select>
            </div>

            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <label className="label">Trim start (s)</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  placeholder="0"
                  value={options.trimStartSec ?? ""}
                  onChange={(e) => setOptions((o) => ({ ...o, trimStartSec: e.target.value === "" ? undefined : Number(e.target.value) }))}
                />
              </div>
              <div>
                <label className="label">Trim end (s)</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  placeholder=""
                  value={options.trimEndSec ?? ""}
                  onChange={(e) => setOptions((o) => ({ ...o, trimEndSec: e.target.value === "" ? undefined : Number(e.target.value) }))}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn secondary" onClick={() => setJobs([])} disabled={isProcessing}>Clear</button>
              <button className="btn primary" onClick={handleProcess} disabled={isProcessing || jobs.length === 0}>Process</button>
            </div>

            <button className="btn secondary" onClick={handleZip} disabled={!allDone}>Download all as ZIP</button>
          </div>
        </div>
      </div>
    </div>
  );
}
