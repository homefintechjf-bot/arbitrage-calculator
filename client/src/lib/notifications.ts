// Notification and alert system for arbitrage opportunities

// Request notification permission
export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) {
    console.log("This browser does not support notifications");
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }

  return false;
}

// Check if notifications are enabled
export function isNotificationEnabled(): boolean {
  return "Notification" in window && Notification.permission === "granted";
}

// Send urgent push notification
export function sendUrgentNotification(title: string, body: string, data?: any): void {
  if (!isNotificationEnabled()) return;

  const notificationOptions: NotificationOptions & { vibrate?: number[] } = {
    body,
    icon: "/icon-192.svg",
    badge: "/icon-192.svg",
    tag: "arbitrage-alert",
    requireInteraction: true, // Keep notification visible until user interacts
    silent: false,
    data,
  };

  // Vibration is supported in some browsers
  if ("vibrate" in navigator) {
    (notificationOptions as any).vibrate = [500, 200, 500, 200, 500];
  }

  const notification = new Notification(title, notificationOptions);

  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}

// Audio alert system
let audioContext: AudioContext | null = null;
let globalVolume: number = 0.8;

export function setGlobalVolume(volume: number): void {
  globalVolume = Math.max(0, Math.min(1, volume));
}

export function getGlobalVolume(): number {
  return globalVolume;
}

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
}

// Play alert sound with ROI-based intensity
export function playAlertSound(roi: number = 0): void {
  try {
    const ctx = getAudioContext();
    const volume = globalVolume;
    
    // Resume context if suspended (required for autoplay policies)
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    // Create oscillator for alert beep sequence
    const playBeep = (startTime: number, frequency: number, duration: number, beepVolume: number = volume) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = "square";
      
      gainNode.gain.setValueAtTime(beepVolume, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    
    if (roi >= 5) {
      // Urgent alert (>=5%): Urgent, high-intensity pattern
      playBeep(now, 880, 0.1);
      playBeep(now + 0.15, 880, 0.1);
      playBeep(now + 0.3, 880, 0.1);
      playBeep(now + 0.45, 1100, 0.3);
    } else if (roi >= 3) {
      // Normal alert (3-5%): Distinct alert
      playBeep(now, 660, 0.15);
      playBeep(now + 0.2, 880, 0.15);
      playBeep(now + 0.4, 660, 0.15);
    } else {
      // Gentle alert (1-3%): Soft notification
      playBeep(now, 440, 0.2, volume * 0.5);
      playBeep(now + 0.3, 554.37, 0.2, volume * 0.5);
    }
    
  } catch (err) {
    console.error("Failed to play alert sound:", err);
  }
}

// Vibrate device (mobile)
export function vibrateDevice(): void {
  if ("vibrate" in navigator) {
    // Strong vibration pattern: long-short-long-short-long
    navigator.vibrate([500, 200, 500, 200, 800]);
  }
}

// Flash screen for visual alert
export function flashScreen(flashCount: number = 3): void {
  const overlay = document.createElement("div");
  overlay.id = "alert-flash-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 165, 0, 0.4);
    z-index: 99999;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.1s ease;
  `;
  document.body.appendChild(overlay);

  let count = 0;
  const flash = () => {
    if (count >= flashCount * 2) {
      overlay.remove();
      return;
    }
    overlay.style.opacity = count % 2 === 0 ? "1" : "0";
    count++;
    setTimeout(flash, 150);
  };
  flash();
}

// Combined urgent alert - fires all notification methods
export function triggerUrgentAlert(
  title: string, 
  message: string,
  options?: {
    playSound?: boolean;
    vibrate?: boolean;
    flash?: boolean;
    notification?: boolean;
  }
): void {
  const opts = {
    playSound: true,
    vibrate: true,
    flash: true,
    notification: true,
    ...options
  };

  // Play sound
  if (opts.playSound) {
    playAlertSound();
  }

  // Vibrate
  if (opts.vibrate) {
    vibrateDevice();
  }

  // Flash screen
  if (opts.flash) {
    flashScreen();
  }

  // Send push notification
  if (opts.notification) {
    sendUrgentNotification(title, message);
  }
}
