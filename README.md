# Anteraja Pharma

A local React application for managing sample pharmaceutical shipments and exploring temperature excursions with a thermal simulation. Shipment data is stored in the browser; no physical sensors or cooling hardware are connected.

## Run locally

```sh
npm install
npm run dev
```

Use `npm run build` to type-check and build the app, and `npm run lint` to run ESLint.

## Thermal model

For the step-by-step UI guide, parameter definitions, equations, and operating limits, see [Panduan Simulasi Termal Shipment](docs/panduan-simulasi-termal.md).

The simulation uses a one-second, explicit Euler step and three separate temperatures:

- `airC`: air inside the insulated enclosure.
- `productC`: estimated product-core temperature.
- `sensorC`: delayed sensor reading, including a configurable calibration bias.

The two-node energy balance is:

```text
C_air * dT_air/dt = UA * (T_ambient - T_air)
                  + H_product-air * (T_product - T_air)
                  + Q_door - Q_cooling
m * cp * dT_product/dt = H_product-air * (T_air - T_product)
```

The sensor follows a first-order response:

```text
tau_sensor * dT_sensor/dt = T_air + sensor_bias - T_sensor
```

A thermostat with hysteresis switches the simulated cooler around its set point. Disturbance scenarios alter the model inputs: an open door adds heat transfer, power loss disables cooling, weak cooling reduces capacity, and sensor drift adds a reading bias. A correction run changes only its corresponding input; calibrating a sensor changes the reading/control signal, not product temperature directly.

The defaults in `src/lib/shipments.ts` are illustrative starting assumptions, not measured container or product properties. The model omits spatial gradients, phase changes, packaging layers, humidity, compressor cycling detail, and experimentally measured sensor noise. Do not use its output to claim regulatory compliance, validate real transport equipment, or make product-safety decisions. Calibrate and validate parameters against the actual packaging, payload, sensors, and operating conditions before any real-world use.

## Project structure

- `src/lib/shipments.ts`: shipment types, default data, and localStorage migration from the earlier cookie format.
- `src/lib/thermalModel.ts`: deterministic time-step model, disturbance inputs, and correction plans.
- `src/components/partials/ThermalSimulation.tsx`: scenario configuration, temperature chart, correction comparison, and optional save-back to a shipment.
- `src/components/partials/Monitoring.tsx`: live model stepping, sensor/product/air readings, and shipment-stage controls.
- `docs/src`: earlier standalone HTML prototype; the Vite app entry point is `src/main.tsx`.
