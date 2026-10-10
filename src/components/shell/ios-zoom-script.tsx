/**
 * Stops iOS zooming the page when a field takes focus, on iOS only.
 *
 * Phone inputs are 14px, and Safari on iOS zooms into anything under 16px. A
 * `maximum-scale=1` viewport stops that, and iOS ignores the cap for pinch, so
 * the reader can still zoom. Android honours the cap and would lose pinch-zoom
 * for nothing, since it never zoomed on focus to begin with. That is why this
 * is a script rather than `maximumScale` in the root `viewport` export, where
 * `scripts/audit.mjs` rightly fails it (`meta-viewport`).
 *
 * A second `<meta>` appended to `<head>`, never an edit to the one React
 * rendered: React matches its own by content, and a later tag wins.
 */
export function IosZoomScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `try{var n=navigator;if(/iP(hone|ad|od)/.test(n.userAgent)||(n.platform==="MacIntel"&&n.maxTouchPoints>1)){var m=document.createElement("meta");m.name="viewport";m.content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover";document.head.appendChild(m)}}catch(e){}`,
      }}
    />
  );
}
