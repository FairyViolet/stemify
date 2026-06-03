import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stemify — AI Audio Stem Separator",
  description:
    "Separate vocals, instruments, drums, and bass from music and video files using AI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#07070d] text-white">
        {children}
      </body>
    </html>
  );
}
