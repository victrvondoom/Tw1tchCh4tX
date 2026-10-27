import { useEffect, useState } from 'react';
import { ServerMessageSchema, type GameState } from '@prism/shared';
export function useArena() {
  const [state, setState] = useState<GameState | null>(null),
    [connection, setConnection] = useState('connecting');
  useEffect(() => {
    let stopped = false,
      socket: WebSocket | undefined,
      timer: ReturnType<typeof setTimeout>,
      attempts = 0;
    const connect = () => {
      if (stopped) return;
      const ws = new WebSocket(
        `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`,
      );
      socket = ws;
      ws.onopen = () => {
        attempts = 0;
        setConnection('connected');
      };
      ws.onmessage = (e) => {
        try {
          setState(ServerMessageSchema.parse(JSON.parse(String(e.data))).state);
        } catch {
          ws.close();
        }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        if (!stopped) {
          setConnection('disconnected');
          timer = setTimeout(connect, Math.min(10000, 500 * 2 ** attempts++));
        }
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, []);
  return { state, connection };
}
