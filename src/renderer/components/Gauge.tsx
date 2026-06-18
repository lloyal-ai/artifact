import React from 'react'

/**
 * Semicircular needle gauge for context-window (KV) pressure — the live face of
 * the continuous-context moat: ONE shared `llama_context`, branches are seq_ids,
 * the needle climbs as the shared KV fills. Analog instrument-cluster dial on
 * purpose. Zone colours follow the meaning system: teal 0–60 (healthy/local),
 * amber 60–85 (filling — caution), red 85–100 (near the window limit).
 */
export function Gauge({ pct }: { pct: number }): React.ReactElement {
  const cx = 52, cy = 48, r = 38
  const p = Math.max(0, Math.min(100, pct))
  const pt = (v: number, rr: number): [number, number] => {
    const a = Math.PI * (1 - v / 100)
    return [cx + rr * Math.cos(a), cy - rr * Math.sin(a)]
  }
  const arc = (p0: number, p1: number, rr: number): string => {
    const [a, b] = pt(p0, rr), [c, d] = pt(p1, rr)
    return `M ${a} ${b} A ${rr} ${rr} 0 0 1 ${c} ${d}`
  }
  const ticks: React.ReactElement[] = []
  for (let v = 0; v <= 100; v += 10) {
    const [a, b] = pt(v, r + 3), [c, d] = pt(v, r - 2)
    ticks.push(<line key={v} x1={a} y1={b} x2={c} y2={d} stroke="var(--line-2)" strokeWidth={1} />)
  }
  const [nx, ny] = pt(p, r - 7)
  return (
    <div className="gaugewrap" title="Context-window pressure (continuous-context KV)">
      <svg width="118" height="64" viewBox="0 0 104 56">
        <path d={arc(0, 100, r)} fill="none" stroke="var(--bg-3)" strokeWidth={6} strokeLinecap="round" />
        <path d={arc(0, 60, r)} fill="none" stroke="var(--accent)" strokeWidth={6} strokeLinecap="round" />
        <path d={arc(60, 85, r)} fill="none" stroke="var(--warn)" strokeWidth={6} />
        <path d={arc(85, 100, r)} fill="none" stroke="var(--hot)" strokeWidth={6} strokeLinecap="round" />
        {ticks}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={3.2} fill="var(--ink)" />
        <text className="gnum" x={cx} y={34} textAnchor="middle" dominantBaseline="central">
          {Math.round(p)}%
        </text>
      </svg>
      <div className="lab">context</div>
    </div>
  )
}
