import { BAR_HINT_KEY } from "@/lib/notifications/pinned";

/**
 * Reserve the announcement bar's height before the first paint.
 *
 * A server component holding one blocking inline script — deferred, it would run
 * after the frame it exists to fix. Its own file because `announcement-bar.tsx`
 * is `"use client"`, and a `<script>` emitted from a client component is not
 * guaranteed to run before hydration.
 *
 * Why a client-side hint at all rather than the server knowing: the bar lives in
 * the root shell, so reading a cookie for it would make **every** route dynamic,
 * including 214 prerendered asset pages and the static public argument pages.
 * That is a permanent cost to avoid a shift on a rare event. See
 * `announcement-bar.tsx` for the full argument.
 */
export function AnnouncementBarScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `try{if(localStorage.getItem(${JSON.stringify(BAR_HINT_KEY)}))document.documentElement.style.setProperty("--bar-h","2.5rem")}catch(e){}`,
      }}
    />
  );
}
