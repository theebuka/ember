import Link from "next/link";
import { Compass } from "@/components/common/icon";
import { EmptyState } from "@/components/common/empty-state";
import { PageBody } from "@/components/common/page-body";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Page not found" };

/**
 * Any path that doesn't resolve, inside the app's own frame.
 *
 * It was Next's default "404 · This page could not be found", in a different
 * face, with no way back. Old paths that have moved are redirected in
 * `next.config.ts`; this is for everything else.
 */
export default function NotFound() {
  return (
    <PageBody>
      <EmptyState
        icon={Compass}
        title="This page doesn't exist"
        description="The link may be old, or the address mistyped. Everything ember has is a tab away."
        className="min-h-[60dvh]"
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href="/">Go to Home</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/signals">See today&apos;s calls</Link>
            </Button>
          </div>
        }
      />
    </PageBody>
  );
}
