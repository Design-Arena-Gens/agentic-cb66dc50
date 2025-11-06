import JSZip from "jszip";

export async function zipBlobsAsZipFile(files: { name: string; blob: Blob }[], zipName: string) {
  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.name, f.blob);
  }
  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);

  const a = document.createElement("a");
  a.href = url;
  a.download = zipName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
