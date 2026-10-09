import type { ThermalSample } from "../lib/thermalModel";

const chartHeight = 260;
const tickIntervalsMinutes = [1, 5, 10, 15, 30, 60, 120, 240];

function timeLabel(startTime: string | undefined, elapsedSeconds: number) {
  if (!startTime) return `${Math.floor(elapsedSeconds / 60)} mnt`;
  const startDate = new Date(startTime);
  const date = new Date(startDate.getTime() + elapsedSeconds * 1000);
  const time = new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  if (date.toDateString() === startDate.toDateString()) return time;
  const day = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
  return `${day} ${time}`;
}

export default function TemperatureChart({
  samples,
  range,
  startTime,
}: {
  samples: ThermalSample[];
  range: { min: number; max: number; label: string };
  startTime?: string;
}) {
  if (samples.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted">
        Jalankan simulasi untuk melihat perubahan suhu.
      </div>
    );
  }

  const lastSample = samples[samples.length - 1];
  const durationSeconds = Math.max(1, lastSample.elapsedSeconds);
  const durationMinutes = durationSeconds / 60;
  const chartWidth = Math.max(760, 104 + durationMinutes * 20);
  const left = 58;
  const right = chartWidth - 24;
  const top = 18;
  const bottom = 218;
  const temperatures = samples.reduce(
    (values, sample) => [
      Math.min(values[0], sample.airC, sample.productC, sample.sensorC),
      Math.max(values[1], sample.airC, sample.productC, sample.sensorC),
    ],
    [range.min, range.max],
  );
  const min = temperatures[0] - 1;
  const max = temperatures[1] + 1;
  const x = (elapsedSeconds: number) =>
    left + (elapsedSeconds / durationSeconds) * (right - left);
  const y = (value: number) =>
    bottom - ((value - min) / Math.max(1, max - min)) * (bottom - top);
  const path = (read: (sample: ThermalSample) => number) =>
    samples
      .map(
        (sample, index) =>
          `${index === 0 ? "M" : "L"} ${x(sample.elapsedSeconds).toFixed(1)} ${y(read(sample)).toFixed(1)}`,
      )
      .join(" ");
  const pixelsPerMinute = (right - left) / durationMinutes;
  const desiredInterval = 110 / pixelsPerMinute;
  const tickInterval = tickIntervalsMinutes.find(
    (interval) => interval >= desiredInterval,
  ) ?? 240;
  const tickSeconds = tickInterval * 60;
  const timeTicks = [0];
  for (
    let second = tickSeconds;
    second < durationSeconds;
    second += tickSeconds
  ) {
    timeTicks.push(second);
  }
  if (timeTicks[timeTicks.length - 1] !== durationSeconds) {
    timeTicks.push(durationSeconds);
  }
  const rangeTop = Math.max(top, y(range.max));
  const rangeBottom = Math.min(bottom, y(range.min));

  return (
    <div>
      <div
        className="overflow-x-auto overscroll-x-contain touch-pan-x"
        aria-label="Grafik dapat digeser ke kanan dan kiri untuk melihat riwayat waktu"
      >
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          style={{ width: chartWidth, height: chartHeight }}
          role="img"
          aria-label={`Grafik suhu udara, inti produk, dan sensor. Rentang target ${range.label}. Sumbu waktu menggunakan jam dan menit.`}
        >
          <rect
            x={left}
            y={rangeTop}
            width={right - left}
            height={Math.max(0, rangeBottom - rangeTop)}
            fill="#e4f7ef"
          />
          {[min, (min + max) / 2, max].map((tick) => (
            <g key={tick}>
              <line
                x1={left}
                x2={right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="#e6e6e6"
              />
              <text
                x={left - 8}
                y={y(tick) + 4}
                textAnchor="end"
                fontSize="11"
                fill="#666"
              >
                {tick.toFixed(1)}°
              </text>
            </g>
          ))}
          <line
            x1={left}
            x2={right}
            y1={bottom}
            y2={bottom}
            stroke="#999"
          />
          {timeTicks.map((second) => (
            <g key={second}>
              <line
                x1={x(second)}
                x2={x(second)}
                y1={bottom}
                y2={bottom + 5}
                stroke="#777"
              />
              <text
                x={x(second)}
                y={bottom + 21}
                textAnchor={
                  second === 0
                    ? "start"
                    : second === durationSeconds
                      ? "end"
                      : "middle"
                }
                fontSize="11"
                fill="#555"
              >
                {timeLabel(startTime, second)}
              </text>
            </g>
          ))}
          <path d={path((sample) => sample.airC)} fill="none" stroke="#1757a6" strokeWidth="2" />
          <path d={path((sample) => sample.productC)} fill="none" stroke="#bd005f" strokeWidth="3" />
          <path
            d={path((sample) => sample.sensorC)}
            fill="none"
            stroke="#9a6700"
            strokeWidth="2"
            strokeDasharray="5 4"
          />
        </svg>
      </div>
      <p className="px-4 pt-2 text-xs text-muted">
        Geser grafik ke kanan atau kiri untuk melihat waktu lainnya.
      </p>
      <div className="flex flex-wrap gap-x-5 gap-y-2 px-4 pb-4 pt-3 text-xs text-muted">
        <span><i className="mr-2 inline-block h-0.5 w-4 align-middle bg-[#1757a6]" />Udara</span>
        <span><i className="mr-2 inline-block h-0.5 w-4 align-middle bg-[#bd005f]" />Inti produk</span>
        <span><i className="mr-2 inline-block h-0.5 w-4 align-middle bg-[#9a6700]" />Sensor</span>
        <span><i className="mr-2 inline-block h-3 w-4 align-middle bg-[#e4f7ef]" />Rentang target</span>
      </div>
    </div>
  );
}
