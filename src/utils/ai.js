const { GoogleGenAI } = require('@google/genai');
const { httpError } = require('./httpError');

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error('GEMINI_API_KEY is required for AI features');
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

function stripCodeFences(text) {
  return String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
}

function extractJsonText(text) {
  const cleaned = stripCodeFences(text);
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return cleaned;
  }

  return cleaned.slice(firstBrace, lastBrace + 1);
}

function parseJsonResponse(text, fallbackMessage) {
  const jsonText = extractJsonText(text);

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw httpError(500, 'ai_response_invalid', fallbackMessage || 'AI response was not valid JSON');
  }
}

async function generateJsonContent({ model, prompt, systemInstruction }) {
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      ...(systemInstruction ? { systemInstruction } : {})
    }
  });

  return parseJsonResponse(extractText(response), 'AI response was not valid JSON');
}

module.exports = {
  ai,
  extractText,
  parseJsonResponse,
  generateJsonContent
};