const USER_ROLES = {
  MEMBER: 'member',
  STAFF: 'staff',
  ADMIN: 'admin'
};

const USER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  BLOCKED: 'blocked'
};

const ORDER_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  VOIDED: 'voided'
};

const SUBSCRIPTION_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled'
};

const CHECKIN_METHOD = {
  QR_DYNAMIC: 'qr_dynamic',
  MANUAL: 'manual'
};

const CHECKIN_STATUS = {
  SUCCESS: 'success',
  FAILED: 'failed'
};

const FITNESS_GOALS = {
  WEIGHT_LOSS: 'weight_loss',
  MUSCLE_GAIN: 'muscle_gain',
  MAINTENANCE: 'maintenance'
};

const FITNESS_LEVELS = {
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced'
};

module.exports = {
  USER_ROLES,
  USER_STATUS,
  ORDER_STATUS,
  SUBSCRIPTION_STATUS,
  CHECKIN_METHOD,
  CHECKIN_STATUS,
  FITNESS_GOALS,
  FITNESS_LEVELS
};
