import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus = "saved" | "saving" | "error";
type SaveOperation = () => Promise<unknown>;
type QueuedSave = { timer: ReturnType<typeof setTimeout>; operation: SaveOperation };

export function useAutosaveQueue(delay = 350) {
  const [status, setStatus] = useState<AutosaveStatus>("saved");
  const queued = useRef(new Map<string, QueuedSave>());
  const failed = useRef(new Map<string, SaveOperation>());
  const chain = useRef(Promise.resolve());
  const active = useRef(0);
  const mounted = useRef(true);

  const updateSettledStatus = useCallback(() => {
    if (!mounted.current) return;
    if (failed.current.size > 0) setStatus("error");
    else if (queued.current.size > 0 || active.current > 0) setStatus("saving");
    else setStatus("saved");
  }, []);

  const run = useCallback((key: string, operation: SaveOperation) => {
    active.current += 1;
    chain.current = chain.current.then(async () => {
      try {
        await operation();
        failed.current.delete(key);
      } catch {
        failed.current.set(key, operation);
      } finally {
        active.current -= 1;
        updateSettledStatus();
      }
    });
  }, [updateSettledStatus]);

  const schedule = useCallback((key: string, operation: SaveOperation) => {
    const previous = queued.current.get(key);
    if (previous) clearTimeout(previous.timer);
    failed.current.delete(key);
    setStatus("saving");
    const timer = setTimeout(() => {
      queued.current.delete(key);
      run(key, operation);
    }, delay);
    queued.current.set(key, { timer, operation });
  }, [delay, run]);

  const flush = useCallback(async () => {
    const pending = [...queued.current.entries()];
    queued.current.clear();
    pending.forEach(([key, item]) => {
      clearTimeout(item.timer);
      run(key, item.operation);
    });
    await chain.current;
    updateSettledStatus();
    return failed.current.size === 0;
  }, [run, updateSettledStatus]);

  const retry = useCallback(async () => {
    const retries = [...failed.current.entries()];
    failed.current.clear();
    setStatus("saving");
    retries.forEach(([key, operation]) => run(key, operation));
    await chain.current;
    updateSettledStatus();
  }, [run, updateSettledStatus]);

  useEffect(() => () => {
    mounted.current = false;
    queued.current.forEach((item) => clearTimeout(item.timer));
    queued.current.clear();
  }, []);

  return { status, schedule, flush, retry };
}
