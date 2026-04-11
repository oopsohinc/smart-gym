const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { USER_STATUS, SUBSCRIPTION_STATUS, CHECKIN_METHOD, CHECKIN_STATUS } = require('../constants/enums');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const CheckIn = require('../models/CheckIn');
const QrJtiUsage = require('../models/QrJtiUsage');
const { httpError } = require('../utils/httpError');

function buildQrTokenPayload(memberId, subscriptionId, jti) {
  return {
    sub: String(memberId),
    sid: String(subscriptionId),
    jti,
    typ: 'checkin_qr'
  };
}

async function generateDynamicQrToken(memberId) {
  const now = new Date();

  const activeSubscription = await Subscription.findOne({
    memberId,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    endDate: { $gte: now }
  })
    .sort({ endDate: -1 })
    .select('_id endDate')
    .lean();

  if (!activeSubscription) {
    throw httpError(403, 'no_active_subscription', 'No active subscription available for QR check-in');
  }

  const jti = crypto.randomUUID();
  const payload = buildQrTokenPayload(memberId, activeSubscription._id, jti);

  const token = jwt.sign(payload, env.JWT_QR_SECRET, {
    expiresIn: env.QR_EXPIRES_SECONDS,
    issuer: 'sv-gym',
    audience: 'sv-gym-scanner'
  });

  return {
    token,
    ttlSeconds: env.QR_EXPIRES_SECONDS,
    expiresAt: new Date(now.getTime() + env.QR_EXPIRES_SECONDS * 1000),
    jti
  };
}

async function createFailedCheckIn({ memberId, staffId, reason, jti, deviceId }) {
  if (!memberId) {
    return;
  }

  await CheckIn.create({
    memberId,
    staffId,
    method: CHECKIN_METHOD.QR_DYNAMIC,
    status: CHECKIN_STATUS.FAILED,
    failReason: reason,
    qrJti: jti,
    deviceId
  });
}

async function verifyAndProcessQrScan({ qrToken, staffId, deviceId }) {
  const startedAt = Date.now();
  let payload;

  try {
    payload = jwt.verify(qrToken, env.JWT_QR_SECRET, {
      issuer: 'sv-gym',
      audience: 'sv-gym-scanner'
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw httpError(400, 'qr_expired', 'QR token has expired');
    }
    throw httpError(401, 'invalid_signature', 'QR token is invalid');
  }

  if (payload.typ !== 'checkin_qr') {
    throw httpError(401, 'invalid_signature', 'QR token type is invalid');
  }

  const member = await User.findById(payload.sub).select('_id fullName status').lean();
  if (!member || member.status !== USER_STATUS.ACTIVE) {
    await createFailedCheckIn({
      memberId: payload.sub,
      staffId,
      reason: 'member_blocked',
      jti: payload.jti,
      deviceId
    });
    throw httpError(403, 'member_blocked', 'Member account is inactive or blocked');
  }

  try {
    await QrJtiUsage.create({
      jti: payload.jti,
      memberId: payload.sub,
      issuedAt: new Date(payload.iat * 1000),
      expiresAt: new Date(payload.exp * 1000),
      usedAt: new Date(),
      scannerStaffId: staffId
    });
  } catch (error) {
    if (error.code === 11000) {
      await createFailedCheckIn({
        memberId: payload.sub,
        staffId,
        reason: 'qr_replayed',
        jti: payload.jti,
        deviceId
      });
      throw httpError(409, 'qr_replayed', 'QR token was already used');
    }
    throw error;
  }

  const now = new Date();
  let activeSubscription = await Subscription.findOne({
    _id: payload.sid,
    memberId: payload.sub,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    endDate: { $gte: now }
  })
    .select('_id endDate')
    .lean();

  if (!activeSubscription) {
    activeSubscription = await Subscription.findOne({
      memberId: payload.sub,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      endDate: { $gte: now }
    })
      .sort({ endDate: -1 })
      .select('_id endDate')
      .lean();
  }

  if (!activeSubscription) {
    await createFailedCheckIn({
      memberId: payload.sub,
      staffId,
      reason: 'no_active_subscription',
      jti: payload.jti,
      deviceId
    });
    throw httpError(403, 'no_active_subscription', 'Member has no active subscription');
  }

  const cooldownStart = new Date(now.getTime() - env.CHECKIN_COOLDOWN_MINUTES * 60 * 1000);
  const recentSuccess = await CheckIn.findOne({
    memberId: payload.sub,
    status: CHECKIN_STATUS.SUCCESS,
    checkInAt: { $gte: cooldownStart }
  })
    .sort({ checkInAt: -1 })
    .select('_id checkInAt')
    .lean();

  if (recentSuccess) {
    await createFailedCheckIn({
      memberId: payload.sub,
      staffId,
      reason: 'cooldown_violation',
      jti: payload.jti,
      deviceId
    });
    throw httpError(409, 'cooldown_violation', 'Member has checked in recently');
  }

  const checkIn = await CheckIn.create({
    memberId: payload.sub,
    staffId,
    method: CHECKIN_METHOD.QR_DYNAMIC,
    status: CHECKIN_STATUS.SUCCESS,
    qrJti: payload.jti,
    deviceId,
    checkInAt: now
  });

  return {
    checkInId: checkIn._id,
    memberId: payload.sub,
    memberName: member.fullName,
    checkedInAt: checkIn.checkInAt,
    processedMs: Date.now() - startedAt
  };
}

module.exports = { generateDynamicQrToken, verifyAndProcessQrScan };
