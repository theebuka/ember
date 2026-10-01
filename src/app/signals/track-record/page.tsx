import type { Metadata } from "next";
import { TrackRecordScreen } from "@/components/signals/track-record-screen";

export const metadata: Metadata = {
  // The root layout appends " · ember" via its title template.
  title: "Track record",
  description:
    "Every call ember's engine has made in testing, losses included.",
};

export default function TrackRecordPage() {
  return <TrackRecordScreen />;
}
