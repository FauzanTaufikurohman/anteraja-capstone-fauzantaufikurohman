import { useState } from "react";
import SimulationHistory from "../SimulationHistory";
import { rangeFor } from "../../lib/shipments";
import { useShipments } from "../../hooks/useShipments";
import type {
  Disturbance,
  SimulationCommand,
  SimulationResult,
} from "../../lib/thermalModel";

type Props = { onNotify: (message: string) => void };

const scenarios: { id: Disturbance; label: string }[] = [
  { id: "door-open", label: "Pintu kontainer terbuka" },
  { id: "power-loss", label: "Daya pendingin terputus" },
  { id: "weak-cooling", label: "Kapasitas pendingin melemah" },
  { id: "sensor-drift", label: "Sensor bergeser kalibrasi" },
];

export default function ThermalSimulation({ onNotify }: Props) {
  const { shipments, runSimulation, saveSimulation } = useShipments();
  const initialId = new URLSearchParams(window.location.search).get("shipment") || "";
  const [selectedShipmentId, setSelectedShipmentId] = useState(initialId);
  const [disturbance, setDisturbance] = useState<Disturbance>("door-open");
  const [disturbed, setDisturbed] = useState<SimulationResult | null>(null);
  const [saveCommand, setSaveCommand] = useState<SimulationCommand | null>(null);
  const [runStartedAt, setRunStartedAt] = useState("");
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const shipment =
    shipments.find((item) => item.id === selectedShipmentId) || shipments[0];
  const range = rangeFor(shipment);
  const durationSeconds = 30 * 60;
  const finalState = disturbed?.state;
  const resultConfig = disturbed?.config;
  const finalStatus =
    finalState && shipment
      ? finalState.productC < range.min || finalState.productC > range.max
        ? "Di luar rentang"
        : "Dalam rentang"
      : "Belum dijalankan";
  const runDisturbance = async () => {
    if (!shipment) return;
    setDisturbed(null);
    setSaveCommand(null);
    const startedAt = new Date().toISOString();
    setRunStartedAt(startedAt);
    const command: SimulationCommand = {
      disturbance,
      durationSeconds,
    };
    const result = await runSimulation(shipment.id, command);
    if (!result) {
      onNotify("Simulasi gagal dihitung. Periksa koneksi API.");
      return;
    }
    setDisturbed(result);
    setSaveCommand(command);
    onNotify("Skenario termal selesai dihitung.");
  };

  const saveResult = async () => {
    if (!shipment || !finalState || !resultConfig || !saveCommand) return;
    const saved = await saveSimulation(
      shipment.id,
      saveCommand,
      resultConfig,
      finalState,
    );
    if (saved) {
      setSaveCommand(null);
      setHistoryRefreshKey((current) => current + 1);
    }
    onNotify(saved ? "Kondisi simulasi tersimpan pada server." : "Simulasi gagal disimpan. Periksa koneksi API.");
  };

  return (
    <section id="disturbance" className="scroll-mt-24">
      <div className="mb-5">
        <h2 className="mt-1 text-2xl font-bold">Simulasi termal shipment</h2>
        <p className="mt-1 text-sm text-muted">
          Uji dampak gangguan pada model termal, lalu simpan kondisi akhirnya ke shipment.
        </p>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(280px,.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-5">
          <div className="rounded-xl border border-line bg-white p-5 shadow-panel">
            <h3 className="font-bold">Kondisi simulasi</h3>
            <div className="mt-4 rounded-lg bg-[#f8f9fa] px-4 py-3">
              <small className="block text-xs text-muted">Shipment target</small>
              <strong className="mt-1 block break-all">
                {shipment ? `${shipment.id} · ${shipment.status}` : "Belum ada shipment"}
              </strong>
              {shipment && (
                <p className="mt-1 text-xs text-muted">
                  {shipment.origin} → {shipment.destination} · {range.label}
                </p>
              )}
            </div>
            <label className="mt-4 block text-sm font-semibold">
              Shipment
              <select
                value={shipment?.id ?? ""}
                disabled={shipments.length === 0}
                onChange={(event) => {
                  setSelectedShipmentId(event.target.value);
                  setDisturbed(null);
                  setSaveCommand(null);
                }}
                className="mt-2 block min-h-11 w-full rounded-lg border border-line bg-white px-4"
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
                  setSaveCommand(null);
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
              <p className="mt-3 text-xs leading-5 text-muted">
                Durasi simulasi gangguan tetap 30 menit. Set suhu dan kapasitas pendingin diatur pada halaman Perbaikan.
              </p>
            <button
              type="button"
              disabled={!shipment}
              onClick={runDisturbance}
              className="mt-5 min-h-11 w-full rounded-lg bg-anteraja px-4 py-3 text-sm font-bold text-white hover:bg-anteraja-dark disabled:opacity-50"
            >
              Jalankan gangguan
            </button>
            {finalState && saveCommand && (
              <button
                type="button"
                onClick={saveResult}
                className="mt-3 min-h-11 w-full rounded-lg border border-[#bdebdc] bg-[#effaf6] px-4 py-3 text-sm font-bold text-success hover:bg-[#dff5ec]"
              >
                  Simpan saja
              </button>
            )}
              {shipment?.activeDisturbance && !saveCommand && (
                <p className="mt-3 text-sm text-success" role="status">
                  Gangguan tersimpan pada shipment.
                </p>
            )}
          </div>
        </div>
        <div>
          {shipment && (
            <SimulationHistory
              key={shipment.id}
              shipmentId={shipment.id}
              range={range}
              refreshKey={historyRefreshKey}
              preferredScenario={shipment.activeDisturbance}
              preview={
                disturbed
                  ? {
                      samples: disturbed.samples,
                      startTime: runStartedAt,
                      mode: "disturbance",
                      status: finalStatus,
                    }
                  : undefined
              }
            />
          )}
          <div className="overflow-hidden rounded-xl border border-line bg-white shadow-panel">
          {shipment && (
            <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <small className="text-xs text-muted">Udara sebelum gangguan</small>
                <strong className="mt-1 block">
                  {(disturbed?.initialState.airC ?? shipment.thermalState.airC).toFixed(1)}°C
                </strong>
              </div>
              <div>
                <small className="text-xs text-muted">Inti sebelum gangguan</small>
                <strong className="mt-1 block">
                  {(disturbed?.initialState.productC ?? shipment.thermalState.productC).toFixed(1)}°C
                </strong>
              </div>
              <div>
                <small className="text-xs text-muted">Sensor sebelum gangguan</small>
                <strong className="mt-1 block">
                  {(disturbed?.initialState.sensorC ?? shipment.thermalState.sensorC).toFixed(1)}°C
                </strong>
              </div>
              <div>
                <small className="text-xs text-muted">Pendingin sebelum gangguan</small>
                <strong className="mt-1 block">
                  {(disturbed?.initialState.coolingActive ?? shipment.thermalState.coolingActive)
                    ? "Aktif"
                    : "Siaga"}
                </strong>
              </div>
            </div>
          )}
          {disturbed && shipment && resultConfig && (
            <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <small className="text-xs text-muted">Set suhu target</small>
                <strong className="mt-1 block">
                  {resultConfig.setpointC.toFixed(1)}°C
                </strong>
              </div>
              <div>
                <small className="text-xs text-muted">Suhu udara</small>
                <strong className="mt-1 block">
                  {disturbed.state.airC.toFixed(1)}°C
                </strong>
              </div>
              <div>
                <small className="text-xs text-muted">Inti produk</small>
                <strong className="mt-1 block">
                  {disturbed.state.productC.toFixed(1)}°C
                </strong>
              </div>
              <div>
                <small className="text-xs text-muted">Bacaan sensor</small>
                <strong className="mt-1 block">
                  {disturbed.state.sensorC.toFixed(1)}°C
                </strong>
              </div>
              <div>
                <small className="text-xs text-muted">Pendingin setelah gangguan</small>
                <strong className="mt-1 block">
                  {disturbed.state.coolingActive ? "Aktif" : "Siaga"}
                </strong>
              </div>
              <div>
                <small className="text-xs text-muted">Daya pendingin</small>
                <strong className="mt-1 block">
                  {resultConfig.coolingCapacityW.toFixed(0)} W
                </strong>
              </div>
            </div>
          )}
          {disturbed && (
            <p className="border-t border-line px-5 py-4 text-sm leading-6 text-muted">
              {`Tindakan yang disarankan: ${disturbed.correctionPlan}`}
            </p>
          )}
          <p className="border-t border-line px-5 py-3 text-xs leading-5 text-muted">
            Simulasi berjalan dalam waktu virtual. Data shipment hanya berubah
            setelah hasil disimpan.
          </p>
          </div>
        </div>
      </div>
    </section>
  );
}
