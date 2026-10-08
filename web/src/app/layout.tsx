import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Matik",
  description: "Speed math sprints and cross-math puzzles.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,700;12..96,800&display=swap"
        />
      </head>
      <body>
        <AuthProvider>
          <div className="shell">
            <TopBar />
            <main>{children}</main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
