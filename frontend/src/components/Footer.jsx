// frontend/src/components/Footer.jsx
import React from "react";
import { Link } from "react-router-dom";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-header-bg-to text-header-text py-6 px-8 mt-12 font-sans">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center text-center md:text-left">
        <div className="mb-4 md:mb-0 text-muted">
          <p>&copy; {currentYear} TrustQuery. All rights reserved.</p>
        </div>
        <nav className="flex flex-wrap justify-center space-x-6">
          <Link
            to="/privacy-policy"
            className="text-muted hover:text-link-hover-text transition duration-150"
          >
            Privacy Policy
          </Link>
          <Link
            to="/terms-of-service"
            className="text-muted hover:text-link-hover-text transition duration-150"
          >
            Terms of Service
          </Link>
          <Link
            to="/disclaimer"
            className="text-muted hover:text-link-hover-text transition duration-150"
          >
            Disclaimer
          </Link>
        </nav>
      </div>
    </footer>
  );
}