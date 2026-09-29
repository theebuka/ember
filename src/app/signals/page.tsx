import type { Metadata } from "next";
import { SignalsScreen } from "@/components/signals/signals-screen";

export const metadata: Metadata = {
  // The root layout appends " · ember" via its title template.
  title: "Signals",
  description:
    "What ember thinks is worth acting on, the window to act in, and every rule behind it.",
};

export default function SignalsPage() {
  return <SignalsScreen />;
}
