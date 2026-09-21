const express = require("express");
const mailRouter = express.Router();
const mailController = require("../controllers/mailController");
const {
  mailRateLimiter,
  validateMailInput,
  verifyCaptcha,
} = require("../middlewares/mailSecurity");

mailRouter.post(
  "/send-mail",
  mailRateLimiter,
  validateMailInput,
  verifyCaptcha,
  mailController.sendMail
);

module.exports = mailRouter;
