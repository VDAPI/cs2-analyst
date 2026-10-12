import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "CS2 Analyst — zobacz, co psuje Twoją grę";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// next/og ships a latin-only font; Geist covers the Polish letters.
async function geist(weight: "Regular" | "Bold") {
  return readFile(join(process.cwd(), `node_modules/geist/dist/fonts/geist-sans/Geist-${weight}.ttf`));
}

// Token values (--canvas, --accent, --accent-2, --ct-blue, --t-gold, --text-*): CSS vars don't reach next/og.
const C = {
  bg: "#08070D",
  accent: "#9B6BFF",
  lime: "#C6FF3D",
  ct: "#5AA9FF",
  t: "#FFC23D",
  text: "#F3F0FF",
  text2: "#B9B2D6",
  line: "rgba(190,160,255,0.18)",
};

/**
 * Mid-stride soldier, same shapes as the homepage hero (feet at 0,0, facing right).
 * Called as a function: satori serializes <svg> children as-is and does not render components inside them.
 */
function soldier({ x, y, s, side }: { x: number; y: number; s: number; side: "ct" | "t" }) {
  const col = side === "ct" ? C.ct : C.t;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill={col} stroke={col} filter="url(#glow)">
      <polyline points="-1,-21 -6,-13 -14,-8" fill="none" strokeWidth="5" strokeLinecap="round" opacity="0.55" />
      {side === "ct" && <rect x="-9" y="-38" width="6" height="13" rx="2" stroke="none" opacity="0.7" />}
      <polygon points="-4,-21 4,-21 8,-39 -3,-40" stroke="none" />
      <polyline points="-1,-21 5,-13 4,-3" fill="none" strokeWidth="5" strokeLinecap="round" />
      <circle cx="4" cy="-45" r="5" stroke="none" />
      {side === "ct" ? (
        <g>
          <path d="M -2.9 -46.3 A 6.5 6.5 0 0 1 9.9 -46.3 Z" stroke="none" />
          <line x1="-3" y1="-45.5" x2="11.5" y2="-45.5" strokeWidth="2" />
          <rect x="6" y="-44.5" width="4" height="2" fill={C.bg} stroke="none" />
        </g>
      ) : (
        <rect x="5" y="-46.5" width="5" height="2" fill={C.bg} stroke="none" />
      )}
      <rect x="-5" y="-34" width="6" height="4" rx="1" stroke="none" />
      <rect x="0" y="-34.5" width="15" height="4" rx="1" stroke="none" />
      <rect x="15" y="-33.5" width="9" height="1.8" stroke="none" />
      {side === "ct" ? (
        <g>
          <rect x="7" y="-31" width="3" height="6" stroke="none" />
          <rect x="9" y="-37" width="4" height="2.5" stroke="none" />
        </g>
      ) : (
        <path d="M 7 -31 Q 9 -25 12 -24 L 13 -27 Q 11 -28 10 -31 Z" stroke="none" />
      )}
      <polyline points="1,-38 2,-30" fill="none" strokeWidth="3.5" strokeLinecap="round" />
      <polyline points="5,-38 13,-32" fill="none" strokeWidth="3.5" strokeLinecap="round" />
    </g>
  );
}

export default async function OpengraphImage() {
  const [regular, bold] = await Promise.all([geist("Regular"), geist("Bold")]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: `radial-gradient(circle at 78% 18%, rgba(155,107,255,0.28), ${C.bg} 60%)`,
          fontFamily: "Geist",
          color: C.text,
        }}
      >
        <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: "absolute", top: 0, left: 0 }}>
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g fill="none" stroke={C.line} strokeWidth="2">
            <polyline points="560,120 760,120 760,300 940,300 940,90 1160,90" />
            <polyline points="1160,520 980,520 980,360 700,360 700,560 560,560" />
            <polyline points="860,30 860,220 1080,220 1080,440 900,440 900,620" />
          </g>
          <rect x="1050" y="60" width="64" height="64" fill="none" stroke={C.accent} strokeDasharray="6 6" opacity="0.6" />
          <polyline points="700,300 760,300 760,250" fill="none" stroke={C.ct} strokeWidth="3" opacity="0.35" />
          <polyline points="900,520 980,520 980,470" fill="none" stroke={C.t} strokeWidth="3" opacity="0.35" />
          {soldier({ x: 780, y: 312, s: 2.6, side: "ct" })}
          {soldier({ x: 1000, y: 530, s: 2.6, side: "t" })}
          {soldier({ x: 1080, y: 232, s: 2, side: "ct" })}
        </svg>

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", width: 720 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: C.accent,
                boxShadow: "0 0 32px rgba(155,107,255,0.5)",
              }}
            />
            <div style={{ display: "flex", gap: 10, fontSize: 34, fontWeight: 700 }}>
              <span>CS2</span>
              <span style={{ color: C.lime }}>Analyst</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ display: "flex", flexWrap: "wrap", fontSize: 76, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2, columnGap: 20 }}>
              <span>Zobacz, co</span>
              <span style={{ color: C.accent }}>psuje</span>
              <span>Twoją grę.</span>
            </div>
            <div style={{ fontSize: 30, color: C.text2, lineHeight: 1.35 }}>
              Analiza dem CS2 z FACEIT i Premiera: błędy z momentem w rundzie, podglądem 2D i radą.
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: regular, weight: 400, style: "normal" },
        { name: "Geist", data: bold, weight: 700, style: "normal" },
      ],
    }
  );
}
