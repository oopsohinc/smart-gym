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
  EXPIRED: 'expired'
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

module.exports = {
  USER_ROLES,
  USER_STATUS,
  ORDER_STATUS,
  SUBSCRIPTION_STATUS,
  CHECKIN_METHOD,
  CHECKIN_STATUS
};
