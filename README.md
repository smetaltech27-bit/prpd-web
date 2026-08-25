# PRPD — Purchase Request & Production Document

ระบบ Purchase Request และเอกสารการผลิตของ S Metal Tech รุ่นใหม่ สร้างด้วย React + Vite + TypeScript และออกแบบสำหรับ Supabase Database/Auth/Storage โดยรักษา Flow หลักจาก Google Apps Script เดิม

## ฟังก์ชันหลัก

- Raw Material PR และ Factory Supply / Equipment PR
- แยกหนึ่ง PR ต่อ Vendor และเตรียมเลข `PR-YYMM-NNNN`
- พิมพ์ A4 Landscape สูงสุด 12 รายการต่อหน้า
- แสดง Requester / Checked / Approved เฉพาะหน้าสุดท้าย
- Work Order, Drawing, Inprocess Check Sheet และ QC Check Sheet
- PR History แยก Raw Material และ Equipment
- Settings สำหรับ Master Data และ Document Files
- Settings แสดงในเมนูแต่ต้องปลดล็อกผ่าน Supabase Auth; ไม่มี Password ใน Source Code
- Responsive UI โทนน้ำเงินสว่าง พร้อม Modal ที่รองรับ iOS Safe Area

## เริ่มใช้งาน Local

```bash
npm install
copy .env.example .env.local
npm run dev
```

กรอกค่าต่อไปนี้ใน `.env.local`:

```text
VITE_SUPABASE_URL=https://gqculqpufpjvwofzzwks.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_SETTINGS_ADMIN_EMAIL=...
```

Publishable key สามารถใช้ใน Browser ได้เมื่อเปิด RLS ครบ แต่ห้ามใส่ Secret/Service Role key ในตัวแปร `VITE_*` หรือ GitHub Pages

## ตรวจคุณภาพ

```bash
npm run check
npm run verify:legacy
```

ชุดทดสอบครอบคลุมขอบเขต 0/1/11/12/13/23/24/25 รายการ การแยก Vendor การจัดเลข Preview และการค้นเอกสาร

## Supabase

SQL อยู่ใน `supabase/migrations/` และต้องรันตามลำดับไฟล์ ห้าม Apply Production ก่อนตรวจบน Staging และ Backup ข้อมูลเดิม

รายละเอียด Mapping, Auth/RLS, Storage และการนำเข้าข้อมูลอยู่ที่ [`docs/data-migration.md`](docs/data-migration.md)

ข้อมูลจาก Excel และ Manifest ที่สร้างใน `supabase/seed/generated/` ถูก Ignore เพราะมีชื่อ Vendor ราคา ประวัติการซื้อ และ Local file paths ห้าม Commit ไป Public repository

## GitHub Pages

Workflow อยู่ที่ `.github/workflows/deploy-pages.yml` และอ่านค่าการเชื่อมต่อผ่าน GitHub Actions Variables เท่านั้น Frontend ใช้ Hash Router เพื่อรองรับการ Refresh บน GitHub Pages

ก่อนเปิด Production ต้องเปิด Anonymous Sign-in หรือกำหนด Employee Login ตามนโยบายองค์กร, Apply RLS, สร้าง Settings Admin และตรวจเอกสาร 154 Item FG ที่ไม่พบใน Raw Material master
