// Permission Catalog - flat structure, no inheritance
// Format: resource.action or resource.action.target
// Supports wildcard: 'admin.*' matches 'admin.users.view', 'admin.orders.view', etc.

const PERMISSIONS = {
  MEMBER: {
    PROFILE_VIEW: 'member.profile.view',
    PROFILE_EDIT: 'member.profile.edit',
    SUBSCRIPTION_VIEW: 'member.subscription.view',
    SUBSCRIPTION_ACTIVATE: 'member.subscription.activate',
    PAYMENT_CREATE: 'member.payment.create',
    CHECKIN_VIEW: 'member.checkin.view',
    QR_GENERATE: 'member.qr.generate'
  },
  STAFF: {
    CHECKIN_SCAN: 'staff.checkin.scan',
    CHECKIN_MANUAL: 'staff.checkin.manual',
    ORDERS_VIEW: 'staff.orders.view',
    ORDERS_APPROVE: 'staff.orders.approve',
    ORDERS_REJECT: 'staff.orders.reject',
    MEMBERS_VIEW: 'staff.members.view',
    COUNTER_SALE: 'staff.counter.sale'
  },
  ADMIN: {
    USERS_VIEW: 'admin.users.view',
    USERS_CREATE: 'admin.users.create',
    USERS_EDIT: 'admin.users.edit',
    USERS_DELETE: 'admin.users.delete',
    STAFF_MANAGE: 'admin.staff.manage',
    PACKAGES_VIEW: 'admin.packages.view',
    PACKAGES_CREATE: 'admin.packages.create',
    PACKAGES_EDIT: 'admin.packages.edit',
    PACKAGES_DELETE: 'admin.packages.delete',
    ORDERS_VIEW: 'admin.orders.view',
    INVOICES_VIEW: 'admin.invoices.view',
    MEMBERS_VIEW: 'admin.members.view',
    KNOWLEDGE_BASE_MANAGE: 'admin.knowledge.manage',
    DASHBOARD_VIEW: 'admin.dashboard.view',
    ROLES_MANAGE: 'admin.roles.manage'
  }
};

// Flatten all permissions into a single array for validation
const ALL_PERMISSIONS = Object.values(PERMISSIONS).reduce((acc, category) => {
  return acc.concat(Object.values(category));
}, []);

module.exports = {
  PERMISSIONS,
  ALL_PERMISSIONS
};
