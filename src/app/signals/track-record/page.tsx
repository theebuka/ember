import type { Metadata } from "next";
import { TrackRecordScreen } from "@/components/signals/track-record-screen";

export const metadata: Metadata = {
  // The root layout appends " · ember" via its title template.
  title: "Track record",
  description:
    "Walk-forward output from the same engine that serves the advice feed — every call, including the losers.",
};

export default function TrackRecordPage() {
  return <TrackRecordScreen />;
}
