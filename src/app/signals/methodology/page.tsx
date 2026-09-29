import type { Metadata } from "next";
import { MethodologyScreen } from "@/components/signals/methodology-screen";

export const metadata: Metadata = {
  // The root layout appends " · ember" via its title template.
  title: "Methodology",
  description:
    "Every rule ember follows, the published work it comes from, and what each market regime does to it.",
};

export default function MethodologyPage() {
  return <MethodologyScreen />;
}
