import React, { useState } from "react";
import { toAbsolute } from "../lib/urls";

/**
 * Props:
 *  - value: string (URL/text to encode; can be absolute or a relative path like "/verify/123")
 *  - filename: string (e.g. "art-123-qr.png")
 *  - size: number (PNG px)
 *  - className: string
 */
export default function QRDownloadButton({ value, filename = "qr.png", size = 768, className = "" }) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    const payload = toAbsolute(value);
    if (!payload) return;

    setBusy(true);
    try {
      const QRCode = (await import("qrcode")).default;
      const dataUrl = await QRCode.toDataURL(payload, {
        errorCorrectionLevel: "H",
        width: size,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error("QR generation failed:", e);
      alert("Couldn't generate QR. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      className={["btn", "ghost", className, busy ? "is-busy" : ""].join(" ")}
      onClick={onClick}
      disabled={!value || busy}
      title="Download a QR code that opens the verification page"
    >
      {busy ? "Generating…" : "Download QR"}
    </button>
  );
}
