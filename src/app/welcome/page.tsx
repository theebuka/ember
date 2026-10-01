import { PersonalizeScreen } from "@/components/onboarding/personalize-screen";

export const metadata = {
  title: "Welcome",
  description: "Two optional questions to finish setup.",
};

export default function WelcomePage() {
  return <PersonalizeScreen />;
}
