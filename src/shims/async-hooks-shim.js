// 浏览器环境下 node:async_hooks 的最小可工作实现。
// LangChain / LangGraph 用 AsyncLocalStorage 做异步上下文追踪（如 tracing、callback 链）。
// 真正的 ALS 跨异步边界隔离需要 V8 内部支持，浏览器没有；这里实现"同步链 + 微任务链"
// 的简化版本：run 期间 getStore 返回设置的 store，run 结束恢复。
// 对单次 agent.invoke / agent.stream 调用够用，不支持并发 invoke 的隔离。

export class AsyncLocalStorage {
  #store = undefined;

  run(store, callback, ...args) {
    const prev = this.#store;
    this.#store = store;
    try {
      return callback(...args);
    } finally {
      this.#store = prev;
    }
  }

  getStore() {
    return this.#store;
  }

  enterWith(store) {
    this.#store = store;
  }

  disable() {
    this.#store = undefined;
  }

  exit(callback, ...args) {
    const prev = this.#store;
    this.#store = undefined;
    try {
      return callback(...args);
    } finally {
      this.#store = prev;
    }
  }

  static bind(fn) {
    return fn;
  }

  static snapshot() {
    return (cb, ...args) => cb(...args);
  }
}

export class AsyncResource {
  constructor() {}
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.apply(thisArg, args);
  }
  bind(fn) {
    return fn.bind(this);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {}
  static bind(fn) {
    return fn;
  }
}

export const createHook = () => ({
  enable() {
    return this;
  },
  disable() {
    return this;
  },
});

export const executionAsyncId = () => 0;
export const executionAsyncResource = () => ({});
export const triggerAsyncId = () => 0;

export default {
  AsyncLocalStorage,
  AsyncResource,
  createHook,
  executionAsyncId,
  executionAsyncResource,
  triggerAsyncId,
};
