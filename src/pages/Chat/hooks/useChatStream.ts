import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { chatCancel, chatStream, type ChatStreamRequest } from "@/services/chat";

export interface StreamCallbacks {
  onDelta: (delta: string, thinkingSoFar: string) => void;
  onThinking: (delta: string) => void;
  onDone: (finalContent: string, finalThinking: string) => void;
  onError: (message: string) => void;
}

interface StreamEvent {
  requestId: string;
  delta?: string;
  done: boolean;
  error?: string;
  thinkingDelta?: string;
}

export function useChatStream() {
  const [streaming, setStreaming] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [thinkingBuffer, setThinkingBuffer] = useState("");
  const callbacksRef = useRef<StreamCallbacks | null>(null);
  const streamBufferRef = useRef("");
  const thinkingBufferRef = useRef("");
  const requestIdRef = useRef<string | null>(null);
  const streamingRef = useRef(false);

  useEffect(() => {
    if (!requestId) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    listen<StreamEvent>("chat-stream", (event) => {
      if (cancelled) return;
      const payload = event.payload;
      if (payload.requestId !== requestId) return;
      const cbs = callbacksRef.current;
      if (payload.error) {
        cbs?.onError(payload.error);
        setStreaming(false);
        streamingRef.current = false;
        setRequestId(null);
        requestIdRef.current = null;
        return;
      }
      if (payload.thinkingDelta) {
        thinkingBufferRef.current += payload.thinkingDelta;
        setThinkingBuffer(thinkingBufferRef.current);
        cbs?.onThinking(payload.thinkingDelta);
      }
      if (payload.delta) {
        streamBufferRef.current += payload.delta;
        cbs?.onDelta(streamBufferRef.current, thinkingBufferRef.current);
      }
      if (payload.done) {
        const finalContent = streamBufferRef.current;
        const finalThinking = thinkingBufferRef.current;
        setStreaming(false);
        streamingRef.current = false;
        setRequestId(null);
        requestIdRef.current = null;
        cbs?.onDone(finalContent, finalThinking);
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [requestId]);

  const start = useCallback(async (request: Omit<ChatStreamRequest, "requestId">, callbacks: StreamCallbacks) => {
    const id =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    callbacksRef.current = callbacks;
    streamBufferRef.current = "";
    thinkingBufferRef.current = "";
    setThinkingBuffer("");
    setStreaming(true);
    streamingRef.current = true;
    setRequestId(id);
    requestIdRef.current = id;
    try {
      await chatStream({ ...request, requestId: id });
    } catch (err) {
      setStreaming(false);
      streamingRef.current = false;
      setRequestId(null);
      requestIdRef.current = null;
      throw err;
    }
    return id;
  }, []);

  const stop = useCallback(async () => {
    const id = requestIdRef.current;
    if (!id) return;
    await chatCancel(id);
    setStreaming(false);
    streamingRef.current = false;
    setRequestId(null);
    requestIdRef.current = null;
    streamBufferRef.current = "";
    thinkingBufferRef.current = "";
  }, []);

  useEffect(() => {
    return () => {
      if (streamingRef.current && requestIdRef.current) {
        chatCancel(requestIdRef.current).catch(() => {});
      }
    };
  }, []);

  return { streaming, thinkingBuffer, start, stop };
}
