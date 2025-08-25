import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

const createIframeContent = (templateCode: string, data: any): string => {
  const serializedData = JSON.stringify(data);
  // Escape characters that would break the template literal embedding
  const escapedTemplateCode = templateCode
    .replace(/\\/g, "\\\\") // preserve backslashes (so '\n' stays two chars)
    .replace(/`/g, "\\`") // avoid closing the template literal
    .replace(/\$/g, "\\$") // avoid accidental interpolation
    .replace(/<\\\/script>/gi, "<\\\\/script>"); // prevent breaking out of the script tag

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
       
    * { 
      box-sizing: border-box; 
    }
    
    body { 
      margin: 0; 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.5;
      background: #0A0A0A;
    }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  </style>
</head>
<body>
  <div id="root" />
  
  <script type="module">
    class TemplateRenderer {
      constructor() {
        this.root = document.getElementById('root');
        this.data = ${serializedData};
        this.templateCode = \`${escapedTemplateCode}\`;
        this.unobserve = null;
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
        try {
          const [preactModule, preactHooksModule, babelModule, twindCore, presetTailwind, presetAutoprefix] = await Promise.all([
            import('preact'),
            import('preact/hooks'),
            import('@babel/standalone'),
            import('@twind/core'),
            import('@twind/preset-tailwind'),
            import('@twind/preset-autoprefix')
          ]);
          
          // Initialize Twind with Tailwind-compatible presets
          const core = twindCore.default || twindCore;
          const tailwind = presetTailwind.default || presetTailwind;
          const autoprefix = presetAutoprefix.default || presetAutoprefix;
          const { install, observe } = core;
          install({ presets: [tailwind(), autoprefix()] });

          return {
            preact: preactModule,
            preactHooks: preactHooksModule,
            babel: babelModule.default || babelModule,
            twindObserve: observe
          };
        } catch (error) {
          throw new Error(\`Failed to load dependencies: \${error.message}\`);
        }
      }
      
      compileTemplate(babel) {
        try {
          const result = babel.transform(this.templateCode, {
            presets: [
              ['react', {
                pragma: 'h',
                pragmaFrag: 'Fragment'
              }]
            ]
          });
          
          return result.code;
        } catch (error) {
          throw new Error(\`Template compilation failed: \${error.message}\`);
        }
      }
      
      executeTemplate(compiledCode, preact, preactHooks, twindObserve) {
        try {
          const { render, h, Fragment } = preact;
          const { useState, useEffect, useMemo, useRef, useCallback, useContext } = preactHooks;
          
          const templateFunction = new Function(
            'h',
            'Fragment',
            'useState',
            'useEffect',
            'useMemo',
            'useRef',
            'useCallback',
            'useContext',
            'return ' + compiledCode
          )(h, Fragment, useState, useEffect, useMemo, useRef, useCallback, useContext);
          
          if (typeof templateFunction !== 'function') {
            throw new Error('Template must be a function');
          }
          
          const element = h(templateFunction, { data: this.data });
          
          if (!element) {
            throw new Error('Template function must return a valid element');
          }
          
          this.root.innerHTML = '';
          
          // Start or refresh Twind DOM observer to process Tailwind classes
          if (this.unobserve) {
            try { this.unobserve(); } catch {}
          }
          try {
            this.unobserve = twindObserve(this.root);
          } catch {}

          render(element, this.root);
          
        } catch (error) {
          throw new Error(\`Template execution failed: \${error.message}\`);
        }
      }
      
      async render() {
        try {
          const { preact, preactHooks, babel, twindObserve } = await this.loadDependencies();
          const compiledCode = this.compileTemplate(babel);
          this.executeTemplate(compiledCode, preact, preactHooks, twindObserve);
          
        } catch (error) {
          this.showError(
            error.message || 'Unknown error occurred',
            error.stack
          );
        }
      }
    }
    
    const renderer = new TemplateRenderer();
    renderer.render();
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
    body { 
      margin: 0; 
      padding: 1rem; 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      background: #FAFAFA;
    }
    .error { 
      color: #dc2626; 
      background: #fef2f2; 
      padding: 1rem; 
      border-radius: 0.375rem; 
      border: 1px solid #fecaca; 
    }
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

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    try {
      const parsedData = parseData(data);
      const normalizedCode = normalizeTemplateCode(code);
      iframe.srcdoc = createIframeContent(normalizedCode, parsedData);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to initialize template renderer";

      iframe.srcdoc = createErrorContent(errorMessage);
    }
  }, [code, data]);

  return (
    <iframe
      ref={iframeRef}
      className={cn("w-full h-full border bg-background", className)}
      style={{
        contain: "layout style",
        isolation: "isolate",
      }}
      sandbox="allow-scripts allow-same-origin"
      title="Template Preview"
      referrerPolicy="no-referrer"
      loading="lazy"
      aria-label="Template preview"
    />
  );
};

export default JsxRenderer;
