// client/src/Home.jsx
import React from "react";
import { Link } from "react-router-dom";
import "./Home.css";

/* assets */
import CanvasSVG from "./assets/icons/digital-canvas.svg";
import BtnCreate from "./assets/icons/create-a-listing-button.svg";
import BtnExplore from "./assets/icons/explore-marketplace-button.svg";

/* stats as images */
import Stat30k from "./assets/icons/30k-verified-artworks.svg";
import Stat10k from "./assets/icons/10k-verified.svg";
import Stat8k  from "./assets/icons/8k-verified.svg";

/* how-it-works dogs */
import Dog1 from "./assets/icons/dog-1.svg";
import Dog2 from "./assets/icons/dog-2.svg";
import Dog3 from "./assets/icons/dog-3.svg";

/* 3D coin */
import CoinViewer from "./components/CoinViewer";
import CoinGLB from "./assets/icons/taedal-coin.glb";

import DigitalCanvasFX from "./DigitalCanvasFX";

export default function Home() {
  return (
    <main className="home figma-stage">
      {/* The “design canvas”: fixed 1440 × 3516.19, scaled to viewport width */}
      <div className="stage" aria-label="Frame 60 (1440) layout">

        {/* ---------- HERO (coin + wordmark + slogan) ---------- */}
        {/* coin: W 324.56 × H 324.56 at (X 558, Y 162.56) */}
        <div className="abs coin">
          <CoinViewer src={CoinGLB} />
        </div>

        {/* “taedal”: size 78.75 at (X 598, Y 487.13) */}
        <h1 className="abs brand">taedal</h1>

        {/* slogan: size 16.88, letter-spacing 9% at (X 603, Y 592.88) */}
        <p className="abs slogan">made by artists for artists</p>

        {/* ---------- SELL BLOCK (left copy + CTAs + stats) ---------- */}
        {/* headline: size 56.25, W 700.31 H 130 at (X 64.13, Y 936.56) */}
        <h2 className="abs sell-title">
          sell physical &amp; digital art
          <br />
          with on-chain provenance
        </h2>

        {/* paragraph: size 22.5, W 619.31 H 78 at (X 64.13, Y 1082.81) */}
        <p className="abs sell-desc">
          Create authentic art listings with blockchain verification. Connect
          physical pieces to digital ownership and unlock new possibilities for
          artists and collectors.
        </p>

        {/* CTAs */}
        {/* create: W 255.94 H 39.94 at (X 64.13, Y 1184.06) */}
        <Link to="/listings/new" className="abs cta-create" aria-label="create a listing">
          <img src={BtnCreate} alt="" draggable="false" />
        </Link>

        {/* explore: W 383.4 H 39.94 at (X 338.06, Y 1184.06) */}
        <Link to="/community" className="abs cta-explore" aria-label="explore marketplace">
          <img src={BtnExplore} alt="" draggable="false" />
        </Link>

        {/* stats images row (Y 1244.81) */}
        <img className="abs stat-30k" src={Stat30k} alt="30k+ verified artworks" draggable="false" />
        <img className="abs stat-10k" src={Stat10k} alt="10k+ verified artists"  draggable="false" />
        <img className="abs stat-8k"  src={Stat8k}  alt="8k+ verified artists"   draggable="false" />

        {/* right illustration (can overflow frame by design) */}
        {/* digital-canvas: W 1767.81 H 556.88 at (X 793.69, Y 936.56) */}
        <img className="abs canvas-img" src={CanvasSVG} alt="digital canvas" draggable="false" />

        {/* ---------- HOW IT WORKS ---------- */}
        {/* title: size 56.25, W 328 H 65 at (X 541.69, Y 1694.25) */}
        <h3 className="abs hiw-title">how it works</h3>

        {/* sub: size 22.5, W 789.19 H 52 at (X 311.06, Y 1792.69) */}
        <p className="abs hiw-sub">
          Create verifiable art listings in three simple steps. Connect your
          physical and digital art with blockchain technology.
        </p>

        {/* dogs */}
        {/* dog-1: W 387 H 383.13 at (X 75.94, Y 1907.44) */}
        <img className="abs dog dog-1" src={Dog1} alt="" draggable="false" />
        {/* dog-2: W 387 H 402.13 at (X 526.5, Y 1907.44) */}
        <img className="abs dog dog-2" src={Dog2} alt="" draggable="false" />
        {/* dog-3: W 387 H 364.13 at (X 977.06, Y 1907.44) */}
        <img className="abs dog dog-3" src={Dog3} alt="" draggable="false" />
      </div>
    </main>
  );
}
