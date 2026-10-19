import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import "./globals.css";

const description = "Speed math sprints, live duels, a daily challenge and number puzzles.";

export const metadata: Metadata = {
  title: { default: "Matik: speed math", template: "%s · Matik" },
  description,
  applicationName: "Matik",
  openGraph: { title: "Matik: speed math", description, type: "website", siteName: "Matik" },
  twitter: { card: "summary", title: "Matik: speed math", description },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8fc" },
    { media: "(prefers-color-scheme: dark)", color: "#12182d" },
  ],
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
