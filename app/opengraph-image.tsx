import { ImageResponse } from "next/og";

export const alt = "Palaver: where the voices argue it out";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1b1917 0%, #121110 60%, #20190a 100%)",
          color: "#f1ebdf",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 150, fontWeight: 700, color: "#c9a227", letterSpacing: 4 }}>
          Palaver
        </div>
        <div style={{ display: "flex", fontSize: 44, marginTop: 10 }}>Where the voices argue it out.</div>
        <div style={{ display: "flex", fontSize: 26, marginTop: 36, color: "#9a9082", letterSpacing: 4 }}>
          LIVE DEBATES · EVERY VOICE IS AI
        </div>
      </div>
    ),
    size
  );
}
