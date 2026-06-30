import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import { LAMINAR_IFRAME_THEME, laminarIframeThemeJson } from "./theme";

const MESSAGE_TYPE = "__TEMPLATE_DATA_UPDATE__";
const RELOAD_MESSAGE_TYPE = "__TEMPLATE_RELOAD_REQUEST__";
const MAX_LOAD_ATTEMPTS = 3;

const createIframeContent = (templateCode: string, isFinalAttempt: boolean, reloadNonce: string): string => {
  const escapedTemplateCode = templateCode
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$")
    .replace(/<\\\/script>/gi, "<\\\\/script>");

  const themeJson = laminarIframeThemeJson();
  const bodyFontFamily = LAMINAR_IFRAME_THEME.fontFamily.sans.map((f) => (f.includes(" ") ? `'${f}'` : f)).join(", ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval' https://esm.sh; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://esm.sh; style-src 'self' 'unsafe-inline'; connect-src https://esm.sh; img-src data: blob:;">

  <script>
    (function blockNetworkApis() {
      const blocked = () => { throw new Error('Network requests are disabled inside template renderers.'); };
      try { window.fetch = blocked; } catch {}
      try { window.XMLHttpRequest = function() { blocked(); }; } catch {}
      try { window.WebSocket = function() { blocked(); }; } catch {}
      try { window.EventSource = function() { blocked(); }; } catch {}
      try {
        if (navigator && typeof navigator.sendBeacon === 'function') {
          navigator.sendBeacon = () => { blocked(); };
        }
      } catch {}
    })();
  </script>

  <script type="importmap">
  {
    "imports": {
      "preact": "https://esm.sh/preact@10.19.6",
      "preact/hooks": "https://esm.sh/preact@10.19.6/hooks",
      "@babel/standalone": "https://esm.sh/@babel/standalone@7.23.6",
      "@twind/core": "https://esm.sh/@twind/core@1.1.3",
      "@twind/preset-tailwind": "https://esm.sh/@twind/preset-tailwind@1.1.4",
      "@twind/preset-autoprefix": "https://esm.sh/@twind/preset-autoprefix@1.0.7"
    }
  }
  </script>
  
  <style>
    * { box-sizing: border-box; }
    html, body { min-height: 100%; }
    #root { min-height: 100%; }
    body { 
      margin: 0; 
      font-family: ${bodyFontFamily};
      line-height: 1.5;
      background: ${LAMINAR_IFRAME_THEME.colors.background};
      color: ${LAMINAR_IFRAME_THEME.colors.foreground};
      overflow-x: hidden;
      overflow-y: auto;
    }
    *::-webkit-scrollbar { width: 6px; height: 1px; }
    *::-webkit-scrollbar-track { background: ${LAMINAR_IFRAME_THEME.colors.secondary.DEFAULT}; }
    *::-webkit-scrollbar-thumb { background: ${LAMINAR_IFRAME_THEME.colors.border}; border-radius: 10px; }
    *::-webkit-scrollbar-thumb:hover { background: ${LAMINAR_IFRAME_THEME.colors.border}CC; }
    html, body { scrollbar-color: ${LAMINAR_IFRAME_THEME.colors.border} ${LAMINAR_IFRAME_THEME.colors.border}33; }
    .error { color: ${LAMINAR_IFRAME_THEME.colors.destructive.DEFAULT}; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  </style>
</head>
<body>
  <div id="root" />
  
  <script type="module">
    const parentOrigin = window.origin;
    const LAMINAR_THEME = ${themeJson};
    const IS_FINAL_ATTEMPT = ${isFinalAttempt ? "true" : "false"};
    const RELOAD_NONCE = ${JSON.stringify(reloadNonce)};

    class TemplateRenderer {
      constructor() {
        this.root = document.getElementById('root');
        this.templateCode = \`${escapedTemplateCode}\`;
        this.compiledCode = null;
        this.deps = null;
        this.ready = false;
      }
      
      showError(message, details = '') {
        this.root.innerHTML = \`
          <div class="error" role="alert">
            <strong>Template Error:</strong><br/>
            \${message}
            \${details ? \`<details style="margin-top: 0.5rem;"><summary>Details</summary><pre style="margin: 0.5rem 0; padding: 0.5rem; background: rgba(0,0,0,0.1); border-radius: 0.25rem; font-size: 0.875rem; overflow-x: auto;">\${details}</pre></details>\` : ''}
          </div>
        \`;
      }
      
      async loadDependencies() {
        let modules;
        try {
          modules = await Promise.all([
            import('preact'),
            import('preact/hooks'),
            import('@babel/standalone'),
            import('@twind/core'),
            import('@twind/preset-tailwind'),
            import('@twind/preset-autoprefix')
          ]);
        } catch (error) {
          // Browsers cache a failed dynamic-import record, so re-importing here
          // wouldn't re-fetch. Surface a recoverable flag so the host can remount
          // the iframe with a fresh module map (the same thing reopening does).
          error.isDependencyLoadError = true;
          throw error;
        }
        const [preactModule, preactHooksModule, babelModule, twindCore, presetTailwind, presetAutoprefix] = modules;
        
        const core = twindCore.default || twindCore;
        const tailwind = presetTailwind.default || presetTailwind;
        const autoprefix = presetAutoprefix.default || presetAutoprefix;
        const { install, observe } = core;
        const tw = install({
          presets: [tailwind(), autoprefix()],
          theme: {
            extend: {
              colors: LAMINAR_THEME.colors,
              fontFamily: LAMINAR_THEME.fontFamily,
            },
          },
        });

        return {
          preact: preactModule,
          preactHooks: preactHooksModule,
          babel: babelModule.default || babelModule,
          twindObserve: observe,
          tw
        };
      }
      
      compileTemplate(babel) {
        const result = babel.transform(this.templateCode, {
          presets: [['react', { pragma: 'h', pragmaFrag: 'Fragment' }]]
        });
        return result.code;
      }
      
      buildTemplateFn() {
        const { preact, preactHooks } = this.deps;
        const { h, Fragment } = preact;
        const { useState, useEffect, useMemo, useRef, useCallback, useContext } = preactHooks;
        
        const templateFunction = new Function(
          'h', 'Fragment', 'useState', 'useEffect', 'useMemo', 'useRef', 'useCallback', 'useContext',
          'return ' + this.compiledCode
        )(h, Fragment, useState, useEffect, useMemo, useRef, useCallback, useContext);
        
        if (typeof templateFunction !== 'function') {
          throw new Error('Template must be a function');
        }
        
        return templateFunction;
      }

      renderWithData(data) {
        const { preact, twindObserve, tw } = this.deps;
        const { render, h } = preact;
        
        const element = h(this.templateFn, { data });
        if (!element) {
          throw new Error('Template function must return a valid element');
        }
        
        try { twindObserve(tw, this.root); } catch {}
        render(element, this.root);
      }
      
      async init() {
        try {
          this.deps = await this.loadDependencies();
          this.compiledCode = this.compileTemplate(this.deps.babel);
          this.templateFn = this.buildTemplateFn();
          this.ready = true;

          window.addEventListener('message', (event) => {
            if (event.origin !== parentOrigin) return;
            if (!event.data || event.data.type !== '${MESSAGE_TYPE}') return;

            if (this.ready) {
              try {
                this.renderWithData(event.data.payload);
              } catch (error) {
                this.showError(error.message || 'Render error', error.stack);
              }
            }
          });

          window.parent.postMessage({ type: '${MESSAGE_TYPE}_READY' }, parentOrigin);
        } catch (error) {
          if (error && error.isDependencyLoadError && !IS_FINAL_ATTEMPT) {
            window.parent.postMessage({ type: '${RELOAD_MESSAGE_TYPE}', nonce: RELOAD_NONCE }, parentOrigin);
            return;
          }
          this.showError(error.message || 'Unknown error occurred', error.stack);
        }
      }
    }
    
    const renderer = new TemplateRenderer();
    renderer.init();
  </script>
</body>
</html>`;
};

const createErrorContent = (message: string): string => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 1rem; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: ${LAMINAR_IFRAME_THEME.colors.background}; color: ${LAMINAR_IFRAME_THEME.colors.foreground}; }
    .error { color: ${LAMINAR_IFRAME_THEME.colors.destructive.DEFAULT}; background: rgba(204, 51, 51, 0.08); padding: 1rem; border-radius: 0.375rem; border: 1px solid ${LAMINAR_IFRAME_THEME.colors.border}; }
  </style>
</head>
<body>
  <div class="error" role="alert">
    <strong>Setup Error:</strong><br/>
    ${message}
  </div>
</body>
</html>`;

const normalizeTemplateCode = (code: string): string => {
  const trimmedCode = code.trim();

  const functionMatch = trimmedCode.match(/^function\s*\((.*?)\)\s*{([\s\S]*)}$/);
  if (functionMatch) {
    return `(${functionMatch[1]}) => {${functionMatch[2]}}`;
  }

  if (!trimmedCode.startsWith("(") && !trimmedCode.startsWith("function")) {
    return `({ data }) => {${trimmedCode}}`;
  }

  return trimmedCode;
};

const parseData = (data: any): any => {
  try {
    return typeof data === "string" ? JSON.parse(data) : data;
  } catch {
    return data;
  }
};

interface JsxRendererProps {
  code: string;
  data: any;
  className?: string;
  autoHeight?: boolean;
}

const JsxRenderer = ({ code, data, className, autoHeight = false }: JsxRendererProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pendingDataRef = useRef<any>(null);
  const iframeReadyRef = useRef(false);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    iframeReadyRef.current = false;
    let attempt = 0;
    // Identifies this effect cycle's srcdoc. A srcdoc navigation reuses the same
    // browsing context, so a RELOAD_MESSAGE_TYPE queued by a superseded load
    // (e.g. after `code` changed mid-failure) still passes the contentWindow
    // source check; the nonce lets us drop those stale reload requests.
    const reloadNonce = crypto.randomUUID();

    const writeSrcdoc = () => {
      try {
        iframe.srcdoc = createIframeContent(normalizeTemplateCode(code), attempt >= MAX_LOAD_ATTEMPTS - 1, reloadNonce);
      } catch (error) {
        iframe.srcdoc = createErrorContent(
          error instanceof Error ? error.message : "Failed to initialize template renderer"
        );
      }
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return;

      // A dependency import failed (e.g. transient esm.sh hiccup). Remount the
      // iframe with a fresh module map — a re-import in the same realm would hit
      // the browser's cached failed-module record and never re-fetch.
      if (event.data?.type === RELOAD_MESSAGE_TYPE) {
        if (event.data.nonce === reloadNonce && attempt < MAX_LOAD_ATTEMPTS - 1) {
          attempt += 1;
          iframeReadyRef.current = false;
          writeSrcdoc();
        }
        return;
      }

      if (event.data?.type !== `${MESSAGE_TYPE}_READY`) return;
      iframeReadyRef.current = true;

      if (pendingDataRef.current !== null) {
        iframe.contentWindow?.postMessage({ type: MESSAGE_TYPE, payload: pendingDataRef.current }, window.origin);
      }
    };

    window.addEventListener("message", handleMessage);

    writeSrcdoc();

    return () => window.removeEventListener("message", handleMessage);
  }, [code]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const parsedData = parseData(data);
    pendingDataRef.current = parsedData;

    if (iframeReadyRef.current) {
      iframe.contentWindow?.postMessage({ type: MESSAGE_TYPE, payload: parsedData }, window.origin);
    }
  }, [data]);

  // Auto-resize the iframe to its content height by observing the template's
  // mount point (#root) from the host document (allowed by `allow-same-origin`).
  // Observing body/documentElement does NOT work: the HTML spec transfers
  // `overflow-y: auto` from body to the iframe viewport, clamping their own
  // contentRects to the (initially 0px) viewport — ResizeObserver never sees
  // the content grow. `#root` is a plain div, free of that quirk.
  // Height is set imperatively (not through React's style prop) so re-renders
  // don't clobber the measured value.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !autoHeight) return;

    iframe.style.height = "0px";

    let observer: ResizeObserver | null = null;

    const attach = () => {
      observer?.disconnect();
      const doc = iframe.contentDocument;
      const root = doc?.getElementById("root");
      if (!root) return;
      const update = () => {
        iframe.style.height = `${root.scrollHeight}px`;
      };
      update();
      observer = new ResizeObserver(update);
      observer.observe(root);
    };

    iframe.addEventListener("load", attach);
    if (iframe.contentDocument?.readyState === "complete") attach();

    return () => {
      iframe.removeEventListener("load", attach);
      observer?.disconnect();
    };
  }, [autoHeight]);

  return (
    <iframe
      ref={iframeRef}
      className={cn("w-full", autoHeight ? null : "h-full", className)}
      style={{ contain: "layout style", isolation: "isolate" }}
      sandbox="allow-scripts allow-same-origin"
      title="Template Preview"
      referrerPolicy="no-referrer"
      loading="lazy"
      aria-label="Template preview"
    />
  );
};

export default JsxRenderer;
