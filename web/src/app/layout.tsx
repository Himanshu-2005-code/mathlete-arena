import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import "./globals.css";
import "./hud.css";

const description = "Speed math sprints, live duels, a daily challenge and number puzzles.";

export const metadata: Metadata = {
  title: { default: "Matik: speed math", template: "%s · Matik" },
  description,
  applicationName: "Matik",
  openGraph: { title: "Matik: speed math", description, type: "website", siteName: "Matik" },
  twitter: { card: "summary", title: "Matik: speed math", description },
};

export const viewport: Viewport = {
  themeColor: "#07090a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint so the page doesn't flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("matik.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,700;12..96,800&family=JetBrains+Mono:wght@400;500&family=Rajdhani:wght@400;500;600;700&family=Teko:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <AuthProvider>
          <a href="#main" className="skip-link">
            Skip to content
          </a>
          <div className="shell">
            <TopBar />
            <main id="main" tabIndex={-1}>
              {children}
            </main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
