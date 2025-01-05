import "./globals.css";
import Navbar from './components/Navbar';

// Removed metadata export to comply with Next.js requirements for client components.

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>      
            <Navbar />
            {children}
      </body>
    </html>
  );
}
