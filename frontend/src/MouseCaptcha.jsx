import { useEffect, useMemo, useRef, useState } from "react";

const TARGET_RADIUS = 28;
const MIN_POINTS = 25;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function makePoint(event, bounds) {
  return {
    x: Math.round(event.clientX - bounds.left),
    y: Math.round(event.clientY - bounds.top),
    t: Math.round(performance.now()),
  };
}

function buildFeatures(points) {
  if (points.length < 2) {
    return {
      durationMs: 0,
      pathLength: 0,
      avgSpeed: 0,
      maxSpeed: 0,
      pauses: 0,
      straightness: 0,
    };
  }

  let pathLength = 0;
  let maxSpeed = 0;
  let pauses = 0;

  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[index - 1];
    const segment = distance(current, previous);
    const deltaMs = Math.max(current.t - previous.t, 1);
    const speed = segment / deltaMs;

    pathLength += segment;
    maxSpeed = Math.max(maxSpeed, speed);

    if (deltaMs > 120 && segment < 3) {
      pauses += 1;
    }
  }

  const durationMs = points[points.length - 1].t - points[0].t;
  const directDistance = distance(points[0], points[points.length - 1]);

  return {
    durationMs,
    pathLength: Math.round(pathLength),
    avgSpeed: Number((pathLength / Math.max(durationMs, 1)).toFixed(3)),
    maxSpeed: Number(maxSpeed.toFixed(3)),
    pauses,
    straightness: Number((directDistance / Math.max(pathLength, 1)).toFixed(3)),
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
  const [points, setPoints] = useState([]);
  const [isTracking, setIsTracking] = useState(false);
  const [status, setStatus] = useState("idle");
  const [target, setTarget] = useState({ x: 430, y: 170 });
  const [lastResult, setLastResult] = useState(null);
  const [boardSize, setBoardSize] = useState({ width: 640, height: 320 });

  const features = useMemo(() => buildFeatures(points), [points]);
  const trail = points.map((point) => `${point.x},${point.y}`).join(" ");
  const latest = points[points.length - 1];

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
    setPoints([]);
    setIsTracking(false);
    setStatus(nextStatus);
    setLastResult(null);
    moveTarget();
  }

  function startTracking(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    setPoints([makePoint(event, bounds)]);
    setIsTracking(true);
    setStatus("tracking");
    setLastResult(null);
  }

  function trackMove(event) {
    if (!isTracking) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const nextPoint = makePoint(event, bounds);

    setPoints((currentPoints) => {
      const previous = currentPoints[currentPoints.length - 1];
      if (previous && previous.x === nextPoint.x && previous.y === nextPoint.y) {
        return currentPoints;
      }

      return [...currentPoints, nextPoint];
    });
  }

  function stopTracking(event) {
    if (!isTracking) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const endPoint = makePoint(event, bounds);
    const nextPoints = [...points, endPoint];
    const hitTarget = distance(endPoint, target) <= TARGET_RADIUS + 8;
    const enoughData = nextPoints.length >= MIN_POINTS;
    const result = hitTarget && enoughData ? "verified" : "retry";

    setPoints(nextPoints);
    setIsTracking(false);
    setStatus(result);
    setLastResult({
      label: result,
      hitTarget,
      enoughData,
      points: nextPoints,
      features: buildFeatures(nextPoints),
      createdAt: new Date().toISOString(),
    });
  }

  function exportSample() {
    const sample = lastResult ?? {
      label: status,
      points,
      features,
      createdAt: new Date().toISOString(),
    };

    downloadJson("trustcap-mouse-sample.json", sample);
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
          <button type="button" onClick={() => resetTracker("idle")}>
            Reset
          </button>
          <button type="button" onClick={exportSample} disabled={points.length === 0}>
            Export JSON
          </button>
        </div>
      </div>

      <aside className="metrics-panel">
        <h2>Live features</h2>
        <dl>
          <div>
            <dt>Points</dt>
            <dd>{points.length}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{features.durationMs} ms</dd>
          </div>
          <div>
            <dt>Path length</dt>
            <dd>{features.pathLength} px</dd>
          </div>
          <div>
            <dt>Average speed</dt>
            <dd>{features.avgSpeed} px/ms</dd>
          </div>
          <div>
            <dt>Max speed</dt>
            <dd>{features.maxSpeed} px/ms</dd>
          </div>
          <div>
            <dt>Straightness</dt>
            <dd>{features.straightness}</dd>
          </div>
          <div>
            <dt>Pauses</dt>
            <dd>{features.pauses}</dd>
          </div>
        </dl>
      </aside>
    </section>
  );
}
