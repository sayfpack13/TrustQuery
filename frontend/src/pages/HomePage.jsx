import React, { useState, useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleNotch,
  faChevronDown,
  faChevronUp,
} from "@fortawesome/free-solid-svg-icons";
import SearchResultItem from "../components/SearchResultItem";
import useSound from "../components/useSound";
import Globe from "react-globe.gl";
import buttonStyles from "../components/ButtonStyles";

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("");
  const [searchBarLoaded, setSearchBarLoaded] = useState(false);
  const [hasSearchedAndFound, setHasSearchedAndFound] = useState(false);
  const [showAlertAnimation, setShowAlertAnimation] = useState(false);
  const [hasAlertPlayedForCurrentSearch, setHasAlertPlayedForCurrentSearch] =
    useState(false);
  const [loading, setLoading] = useState(false); // Pagination states
  const [searchWarning, setSearchWarning] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalResults, setTotalResults] = useState(0); // State for total collected data
  const [totalCollectedData, setTotalCollectedData] = useState(0);
  const [searchedIndicesForTotal, setSearchedIndicesForTotal] = useState([]);
  const [searchMessage, setSearchMessage] = useState("");

  // Sound hooks

  const { audioRef: errorAudioRef, playSound: playErrorSound } =
    useSound("/sounds/error.mp3");
  const { audioRef: successAudioRef, playSound: playSuccessSound } = useSound(
    "/sounds/success.mp3"
  );
  const { audioRef: alertAudioRef, playSound: playAlertSound } =
    useSound("/sounds/alert.mp3"); // Ref for the react-globe.gl instance

  const globeEl = useRef(); // State for arcs data (for animated paths/attacks)

  const [arcsData, setArcsData] = useState([]); // Ref to keep track of arc IDs for unique keys and lifecycle management

  const arcIdCounter = useRef(0); // Effect for globe auto-rotation, and dynamic arc generation/lifecycle

  useEffect(() => {
    const globe = globeEl.current;
    if (globe) {
      globe.controls().autoRotate = true;
      globe.controls().autoRotateSpeed = 0.5;
      globe.controls().enableZoom = false;
      globe.controls().enableRotate = false;
      globe.controls().enablePan = false;
    } // Interval to add new arcs incrementally

    const addArcInterval = setInterval(() => {
      const NUM_NEW_ARCS_PER_BATCH = 3; // Add a few new arcs at a time
      const newArcsBatch = [];
      for (let i = 0; i < NUM_NEW_ARCS_PER_BATCH; i++) {
        const startLat = (Math.random() - 0.5) * 180;
        const startLng = (Math.random() - 0.5) * 360;
        const endLat = (Math.random() - 0.5) * 180;
        const endLng = (Math.random() - 0.5) * 360; // Generate a random bright color for the arc's base

        const r = Math.floor(Math.random() * 255);
        const g = Math.floor(Math.random() * 255);
        const b = Math.floor(Math.random() * 255);

        arcIdCounter.current += 1; // Increment ID for unique key

        newArcsBatch.push({
          id: arcIdCounter.current, // Unique ID for React keys and tracking
          startLat,
          startLng,
          endLat,
          endLng,
          baseR: r, // Store base RGB components
          baseG: g,
          baseB: b,
          birthTime: Date.now(), // Timestamp when this arc was created
          lifetime: 3000 + Math.random() * 2000, // Arc lives for 3 to 5 seconds
        });
      }
      setArcsData((prevArcs) => [...prevArcs, ...newArcsBatch]);
    }, 2000); // Interval to update and clean up arcs (for fade out effect and removal)

    const updateArcsInterval = setInterval(() => {
      setArcsData((prevArcs) => {
        const currentTime = Date.now();
        return prevArcs.filter((arc) => {
          const timeElapsed = currentTime - arc.birthTime; // Keep arcs that are still within their lifetime
          return timeElapsed < arc.lifetime;
        });
      });
    }, 300); // Check and filter arcs frequently (e.g., every 100ms) // Cleanup function: clear intervals and stop auto-rotate on component unmount

    return () => {
      clearInterval(addArcInterval);
      clearInterval(updateArcsInterval);
      if (globe) {
        globe.controls().autoRotate = false;
      }
    };
  }, []); // Empty dependency array ensures this runs once on mount and cleans up on unmount

  useEffect(() => {
    setSearchBarLoaded(true);
  }, []);

  useEffect(() => {
    const fetchTotalCollectedData = async () => {
      try {
        const response = await fetch("/api/total-accounts");
        if (!response.ok) {
          throw new Error("Failed to fetch total collected data.");
        }
        const data = await response.json();
        setTotalCollectedData(data.totalAccounts);
        setSearchedIndicesForTotal(data.searchIndices || []);
      } catch (error) {
        console.error("Error fetching total collected data:", error);
        setTotalCollectedData(0);
        setSearchedIndicesForTotal([]);
      }
    };

    fetchTotalCollectedData();
  }, []);

  const fetchResults = async (queryToFetch, pageToFetch) => {
    setStatus("Searching...");
    setHasSearchedAndFound(false);
    setShowAlertAnimation(false);
    setLoading(true);
    setSearchMessage("");
    setSearchWarning("");
    try {
      const token = localStorage.getItem("adminToken");
      const headers = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      // Build the search URL
      let searchUrl = `/api/search?q=${encodeURIComponent(
        queryToFetch
      )}&page=${pageToFetch}&size=${itemsPerPage}`;

      const res = await fetch(searchUrl, {
        headers: headers,
      });
      const data = await res.json();

      setResults(data.results || []);
      setTotalResults(data.total || 0);
      setSearchWarning(data.warning || "");

      // Set search message based on results
      if (data.searchedIndices && data.searchedIndices.length > 0) {
        const searchedCount = data.searchedIndices.length;
        if (searchedCount === 1) {
          setSearchMessage(`Searched in index: ${data.searchedIndices[0]}`);
        } else {
          setSearchMessage(`Searched across ${searchedCount} indices`);
        }
      }

      if (data.results?.length === 0 && data.total === 0) {
        setStatus("No results found.");
        playErrorSound();
      } else if (data.results?.length > 0) {
        setStatus("");
        if (!hasAlertPlayedForCurrentSearch) {
          playAlertSound();
          playSuccessSound();
          setShowAlertAnimation(true);
          setHasSearchedAndFound(true);
          setHasAlertPlayedForCurrentSearch(true);

          setTimeout(() => {
            setShowAlertAnimation(false);
          }, 9600);
        }
      } else {
        setStatus("");
      }
    } catch (err) {
      console.error("Search failed:", err);
      setStatus("Search failed. Please try again later.");
      setResults([]);
      setTotalResults(0);
      setSearchMessage("");
      setSearchWarning("");
    } finally {
      setLoading(false);
    }
  }; // FIX: New useEffect to trigger search when searchTerm or currentPage changes
  useEffect(() => {
    if (searchTerm) {
      fetchResults(searchTerm, currentPage);
    }
  }, [searchTerm, currentPage]);

  const handleSearchButtonClick = () => {
    const trimmedQuery = query.trim();
    if (trimmedQuery) {
      // If the query is the same and we are on the first page, we need to force a re-fetch.
      // The `useEffect` won't trigger if both searchTerm and currentPage don't change.
      if (trimmedQuery === searchTerm && currentPage === 1) {
        fetchResults(trimmedQuery, 1);
        setHasAlertPlayedForCurrentSearch(false);
      } else {
        setHasAlertPlayedForCurrentSearch(false);
        // Reset the page to 1 when a new search is initiated
        setCurrentPage(1);
        setSearchTerm(trimmedQuery);
      }
    }
  };

  const totalPages = Math.min(Math.ceil(totalResults / itemsPerPage), Math.ceil(10000 / itemsPerPage));

  const goToPage = (pageNumber) => {
    if (
      pageNumber >= 1 &&
      pageNumber <= totalPages &&
      pageNumber !== currentPage
    ) {
      // Just update the page number; the useEffect will handle the fetch
      setCurrentPage(pageNumber);
    }
  };

  const renderPaginationButtons = () => {
    const pages = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    if (startPage > 1) {
      pages.push(
        <button
          key="first"
          onClick={() => goToPage(1)}
          disabled={loading}
          className="px-3 py-1 border rounded-md text-muted bg-background hover:bg-button-hover-bg mx-1 transition duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
        >
          1
        </button>
      );
      if (startPage > 2) {
        pages.push(
          <span key="dots-start" className="px-3 py-1 mx-1 text-muted">
            ...
          </span>
        );
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <button
          key={i}
          onClick={() => goToPage(i)}
          disabled={loading}
          className={`px-3 py-1 border rounded-md mx-1 transition duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed ${
            currentPage === i
              ? "bg-primary text-white"
              : "text-muted bg-background hover:bg-button-hover-bg"
          }`}
        >
          {i}
        </button>
      );
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        pages.push(
          <span key="dots-end" className="px-3 py-1 mx-1 text-muted">
            ...
          </span>
        );
      }
      pages.push(
        <button
          key="last"
          onClick={() => goToPage(totalPages)}
          disabled={loading}
          className="px-3 py-1 border rounded-md text-muted bg-background hover:bg-button-hover-bg mx-1 transition duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {totalPages}
        </button>
      );
    }

    return pages;
  };

  // Add max results selection
  const maxResultsOptions = [20, 50, 100, 500, 1000];

  // Add handler for max results change
  const handleMaxResultsChange = (e) => {
    setItemsPerPage(Number(e.target.value));
    setCurrentPage(1); // Reset to first page on change
  };

  return (
    <div
      className={`min-h-screen bg-background px-4 sm:px-6 lg:px-8 font-sans transition-all duration-700 ease-in-out relative overflow-hidden
   ${
     hasSearchedAndFound
       ? "pt-8"
       : "flex flex-col justify-center items-center py-16"
   }
   `}
      style={{
        zIndex: 1,
      }}
    >
      {/* Max results selection */}
      <div className="flex justify-center items-center mb-4">
        <label htmlFor="max-results-select" className="mr-2 font-medium text-text">Max results per page:</label>
        <select
          id="max-results-select"
          value={itemsPerPage}
          onChange={handleMaxResultsChange}
          className="border border-border rounded px-2 py-1 bg-background text-text focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {maxResultsOptions.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
      {/* Animated Earth Globe with controlled Z-index and opacity */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 0,
          opacity: 1.0,
        }}
      >
        <Globe
          ref={globeEl}
          width={window.innerWidth}
          height={window.innerHeight}
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
          backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
          arcsData={arcsData}
          arcColor={(d) => {
            const currentTime = Date.now();
            const timeElapsed = currentTime - d.birthTime;
            const lifeProgress = timeElapsed / d.lifetime; // Progress from 0 to 1
            const opacity = Math.max(0, 1 - lifeProgress); // Fades from 1 to 0

            return [
              `rgba(${d.baseR},${d.baseG},${d.baseB},${opacity})`,
              `rgba(${d.baseR},${d.baseG},${d.baseB},${Math.max(
                0,
                opacity - 0.8
              )})`,
            ];
          }}
          arcLabel={() => ""}
          arcDashLength={0.3}
          arcDashGap={0.3}
          arcDashAnimateTime={1000}
          arcStroke={3.0}
        />
      </div>
      {showAlertAnimation && (
        <div
          className="absolute inset-0 animate-alert-background alert-pulse pointer-events-none"
          style={{ zIndex: 0 }} // Placed above the globe (z-index: -1)
        ></div>
      )}
      <audio ref={errorAudioRef} src="/sounds/error.mp3" preload="auto" />
      <audio ref={successAudioRef} src="/sounds/success.mp3" preload="auto" />
      <audio ref={alertAudioRef} src="/sounds/alert.mp3" preload="auto" />
      {/* Main content, with highest z-index to ensure it's on top */}
      <div className="max-w-6xl mx-auto w-full relative z-10">
        <h1
          className={`text-5xl md:text-6xl font-extrabold text-center mb-16 text-text leading-tight
      ${hasSearchedAndFound ? "mb-8" : "mb-16"}`}
        >
          TrustQuery
        </h1>
        <p className="text-center text-lg font-semibold text-primary mb-4 animate-fade-in-down">
          By Sayf
        </p>
        {totalCollectedData > 0 && (
          <div className="text-center text-info text-md mb-4 animate-pulse">
            <p>Total records: {totalCollectedData.toLocaleString()}</p>
          </div>
        )}

        <div
          className={`flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4 max-w-2xl mx-auto bg-background p-4 rounded-full shadow-xl border border-border focus-within:ring-2 focus-within:ring-primary focus-within:ring-opacity-75 transition-all duration-300 ease-in-out ${
            searchBarLoaded ? "animate-pop-in" : "opacity-0"
          }`}
        >
          <input
            type="text"
            placeholder="Type to search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearchButtonClick();
              }
            }}
            className="flex-grow outline-none focus:outline-none text-lg sm:text-xl placeholder-muted py-1.5 px-3 bg-transparent border-none"
            aria-label="Search query"
          />
          <button
            onClick={handleSearchButtonClick}
            className="bg-button-bg hover:bg-button-hover-bg text-white px-8 py-3 rounded-full font-bold shadow-md hover:shadow-lg transition duration-200 ease-in-out active:scale-95 focus:outline-none focus:ring-3 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
            disabled={!query.trim() || status === "Searching..."}
          >
            Search
          </button>
        </div>
        {status && (
          <p
            className={`text-center mt-8 text-lg text-gray-600 font-medium ${
              status === "Searching..." ? "animate-fade-in" : "animate-shake"
            }`}
          >
            {status === "Searching..." ? (
              <span className="inline-flex items-center space-x-2">
                <FontAwesomeIcon
                  icon={faCircleNotch}
                  className="text-primary fa-spin text-xl"
                />
                <span>Searching...</span>
              </span>
            ) : (
              <span>{status}</span>
            )}
          </p>
        )}
        {searchWarning && (
          <div className="text-yellow-600 text-sm text-center mt-2">{searchWarning}</div>
        )}
        {totalResults > 0 && searchTerm.trim() && (
          <div className="text-center mt-12 mb-4 animate-fade-in-up">
            <p className="text-3xl font-extrabold text-accent">
              Found <span className="text-4xl font-black">{totalResults}</span>{" "}
              results
            </p>
            {searchMessage && (
              <p className="text-sm text-neutral-400 mt-2">{searchMessage}</p>
            )}
          </div>
        )}
        {!loading && results.length > 0 && (
          <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {results.map((item, i) => (
              <SearchResultItem key={item.id || i} item={item} />
            ))}
          </div>
        )}
        {totalResults > 0 && (
          <div className="flex justify-center items-center mt-8 mb-16 space-x-2">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1 || loading}
              className={buttonStyles.neutral}
            >
              Previous
            </button>
            {renderPaginationButtons()}
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages || loading}
              className={buttonStyles.neutral}
            >
              Next
            </button>
          </div>
        )}
        {!status &&
          searchTerm.trim() &&
          results.length === 0 &&
          totalResults === 0 && (
            <div className="flex flex-col items-center justify-center mt-20 text-gray-500 animate-fade-in">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-24 w-24 text-muted mb-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 10l-2 2m0 0l2 2m-2-2l-2-2m2 2l2-2"
                />
              </svg>
              <p className="text-2xl font-semibold mb-2">
                No records found for "{searchTerm}".
              </p>
              <p className="text-lg text-muted">
                Please try a different search query.
              </p>
            </div>
          )}
      </div>
    </div>
  );
}
