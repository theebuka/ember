import { PersonalizeScreen } from "@/components/onboarding/personalize-screen";

export const metadata = {
  title: "Welcome",
  description: "Two questions, both optional, so ember knows what to call you.",
};

export default function WelcomePage() {
  return <PersonalizeScreen />;
}
