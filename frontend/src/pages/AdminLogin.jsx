// frontend/src/pages/AdminLogin.jsx
import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleNotch, faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import useSound from "../components/useSound";

export default function AdminLogin({ onLogin }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [formLoaded, setFormLoaded] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Sound hook for error sound
  const { audioRef: errorAudioRef, playSound: playErrorSound } = useSound("/sounds/error.mp3");

  useEffect(() => {
    setFormLoaded(true);
  }, []);

  // Effect for playing error sound when general error state is set
  useEffect(() => {
    if (error) {
      playErrorSound();
    }
  }, [error, playErrorSound]);

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        setError("Invalid credentials. Please try again.");
      } else {
        const data = await res.json();
        onLogin(data.token);
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 font-sans">
      {/* Audio element for error sound */}
      <audio ref={errorAudioRef} src="/sounds/error.mp3" preload="auto" />

      <div
        className={`bg-header-bg-to p-10 rounded-xl shadow-2xl max-w-md w-full ${formLoaded ? 'animate-pop-in' : 'opacity-0'}`}
      >
        <h2 className="text-4xl font-extrabold mb-8 text-center text-header-text">Login</h2>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full border border-border rounded-lg px-5 py-3.5 mb-5 text-lg placeholder-muted focus:outline-none focus:ring-3 focus:ring-primary transition duration-200 ease-in-out"
          aria-label="Username"
          disabled={loading}
        />
        <div className="relative mb-6">
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-border rounded-lg px-5 py-3.5 text-lg placeholder-muted focus:outline-none focus:ring-3 focus:ring-primary transition duration-200 ease-in-out pr-12"
            aria-label="Password"
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading) {
                handleSubmit();
              }
            }}
          />
          <button
            type="button"
            onClick={togglePasswordVisibility}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted hover:text-header-text focus:outline-none bg-transparent border-none p-0 cursor-pointer"
            aria-label={showPassword ? "Hide password" : "Show password"}
            disabled={loading}
          >
            <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="text-xl" />
          </button>
        </div>
        <button
          onClick={handleSubmit}
          type="submit"
          className="w-full bg-button-bg hover:bg-button-hover-bg text-white font-bold py-3.5 rounded-lg shadow-lg hover:shadow-xl transition duration-200 ease-in-out active:scale-95 focus:outline-none focus:ring-3 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          disabled={loading}
        >
          {loading ? (
            <FontAwesomeIcon icon={faCircleNotch} className="fa-spin mr-2" />
          ) : null}
          {loading ? "Logging In..." : "Login"}
        </button>
        {error && (
          <p className="mt-6 text-center text-danger bg-danger-bg border border-danger-border py-3 rounded-lg font-medium animate-shake">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}