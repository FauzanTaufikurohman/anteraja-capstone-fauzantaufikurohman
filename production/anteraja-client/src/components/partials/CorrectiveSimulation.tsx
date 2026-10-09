import { useState } from "react";
import SimulationHistory from "../SimulationHistory";
import { rangeFor } from "../../lib/shipments";
import { handleInternalLinkClick } from "../../lib/navigation";
import { useShipments } from "../../hooks/useShipments";
import type {
  Disturbance,
  SimulationCommand,
  SimulationResult,
} from "../../lib/thermalModel";

type Props = { onNotify: (message: string) => void };
type ThermalInputName =
  | "setpointC"
  | "sensorOffsetC"
  | "coolingCapacityW"
  | "ambientC"
  | "productSpecificHeatJPerKgK"
  | "enclosureConductanceWPerK";

const disturbanceLabels: Record<Disturbance, string> = {
  none: "Tidak ada gangguan",
  "door-open": "Pintu kontainer terbuka",
  "power-loss": "Daya pendingin terputus",
  "sensor-drift": "Sensor bergeser kalibrasi",
  "weak-cooling": "Kapasitas pendingin melemah",
};

export default function CorrectiveSimulation({ onNotify }: Props) {
  const {
    shipments,
    runCorrectiveSimulation,
    saveCorrectiveSimulation,
  } = useShipments();
  const initialId = new URLSearchParams(window.location.search).get("shipment") || "";
  const [selectedId, setSelectedId] = useState(initialId);
  const [durationMinutes, setDurationMinutes] = useState("120");
  const [thermalInputs, setThermalInputs] = useState<
    Partial<Record<ThermalInputName, string>>
  >({});
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [saveCommand, setSaveCommand] = useState<SimulationCommand | null>(null);
  const [runStartedAt, setRunStartedAt] = useState("");
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const activeShipments = shipments.filter(
    (shipment) => shipment.activeDisturbance !== null,
  );
  const historyShipment =
    shipments.find((item) => item.id === selectedId) ??
    activeShipments[0] ??
    shipments[0];
  const shipment =
    activeShipments.find((item) => item.id === selectedId) ?? activeShipments[0];
  const range = rangeFor(shipment);
  const durationSeconds = Math.min(
    8 * 60 * 60,
    Math.max(1, Number(durationMinutes) || 30) * 60,
  );
  const resultStatus = result
    ? result.state.productC < range.min || result.state.productC > range.max
      ? "Di luar rentang"
      : "Dalam rentang"
    : "Belum diuji";
  const recommendedSetpointC =
    result?.recommendedSetpointC ?? (range.min + range.max) / 2;
  const thermalControls: {
    key: ThermalInputName;
    label: string;
    min: number;
    max?: number;
    step: number;
  }[] = [
    { key: "setpointC", label: "Set suhu target (°C)", min: range.min, max: range.max, step: 0.1 },
    { key: "coolingCapacityW", label: "Kapasitas pendingin (W)", min: 0, step: 10 },
    { key: "sensorOffsetC", label: "Offset sensor (°C)", min: -100, max: 100, step: 0.1 },
    { key: "ambientC", label: "Suhu lingkungan (°C)", min: -100, max: 200, step: 0.1 },
    { key: "productSpecificHeatJPerKgK", label: "Kapasitas panas produk (J/kg·K)", min: 0.1, step: 100 },
    { key: "enclosureConductanceWPerK", label: "Konduktansi selubung (W/K)", min: 0, step: 0.1 },
  ];

  const selectShipment = (id: string) => {
    setSelectedId(id);
    setThermalInputs({});
    setResult(null);
    setSaveCommand(null);
  };

  const applyThermalInput = (key: ThermalInputName, value: number) => {
    setThermalInputs((current) => ({ ...current, [key]: String(value) }));
    setResult(null);
    setSaveCommand(null);
  };

  const runCorrection = async () => {
    if (!shipment?.activeDisturbance) return;

    const thermalConfig = {
      setpointC: Number(thermalInputs.setpointC ?? shipment.thermalConfig.setpointC),
      sensorOffsetC: Number(thermalInputs.sensorOffsetC ?? shipment.thermalConfig.sensorOffsetC),
      coolingCapacityW: Number(thermalInputs.coolingCapacityW ?? shipment.thermalConfig.coolingCapacityW),
      ambientC: Number(thermalInputs.ambientC ?? shipment.thermalConfig.ambientC),
      productSpecificHeatJPerKgK: Number(thermalInputs.productSpecificHeatJPerKgK ?? shipment.thermalConfig.productSpecificHeatJPerKgK),
      enclosureConductanceWPerK: Number(thermalInputs.enclosureConductanceWPerK ?? shipment.thermalConfig.enclosureConductanceWPerK),
    };
    if (
      !Object.values(thermalConfig).every(Number.isFinite) ||
      thermalConfig.setpointC < range.min ||
      thermalConfig.setpointC > range.max ||
      thermalConfig.coolingCapacityW < 0 ||
      thermalConfig.productSpecificHeatJPerKgK <= 0 ||
      thermalConfig.enclosureConductanceWPerK < 0
    ) {
      onNotify(`Periksa nilai parameter termal. Set suhu harus dalam range ${range.label}.`);
      return;
    }

    const command: SimulationCommand = {
      disturbance: shipment.activeDisturbance,
      durationSeconds,
      thermalConfig,
    };
    const startedAt = new Date().toISOString();
    const preview = await runCorrectiveSimulation(shipment.id, command);
    if (!preview) {
      onNotify("Uji Perbaikan gagal. Periksa koneksi API.");
      return;
    }

    setResult(preview);
    setSaveCommand(command);
    setRunStartedAt(startedAt);
    onNotify("Dampak Perbaikan selesai diuji.");
  };

  const saveResult = async () => {
    if (!shipment || !result || !saveCommand) return;

    const saved = await saveCorrectiveSimulation(
      shipment.id,
      saveCommand,
      result.config,
      result.state,
    );
    if (saved) {
      setResult(null);
      setSaveCommand(null);
      setHistoryRefreshKey((current) => current + 1);
    }
    onNotify(
      saved
        ? "Hasil koreksi tersimpan pada shipment."
        : "Hasil koreksi gagal disimpan. Periksa koneksi API.",
    );
  };

  return (
    <section id="corrective-simulation" className="scroll-mt-24">
      <div className="mb-5">
        <h2 className="text-2xl font-bold">Uji Perbaikan</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
          Gunakan gangguan yang sudah tersimpan sebagai baseline, uji pemulihan suhu, lalu simpan hasilnya ke shipment.
        </p>
      </div>

      {!activeShipments.length ? (
        <div className="rounded-xl border border-line bg-white p-6 shadow-panel">
          <h3 className="font-bold">Belum ada gangguan tersimpan</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Jalankan dan simpan simulasi gangguan terlebih dahulu. Hanya kondisi shipment tersimpan yang dapat menjadi baseline uji korektif.
          </p>
          <a
            href="/simulation"
            onClick={(event) => handleInternalLinkClick(event, "/simulation")}
            className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-anteraja px-5 py-3 text-sm font-bold text-white hover:bg-anteraja-dark"
          >
            Buka simulasi gangguan
          </a>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(280px,.8fr)_minmax(0,1.2fr)]">
          <div className="space-y-5">
            <div className="rounded-xl border border-line bg-white p-5 shadow-panel">
              <h3 className="font-bold">Baseline tersimpan</h3>
              <label className="mt-4 block text-sm font-semibold">
                Shipment dengan gangguan aktif
                <select
                  value={shipment?.id ?? ""}
                  onChange={(event) => selectShipment(event.target.value)}
                  className="mt-2 block min-h-11 w-full rounded-lg border border-line bg-white px-3"
                >
                  {activeShipments.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.id} · {disturbanceLabels[item.activeDisturbance!]}
                    </option>
                  ))}
                </select>
              </label>
              {shipment && (
                <dl className="mt-5 grid grid-cols-2 gap-x-4 divide-y divide-line border-y border-line text-sm">
                  <div className="py-3">
                    <dt className="text-muted">Gangguan tersimpan</dt>
                    <dd className="mt-1 font-semibold">
                      {disturbanceLabels[shipment.activeDisturbance!]}
                    </dd>
                  </div>
                  <div className="py-3">
                    <dt className="text-muted">Rentang produk</dt>
                    <dd className="mt-1 font-semibold">{range.label}</dd>
                  </div>
                  <div className="py-3">
                    <dt className="text-muted">Udara baseline</dt>
                    <dd className="mt-1 font-semibold">{shipment.thermalState.airC.toFixed(1)}°C</dd>
                  </div>
                  <div className="py-3">
                    <dt className="text-muted">Inti baseline</dt>
                    <dd className="mt-1 font-semibold">{shipment.thermalState.productC.toFixed(1)}°C</dd>
                  </div>
                  <div className="py-3">
                    <dt className="text-muted">Sensor baseline</dt>
                    <dd className="mt-1 font-semibold">{shipment.thermalState.sensorC.toFixed(1)}°C</dd>
                  </div>
                  <div className="py-3">
                    <dt className="text-muted">Pendingin baseline</dt>
                    <dd className="mt-1 font-semibold">
                      {shipment.thermalState.coolingActive ? "Aktif" : "Siaga"}
                    </dd>
                  </div>
                </dl>
              )}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {thermalControls.map((control) => (
                  <div className="text-sm font-semibold" key={control.key}>
                    <label htmlFor={`thermal-input-${control.key}`}>
                      {control.label}
                    </label>
                    <input
                      id={`thermal-input-${control.key}`}
                      type="number"
                      min={control.min}
                      max={control.max}
                      step={control.step}
                      value={
                        thermalInputs[control.key] ??
                        String(shipment?.thermalConfig[control.key] ?? 0)
                      }
                      onChange={(event) => {
                        setThermalInputs((current) => ({
                          ...current,
                          [control.key]: event.target.value,
                        }));
                        setResult(null);
                        setSaveCommand(null);
                      }}
                      className="mt-2 block min-h-11 w-full rounded-lg border border-line px-3"
                    />
                    {control.key === "setpointC" && (
                      <button
                        type="button"
                        onClick={() => applyThermalInput(control.key, recommendedSetpointC)}
                        className="mt-2 min-h-11 text-left text-xs font-semibold text-anteraja underline"
                      >
                        Gunakan titik tengah rentang ({recommendedSetpointC.toFixed(1)}°C)
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <label className="mt-4 block text-sm font-semibold">
                Durasi setelah koreksi
                <input
                  type="number"
                  min="1"
                  max="480"
                  value={durationMinutes}
                  onChange={(event) => {
                    setDurationMinutes(event.target.value);
                    setResult(null);
                    setSaveCommand(null);
                  }}
                  className="mt-2 block min-h-11 w-full rounded-lg border border-line px-3"
                />
                <span className="mt-1 block text-xs font-normal text-muted">
                  Menit simulasi, maksimal 480 menit. Suhu inti dapat pulih lebih lambat daripada udara kontainer.
                </span>
              </label>
              <button
                type="button"
                onClick={runCorrection}
                className="mt-5 min-h-11 w-full rounded-lg bg-anteraja px-4 py-3 text-sm font-bold text-white hover:bg-anteraja-dark"
              >
                Uji Perbaikan
              </button>
              {result && saveCommand && resultStatus === "Dalam rentang" && (
                <button
                  type="button"
                  onClick={saveResult}
                  className="mt-3 min-h-11 w-full rounded-lg border border-[#bdebdc] bg-[#effaf6] px-4 py-3 text-sm font-bold text-success hover:bg-[#dff5ec]"
                >
                  Simpan hasil koreksi ke shipment
                </button>
              )}
            </div>
            {result && (
              <div className="rounded-xl border border-line bg-white p-5">
                <h3 className="font-bold">Tindakan yang diuji</h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {result.correctionPlan}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {typeof result.recoverySeconds === "number"
                    ? result.recoverySeconds === 0
                      ? "Suhu inti sudah berada dalam rentang target pada awal uji."
                      : `Suhu inti kembali ke rentang target setelah ${Math.ceil(result.recoverySeconds / 60)} menit.`
                    : `Suhu inti belum kembali ke rentang target dalam ${Math.ceil(durationSeconds / 60)} menit. Tambah durasi atau sesuaikan kapasitas pendingin, lalu uji kembali.`}
                </p>
                {typeof result.recommendedCoolingCapacityW === "number" ? (
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {result.coolingRecommendationMessage}
                    {result.recommendedCoolingCapacityW !== Number(thermalInputs.coolingCapacityW ?? shipment?.thermalConfig.coolingCapacityW ?? 0) && (
                      <button
                        type="button"
                        onClick={() => applyThermalInput("coolingCapacityW", result.recommendedCoolingCapacityW!)}
                        className="ml-2 min-h-11 font-semibold text-anteraja underline"
                      >
                        Gunakan rekomendasi
                      </button>
                    )}
                  </p>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {result.coolingRecommendationMessage}
                  </p>
                )}
                <p className="mt-3 text-xs text-muted">
                  {resultStatus === "Dalam rentang"
                    ? "Preview belum mengubah shipment. Simpan untuk menerapkan suhu dan konfigurasi akhir."
                    : "Preview belum mengubah shipment. Sesuaikan durasi atau parameter, lalu uji lagi sebelum menyimpan."}
                </p>
              </div>
            )}
          </div>

          <div>
            {historyShipment && (
              <SimulationHistory
                key={historyShipment.id}
                shipmentId={historyShipment.id}
                range={rangeFor(historyShipment)}
                refreshKey={historyRefreshKey}
                preferredScenario={historyShipment.activeDisturbance}
                selectLatestCorrective={!result}
                preview={
                  result
                    ? {
                        samples: result.samples,
                        startTime: runStartedAt,
                        mode: "corrective",
                        status: resultStatus,
                      }
                    : undefined
                }
              />
            )}
            <div className="overflow-hidden rounded-xl border border-line bg-white shadow-panel">
            {result && (
              <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-3">
                <div>
                  <small className="text-xs text-muted">Suhu udara akhir</small>
                  <strong className="mt-1 block">{result.state.airC.toFixed(1)}°C</strong>
                </div>
                <div>
                  <small className="text-xs text-muted">Suhu inti akhir</small>
                  <strong className="mt-1 block">{result.state.productC.toFixed(1)}°C</strong>
                </div>
                <div>
                  <small className="text-xs text-muted">Bacaan sensor akhir</small>
                  <strong className="mt-1 block">{result.state.sensorC.toFixed(1)}°C</strong>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}