import express from "express";

import dotenv from "dotenv";

import { upload } from "./config/multer.config.js";
import { AWS_BUCKET, s3, uploadToS3 } from "./utils/upload.js";
import { GetObjectCommand, ListBucketsCommand } from "@aws-sdk/client-s3";

dotenv.config();

export const app = express();
const port = 3000;

app.use(express.json({ limit: "25gb" }));
app.use((req, res, next) => {
  req.setTimeout(300000); // 5 นาที
  next();
});

app.post("/upload", upload, async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded." });
    }
    const uploadResponse = await uploadToS3(req.files);
    if (uploadResponse.success) {
      res
        .status(200)
        .json({ message: "Files uploaded successfully.", uploadResponse });
    } else {
      res.status(500).json({
        message: "Error during file upload.",
        error: uploadResponse.error,
      });
    }
  } catch (err) {
    console.error("Error during file upload:", err);
    res.status(500).json({ message: "Error during file upload." });
  }
});

// API สำหรับดาวน์โหลดไฟล์จาก S3 แบบ stream
app.get("/download/:fileName", async (req, res) => {
  const { fileName } = req.params;

  const getObjectCommand = new GetObjectCommand({
    Bucket: AWS_BUCKET,
    Key: fileName,
  });

  try {
    const data = await s3.send(getObjectCommand);
    console.log("data", data);
    // กำหนด headers สำหรับการดาวน์โหลดไฟล์
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
    res.setHeader("Content-Type", data.ContentType);

    // ส่ง stream ไปยัง client
    const stream = data.Body;
    stream.pipe(res); // ส่งไฟล์ทีละส่วน (chunk by chunk)

    stream.on("end", () => {
      console.log(`Download complete for ${fileName}`);
    });

    stream.on("error", (err) => {
      console.error("Error streaming file:", err);
      res.status(500).send("Error streaming file");
    });
  } catch (err) {
    console.error("Error downloading file:", err);
    res.status(500).send("Error downloading file");
  }
});

async function testConnection() {
  try {
    const command = new ListBucketsCommand({});
    const data = await s3.send(command);
    console.log("Successfully connected to Wasabi. Buckets:", data.Buckets);
  } catch (err) {
    console.error("Error connecting to Wasabi:", err);
  }
}
testConnection();

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
