import type { Metadata } from "next";
import { SignalsScreen } from "@/components/signals/signals-screen";

export const metadata: Metadata = {
  // The root layout appends " · ember" via its title template.
  title: "Signals",
  description:
    "What to act on, when, and why.",
};

export default function SignalsPage() {
  return <SignalsScreen />;
}
