import { useCallback, useEffect, useRef, useState } from "react";

import { Card } from "./card";

interface RendererProps {
  value: string,
  userHtml: string,
  permissions?: string
}

export default function Renderer({ value, userHtml, permissions }: RendererProps) {
  const iFrameRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  const sandbox = permissions ?? 'allow-scripts';

  const createFrameContent = useCallback(() => {
    const safeHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { 
              margin: 0;
              padding: 16px;
              box-sizing: border-box;
              font-family: system-ui;
            }
          </style>
        </head>
        <body>
          <div id="user-content">
            ${userHtml}
          </div>
          
          <script>
            // API for sending messages to parent
            window.sendToParent = function(type, payload) {
              window.parent.postMessage({
                type: type,
                payload: payload
              }, '*');
            };

            // Handle incoming messages
            window.addEventListener('message', (event) => {
              // IMPORTANT: Validate origin in production
              // if (event.origin !== "YOUR_TRUSTED_ORIGIN") return;
              
              try {
                const { type, payload } = event.data;
                
                switch(type) {
                  case 'INIT_DATA':
                    // Safely expose data to user's code
                    window.userData = JSON.parse(JSON.stringify(payload));
                    
                    // Run user initialization if defined
                    if (typeof window.onDataReceived === 'function') {
                      window.onDataReceived(window.userData);
                    }
                    break;
                    
                  case 'UPDATE_DATA':
                    // Handle data updates
                    window.userData = JSON.parse(JSON.stringify(payload));
                    if (typeof window.onDataUpdated === 'function') {
                      window.onDataUpdated(window.userData);
                    }
                    break;
                    
                  default:
                    // Forward other messages to user's message handler
                    if (typeof window.onMessageReceived === 'function') {
                      window.onMessageReceived(type, payload);
                    }
                }
              } catch (error) {
                sendToParent('ERROR', { message: error.message });
              }
            });

            // Signal ready to receive data
            sendToParent('READY');
          </script>
        </body>
      </html>
    `;

    const blob = new Blob([safeHtml], { type: 'text/html' });
    return URL.createObjectURL(blob);
  }, [userHtml]);

  useEffect(() => {
    const iframe = iFrameRef.current;
    if (!iframe) return;

    const handleMessage = (event: MessageEvent) => {
      // IMPORTANT: Validate origin in production
      // if (event.origin !== "YOUR_TRUSTED_ORIGIN") return;

      const { type, payload } = event.data;

      switch (type) {
        case 'READY':
          // Send initial data
          console.log('INIT_DATA', value);
          iframe.contentWindow?.postMessage({
            type: 'INIT_DATA',
            payload: value
          }, '*');
          break;

        case 'ERROR':
          console.error('Iframe error:', payload.message);
          setError(payload.message);
          break;

        default:
          // Forward other messages to parent handler
          console.log('default', type, payload);
      }
    };

    window.addEventListener('message', handleMessage);

    const blobUrl = createFrameContent();
    iframe.src = blobUrl;

    return () => {
      window.removeEventListener('message', handleMessage);
      URL.revokeObjectURL(blobUrl);
    };
  }, [userHtml, createFrameContent, value]);

  // Update iframe data when parent data changes
  useEffect(() => {
    const iframe = iFrameRef.current;
    if (!iframe || !iframe.contentWindow) return;

    iframe.contentWindow.postMessage({
      type: 'UPDATE_DATA',
      payload: value
    }, '*');
  }, [value]);

  console.log('Renderer', value);

  return (
    <Card className="w-full max-w-4xl">
      <iframe
        ref={iFrameRef}
        className="w-full h-64 border-0"
        sandbox={sandbox}
        title="Custom Visualization"
      />
    </Card>
  );
}
