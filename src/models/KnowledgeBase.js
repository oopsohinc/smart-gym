const mongoose = require('mongoose');

const knowledgeBaseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true, trim: true },
    embedding: { type: [Number], default: [] }
  },
  { timestamps: true }
);

knowledgeBaseSchema.index({ title: 'text', content: 'text' });

module.exports = mongoose.model('KnowledgeBase', knowledgeBaseSchema);