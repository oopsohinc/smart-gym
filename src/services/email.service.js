const nodemailer = require('nodemailer');

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

const SEND_TIMEOUT_MS = 10000; // 10 giây timeout gửi email

let transporter = null;

if (EMAIL_USER && EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS
    },
    // Thêm timeout tránh treo khi SMTP không phản hồi
    connectionTimeout: 8000,  // 8s kết nối
    greetingTimeout: 5000,    // 5s chờ greeting
    socketTimeout: 10000      // 10s mỗi socket operation
  });
} else {
  console.warn('⚠️ Warning: EMAIL_USER and EMAIL_PASS are not configured in your .env. Real emails will NOT be sent.');
}

async function sendResetPasswordEmail(to, otpCode) {
  const mailOptions = {
    from: `"SV Gym Management" <${EMAIL_USER || 'no-reply@svgym.com'}>`,
    to,
    subject: '[SV Gym] Mã OTP khôi phục mật khẩu tài khoản',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e1e8ed; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #1a73e8; text-align: center; margin-bottom: 20px;">Mã Xác Thực OTP</h2>
        <p>Xin chào,</p>
        <p>Chúng tôi nhận được yêu cầu khôi phục mật khẩu cho tài khoản SV Gym liên kết với email này.</p>
        <p>Dưới đây là mã xác thực OTP của bạn (mã có hiệu lực trong vòng <strong>10 phút</strong>):</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <div style="display: inline-block; padding: 15px 40px; background-color: #f1f3f4; border-radius: 8px; border: 1px dashed #1a73e8; text-align: center;">
            <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1a73e8;">${otpCode}</span>
          </div>
        </div>
        
        <p style="color: #666; font-size: 13px;">Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này để bảo mật tài khoản. Tuyệt đối không chia sẻ mã OTP này với bất kỳ ai.</p>
        <hr style="border: none; border-top: 1px solid #e1e8ed; margin: 30px 0;">
        <p style="text-align: center; color: #999; font-size: 12px;">© ${new Date().getFullYear()} SV Gym. All rights reserved.</p>
      </div>
    `
  };

  if (!transporter) {
    console.log(`[Mock Email] Sending reset email to ${to}. OTP: ${otpCode}`);
    return { mock: true, otpCode };
  }

  // Race giữa sendMail và timeout để không treo vô thời hạn
  const sendPromise = transporter.sendMail(mailOptions);
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Email send timeout after ' + SEND_TIMEOUT_MS + 'ms')), SEND_TIMEOUT_MS)
  );

  return Promise.race([sendPromise, timeoutPromise]);
}

module.exports = {
  sendResetPasswordEmail
};

