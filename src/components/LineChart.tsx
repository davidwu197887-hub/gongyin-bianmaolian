import { DayPoint } from '../types';

interface Series {
  name: string;
  color: string;
  points: DayPoint[];
  field: 'cash' | 'loan';
}

interface Props {
  series: Series[];
  maxDay: number;
  height?: number;
  markers?: { day: number; label: string }[];
}

/** 轻量 SVG 折线图，无第三方依赖 */
export default function LineChart({ series, maxDay, height = 220, markers = [] }: Props) {
  const W = 560;
  const H = height;
  const padL = 44;
  const padR = 16;
  const padT = 14;
  const padB = 26;

  const allVals = series.flatMap((s) => s.points.map((p) => p[s.field]));
  const minV = Math.min(0, ...allVals);
  const maxV = Math.max(1, ...allVals);
  const range = maxV - minV || 1;

  const x = (day: number) => padL + (day / maxDay) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - minV) / range) * (H - padT - padB);

  const stepLine = (s: Series) => {
    // 阶梯折线（现金余额在事件日跳变）
    const pts = [...s.points].sort((a, b) => a.day - b.day);
    let d = '';
    pts.forEach((p, i) => {
      const px = x(p.day);
      const py = y(p[s.field]);
      if (i === 0) d += `M ${padL} ${py} L ${px} ${py}`;
      else {
        const prevPy = y(pts[i - 1][s.field]);
        d += ` L ${px} ${prevPy} L ${px} ${py}`;
      }
    });
    if (pts.length) d += ` L ${x(maxDay)} ${y(pts[pts.length - 1][s.field])}`;
    return d;
  };

  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => minV + (range * i) / yTicks);

  return (
    <svg role="img" aria-label="现金与融资余额时间序列" viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }}>
      {/* y 轴网格 */}
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="#eef0f2" />
          <text x={padL - 6} y={y(t) + 3} fontSize="10" fill="#868e96" textAnchor="end">
            {t.toFixed(0)}
          </text>
        </g>
      ))}
      {/* 零线 */}
      {minV < 0 && <line x1={padL} y1={y(0)} x2={W - padR} y2={y(0)} stroke="#c7000b" strokeDasharray="3 3" opacity="0.4" />}
      {/* x 轴 */}
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#d4d8dc" />
      {/* 事件标记 */}
      {markers.map((m, i) => (
        <g key={i}>
          <line x1={x(m.day)} y1={padT} x2={x(m.day)} y2={H - padB} stroke="#d4d8dc" strokeDasharray="2 2" />
          <text x={x(m.day)} y={H - padB + 14} fontSize="9" fill="#868e96" textAnchor="middle">
            {m.label}
          </text>
        </g>
      ))}
      {/* 曲线 */}
      {series.map((s, i) => (
        <path key={i} d={stepLine(s)} fill="none" stroke={s.color} strokeWidth="2" />
      ))}
    </svg>
  );
}
