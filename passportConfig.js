const LocalStrategy = require("passport-local").Strategy;
const { pool } = require("./dbConfig");
const bcrypt = require("bcrypt");
const winston = require("winston");
const path = require("path");

const logFilePath = path.join(__dirname, "logs", "app.log");
const logger = winston.createLogger(
  {
  level: "info",
  format: winston.format.json(),
  defaultMeta: { service: "tasarim-server" },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: logFilePath }),
  ],
});


function initialize(passport) {
  console.log("Initialized");

  const authenticateUser = (req, email, password, done) => {
    console.log(email, password);
    pool.query(
      `SELECT * FROM users WHERE email = $1`,
      [email],
      (err, results) => {
        if (err) {
          throw err;
        }
        console.log(results.rows);

        if (results.rows.length > 0) {
          const user = results.rows[0];

          bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err) {
              console.log(err);
            }
            if (isMatch) {
              return done(null, user);
            } else {
              logger.warn({
                message: "Failed login attempt",
                date: new Date(),
                email: email,
                reason: "Password is incorrect",
                ip: req.ip // IP adresini ekleyin
              });
              return done(null, false, { message: "Password is incorrect" });
            }
          });
        } else {
          logger.warn({
            message: "Failed login attempt",
            date: new Date(),
            email: email,
            reason: "No user with that email address",
            ip: req.ip // IP adresini ekleyin
          });
          return done(null, false, { message: "No user with that email address" });
        }
      }
    );
  };

  passport.use(
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
        passReqToCallback: true, // req parametresini callback fonksiyonuna geçir
      },
      authenticateUser
    )
  );

  passport.serializeUser((user, done) => done(null, user.id));

  passport.deserializeUser((id, done) => {
    pool.query(`SELECT * FROM users WHERE id = $1`, [id], (err, results) => {
      if (err) {
        return done(err);
      }
      console.log(`ID is ${results.rows[0].id}`);
      return done(null, results.rows[0]);
    });
  });
}

module.exports = initialize;
