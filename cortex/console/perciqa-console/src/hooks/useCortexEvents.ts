"use client";
import { useEffect, useReducer } from "react";
import { consoleReducer, type ConsoleState } from "@/state/cortexStore";

const url = process.env.NEXT_PUBLIC_CORTEX_WS_EVENTS ?? "ws://localhost:8080/ws/events";

export function useCortexEvents() {
  const [state, dispatch] = useReducer(consoleReducer, { articles: [], connected: false } as ConsoleState);
  useEffect(() => {
    const ws = new WebSocket(url);
    ws.onopen = () => dispatch({ type: "connected" });
    ws.onclose = () => dispatch({ type: "disconnected" });
    ws.onmessage = (ev: MessageEvent) => {
      try {
        const env = JSON.parse(ev.data);
        if (env.type === "event") dispatch({ type: "event", env: env.payload });
      } catch { /* ignore */ }
    };
    return () => ws.close();
  }, []);
  return state;
}
