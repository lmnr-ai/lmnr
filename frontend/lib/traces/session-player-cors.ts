interface CorsPluginCleanup {
  observer: MutationObserver;
  resizeObserver: ResizeObserver;
  iframeObservers: Set<MutationObserver>;
  playerEventCleanup: (() => void) | null;
}

export interface SessionPlayerCorsPlugin {
  onBuild: (node: any, context: any) => void;
  cleanup: () => void;
}

const MONITORING_SETUP_DELAY_MS = 1000;
const MONITORING_RETRY_DELAY_MS = 500;
const PROCESSING_INTERVAL_SECONDS = 1;

const isStylesheet = (element: Element): boolean =>
  element.tagName === 'STYLE' || element.tagName === 'LINK';

const isExternalUrl = (url: string): boolean =>
  url.startsWith('http') || url.startsWith('//');

const isStylesheetLink = (element: Element): element is HTMLLinkElement =>
  element.tagName === 'LINK' && (element as HTMLLinkElement).rel === 'stylesheet';

const isProcessed = (element: Element): boolean =>
  !!(element as any)._lmnrCorsProcessed;

const markAsProcessed = (element: Element): void => {
  (element as any)._lmnrCorsProcessed = true;
};

const hasAssetContent = (element: Element): boolean =>
  isStylesheet(element) ||
  element.tagName === 'IFRAME' ||
  !!element.querySelector('style, link[rel="stylesheet"], iframe');

export const createSessionPlayerCorsPlugin = (
  playerRef: React.RefObject<any>,
  playerContainerRef: React.RefObject<HTMLDivElement | null>
): SessionPlayerCorsPlugin => {
  const assetCache = new Map<string, string>();
  let cleanupRefs: CorsPluginCleanup | null = null;

  const proxyAsset = async (originalUrl: string): Promise<string> => {
    const cached = assetCache.get(originalUrl);
    if (cached) return cached;

    const tryDirectFetch = async (): Promise<string | null> => {
      try {
        const response = await fetch(originalUrl, { mode: 'cors' });
        if (response.ok) {
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          assetCache.set(originalUrl, objectUrl);
          return objectUrl;
        }
      } catch (error) {
        console.log('Could not directly fetch session player asset:', error);
      }
      return null;
    };

    const tryProxyFetch = async (): Promise<string | null> => {
      try {
        const proxyUrl = `/api/proxy-asset?url=${encodeURIComponent(originalUrl)}`;
        const response = await fetch(proxyUrl);
        if (response.ok) {
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          assetCache.set(originalUrl, objectUrl);
          return objectUrl;
        }
      } catch (error) {
        console.error('Error proxying asset:', error);
      }
      return null;
    };

    return (await tryDirectFetch()) || (await tryProxyFetch()) || originalUrl;
  };

  const getAllStylesheets = (node: Element): Element[] => {
    const nodeStylesheets = Array.from(node.querySelectorAll('style, link[rel="stylesheet"]'));

    const iframeStylesheets = Array.from(node.querySelectorAll('iframe'))
      .flatMap(iframe => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          return iframeDoc ? Array.from(iframeDoc.querySelectorAll('style, link[rel="stylesheet"]')) : [];
        } catch (error) {
          return [];
        }
      });

    const ownerDoc = node.ownerDocument;
    const ownerDocStylesheets = ownerDoc && ownerDoc !== document
      ? Array.from(ownerDoc.querySelectorAll('style, link[rel="stylesheet"]'))
      : [];

    return [...nodeStylesheets, ...iframeStylesheets, ...ownerDocStylesheets];
  };

  const processFontUrls = async (cssText: string): Promise<string> => {
    const fontUrlRegex = /url\(['"]?([^'")\s]+\.(woff2?|ttf|otf|eot))['"]?\)/gi;
    const matches = [...cssText.matchAll(fontUrlRegex)];

    let result = cssText;
    for (const match of matches) {
      const originalUrl = match[1];

      if (!isExternalUrl(originalUrl)) continue;

      try {
        const fullUrl = originalUrl.startsWith('//') ? `https:${originalUrl}` : originalUrl;
        const proxiedUrl = await proxyAsset(fullUrl);
        result = result.replace(match[0], `url('${proxiedUrl}')`);
      } catch (error) {
        // Continue with original URL
      }
    }

    return result;
  };

  const addFontDisplaySwap = (cssText: string): string =>
    cssText.includes('@font-face')
      ? cssText.replace(/@font-face\s*{([^}]*)}/gi, (match, content) =>
        content.includes('font-display') ? match : match.replace('}', 'font-display: swap; }')
      )
      : cssText;

  const processStyleElement = async (styleElement: HTMLStyleElement): Promise<void> => {
    const originalCss = styleElement.textContent || '';
    const processedFonts = await processFontUrls(originalCss);
    const finalCss = addFontDisplaySwap(processedFonts);

    if (finalCss !== originalCss) {
      styleElement.textContent = finalCss;
    }
    markAsProcessed(styleElement);
  };

  const resolveUrl = (url: string, baseUrl: string): string => {
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return `${new URL(baseUrl).origin}${url}`;
    if (!url.startsWith('http')) return `${baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1)}${url}`;
    return url;
  };

  const processLinkElement = async (linkElement: HTMLLinkElement): Promise<void> => {
    if (!linkElement.href || !isExternalUrl(linkElement.href)) {
      markAsProcessed(linkElement);
      return;
    }

    try {
      const response = await fetch(linkElement.href, { mode: 'cors' });
      if (!response.ok) {
        markAsProcessed(linkElement);
        return;
      }

      const originalCss = await response.text();
      const fontUrlRegex = /url\(['"]?([^'")\s]+\.(woff2?|ttf|otf|eot))['"]?\)/gi;
      const matches = [...originalCss.matchAll(fontUrlRegex)];

      let processedCss = originalCss;
      for (const match of matches) {
        const originalUrl = match[1];
        const fullUrl = resolveUrl(originalUrl, linkElement.href);

        try {
          const proxiedUrl = await proxyAsset(fullUrl);
          processedCss = processedCss.replace(match[0], `url('${proxiedUrl}')`);
        } catch (error) {
          // Continue with original URL
        }
      }

      const finalCss = addFontDisplaySwap(processedCss);

      if (finalCss !== originalCss) {
        const newStyleElement = document.createElement('style');
        newStyleElement.textContent = finalCss;
        markAsProcessed(newStyleElement);
        linkElement.parentNode?.replaceChild(newStyleElement, linkElement);
      } else {
        markAsProcessed(linkElement);
      }
    } catch (error) {
      markAsProcessed(linkElement);
    }
  };

  const processStyleSheets = async (node: Element): Promise<void> => {
    const stylesheets = getAllStylesheets(node).filter(sheet => !isProcessed(sheet));

    await Promise.all(
      stylesheets.map(stylesheet =>
        stylesheet.tagName === 'STYLE'
          ? processStyleElement(stylesheet as HTMLStyleElement)
          : processLinkElement(stylesheet as HTMLLinkElement)
      )
    );
  };

  const setupCorsHeaders = (node: Element): void => {
    const processImages = (images: HTMLImageElement[]) =>
      images
        .filter(img => img.src && !img.src.startsWith(window.location.origin))
        .forEach(img => { img.crossOrigin = 'anonymous'; });

    const processLinks = (links: HTMLLinkElement[]) =>
      links
        .filter(link => link.href && !link.href.startsWith(window.location.origin))
        .forEach(link => { link.crossOrigin = 'anonymous'; });

    const processIframes = (iframes: HTMLIFrameElement[]) =>
      iframes
        .filter(iframe => iframe.src && !iframe.src.startsWith(window.location.origin))
        .forEach(iframe => iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms'));

    processIframes(Array.from(node.querySelectorAll('iframe')));
    processImages(Array.from(node.querySelectorAll('img')));
    processLinks(Array.from(node.querySelectorAll('link[rel="stylesheet"]')));
  };

  const staticContentPlugin = {
    onBuild: (node: any, context: any) => {
      if (node?.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        setupCorsHeaders(element);
        processStyleSheets(element).catch(error =>
          console.error('Error processing stylesheets:', error)
        );
      }
    }
  };

  const setupPlayerEventCleanup = (
    targetElement: Element,
    stateHandler: () => void,
    timeHandler: (event: any) => void
  ): (() => void) | null => {
    if (!playerRef.current) return null;

    playerRef.current.addEventListener("ui-update-player-state", stateHandler);
    playerRef.current.addEventListener("ui-update-current-time", timeHandler);

    return () => {
      if (playerRef.current) {
        playerRef.current.removeEventListener("ui-update-player-state", stateHandler);
        playerRef.current.removeEventListener("ui-update-current-time", timeHandler);
      }
    };
  };

  const setupMonitoring = (): void => {
    const playerContainer = playerContainerRef.current;
    const replayerWrapper = playerContainer?.querySelector('.replayer-wrapper');

    if (!playerContainer) {
      setTimeout(setupMonitoring, MONITORING_RETRY_DELAY_MS);
      return;
    }

    const targetElement = replayerWrapper || playerContainer;
    const iframeObservers = new Set<MutationObserver>();

    staticContentPlugin.onBuild(targetElement, {});

    const monitorIframeContent = (iframe: HTMLIFrameElement): void => {
      const processIframeContent = () => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!iframeDoc) return;

          const docElement = iframeDoc.documentElement || iframeDoc.body;
          staticContentPlugin.onBuild(docElement, {});

          const iframeObserver = new MutationObserver(() => {
            staticContentPlugin.onBuild(docElement, {});
          });

          iframeObserver.observe(docElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['href', 'src']
          });

          (iframe as any)._corsIframeObserver = iframeObserver;
          iframeObservers.add(iframeObserver);
        } catch (error) {
          console.error('Error processing iframe content:', error);
        }
      };

      iframe.addEventListener('load', processIframeContent);
      if (iframe.contentDocument?.readyState === 'complete') {
        processIframeContent();
      }
    };

    Array.from(targetElement.querySelectorAll('iframe')).forEach(monitorIframeContent);

    const observer = new MutationObserver(mutations => {
      const shouldProcess = mutations.some(mutation => {
        if (mutation.type === 'childList') {
          return Array.from(mutation.addedNodes).some(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;

              if (element.tagName === 'IFRAME') {
                monitorIframeContent(element as HTMLIFrameElement);
              }

              staticContentPlugin.onBuild(element, {});
              return hasAssetContent(element);
            }
            return false;
          });
        }

        return mutation.type === 'attributes' &&
          ['href', 'src'].includes(mutation.attributeName || '');
      });

      if (shouldProcess) {
        staticContentPlugin.onBuild(targetElement, {});
      }
    });

    observer.observe(targetElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'src', 'style']
    });

    const setupEventBasedMonitoring = () => {
      const stateHandler = () => staticContentPlugin.onBuild(targetElement, {});

      let lastProcessTime = 0;
      const timeHandler = (event: any) => {
        const currentTime = event.payload;
        if (Math.floor(currentTime / PROCESSING_INTERVAL_SECONDS) !== Math.floor(lastProcessTime / PROCESSING_INTERVAL_SECONDS)) {
          staticContentPlugin.onBuild(targetElement, {});
          lastProcessTime = currentTime;
        }
      };

      const playerEventCleanup = setupPlayerEventCleanup(targetElement, stateHandler, timeHandler);

      const resizeObserver = new ResizeObserver(() => {
        staticContentPlugin.onBuild(targetElement, {});
      });
      resizeObserver.observe(targetElement);

      return { resizeObserver, playerEventCleanup };
    };

    const { resizeObserver, playerEventCleanup } = setupEventBasedMonitoring();
    cleanupRefs = { observer, resizeObserver, iframeObservers, playerEventCleanup };
  };

  setTimeout(setupMonitoring, MONITORING_SETUP_DELAY_MS);

  return {
    onBuild: staticContentPlugin.onBuild,
    cleanup: () => {
      if (cleanupRefs) {
        cleanupRefs.observer.disconnect();
        cleanupRefs.resizeObserver.disconnect();
        cleanupRefs.iframeObservers.forEach(observer => observer.disconnect());
        cleanupRefs.iframeObservers.clear();
        cleanupRefs.playerEventCleanup?.();
      }

      assetCache.forEach(url => URL.revokeObjectURL(url));
      assetCache.clear();
    }
  };
};
