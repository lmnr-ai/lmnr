import NotFoundContent from "@/components/error/not-found-content";
import CookieThemeProvider from "@/components/theme/cookie-theme-provider";

// Rendered outside the (app) layout's theme provider, so it applies the saved theme itself.
export default function NotFound() {
  return (
    <CookieThemeProvider>
      <NotFoundContent />
    </CookieThemeProvider>
  );
}
