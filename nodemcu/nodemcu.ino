#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WebServer.h>
#include <HttpClient.h>
#include <WiFiClient.h>
#include <string.h>
#include <DHT.h>
#include <Adafruit_GFX.h>   
#include <Adafruit_ST7735.h>

// #define DEVICE "nodemcu" // gezgin
#define DEVICE "stm32f103c8" // ana sunucu röle
#define MASTER_ESP // ana sunucu röle

#define SERVER_IP "192.168.4.2"
#define SERVER_PORT 3000

#define DHTPIN 5 //d1
#define DHTTYPE DHT11 
DHT dht(DHTPIN, DHTTYPE);

#ifdef MASTER_ESP
#define RELAY_PIN 16 //d0
#endif
#define TFT_RST   2     //  D4 (GPIO2)
#define TFT_CS    0     //  D3 (GPIO0)
#define TFT_DC    4     //  D2 (GPIO4)
// SCL (CLK) ---> NodeMCU pin D5 (GPIO14) d5
// sda(DIN) ---> NodeMCU pin  D7 (GPIO13)

Adafruit_ST7735 tft = Adafruit_ST7735(TFT_CS,  TFT_DC, TFT_RST);
const char *ssid = "NodeMCU";
const char *password = "00000000";
bool wifiConnected = false;
ESP8266WebServer server(80);
const char *loginPage = R"(
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login</title>
</head>
<body>
    <h2>Login</h2>
    <form action="/check-login" method="post">
        <label for="username">SSID:</label><br>
        <input type="text" id="username" name="username"><br>
        <label for="password">Password:</label><br>
        <input type="password" id="password" name="password"><br><br>
        <input type="submit" value="Login">
    </form>
</body>
</html>
)";

void postDataToServer(float temperature, float humidity)
 {
  
WiFiClient client;
  HTTPClient http;

  http.begin(client,"http://" + String(SERVER_IP) + ":" + String(SERVER_PORT) + "/sicaklik?device=" + String(DEVICE) + "&sicaklik=" + String(temperature) + "&nem=" + String(humidity));
  http.addHeader("Content-Type", "application/json");
  int httpCode = http.POST(NULL,0);
  http.end();
 
  Serial.print("HTTP response code: ");
  Serial.println(httpCode);
  
}

void handleRoot() {
  Serial.println("/ İSTEK GELDİ");
  server.send(200, "text/html", loginPage);
}
void handleLoginCheck() {
  String username = server.arg("username");
  String password = server.arg("password");
Serial.printf("%s %s \n",username,password);
  // Burada kullanıcı adı ve şifrenin kontrolü yapılabilir. Örneğin:
  size_t time=0;
  WiFi.begin(username, password);
    while (WiFi.status() != WL_CONNECTED) {
      time++;
    tft.print("."); 
    delay(1000);
    tft.println("Baglaniliyor"); 
    Serial.println("Connecting to WiFi...");
    if(time > 10 && WiFi.status() != WL_CONNECTED){
      tft.println("Bağlanılamadı"); 
      server.send(401, "text/plain", "connecting failed");
      return;
    }
  }
    server.sendHeader("Location", "http://"SERVER_IP":" + String(SERVER_PORT), true);
    server.send( 302, "text/plain", "");
    //server.send(200, "text/plain", "Login successful");
    delay(1000);
  wifiConnected = true;
 // WiFi.softAPdisconnect();
 // server.close();
}

#ifdef MASTER_ESP
void controlRelay(int state)
{
  if (state == 1)
  {
    digitalWrite(RELAY_PIN, HIGH);
    Serial.println("açıldı");
  }
  else if (state == 0) 
  {
    digitalWrite(RELAY_PIN, LOW);
    Serial.println("kapatıldı");
  }
}

int veriAl()
{
  HTTPClient http;
  WiFiClient client;
  http.begin(client, "http://" + String(SERVER_IP) + ":" + String(SERVER_PORT) + "/sicaklik/response");
  http.addHeader("Content-Type", "application/json");
  int httpCode = http.GET();
  http.end();

  int is_open = httpCode==200 ? 1 :0;
  controlRelay(is_open);
  Serial.println(httpCode);
  return is_open;
}
#endif

void setup() {
  #ifdef MASTER_ESP
  pinMode(RELAY_PIN, OUTPUT);
  #endif

  Serial.begin(115200);

  tft.initR(INITR_MINI160x80); 
  tft.setRotation(1);
  tft.fillScreen(ST7735_GREEN);
  tft.setTextWrap(true);
  tft.setTextSize(2);
  tft.setTextColor(ST7735_WHITE);
  tft.setCursor(0, 0);

  WiFi.softAP(ssid, password);
  Serial.println("Access Point oluşturuldu");
  Serial.print("Access Point IP adresi: ");
  Serial.println(WiFi.softAPIP());
  server.on("/", handleRoot);
  server.on("/check-login", HTTP_POST, handleLoginCheck);
  server.begin();
  Serial.println("HTTP sunucusu başlatıldı");
}

void loop() {

  tft.setCursor(0, 0);
  tft.fillScreen(ST7735_GREEN );

  if(!wifiConnected){
    server.handleClient();
    tft.println("Wifi konfigrasyonu yapiniz!");   
    return;
  }

  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();
  char str[64] = {0};
  sprintf(str, "Sicaklik: %.0f", temperature); 
  tft.println(str); 
  sprintf(str, "Nem: %.1f", humidity); 
  tft.println(str);
  Serial.println(str);
  #ifdef MASTER_ESP
      tft.println(veriAl() == 1 ? "Kombi acik" : "Kombi kapali");
  #endif
  postDataToServer(temperature, humidity);
  

  delay(5000); 
}
