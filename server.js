require("dotenv").config();

const express = require("express");
const routes = require("./routes");
const APP_PORT = process.env.APP_PORT || 3001;
const app = express();
const cors = require("cors");

// Vercel sits in front of the app as a single reverse proxy, so trust
// only that one hop's X-Forwarded-For — needed for express-rate-limit
// (and req.ip in general) to see the real client IP instead of Vercel's.
app.set("trust proxy", 1);

const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!allowedOrigins.length) {
  console.warn(
    "[CORS] FRONTEND_URL no está definido: se permiten peticiones desde cualquier origen."
  );
}

app.use(
  cors(
    allowedOrigins.length
      ? {
          origin: allowedOrigins,
        }
      : undefined
  )
);

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
// app.set("view engine", "ejs");
app.use(express.json());

routes(app);

app.listen(APP_PORT, () =>
  console.log(`\n[Express] Servidor corriendo en el puerto ${APP_PORT}!\n`)
);
