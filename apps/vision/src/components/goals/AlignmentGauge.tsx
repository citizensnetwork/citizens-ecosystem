"use client";

import { getAlignmentColour } from "@/lib/metrics/alignment";

interface AlignmentGaugeProps {
  score: number;
  label?: string;
  size?: number;
}

export function AlignmentGauge({
  score,
  label = "Organisation Alignment",
  size = 180,
}: AlignmentGaugeProps) {
  const colour = getAlignmentColour(score);
  const radius = (size - 20) / 2;
  const circumference = Math.PI * radius; // half circle
  const offset = circumference - (score / 100) * circumference;
  const cx = size / 2;
  const cy = size / 2 + 10;

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size / 2 + 30}
        viewBox={`0 0 ${size} ${size / 2 + 30}`}
        aria-label={`${label}: ${score.toFixed(0)}%`}
        role="img"
      >
        {/* Background arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="var(--border)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Score arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke={colour}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
        {/* Score text */}
        <text
          x={cx}
          y={cy - 15}
          textAnchor="middle"
          className="text-2xl font-bold"
          fill="var(--text-primary)"
          fontSize="28"
        >
          {score.toFixed(0)}
        </text>
        <text
          x={cx}
          y={cy + 5}
          textAnchor="middle"
          fill="var(--text-secondary)"
          fontSize="12"
        >
          / 100
        </text>
      </svg>
      <p className="mt-1 text-sm text-text-secondary">{label}</p>
    </div>
  );
}
