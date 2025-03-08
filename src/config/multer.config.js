import multer from "multer";

// ตั้งค่า multer สำหรับการอัปโหลดไฟล์หลายไฟล์พร้อมกัน
const storage = multer.memoryStorage(); // ใช้ memoryStorage เพื่อให้ไฟล์เก็บใน memory ก่อนส่งไป S3
export const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 * 1024 }, // จำกัดขนาดไฟล์สูงสุด 20GB
}).array("files"); // 'files' คือชื่อ field ใน form data ที่ใช้สำหรับการอัปโหลดหลายไฟล์
