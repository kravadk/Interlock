import { ImageResponse } from "next/og";

export const alt = "Interlock Control Plane";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "linear-gradient(135deg, #070a12 0%, #101827 58%, #153224 100%)",
          color: "#f4f7fb",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 28,
            color: "#9fb3c8",
          }}
        >
          <span>Interlock</span>
          <span>Mantle Sepolia</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.02 }}>
            Pre-flight firewall for autonomous AI agents
          </div>
          <div style={{ maxWidth: 900, fontSize: 30, lineHeight: 1.35, color: "#c9d6e4" }}>
            Policy checks, live simulation, on-chain evidence, benchmark scoring, and developer integrations on Mantle.
          </div>
        </div>
        <div style={{ display: "flex", gap: 18, fontSize: 24 }}>
          {["Safety", "Evidence", "Benchmark", "SDK / REST / MCP"].map((item) => (
            <span
              key={item}
              style={{
                padding: "12px 18px",
                borderRadius: 999,
                background: "rgba(56, 242, 166, 0.12)",
                border: "1px solid rgba(56, 242, 166, 0.35)",
                color: "#bfffe1",
              }}
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
