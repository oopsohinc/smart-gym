const { GoogleGenAI } = require('@google/genai');
const { asyncHandler } = require('../utils/asyncHandler');
const { httpError } = require('../utils/httpError');
const KnowledgeBase = require('../models/KnowledgeBase');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error('GEMINI_API_KEY is required for embedding generation');
}

function buildSearchRegex(value) {
  const keyword = String(value || '').trim();
  if (!keyword) {
    return null;
  }

  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escapedKeyword, 'i');
}

function normalizeEmbedding(values) {
  if (!Array.isArray(values)) return [];
  return values.map(Number).filter(Number.isFinite);
}

async function buildEmbedding(text) {
  try {
    const genAI = new GoogleGenAI({ apiKey });
    const result = await genAI.models.embedContent({
      model: 'gemini-embedding-2',
      contents: String(text || ''),
      config: {
        outputDimensionality: 768
      }
    });

    let embeddingValues = null;
    
    if (result?.embedding?.values) {
      embeddingValues = result.embedding.values;
    } else if (result?.embeddings?.[0]?.values) {
      embeddingValues = result.embeddings[0].values;
    } else if (result?.data?.[0]?.embedding?.values) {
      embeddingValues = result.data[0].embedding.values;
    } else if (result?.data?.embeddings?.[0]?.values) {
      embeddingValues = result.data.embeddings[0].values;
    }

    if (!embeddingValues || !Array.isArray(embeddingValues)) {
      throw new Error('Embedding values not found in response');
    }

    const normalized = normalizeEmbedding(embeddingValues);

    if (normalized.length === 0) {
      throw new Error('Embedding is empty after normalization');
    }

    return normalized;
  } catch (err) {
    throw httpError(500, 'embedding_error', 'Failed to generate embedding: ' + err.message);
  }
}

const createKnowledgeBase = asyncHandler(async (req, res) => {
  const { title, content, embedding } = req.body;

  if (!title || !content) {
    throw httpError(400, 'invalid_input', 'title and content are required');
  }

  let finalEmbedding = [];

  if (Array.isArray(embedding) && embedding.length > 0) {
    finalEmbedding = normalizeEmbedding(embedding);
    if (finalEmbedding.length !== 768) {
      throw httpError(400, 'invalid_input', 'embedding must be 768 dimensions, got ' + finalEmbedding.length);
    }
  } else {
    finalEmbedding = await buildEmbedding(content);
  }

  const item = await KnowledgeBase.create({
    title,
    content,
    embedding: finalEmbedding
  });

  res.status(201).json({
    message: 'Knowledge base created',
    data: item
  });
});

const listKnowledgeBases = asyncHandler(async (req, res) => {
  const keywordRegex = buildSearchRegex(req.query.q);
  const filters = {};

  if (keywordRegex) {
    filters.title = keywordRegex;
  }

  const { page, limit, skip } = parsePagination(req.query);

  const [total, data] = await Promise.all([
    KnowledgeBase.countDocuments(filters),
    KnowledgeBase.find(filters)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  res.json({ data, pagination: buildPaginationMeta(total, page, limit) });
});

const getKnowledgeBaseDetail = asyncHandler(async (req, res) => {
  const { knowledgeBaseId } = req.params;
  const item = await KnowledgeBase.findById(knowledgeBaseId).lean();

  if (!item) {
    throw httpError(404, 'knowledge_base_not_found', 'Knowledge base item not found');
  }

  res.json({ data: item });
});

const updateKnowledgeBase = asyncHandler(async (req, res) => {
  const { knowledgeBaseId } = req.params;
  const updates = {};
  const allowed = ['title', 'content', 'embedding'];

  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  if (updates.embedding !== undefined) {
    if (!Array.isArray(updates.embedding)) {
      throw httpError(400, 'invalid_input', 'embedding must be an array of numbers');
    }

    updates.embedding = updates.embedding.map(Number).filter(Number.isFinite);
  }

  const item = await KnowledgeBase.findByIdAndUpdate(knowledgeBaseId, updates, {
    new: true,
    runValidators: true
  }).lean();

  if (!item) {
    throw httpError(404, 'knowledge_base_not_found', 'Knowledge base item not found');
  }

  res.json({
    message: 'Knowledge base updated',
    data: item
  });
});

const deleteKnowledgeBase = asyncHandler(async (req, res) => {
  const { knowledgeBaseId } = req.params;
  const item = await KnowledgeBase.findByIdAndDelete(knowledgeBaseId).lean();

  if (!item) {
    throw httpError(404, 'knowledge_base_not_found', 'Knowledge base item not found');
  }

  res.json({
    message: 'Knowledge base deleted',
    data: item
  });
});

module.exports = {
  createKnowledgeBase,
  listKnowledgeBases,
  getKnowledgeBaseDetail,
  updateKnowledgeBase,
  deleteKnowledgeBase
};