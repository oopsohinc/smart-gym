const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, required: true, unique: true, trim: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true, index: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Package', required: true },
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
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed'],
      default: 'paid',
      index: true
    },
    transactionRef: { type: String, trim: true, index: true },
    transactionNo: { type: String, trim: true },
    paidAt: { type: Date },
    gatewayPayload: { type: mongoose.Schema.Types.Mixed }
  },
  { timestamps: true }
);

invoiceSchema.index({ memberId: 1, createdAt: -1 });

module.exports = mongoose.model('Invoice', invoiceSchema);