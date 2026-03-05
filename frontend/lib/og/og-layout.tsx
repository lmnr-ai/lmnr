import type { ReactNode } from "react";

const LAMINAR_ICON_PATH =
  "M1.32507 73.4886C0.00220402 72.0863 0.0802819 69.9867 0.653968 68.1462C3.57273 58.7824 5.14534 48.8249 5.14534 38.5C5.14534 27.8899 3.48464 17.6677 0.408998 8.0791C-0.129499 6.40029 -0.266346 4.50696 0.811824 3.11199C2.27491 1.21902 4.56777 0 7.14535 0H37.1454C58.1322 0 75.1454 17.0132 75.1454 38C75.1454 58.9868 58.1322 76 37.1454 76H7.14535C4.85185 76 2.78376 75.0349 1.32507 73.4886Z";

export function OgLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 76 76" fill="none">
      <path fillRule="evenodd" clipRule="evenodd" d={LAMINAR_ICON_PATH} fill="white" />
    </svg>
  );
}

export function OgHeader({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <OgLogo />
        <span style={{ color: "#ffffff", fontSize: "28px", fontWeight: 600 }}>laminar</span>
      </div>
      <span
        style={{
          color: "#a3a3a3",
          fontSize: "18px",
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "2px",
        }}
      >
        {label}
      </span>
    </div>
  );
}

export function OgAccentLine() {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: "4px",
        background: "linear-gradient(90deg, #6366f1, #8b5cf6, #a855f7)",
      }}
    />
  );
}

export function OgContainer({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: "#0a0a0a",
        padding: "60px 80px",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {children}
      <OgAccentLine />
    </div>
  );
}
