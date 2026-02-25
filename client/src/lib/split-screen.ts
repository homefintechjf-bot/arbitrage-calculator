import { Capacitor, registerPlugin } from '@capacitor/core';

interface SplitScreenPlugin {
  openSplitScreen(options: { url1: string; url2: string }): Promise<{ success: boolean }>;
  isSupported(): Promise<{ supported: boolean }>;
}

const SplitScreen = registerPlugin<SplitScreenPlugin>('SplitScreen');

export interface SplitScreenResult {
  success: boolean;
  method: 'split' | 'sequential' | 'clipboard';
  message?: string;
}

// Synchronous version for web - MUST be called directly from click handler
export function openMarketsInSplitScreen(url1: string, url2: string): SplitScreenResult {
  const isNative = Capacitor.isNativePlatform();
  
  // On native platform, try native split screen asynchronously
  if (isNative) {
    // Fire-and-forget: attempt native split screen in background
    // If it succeeds, great. If not, user already has web fallback.
    SplitScreen.isSupported().then(({ supported }) => {
      if (supported) {
        SplitScreen.openSplitScreen({ url1, url2 }).catch(() => {
          console.log('Native split screen failed, web fallback already opened');
        });
      }
    }).catch(() => {
      console.log('Native split screen check failed');
    });
  }
  
  // Always use synchronous web approach to avoid popup blocking
  // On native, this runs in parallel with the native attempt
  return openMarketsWeb(url1, url2);
}

// Async version for native platforms only
export async function openMarketsNative(url1: string, url2: string): Promise<SplitScreenResult> {
  try {
    const { supported } = await SplitScreen.isSupported();
    
    if (supported) {
      const result = await SplitScreen.openSplitScreen({ url1, url2 });
      return {
        success: result.success,
        method: 'split',
      };
    }
  } catch (e) {
    console.log('Native split screen not available');
  }
  
  // Fallback to web
  return openMarketsWeb(url1, url2);
}

function openMarketsWeb(url1: string, url2: string): SplitScreenResult {
  const screenWidth = typeof window !== 'undefined' ? window.screen.availWidth : 800;
  const screenHeight = typeof window !== 'undefined' ? window.screen.availHeight : 600;
  
  const isLargeScreen = screenWidth >= 1200;
  
  // Open both windows synchronously in the same event loop tick
  // This is critical - browsers block window.open if not in direct user gesture
  let win1: Window | null = null;
  let win2: Window | null = null;
  
  if (isLargeScreen) {
    const halfWidth = Math.floor(screenWidth / 2);
    
    // Open both immediately - no async, no timeout
    win1 = window.open(
      url1,
      'market1',
      `width=${halfWidth},height=${screenHeight},left=0,top=0,toolbar=yes,location=yes,menubar=yes`
    );
    
    win2 = window.open(
      url2,
      'market2',
      `width=${halfWidth},height=${screenHeight},left=${halfWidth},top=0,toolbar=yes,location=yes,menubar=yes`
    );
  } else {
    // Mobile/smaller screens - open as regular tabs synchronously
    win1 = window.open(url1, '_blank');
    win2 = window.open(url2, '_blank');
  }
  
  // Check results
  const opened1 = win1 !== null;
  const opened2 = win2 !== null;
  
  if (opened1 && opened2) {
    // Try to focus both (some browsers allow this)
    try {
      win1?.focus();
      win2?.focus();
    } catch (e) {
      // Focus may fail on some browsers, that's okay
    }
    return { success: true, method: isLargeScreen ? 'split' : 'sequential' };
  }
  
  if (!opened1 && !opened2) {
    // Both blocked - copy URLs to clipboard
    copyToClipboard(`${url1}\n${url2}`);
    return {
      success: false,
      method: 'clipboard',
      message: 'Popups blocked. URLs copied to clipboard - paste in browser to open.',
    };
  }
  
  // One opened, one blocked - copy the blocked one
  const blockedUrl = opened1 ? url2 : url1;
  copyToClipboard(blockedUrl);
  return {
    success: false,
    method: 'clipboard',
    message: `One market opened. The other URL was copied to clipboard: ${blockedUrl.substring(0, 50)}...`,
  };
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

export { SplitScreen };
