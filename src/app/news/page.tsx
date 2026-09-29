import type { Metadata } from "next";
import { NewsScreen } from "@/components/news/news-screen";

export const metadata: Metadata = {
  // The root layout appends " · ember" via its title template.
  title: "News",
  description:
    "What's being written about the instruments ember watches — context, never a signal.",
};

export default function NewsPage() {
  return <NewsScreen />;
}
