import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PAPER_KEY } from "@/lib/paper";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "draftdrill — technical drawing practice",
  description:
    "Draw orthographic views, oblique projections and geometric constructions on a snapping grid, and get told exactly what is wrong.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/*
          Applies the stored paper BEFORE first paint.

          Every page here is statically prerendered, so the server cannot know
          this viewer's preference. Applied in an effect instead, a student on
          dark paper would get a white flash on every navigation — on the one
          surface this whole app is about.

          Deliberately inline and blocking: a deferred script paints first and
          corrects after, which is the flash this exists to remove. It is also
          this app's ONLY inline script — if a Content-Security-Policy is ever
          added, this needs a nonce or hash, and a CSP that forgets it will not
          error, it will silently restore the flash.

          Wrapped in try/catch because localStorage throws outright in some
          privacy configurations, and a theme script that throws before paint
          takes the page down with it. Only warm and dark set the attribute;
          white is :root's own definition.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              `(function(){try{var p=localStorage.getItem("${PAPER_KEY}");`
              + `if(p==="warm"||p==="dark")document.documentElement.setAttribute("data-paper",p)}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
