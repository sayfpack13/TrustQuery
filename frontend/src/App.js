import React, { useState, useEffect, useRef } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import HomePage from "./pages/HomePage";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import Header from "./components/Header";
import Footer from "./components/Footer";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import Disclaimer from "./pages/Disclaimer";
import useSound from "./components/useSound";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleNotch, faPlay } from "@fortawesome/free-solid-svg-icons";

export default function App() {
  const [token, setToken] = useState(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [overlayAnimatingOut, setOverlayAnimatingOut] = useState(false);
  const [checkingToken, setCheckingToken] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [showPersistentTerminator, setShowPersistentTerminator] =
    useState(false);

  const { audioRef: startupAudioRef, playSound: playStartupSound } = useSound("/sounds/startup.mp3");
  const { audioRef: terminatorAudioRef, playSound: playTerminatorSound } = useSound("/sounds/terminator.mp3");
  const [audioError, setAudioError] = useState(null);

  useEffect(() => {
    const tokenValidation = async () => {
      const storedToken = localStorage.getItem("adminToken");
      if (storedToken) {
        setToken(storedToken);
        try {
          const res = await fetch("/api/admin/files", {
            headers: { Authorization: `Bearer ${storedToken}` },
          });
          if (!res.ok) throw new Error("Invalid token");
        } catch (err) {
          console.warn("Invalid or expired token. Logging out.");
          handleLogout();
        }
      }
      setCheckingToken(false);
    };

    tokenValidation().finally(() => {
      setIsLoading(false);
    });
  }, []);

  const handleLogin = (jwtToken) => {
    setToken(jwtToken);
    localStorage.setItem("adminToken", jwtToken);
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem("adminToken");
    window.location.href = "/admin/login";
  };

  const startApplicationTransition = () => {
    setOverlayAnimatingOut(false);
    setHasUserInteracted(true);
  };

  const handleFirstInteraction = () => {
    if (!hasUserInteracted && !overlayAnimatingOut) {
      const lastTerminatorTime = localStorage.getItem("lastTerminatorTime");
      const currentTime = new Date().getTime();
      const twelveHoursInMillis = 12 * 60 * 60 * 1000;
      // Show Terminator if it hasn't been shown in the last 12 hours
      if (!lastTerminatorTime || currentTime - lastTerminatorTime > twelveHoursInMillis) {
        localStorage.setItem("lastTerminatorTime", currentTime.toString());
        playTerminatorSound();
        setShowPersistentTerminator(true);
        startApplicationTransition();
      } else {
        playStartupSound();
        startApplicationTransition();
      }
    }
  };

  return (
    <>
      <audio ref={startupAudioRef} src="/sounds/startup.mp3" preload="auto" onError={() => setAudioError("Failed to load startup sound.")} />
      <audio ref={terminatorAudioRef} src="/sounds/terminator.mp3" preload="auto" onError={() => setAudioError("Failed to load terminator sound.")} />

      {/* The old terminatorEffect JSX is removed */}

      {/* Initial overlay */}
      {!hasUserInteracted && (
        <div
          className={`fixed inset-0 from-primary to-secondary text-white flex flex-col items-center justify-center z-40
                ${
                  overlayAnimatingOut
                    ? "animate-slide-out-up"
                    : "animate-fade-in-slow"
                }`}
        >
          <div
            className={`text-center p-8 bg-background bg-opacity-90 rounded-3xl shadow-2xl backdrop-blur-lg border border-border
                  ${overlayAnimatingOut ? "" : "animate-scale-in"}`}
          >
            <h1
              className={`text-4xl sm:text-5xl md:text-6xl font-extrabold mb-8 text-center text-accent drop-shadow-md
                    ${overlayAnimatingOut ? "" : "animate-fade-in-up"}`}
            >
              Welcome to TrustQuery
            </h1>
            <p
              className={`text-lg sm:text-xl text-muted mb-8 max-w-xl mx-auto
                   ${overlayAnimatingOut ? "" : "animate-fade-in-delay"}`}
            >
              A scalable and fast search engine for administrative data
              management. Start your search now.
            </p>
            <button
              disabled={isLoading}
              onClick={handleFirstInteraction}
              className={`px-10 py-4 bg-primary hover:bg-button-hover-bg text-white text-xl font-bold rounded-full shadow-lg hover:shadow-xl transition duration-300 ease-in-out active:scale-95 transform motion-safe:hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2
                    ${overlayAnimatingOut ? "" : "animate-bounce-once"} ${
                isLoading ? " bg-gray-700 hover:bg-gray-600" : ""
              }`}
            >
              {isLoading ? (
                <FontAwesomeIcon
                  icon={faCircleNotch}
                  className="mr-3 fa-spin text-lg"
                />
              ) : (
                <FontAwesomeIcon icon={faPlay} className="mr-3 text-lg" />
              )}
              Start Application
            </button>
          </div>
        </div>
      )}

      {/* Main App */}
      {hasUserInteracted && !checkingToken && (
        <Router>
          <Header token={token} onLogout={handleLogout} />
          <main>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route
                path="/admin/login"
                element={
                  token ? (
                    <Navigate to="/admin" replace />
                  ) : (
                    <AdminLogin onLogin={handleLogin} />
                  )
                }
              />
              <Route
                path="/admin"
                element={
                  token ? (
                    <AdminDashboard  />
                  ) : (
                    <Navigate to="/admin/login" replace />
                  )
                }
              />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms-of-service" element={<TermsOfService />} />
              <Route path="/disclaimer" element={<Disclaimer />} />
            </Routes>
          </main>
          <Footer />
        </Router>
      )}

      {showPersistentTerminator && (
        <img
          src="/images/terminator.gif"
          alt="Walking Terminator"
          className="fixed bottom-0 right-0 w-[40rem] h-auto z-50 pointer-events-none animate-walk-across"
        />
      )}
      {audioError && (
        <div className="fixed top-0 left-0 w-full bg-red-600 text-white text-center py-2 z-50">
          {audioError}
        </div>
      )}
    </>
  );
}
