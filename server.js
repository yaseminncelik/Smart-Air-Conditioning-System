const { pool, connectDatabase } = require("./dbConfig");
const express = require("express");
const winston = require("winston");
const bodyParser = require("body-parser");
const { Client } = require("pg");
const axios = require("axios");
const bcrypt = require("bcrypt");
const passport = require("passport");
const flash = require("express-flash");
const session = require("express-session");
const SSE = require('express-sse');

require("dotenv").config();

const app = express();
const sse = new SSE();

const PORT = process.env.PORT || 3000;
const path = require("path");
let subTemp = 5,
  supTemp = 18;
let isOpen = false;
const dbConfig = {
  user: "postgres",
  password: "postgres",
  host: "localhost",
  port: 5432,
  database: "tasarim-server",
};

const modlar = {
  yaz: "yaz",
  kis: "kis",
  sbahar: "sonbahar",
  ibahar: "ilkbahar",
};

let mod = modlar.ibahar;
let temp= 25;

const logFilePath = path.join(__dirname, "logs", "app.log");
const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),

  defaultMeta: { service: "tasarim-server" },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: logFilePath }),
  ],
});

const warnLogger= winston.createLogger(
  {
  level: "warn",
  format: winston.format.json(),
  defaultMeta: { service: "tasarim-server" },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: logFilePath }),
  ],
});

const initializePassport = require("./passportConfig");

initializePassport(passport);
app.use(express.urlencoded({ extended: false }));
app.set("view engine", "ejs");

app.use((req, res, next) => {
  logger.info(
    `date:${new Date()} ip:${req.ip} path:${req.path} params:${JSON.stringify(req.params)} query:${JSON.stringify(req.query)} user-agent:${
      req.headers["user-agent"] 
    } body:${JSON.stringify(req.body)} message:${"Request received"}`
  );
  next();
});

app.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      warnLogger.warn(
        `message:"Failed login attempt" date:${new Date()} ip:${ req.ip} email:${ req.body.email} body:${JSON.stringify(req.body)} reason: ${info.message} userAgent: ${req.headers["user-agent"]}`
      );
      return res.status(401).json({ message: info.message });
    }
    req.logIn(user, (err) => {
      if (err) {
        return next(err);
      }
      return res.redirect("/dashboard");
    });
  })(req, res, next);
});

const client = new Client(dbConfig);

client.connect((err) => {
  if (err) {
    console.error("PostgreSQL bağlantı hatası:", err);
  } else {
    console.log("PostgreSQL ile bağlantı kuruldu");
  }
});

function calculateDifference({ stm32f, nodemcu }) {
  console.log({isOpen});

  if (isOpen !== null) {
    return isOpen;
  }
  if (stm32f.sicaklik <= supTemp) {
    return true;
  }
  if (
    nodemcu.sicaklik < supTemp &&
    Math.abs(stm32f.sicaklik - nodemcu.sicaklik) < subTemp
  ) {
    return true;
  }
  return false;
}
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: false }));
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

app.post("/sicaklik", (req, res) => {
  const { device, sicaklik, nem } = req.query;

  if (
    !device ||
    !sicaklik ||
    !nem ||
    (device !== "stm32f103c8" && device !== "nodemcu")
  ) {
    return res.status(400).send("Geçersiz istek: Geçersiz parametreler");
  }
  console.log({ device, sicaklik, nem });
  const tableName = device === "stm32f103c8" ? "stm32f_tablo" : "nodemcu_tablo";
  const query = `INSERT INTO ${tableName} (sicaklik, nem) VALUES ($1, $2)`;
  temp = sicaklik;

  client.query(query, [sicaklik, nem], (err, result) => {
    if (err) {
      console.error("PostgreSQL sorgu hatası:", err);
      res.status(500).send("Sunucu Hatası");
    } else {
      console.log(`${tableName} tablosuna veri eklendi`);
      res.status(200).send("OK");
    }
  });
});

app.get("/sicaklik", async (req, res) => {
  console.log("GET /sicaklik");
  try {
    const nodemcu = (await client.query("select * from nodemcu_tablo")).rows;
    const stm = (await client.query("select * from stm32f_tablo")).rows;

    res.json({
      nodemcu,
      stm,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send("Sunucu Hatası");
  }
});

// stm istek atıp açacağını belirleyecek
app.get("/sicaklik/response", async (req, res) => {
  console.log("sicaklik/response");
  let nodemcu = (
    await client.query(`  SELECT sicaklik, nem
  FROM nodemcu_tablo
  ORDER BY TIMESTAMP DESC
  LIMIT 1
  `)
  ).rows[0];
  let stm32f = (
    await client.query(`  SELECT sicaklik, nem
  FROM stm32f_tablo
  ORDER BY TIMESTAMP DESC
  LIMIT 1
  `)
  ).rows[0];

  console.log({ stm32f, nodemcu }); //değiş

  res
    .status(calculateDifference({ stm32f, nodemcu }) ? 200 : 400)
    .json({
      nodemcu,
      stm32f,
    });
});
app.post("/modlar", (req, res) => {
  console.log({body: req.body});
  const { mod: modFromBody } = req.body;
  if (!mod) {
    return res.status(400).json("Mod bilgisi bulunamadı");
  }
  if (!Object.values(modlar).includes(mod)) {
    return res.status(400).json(`Hatalı Mod bilgisi: ${mod} `);
  }

  switch (modFromBody) {
    case "ac":
      isOpen = true;
      return res.send("ok");
      break;
    case "kapa":
      isOpen = false;
      return res.send("ok");
      break;
    case modlar.yaz:
      subTemp = 5;
      supTemp = 50;
      mod = modlar.yaz;
      break;
    case modlar.kis:
      subTemp = 0;
      supTemp = 15;
      mod = modlar.kis;
      break;
    case modlar.ibahar:
      subTemp = 15;
      supTemp = 25;
      mod = modlar.ibahar;
      break;
    case modlar.sbahar:
      subTemp = 17;
      supTemp = 22;
      mod = modlar.sbahar;
      break;
    default:
      break;
  }
  isOpen = null;
  res.send("ok");
});
app.post("/ac-kapa", (req, res) => {
  const { status } = req.body;
  //status olup olmadığı kontrol edilmeli
  isOpen = status;
  return res
    .status(200)
    .json(`Kombi başarıyla ${isOpen ? "açıldı" : "kapandı"}`);
});
app.get("/", (req, res) => {
  res.render("index.ejs");
});

app.get("/users/register", checkAuthenticated, (req, res) => {
  res.render("register.ejs");
});

app.get("/users/login", checkAuthenticated, (req, res) => {
  console.log(req.session.flash);
  res.render("login.ejs");
});

app.get("/users/dashboard", checkNotAuthenticated, (req, res) => {
  console.log({ auth: req.isAuthenticated() });
  res.render("dashboard", { user: req.user.name, mod, isOpen, temp });
});

app.get("/users/logout", (req, res) => {
  req.logout();
  res.render("index", { message: "You have logged out successfully" });
});

app.post("/users/register", async (req, res) => {
  let { name, email, password, password2 } = req.body;

  let errors = [];

  console.log({
    name,
    email,
    password,
    password2,
  });

  if (!name || !email || !password || !password2) {
    errors.push({ message: "Please enter all fields" });
  }

  if (password.length < 6) {
    errors.push({ message: "Password must be a least 6 characters long" });
  }

  if (password !== password2) {
    errors.push({ message: "Passwords do not match" });
  }

  if (errors.length > 0) {
    res.render("register", { errors, name, email, password, password2 });
  } else {
    hashedPassword = await bcrypt.hash(password, 10);
    console.log(hashedPassword);

    let results = await pool.query(
      `SELECT * FROM users
        WHERE email = $1`,
      [email]
    );

    if (results.rows.length > 0) {
      return res.render("register", {
        message: "Email already registered",
      });
    } else {
      pool.query(
        `INSERT INTO users (name, email, password)
              VALUES ($1, $2, $3)
              RETURNING id, password`,
        [name, email, hashedPassword]
      );
      req.flash("success_msg", "You are now registered. Please log in");
      res.redirect("/users/login");
    }
  }
});
app.post(
  "/users/login",
  passport.authenticate("local", {
    successRedirect: "/users/dashboard",
    failureRedirect: "/users/login",
    failureFlash: true,
  })
);

app.get('/events', (request, response, next) =>{
  response.flush = response.flushHeaders;
  sse.init(request, response);

  let id = setInterval(()=>{
    sse.send({ time: new Date().toLocaleTimeString(), isOpen,
      temp, });
  }, 10000);


  request.on('close', () => {
    clearInterval(id);
  });
});

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect("/users/dashboard");
  }
  next();
}

function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/users/login");
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
