import crypto from "crypto";

/**
 * คำนวณ ETag สำหรับไฟล์ที่อัปโหลดไปยัง S3 โดยใช้ MD5
 * @param {Buffer} buffer - ไฟล์ที่ต้องการคำนวณ
 * @param {number} partSize - ขนาดของแต่ละ part (default: 5MB)
 * @returns {string} - ค่า ETag ที่ตรงกับ AWS S3
 */
export function calculateETag(buffer, partSize = 5 * 1024 * 1024) {
  const totalParts = Math.ceil(buffer.length / partSize);
  const md5Hashes = [];

  for (let i = 0; i < totalParts; i++) {
    const start = i * partSize;
    const end = Math.min(start + partSize, buffer.length);
    const partBuffer = buffer.slice(start, end);

    // คำนวณ MD5 hash ของแต่ละ part
    const md5 = crypto.createHash("md5").update(partBuffer).digest();
    md5Hashes.push(md5);
  }

  if (md5Hashes.length === 1) {
    return `"${md5Hashes[0].toString("hex")}"`;
  }

  // รวม MD5 hashes ของทุก part แล้วคำนวณ MD5 ใหม่
  const finalMd5 = crypto.createHash("md5").update(Buffer.concat(md5Hashes)).digest("hex");

  // สร้าง ETag ตามรูปแบบของ AWS S3
  return `"${finalMd5}-${totalParts}"`;
}
