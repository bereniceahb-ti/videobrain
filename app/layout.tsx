import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata={title:"VideoBrain",description:"Transforme vídeos salvos em conhecimento útil."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}