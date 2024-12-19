'use client';

import VNCClient from "./vnc-client";

export default function VNC() {
  return (
    <div className="w-full h-full">
      <VNCClient
        url="ws://localhost:6080/ws/eca4d116-7309-44ea-aaba-379d02818d62"
        credentials={{
          username: 'admin',
          password: 'password'
        }}
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
    </div>);
}