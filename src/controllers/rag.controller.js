const { GoogleGenAI } = require('@google/genai');
const { asyncHandler } = require('../utils/asyncHandler');
const { httpError } = require('../utils/httpError');
const KnowledgeBase = require('../models/KnowledgeBase');

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error('GEMINI_API_KEY is required for RAG features');
}

const ai = new GoogleGenAI({ apiKey });

function extractText(response) {
  if (typeof response?.text === 'function') {
    return response.text();
  }

  if (typeof response?.text === 'string') {
    return response.text;
  }

  const parts = response?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((part) => part?.text)
    .filter(Boolean)
    .join('');
}

function normalizeEmbedding(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.map(Number).filter(Number.isFinite);
}

async function buildEmbedding(text) {
  const response = await ai.models.embedContent({
    model: 'gemini-embedding-2',
    contents: String(text || ''),
    config: {
      outputDimensionality: 768
    }
  });

  const embeddingValues =
    response?.embedding?.values ||
    response?.embeddings?.[0]?.values ||
    response?.data?.[0]?.embedding?.values ||
    response?.data?.[0]?.embeddings?.[0]?.values ||
    null;

  const embedding = normalizeEmbedding(embeddingValues);

  if (embedding.length !== 768) {
    throw httpError(500, 'embedding_error', 'Failed to generate a 768-dimension embedding');
  }

  return embedding;
}

const addKnowledge = asyncHandler(async (req, res) => {
  const { title, content } = req.body;

  if (!title || !content) {
    throw httpError(400, 'invalid_input', 'title and content are required');
  }

  const embedding = await buildEmbedding(content);
  const item = await KnowledgeBase.create({
    title,
    content,
    embedding
  });

  res.status(201).json({
    message: 'Knowledge added',
    data: item
  });
});

const askAssistant = asyncHandler(async (req, res) => {
  const { question } = req.body;

  if (!question) {
    throw httpError(400, 'invalid_input', 'question is required');
  }

  const queryVector = await buildEmbedding(question);

  const matches = await KnowledgeBase.aggregate([
    {
      $vectorSearch: {
        index: 'vector_index',
        path: 'embedding',
        queryVector,
        limit: 3,
        exact: true
      }
    },
    {
      $project: {
        _id: 1,
        title: 1,
        content: 1,
        score: { $meta: 'vectorSearchScore' }
      }
    }
  ]);

  const context = matches
    .map((item, index) => `Context ${index + 1}: ${item.content}`)
    .join('\n\n');

  const systemPrompt = `You are an AI Assistant for a Gym. Answer the user's question based strictly on this context: ${context || 'No context available.'} If the answer is not in the context, say you don't know.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: question,
    config: {
      systemInstruction: systemPrompt
    }
  });

  const text = extractText(response);

  res.json({
    message: 'Assistant response generated',
    data: {
      answer: text,
      contextCount: matches.length
    }
  });
});

module.exports = {
  addKnowledge,
  askAssistant
};