# ใบส่งต่องาน: ตัวกรองช่วงวันที่ใน PR History

- วันที่: 24 พฤศจิกายน 2026 (เวลาไทย)
- โปรเจกต์: PRPD — Purchase Request and Production Document
- Feature commit: `70330a0` (`feat: filter PR history by date range`)
- Production: <https://smetaltech27-bit.github.io/prpd-web/#/pr-history>
- GitHub Actions: <https://github.com/smetaltech27-bit/prpd-web/actions/runs/45346283247>

## เป้าหมายและผลลัพธ์

หน้า PR History เดิมกรองได้เพียงวันที่เดียว พี่ต้นขอให้กรองตามช่วง เช่น 1 สิงหาคม–30 พฤศจิกายน 2026 ตอนนี้หน้าเว็บมีช่อง **จากวันที่** และ **ถึงวันที่** สำหรับทั้ง Raw Material และวัสดุอุปกรณ์แล้ว พี่ต้นตรวจ Production และยืนยันว่าใช้งานได้

- ช่วงวันที่รวมวันเริ่มและวันสิ้นสุด (`>=` / `<=`) และเปิดปลายช่วงด้านใดด้านหนึ่งได้
- หากวันเริ่มหลังวันสิ้นสุด UI แจ้งให้แก้และไม่ส่งคำค้น
- ปุ่มล้างตัวกรองล้างวันที่ทั้งสองช่อง; Export Excel ยังส่งออกแถวผลการค้นหาที่แสดง
- จอใหญ่แสดงช่องวันที่ในแถบค้นหาเดิม; จอแคบจัดเป็น 3 คอลัมน์หรือ 1 คอลัมน์ตาม breakpoint เดิมของหน้า
- ไม่มี Package ใหม่ ไม่มีการเปลี่ยนตารางข้อมูล, Auth policy หรือ Workflow ของ PR

## ไฟล์และ Data flow

| ไฟล์ | การเปลี่ยนแปลง |
| --- | --- |
| `src/pages/HistoryPage.tsx` | เก็บ `dateFrom`/`dateTo`, ตรวจลำดับวัน และส่งตัวกรองไป Service |
| `src/services/prpdRepository.ts` | เรียก RPC `search_pr_history_range` พร้อม `p_date_from`/`p_date_to` |
| `src/styles/index.css` | ปรับ Grid ของตัวกรองและ Focus state |
| `src/pages/HistoryPage.ui.test.tsx` | ทดสอบช่วงวันที่, ปลายช่วงว่าง, วันที่สลับกัน และปุ่มล้าง |
| `supabase/migrations/202611240001_search_pr_history_range.sql` | เพิ่ม RPC ใหม่โดยคง `search_pr_history` เดิมไว้ |
| `scripts/check-supabase-migrations.mjs` | เพิ่มชื่อ migration ใหม่ในรายการตรวจ |

RPC ใหม่ใช้ `security invoker` และเงื่อนไขเดิมเรื่องประเภท PR, `status = 'submitted'`, ตัวกรองข้อความ, การเรียงลำดับ และเพดาน `limit 5000` สิทธิ์ `EXECUTE` ให้ `authenticated` กับ `service_role` และถอนจาก `public`/`anon` การค้นหาจึงทำที่ฐานข้อมูลก่อนส่งผลมา UI

## การตรวจและการเผยแพร่

1. ทดสอบ Frontend ด้วย `vitest run --configLoader runner`: ผ่าน 65/65 tests ใน 15 ไฟล์; Worker tests ผ่าน 6/6
2. TypeScript ผ่านทั้ง `tsconfig.app.json` และ `tsconfig.node.json`; Vite Production Build ผ่านโดยใช้ `--configLoader runner` และ OutDir ชั่วคราว เพราะ Sandbox ของเครื่องนี้เขียนไฟล์ชั่วคราวใน `node_modules` และล้าง `dist` เดิมไม่ได้
3. Migration static checks ผ่าน 13 ไฟล์ และ `git diff --check` ผ่าน
4. Apply SQL ผ่าน Supabase Production SQL Editor **ก่อน** Push Frontend; ตรวจว่า RPC ใหม่มีอยู่, `anon_can_execute = false`, `authenticated_can_execute = true`
5. ตรวจวัน 23 พฤศจิกายน 2026: RPC เดิมและ RPC ใหม่แบบวันเดียวคืน 52 บรรทัดเท่ากัน; ช่วง 1 สิงหาคม–30 พฤศจิกายน 2026 คืน 287 บรรทัด
6. Push `70330a0` ไป `main`; GitHub Actions run `45346283247` แสดง Build และ Deploy สำเร็จ; พี่ต้นยืนยันหลัง Deploy ว่าใช้งานได้

## ข้อจำกัดและสิ่งที่คนรับช่วงต่อควรรู้

- Migration ถูก Run ด้วย SQL Editor แบบ manual จึงอาจไม่มีรายการนี้ใน `supabase_migrations.schema_migrations` ของโปรเจกต์ การ Apply ไฟล์เดิมภายหลังใช้ `create or replace function` และ `revoke`/`grant` จึงควรตรวจสถานะ migration ก่อนสั่ง `supabase db push`
- รอบนี้ไม่ได้ใช้ Staging หรือทำ Backup ก่อน Apply ตามแนวทางใน `docs/project-handoff.md`; SQL ที่ใช้เพิ่ม Function ใหม่เท่านั้นและไม่ได้แก้ข้อมูลเดิม ต้องรักษาขั้นตอน Staging/Backup สำหรับ migration ครั้งต่อไป
- Codex ไม่ได้ตรวจ UI บน Production ด้วย Browser หลัง Deploy เพราะเครื่องมือ Computer Use หยุดเมื่อระบุ URL ของ Chrome ไม่ได้อย่างมั่นใจ; การยืนยันว่าใช้งานได้มาจากพี่ต้น
- ยังไม่ได้ทดสอบ iPhone Safari/Chrome บนอุปกรณ์จริง; ไม่มี Modal ที่แก้ในงานนี้
- หากแก้ RPC นี้ต่อ ให้รักษาสิทธิ์ `security invoker` และ `EXECUTE` ตามเดิม ตรวจผลที่วันต้น/วันท้าย รวมทั้งเพดาน 5,000 บรรทัด และ Deploy Database ก่อน Frontend
