// 工具：点/轨迹处理 + 重采样 + DTW + 阈值计算
export type Point = { x: number; y: number; t?: number; p?: number };
export type Stroke = Point[]; // 一笔
export type Signature = Stroke[]; // 多笔集合

const RESAMPLE_POINTS = 128;

// 将多笔 stroke 展平为连续点序列（去掉分隔符）
export function flattenPoints(sig: Signature): Point[] {
  return sig.flat();
}

// 归一化（平移居中 + 等比缩放到基准尺度）并沿路径重采样为固定点数
export function normalizeAndResample(sig: Signature, targetN = RESAMPLE_POINTS): number[][] {
  const raw = flattenPoints(sig);
  if (raw.length === 0) return [];

  // 只用 x,y；保留时间/压力可选
  const pts = raw.map(p => ({ x: p.x, y: p.y }));

  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = (maxX - minX) || 1;
  const height = (maxY - minY) || 1;
  const scale = Math.max(width, height);

  const centered = pts.map(p => ({
    x: (p.x - minX - width / 2) / scale,
    y: (p.y - minY - height / 2) / scale
  }));

  // cumulative distances
  const D: number[] = [0];
  for (let i = 1; i < centered.length; i++) {
    const dx = centered[i].x - centered[i - 1].x;
    const dy = centered[i].y - centered[i - 1].y;
    D.push(D[D.length - 1] + Math.hypot(dx, dy));
  }
  const total = D[D.length - 1] || 1;
  const out: number[][] = [];
  for (let i = 0; i < targetN; i++) {
    const t = (i / (targetN - 1)) * total;
    // find segment j where D[j] <= t <= D[j+1]
    let j = 0;
    while (j < D.length - 1 && D[j + 1] < t) j++;
    if (j === D.length - 1) {
      out.push([centered[centered.length - 1].x, centered[centered.length - 1].y]);
    } else {
      const denom = (D[j + 1] - D[j]) || 1;
      const dt = (t - D[j]) / denom;
      const x = centered[j].x + dt * (centered[j + 1].x - centered[j].x);
      const y = centered[j].y + dt * (centered[j + 1].y - centered[j].y);
      out.push([x, y]);
    }
  }
  return out;
}

// DTW 距离（二维）
export function dtwDistance(a: number[][], b: number[][]): number {
  const n = a.length, m = b.length;
  const INF = 1e12;
  // use 2-row optimization to reduce memory
  const prev = new Float64Array(m + 1);
  const cur = new Float64Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = INF;
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    cur[0] = INF;
    for (let j = 1; j <= m; j++) {
      const dx = a[i - 1][0] - b[j - 1][0];
      const dy = a[i - 1][1] - b[j - 1][1];
      const cost = Math.hypot(dx, dy);
      const minPrev = Math.min(prev[j], cur[j - 1], prev[j - 1]);
      cur[j] = cost + minPrev;
    }
    // copy cur -> prev
    for (let j = 0; j <= m; j++) prev[j] = cur[j];
  }
  return prev[m];
}

export function compareSignatures(sigA: Signature, sigB: Signature): number {
  const vA = normalizeAndResample(sigA);
  const vB = normalizeAndResample(sigB);
  if (vA.length === 0 || vB.length === 0) return Infinity;
  const d = dtwDistance(vA, vB);
  // 返回每点平均距离作为可比指标
  return d / vA.length;
}

// 阈值计算：pairwise mean + k * std
export function computeThreshold(enrollments: Signature[], k = 2.0): { threshold: number; mean: number; std: number } | null {
  if (enrollments.length < 2) return null;
  const dists: number[] = [];
  for (let i = 0; i < enrollments.length; i++) {
    for (let j = i + 1; j < enrollments.length; j++) {
      const d = compareSignatures(enrollments[i], enrollments[j]);
      dists.push(d);
    }
  }
  const mean = dists.reduce((a, b) => a + b, 0) / dists.length;
  const variance = dists.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / dists.length;
  const std = Math.sqrt(variance);
  return { threshold: mean + k * std, mean, std };
}
