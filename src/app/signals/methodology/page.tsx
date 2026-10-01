import type { Metadata } from "next";
import { MethodologyScreen } from "@/components/signals/methodology-screen";

export const metadata: Metadata = {
  // The root layout appends " · ember" via its title template.
  title: "Methodology",
  description:
    "Every rule ember uses and the research behind it.",
};

export default function MethodologyPage() {
  return <MethodologyScreen />;
}
