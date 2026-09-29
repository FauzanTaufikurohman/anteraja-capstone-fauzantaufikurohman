# Dokumentasi Skema Basis Data Relasional (PostgreSQL / Supabase)
**Aplikasi:** Anteraja Pharma — React Thermal Simulation  
**Repositori:** `FauzanTaufikurohman/anteraja-capstone-fauzantaufikurohman`  
**File Skema SQL:** `schema.sql`

---

## 1. Ringkasan Arsitektur Basis Data

Basis data relasional **Anteraja Pharma** dirancang untuk menggantikan/mendukung penyimpanan data lokal (*LocalStorage*) menjadi basis data terpusat berbasis **PostgreSQL / Supabase**. 

Skema ini memodelkan seluruh kebutuhan fungsional dari PRD dan FRD (FR-01 s/d FR-04), mencakup:
- **Katalog & Pengiriman:** Produk farmasi dan status transit pengiriman sampel (*FR-01, FR-04*).
- **Spesifikasi Termal Enclosure:** Parameter fisik kemasan terisolasi dan sensor (*FR-02*).
- **Simulasi & Gangguan:** Konfigurasi skenario gangguan (*Open Door, Power Loss, Weak Cooling, Sensor Drift*) dan rencana tindakan koreksi interaktif (*FR-03*).
- **Perekaman Deret Waktu (Time-Series):** Log per detik dari variabel suhu udara ($T_{air}$), produk ($T_{product}$), dan sensor ($T_{sensor}$) (*FR-02, FR-04*).

---

## 2. Struktur Spesifikasi Tabel

Secara keseluruhan terdapat **9 tabel utama** dalam basis data ini:

```
+-------------------+      1:N      +-------------------+      1:1      +------------------------------+
|     products      | ------------> |     shipments     | ------------> | shipment_thermal_parameters  |
+-------------------+               +-------------------+               +------------------------------+
                                      |   |           |
                                 1:N  |   | 1:N       | 1:N
                                      v   v           v
             +--------------------+   |   |   +-----------------------+
             | transit_stage_logs | <-+   |   | disturbance_scenarios |
             +--------------------+       |   +-----------------------+
                                          |               | N:M (via scenario_corrective_actions)
                                          v               v
                                 +-----------------+  +--------------------+
                                 | simulation_runs |  | corrective_actions |
                                 +-----------------+  +--------------------+
                                          | 1:N
                                          v
                         +----------------------------------+
                         |  simulation_time_series_logs     |
                         +----------------------------------+
```

---

### 2.1. Tabel `products`
* **Deskripsi:** Menyimpan katalog sampel produk farmasi (vaksin, insulin, serum, reagen biologis) beserta rentang toleransi suhu aman.
* **Pemetaan FRD:** `FR-01` (Manajemen Pengiriman Sampel).
* **Atribut & Kolom:**

| Nama Kolom | Tipe Data | Constraint | Deskripsi |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY, DEFAULT gen_random_uuid()` | ID unik produk farmasi. |
| `name` | `VARCHAR(100)` | `NOT NULL` | Nama produk/sampel farmasi (misal: "Vaksin COVID-19 mRNA"). |
| `category` | `VARCHAR(50)` | `NOT NULL` | Kategori produk (misal: "Vaccine", "Hormone", "Reagent"). |
| `min_temp_c` | `NUMERIC(4,2)` | `NOT NULL` | Batas bawah suhu aman ($\text{^\circ C}$). |
| `max_temp_c` | `NUMERIC(4,2)` | `NOT NULL, CHECK (max_temp_c > min_temp_c)` | Batas atas suhu aman ($\text{^\circ C}$). |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Waktu pembuatan rekor produk. |

* **Relasi:**
  - **One-to-Many (1:N)** ke `shipments.product_id`.

---

### 2.2. Tabel `shipments`
* **Deskripsi:** Menyimpan rekor utama pengiriman sampel farmasi, nomor resi/tracking, status perjalanan, serta tahapan transit terkini.
* **Pemetaan FRD:** `FR-01` (Pencatatan Profil Pengiriman) & `FR-04` (Kontrol Tahapan Transit).
* **Atribut & Kolom:**

| Nama Kolom | Tipe Data | Constraint | Deskripsi |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY, DEFAULT gen_random_uuid()` | ID unik pengiriman sampel. |
| `product_id` | `UUID` | `FOREIGN KEY (products.id), NOT NULL` | Referensi ke produk farmasi yang dikirim. |
| `tracking_number` | `VARCHAR(50)` | `UNIQUE, NOT NULL` | Nomor resi/tracking pengiriman (misal: "ANT-PHARMA-001"). |
| `current_stage` | `VARCHAR(50)` | `NOT NULL, DEFAULT 'Preparation'` | Tahapan transit terkini ("Preparation", "Loading", "In Transit", "Customs", "Delivered"). |
| `status` | `VARCHAR(30)` | `NOT NULL, CHECK (status IN ('In Transit', 'Completed', 'Excursion Detected', 'Cancelled'))` | Status kondisi pengiriman secara keseluruhan. |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Waktu rekor pengiriman dibuat. |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Waktu perbaruan terakhir rekor pengiriman. |

* **Relasi:**
  - **Many-to-One (N:1)** ke `products.id`.
  - **One-to-One (1:1)** ke `shipment_thermal_parameters.shipment_id`.
  - **One-to-Many (1:N)** ke `transit_stage_logs.shipment_id`.
  - **One-to-Many (1:N)** ke `disturbance_scenarios.shipment_id`.
  - **One-to-Many (1:N)** ke `simulation_runs.shipment_id`.

---

### 2.3. Tabel `shipment_thermal_parameters`
* **Deskripsi:** Menyimpan parameter fisik dan spesifikasi termal kemasan terisolasi (*enclosure*) serta sensor untuk masing-masing pengiriman.
* **Pemetaan FRD:** `FR-02` (Mesin Simulasi Termal).
* **Atribut & Kolom:**

| Nama Kolom | Tipe Data | Constraint | Deskripsi |
| :--- | :--- | :--- | :--- |
| `shipment_id` | `UUID` | `PRIMARY KEY, FOREIGN KEY (shipments.id) ON DELETE CASCADE` | Referensi 1:1 ke pengiriman terkait. |
| `mass_kg` | `NUMERIC(6,3)` | `NOT NULL, DEFAULT 0.500, CHECK (mass_kg > 0)` | Massa sampel produk ($m$ dalam $\text{kg}$). |
| `specific_heat_cp` | `NUMERIC(8,2)` | `NOT NULL, DEFAULT 3800.00, CHECK (specific_heat_cp > 0)` | Kapasitas panas spesifik ($c_p$ dalam $\text{J/kg}\cdot\text{^\circ C}$). |
| `conductance_ua` | `NUMERIC(6,2)` | `NOT NULL, DEFAULT 1.20, CHECK (conductance_ua > 0)` | Konduktansi termal kemasan ($UA$ dalam $\text{W/^\circ C}$). |
| `h_product_air` | `NUMERIC(6,2)` | `NOT NULL, DEFAULT 5.00, CHECK (h_product_air > 0)` | Koefisien perpindahan panas konveksi ($H_{product\_air}$). |
| `tau_sensor` | `NUMERIC(6,2)` | `NOT NULL, DEFAULT 15.00, CHECK (tau_sensor > 0)` | Konstanta waktu delay/lag sensor ($\tau_{sensor}$ dalam detik). |
| `sensor_bias` | `NUMERIC(4,2)` | `NOT NULL, DEFAULT 0.00` | Offset bias/pergeseran pembacaan sensor ($\text{^\circ C}$). |
| `target_setpoint_c` | `NUMERIC(4,2)` | `NOT NULL, DEFAULT 4.00` | Titik acuan target thermostat ($\text{^\circ C}$). |
| `hysteresis_margin_c` | `NUMERIC(4,2)` | `NOT NULL, DEFAULT 1.00` | Marjin histeresis kontrol thermostat ($\text{^\circ C}$). |

* **Relasi:**
  - **One-to-One (1:1)** ke `shipments.id`.

---

### 2.4. Tabel `transit_stage_logs`
* **Deskripsi:** Mencatat riwayat perubahan tahapan perjalanan (*transit stages*) dari waktu ke waktu selama proses pengiriman berlangsung.
* **Pemetaan FRD:** `FR-04` (Kontrol Tahapan Transit & Dasbor Pemantauan).
* **Atribut & Kolom:**

| Nama Kolom | Tipe Data | Constraint | Deskripsi |
| :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` | `PRIMARY KEY` | Auto-increment ID unik log transit. |
| `shipment_id` | `UUID` | `FOREIGN KEY (shipments.id) ON DELETE CASCADE, NOT NULL` | Referensi ke pengiriman sampel. |
| `stage_name` | `VARCHAR(50)` | `NOT NULL` | Nama tahapan transit (misal: "Preparation", "Loading", "In Transit"). |
| `started_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Waktu dimulainya tahapan transit. |
| `notes` | `TEXT` | `NULLABLE` | Catatan operasional opsional pada tahapan tersebut. |

* **Relasi:**
  - **Many-to-One (N:1)** ke `shipments.id`.

---

### 2.5. Tabel `disturbance_scenarios`
* **Deskripsi:** Menyimpan konfigurasi skenario gangguan fisik lingkungan yang diuji pada suatu pengiriman.
* **Pemetaan FRD:** `FR-03` (Konfigurasi Skenario Gangguan).
* **Atribut & Kolom:**

| Nama Kolom | Tipe Data | Constraint | Deskripsi |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY, DEFAULT gen_random_uuid()` | ID unik skenario gangguan. |
| `shipment_id` | `UUID` | `FOREIGN KEY (shipments.id) ON DELETE CASCADE, NOT NULL` | Referensi ke pengiriman sampel. |
| `scenario_type` | `VARCHAR(50)` | `NOT NULL, CHECK (scenario_type IN ('Open Door', 'Power Loss', 'Weak Cooling', 'Sensor Drift'))` | Jenis skenario gangguan termal. |
| `intensity_value` | `NUMERIC(6,2)` | `NOT NULL, DEFAULT 1.00` | Nilai magnitudo/intensitas gangguan (misal: besarnya $Q_{door}$ atau nilai bias). |
| `duration_seconds` | `INT` | `NOT NULL, DEFAULT 300` | Durasi berlangsungnya gangguan (dalam detik). |
| `is_active` | `BOOLEAN` | `NOT NULL, DEFAULT TRUE` | Flag status aktifnya skenario. |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Waktu pembuatan konfigurasi skenario. |

* **Relasi:**
  - **Many-to-One (N:1)** ke `shipments.id`.
  - **Many-to-Many (N:M)** ke `corrective_actions` via `scenario_corrective_actions`.

---

### 2.6. Tabel `corrective_actions`
* **Deskripsi:** Katalog pilihan tindakan koreksi interaktif yang dapat diterapkan untuk memulihkan stabilitas suhu.
* **Pemetaan FRD:** `FR-03` (Simulasi Rencana Tindakan Korektif).
* **Atribut & Kolom:**

| Nama Kolom | Tipe Data | Constraint | Deskripsi |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY, DEFAULT gen_random_uuid()` | ID unik tindakan koreksi. |
| `action_name` | `VARCHAR(100)` | `NOT NULL` | Nama tindakan (misal: "Penutupan Pintu Container"). |
| `action_type` | `VARCHAR(50)` | `NOT NULL` | Kategori tindakan (misal: "Physical Intervention", "Power Restoration"). |
| `parameter_modified` | `VARCHAR(50)` | `NOT NULL` | Parameter termal yang dipulihkan/diubah (misal: "Q_door", "Q_cooling", "sensor_bias"). |
| `description` | `TEXT` | `NULLABLE` | Penjelasan rincian dampak fisik tindakan koreksi. |

* **Relasi:**
  - **Many-to-Many (N:M)** ke `disturbance_scenarios` via `scenario_corrective_actions`.

---

### 2.7. Tabel `scenario_corrective_actions`
* **Deskripsi:** Tabel persimpangan (*Junction Table*) yang menghubungkan skenario gangguan dengan rencana tindakan koreksinya beserta langkah waktu penerapannya.
* **Pemetaan FRD:** `FR-03` (Simulasi & Perbandingan Koreksi).
* **Atribut & Kolom:**

| Nama Kolom | Tipe Data | Constraint | Deskripsi |
| :--- | :--- | :--- | :--- |
| `scenario_id` | `UUID` | `FOREIGN KEY (disturbance_scenarios.id) ON DELETE CASCADE` | ID skenario gangguan. |
| `action_id` | `UUID` | `FOREIGN KEY (corrective_actions.id) ON DELETE CASCADE` | ID tindakan koreksi. |
| `applied_at_step` | `INT` | `NOT NULL, DEFAULT 0` | Langkah detik ($dt$) saat tindakan koreksi diaktifkan. |

* **Relasi & Primary Key:**
  - **Composite Primary Key:** `(scenario_id, action_id)`.

---

### 2.8. Tabel `simulation_runs`
* **Deskripsi:** Menyimpan rekor setiap sesi eksekusi simulasi termal yang dijalankan pada pengiriman sampel.
* **Pemetaan FRD:** `FR-02` & `FR-03` (Mesin Simulasi & Simpan Balik).
* **Atribut & Kolom:**

| Nama Kolom | Tipe Data | Constraint | Deskripsi |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY, DEFAULT gen_random_uuid()` | ID unik sesi eksekusi simulasi. |
| `shipment_id` | `UUID` | `FOREIGN KEY (shipments.id) ON DELETE CASCADE, NOT NULL` | Referensi ke pengiriman sampel. |
| `run_timestamp` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Waktu simulasi dieksekusi. |
| `total_steps` | `INT` | `NOT NULL, DEFAULT 600` | Total durasi simulasi dalam langkah detik ($dt=1s$). |
| `has_excursion` | `BOOLEAN` | `DEFAULT FALSE` | Flag penanda apakah terjadi ekskursi suhu selama simulasi. |
| `notes` | `TEXT` | `NULLABLE` | Catatan ringkasan hasil simulasi. |

* **Relasi:**
  - **Many-to-One (N:1)** ke `shipments.id`.
  - **One-to-Many (1:N)** ke `simulation_time_series_logs.simulation_run_id`.

---

### 2.9. Tabel `simulation_time_series_logs`
* **Deskripsi:** Menyimpan data deret waktu (*time-series*) hasil perhitungan numerik Euler $dt=1s$ untuk 3 titik suhu ($T_{air}$, $T_{product}$, $T_{sensor}$) dan status pendinginan.
* **Pemetaan FRD:** `FR-02` (Dinamika Suhu 2-Node) & `FR-04` (Pemantauan Live 3 Titik Suhu).
* **Atribut & Kolom:**

| Nama Kolom | Tipe Data | Constraint | Deskripsi |
| :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` | `PRIMARY KEY` | Auto-increment ID log deret waktu. |
| `simulation_run_id` | `UUID` | `FOREIGN KEY (simulation_runs.id) ON DELETE CASCADE, NOT NULL` | Referensi ke sesi simulasi. |
| `step_seconds` | `INT` | `NOT NULL, CHECK (step_seconds >= 0)` | Indeks detik simulasi ($t = 0, 1, 2, \dots$). |
| `air_temp_c` | `NUMERIC(5,2)` | `NOT NULL` | Suhu udara enclosure ($T_{air}$ dalam $\text{^\circ C}$). |
| `product_temp_c` | `NUMERIC(5,2)` | `NOT NULL` | Suhu inti sampel produk ($T_{product}$ dalam $\text{^\circ C}$). |
| `sensor_temp_c` | `NUMERIC(5,2)` | `NOT NULL` | Pembacaan sensor ($T_{sensor}$ dalam $\text{^\circ C}$). |
| `q_cooling_active` | `BOOLEAN` | `NOT NULL, DEFAULT FALSE` | Status aktifnya sistem pendingin thermostat pada detik tersebut. |

* **Relasi:**
  - **Many-to-One (N:1)** ke `simulation_runs.id`.

---

## 3. Rangkuman Relasi Kunci (Foreign Keys & Constraints)

| Tabel Sumber | Kolom FK | Tabel Target | Tipe Relasi | Perilaku Hapus (`ON DELETE`) |
| :--- | :--- | :--- | :--- | :--- |
| `shipments` | `product_id` | `products(id)` | Many-to-One | `RESTRICT` |
| `shipment_thermal_parameters` | `shipment_id` | `shipments(id)` | One-to-One | `CASCADE` |
| `transit_stage_logs` | `shipment_id` | `shipments(id)` | Many-to-One | `CASCADE` |
| `disturbance_scenarios` | `shipment_id` | `shipments(id)` | Many-to-One | `CASCADE` |
| `scenario_corrective_actions` | `scenario_id` | `disturbance_scenarios(id)` | Many-to-Many | `CASCADE` |
| `scenario_corrective_actions` | `action_id` | `corrective_actions(id)` | Many-to-Many | `CASCADE` |
| `simulation_runs` | `shipment_id` | `shipments(id)` | Many-to-One | `CASCADE` |
| `simulation_time_series_logs` | `simulation_run_id` | `simulation_runs(id)` | Many-to-One | `CASCADE` |

---
*Dokumentasi ini dibuat berdasarkan skema database `schema.sql` untuk proyek Anteraja Pharma.*
