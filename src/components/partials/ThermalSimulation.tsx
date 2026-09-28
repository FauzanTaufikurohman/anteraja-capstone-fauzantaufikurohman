import { useState } from "react";
import {
  getShipment,
  readShipments,
  rangeFor,
  updateShipment,
} from "../../lib/shipments";
import {
  applyCorrection,
  correctionPlan,
  simulateThermal,
  type Disturbance,
  type SimulationResult,
  type ThermalSample,
} from "../../lib/thermalModel";

type Props = { onNotify: (message: string) => void; onRefresh: () => void };

const scenarios: { id: Disturbance; label: string }[] = [
  { id: "door-open", label: "Pintu kontainer terbuka" },
  { id: "power-loss", label: "Daya pendingin terputus" },
  { id: "weak-cooling", label: "Kapasitas pendingin melemah" },
  { id: "sensor-drift", label: "Sensor bergeser kalibrasi" },
];

function TemperatureChart({
  samples,
  range,
}: {
  samples: ThermalSample[];
  range: { min: number; max: number };
}) {
  if (samples.length < 2)
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted">
        Jalankan skenario untuk melihat perubahan suhu.
      </div>
    );
  const temperatures = samples.flatMap((sample) => [
    sample.airC,
    sample.productC,
    sample.sensorC,
    range.min,
    range.max,
  ]);
  const min = Math.min(...temperatures) - 1;
  const max = Math.max(...temperatures) + 1;
  const x = (index: number) => 42 + (index / (samples.length - 1)) * 650;
  const y = (value: number) =>
    220 - ((value - min) / Math.max(1, max - min)) * 190;
  const path = (read: (sample: ThermalSample) => number) =>
    samples
      .map(
        (sample, index) =>
          `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(read(sample)).toFixed(1)}`,
      )
      .join(" ");
  return (
    <div className="overflow-hidden">
      <svg
        viewBox="0 0 720 260"
        className="h-64 w-full"
        role="img"
        aria-label="Grafik suhu udara, inti produk, dan pembacaan sensor terhadap waktu"
      >
        <rect
          x="42"
          y={y(range.max)}
          width="650"
          height={Math.max(0, y(range.min) - y(range.max))}
          fill="#e4f7ef"
        />
        {[min, (min + max) / 2, max].map((tick) => (
          <g key={tick}>
            <line x1="42" x2="692" y1={y(tick)} y2={y(tick)} stroke="#e6e6e6" />
            <text
              x="36"
              y={y(tick) + 4}
              textAnchor="end"
              fontSize="11"
              fill="#666"
            >
              {tick.toFixed(1)}°
            </text>
          </g>
        ))}
        <path
          d={path((sample) => sample.airC)}
          fill="none"
          stroke="#1757a6"
          strokeWidth="2"
        />
        <path
          d={path((sample) => sample.productC)}
          fill="none"
          stroke="#bd005f"
          strokeWidth="3"
        />
        <path
          d={path((sample) => sample.sensorC)}
          fill="none"
          stroke="#9a6700"
          strokeWidth="2"
          strokeDasharray="5 4"
        />
        <text x="42" y="248" fontSize="11" fill="#666">
          0 menit
        </text>
        <text x="692" y="248" textAnchor="end" fontSize="11" fill="#666">
          {Math.round(samples.at(-1)!.elapsedSeconds / 60)} menit
        </text>
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-2 px-4 pb-4 text-xs text-muted">
        <span>
          <i className="mr-2 inline-block h-0.5 w-4 align-middle bg-[#1757a6]" />
          Udara
        </span>
        <span>
          <i className="mr-2 inline-block h-0.5 w-4 align-middle bg-[#bd005f]" />
          Inti produk
        </span>
        <span>
          <i className="mr-2 inline-block h-0.5 w-4 align-middle bg-[#9a6700]" />
          Sensor
        </span>
        <span>
          <i className="mr-2 inline-block h-3 w-4 align-middle bg-[#e4f7ef]" />
          Rentang target
        </span>
      </div>
    </div>
  );
}

export default function ThermalSimulation({ onNotify, onRefresh }: Props) {
  const shipments = readShipments();
  const initialId =
    getShipment(new URLSearchParams(window.location.search).get("shipment"))
      ?.id ||
    shipments[0]?.id ||
    "";
  const initialShipment = shipments.find((item) => item.id === initialId);
  const [selectedId, setSelectedId] = useState(initialId);
  const [disturbance, setDisturbance] = useState<Disturbance>("door-open");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [setpointC, setSetpointC] = useState(
    String(initialShipment?.thermalConfig.setpointC ?? 5),
  );
  const [sensorOffsetC, setSensorOffsetC] = useState(
    String(initialShipment?.thermalConfig.sensorOffsetC ?? 0),
  );
  const [coolingCapacityW, setCoolingCapacityW] = useState(
    String(initialShipment?.thermalConfig.coolingCapacityW ?? 120),
  );
  const [ambientC, setAmbientC] = useState(
    String(initialShipment?.thermalConfig.ambientC ?? 30),
  );
  const [productSpecificHeatJPerKgK, setProductSpecificHeatJPerKgK] =
    useState(
      String(
        initialShipment?.thermalConfig.productSpecificHeatJPerKgK ?? 3500,
      ),
    );
  const [enclosureConductanceWPerK, setEnclosureConductanceWPerK] = useState(
    String(initialShipment?.thermalConfig.enclosureConductanceWPerK ?? 1.2),
  );
  const [disturbed, setDisturbed] = useState<SimulationResult | null>(null);
  const [corrected, setCorrected] = useState<SimulationResult | null>(null);
  const shipment = shipments.find((item) => item.id === selectedId);
  const range = rangeFor(shipment);
  const durationSeconds = Math.max(1, Number(durationMinutes) || 30) * 60;
  const chartSamples = disturbed
    ? [
        ...disturbed.samples,
        ...(corrected?.samples
          .slice(1)
          .map((sample) => ({
            ...sample,
            elapsedSeconds: sample.elapsedSeconds + durationSeconds,
          })) || []),
      ]
    : [];
  const finalState = corrected?.state ?? disturbed?.state;
  const finalStatus =
    finalState && shipment
      ? finalState.productC < range.min || finalState.productC > range.max
        ? "Di luar rentang"
        : "Dalam rentang"
      : "Belum dijalankan";
  const correctionRecovered =
    corrected !== null &&
    corrected.state.productC >= range.min &&
    corrected.state.productC <= range.max;

  const runDisturbance = () => {
    if (!shipment) return;
    const config = {
      ...shipment.thermalConfig,
      setpointC: Number(setpointC),
      sensorOffsetC: Number(sensorOffsetC),
      coolingCapacityW: Number(coolingCapacityW),
      ambientC: Number(ambientC),
      productSpecificHeatJPerKgK: Number(productSpecificHeatJPerKgK),
      enclosureConductanceWPerK: Number(enclosureConductanceWPerK),
    };
    setDisturbed(
      simulateThermal(
        shipment,
        disturbance,
        durationSeconds,
        shipment.thermalState,
        config,
      ),
    );
    setCorrected(null);
    onNotify("Skenario termal selesai dihitung.");
  };

  const runCorrection = () => {
    if (!shipment || !disturbed) return;
    const config = applyCorrection(disturbed.config, disturbance);
    setCorrected(
      simulateThermal(
        shipment,
        "none",
        durationSeconds,
        disturbed.state,
        config,
      ),
    );
    onNotify("Dampak tindakan korektif selesai dihitung.");
  };

  const saveResult = () => {
    if (!shipment || !finalState) return;
    const result = corrected ?? disturbed;
    if (!result) return;
    updateShipment(shipment.id, {
      thermalConfig: result.config,
      thermalState: finalState,
      temperature: finalState.productC,
    });
    onRefresh();
    onNotify("Kondisi simulasi disimpan ke shipment.");
  };

  return (
    <section id="disturbance" className="scroll-mt-24">
      <div className="mb-5">
        <h2 className="mt-1 text-2xl font-bold">Simulasi termal shipment</h2>
        <p className="mt-1 text-sm text-muted">
          Uji gangguan dan tindakan korektif pada model panas produk, udara,
          sensor, dan pendingin.
        </p>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(280px,.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-5">
          <div className="rounded-xl border border-line bg-white p-5 shadow-panel">
            <h3 className="font-bold">Kondisi simulasi</h3>
            <label className="mt-4 block text-sm font-semibold">
              Shipment
              <select
                value={selectedId}
                onChange={(event) => {
                  const next = shipments.find(
                    (item) => item.id === event.target.value,
                  );
                  setSelectedId(event.target.value);
                  setSetpointC(String(next?.thermalConfig.setpointC ?? 5));
                  setSensorOffsetC(
                    String(next?.thermalConfig.sensorOffsetC ?? 0),
                  );
                  setCoolingCapacityW(
                    String(next?.thermalConfig.coolingCapacityW ?? 120),
                  );
                  setAmbientC(String(next?.thermalConfig.ambientC ?? 30));
                  setProductSpecificHeatJPerKgK(
                    String(
                      next?.thermalConfig.productSpecificHeatJPerKgK ?? 3500,
                    ),
                  );
                  setEnclosureConductanceWPerK(
                    String(next?.thermalConfig.enclosureConductanceWPerK ?? 1.2),
                  );
                  setDisturbed(null);
                  setCorrected(null);
                }}
                className="mt-2 block w-full rounded-lg border border-line px-4 py-3"
              >
                {shipments.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.id} · {item.status}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block text-sm font-semibold">
              Gangguan
              <select
                value={disturbance}
                onChange={(event) => {
                  setDisturbance(event.target.value as Disturbance);
                  setDisturbed(null);
                  setCorrected(null);
                }}
                className="mt-2 block w-full rounded-lg border border-line px-4 py-3"
              >
                {scenarios.map((scenario) => (
                  <option value={scenario.id} key={scenario.id}>
                    {scenario.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block text-sm font-semibold">
              Durasi gangguan
              <input
                type="number"
                min="1"
                max="480"
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
                className="mt-2 block w-full rounded-lg border border-line px-4 py-3"
              />
              <span className="mt-1 block text-xs font-normal text-muted">
                Menit simulasi
              </span>
            </label>
            <button
              type="button"
              disabled={!shipment}
              onClick={runDisturbance}
              className="mt-5 min-h-11 w-full rounded-lg bg-anteraja px-4 py-3 text-sm font-bold text-white hover:bg-anteraja-dark disabled:opacity-50"
            >
              Jalankan gangguan
            </button>
            {disturbed && (
              <button
                type="button"
                onClick={runCorrection}
                className="mt-3 min-h-11 w-full rounded-lg border border-line px-4 py-3 text-sm font-bold hover:bg-[#f8f9fa]"
              >
                Uji tindakan korektif
              </button>
            )}
            {finalState && (
              <button
                type="button"
                onClick={saveResult}
                className="mt-3 min-h-11 w-full rounded-lg border border-[#bdebdc] bg-[#effaf6] px-4 py-3 text-sm font-bold text-success hover:bg-[#dff5ec]"
              >
                Simpan hasil ke shipment
              </button>
            )}
          </div>
          <details className="rounded-xl border border-line bg-white p-5">
            <summary className="cursor-pointer font-bold">
              Asumsi Suhu
            </summary>
            {shipment && (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-semibold">
                    Set point (°C)
                    <input
                      type="number"
                      step="0.5"
                      value={setpointC}
                      onChange={(event) => setSetpointC(event.target.value)}
                      className="mt-2 block w-full rounded-lg border border-line px-3 py-2"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Offset sensor (°C)
                    <input
                      type="number"
                      step="0.1"
                      value={sensorOffsetC}
                      onChange={(event) => setSensorOffsetC(event.target.value)}
                      className="mt-2 block w-full rounded-lg border border-line px-3 py-2"
                    />
                  </label>
                  <label className="text-sm font-semibold sm:col-span-2">
                    Kapasitas pendingin (W)
                    <input
                      type="number"
                      min="0"
                      step="10"
                      value={coolingCapacityW}
                      onChange={(event) =>
                        setCoolingCapacityW(event.target.value)
                      }
                      className="mt-2 block w-full rounded-lg border border-line px-3 py-2"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Suhu lingkungan (°C)
                    <input
                      type="number"
                      step="0.1"
                      value={ambientC}
                      onChange={(event) => setAmbientC(event.target.value)}
                      className="mt-2 block w-full rounded-lg border border-line px-3 py-2"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Kapasitas panas produk (J/kg·K)
                    <input
                      type="number"
                      min="0.1"
                      step="100"
                      value={productSpecificHeatJPerKgK}
                      onChange={(event) =>
                        setProductSpecificHeatJPerKgK(event.target.value)
                      }
                      className="mt-2 block w-full rounded-lg border border-line px-3 py-2"
                    />
                  </label>
                  <label className="text-sm font-semibold sm:col-span-2">
                    Konduktansi selubung (W/K)
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={enclosureConductanceWPerK}
                      onChange={(event) =>
                        setEnclosureConductanceWPerK(event.target.value)
                      }
                      className="mt-2 block w-full rounded-lg border border-line px-3 py-2"
                    />
                  </label>
                </div>
              </>
            )}
          </details>
        </div>
        <div className="overflow-hidden rounded-xl border border-line bg-white shadow-panel">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h3 className="font-bold">Respons suhu terhadap waktu</h3>
              <p className="mt-1 text-xs text-muted">
                Zona hijau menunjukkan rentang produk {range.label}.
              </p>
            </div>
            <span
              className={`rounded-md px-3 py-2 text-xs font-bold ${finalStatus === "Dalam rentang" ? "bg-[#effaf6] text-success" : finalStatus === "Di luar rentang" ? "bg-[#fff1f0] text-danger" : "bg-[#f8f9fa] text-muted"}`}
            >
              {finalStatus}
            </span>
          </div>
          <TemperatureChart samples={chartSamples} range={range} />
          {disturbed && shipment && (
            <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-3">
              <div>
                <small className="text-xs text-muted">Suhu udara</small>
                <strong className="mt-1 block">
                  {(corrected?.state.airC ?? disturbed.state.airC).toFixed(1)}°C
                </strong>
              </div>
              <div>
                <small className="text-xs text-muted">Inti produk</small>
                <strong className="mt-1 block">
                  {(
                    corrected?.state.productC ?? disturbed.state.productC
                  ).toFixed(1)}
                  °C
                </strong>
              </div>
              <div>
                <small className="text-xs text-muted">Bacaan sensor</small>
                <strong className="mt-1 block">
                  {(
                    corrected?.state.sensorC ?? disturbed.state.sensorC
                  ).toFixed(1)}
                  °C
                </strong>
              </div>
            </div>
          )}
          {correctionRecovered && corrected && (
            <dl className="grid gap-3 border-t border-line bg-[#effaf6] p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">Set suhu target</dt>
                <dd className="mt-1 font-bold">
                  {corrected.config.setpointC.toFixed(1)}°C
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Kapasitas pendingin</dt>
                <dd className="mt-1 font-bold">
                  {corrected.config.coolingCapacityW.toFixed(1)} W
                </dd>
              </div>
            </dl>
          )}
          {disturbed && (
            <p className="border-t border-line px-5 py-4 text-sm leading-6 text-muted">
              {corrected
                ? `Koreksi diuji: ${correctionPlan(disturbance)}`
                : `Tindakan yang disarankan: ${correctionPlan(disturbance)}`}
            </p>
          )}
          <p className="border-t border-line px-5 py-3 text-xs leading-5 text-muted">
            Simulasi berjalan dalam waktu virtual. Data shipment hanya berubah
            setelah hasil disimpan.
          </p>
        </div>
      </div>
    </section>
  );
}
