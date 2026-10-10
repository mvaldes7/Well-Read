import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FoundationLearn",
  description: "FoundationLearn personal web app",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
