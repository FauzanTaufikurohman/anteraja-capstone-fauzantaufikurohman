import { useEffect, useState } from "react";
import TemperatureChart from "./TemperatureChart";
import { getSimulationHistoryRun, listSimulationHistory } from "../services/shipmentApi";
import type {
  SimulationHistoryDetail,
  SimulationHistoryRun,
} from "../services/shipmentApi";
import type { Disturbance, ThermalSample } from "../lib/thermalModel";

function runLabel(run: SimulationHistoryRun) {
  const correction = run.scenarioType.startsWith("corrective-");
  const scenario = correction
    ? run.scenarioType.slice("corrective-".length)
    : run.scenarioType;
  const scenarioLabels: Record<string, string> = {
    "door-open": "Pintu kontainer terbuka",
    "power-loss": "Daya pendingin terputus",
    "sensor-drift": "Sensor bergeser kalibrasi",
    "weak-cooling": "Kapasitas pendingin melemah",
  };
  const type = correction
    ? `Perbaikan suhu${scenarioLabels[scenario] ? ` · ${scenarioLabels[scenario]}` : ""}`
    : run.scenarioType === "none"
      ? "Simulasi suhu"
      : `Penyimpangan: ${scenarioLabels[scenario] ?? scenario}`;
  const timestamp = new Date(run.runTimestamp).toLocaleString("id-ID", {
    dateStyle: "short",
    timeStyle: "short",
  });
  return `${timestamp} · ${type}`;
}

export default function SimulationHistory({
  shipmentId,
  range,
  refreshKey,
  preview,
  preferredScenario,
  selectLatestCorrective = false,
}: {
  shipmentId: string;
  range: { min: number; max: number; label: string };
  refreshKey: number;
  preview?: {
    samples: ThermalSample[];
    startTime: string;
    mode: "disturbance" | "corrective";
    status?: string;
  };
  preferredScenario?: Disturbance | null;
  selectLatestCorrective?: boolean;
}) {
  const [page, setPage] = useState(1);
  const [runs, setRuns] = useState<SimulationHistoryRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [history, setHistory] = useState<SimulationHistoryDetail | null>(null);
  const [loadedRunsKey, setLoadedRunsKey] = useState("");
  const [runsError, setRunsError] = useState<{ key: string; message: string } | null>(null);
  const [historyError, setHistoryError] = useState<{ key: string; message: string } | null>(null);
  const [lastPage, setLastPage] = useState(1);
  const [retryKey, setRetryKey] = useState(0);
  const runsRequestKey = `${shipmentId}:${page}:${refreshKey}:${retryKey}`;
  const historyRequestKey = `${shipmentId}:${selectedRunId}`;
  const loadingRuns = loadedRunsKey !== runsRequestKey;
  const loadingHistory =
    Boolean(selectedRunId) &&
    history?.id !== selectedRunId &&
    historyError?.key !== historyRequestKey;
  const error =
    historyError?.key === historyRequestKey
      ? historyError.message
      : runsError?.key === runsRequestKey
        ? runsError.message
        : "";
  const selectedRun = runs.find((run) => run.id === selectedRunId);
  const isCorrectivePreview = preview?.mode === "corrective";
  const chartBase = isCorrectivePreview
    ? history?.scenarioType.startsWith("corrective-")
      ? history.baseline
      : history?.scenarioType === preferredScenario
        ? history
        : null
    : null;
  const chartSamples = preview
    ? isCorrectivePreview && chartBase
      ? [
          ...chartBase.samples,
          ...preview.samples
            .filter((sample) => sample.elapsedSeconds > 0)
            .map((sample) => ({
              ...sample,
              elapsedSeconds: sample.elapsedSeconds + chartBase.totalSteps,
            })),
        ]
      : preview.samples
    : history?.scenarioType.startsWith("corrective-") && history.baseline
      ? [
          ...history.baseline.samples,
          ...history.samples
            .filter((sample) => sample.elapsedSeconds > 0)
            .map((sample) => ({
              ...sample,
              elapsedSeconds: sample.elapsedSeconds + history.baseline!.totalSteps,
            })),
        ]
      : history?.samples ?? [];
  const chartStartTime = preview
    ? isCorrectivePreview && chartBase
      ? chartBase.runTimestamp
      : preview.startTime
    : history?.scenarioType.startsWith("corrective-") && history.baseline
      ? history.baseline.runTimestamp
      : history?.runTimestamp;
  const chartTitle = preview
    ? isCorrectivePreview
      ? "Penyimpangan dan hasil perbaikan"
      : "Respons suhu terhadap waktu"
    : history?.scenarioType.startsWith("corrective-") && history.baseline
      ? "Penyimpangan dan hasil perbaikan"
      : "Riwayat suhu tersimpan";

  useEffect(() => {
    let active = true;
    void listSimulationHistory(shipmentId, page)
      .then((result) => {
        if (!active) return;
        setRuns(result.data);
        setLastPage(result.lastPage);
        setLoadedRunsKey(runsRequestKey);
        const correctiveRun = selectLatestCorrective
          ? result.data.find((run) => run.scenarioType.startsWith("corrective-"))
          : undefined;
        const preferredRun = preferredScenario
          ? result.data.find(
              (run) => run.scenarioType === preferredScenario,
            )
          : undefined;
        setSelectedRunId((current) =>
          isCorrectivePreview && preferredRun
            ? preferredRun.id
            : correctiveRun
            ? correctiveRun.id
            :
          result.data.some((run) => run.id === current)
            ? current
            : (preferredRun?.id ?? result.data[0]?.id ?? ""),
        );
      })
      .catch((loadError: unknown) => {
        if (active) {
          setRunsError({
            key: runsRequestKey,
            message: loadError instanceof Error
              ? loadError.message
              : "Riwayat suhu gagal dimuat.",
          });
          setLoadedRunsKey(runsRequestKey);
        }
      })
    return () => {
      active = false;
    };
  }, [
    shipmentId,
    page,
    refreshKey,
    retryKey,
    runsRequestKey,
    preferredScenario,
    selectLatestCorrective,
    isCorrectivePreview,
  ]);

  useEffect(() => {
    if (!selectedRunId) return undefined;
    let active = true;
    void getSimulationHistoryRun(shipmentId, selectedRunId)
      .then((result) => {
        if (active) setHistory(result);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setHistoryError({
            key: historyRequestKey,
            message: loadError instanceof Error
              ? loadError.message
              : "Grafik riwayat gagal dimuat.",
          });
        }
      })
    return () => {
      active = false;
    };
  }, [shipmentId, selectedRunId, historyRequestKey]);

  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-line bg-white shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h3 className="font-bold">{chartTitle}</h3>
          <p className="mt-1 text-xs text-muted">
            Riwayat tersimpan dari proses simulasi shipment ini.
          </p>
        </div>
        {runs.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="simulation-history-run">
              Pilih proses riwayat
            </label>
            <select
              id="simulation-history-run"
              value={selectedRunId}
              onChange={(event) => setSelectedRunId(event.target.value)}
              className="min-h-11 max-w-full rounded-lg border border-line bg-white px-3 text-sm"
            >
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {runLabel(run)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {error ? (
        <div className="p-5 text-sm text-danger" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setRetryKey((current) => current + 1)}
            className="ml-3 font-bold underline"
          >
            Coba lagi
          </button>
        </div>
      ) : loadingRuns || loadingHistory ? (
        <p className="p-5 text-sm text-muted" role="status">
          Memuat riwayat suhu...
        </p>
      ) : !runs.length && !preview ? (
        <p className="p-5 text-sm text-muted">
          Belum ada riwayat tersimpan. Simpan hasil simulasi penyimpangan atau
          perbaikan untuk melihat grafiknya di sini.
        </p>
      ) : history || preview ? (
        <>
          {(preview || history) && (
            <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-line px-5 py-3 text-sm">
              <span>
                <strong>Proses:</strong>{" "}
                {preview
                  ? isCorrectivePreview
                    ? chartBase
                      ? "Penyimpangan tersimpan + preview perbaikan"
                      : "Preview perbaikan"
                    : "Preview penyimpangan"
                  : selectedRun
                    ? runLabel(selectedRun)
                    : history
                      ? runLabel(history)
                      : ""}
              </span>
              {history && (
                <>
                  <span>
                    <strong>Durasi:</strong>{" "}
                    {history.totalSteps >= 3600
                      ? `${(history.totalSteps / 3600).toFixed(1)} jam`
                      : `${Math.ceil(history.totalSteps / 60)} menit`}
                  </span>
                  <span
                    className={
                      history.hasExcursion ? "font-semibold text-danger" : "font-semibold text-success"
                    }
                  >
                    {history.hasExcursion
                      ? "Penyimpangan terdeteksi"
                      : "Tidak ada penyimpangan"}
                  </span>
                </>
              )}
              {preview?.status && (
                <span
                  className={
                    preview.status === "Dalam rentang"
                      ? "font-semibold text-success"
                      : "font-semibold text-danger"
                  }
                >
                  {preview.status}
                </span>
              )}
              {preview && !chartBase && isCorrectivePreview && (
                <span className="text-muted">
                  Riwayat penyimpangan yang cocok belum tersedia; grafik menampilkan preview perbaikan.
                </span>
              )}
            </div>
          )}
          <TemperatureChart
            samples={chartSamples}
            range={range}
            startTime={chartStartTime}
          />
          {runs.length > 0 && (
            <div className="flex items-center justify-between border-t border-line px-5 py-3 text-xs text-muted">
              <span>
                Halaman riwayat {page} dari {lastPage} · {runs.length} proses
                terbaru ditampilkan per halaman
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((current) => current - 1)}
                  className="min-h-11 rounded border border-line px-3 hover:bg-[#f8f9fa] disabled:opacity-50"
                >
                  Lebih baru
                </button>
                <button
                  type="button"
                  disabled={page >= lastPage}
                  onClick={() => setPage((current) => current + 1)}
                  className="min-h-11 rounded border border-line px-3 hover:bg-[#f8f9fa] disabled:opacity-50"
                >
                  Lebih lama
                </button>
              </div>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
