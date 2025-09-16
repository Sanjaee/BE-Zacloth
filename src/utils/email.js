const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
dotenv.config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Generate payment success email subject and html based on type
 * @param {Object} params
 * @param {'role'|'star'} params.type
 * @param {string} params.username
 * @param {string} [params.role]
 * @param {number} [params.star]
 * @param {number} params.amount
 * @param {string} params.orderId
 * @returns {{ subject: string, html: string }}
 */
function getPaymentSuccessEmailTemplate({
  type,
  username,
  role,
  star,
  amount,
  orderId,
}) {
  if (type === "role") {
    return {
      subject: `Pembayaran Role ${role} Berhasil!`,
      html: `<h2>Terima kasih, ${username || "User"}!</h2>
<p>Pembelian role <b>${role}</b> Anda telah berhasil.</p>
<p>Jumlah dibayar: <b>Rp ${amount?.toLocaleString("id-ID") || "-"}</b></p>
<p>Order ID: <b>${orderId}</b></p>
<p>Silakan login ke akun Anda untuk menikmati benefit role baru.</p>`,
    };
  } else if (type === "star") {
    return {
      subject: `Upgrade Star Level ${star} Berhasil!`,
      html: `<h2>Selamat, ${username || "User"}!</h2>
<p>Upgrade star ke level <b>${star}</b> berhasil.</p>
<p>Jumlah dibayar: <b>Rp ${amount?.toLocaleString("id-ID") || "-"}</b></p>
<p>Order ID: <b>${orderId}</b></p>
<p>Terima kasih telah mendukung Lost Media!</p>`,
    };
  } else {
    return {
      subject: "Pembayaran Berhasil",
      html: `<h2>Terima kasih, ${
        username || "User"
      }!</h2><p>Pembayaran Anda telah berhasil.</p>`,
    };
  }
}

/**
 * Send payment success email (auto template)
 * @param {Object} params
 * @param {string} params.to - Recipient email
 * @param {'role'|'star'} params.type
 * @param {string} params.username
 * @param {string} [params.role]
 * @param {number} [params.star]
 * @param {number} params.amount
 * @param {string} params.orderId
 */
async function sendPaymentSuccessEmail({
  to,
  type,
  username,
  role,
  star,
  amount,
  orderId,
}) {
  if (!to) throw new Error("Recipient email is required");
  const { subject, html } = getPaymentSuccessEmailTemplate({
    type,
    username,
    role,
    star,
    amount,
    orderId,
  });
  const mailOptions = {
    from: process.env.SMTP_FROM || "no-reply@lost-media.app",
    to,
    subject,
    html,
  };
  return transporter.sendMail(mailOptions);
}

/**
 * Generate admin payment success email subject and html
 * @param {Object} params
 * @param {'role'|'star'} params.type
 * @param {string} params.username
 * @param {string} params.email
 * @param {string} [params.role]
 * @param {number} [params.star]
 * @param {number} params.amount
 * @param {string} params.orderId
 * @returns {{ subject: string, html: string }}
 */
function getAdminPaymentSuccessEmailTemplate({
  type,
  username,
  email,
  role,
  star,
  amount,
  orderId,
}) {
  let detail = "";
  if (type === "role") {
    detail = `<li>Role: <b>${role}</b></li>`;
  } else if (type === "star") {
    detail = `<li>Star Level: <b>${star}</b></li>`;
  }
  return {
    subject: `User Membayar Sukses: ${type === "role" ? "Role" : "Star"}`,
    html: `<h2>Notifikasi Pembayaran User</h2>
<p>User <b>${username}</b> (<a href="mailto:${email}">${email}</a>) telah berhasil membayar.</p>
<ul>
  <li>Jenis: <b>${type === "role" ? "Role" : "Star"}</b></li>
  ${detail}
  <li>Jumlah: <b>Rp ${amount?.toLocaleString("id-ID") || "-"}</b></li>
  <li>Order ID: <b>${orderId}</b></li>
</ul>
<p>Segera proses benefit user jika diperlukan.</p>`,
  };
}

/**
 * Send admin payment success email
 * @param {Object} params
 * @param {string} params.to - Admin email
 * @param {'role'|'star'} params.type
 * @param {string} params.username
 * @param {string} params.email
 * @param {string} [params.role]
 * @param {number} [params.star]
 * @param {number} params.amount
 * @param {string} params.orderId
 */
async function sendAdminPaymentSuccessEmail({
  to,
  type,
  username,
  email,
  role,
  star,
  amount,
  orderId,
}) {
  if (!to) throw new Error("Recipient email is required");
  const { subject, html } = getAdminPaymentSuccessEmailTemplate({
    type,
    username,
    email,
    role,
    star,
    amount,
    orderId,
  });
  const mailOptions = {
    from: "no-reply@lost-media.app",
    to,
    subject,
    html,
  };
  return transporter.sendMail(mailOptions);
}

module.exports = {
  sendPaymentSuccessEmail,
  getPaymentSuccessEmailTemplate,
  getAdminPaymentSuccessEmailTemplate,
  sendAdminPaymentSuccessEmail,
};
