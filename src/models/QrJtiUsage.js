const mongoose = require('mongoose');

const qrJtiUsageSchema = new mongoose.Schema(
  {
    jti: { type: String, required: true, unique: true, index: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    issuedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, required: true, default: Date.now },
    scannerStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: false }
);

// Keep replay evidence for 24h after token expiration.
qrJtiUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('QrJtiUsage', qrJtiUsageSchema);
