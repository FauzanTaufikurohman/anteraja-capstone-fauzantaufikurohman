import type { Disturbance, ThermalConfig, ThermalState } from "./shipments";

export type { Disturbance } from "./shipments";

export type ThermalSample = {
  elapsedSeconds: number;
  airC: number;
  productC: number;
  sensorC: number;
  coolingActive: boolean;
  timestamp?: string;
};

export type SimulationResult = {
  config: ThermalConfig;
  initialState: ThermalState;
  state: ThermalState;
  samples: ThermalSample[];
  correctionPlan: string;
  recoverySeconds: number | null;
  recommendedSetpointC?: number;
  recommendedCoolingCapacityW?: number | null;
  coolingRecommendationMessage?: string;
};

export type SimulationCommand = {
  disturbance: Disturbance;
  durationSeconds: number;
  thermalConfig?: Partial<ThermalConfig>;
  thermalState?: ThermalState;
  correctDisturbance?: boolean;
};
