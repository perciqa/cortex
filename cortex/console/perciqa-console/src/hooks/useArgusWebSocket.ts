"use client";
import { useEffect, useRef, useState, useCallback } from "react";

function getWsUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:8000/ws/stream";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/stream`;
}

export type WsEvent = {
  event: string;
  data: Record<string, unknown>;
};

export type WsStatus = "connecting" | "connected" | "disconnected";

export function useArgusWebSocket(onEvent?: (e: WsEvent) => void) {
  const [status, setStatus] = useState<WsStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  const connectRef = useRef<() => void>(() => {});
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    onEventRef.current = onEvent;
  });

  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return;

    setStatus("connecting");
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onopen = () => setStatus("connected");

    ws.onmessage = (msg) => {
      try {
        const payload: WsEvent = JSON.parse(msg.data);
        onEventRef.current?.(payload);
      } catch {
      }
    };

    ws.onclose = () => {
      setStatus("disconnected");
      reconnectRef.current = setTimeout(() => {
        if (mountedRef.current) connectRef.current();
      }, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { status };
}
