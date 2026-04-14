import { useCallback } from "react";

type FeedbackType = "success" | "error" | "click" | "heavy" | "notification";

export const useFeedback = () => {
  const playSound = useCallback((type: FeedbackType = "click") => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      const now = audioCtx.currentTime;

      switch (type) {
        case "success":
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(440, now);
          oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.1);
          gainNode.gain.setValueAtTime(0.1, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
          oscillator.start(now);
          oscillator.stop(now + 0.2);
          break;
        case "error":
          oscillator.type = "sawtooth";
          oscillator.frequency.setValueAtTime(220, now);
          oscillator.frequency.exponentialRampToValueAtTime(110, now + 0.2);
          gainNode.gain.setValueAtTime(0.1, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
          oscillator.start(now);
          oscillator.stop(now + 0.3);
          break;
        case "notification":
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(880, now);
          oscillator.frequency.exponentialRampToValueAtTime(440, now + 0.1);
          oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.2);
          gainNode.gain.setValueAtTime(0.1, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
          oscillator.start(now);
          oscillator.stop(now + 0.3);
          break;
        case "heavy":
          oscillator.type = "square";
          oscillator.frequency.setValueAtTime(150, now);
          gainNode.gain.setValueAtTime(0.05, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
          oscillator.start(now);
          oscillator.stop(now + 0.1);
          break;
        case "click":
        default:
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(600, now);
          gainNode.gain.setValueAtTime(0.05, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
          oscillator.start(now);
          oscillator.stop(now + 0.05);
          break;
      }
    } catch (e) {
      console.warn("Audio feedback not supported or blocked", e);
    }
  }, []);

  const vibrate = useCallback((type: FeedbackType = "click") => {
    if (!navigator.vibrate) return;

    switch (type) {
      case "success":
        navigator.vibrate([20, 30, 20]);
        break;
      case "error":
        navigator.vibrate([100, 50, 100]);
        break;
      case "notification":
        navigator.vibrate(100);
        break;
      case "heavy":
        navigator.vibrate(50);
        break;
      case "click":
      default:
        navigator.vibrate(20);
        break;
    }
  }, []);

  const playFeedback = useCallback((type: FeedbackType = "click") => {
    playSound(type);
    vibrate(type);
  }, [playSound, vibrate]);

  return { playFeedback, playSound, vibrate };
};
