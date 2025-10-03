import React, { forwardRef } from "react";
import "./ShinyText.css";

/* forwardRef so your letter-spacing script can measure/resize */
const ShinyText = forwardRef(function ShinyText(
  { text, disabled = false, speed = 5, className = "" },
  ref
) {
  const animationDuration = `${speed}s`;
  return (
    <div
      ref={ref}
      className={`shiny-text ${disabled ? "disabled" : ""} ${className}`}
      style={{ animationDuration }}
    >
      {text}
    </div>
  );
});

export default ShinyText;
