import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

/**
 * 像 useState，但持久化到 localStorage。
 *
 * 解析失败时打印 warning + 回退到 initial，不静默吞错（这是之前 Settings 那批
 * `.unwrap_or_default()` 类问题的对应教训）。
 *
 * 注意：只在初始化时读 localStorage；其他 tab/窗口变更不会自动同步。
 */
export function useLocalStorageState<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initial;
      return JSON.parse(raw) as T;
    } catch (err) {
      console.warn(`useLocalStorageState: 解析 ${key} 失败，回退到默认值`, err);
      return initial;
    }
  });

  const setAndPersist = useCallback<Dispatch<SetStateAction<T>>>(
    (updater) => {
      setValue((prev) => {
        const next = typeof updater === "function"
          ? (updater as (prev: T) => T)(prev)
          : updater;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch (err) {
          console.warn(`useLocalStorageState: 写入 ${key} 失败`, err);
        }
        return next;
      });
    },
    [key],
  );

  return [value, setAndPersist];
}
