const mongoose = require('mongoose');
const { ORDER_STATUS } = require('../constants/enums');

const orderSchema = new mongoose.Schema(
  {
    orderNo: { type: String, required: true, unique: true, trim: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Package', required: true },
    type: {
      type: String,
      enum: ['new_purchase', 'renewal', 'counter_sale'],
      required: true
    },
    amount: { type: Number, required: true, min: 0 },
    paymentMethod: {
      type: String,
      enum: ['bank_transfer', 'cash', 'ewallet', 'vnpay'],
      required: true
    },
    paymentProvider: {
      type: String,
      enum: ['manual', 'vnpay'],
      default: 'manual'
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'success', 'failed'],
      default: 'pending',
      index: true
    },
    transactionRef: { type: String, trim: true, index: true },
    transactionNo: { type: String, trim: true },
    paidAt: { type: Date },
    gatewayPayload: { type: mongoose.Schema.Types.Mixed },
    receiptImageUrl: { type: String },
    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.PENDING,
      index: true
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    note: { type: String }
  },
  { timestamps: true }
);

orderSchema.index({ memberId: 1, status: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
