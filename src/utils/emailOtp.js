const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
dotenv.config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER || "gamingafriza005@gmail.com",
    pass: process.env.EMAIL_PASS || "prcypthkwnplsuzv",
  },
});

console.log("EMAIL_USER:", process.env.EMAIL_USER);
console.log("EMAIL_PASS:", process.env.EMAIL_PASS ? "OK" : "MISSING");

const sendVerificationEmail = async (email, username, verificationToken) => {
  const mailOptions = {
    from: `"ZACloth Support" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Verify Your Email Address to Complete Registration",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Email Verification</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; line-height: 1.6; background-color: #f4f4f4;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #ffffff; padding: 40px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <!-- Header -->
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #333333; margin: 0; font-size: 24px;">Welcome to ZACloth!</h1>
              </div>

              <!-- Content -->
              <div style="margin-bottom: 30px;">
                <p style="margin-bottom: 15px;">Hello <strong>${username}</strong>,</p>
                <p style="margin-bottom: 15px;">Thank you for signing up with ZACloth! We're thrilled to have you on board.</p>
                <p style="margin-bottom: 15px;">To ensure the security of your account and access all the features, please use the following OTP to verify your email address:</p>
                
                <!-- OTP Box -->
                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; text-align: center; margin: 25px 0;">
                  <span style="font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #007bff;">
                    ${verificationToken}
                  </span>
                </div>

                <p style="margin-bottom: 15px;">Once your email is verified, you'll be ready to dive into ZACloth's exciting features.</p>
                <p style="margin-bottom: 15px;">If you did not register with us, please ignore this email or contact our support team at <a href="mailto:support@zacloth.com" style="color: #007bff; text-decoration: none;">support@zacloth.com</a>.</p>
              </div>

              <!-- Footer -->
              <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eeeeee;">
                <p style="margin-bottom: 10px;">Thank you for choosing ZACloth!</p>
                <p style="margin: 0; color: #666666;">Best regards,<br>ZACloth Team</p>
              </div>
            </div>

            <!-- Disclaimer -->
            <div style="text-align: center; margin-top: 20px; color: #999999; font-size: 12px;">
              <p>This is an automated message, please do not reply to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `,
  };

  await transporter.sendMail(mailOptions);
  return verificationToken;
};

module.exports = {
  sendVerificationEmail,
};
