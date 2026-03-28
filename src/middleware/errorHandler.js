function notFound(req, res) {
  res.status(404).json({ message: 'Endpoint not found' });
}

function errorHandler(error, req, res, next) {
  const status = error.statusCode || 500;
  const payload = {
    message: error.message || 'Internal server error'
  };

  if (error.code) {
    payload.code = error.code;
  }

  if (process.env.NODE_ENV !== 'production' && error.details) {
    payload.details = error.details;
  }

  res.status(status).json(payload);
}

module.exports = { notFound, errorHandler };
