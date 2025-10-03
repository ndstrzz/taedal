// client/src/components/Navbar.jsx
import React from "react";
import { NavLink, Link } from "react-router-dom";
import "./Navbar.css";
import TaedalLogo from "../assets/icons/taedal-logo.svg";

export default function Navbar() {
  console.log("NEW Taedal Navbar mounted");

  return (
    <header className="t-nav">
      <div className="t-nav__inner">
        <Link to="/" className="t-nav__brand">
          <img src={TaedalLogo} alt="taedal logo" className="t-nav__brand-img" />
        </Link>

        <form className="t-nav__search" role="search" action="/community">
          <input
            className="t-nav__search-input"
            type="search"
            name="q"
            placeholder="👀 search the name of the artwork or username"
            aria-label="Search artworks or usernames"
          />
        </form>

        <nav className="t-nav__links">
          <NavLink to="/contracts" className="t-nav__link">contracts</NavLink>
          {/* changed: route now points to the upload flow */}
          <NavLink to="/upload/start" className="t-nav__link">create</NavLink>
          <NavLink to="/community" className="t-nav__link">explore</NavLink>
          <NavLink to="/account" className="t-nav__link">account</NavLink>
        </nav>
      </div>
    </header>
  );
}
