import { useState, useCallback, useRef, useEffect } from "react";
import Cropper from "react-easy-crop";

/**
 * Render a simple modal with a square cropper.
 * Props:
 *  - src: object URL or data URL to crop
 *  - onCancel: () => void
 *  - onCropped: (file: File) => void  // returns a File named avatar.jpg
 */
export default function AvatarCropper({ src, onCancel, onCropped }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1.2);
  const [area, setArea] = useState(null);

  const onCropComplete = useCallback((_croppedArea, croppedAreaPixels) => {
    setArea(croppedAreaPixels);
  }, []);

  // create a cropped JPEG from the source and area
  const doCrop = useCallback(async () => {
    if (!src || !area) return;

    const image = await loadImage(src);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const size = Math.max(area.width, area.height); // keep square
    canvas.width = size;
    canvas.height = size;

    // draw the crop on a square canvas
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      image,
      area.x, area.y, area.width, area.height,
      0, 0, size, size
    );

    const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
    const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
    onCropped?.(file);
  }, [src, area, onCropped]);

  // ESC to close
  const esc = useCallback((e) => { if (e.key === "Escape") onCancel?.(); }, [onCancel]);
  useEffect(() => {
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [esc]);

  return (
    <div className="cropper-modal" onClick={onCancel}>
      <div className="cropper-card" onClick={(e) => e.stopPropagation()}>
        <div className="cropper-stage">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={1}
            restrictPosition={false}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            objectFit="contain"
          />
        </div>

        <div className="cropper-toolbar">
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            aria-label="Zoom"
            style={{ width: "140px" }}
          />
          <div className="grow" />
          <button className="cropper-btn ghost" onClick={onCancel}>Cancel</button>
          <button className="cropper-btn primary" onClick={doCrop}>Save</button>
        </div>
      </div>
    </div>
  );
}

/* ------- helpers ------- */
function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.crossOrigin = "anonymous";
    img.src = src;
  });
}

function canvasToBlob(canvas, type = "image/png", quality) {
  return new Promise((res) => canvas.toBlob((b) => res(b), type, quality));
}
