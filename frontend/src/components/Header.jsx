import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react"; // You can use another icon lib if needed

export default function Header({ token, onLogout }) {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const handleLogout = () => {
    onLogout();
    navigate("/");
  };

  return (
    <header className="bg-gradient-to-r from-header-bg-from to-header-bg-to text-header-text px-6 py-4 shadow-lg font-sans">
      <div className="flex justify-between items-center">
        {/* Logo */}
        <Link
          to="/"
          className="flex items-center hover:text-link-hover-text transition"
        >
          <img
            src="/favicon.png"
            alt="TrustQuery Logo"
            className="mr-2"
            style={{ width: "15vh", height: "auto" }}
          />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center space-x-4">
          <Link
            to="/"
            className={
              "text-lg font-medium px-3 py-2 hover:text-link-hover-text hover:bg-button-hover-bg rounded-md transition" +
              (location.pathname == "/" && " bg-button-hover-bg")
            }
          >
            Home
          </Link>

          {token ? (
            <>
              <Link
                to="/admin"
                className={
                  "text-lg font-medium px-3 py-2 hover:text-link-hover-text hover:bg-button-hover-bg rounded-md transition" +
                  (location.pathname == "/admin" && " bg-button-hover-bg")
                }
              >
                Admin Dashboard
              </Link>
              <button
                onClick={handleLogout}
                className="ml-4 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-full shadow transition focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                Logout
              </button>
            </>
          ) : (
            <Link
              to="/admin/login"
              className={
                "text-lg font-medium px-3 py-2 hover:text-link-hover-text hover:bg-button-hover-bg rounded-md transition" +
                (location.pathname == "/admin/login" && " bg-button-hover-bg")
              }
            >
              Login
            </Link>
          )}
        </nav>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileMenuOpen(!isMobileMenuOpen)}
          className="md:hidden text-header-text focus:outline-none"
        >
          {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {/* Mobile Nav */}
      {isMobileMenuOpen && (
        <div className="md:hidden mt-4 space-y-2">
          <Link
            to="/"
            className="block text-lg font-medium px-4 py-2 rounded-md hover:bg-button-hover-bg transition"
            onClick={() => setMobileMenuOpen(false)}
          >
            Home
          </Link>

          {token ? (
            <>
              <Link
                to="/admin"
                className="block text-lg font-medium px-4 py-2 rounded-md hover:bg-button-hover-bg transition"
                onClick={() => setMobileMenuOpen(false)}
              >
                Admin Dashboard
              </Link>
              <button
                onClick={() => {
                  handleLogout();
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-md transition"
              >
                Logout
              </button>
            </>
          ) : (
            <Link
              to="/admin/login"
              className="block text-lg font-medium px-4 py-2 rounded-md hover:bg-button-hover-bg transition"
              onClick={() => setMobileMenuOpen(false)}
            >
              Login
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
