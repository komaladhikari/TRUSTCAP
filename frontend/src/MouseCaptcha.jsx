import { useEffect, useMemo, useRef, useState } from "react";

const TARGET_RADIUS = 28;
const MIN_MOVES = 25;
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:4000";

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
      total_time: 0,
      number_of_moves: moveEvents.length,
      number_of_clicks: rawEvents.filter((event) => event.type === "click").length,
      average_speed: 0,
      max_speed: 0,
      pause_count: 0,
      path_length: 0,
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

export default function MouseCaptcha() {
  const boardRef = useRef(null);
  const rawEventsRef = useRef([]);
  const [rawEvents, setRawEvents] = useState([]);
  const [isTracking, setIsTracking] = useState(false);
  const [status, setStatus] = useState("idle");
  const [target, setTarget] = useState({ x: 430, y: 170 });
  const [lastResult, setLastResult] = useState(null);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [boardSize, setBoardSize] = useState({ width: 640, height: 320 });

  const features = useMemo(() => buildFeatures(rawEvents), [rawEvents]);
  const movementEvents = rawEvents.filter((event) => event.type !== "click");
  const trail = movementEvents.map((point) => `${point.x},${point.y}`).join(" ");
  const latest = movementEvents[movementEvents.length - 1];

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

  return (
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

      <aside className="metrics-panel">
        <h2>Live features</h2>
        <dl>
          <div>
            <dt>Points</dt>
            <dd>{rawEvents.length}</dd>
          </div>
          <div>
            <dt>total_time</dt>
            <dd>{features.total_time} ms</dd>
          </div>
          <div>
            <dt>number_of_moves</dt>
            <dd>{features.number_of_moves}</dd>
          </div>
          <div>
            <dt>number_of_clicks</dt>
            <dd>{features.number_of_clicks}</dd>
          </div>
          <div>
            <dt>average_speed</dt>
            <dd>{features.average_speed} px/ms</dd>
          </div>
          <div>
            <dt>max_speed</dt>
            <dd>{features.max_speed} px/ms</dd>
          </div>
          <div>
            <dt>pause_count</dt>
            <dd>{features.pause_count}</dd>
          </div>
          <div>
            <dt>path_length</dt>
            <dd>{features.path_length} px</dd>
          </div>
        </dl>
      </aside>
    </section>
  );
}
