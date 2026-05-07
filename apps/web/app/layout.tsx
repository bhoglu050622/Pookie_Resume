import type { Metadata } from "next";
import "../styles/tokens.css";
import { Sidebar } from "../components/sidebar";

export const metadata: Metadata = {
  title: "Pookie — Job Apply",
  description: "A gentle, fast way to apply for jobs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,700&family=Inter:wght@400;450;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 px-10 py-10 max-w-[1180px]">{children}</main>
        </div>
      </body>
    </html>
  );
}
