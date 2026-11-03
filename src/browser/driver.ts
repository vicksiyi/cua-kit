import type { CDPSession, Keyboard } from 'playwright';
export interface CdpChannel { send: CDPSession['send']; detach(): Promise<void> }
export interface BrowserFrame { url(): string }
/** Minimal browser-driver contract used by the AX/input core. */
export interface BrowserDriver extends BrowserFrame {
  isClosed(): boolean;
  on(event: 'framenavigated' | 'close', listener: () => void): unknown;
  context(): { newCDPSession(target: BrowserDriver | BrowserFrame): Promise<CdpChannel> };
  mainFrame(): BrowserFrame;
  frames(): BrowserFrame[];
  prepareFrames?(): Promise<void>;
  keyboard: Pick<Keyboard, 'down' | 'up'>;
  waitForLoadState(state: 'domcontentloaded', options: { timeout: number }): Promise<void>;
  goto(url: string, options: { waitUntil: 'domcontentloaded'; timeout: number }): Promise<unknown>;
  close(): Promise<void>;
}
