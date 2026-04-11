# SV Gym Backend

Backend hệ thống quản lý phòng gym với 3 role `member`, `staff`, `admin`.

Các tính năng chính:
- Auth JWT (register/login/refresh).
- Mua gói tập qua staff hoặc VNPay.
- Quy tắc một member chỉ có một gói active tại cùng thời điểm, gói mua thêm sẽ ở trạng thái pending.
- Member tự kích hoạt gói pending khi gói active hiện tại kết thúc.
- Check-in bằng QR động chống replay.
- Dashboard admin theo hóa đơn `Invoice` và lọc theo thời gian.
- Scheduler nền để tự chuyển subscription active đã hết hạn sang expired và cập nhật remainingDaysCache.

## Tech Stack

- Node.js + Express.js
- MongoDB + Mongoose
- JWT (`jsonwebtoken`)
- bcryptjs
- VNPay SDK (`vnpay`)

## Cấu Trúc Dự Án

```text
smart-gym/
├── server.js
├── src/
│   ├── app.js
│   ├── config/
│   │   ├── database.js
│   │   └── env.js
│   ├── constants/
│   │   └── enums.js
│   ├── controllers/
│   │   ├── admin.controller.js
│   │   ├── member.controller.js
│   │   ├── payment.controller.js
│   │   ├── public.controller.js
│   │   └── staff.controller.js
│   ├── middleware/
│   │   ├── authenticate.js
│   │   ├── authorize.js
│   │   ├── errorHandler.js
│   │   └── rateLimiter.js
│   ├── models/
│   │   ├── CheckIn.js
│   │   ├── Invoice.js
│   │   ├── Order.js
│   │   ├── Package.js
│   │   ├── QrJtiUsage.js
│   │   ├── Subscription.js
│   │   └── User.js
│   ├── routes/
│   │   ├── admin.routes.js
│   │   ├── index.js
│   │   ├── member.routes.js
│   │   ├── payment.routes.js
│   │   ├── public.routes.js
│   │   └── staff.routes.js
│   ├── services/
│   │   ├── qr.service.js
│   │   ├── subscriptionLifecycle.service.js
│   │   ├── token.service.js
│   │   └── vnpay.service.js
│   └── utils/
│       ├── asyncHandler.js
│       ├── date.js
│       └── httpError.js
└── uploads/
    └── receipts/
```

## Mô Hình Dữ Liệu Chính

### User
- `role`: `member | staff | admin`
- `status`: `active | inactive | blocked`

### Order
- Trạng thái nghiệp vụ staff: `pending | approved | rejected | expired`
- Trạng thái thanh toán: `pending | success | failed`

### Invoice
- Được dùng làm nguồn dữ liệu doanh thu dashboard.
- Các bản ghi doanh thu hợp lệ dùng `status = paid`, thời điểm lấy theo `paidAt`.

### Subscription
- `status`: `pending | active | expired | cancelled`
- Nếu member còn gói active, gói mới tạo `pending`, `startDate = endDate` của gói active.

### CheckIn + QrJtiUsage
- CheckIn lưu lịch sử scan thành công/thất bại.
- QrJtiUsage chống replay token QR bằng `jti` unique + TTL index.

## API Chính

### Public
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/packages`

### Member
- `POST /api/member/orders`
- `GET /api/member/profile`
- `PATCH /api/member/profile`
- `PATCH /api/member/password`
- `GET /api/member/subscription/status` (trả activeSubscription + danh sách subscriptions)
- `POST /api/member/subscriptions/:subscriptionId/activate` (member tự kích hoạt pending)
- `GET /api/member/qr-generate`
- `GET /api/member/checkins`
- `POST /api/payments/vnpay/create`

### Staff/Admin
- `POST /api/staff/checkin/qr`
- `POST /api/staff/checkin/manual`
- `GET /api/staff/orders/pending`
- `POST /api/staff/orders/:orderId/approve`
- `POST /api/staff/orders/:orderId/reject`
- `POST /api/staff/orders/counter-sale`
- `GET /api/staff/members`

### Admin
- `GET /api/admin/staff`
- `POST /api/admin/staff`
- `PATCH /api/admin/staff/:staffId`
- `DELETE /api/admin/staff/:staffId`
- `POST /api/admin/packages`
- `GET /api/admin/packages`
- `PATCH /api/admin/packages/:packageId`
- `DELETE /api/admin/packages/:packageId`
- `GET /api/admin/orders`
- `GET /api/admin/members`
- `GET /api/admin/dashboard/revenue`
- `GET /api/admin/dashboard/checkins`

## Lọc Dashboard Revenue

`GET /api/admin/dashboard/revenue`

Hỗ trợ các bộ lọc:
- Hôm nay: `period=today` hoặc `period=day`
- 7 ngày gần nhất: `period=last7days` hoặc `period=week`
- Tháng này: `period=thisMonth` hoặc `period=month`
- Năm này: `period=thisYear` hoặc `period=year`
- Tùy chỉnh: `from=YYYY-MM-DD&to=YYYY-MM-DD`

Response có:
- `totalRevenue`, `totalInvoices`
- `trend`: dữ liệu chuỗi thời gian theo `paidAt`
- `granularity`: `hour | day | week4 | month`

Ghi chú hiện tại:
- Với `thisMonth`, dữ liệu được gom thành 4 bucket tuần: `W1..W4`.

## Subscription Lifecycle Scheduler

`server.js` khởi động scheduler:
- Chu kỳ chạy: `SUBSCRIPTION_LIFECYCLE_INTERVAL_MS` (mặc định `60000` ms).
- Tự chuyển `active -> expired` khi `endDate < now`.
- Cập nhật `remainingDaysCache` cho gói active.

## Biến Môi Trường

- `NODE_ENV`
- `PORT`
- `MONGO_URI`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_QR_SECRET`
- `JWT_ACCESS_EXPIRES`
- `JWT_REFRESH_EXPIRES`
- `QR_EXPIRES_SECONDS`
- `CHECKIN_COOLDOWN_MINUTES`
- `SUBSCRIPTION_LIFECYCLE_INTERVAL_MS`
- `VNP_TMNCODE`
- `VNP_HASH_SECRET`
- `VNP_URL`
- `VNP_RETURN_URL`
- `VNP_IPN_URL`
- `CLIENT_URL`

## Chạy Local

1. Cài package:

```bash
npm install
```

2. Tạo `.env` từ `.env.example`.

3. Chạy dev:

```bash
npm run dev
```

4. Kiểm tra health:

```http
GET /health
```
