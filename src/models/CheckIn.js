const mongoose = require('mongoose');
const { CHECKIN_METHOD, CHECKIN_STATUS } = require('../constants/enums');

const checkInSchema = new mongoose.Schema(
  {
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    method: {
      type: String,
      enum: Object.values(CHECKIN_METHOD),
      required: true
    },
    status: {
      type: String,
      enum: Object.values(CHECKIN_STATUS),
      required: true,
      index: true
    },
    failReason: {
      type: String,
      enum: [
        'qr_expired',
        'qr_replayed',
        'invalid_signature',
        'no_active_subscription',
        'member_blocked',
        'cooldown_violation',
        'unknown'
      ]
    },
    checkInAt: { type: Date, default: Date.now, index: true },
    qrJti: { type: String, index: true }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

checkInSchema.index({ memberId: 1, checkInAt: -1 });
checkInSchema.index({ status: 1, checkInAt: -1 });

module.exports = mongoose.model('CheckIn', checkInSchema);
