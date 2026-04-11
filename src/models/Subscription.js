const mongoose = require('mongoose');
const { SUBSCRIPTION_STATUS } = require('../constants/enums');

const subscriptionSchema = new mongoose.Schema(
  {
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Package', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: Object.values(SUBSCRIPTION_STATUS),
      default: SUBSCRIPTION_STATUS.PENDING,
      index: true
    },
    remainingDaysCache: { type: Number }
  },
  { timestamps: true }
);

subscriptionSchema.index({ memberId: 1, status: 1 });
subscriptionSchema.index({ status: 1, endDate: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
