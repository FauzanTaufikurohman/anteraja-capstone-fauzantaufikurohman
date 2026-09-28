import type { Shipment, ThermalConfig, ThermalState } from "./shipments";

export type Disturbance =
  | "none"
  | "door-open"
  | "power-loss"
  | "sensor-drift"
  | "weak-cooling";

export type ThermalSample = {
  elapsedSeconds: number;
  airC: number;
  productC: number;
  sensorC: number;
  coolingActive: boolean;
};

export type SimulationResult = {
  config: ThermalConfig;
  state: ThermalState;
  samples: ThermalSample[];
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const configureDisturbance = (
  config: ThermalConfig,
  disturbance: Disturbance,
): ThermalConfig => {
  const recovered: ThermalConfig = {
    ...config,
    doorOpen: false,
    powerAvailable: true,
    sensorOffsetC: config.sensorOffsetC,
    coolingEfficiency: 1,
  };

  switch (disturbance) {
    case "door-open":
      return {
        ...recovered,
        sensorOffsetC: config.sensorOffsetC,
        doorOpen: true,
      };
    case "power-loss":
      return {
        ...recovered,
        sensorOffsetC: config.sensorOffsetC,
        powerAvailable: false,
      };
    case "sensor-drift":
      return { ...recovered, sensorOffsetC: config.sensorOffsetC + 3 };
    case "weak-cooling":
      return {
        ...recovered,
        sensorOffsetC: config.sensorOffsetC,
        coolingEfficiency: 0.3,
      };
    default:
      return recovered;
  }
};

export const applyCorrection = (
  config: ThermalConfig,
  disturbance: Disturbance,
): ThermalConfig => {
  switch (disturbance) {
    case "door-open":
      return { ...config, doorOpen: false };
    case "power-loss":
      return { ...config, powerAvailable: true };
    case "sensor-drift":
      return { ...config, sensorOffsetC: config.sensorOffsetC - 3 };
    case "weak-cooling":
      return { ...config, coolingEfficiency: 1 };
    default:
      return config;
  }
};

export const stepThermalModel = (
  state: ThermalState,
  config: ThermalConfig,
  massKg: number,
  dtSeconds = 1,
): ThermalState => {
  const dt = clamp(dtSeconds, 0.1, 10);
  const range = Math.max(0.1, massKg) * config.productSpecificHeatJPerKgK;
  const upperThreshold = config.setpointC + config.hysteresisC / 2;
  const lowerThreshold = config.setpointC - config.hysteresisC / 2;
  let coolingActive = state.coolingActive;

  if (!config.powerAvailable) coolingActive = false;
  else if (state.sensorC >= upperThreshold) coolingActive = true;
  else if (state.sensorC <= lowerThreshold) coolingActive = false;

  const enclosureHeatW =
    config.enclosureConductanceWPerK * (config.ambientC - state.airC);
  const productHeatW =
    config.productConductanceWPerK * (state.productC - state.airC);
  const doorHeatW = config.doorOpen
    ? Math.max(0, config.ambientC - state.airC) * 8
    : 0;
  const coolingW = coolingActive
    ? config.coolingCapacityW * config.coolingEfficiency
    : 0;

  const airC =
    state.airC +
    ((enclosureHeatW + productHeatW + doorHeatW - coolingW) /
      config.airHeatCapacityJPerK) *
      dt;
  const productC =
    state.productC +
    ((config.productConductanceWPerK * (state.airC - state.productC)) / range) *
      dt;
  const sensorTargetC = airC + config.sensorOffsetC;
  const response =
    1 - Math.exp(-dt / Math.max(0.1, config.sensorTimeConstantSeconds));
  const sensorC = state.sensorC + (sensorTargetC - state.sensorC) * response;

  return {
    airC,
    productC,
    sensorC,
    coolingActive,
    elapsedSeconds: state.elapsedSeconds + dt,
  };
};

export const simulateThermal = (
  shipment: Shipment,
  disturbance: Disturbance,
  durationSeconds: number,
  startState = shipment.thermalState,
  startConfig = shipment.thermalConfig,
): SimulationResult => {
  const config = configureDisturbance(startConfig, disturbance);
  const duration = clamp(Math.floor(durationSeconds), 1, 8 * 60 * 60);
  const sampleEvery = Math.max(1, Math.floor(duration / 120));
  const samples: ThermalSample[] = [];
  let state = startState;
  let elapsedSeconds = 0;

  const record = () =>
    samples.push({
      elapsedSeconds,
      airC: state.airC,
      productC: state.productC,
      sensorC: state.sensorC,
      coolingActive: state.coolingActive,
    });

  record();
  for (let second = 1; second <= duration; second += 1) {
    state = stepThermalModel(state, config, shipment.weight);
    elapsedSeconds = second;
    if (second % sampleEvery === 0 || second === duration) record();
  }

  return { config, state, samples };
};

export const correctionPlan = (disturbance: Disturbance) => {
  switch (disturbance) {
    case "door-open":
      return "Tutup pintu kontainer untuk menghentikan masuknya panas.";
    case "power-loss":
      return "Pulihkan daya agar sistem pendingin dapat bekerja kembali.";
    case "sensor-drift":
      return "Kalibrasi sensor dengan suhu referensi; ini memperbaiki pembacaan, bukan suhu produk.";
    case "weak-cooling":
      return "Pulihkan kapasitas pendingin dan periksa sumber gangguan.";
    default:
      return "Tidak ada gangguan aktif yang perlu dikoreksi.";
  }
};
