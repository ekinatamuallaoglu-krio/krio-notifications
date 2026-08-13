import "./globals.css";

export const metadata = {
  title: "Krio Messages",
  description: "Krio çok hesaplı mesajlaşma uygulaması",
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
