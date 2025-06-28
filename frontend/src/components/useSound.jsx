// frontend/src/components/useSound.js
import { useRef, useCallback, useEffect } from 'react';

// Added isMuted as a parameter
export default function useSound(src, isMuted = false) { // Default to false
  const audioRef = useRef(null);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(src);
      audioRef.current.preload = "auto";
      // Volume is handled directly by the playSound function,
      // but ensure it's not muted at the Audio object level by default.
      audioRef.current.volume = 1.0;
    }
  }, [src]);

  const playSound = useCallback(() => {
    if (audioRef.current && !isMuted) { // Only play if not muted
      // Pause and reset the sound if it's already playing
      if (!audioRef.current.paused) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }

      const playPromise = audioRef.current.play();

      if (playPromise !== undefined) {
        playPromise.then(() => {
        }).catch(error => {
          console.warn(`Failed to play sound: ${src}. Autoplay prevented or other error:`, error);
        });
      }
    } else if (isMuted) {
      console.log(`Sound muted: ${src}`);
    }
  }, [src, isMuted]); // Add isMuted to dependencies

  return { audioRef, playSound };
}