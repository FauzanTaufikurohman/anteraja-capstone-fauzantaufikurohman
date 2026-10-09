# Panduan Simulasi Termal Shipment

Panduan ini menjelaskan cara memakai halaman **Simulasi** dan **Monitoring**, arti parameter yang dapat diubah, cara membaca hasil, serta batas modelnya. Simulasi ini berjalan sepenuhnya di browser dan tidak membaca sensor atau mengendalikan pendingin fisik.

## Tujuan Simulasi

Simulasi membantu pengguna melihat bagaimana gangguan pada kontainer berpendingin dapat memengaruhi udara di dalam kontainer, suhu inti produk, dan bacaan sensor. Pengguna dapat mencoba satu gangguan, menguji Perbaikan yang disarankan, lalu membandingkan respons suhu dari waktu ke waktu.

Model membedakan tiga suhu:

| Nilai      | Arti                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| `airC`     | Perkiraan suhu udara di dalam ruang pengiriman. Udara biasanya berubah lebih cepat daripada produk.             |
| `productC` | Perkiraan suhu inti produk. Nilai ini berubah lebih lambat karena massa dan kapasitas panas produk.             |
| `sensorC`  | Bacaan sensor simulasi. Nilai ini mengikuti suhu udara dengan jeda respons dan dapat memiliki offset kalibrasi. |

Status suhu dihitung dari suhu inti produk dan rentang kategori produk. Status tahap pengiriman, seperti **Dalam persiapan** atau **Karantina**, merupakan informasi terpisah.

## Menyiapkan Shipment

1. Buka **Dashboard** lalu pilih **Tambah shipment**.
2. Isi asal, tujuan, berat, dan kategori produk.
3. Simpan shipment. Aplikasi membuat profil awal berdasarkan kategori: set point berada di tengah rentang kategori, suhu udara/produk/sensor dimulai pada suhu awal produk, dan parameter lainnya memakai asumsi demo.
4. Buka **Monitoring** untuk memilih shipment tersebut dan mengubah tahap pengirimannya. Shipment baru berstatus **Dalam persiapan**.

Kategori Cold chain memakai rentang 2–8°C, Ambient memakai 15–25°C, dan Frozen memakai -20 sampai -10°C. Mengubah kategori saat mengedit shipment juga membuat konfigurasi termal awal baru untuk kategori tersebut.

## Menjalankan Skenario

1. Buka **Simulation** dari navigasi.
2. Pilih shipment. Parameter fisika dan suhu awal mengikuti shipment tersebut.
3. Pilih jenis gangguan.
4. Tentukan durasi gangguan dalam menit virtual. Nilai yang diterima adalah 1 sampai 480 menit; nilai awalnya 30 menit.
5. Buka **Parameter fisika dan asumsi** bila ingin mengubah set point, offset sensor, atau kapasitas pendingin.
6. Tekan **Jalankan gangguan**. Perhitungan berlangsung langsung; durasi virtual tidak menunggu selama durasi nyata.
7. Baca grafik dan nilai akhir udara, inti produk, serta sensor.
8. Tekan **Uji Perbaikan** untuk menghitung periode pemulihan selama durasi yang sama, dimulai dari kondisi akhir gangguan.
9. Bandingkan bagian gangguan dan bagian koreksi pada grafik. Tekan **Simpan hasil ke shipment** hanya jika ingin mengganti kondisi termal shipment di browser.

Jika shipment, jenis gangguan, atau durasi diubah, jalankan gangguan lagi untuk menghasilkan prediksi baru. Mengubah parameter fisika setelah prediksi tidak menghitung ulang hasil lama secara otomatis.

### Jenis Gangguan dan Tindakan

| Gangguan                    | Perubahan pada model                                                           | Tindakan yang disarankan                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Pintu kontainer terbuka     | Menambahkan aliran panas saat lingkungan lebih panas daripada udara kontainer. | Tutup pintu untuk menghentikan masukan panas tambahan.                                                                         |
| Daya pendingin terputus     | Mematikan keluaran pendingin selama periode gangguan.                          | Pulihkan daya agar pendingin dapat bekerja kembali.                                                                            |
| Kapasitas pendingin melemah | Mengurangi kapasitas pendingin menjadi 30% selama gangguan.                    | Pulihkan kapasitas dan periksa penyebab penurunan.                                                                             |
| Sensor bergeser kalibrasi   | Menambahkan bias +3°C ke bacaan sensor.                                        | Kalibrasi ulang dengan suhu referensi. Koreksi ini mengubah bacaan dan keputusan termostat, bukan suhu produk secara langsung. |

Perbaikan hanya mengubah masukan yang terkait dengan gangguan tersebut. Kondisi termal tidak kembali seketika ke suhu awal; udara dan produk bereaksi selama fase pemulihan.

## Parameter Model

Parameter berikut tampil pada panel **Parameter fisika dan asumsi**. Set point, offset sensor, dan kapasitas pendingin dapat diubah sebelum menjalankan skenario. Parameter lain hanya ditampilkan sebagai asumsi saat ini.

| Parameter                             | Satuan       |                                   Nilai awal | Pengaruh                                                                                                      |
| ------------------------------------- | ------------ | -------------------------------------------: | ------------------------------------------------------------------------------------------------------------- |
| Set point pendingin                   | °C           |                Titik tengah rentang kategori | Sasaran termostat berdasarkan bacaan sensor. Set point bukan suhu inti produk.                                |
| Offset sensor                         | °C           |                                            0 | Bias pada bacaan sensor. Offset positif membuat bacaan lebih tinggi daripada suhu udara yang diterima sensor. |
| Kapasitas pendingin                   | W            | 120 untuk Cold chain/Frozen; 0 untuk Ambient | Batas laju panas yang dapat dibuang saat pendingin aktif.                                                     |
| Suhu lingkungan                       | °C           |                                           30 | Suhu di luar kontainer yang mendorong panas menembus selubung.                                                |
| Konduktansi selubung, `UA`            | W/K          |                                          1.2 | Laju perpindahan panas melalui insulasi untuk setiap beda suhu satu kelvin.                                   |
| Kapasitas panas spesifik produk, `cp` | J/(kg·K)     |                                         3500 | Besarnya energi untuk mengubah suhu satu kilogram produk satu kelvin.                                         |
| Konduktansi udara-produk, `Hpa`       | W/K          |                                          2.4 | Kecepatan pertukaran panas antara udara ruang dan produk.                                                     |
| Kapasitas panas udara efektif, `Ca`   | J/K          |                                         2500 | Energi efektif untuk mengubah suhu udara di dalam ruang.                                                      |
| Efisiensi pendingin                   | tanpa satuan |                                          1.0 | Pengali kapasitas pendingin. Skenario pendingin melemah memakai 0.3.                                          |
| Konstanta waktu sensor, `tau`         | detik        |                                           15 | Semakin besar nilainya, semakin lambat bacaan sensor mengikuti suhu udara.                                    |
| Histeresis termostat                  | °C           |                                            1 | Lebar pita untuk mencegah kompresor hidup-mati terlalu sering.                                                |

Rentang sasaran pada kode saat ini adalah Cold chain 2–8°C, Ambient 15–25°C, dan Frozen -20 sampai -10°C. Nilai ini merupakan contoh kategori aplikasi, bukan pengganti spesifikasi penyimpanan produk tertentu.

## Rumus yang Dipakai

Model menggunakan dua simpul termal: udara dan inti produk. Perubahan suhu udara dihitung dari panas masuk melalui selubung, pertukaran dengan produk, panas tambahan dari pintu, dan pendinginan:

```text
Ca * dTa/dt = UA * (Tamb - Ta)
             + Hpa * (Tp - Ta)
             + Qdoor
             - Qcooling
```

Perubahan suhu inti produk mengikuti pertukaran panas dengan udara:

```text
m * cp * dTp/dt = Hpa * (Ta - Tp)
```

Bacaan sensor mengikuti suhu udara dengan respons orde satu:

```text
tau * dTs/dt = Ta + bias - Ts
```

Keterangan:

- `Ta`: suhu udara ruang.
- `Tp`: suhu inti produk.
- `Ts`: bacaan sensor.
- `Tamb`: suhu lingkungan.
- `m`: massa produk dalam kilogram.
- `cp`: kapasitas panas spesifik produk.
- `UA`: konduktansi panas antara lingkungan dan ruang.
- `Hpa`: konduktansi panas antara produk dan udara.
- `Qdoor`: panas tambahan ketika pintu terbuka.
- `Qcooling`: panas yang dibuang pendingin.
- `bias`: offset kalibrasi sensor.

Model menghitung persamaan dengan metode Euler eksplisit, satu langkah virtual per detik. Secara sederhana, setiap laju perubahan dikalikan satu detik dan ditambahkan ke suhu pada langkah sebelumnya. Untuk durasi panjang, grafik menyampel sekitar 120 titik per fase; untuk durasi pendek, grafik menyimpan setiap langkah detik.

Saat pintu terbuka, kode memakai pendekatan berikut:

```text
Qdoor = max(0, Tamb - Ta) * 8 W/K
```

Angka `8 W/K` adalah koefisien demonstrasi, bukan hasil pengukuran kebocoran udara pada kontainer tertentu.

Untuk sensor, kode menghitung faktor respons:

```text
alpha = 1 - exp(-dt / tau)
Ts_next = Ts + alpha * ((Ta_next + bias) - Ts)
```

Termostat menyalakan pendingin ketika bacaan sensor mencapai atau melewati `setpoint + hysteresis/2`. Pendingin dimatikan ketika bacaan turun sampai atau melewati `setpoint - hysteresis/2`. Di antara kedua batas tersebut, status pendingin dipertahankan. Jika daya tidak tersedia, pendingin selalu mati.

## Membaca Grafik

- Garis **Udara** menunjukkan respons ruang kontainer; garis ini biasanya bergerak lebih cepat setelah gangguan.
- Garis **Inti produk** menunjukkan respons produk yang tertunda oleh massa dan kapasitas panasnya.
- Garis putus-putus **Sensor** menunjukkan nilai pengukuran yang dipakai termostat. Garis ini dapat tertinggal atau berbeda karena offset.
- Area hijau menunjukkan rentang kategori produk yang sedang dipilih.
- Fase koreksi dimulai dari keadaan akhir fase gangguan. Sumbu waktunya meneruskan durasi gangguan, sehingga simulasi satu menit gangguan ditambah satu menit koreksi berakhir di menit ke-2.
- Status **Dalam rentang/Di luar rentang** pada hasil mengacu pada suhu inti produk, bukan bacaan sensornya.

Kenaikan bacaan sensor tidak selalu berarti suhu inti produk sudah berubah sebesar itu. Sebaliknya, sensor yang bias dapat membuat termostat menyalakan atau mematikan pendingin pada saat yang keliru.

## Monitoring dan Pengelolaan Shipment

Halaman **Monitoring** memakai fungsi langkah termal yang sama dengan halaman simulasi:

- Pilih shipment untuk melihat profil dan rentang produknya.
- Ringkasan memisahkan suhu udara, inti produk, bacaan sensor, dan kondisi pendingin.
- **Mulai monitoring** memajukan model lima detik virtual setiap lima detik nyata. **Jeda monitoring** menghentikan interval tersebut.
- Pilih tahap pengiriman secara terpisah: Dalam persiapan, Siap dikirim, Dalam pengantaran, Ditahan, Karantina, atau Selesai.
- Aksi kontrol suhu membuka formulir pencatatan suhu inti hasil pemeriksaan. Formulir ini memperbarui estimasi suhu produk, bukan offset sensor atau suhu udara.
- Data tersimpan di `localStorage` pada browser yang digunakan. Data tidak tersinkron ke browser atau perangkat lain.

Report hanya menampilkan **READY FOR SHIPMENT** jika suhu produk berada dalam rentang dan tahap pengiriman bukan Ditahan atau Karantina. Mengembalikan suhu ke rentang tidak otomatis menghapus status Karantina atau menggantikan proses pemeriksaan mutu.

## Batas Penggunaan

Semua parameter awal dibuat untuk demonstrasi. Model ini tidak mewakili gradien suhu di berbagai posisi, lapisan kemasan, perubahan fase produk, kelembapan, detail siklus kompresor, panas dari produk atau elektronik, maupun noise sensor yang diukur. Nilai fisika aktual bergantung pada wadah, massa dan jenis produk, pola muatan, kondisi lingkungan, serta perangkat yang dipakai.

Karena itu, gunakan grafik untuk memahami perilaku relatif antar-skenario, bukan sebagai bukti kepatuhan, jaminan suhu aktual, atau dasar keputusan keamanan produk. Penggunaan operasional memerlukan data parameter yang terukur, kalibrasi sensor, dan validasi eksperimen pada konfigurasi pengiriman sebenarnya.
