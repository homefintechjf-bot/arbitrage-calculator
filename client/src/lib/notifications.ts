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

export function isNotificationEnabled(): boolean {
  return "Notification" in window && Notification.permission === "granted";
}

export function sendUrgentNotification(title: string, body: string, data?: any): void {
  if (!isNotificationEnabled()) return;

  const notificationOptions: NotificationOptions & { vibrate?: number[] } = {
    body,
    icon: "/icon-192.svg",
    badge: "/icon-192.svg",
    tag: "arbitrage-alert",
    requireInteraction: true,
    silent: false,
    data,
  };

  if ("vibrate" in navigator) {
    (notificationOptions as any).vibrate = [500, 200, 500, 200, 500];
  }

  const notification = new Notification(title, notificationOptions);

  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}

let audioContext: AudioContext | null = null;
let globalVolume: number = 0.8;
let customSoundUrl: string | null = null;
let customSoundBuffer: AudioBuffer | null = null;

const CUSTOM_SOUND_KEY = "arb-finder-custom-sound";
const CUSTOM_SOUND_NAME_KEY = "arb-finder-custom-sound-name";

export function setGlobalVolume(volume: number): void {
  globalVolume = Math.max(0, Math.min(1, volume));
}

export function getGlobalVolume(): number {
  return globalVolume;
}

function getAudioContext(): AudioContext {
  if (!audioContext || audioContext.state === "closed") {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
}

export async function setCustomSound(file: File): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") await ctx.resume();

  const arrayBuffer = await file.arrayBuffer();
  customSoundBuffer = await ctx.decodeAudioData(arrayBuffer);

  const reader = new FileReader();
  reader.onload = () => {
    customSoundUrl = reader.result as string;
    try {
      localStorage.setItem(CUSTOM_SOUND_KEY, customSoundUrl);
      localStorage.setItem(CUSTOM_SOUND_NAME_KEY, file.name);
    } catch (e) {
      // localStorage might be full for large files
    }
  };
  reader.readAsDataURL(file);
}

export function clearCustomSound(): void {
  customSoundUrl = null;
  customSoundBuffer = null;
  localStorage.removeItem(CUSTOM_SOUND_KEY);
  localStorage.removeItem(CUSTOM_SOUND_NAME_KEY);
}

export function hasCustomSound(): boolean {
  return customSoundBuffer !== null || localStorage.getItem(CUSTOM_SOUND_KEY) !== null;
}

export function getCustomSoundName(): string | null {
  return localStorage.getItem(CUSTOM_SOUND_NAME_KEY);
}

async function loadSavedCustomSound(): Promise<void> {
  if (customSoundBuffer) return;
  const saved = localStorage.getItem(CUSTOM_SOUND_KEY);
  if (!saved) return;

  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    const response = await fetch(saved);
    const arrayBuffer = await response.arrayBuffer();
    customSoundBuffer = await ctx.decodeAudioData(arrayBuffer);
    customSoundUrl = saved;
  } catch (e) {
    localStorage.removeItem(CUSTOM_SOUND_KEY);
  }
}

async function playCustomSoundBuffer(): Promise<boolean> {
  await loadSavedCustomSound();
  if (!customSoundBuffer) return false;

  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    const source = ctx.createBufferSource();
    const gainNode = ctx.createGain();
    source.buffer = customSoundBuffer;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    gainNode.gain.value = globalVolume;
    source.start(0);
    return true;
  } catch (e) {
    console.error("Failed to play custom sound:", e);
    return false;
  }
}

export async function playAlertSound(roi: number = 0): Promise<void> {
  try {
    const played = await playCustomSoundBuffer();
    if (played) return;

    const ctx = getAudioContext();
    const volume = globalVolume;

    if (ctx.state === "suspended") {
      await ctx.resume();
    }

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
      playBeep(now, 880, 0.1);
      playBeep(now + 0.15, 880, 0.1);
      playBeep(now + 0.3, 880, 0.1);
      playBeep(now + 0.45, 1100, 0.3);
    } else if (roi >= 3) {
      playBeep(now, 660, 0.15);
      playBeep(now + 0.2, 880, 0.15);
      playBeep(now + 0.4, 660, 0.15);
    } else {
      playBeep(now, 440, 0.2, volume * 0.5);
      playBeep(now + 0.3, 554.37, 0.2, volume * 0.5);
    }

  } catch (err) {
    console.error("Failed to play alert sound:", err);
  }
}

export function vibrateDevice(): void {
  if ("vibrate" in navigator) {
    navigator.vibrate([500, 200, 500, 200, 800]);
  }
}

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

export async function triggerUrgentAlert(
  title: string,
  message: string,
  options?: {
    playSound?: boolean;
    vibrate?: boolean;
    flash?: boolean;
    notification?: boolean;
    roi?: number;
  }
): Promise<void> {
  const opts = {
    playSound: true,
    vibrate: true,
    flash: true,
    notification: true,
    roi: 0,
    ...options
  };

  if (opts.playSound) {
    await playAlertSound(opts.roi);
  }

  if (opts.vibrate) {
    vibrateDevice();
  }

  if (opts.flash) {
    flashScreen();
  }

  if (opts.notification) {
    sendUrgentNotification(title, message);
  }
}
