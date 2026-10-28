// Разведочная прошивка Игоряшгочи для SmallTV-PRO.
//
// Задача — безопасно проверить путь: экран, Wi-Fi и своё обновление по воздуху.
//   * комната и Игоряша, который дышит и моргает (src/assets.h);
//   * страница http://<ip>/ (или igoryasha.local): разделы, память, сеть;
//   * /update — залить следующую прошивку, как у стока;
//   * «Вернуться на сток» — загрузка со второго OTA-слота, где лежит стоковая прошивка;
//   * то же без сети: держать сенсорную кнопку сверху 5 секунд.
// Файловый раздел не трогаем: там картинки стока, он нужен ему при возврате.

#include <Arduino.h>
#include <Arduino_GFX_Library.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <SPI.h>
#include <Update.h>
#include <WebServer.h>
#include <WiFi.h>
#include <esp_flash.h>
#include <esp_ota_ops.h>

#include "assets.h"

// Пины SmallTV-PRO (smalltv-mod, src/board_esp32_pro.h)
constexpr int TFT_SCLK = 18, TFT_MOSI = 23, TFT_DC = 2, TFT_RST = 4, TFT_BL = 25;
constexpr int TOUCH_PIN = 32;
constexpr uint8_t BRIGHTNESS = 60;   // %, подсветка инвертирована
constexpr uint32_t STOCK_HOLD_MS = 5000;
const char *SETUP_AP = "Igoryasha-Setup";

// ST7789 на SmallTV принимает SPI только в mode 3, CS посажен на землю.
class SmallTvST7789 : public Arduino_ST7789 {
 public:
  using Arduino_ST7789::Arduino_ST7789;
  bool begin(int32_t speed = GFX_NOT_DEFINED) override {
    _override_datamode = SPI_MODE3;
    return Arduino_TFT::begin(speed);
  }
};

Arduino_DataBus *bus = new Arduino_HWSPI(TFT_DC, GFX_NOT_DEFINED, TFT_SCLK, TFT_MOSI, GFX_NOT_DEFINED, &SPI);
Arduino_GFX *gfx = new SmallTvST7789(bus, TFT_RST, 0, true, 240, 240, 0, 0, 0, 80);
WebServer server(80);
Preferences prefs;
bool setupMode = false;

// ---- экран ------------------------------------------------------------------

void setBrightness(uint8_t pct) {
  analogWrite(TFT_BL, 255 - pct * 255 / 100);
}

void drawRoom() {
  gfx->draw16bitRGBBitmap(0, 0, ROOM, 240, 240);
}

// Плашка с адресом сверху: без неё не узнать, куда заходить.
void drawBanner(const String &line1, const String &line2) {
  gfx->fillRect(0, 0, 240, 30, RGB565_BLACK);
  gfx->setTextColor(RGB565_WHITE);
  gfx->setTextSize(1);
  gfx->setCursor(6, 5);
  gfx->print(line1);
  gfx->setCursor(6, 18);
  gfx->print(line2);
}

// Статика как в js/animations.js: вдохи кадрами 0–5, иногда моргает (кадр k+6).
const uint16_t BREATH_MS[] = {400, 300, 300, 400, 300, 300};
constexpr float SPEED = 1.75;
int breath = 0, blinkLeft = 0;
uint32_t nextFrameAt = 0;

void animate() {
  uint32_t now = millis();
  if (now < nextFrameAt) return;
  int frame = breath;
  uint32_t ms = BREATH_MS[breath];
  if (blinkLeft > 0) {
    frame += 6;
    ms = 100;
    blinkLeft--;
  } else {
    breath = (breath + 1) % 6;
    if (random(18) == 0) blinkLeft = 1;
  }
  gfx->draw16bitRGBBitmap(IDLE_X, IDLE_Y, IDLE[frame], IDLE_W, IDLE_H);
  nextFrameAt = now + ms / SPEED;
}

// ---- возврат на сток ----------------------------------------------------------

// Второй OTA-слот — тот, куда сток записал нас; сам он лежит в другом.
const esp_partition_t *stockPartition() {
  const esp_partition_t *other = esp_ota_get_next_update_partition(nullptr);
  esp_app_desc_t desc;
  if (!other || esp_ota_get_partition_description(other, &desc) != ESP_OK) return nullptr;
  return other;
}

bool bootStock() {
  const esp_partition_t *p = stockPartition();
  if (!p || esp_ota_set_boot_partition(p) != ESP_OK) return false;
  drawBanner("Back to stock firmware...", "");
  delay(500);
  ESP.restart();
  return true;
}

// Сенсорная кнопка сверху: нажата, когда touchRead падает ниже 85% от покоя.
uint32_t touchBase = 0, touchSince = 0;

void checkTouch() {
  uint32_t v = touchRead(TOUCH_PIN);
  if (!touchBase || v >= touchBase * 85 / 100) {
    if (touchSince) drawRoom();
    touchSince = 0;
    return;
  }
  uint32_t now = millis();
  if (!touchSince) touchSince = now;
  uint32_t held = now - touchSince;
  gfx->fillRect(0, 236, 240 * min(held, STOCK_HOLD_MS) / STOCK_HOLD_MS, 4, RGB565_RED);
  if (held >= STOCK_HOLD_MS) bootStock();
}

// ---- сеть ----------------------------------------------------------------------

String partitionInfo(const esp_partition_t *p) {
  if (!p) return "—";
  esp_app_desc_t d;
  String s = String(p->label) + " @0x" + String(p->address, HEX) + ", " + String(p->size / 1024) + " КБ";
  if (esp_ota_get_partition_description(p, &d) == ESP_OK)
    s += " — " + String(d.project_name) + " " + String(d.version) + " (" + String(d.date) + ")";
  return s;
}

String page() {
  String h = F("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'>"
               "<title>Игоряшгочи</title><style>body{font:15px system-ui;margin:20px;max-width:640px}"
               "td{padding:3px 10px 3px 0;vertical-align:top}button{padding:8px 14px;margin:6px 0}</style>"
               "<h2>Игоряшгочи — разведка</h2><table>");
  auto row = [&](const String &k, const String &v) { h += "<tr><td>" + k + "<td>" + v; };
  row("Работает из", partitionInfo(esp_ota_get_running_partition()));
  row("Второй слот (сток)", partitionInfo(stockPartition()));
  row("Флеш", String(ESP.getFlashChipSize() / 1024 / 1024) + " МБ");
  row("Свободно RAM", String(ESP.getFreeHeap() / 1024) + " КБ, PSRAM " + String(ESP.getPsramSize() / 1024) + " КБ");
  row("Чип", String(ESP.getChipModel()) + " rev " + String(ESP.getChipRevision()) + ", " + String(ESP.getCpuFreqMHz()) + " МГц");
  row("Сеть", setupMode ? String("точка доступа ") + SETUP_AP : WiFi.SSID() + ", " + WiFi.RSSI() + " dBm");
  row("Кнопка", "покой " + String(touchBase) + ", сейчас " + String(touchRead(TOUCH_PIN)));
  h += F("</table><h3>Разделы</h3><table>");
  esp_partition_iterator_t it = esp_partition_find(ESP_PARTITION_TYPE_ANY, ESP_PARTITION_SUBTYPE_ANY, nullptr);
  for (; it; it = esp_partition_next(it)) {
    const esp_partition_t *p = esp_partition_get(it);
    row(p->label, "тип " + String(p->type) + "/" + String(p->subtype) + " @0x" + String(p->address, HEX) +
                      ", " + String(p->size / 1024) + " КБ");
  }
  esp_partition_iterator_release(it);
  h += F("</table><h3>Бэкап</h3><p><a href=/backup>Вся флешка, 8 МБ</a> — сначала скачать его: "
         "следующее обновление запишется поверх стока.</p>"
         "<h3>Обновить прошивку</h3><form method=post action=/update enctype=multipart/form-data>"
         "<input type=file name=firmware accept=.bin> <button>Залить</button></form>"
         "<h3>Вернуться на сток</h3><form method=post action=/stock "
         "onsubmit=\"return confirm('Загрузиться со стоковой прошивки?')\"><button>Вернуться на сток</button></form>"
         "<p>Без сети: держать сенсорную кнопку сверху 5 секунд.</p>");
  if (setupMode)
    h += F("<h3>Wi-Fi</h3><form method=post action=/wifi>Сеть <input name=ssid> Пароль <input name=pass type=password>"
           " <button>Сохранить</button></form>");
  return h;
}

void setupServer() {
  server.on("/", HTTP_GET, [] { server.send(200, "text/html", page()); });
  server.on("/stock", HTTP_POST, [] {
    if (!stockPartition()) return server.send(500, "text/plain; charset=utf-8", "Во втором слоте нет прошивки");
    server.send(200, "text/plain; charset=utf-8", "Перезагружаюсь на сток");
    delay(300);
    bootStock();
  });
  // Бэкап: вся флешка (/backup) или один раздел (/backup?part=app0). Следующий /update
  // запишется во второй слот поверх стока, так что сток надо сохранить до этого.
  server.on("/backup", HTTP_GET, [] {
    uint32_t start = 0, size = ESP.getFlashChipSize();
    String name = "smalltv-pro-full.bin";
    if (server.hasArg("part")) {
      const esp_partition_t *p = esp_partition_find_first(ESP_PARTITION_TYPE_ANY, ESP_PARTITION_SUBTYPE_ANY,
                                                          server.arg("part").c_str());
      if (!p) return server.send(404, "text/plain; charset=utf-8", "Нет такого раздела");
      start = p->address;
      size = p->size;
      name = "smalltv-pro-" + server.arg("part") + ".bin";
    }
    server.setContentLength(size);
    server.sendHeader("Content-Disposition", "attachment; filename=" + name);
    server.send(200, "application/octet-stream", "");
    static uint8_t buf[4096];
    for (uint32_t off = 0; off < size; off += sizeof(buf)) {
      uint32_t n = min<uint32_t>(sizeof(buf), size - off);
      if (esp_flash_read(nullptr, buf, start + off, n) != ESP_OK) break;
      if (server.client().write(buf, n) != n) break;
    }
  });
  server.on("/wifi", HTTP_POST, [] {
    prefs.putString("ssid", server.arg("ssid"));
    prefs.putString("pass", server.arg("pass"));
    server.send(200, "text/plain; charset=utf-8", "Сохранил, перезагружаюсь");
    delay(300);
    ESP.restart();
  });
  server.on(
      "/update", HTTP_POST,
      [] {
        bool ok = !Update.hasError();
        server.send(ok ? 200 : 500, "text/plain; charset=utf-8", ok ? "Готово, перезагружаюсь" : Update.errorString());
        delay(300);
        if (ok) ESP.restart();
      },
      [] {
        HTTPUpload &u = server.upload();
        if (u.status == UPLOAD_FILE_START) {
          drawBanner("Updating firmware...", u.filename);
          Update.begin(UPDATE_SIZE_UNKNOWN);
        } else if (u.status == UPLOAD_FILE_WRITE) {
          Update.write(u.buf, u.currentSize);
        } else if (u.status == UPLOAD_FILE_END) {
          Update.end(true);
        }
      });
  server.begin();
}

// Своя сохранённая сеть, иначе та, что ESP32 помнит со стока; не вышло — точка доступа.
void setupWifi() {
  WiFi.mode(WIFI_STA);
  String ssid = prefs.getString("ssid", "");
  if (ssid.length()) WiFi.begin(ssid.c_str(), prefs.getString("pass", "").c_str());
  else WiFi.begin();
  drawBanner("Connecting to Wi-Fi...", ssid);
  for (uint32_t t = millis(); WiFi.status() != WL_CONNECTED && millis() - t < 20000;) {
    checkTouch();
    delay(100);
  }
  if (WiFi.status() == WL_CONNECTED) {
    MDNS.begin("igoryasha");
    drawBanner("http://" + WiFi.localIP().toString(), "http://igoryasha.local");
  } else {
    setupMode = true;
    WiFi.mode(WIFI_AP);
    WiFi.softAP(SETUP_AP);
    drawBanner(String("Wi-Fi: ") + SETUP_AP, "http://192.168.4.1");
  }
}

void setup() {
  pinMode(TFT_BL, OUTPUT);
  setBrightness(0);
  gfx->begin();
  drawRoom();
  setBrightness(BRIGHTNESS);

  uint32_t sum = 0;
  for (int i = 0; i < 16; i++) sum += touchRead(TOUCH_PIN);
  touchBase = sum / 16;

  prefs.begin("igoryasha");
  setupWifi();
  setupServer();
}

uint32_t bannerUntil = 30000;

void loop() {
  server.handleClient();
  checkTouch();
  if (bannerUntil && millis() > bannerUntil && !setupMode) {
    bannerUntil = 0;
    drawRoom();
  }
  animate();
  delay(5);
}
