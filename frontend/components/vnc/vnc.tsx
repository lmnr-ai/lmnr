'use client';

import { useState } from "react";

import VNCClient from "./vnc-client";

export default function VNC() {
  const [id, setId] = useState("");

  return (
    <div className="w-full h-full">
      <div className="p-4">
        <input
          type="text"
          value={id}
          onChange={(e) => setId(e.target.value)}
          className="border p-2 rounded mr-2"
          placeholder="Enter VNC ID"
        />
        <button
          onClick={() => setId(id)}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Connect
        </button>
      </div>
      <VNCClient
        url={`wss://api.lmnr.ai/v1/machine/vnc_stream/${id}`}
        onConnect={() => {
          console.log('Connected to VNC server');
        }}
        onDisconnect={() => {
          console.log('Disconnected from VNC server');
        }}
        onError={(error) => {
          console.error('VNC Error:', error);
        }}
      />
    </div>
  );
}
