import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './global.css';
import './Navbar.css';
import './Account.css';

/* NAVBAR assets */
import TaedalLogoName from './assets/images/taedal-logo-name.svg';
import MintButton from './assets/images/mint-button.svg';

/* ACCOUNT hero assets
   Make sure these filenames match your actual files. */
import AccountPageLogo from './assets/images/account-page-logo.svg';
import AccountPageTitle from './assets/images/account-page-title.svg';
import SignUpBtn from './assets/images/sign-up-button.svg';
import LogInBtn from './assets/images/log-in-button.svg';

/* Custom cursor */
import CursorSvg from './assets/images/cursor.svg';

export default function Account() {
  const [checking, setChecking] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const navigate = useNavigate();

  const titleRef = useRef(null);
  const taglineRef = useRef(null);
  const heroRef = useRef(null);
  const logoWrapRef = useRef(null);

  // Only non-logged-in users should see this page
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('http://localhost:5000/api/check-session', {
          credentials: 'include',
        });
        const data = await res.json();
        setLoggedIn(!!data.isLoggedIn);
      } catch {
        setLoggedIn(false);
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  // Auto-expand tagline tracking to match title width
  useEffect(() => {
    const updateTracking = () => {
      if (!titleRef.current || !taglineRef.current) return;
      const titleW = titleRef.current.getBoundingClientRect().width;
      const el = taglineRef.current;

      el.style.letterSpacing = '0px';
      el.style.whiteSpace = 'nowrap';
      el.style.width = 'auto';
      const baseW = el.getBoundingClientRect().width;

      const text = el.textContent || '';
      const gaps = Math.max(text.length - 1, 1);
      const spacing = Math.max((titleW - baseW) / gaps, 0);

      el.style.width = `${titleW}px`;
      el.style.letterSpacing = `${spacing}px`;
    };
    updateTracking();
    const onResize = () => updateTracking();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 3D parallax tilt on cursor move (applied to the logo wrapper)
  useEffect(() => {
    const el = logoWrapRef.current;
    const area = heroRef.current;
    if (!el || !area) return;

    const maxTilt = 6;        // degrees
    const maxMoveX = 8;       // px
    const maxMoveY = 6;       // px

    const onMove = (e) => {
      const rect = area.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;   // 0..1
      const y = (e.clientY - rect.top) / rect.height;   // 0..1
      const dx = x - 0.5;                                // -0.5..0.5
      const dy = y - 0.5;

      const rotateX = (-dy * maxTilt).toFixed(2);
      const rotateY = (dx * maxTilt).toFixed(2);
      const tx = (dx * maxMoveX).toFixed(2);
      const ty = (dy * maxMoveY).toFixed(2);

      el.style.transform =
        `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translate3d(${tx}px, ${ty}px, 0)`;
    };

    const onLeave = () => {
      el.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) translate3d(0,0,0)';
    };

    area.addEventListener('pointermove', onMove);
    area.addEventListener('pointerleave', onLeave);
    return () => {
      area.removeEventListener('pointermove', onMove);
      area.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  // If already logged-in, bounce to homepage
  useEffect(() => {
    if (!checking && loggedIn) navigate('/');
  }, [checking, loggedIn, navigate]);

  if (checking || loggedIn) return null;

  return (
    <div
      className="account-page"
      style={{ '--cursor': `url(${CursorSvg}) 8 8` }}  // custom cursor
    >
      {/* ===== NAVBAR ===== */}
      <header className="navbar">
        <div className="navbar-left">
          <Link to="/" className="logo-link">
            <img src={TaedalLogoName} alt="Taedal" className="taedal-logo-name" />
          </Link>
        </div>
        <div className="navbar-right">
          <Link to="/community" className="nav-link">community</Link>
          <Link to="/portfolio" className="nav-link">portfolio</Link>
          <Link to="/account" className="nav-link active">account</Link>
          <Link to="/mint" className="mint-btn">
            <img src={MintButton} alt="Mint" className="mint-button-img" />
          </Link>
        </div>
      </header>

      {/* ===== HERO ===== */}
      <main ref={heroRef} className="account-hero">
        {/* 3D-tilt wrapper */}
        <div className="account-hero-logo-wrap" ref={logoWrapRef}>
          <img
            src={AccountPageLogo}
            alt="Account Hero"
            className="account-hero-logo"
            draggable="false"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              console.warn('Account hero image failed to load. Check the filename/path.');
            }}
          />
        </div>

        {/* TAEDAL title below logo */}
        <img
          ref={titleRef}
          src={AccountPageTitle}
          alt="TAEDAL"
          className="account-hero-title"
          draggable="false"
          onLoad={() => window.dispatchEvent(new Event('resize'))}
        />

        {/* buttons */}
        <div className="account-cta-row">
          <Link to="/signup" className="account-cta-btn" aria-label="Sign up">
            <img src={SignUpBtn} alt="sign up" className="account-cta-img" />
          </Link>

          <Link to="/login" className="account-cta-btn" aria-label="Log in">
            <img src={LogInBtn} alt="log in" className="account-cta-img" />
          </Link>
        </div>

        {/* tagline */}
        <p ref={taglineRef} className="account-tagline">
          made by artist for artists
        </p>
      </main>
    </div>
  );
}
