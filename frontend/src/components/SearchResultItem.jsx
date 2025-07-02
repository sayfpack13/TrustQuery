import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash, faCode, faTimes } from '@fortawesome/free-solid-svg-icons';

export default function SearchResultItem({ item, style }) {
  const [showPassword, setShowPassword] = useState(false);
  const [showRawLine, setShowRawLine] = useState(false); // New state for raw_line visibility

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  // New function to toggle raw_line visibility
  const toggleRawLineVisibility = () => {
    setShowRawLine(!showRawLine);
  };

  return (
    <div
      key={item.id}
      className="bg-background p-8 rounded-xl shadow-lg border border-border hover:shadow-xl transform hover:-translate-y-1 transition duration-200 ease-in-out animate-fade-in-slide-up relative"
      style={style}
    >
      {/* Button to toggle raw_line visibility, only visible if raw_line exists */}
      {item.raw_line && (
        <button
          onClick={toggleRawLineVisibility}
          className="absolute top-4 right-4 p-2 rounded-full bg-button-bg text-white hover:bg-button-hover-bg transition duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary z-10"
          aria-label={showRawLine ? "Show parsed data" : "Show raw line"}
        >
          <FontAwesomeIcon icon={showRawLine ? faTimes : faCode} className="text-lg" />
        </button>
      )}

      {/* Conditionally render based on showRawLine state */}
      {showRawLine ? (
        <div className="flex flex-col h-full justify-between">
          <div>
            <div className="text-sm font-semibold text-muted uppercase mb-2">Raw Line</div>
            <pre className="text-sm font-mono text-text bg-neutral-900 p-4 rounded-lg overflow-x-auto whitespace-pre-wrap break-words">
              {item.raw_line}
            </pre>
          </div>
          <p className="text-xs text-muted mt-4">
            This is the raw, unparsed line from the collected data.
          </p>
        </div>
      ) : (
        <>
          {/* Show source index if available and from multi-index search */}
          {item.sourceIndex && (
            <>
              <div className="text-sm font-semibold text-muted uppercase mb-2">Source Index</div>
              <div className="text-sm bg-neutral-700 text-white px-2 py-1 rounded mb-4 inline-block">
                {item.sourceIndex}
              </div>
            </>
          )}
          
          <div className="text-sm font-semibold text-muted uppercase mb-2">URL</div>
          <div className="font-mono text-xl text-primary hover:text-accent break-words mb-4">
            {item.url}
          </div>

          <div className="text-sm font-semibold text-muted uppercase mb-2">Username</div>
          <div className="text-lg mb-4 font-semibold text-text">{item.username}</div>

          <div className="text-sm font-semibold text-muted uppercase mb-2">Password</div>
          <div className="relative">
            <div className="text-lg text-danger font-bold pr-10 break-words">
              {showPassword ? item.password : '********'}
            </div>
            <button
              type="button"
              onClick={togglePasswordVisibility}
              className="absolute inset-y-0 right-0 pr-2 flex items-center text-gray-500 hover:text-text focus:outline-none"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="text-lg" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}