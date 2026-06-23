import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncLoadResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

/**
 * 替代手写的 `useEffect + setLoading + try/await/finally`。
 *
 * 注意：loader 是 reload 的依赖，调用方需要用 useCallback 或在 deps 数组里
 * 列出 loader 的依赖项，否则每次渲染都会重新拉取。
 *
 * @param loader 异步加载函数
 * @param deps 依赖数组；变化时自动重新加载
 */
export function useAsyncLoad<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
): AsyncLoadResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const seqRef = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(() => {
    const seq = ++seqRef.current;
    setLoading(true);
    setError(null);
    loaderRef.current()
      .then((value) => {
        if (seqRef.current !== seq) return;
        setData(value);
      })
      .catch((err) => {
        if (seqRef.current !== seq) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (seqRef.current !== seq) return;
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload: run };
}
