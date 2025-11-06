export const metadata = {
  title: "Bulk Video Processor",
  description: "Process multiple videos in your browser using ffmpeg.wasm",
};

import "./globals.css";
import React from "react";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
