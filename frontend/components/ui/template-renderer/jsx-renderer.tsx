import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

const MESSAGE_TYPE = "__TEMPLATE_DATA_UPDATE__";

const createIframeContent = (templateCode: string): string => {
  const escapedTemplateCode = templateCode
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$")
    .replace(/<\\\/script>/gi, "<\\\\/script>");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval' https://esm.sh; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://esm.sh; style-src 'self' 'unsafe-inline';">
  
  <script type="importmap">
  {
    "imports": {
      "preact": "https://esm.sh/preact@10.19.6",
      "preact/hooks": "https://esm.sh/preact@10.19.6/hooks",
      "@babel/standalone": "https://esm.sh/@babel/standalone@7.23.6",
      "@twind/core": "https://esm.sh/@twind/core",
      "@twind/preset-tailwind": "https://esm.sh/@twind/preset-tailwind",
      "@twind/preset-autoprefix": "https://esm.sh/@twind/preset-autoprefix"
    }
  }
  </script>
  
  <style>
    * { box-sizing: border-box; }
    html, body, #root { height: 100%; }
    body { 
      margin: 0; 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.5;
      background: #0A0A0A;
      color: #FAFAFA;
    }
    .error { color: #CC3333; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  </style>
</head>
<body>
  <div id="root" />
  
  <script type="module">
    const parentOrigin = window.origin;

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
        const [preactModule, preactHooksModule, babelModule, twindCore, presetTailwind, presetAutoprefix] = await Promise.all([
          import('preact'),
          import('preact/hooks'),
          import('@babel/standalone'),
          import('@twind/core'),
          import('@twind/preset-tailwind'),
          import('@twind/preset-autoprefix')
        ]);
        
        const core = twindCore.default || twindCore;
        const tailwind = presetTailwind.default || presetTailwind;
        const autoprefix = presetAutoprefix.default || presetAutoprefix;
        const { install, observe } = core;
        const tw = install({ presets: [tailwind(), autoprefix()] });

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
      
      renderWithData(data) {
        const { preact, preactHooks, twindObserve, tw } = this.deps;
        const { render, h, Fragment } = preact;
        const { useState, useEffect, useMemo, useRef, useCallback, useContext } = preactHooks;
        
        const templateFunction = new Function(
          'h', 'Fragment', 'useState', 'useEffect', 'useMemo', 'useRef', 'useCallback', 'useContext',
          'return ' + this.compiledCode
        )(h, Fragment, useState, useEffect, useMemo, useRef, useCallback, useContext);
        
        if (typeof templateFunction !== 'function') {
          throw new Error('Template must be a function');
        }
        
        const element = h(templateFunction, { data });
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
    body { margin: 0; padding: 1rem; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #FAFAFA; }
    .error { color: #dc2626; background: #fef2f2; padding: 1rem; border-radius: 0.375rem; border: 1px solid #fecaca; }
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

const JsxRenderer = ({ code, data, className }: { code: string; data: any; className?: string }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pendingDataRef = useRef<any>(null);
  const iframeReadyRef = useRef(false);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    iframeReadyRef.current = false;

    const handleReady = (event: MessageEvent) => {
      if (event.data?.type !== `${MESSAGE_TYPE}_READY`) return;
      iframeReadyRef.current = true;

      if (pendingDataRef.current !== null) {
        iframe.contentWindow?.postMessage({ type: MESSAGE_TYPE, payload: pendingDataRef.current }, window.origin);
      }
    };

    window.addEventListener("message", handleReady);

    try {
      iframe.srcdoc = createIframeContent(normalizeTemplateCode(code));
    } catch (error) {
      iframe.srcdoc = createErrorContent(
        error instanceof Error ? error.message : "Failed to initialize template renderer"
      );
    }

    return () => window.removeEventListener("message", handleReady);
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

  return (
    <iframe
      ref={iframeRef}
      className={cn("w-full h-full", className)}
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
