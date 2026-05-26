// Polling loop: runs `poll` every `intervalSec`, routes errors to `onError`
// without killing the loop, fires once immediately on start, and skips
// overlapping ticks. Pure runtime utility — use-live-mode.ts wires it up.

export type LivePollerOptions = {
  // Minimum 1; clamped silently.
  readonly intervalSec: number;
  readonly poll: () => Promise<void>;
  readonly onError?: (err: unknown) => void;
  // Per-poll delay override to align to an external grid (Grafana's eval
  // phase); `null` falls back to the fixed cadence.
  readonly getNextDelayMs?: () => number | null;
};

export type LivePoller = {
  readonly start: () => void;
  readonly stop: () => void;
  readonly setInterval: (sec: number) => void;
  readonly isRunning: () => boolean;
};

export function createLivePoller(opts: LivePollerOptions): LivePoller {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let intervalSec = Math.max(1, opts.intervalSec);
  let inFlight = false;
  let stopped = false;

  const computeDelayMs = (): number => {
    if (opts.getNextDelayMs !== undefined) {
      const supplied = opts.getNextDelayMs();
      if (supplied !== null && supplied > 0) return supplied;
    }
    return intervalSec * 1000;
  };

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(() => {
      void tick();
    }, computeDelayMs());
  };

  const tick = async () => {
    if (inFlight) {
      schedule();
      return;
    }
    inFlight = true;
    try {
      await opts.poll();
    } catch (err) {
      opts.onError?.(err);
    } finally {
      inFlight = false;
      schedule();
    }
  };

  return {
    start() {
      if (timer || !stopped && timer) return;
      stopped = false;
      // Fire immediately so the UI doesn't wait up to one intervalSec for the
      // first alignment slot.
      void tick();
    },
    stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    setInterval(sec: number) {
      intervalSec = Math.max(1, sec);
    },
    isRunning() {
      return timer !== null;
    },
  };
}
