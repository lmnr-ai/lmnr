interface CorsPluginCleanup {
  observer: MutationObserver;
  resizeObserver: ResizeObserver;
}

export interface SessionPlayerCorsPlugin {
  onBuild: (node: any, context: any) => void;
  cleanup: () => void;
}

// Plugin to handle CORS issues with static content
export const createSessionPlayerCorsPlugin = (
  playerRef: React.RefObject<any>,
  playerContainerRef: React.RefObject<HTMLDivElement | null>
): SessionPlayerCorsPlugin => {
  const assetCache = new Map<string, string>();
  let cleanupRefs: CorsPluginCleanup | null = null;

  const proxyAsset = async (originalUrl: string): Promise<string> => {
    if (assetCache.has(originalUrl)) {
      return assetCache.get(originalUrl)!;
    }

    try {
      // Try to fetch the asset directly first
      const response = await fetch(originalUrl, { mode: 'cors' });
      if (response.ok) {
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        assetCache.set(originalUrl, objectUrl);
        return objectUrl;
      }
    } catch (error) {
      // Direct fetch failed, continue to proxy
    }

    // If direct fetch fails, try through our internal proxy
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
      // Proxy failed, return original URL as fallback
    }

    // Return original URL as fallback
    return originalUrl;
  };

  const processStyleSheets = async (node: Element) => {
    // Look for stylesheets in multiple contexts
    let stylesheets: Element[] = [];

    // 1. Check the current node
    const nodeStylesheets = Array.from(node.querySelectorAll('style, link[rel="stylesheet"]'));
    stylesheets.push(...nodeStylesheets);

    // 2. Check for iframes (rrweb often uses iframes for replay)
    const iframes = Array.from(node.querySelectorAll('iframe'));
    for (const iframe of iframes) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          const iframeStylesheets = Array.from(iframeDoc.querySelectorAll('style, link[rel="stylesheet"]'));
          stylesheets.push(...iframeStylesheets);
        }
      } catch (error) {
        // Iframe might be cross-origin, skip silently
      }
    }

    // 3. If node is part of a document, also check the document head
    const ownerDoc = node.ownerDocument;
    if (ownerDoc && ownerDoc !== document) {
      const docStylesheets = Array.from(ownerDoc.querySelectorAll('style, link[rel="stylesheet"]'));
      stylesheets.push(...docStylesheets);
    }

    for (const stylesheet of stylesheets) {
      // Skip if already processed (add marker)
      if ((stylesheet as any)._lmnrCorsProcessed) {
        continue;
      }

      if (stylesheet.tagName === 'STYLE') {
        const styleElement = stylesheet as HTMLStyleElement;
        let cssText = styleElement.textContent || '';
        let modified = false;

        // Find font URLs in CSS and add fallback strategies
        const fontUrlRegex = /url\(['"]?([^'")\s]+\.(woff2?|ttf|otf|eot))['"]?\)/gi;
        const matches = [...cssText.matchAll(fontUrlRegex)];

        for (const match of matches) {
          const originalUrl = match[1];
          if (originalUrl.startsWith('http') || originalUrl.startsWith('//')) {
            try {
              const proxiedUrl = await proxyAsset(originalUrl.startsWith('//') ? `https:${originalUrl}` : originalUrl);
              cssText = cssText.replace(match[0], `url('${proxiedUrl}')`);
              modified = true;
            } catch (error) {
              // Failed to proxy font, continue with original
            }
          }
        }

        // Add font-display: swap to all @font-face rules to prevent FOUT
        if (cssText.includes('@font-face')) {
          cssText = cssText.replace(/@font-face\s*{([^}]*)}/gi, (match, content) => {
            if (!content.includes('font-display')) {
              modified = true;
              return match.replace('}', 'font-display: swap; }');
            }
            return match;
          });
        }

        if (modified && styleElement.textContent !== cssText) {
          styleElement.textContent = cssText;
        }

        // Mark as processed
        (stylesheet as any)._lmnrCorsProcessed = true;
      } else if (stylesheet.tagName === 'LINK') {
        const linkElement = stylesheet as HTMLLinkElement;
        if (linkElement.href && (linkElement.href.startsWith('http') || linkElement.href.startsWith('//'))) {
          try {
            // Try to fetch and process external stylesheets
            const response = await fetch(linkElement.href, { mode: 'cors' });
            if (response.ok) {
              let cssText = await response.text();
              let modified = false;

              // Process font URLs in the fetched CSS
              const fontUrlRegex = /url\(['"]?([^'")\s]+\.(woff2?|ttf|otf|eot))['"]?\)/gi;
              const matches = [...cssText.matchAll(fontUrlRegex)];

              for (const match of matches) {
                const originalUrl = match[1];
                let fullUrl = originalUrl;

                if (originalUrl.startsWith('//')) {
                  fullUrl = `https:${originalUrl}`;
                } else if (originalUrl.startsWith('/')) {
                  const baseUrl = new URL(linkElement.href).origin;
                  fullUrl = `${baseUrl}${originalUrl}`;
                } else if (!originalUrl.startsWith('http')) {
                  const baseUrl = linkElement.href.substring(0, linkElement.href.lastIndexOf('/') + 1);
                  fullUrl = `${baseUrl}${originalUrl}`;
                }

                try {
                  const proxiedUrl = await proxyAsset(fullUrl);
                  cssText = cssText.replace(match[0], `url('${proxiedUrl}')`);
                  modified = true;
                } catch (error) {
                  // Failed to proxy font from stylesheet
                }
              }

              // Add font-display: swap
              if (cssText.includes('@font-face')) {
                cssText = cssText.replace(/@font-face\s*{([^}]*)}/gi, (match, content) => {
                  if (!content.includes('font-display')) {
                    modified = true;
                    return match.replace('}', 'font-display: swap; }');
                  }
                  return match;
                });
              }

              if (modified) {
                // Replace the link with a style element containing the processed CSS
                const newStyleElement = document.createElement('style');
                newStyleElement.textContent = cssText;
                (newStyleElement as any)._lmnrCorsProcessed = true;
                linkElement.parentNode?.replaceChild(newStyleElement, linkElement);
              } else {
                // Mark as processed even if no changes
                (stylesheet as any)._lmnrCorsProcessed = true;
              }
            } else {
              (stylesheet as any)._lmnrCorsProcessed = true;
            }
          } catch (error) {
            (stylesheet as any)._lmnrCorsProcessed = true;
          }
        } else {
          // Mark local stylesheets as processed
          (stylesheet as any)._lmnrCorsProcessed = true;
        }
      }
    }
  };

  const setupCorsHeaders = (node: Element) => {
    // Add CORS handling for iframes if any
    const iframes = Array.from(node.querySelectorAll('iframe'));
    iframes.forEach(iframe => {
      if (iframe.src && !iframe.src.startsWith(window.location.origin)) {
        iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms');
      }
    });

    // Add crossorigin attribute to images and links
    const images = Array.from(node.querySelectorAll('img'));
    images.forEach(img => {
      if (img.src && !img.src.startsWith(window.location.origin)) {
        img.crossOrigin = 'anonymous';
      }
    });

    const links = Array.from(node.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
    links.forEach(link => {
      if (link.href && !link.href.startsWith(window.location.origin)) {
        link.crossOrigin = 'anonymous';
      }
    });
  };

  const staticContentPlugin = {
    onBuild: (node: any, context: any) => {
      // Only process if it's an Element node
      if (node && node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;

        // Apply CORS headers immediately
        setupCorsHeaders(element);

        // Process asynchronously but don't block the build
        processStyleSheets(element).catch(() => {
          // Silently handle errors
        });
      }
    }
  };

  // Setup monitoring after player initialization
  const setupMonitoring = () => {
    const playerContainer = playerContainerRef.current;
    const replayerWrapper = playerContainer?.querySelector('.replayer-wrapper');

    if (!playerContainer) {
      setTimeout(setupMonitoring, 500);
      return;
    }

    const targetElement = replayerWrapper || playerContainer;

    // Process initial content
    staticContentPlugin.onBuild(targetElement, {});

    // Enhanced iframe monitoring function
    const monitorIframeContent = (iframe: HTMLIFrameElement) => {
      const processIframeContent = () => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc) {
            staticContentPlugin.onBuild(iframeDoc.documentElement || iframeDoc.body, {});

            // Set up mutation observer for iframe content
            const iframeObserver = new MutationObserver(() => {
              staticContentPlugin.onBuild(iframeDoc.documentElement || iframeDoc.body, {});
            });

            iframeObserver.observe(iframeDoc.documentElement || iframeDoc.body, {
              childList: true,
              subtree: true,
              attributes: true,
              attributeFilter: ['href', 'src']
            });

            // Store for cleanup
            (iframe as any)._corsIframeObserver = iframeObserver;
          }
        } catch (error) {
          // Cannot access iframe content
        }
      };

      iframe.addEventListener('load', processIframeContent);
      // Try immediately in case already loaded
      if (iframe.contentDocument?.readyState === 'complete') {
        processIframeContent();
      }
    };

    // Apply to existing iframes
    const existingIframes = Array.from(targetElement.querySelectorAll('iframe'));
    existingIframes.forEach(monitorIframeContent);

    // Set up mutation observer for dynamic content
    const observer = new MutationObserver((mutations) => {
      let shouldProcess = false;

      mutations.forEach((mutation) => {
        // Check for any DOM changes that might include stylesheets or assets
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              // Check if this node or its children contain stylesheets or assets
              if (element.tagName === 'STYLE' ||
                element.tagName === 'LINK' ||
                element.tagName === 'IFRAME' ||
                element.querySelector('style, link[rel="stylesheet"], iframe')) {
                shouldProcess = true;
              }

              // If it's an iframe, set up monitoring for it
              if (element.tagName === 'IFRAME') {
                monitorIframeContent(element as HTMLIFrameElement);
              }

              staticContentPlugin.onBuild(element, {});
            }
          });
        }

        // Also watch for attribute changes that might affect asset loading
        if (mutation.type === 'attributes' &&
          (mutation.attributeName === 'href' || mutation.attributeName === 'src')) {
          shouldProcess = true;
        }
      });

      // If we detected stylesheet changes, reprocess the entire target element
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

    // Set up event-based monitoring instead of periodic checks
    const setupEventBasedMonitoring = () => {
      // 1. Listen to rrweb player events
      if (playerRef.current) {
        // Listen for player state changes that might indicate new content
        playerRef.current.addEventListener("ui-update-player-state", () => {
          staticContentPlugin.onBuild(targetElement, {});
        });

        // Listen for time updates that might indicate frame changes
        let lastProcessTime = 0;
        playerRef.current.addEventListener("ui-update-current-time", (event: any) => {
          const currentTime = event.payload;
          // Process every 1 second of playback to catch content changes
          if (Math.floor(currentTime / 1000) !== Math.floor(lastProcessTime / 1000)) {
            staticContentPlugin.onBuild(targetElement, {});
            lastProcessTime = currentTime;
          }
        });
      }

      // 3. Use ResizeObserver to detect layout changes that might indicate content updates
      const resizeObserver = new ResizeObserver(() => {
        staticContentPlugin.onBuild(targetElement, {});
      });
      resizeObserver.observe(targetElement);

      return { resizeObserver };
    };

    const { resizeObserver } = setupEventBasedMonitoring();

    // Store cleanup references
    cleanupRefs = { observer, resizeObserver };
  };

  // Start monitoring after player initialization
  setTimeout(setupMonitoring, 1000);

  return {
    onBuild: staticContentPlugin.onBuild,
    cleanup: () => {
      if (cleanupRefs) {
        cleanupRefs.observer.disconnect();
        cleanupRefs.resizeObserver.disconnect();
      }

      // Clean up asset cache
      assetCache.forEach(url => {
        URL.revokeObjectURL(url);
      });
      assetCache.clear();
    }
  };
};
