import "./globals.css";

export const metadata = {
  title: "AI Daily News Brief",
  description: "Daily news pipeline dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
