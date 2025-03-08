import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";
import { calculateETag } from "./calculateETag.js";

dotenv.config();
const AWS_BUCKET = process.env.BUCKET_NAME;

export const s3 = new S3Client({
  region: process.env.REGION,
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.ACCESS_KEY,
    secretAccessKey: process.env.SECRET_KEY,
  },
  forcePathStyle: true,
  disableHostPrefix: true,
});

// Upload files using Multipart Upload
export const uploadToS3 = async (files) => {
  let result = {
    success: [],
    error: [],
  };

  const uploadPromises = files.map((file) =>
    handleMultipartUpload(file, result)
  );

  await Promise.all(uploadPromises);

  return result;
};

const createMultiPartUpload = async (key) => {
  const multipartUpload = await s3.send(
    new CreateMultipartUploadCommand({
      Bucket: AWS_BUCKET,
      Key: key,
      ChecksumAlgorithm: "SHA256",
    })
  );
  return multipartUpload;
};

const uploadPartS3 = async (key, uploadId, filePart, iteration) => {
  try {
    const hash = crypto.createHash("sha256").update(filePart).digest("base64");
    const res = await s3.send(
      new UploadPartCommand({
        Bucket: AWS_BUCKET,
        Key: key,
        UploadId: uploadId,
        Body: filePart,
        PartNumber: iteration + 1,
        ChecksumSHA256: hash, // ✅ เพิ่มค่า SHA256 checksum
        ChecksumAlgorithm: "SHA256",
      })
    );

    return { PartNumber: iteration + 1, ETag: res.ETag, ChecksumSHA256: hash };
  } catch (error) {
    console.error(`Part ${iteration + 1} failed: ${error.message}`);
    throw new Error(`Part ${iteration + 1} failed: ${error.message}`);
  }
};

const abortMultiPartUpload = async (key, uploadId) => {
  try {
    const abortCommand = new AbortMultipartUploadCommand({
      Bucket: AWS_BUCKET,
      Key: key,
      UploadId: uploadId,
    });
    await s3.send(abortCommand);
  } catch (error) {
    console.error(`Failed to abort upload for ${key}:`, error);
  }
};

const handleMultipartUpload = async (file, result) => {
  const key = generateFileName(file);
  const fileBuffer = file.buffer;
  const partSize = 5 * 1024 * 1024; // 10MB per part
  const totalParts = Math.ceil(fileBuffer.length / partSize);
  let uploadId = "";
  let partETags = [];
  const etag = await calculateETag(fileBuffer);

  try {
    const multipartUpload = await createMultiPartUpload(key);
    uploadId = multipartUpload.UploadId;
    console.log(`📂 Starting upload: ${key} (${totalParts} parts)`);

    const uploadPromises = [];
    let uploadedParts = 0; // Track the number of uploaded parts

    for (let i = 0; i < totalParts; i++) {
      const start = i * partSize;
      const end = Math.min(start + partSize, fileBuffer.length);
      const partBuffer = fileBuffer.slice(start, end);

      uploadPromises.push(
        uploadPartS3(key, uploadId, partBuffer, i).then((res) => {
          uploadedParts++;
          const progress = ((uploadedParts / totalParts) * 100).toFixed(2);
          console.log(`✅ Part ${i + 1}/${totalParts} uploaded (${progress}%)`);
          return res;
        })
      );
    }

    const uploadResults = await Promise.allSettled(uploadPromises);
    uploadResults.forEach((result, i) => {
      if (result.status === "fulfilled") {
        partETags.push({
          PartNumber: i + 1,
          ETag: result.value.ETag,
          ChecksumSHA256: result.value.ChecksumSHA256,
        });
      } else {
        console.error(
          `❌ Part ${i + 1} upload failed: ${result.reason.message}`
        );
      }
    });

    if (partETags.length === totalParts) {
      console.log(`🔄 Merging all parts...`);
      const res = await completeMultiPartUpload(key, uploadId, partETags);
      console.log("🔍 Verifying ETag:", res.ETag, etag);

      if (res.ETag !== etag) {
        await deleteFile(res.Key);
        await abortMultiPartUpload(key, uploadId);
        return result.error.push({
          fileName: key,
          error: "ETag mismatch",
        });
      }

      console.log(`🎉 Upload completed: ${key}`);
      result.success.push({ fileName: key, message: "Upload completed" });
    } else {
      await abortMultiPartUpload(key, uploadId);
      result.error.push({
        fileName: key,
        error: "Upload failed for some parts",
      });
    }
  } catch (error) {
    console.error("❌ Upload failed:", error);
    if (uploadId) {
      await abortMultiPartUpload(key, uploadId);
    }
    result.error.push({ fileName: key, error: error.message });
  }
};

const completeMultiPartUpload = async (key, uploadId, parts) => {
  const res = await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: AWS_BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts,
      },
    })
  );
  return res;
};

const deleteFile = async (fileKey) => {
  try {
    const result = await s3.send(
      new DeleteObjectCommand({
        Bucket: process.env.BUCKET_NAME, // ✅ ชื่อ Bucket
        Key: fileKey, // ✅ ชื่อไฟล์ที่ต้องการลบ
      })
    );
    console.log("File deleted successfully:", fileKey);
    return result;
  } catch (error) {
    console.error("Error deleting file:", error);
    throw error;
  }
};

const generateFileName = (file) => {
  return (
    path.basename(file.originalname, path.extname(file.originalname)) +
    "_" +
    crypto.randomBytes(8).toString("hex") +
    path.extname(file.originalname)
  );
};
