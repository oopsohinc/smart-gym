const mongoose = require('mongoose');

const packageSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    durationValue: { type: Number, required: true, min: 1 },
    durationUnit: { type: String, enum: ['day', 'month', 'year'], required: true },
    price: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

packageSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Package', packageSchema);
