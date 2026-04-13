import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "X Layer Intent Router",
  description: "Agentic swap intents for X Layer mainnet"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
