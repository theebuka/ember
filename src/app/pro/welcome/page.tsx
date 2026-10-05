import { ProWelcome } from "@/components/plan/pro-welcome";

export const metadata = {
  title: "You're on Pro",
  description: "Your Pro subscription is active.",
  // A post-payment page: nothing here is for a search engine.
  robots: { index: false, follow: false },
};

export default function ProWelcomePage() {
  return <ProWelcome />;
}
