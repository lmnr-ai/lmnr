declare module '@novnc/novnc/lib/rfb' {
  export default class RFB {
    constructor(target: HTMLElement, url: string, options?: any);
    addEventListener(event: string, callback: Function): void;
    disconnect(): void;
  }
} 