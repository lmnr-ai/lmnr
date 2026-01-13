declare module "@novnc/novnc/lib/rfb" {
  export default class RFB {
    constructor(target: HTMLElement, url: string, options?: unknown);
    addEventListener(event: string, callback: (...args: unknown[]) => void): void;
    disconnect(): void;
  }
}
