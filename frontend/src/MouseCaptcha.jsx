import { useEffect, useMemo, useRef, useState } from "react";

const TARGET_RADIUS = 28;
const MIN_MOVES = 25;
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:4000";
const EMPTY_FEATURES = {
  total_time: 0,
  number_of_moves: 0,
  number_of_clicks: 0,
  average_speed: 0,
  max_speed: 0,
  pause_count: 0,
  path_length: 0,
};
const FEATURE_ROWS = [
  ["total_time", "ms"],
  ["number_of_moves", ""],
  ["number_of_clicks", ""],
  ["average_speed", "px/ms"],
  ["max_speed", "px/ms"],
  ["pause_count", ""],
  ["path_length", "px"],
];

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function makeMouseEvent(event, bounds, type) {
  return {
    type,
    x: Math.round(event.clientX - bounds.left),
    y: Math.round(event.clientY - bounds.top),
    t: Math.round(performance.now()),
  };
}

function buildFeatures(rawEvents) {
  const moveEvents = rawEvents.filter((event) => event.type === "move");
  const movementEvents = rawEvents.filter((event) => event.type !== "click");

  if (rawEvents.length < 2 || movementEvents.length < 2) {
    return {
      ...EMPTY_FEATURES,
      number_of_moves: moveEvents.length,
      number_of_clicks: rawEvents.filter((event) => event.type === "click").length,
    };
  }

  let path_length = 0;
  let max_speed = 0;
  let pause_count = 0;

  for (let index = 1; index < movementEvents.length; index += 1) {
    const current = movementEvents[index];
    const previous = movementEvents[index - 1];
    const segment = distance(current, previous);
    const deltaMs = Math.max(current.t - previous.t, 1);
    const speed = segment / deltaMs;

    path_length += segment;
    max_speed = Math.max(max_speed, speed);

    if (deltaMs > 120 && segment < 3) {
      pause_count += 1;
    }
  }

  const total_time = rawEvents[rawEvents.length - 1].t - rawEvents[0].t;

  return {
    total_time,
    number_of_moves: moveEvents.length,
    number_of_clicks: rawEvents.filter((event) => event.type === "click").length,
    average_speed: Number((path_length / Math.max(total_time, 1)).toFixed(3)),
    max_speed: Number(max_speed.toFixed(3)),
    pause_count,
    path_length: Math.round(path_length),
  };
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function makeBotTrace(width, height) {
  const start = { x: 54, y: Math.round(height - 54), t: 0 };
  const end = { x: Math.round(width - 70), y: 72, t: 150 };
  const events = [{ type: "click", ...start }];
  const steps = 14;

  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    const zigzag = index % 2 === 0 ? 42 : -42;
    const x = Math.round(start.x + (end.x - start.x) * progress);
    const y = Math.round(start.y + (end.y - start.y) * progress + zigzag);

    events.push({
      type: "move",
      x: clamp(x, 20, width - 20),
      y: clamp(y, 20, height - 20),
      t: Math.round(10 + progress * 130),
    });
  }

  events.push({ type: "release", ...end });
  return events;
}

function formatFeatureValue(features, key, unit) {
  const value = features[key];
  return unit ? `${value} ${unit}` : value;
}

function FeatureMetrics({ events, features, title }) {
  return (
    <aside className="metrics-panel">
      <h2>{title}</h2>
      <dl>
        <div>
          <dt>Points</dt>
          <dd>{events.length}</dd>
        </div>
        {FEATURE_ROWS.map(([key, unit]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{formatFeatureValue(features, key, unit)}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

export default function MouseCaptcha() {
  const boardRef = useRef(null);
  const botBoardRef = useRef(null);
  const botTimerRef = useRef(null);
  const rawEventsRef = useRef([]);
  const botEventsRef = useRef([]);
  const [rawEvents, setRawEvents] = useState([]);
  const [botEvents, setBotEvents] = useState([]);
  const [botStatus, setBotStatus] = useState("idle");
  const [isTracking, setIsTracking] = useState(false);
  const [status, setStatus] = useState("idle");
  const [target, setTarget] = useState({ x: 430, y: 170 });
  const [lastResult, setLastResult] = useState(null);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [boardSize, setBoardSize] = useState({ width: 640, height: 320 });
  const [botBoardSize, setBotBoardSize] = useState({ width: 640, height: 260 });

  const features = useMemo(() => buildFeatures(rawEvents), [rawEvents]);
  const botFeatures = useMemo(() => buildFeatures(botEvents), [botEvents]);
  const movementEvents = rawEvents.filter((event) => event.type !== "click");
  const botMovementEvents = botEvents.filter((event) => event.type !== "click");
  const trail = movementEvents.map((point) => `${point.x},${point.y}`).join(" ");
  const botTrail = botMovementEvents.map((point) => `${point.x},${point.y}`).join(" ");
  const latest = movementEvents[movementEvents.length - 1];
  const botLatest = botMovementEvents[botMovementEvents.length - 1];
  const botPythonSample = `BOT_SAMPLE = ${JSON.stringify(botFeatures, null, 2)}`;

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return undefined;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBoardSize({
        width: Math.round(width),
        height: Math.round(height),
      });
    });

    observer.observe(board);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const board = botBoardRef.current;
    if (!board) return undefined;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBotBoardSize({
        width: Math.round(width),
        height: Math.round(height),
      });
    });

    observer.observe(board);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (botTimerRef.current) {
        window.clearInterval(botTimerRef.current);
      }
    },
    [],
  );

  function moveTarget() {
    const board = boardRef.current;
    if (!board) return;

    const bounds = board.getBoundingClientRect();
    setTarget({
      x: Math.round(clamp(Math.random() * bounds.width, 80, bounds.width - 80)),
      y: Math.round(clamp(Math.random() * bounds.height, 70, bounds.height - 70)),
    });
  }

  function resetTracker(nextStatus = "idle") {
    rawEventsRef.current = [];
    setRawEvents([]);
    setIsTracking(false);
    setStatus(nextStatus);
    setLastResult(null);
    setSaveStatus("idle");
    moveTarget();
  }

  function startTracking(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const clickEvent = makeMouseEvent(event, bounds, "click");
    event.currentTarget.setPointerCapture(event.pointerId);
    rawEventsRef.current = [clickEvent];
    setRawEvents(rawEventsRef.current);
    setIsTracking(true);
    setStatus("tracking");
    setLastResult(null);
    setSaveStatus("idle");
  }

  function trackMove(event) {
    if (!isTracking) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const nextEvent = makeMouseEvent(event, bounds, "move");
    const previous = rawEventsRef.current[rawEventsRef.current.length - 1];

    if (previous && previous.x === nextEvent.x && previous.y === nextEvent.y) {
      return;
    }

    rawEventsRef.current = [...rawEventsRef.current, nextEvent];
    setRawEvents(rawEventsRef.current);
  }

  function stopTracking(event) {
    if (!isTracking) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const releaseEvent = makeMouseEvent(event, bounds, "release");
    const nextRawEvents = [...rawEventsRef.current, releaseEvent];
    const nextFeatures = buildFeatures(nextRawEvents);
    const hitTarget = distance(releaseEvent, target) <= TARGET_RADIUS + 8;
    const enoughData = nextFeatures.number_of_moves >= MIN_MOVES;
    const result = hitTarget && enoughData ? "verified" : "retry";

    rawEventsRef.current = nextRawEvents;
    setRawEvents(nextRawEvents);
    setIsTracking(false);
    setStatus(result);
    setLastResult({
      label: result,
      hitTarget,
      enoughData,
      rawEvents: nextRawEvents,
      features: nextFeatures,
      createdAt: new Date().toISOString(),
    });
  }

  function exportSample() {
    const sample = lastResult ?? {
      label: status,
      rawEvents,
      features,
      createdAt: new Date().toISOString(),
    };

    downloadJson("trustcap-mouse-sample.json", sample);
  }

  async function saveTrainingSample() {
    if (!lastResult || lastResult.label !== "verified") return;

    setSaveStatus("saving");

    try {
      const response = await fetch(`${API_BASE_URL}/api/samples`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          label: "normal",
          features: lastResult.features,
          metadata: {
            hitTarget: lastResult.hitTarget,
            enoughData: lastResult.enoughData,
            createdAt: lastResult.createdAt,
          },
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Could not save sample");
      }

      setSaveStatus("saved");
    } catch (error) {
      setSaveStatus("error");
      console.error(error);
    }
  }

  function runBotTrace() {
    if (botTimerRef.current) {
      window.clearInterval(botTimerRef.current);
    }

    const simulatedEvents = makeBotTrace(botBoardSize.width, botBoardSize.height);
    let index = 0;

    botEventsRef.current = [];
    setBotEvents([]);
    setBotStatus("running");

    botTimerRef.current = window.setInterval(() => {
      botEventsRef.current = [...botEventsRef.current, simulatedEvents[index]];
      setBotEvents(botEventsRef.current);
      index += 1;

      if (index >= simulatedEvents.length) {
        window.clearInterval(botTimerRef.current);
        botTimerRef.current = null;
        setBotStatus("complete");
      }
    }, 45);
  }

  function resetBotTrace() {
    if (botTimerRef.current) {
      window.clearInterval(botTimerRef.current);
      botTimerRef.current = null;
    }

    botEventsRef.current = [];
    setBotEvents([]);
    setBotStatus("idle");
  }

  function exportBotSample() {
    downloadJson("trustcap-bot-sample.json", {
      label: "bot_simulation",
      rawEvents: botEvents,
      features: botFeatures,
      createdAt: new Date().toISOString(),
    });
  }

  return (
    <>
      <section className="tracker-layout">
        <div className="tracker-panel">
          <div className="tracker-toolbar">
            <div>
              <h2>Trace to verify</h2>
              <p>
                Press inside the pad, move naturally to the target, then release.
              </p>
            </div>
            <div className={`status-pill ${status}`}>{status}</div>
          </div>

          <div
            ref={boardRef}
            className="tracker-board"
            onPointerDown={startTracking}
            onPointerMove={trackMove}
            onPointerUp={stopTracking}
            onPointerCancel={() => resetTracker("idle")}
            role="application"
            aria-label="Mouse tracking verification pad"
          >
            <svg
              className="trail-layer"
              viewBox={`0 0 ${boardSize.width} ${boardSize.height}`}
              preserveAspectRatio="none"
            >
              {trail && <polyline points={trail} className="movement-trail" />}
            </svg>

            <div
              className="target"
              style={{ left: `${target.x}px`, top: `${target.y}px` }}
              aria-hidden="true"
            />

            {latest && (
              <div
                className="cursor-dot"
                style={{ left: `${latest.x}px`, top: `${latest.y}px` }}
              />
            )}

            <div className="board-hint">
              {isTracking ? "Keep moving to the target" : "Hold and trace"}
            </div>
          </div>

          <div className="tracker-actions">
            <button className="secondary-button" type="button" onClick={() => resetTracker("idle")}>
              Reset
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={exportSample}
              disabled={rawEvents.length === 0}
            >
              Export JSON
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={saveTrainingSample}
              disabled={
                !lastResult || lastResult.label !== "verified" || saveStatus === "saving"
              }
            >
              {saveStatus === "saving" ? "Saving..." : "Save as normal"}
            </button>
          </div>
          {saveStatus !== "idle" && (
            <p className={`save-message ${saveStatus}`}>
              {saveStatus === "saved"
                ? "Saved to normal.csv for future model training."
                : saveStatus === "error"
                  ? "Backend save failed. Make sure the backend server is running."
                  : "Sending features to backend..."}
            </p>
          )}
        </div>

        <FeatureMetrics events={rawEvents} features={features} title="Live features" />
      </section>

      <section className="tracker-layout bot-layout">
        <div className="tracker-panel bot-panel">
          <div className="tracker-toolbar">
            <div>
              <h2>Bot simulation</h2>
              <p>
                Runs a fast scripted trace through the same feature extractor.
              </p>
            </div>
            <div className={`status-pill ${botStatus}`}>{botStatus}</div>
          </div>

          <div
            ref={botBoardRef}
            className="tracker-board bot-board"
            role="img"
            aria-label="Simulated bot mouse trace"
          >
            <svg
              className="trail-layer"
              viewBox={`0 0 ${botBoardSize.width} ${botBoardSize.height}`}
              preserveAspectRatio="none"
            >
              {botTrail && <polyline points={botTrail} className="movement-trail bot-trail" />}
            </svg>

            <div
              className="target"
              style={{
                left: `${botBoardSize.width - 70}px`,
                top: "72px",
              }}
              aria-hidden="true"
            />

            {botLatest && (
              <div
                className="cursor-dot bot-cursor"
                style={{ left: `${botLatest.x}px`, top: `${botLatest.y}px` }}
              />
            )}

            <div className="board-hint">
              {botStatus === "running" ? "Scripted trace running" : "Bot test pad"}
            </div>
          </div>

          <div className="tracker-actions">
            <button className="primary-button" type="button" onClick={runBotTrace}>
              Activate bot
            </button>
            <button className="secondary-button" type="button" onClick={resetBotTrace}>
              Reset bot
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={exportBotSample}
              disabled={botEvents.length === 0}
            >
              Export bot JSON
            </button>
          </div>

          <div className="sample-code-block">
            <h3>predict.py sample</h3>
            <pre>{botPythonSample}</pre>
          </div>
        </div>

        <FeatureMetrics events={botEvents} features={botFeatures} title="Bot features" />
      </section>
    </>
  );
}
